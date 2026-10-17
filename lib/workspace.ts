import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db';
import { preferences, workspaces } from '../db/schema';
import { createDemoWorkspace, createLiveWorkspace } from './demo';
import { buildReport } from './research';
import { buildChatReport, chatReportSchema } from './chat-report';
import { aiConfig } from './ai-config';
import { runAIResearch } from './ai-research';
import { aiDue } from './opportunities';
import { paperBuy, paperClose } from './paper';
import { fetchMarkets, mergeSnapshot } from './markets';
import { bookFresh, fetchBookSnapshot } from './clob.ts';
import type { Mode, Workspace, Market } from './types';

const id = z.string().min(1).max(250);
const actionSchema = z.discriminatedUnion('type', [
  z.object({type:z.literal('toggle_watch'), id}),
  z.object({type:z.literal('add_market'), slug:z.string().min(1).max(500)}),
  z.object({type:z.literal('add_evidence'), marketId:id, title:z.string().trim().min(1).max(200), url:z.string().url().max(2000).refine(v => v.startsWith('https://'), '证据链接必须使用 HTTPS。'), claim:z.string().trim().min(1).max(4000), stance:z.enum(['yes','no','neutral']), publishedAt:z.string().max(50).optional()}),
  z.object({type:z.literal('analyze'), id}),
  z.object({type:z.literal('save_chat_report'), report:chatReportSchema}),
  z.object({type:z.literal('ai_analyze'), id:id.optional(),automatic:z.boolean().optional()}),
  z.object({type:z.literal('ai_settings'),enabled:z.boolean()}),
  z.object({type:z.literal('refresh')}),
  z.object({type:z.literal('refresh_books')}),
  z.object({type:z.literal('mark_read'), id}),
  z.object({type:z.literal('settings'), thresholdPp:z.number().min(0.1).max(100),pollSeconds:z.number().int().min(30).max(86400)}),
  z.object({type:z.literal('set_mode'), mode:z.enum(['demo','live'])}),
  z.object({type:z.literal('reset_demo')}),
  z.object({type:z.literal('paper_buy'), marketId:id,side:z.enum(['YES','NO']),amount:z.number().finite().positive().max(10)}),
  z.object({type:z.literal('paper_close'),id}),
]);
export class RequestError extends Error { constructor(message:string, public status=400){super(message);} }
async function modeFor(owner:string):Promise<Mode> {
  const result = await getDb().select().from(preferences).where(eq(preferences.owner,owner)).get();
  return result?.mode === 'live' ? 'live' : 'demo';
}
async function load(owner:string, name:string, mode:Mode) {
  const db = getDb(); const key = `${owner}:${mode}`;
  let row = await db.select().from(workspaces).where(and(eq(workspaces.id,key),eq(workspaces.owner,owner))).get();
  if (!row) {
    const initial = mode === 'demo' ? createDemoWorkspace(name) : createLiveWorkspace(name);
    await db.insert(workspaces).values({id:key,owner,mode,payload:JSON.stringify(initial),revision:0,updatedAt:new Date().toISOString()}).onConflictDoNothing();
    row = await db.select().from(workspaces).where(and(eq(workspaces.id,key),eq(workspaces.owner,owner))).get();
  }
  if (!row) throw new RequestError('无法创建研究工作区。',503);
  return {state:JSON.parse(row.payload) as Workspace, revision:row.revision,key};
}
export async function readWorkspace(owner:string,name:string):Promise<Workspace> {
  return (await load(owner,name,await modeFor(owner))).state;
}
function findMarket(state:Workspace,id:string):Market {
  const market = state.markets.find(m=>m.id===id);
  if (!market) throw new RequestError('当前工作区找不到该市场，请刷新页面。');
  return market;
}
async function save(owner:string,loaded:Awaited<ReturnType<typeof load>>) {
  loaded.state.version=loaded.revision+1;
  const payload=JSON.stringify(loaded.state);
  if(new TextEncoder().encode(payload).length>1800000)throw new RequestError('工作区容量不足，请先导出。',413);
  const rows=await getDb().update(workspaces).set({payload,revision:loaded.revision+1,updatedAt:new Date().toISOString()}).where(and(eq(workspaces.id,loaded.key),eq(workspaces.owner,owner),eq(workspaces.revision,loaded.revision))).returning({id:workspaces.id});
  if(!rows.length)throw new RequestError('工作区已被另一请求更新，请重试。',409);
}
async function analyzeAI(owner:string,name:string,marketId:string|undefined,automatic=false) {
  const {key,model,dailyLimit}=aiConfig();
  if(!key)throw new RequestError('尚未配置 AI API 密钥，请先完成安全连接。',503);
  if(await modeFor(owner)!=='live')throw new RequestError('请先切换真实市场；演示事件不调用 AI。');
  const loaded=await load(owner,name,'live'),s=loaded.state,now=new Date().toISOString();
  if(automatic&&!s.settings.aiAuto)return s;
  const m=marketId?findMarket(s,marketId):s.markets.find(m=>aiDue(m));
  if(!m)return s;
  if(s.health.status!=='ok'){if(automatic)return s;throw new RequestError('行情连接未正常，请先刷新真实市场。');}
  const quoteAge=Date.now()-Date.parse(m.updatedAt);
  if(m.synthetic||m.status!=='active'||!m.rules||!m.resolutionSource||!Number.isFinite(Date.parse(m.endsAt))||Date.parse(m.endsAt)<=Date.now())throw new RequestError('仅分析规则、结算来源与截止时间完整的进行中真实市场。');
  if(!Number.isFinite(quoteAge)||quoteAge< -60000||quoteAge>600000)throw new RequestError('市场快照超过 10 分钟，请刷新后分析。');
  if(m.reports.length>=100)throw new RequestError('报告存储已达上限。');
  const usage=s.aiUsage;
  if(usage&&Date.parse(usage.busyUntil)>Date.now()){if(automatic)return s;throw new RequestError('一份 AI 研究正在进行中，请稍后。',429);}
  if(usage&&Date.now()-Date.parse(usage.lastAttempt)<60000){if(automatic)return s;throw new RequestError('AI 调用至少间隔 60 秒。',429);}
  const attempts=usage?.day===now.slice(0,10)?usage.attempts:0;
  if(attempts>=dailyLimit){if(automatic)return s;throw new RequestError('今日已达 3 次 AI 请求上限（UTC 日）。失败也占用次数，避免重复计费。',429);}
  const jobId=crypto.randomUUID();
  s.aiUsage={day:now.slice(0,10),attempts:attempts+1,lastAttempt:now,busyUntil:new Date(Date.now()+180000).toISOString(),jobId,message:'AI 正在搜索资料和审阅正反证据…'};
  await save(owner,loaded); // Reserve quota atomically before the billable request.
  let report:Awaited<ReturnType<typeof runAIResearch>>|undefined,error='';
  try{report=await runAIResearch(structuredClone(m),key,model,now);}catch(e){error=e instanceof Error&&e.name==='TimeoutError'?'AI 请求超时；没有自动重试。':e instanceof Error?e.message:'AI 请求失败。';}
  for(let retry=0;retry<4;retry++){
    const fresh=await load(owner,name,'live');
    if(fresh.state.aiUsage?.jobId!==jobId)throw new RequestError('AI 任务状态已变化，请查看研究档案。',409);
    const target=findMarket(fresh.state,m.id);
    if(report&&target.reports.length<100&&!target.reports.some(r=>r.id===report!.id))target.reports.unshift(report);
    fresh.state.aiUsage={...fresh.state.aiUsage,busyUntil:'',message:error||'AI 研究已保存。概率是尚未校准的主观估计。'};
    try{await save(owner,fresh);if(error)throw new RequestError(error,502);return fresh.state;}catch(e){if(e instanceof RequestError&&e.status===409&&retry<3)continue;throw e;}
  }
  throw new RequestError('报告保存冲突，请刷新查看状态。',409);
}
export async function act(owner:string,name:string,input:unknown):Promise<Workspace> {
  const parsed = actionSchema.safeParse(input);
  if (!parsed.success) throw new RequestError(`输入有误：${parsed.error.issues.map(i=>i.message).join('；')}`);
  const action = parsed.data;
  if(action.type==='ai_analyze')return analyzeAI(owner,name,action.id,action.automatic);
  if (action.type === 'set_mode') {
    await getDb().insert(preferences).values({owner,mode:action.mode}).onConflictDoUpdate({target:preferences.owner,set:{mode:action.mode}});
    return (await load(owner,name,action.mode)).state;
  }
  const {state:loaded,revision,key} = await load(owner,name,await modeFor(owner));
  let state = loaded;
  const now = new Date().toISOString();
  switch(action.type) {
    case 'toggle_watch': { const m=findMarket(state,action.id); if (!m.watched && state.markets.filter(x=>x.watched).length>=20) throw new RequestError('第一版最多同时监控 20 个市场。'); m.watched=!m.watched; if(m.watched)m.baseline=m.probability; break; }
    case 'settings': state.settings={...state.settings,thresholdPp:action.thresholdPp,pollSeconds:action.pollSeconds}; break;
    case 'ai_settings': if(state.mode!=='live')throw new RequestError('自动 AI 研究只用于真实市场。'); if(action.enabled&&!aiConfig().key)throw new RequestError('请先配置服务端 AI 密钥。');state.settings.aiAuto=action.enabled;break;
    case 'mark_read': state.alerts=state.alerts.map(a=>action.id==='all'||a.id===action.id?{...a,read:true}:a); break;
    case 'reset_demo': if(state.mode!=='demo')throw new RequestError('只有演示工作区可以重置。'); state=createDemoWorkspace(name); break;
    case 'add_evidence': {
      const m=findMarket(state,action.marketId);
      if(m.evidence.length>=100) throw new RequestError('单个市场最多保存 100 条证据。');
      const publishedAt=action.publishedAt?.trim() || '';
      if(publishedAt && (!Number.isFinite(Date.parse(publishedAt)) || Date.parse(publishedAt)>Date.now()))throw new RequestError('发布日期无效或在未来。');
      m.evidence.push({id:crypto.randomUUID(),title:action.title,url:action.url,claim:action.claim,stance:action.stance,publishedAt:publishedAt?new Date(publishedAt).toISOString():'',addedAt:now,verified:false});break;
    }
    case 'save_chat_report': {const m=findMarket(state,action.report.marketId);if(m.reports.some(r=>r.id===`chat-${action.report.requestId}`))return state;if(m.reports.length>=100)throw new RequestError('单市场报告已达上限。');m.reports.unshift(buildChatReport(m,action.report,now));break;}
    case 'analyze': { const m=findMarket(state,action.id); if(m.reports.length>=100)throw new RequestError('单个市场已达 100 份研究快照，请先导出归档。'); m.reports.unshift(buildReport(m,now));break; }
    case 'paper_buy': {
      if(state.account.positions.length>=500)throw new RequestError('模拟交易记录已达 500 笔，请导出。');
      if(state.mode==='live' && state.health.status!=='ok')throw new RequestError('行情连接未正常，请先刷新后再模拟。');
      state.account=paperBuy(state.account,findMarket(state,action.marketId),action.side,action.amount,now);break;
    }
    case 'paper_close': {const p=state.account.positions.find(p=>p.id===action.id);if(!p)throw new RequestError('模拟持仓不存在。');if(state.mode==='live' && state.health.status!=='ok')throw new RequestError('行情连接未正常，请先刷新后再模拟。');state.account=paperClose(state.account,findMarket(state,p.marketId),p.id,now);break;}
    case 'add_market': {
      if(state.mode!=='live')throw new RequestError('请切换到真实市场工作区再添加。');
      if(state.markets.length>=150)throw new RequestError('第一版最多保存 150 个市场。');
      try {
        const [market]=await fetchMarkets(action.slug);
        if(state.markets.some(m=>m.id===market.id))throw new RequestError('该市场已经在工作区中。');
        market.watched=state.markets.filter(m=>m.watched).length<20; state.markets.unshift(market);
        state.health={status:'ok',message:'已获取市场快照。图表从本站采集时开始；报价是指示价格。',checkedAt:now};
      } catch(e) {if(e instanceof RequestError)throw e;state.health={status:'error',message:e instanceof Error?e.message:'行情获取失败。',checkedAt:now};}
      break;
    }
    case 'refresh': {
      if(state.mode==='demo')break;
      if(state.health.checkedAt && Date.now()-Date.parse(state.health.checkedAt)<15000) return state;
      try {
        if(!state.markets.length)state.markets=await fetchMarkets();
        else {
          const selected=state.markets.filter(m=>m.watched||state.account.positions.some(p=>p.marketId===m.id&&!p.closedAt));
          const targets=selected.length ? selected : state.markets.slice(0,10);
          const results=await Promise.allSettled(targets.map(async m=>{const [fresh]=await fetchMarkets(m.slug);return mergeSnapshot(m,fresh,state.settings.thresholdPp,now);}));
          const failures:string[]=[];
          for(const r of results) {
            if(r.status==='fulfilled'){state.markets=state.markets.map(m=>m.id===r.value.market.id?r.value.market:m);state.alerts.unshift(...r.value.alerts);}
            else failures.push(r.reason instanceof Error?r.reason.message:'行情请求失败');
          }
          if(failures.length)throw new Error(`${failures.length} 个市场未刷新。${failures[0]}`);
        }
        state.health={status:'ok',message:'已从 Polymarket 获取快照。页面打开时轮询关注市场及持仓；不提供后台推送。',checkedAt:now};
      }catch(e){state.health={status:'error',message:e instanceof Error?e.message:'无法连接行情服务。',checkedAt:now};}
      break;
    }
    case 'refresh_books': {
      if (state.mode !== 'live') throw new RequestError('请切换到真实市场工作区再刷新盘口。');
      const targets = state.markets.filter(m => !m.synthetic && m.status === 'active' && m.watched && m.tokenIds && !(m.book && bookFresh(m.book.fetchedAt)));
      if (!targets.length) { state.health = { ...state.health, message: '盘口快照均在有效期内，无需重复刷新。', checkedAt: now }; break; }
      const failures: string[] = [];
      let okCount = 0;
      for (let i = 0; i < targets.length; i += 5) {
        const chunk = targets.slice(i, i + 5);
        const results = await Promise.allSettled(chunk.map(async m => ({ id: m.id, snapshot: await fetchBookSnapshot(m.tokenIds!, now) })));
        results.forEach((r) => {
          if (r.status === 'fulfilled') { okCount++; state.markets = state.markets.map(m => m.id === r.value.id ? { ...m, book: r.value.snapshot } : m); }
          else failures.push(r.reason instanceof Error ? r.reason.message : '请求失败');
        });
      }
      state.health = { ...state.health, message: `盘口快照已更新 ${okCount} 个市场${failures.length ? `，${failures.length} 个失败（${failures[0]}）` : ''}。快照有效期 10 分钟，仅供研究参考，不代表实时可成交。`, checkedAt: now };
      break;
    }
  }
  state.alerts=state.alerts.slice(0,500);state.version=revision+1;
  const payload=JSON.stringify(state);
  if(new TextEncoder().encode(payload).length>1800000)throw new RequestError('工作区已接近存储容量，请先导出档案。此次修改未保存。',413);
  const rows=await getDb().update(workspaces).set({payload,revision:revision+1,updatedAt:now}).where(and(eq(workspaces.id,key),eq(workspaces.owner,owner),eq(workspaces.revision,revision))).returning({id:workspaces.id});
  if(!rows.length)throw new RequestError('另一个页面刚刚更新了工作区。请刷新后重试，当前操作没有重复执行。',409);
  return state;
}
