import type { Market } from './types.ts';

export function aiDue(m:Market, now=Date.now()) {
  if(m.synthetic || m.status!=='active' || !m.watched || !Number.isFinite(Date.parse(m.endsAt)) || Date.parse(m.endsAt)<=now) return false;
  const quoteAge=now-Date.parse(m.updatedAt);
  if(!m.rules.trim()||!m.resolutionSource.trim()||!Number.isFinite(quoteAge)||quoteAge< -60000||quoteAge>600000)return false;
  const report=m.reports.find(r=>r.ai);
  if(!report)return true;
  const age=now-Date.parse(report.createdAt);
  if(!Number.isFinite(age)||age<3600000)return false;
  return age>=21600000 || report.ai?.ruleHash!==m.ruleHash || m.evidence.some(e=>Date.parse(e.addedAt)>Date.parse(report.createdAt)) || (m.probability!==null && report.snapshot?.marketProbability!=null && Math.abs(m.probability-report.snapshot.marketProbability)>=0.05);
}

/** Scenario arithmetic only: Gamma indicative price is not an executable ask. */
export function opportunities(markets:Market[], costPerShare=0.02, now=Date.now()) {
  if(!Number.isFinite(costPerShare)||costPerShare<0||costPerShare>0.2)throw new Error('成本假设须在 0–20 美分之间');
  return markets.flatMap(m=>{
    const r=m.reports.find(r=>r.ai||r.chat),a=r?.ai||r?.chat;
    const blockers:string[]=[];
    if(m.synthetic)blockers.push('虚构样本');
    if(m.status!=='active'||!Number.isFinite(Date.parse(m.endsAt))||Date.parse(m.endsAt)<=now)blockers.push('已截止或截止时间未知');
    const age=now-Date.parse(m.updatedAt);
    if(!Number.isFinite(age)||age< -60000||age>600000)blockers.push('报价过期或缺失');
    if(!a||a.abstain||r?.probability==null||a.low==null||a.high==null)blockers.push('尚无研究概率估计');
    if(a&&a.ruleHash!==m.ruleHash)blockers.push('结算规则已变更');
    if(r&&(!Number.isFinite(Date.parse(r.createdAt))||now-Date.parse(r.createdAt)>21600000||Date.parse(r.createdAt)>now))blockers.push('研究快照已过期');
    if(m.evidence.some(e=>r&&Date.parse(e.addedAt)>Date.parse(r.createdAt)))blockers.push('有未纳入的新证据');
    if(m.liquidity<=0)blockers.push('缺少流动性数据');
    return (['YES','NO'] as const).map(side=>{
      const price=m.probability===null?null:side==='YES'?m.probability:1-m.probability;
      const p=r?.probability==null?null:side==='YES'?r.probability:1-r.probability;
      const low=a?.low==null||a.high==null?null:side==='YES'?a.low:1-a.high;
      const high=a?.low==null||a.high==null?null:side==='YES'?a.high:1-a.low;
      const reasons=[...blockers];if(price===null||price<=0||price>=1)reasons.push('无可用指示价格');
      const allIn=price===null?null:price+costPerShare;
      const valid=!reasons.length&&allIn!==null&&allIn>0&&allIn<1;
      if(allIn!==null&&allIn>=1)reasons.push('假设总成本不低于结算收入');
      return {market:m,side,price,p,low,high,odds:price!==null&&price>0?1/price:null,allIn,ev:valid&&p!==null?p-allIn!:null,conservativeEv:valid&&low!==null?low-allIn!:null,blockers:reasons};
    });
  });
}
