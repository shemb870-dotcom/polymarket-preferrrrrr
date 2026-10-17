import type { Alert, Market } from './types';
import { extractTokenIds } from './clob.ts';
const GAMMA = 'https://gamma-api.polymarket.com';
type Raw = Record<string, unknown>;
const string = (v: unknown) => typeof v === 'string' ? v : '';
function list(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  try { const parsed = JSON.parse(string(v)); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
function finite(v: unknown): number { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; }
function date(v: unknown): string { const s = string(v); return s && Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : ''; }
export function normalizeMarket(raw: Raw, now = new Date().toISOString()): Market | null {
  const outcomes = list(raw.outcomes).map(v => String(v).toLowerCase());
  const values = list(raw.outcomePrices);
  const yes = outcomes.indexOf('yes');
  const no = outcomes.indexOf('no');
  if (yes < 0 || no < 0 || outcomes.length !== 2 || !string(raw.slug) || !string(raw.question) || raw.id == null) return null;
  const p = values[yes] === null || values[yes] === '' || values[yes] === undefined ? NaN : Number(values[yes]);
  const probability = Number.isFinite(p) && p >= 0 && p <= 1 ? p : null;
  const rules = string(raw.description);
  const resolutionSource = string(raw.resolutionSource);
  const endsAt = date(raw.endDate);
  const updatedAt = date(raw.updatedAt);
  return { id: String(raw.id), slug: string(raw.slug), question: string(raw.question), category: string(raw.category) || '其他', rules, resolutionSource, probability, changePp: 0, volume: finite(raw.volumeNum ?? raw.volume), liquidity: finite(raw.liquidityNum ?? raw.liquidity), updatedAt, endsAt, status: raw.closed === true || raw.active === false ? 'closed' : 'active', synthetic: false, watched: false, history: probability === null ? [] : [{at: now, p: probability}], evidence: [], reports: [], baseline: probability, ruleHash: JSON.stringify([rules,resolutionSource,endsAt,raw.closed,raw.active]), tokenIds: extractTokenIds(raw), book: null };
}
export function parseSlug(input: string): string {
  let slug = input.trim();
  if (/^https?:\/\//i.test(slug)) {
    const url = new URL(slug);
    if (!['polymarket.com','www.polymarket.com'].includes(url.hostname) || url.protocol !== 'https:') throw new Error('请输入 Polymarket 市场 slug 或官方 HTTPS 链接。');
    slug = url.pathname.split('/').filter(Boolean).pop() || '';
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,249}$/.test(slug)) throw new Error('市场 slug 格式不正确。');
  return slug;
}
async function gamma(path: string): Promise<unknown> {
  const response = await fetch(`${GAMMA}${path}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (response.status === 451) throw new Error('Polymarket 返回 HTTP 451：该数据在当前服务区域不可用。不会绕过访问限制。');
  if (!response.ok) throw new Error(`Polymarket 数据请求失败（HTTP ${response.status}）。旧快照已保留。`);
  return response.json();
}
export async function fetchMarkets(slug?: string): Promise<Market[]> {
  const query = slug ? `slug=${encodeURIComponent(parseSlug(slug))}` : 'active=true&closed=false&limit=60&order=volume24hr&ascending=false';
  const data = await gamma(`/markets?${query}`);
  if (!Array.isArray(data)) throw new Error('Polymarket 返回的数据格式不受支持。');
  const now = new Date().toISOString();
  const markets = data.map(v => v && typeof v === 'object' ? normalizeMarket(v as Raw, now) : null).filter((v):v is Market => v !== null);
  if (slug && markets.length === 0) throw new Error('未找到对应的 YES/NO 市场。多市场事件请使用具体市场的 slug。');
  return markets;
}
export function mergeSnapshot(old: Market, current: Market, thresholdPp: number, now = new Date().toISOString()): {market:Market; alerts:Alert[]} {
  const alerts: Alert[] = [];
  const age = Date.parse(now) - Date.parse(current.updatedAt);
  const usable = current.probability !== null && Number.isFinite(age) && age >= -60000 && age <= 600000;
  const delta = usable && old.baseline !== null ? (current.probability! - old.baseline) * 100 : 0;
  if (old.watched && usable && old.baseline !== null && Math.abs(delta) >= thresholdPp - 1e-8) alerts.push({id:crypto.randomUUID(),marketId:old.id,title:'市场价格变化',message:`YES 指示价格较上次提醒基线${delta >= 0 ? '上升' : '下降'} ${Math.abs(delta).toFixed(1)} 个百分点。价格变化不代表已证实的新事实。`,kind:'price',createdAt:now,read:false});
  if (old.watched && current.ruleHash !== old.ruleHash) alerts.push({id:crypto.randomUUID(),marketId:old.id,title:'结算信息变化',message:'规则、结算来源、截止时间或市场状态发生变化，请核对官方条款。',kind:'rules',createdAt:now,read:false});
  const history = [...old.history];
  if (usable && (history.length === 0 || history[history.length-1].p !== current.probability)) history.push({at:now,p:current.probability!});
  return {market:{...current,tokenIds:current.tokenIds??old.tokenIds,book:old.book??null,watched:old.watched,evidence:old.evidence,reports:old.reports,history:history.slice(-500),changePp:delta,baseline:usable && (old.baseline === null || alerts.some(a=>a.kind==='price')) ? current.probability : old.baseline}, alerts};
}
