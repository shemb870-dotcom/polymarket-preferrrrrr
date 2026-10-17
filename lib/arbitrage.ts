// 双边套利（机械价差）扫描：纯数学，无需概率模型。
//
// 同一市场同时买入 YES 与 NO 各一份：结算时必有一份值 1 美元。
// 若 YES 可成交卖价 + NO 可成交卖价 + 双边费用 < 1.00 美元，则锁定利润。
//
// 滑点：双边卖价都用 lib/clob.ts 的按深度行走的可执行卖价（VWAP，
// BOOK_REF_NOTIONAL_USD 参考规模逐档吃掉），不用最优一档价冒充可成交均价。
// 费用：沿用用户可调的每份成本假设（默认 0.02 美元/份），是压力假设，
// 不是 Polymarket 真实平台费率；UI 必须注明。
//
// fail-closed：任一腿盘口缺失/过期（超 10 分钟有效期）/深度不足 →
// 不产生信号，明确标记阻断原因；绝不拿指示价凑数。
//
// 本文件不包含任何交易、签名或钱包代码；所有数字均为快照，
// 不承诺可成交、不构成交易建议。

import type { Market } from './types.ts';
import { bookFresh } from './clob.ts';

/** 锁定利润防尘阈值（美元/份）：低于此值不展示，避免灰尘信号。可配置。 */
export const ARB_DUST_THRESHOLD_USD = 0.005;

export type ArbScanRow = {
  market: Market;
  /** 双边按深度行走的可执行卖价（VWAP），任一腿无效时为 null。 */
  yesExecAsk: number | null;
  noExecAsk: number | null;
  /** 双边可成交卖价 + 双边费用（美元/份）。 */
  totalCost: number | null;
  /** 锁定利润 = 1 − totalCost（美元/份）。信号成立时为正且超过防尘阈值。 */
  lockedProfit: number | null;
  signal: boolean;
  blockers: string[];
  fetchedAt: string | null;
};

/**
 * 扫描双边机械套利机会。纯函数，只读计算。
 * @param costPerShare 每份成本假设（美元），双边各计一份
 * @param dustThreshold 锁定利润防尘阈值（美元/份）
 */
export function scanArbitrage(
  markets: Market[],
  costPerShare = 0.02,
  dustThreshold = ARB_DUST_THRESHOLD_USD,
  now = Date.now(),
): ArbScanRow[] {
  if (!Number.isFinite(costPerShare) || costPerShare < 0 || costPerShare > 0.2) throw new Error('成本假设须在 0–20 美分之间');
  if (!Number.isFinite(dustThreshold) || dustThreshold < 0) throw new Error('防尘阈值须为非负数');
  return markets.map(m => {
    const blockers: string[] = [];
    if (m.synthetic) blockers.push('虚构样本');
    if (m.status !== 'active' || !Number.isFinite(Date.parse(m.endsAt)) || Date.parse(m.endsAt) <= now) blockers.push('已截止或截止时间未知');
    if (!m.tokenIds) blockers.push('缺少盘口 token');
    const yes = m.book?.yes ?? null;
    const no = m.book?.no ?? null;
    const freshYes = yes !== null && bookFresh(yes.fetchedAt, now);
    const freshNo = no !== null && bookFresh(no.fetchedAt, now);
    let yesExecAsk: number | null = null;
    let noExecAsk: number | null = null;
    if (!freshYes || !freshNo) {
      blockers.push('盘口缺失或过期（超 10 分钟有效期）');
    } else if (yes!.execAsk === null || no!.execAsk === null) {
      blockers.push('盘口无有效卖单');
    } else if (!yes!.fullyFilled || !no!.fullyFilled) {
      blockers.push('盘口深度不足（参考规模无法完全成交）');
    } else {
      yesExecAsk = yes!.execAsk;
      noExecAsk = no!.execAsk;
    }
    let totalCost: number | null = null;
    let lockedProfit: number | null = null;
    let signal = false;
    if (!blockers.length && yesExecAsk !== null && noExecAsk !== null) {
      totalCost = yesExecAsk + noExecAsk + 2 * costPerShare;
      lockedProfit = 1 - totalCost;
      if (lockedProfit > dustThreshold) {
        signal = true;
      } else {
        blockers.push(
          lockedProfit <= 0
            ? '双边合计不低于 1 美元（含双边费用）'
            : `锁定利润未超过防尘阈值（${(dustThreshold * 100).toFixed(1)}¢/份）`,
        );
      }
    }
    return {
      market: m,
      yesExecAsk,
      noExecAsk,
      totalCost,
      lockedProfit,
      signal,
      blockers,
      fetchedAt: m.book?.fetchedAt ?? null,
    };
  });
}
