import type { Market, ResearchReport } from './types';

/** A reproducible research checklist, not an independently calibrated forecast. */
export function buildReport(market: Market, now = new Date().toISOString()): ResearchReport {
  const evidence = market.evidence;
  const yes = evidence.filter((item) => item.stance === 'yes');
  const no = evidence.filter((item) => item.stance === 'no');
  const neutral = evidence.filter((item) => item.stance === 'neutral');
  const unverified = evidence.filter((item) => !item.verified);
  const label = (item: (typeof evidence)[number]) =>
    `${item.verified ? '人工标记已核验' : '用户录入 · 未核验'}｜${item.title}：${item.claim}`;
  const missing: string[] = [];
  if (!market.rules.trim()) missing.push('缺少完整结算条款，无法判断什么事实会触发 YES / NO。');
  if (!market.resolutionSource.trim()) missing.push('缺少指定结算来源；新闻标题与交易所最终裁定可能不同。');
  if (!market.endsAt || !Number.isFinite(Date.parse(market.endsAt))) missing.push('缺少有效的到期时间与适用时区。');
  if (evidence.length === 0) missing.push('尚未录入外部证据；当前没有支持独立判断的一手材料。');
  if (unverified.length) missing.push(`${unverified.length} 条材料尚未核验原文、发布日期与来源，不能直接当成事实。`);
  if (!yes.length) missing.push('尚未记录支持 YES 的可核验材料。');
  if (!no.length) missing.push('尚未记录支持 NO 的可核验材料，需主动寻找反证。');
  if (!evidence.some((item) => item.url.startsWith('https://'))) missing.push('缺少可回访的 HTTPS 来源链接，研究结论尚不能复核。');
  if (market.liquidity <= 0) missing.push('缺少可用流动性数据；页面概率不能说明下单时的可成交价格。');
  if (market.synthetic) missing.push('这是虚构教学事件，图表、成交量和规则均为示例，不能用于真实交易。');
  missing.push('未配置独立概率模型，也没有历史校准成绩，无法给出可信的预测概率或盈利优势。');

  const price = market.probability === null
    ? '当前没有可用的市场概率。'
    : `市场 YES 指示概率为 ${(market.probability * 100).toFixed(1)}%，只反映市场报价，不代表本研究的预测。`;
  const qualification = market.synthetic ? '示例研究记录。' : '基于当前规则与用户录入材料的结构化研究记录。';
  return {
    id: `report-${globalThis.crypto.randomUUID()}`,
    createdAt: now,
    title: `${market.synthetic ? '示例 · ' : ''}规则与证据审阅`,
    summary: `${qualification}${price}已整理 ${evidence.length} 条材料，其中 ${unverified.length} 条未核验。${neutral.length ? `另有 ${neutral.length} 条背景材料，未将其自动视为任何一方的支持。` : ''}现阶段应先补齐证据，再判断是否值得建立预测。`,
    supporting: yes.length ? yes.map(label) : ['尚无支持 YES 的材料。只有满足结算规则中要求的事件、期限与来源，YES 才有结算依据。'],
    opposing: no.length ? no.map(label) : ['尚无支持 NO 的材料。应检查事件未发生、错过期限、定义不符或指定来源未确认等可能性。'],
    missing,
    nextSteps: [
      `逐字核对结算规则：${market.rules.trim() || '请先补录完整条款。'}`,
      `确认指定结算来源：${market.resolutionSource.trim() || '待补充。'}。同时确认到期时间与时区，不以新闻叙事替代规则。`,
      '为 YES 和 NO 分别补充最强的一手证据，记录原文链接、发布日期、事实与推断的区别。',
      '核查每条材料是否独立，避免将转载数量误当作多重证据；记录可能推翻当前判断的新事实。',
      '列出相互竞争的事件解释，优先检查每个解释与哪些证据矛盾；定性排序不是获胜概率。',
      '若可取得可比历史案例，先定义纳入标准和时间截点，再查看基准发生率；缺少可信样本时不编造基础概率。',
      '发生新事实或结算规则变更时重新生成研究快照，并保留旧版本用于回顾。',
    ],
    probability: null,
    methodology: '规则优先的结构化清单；按录入者标注整理正反证据。未执行外部技能、未自动验证来源、未调用概率模型；市场价格不作为分析师预测。',
    evidenceIds: evidence.map((item) => item.id),
    snapshot: { rules: market.rules, resolutionSource: market.resolutionSource, endsAt: market.endsAt, marketProbability: market.probability, quoteUpdatedAt: market.updatedAt, evidence: structuredClone(evidence) },
  };
}
