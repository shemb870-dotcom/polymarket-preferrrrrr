import type { Account, Market, Position } from './types';

export const LIVE_PRICE_MAX_AGE_MS = 10 * 60 * 1000;
const round = (value: number, digits = 6) => Number(value.toFixed(digits));

export type AccountMetrics = {
  equity: number;
  cash: number;
  marketValue: number;
  costBasis: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalPnl: number;
  returnPct: number;
  feesPaid: number;
  openPositions: number;
  closedPositions: number;
  unpricedPositions: number;
  stalePositions: number;
};

function validateAccount(account: Account) {
  if (!Number.isFinite(account.cash) || account.cash < 0 ||
      !Number.isFinite(account.feeRate) || account.feeRate < 0 || account.feeRate >= 1 ||
      !Number.isFinite(account.maxTrade) || account.maxTrade <= 0) {
    throw new Error('模拟账户参数无效，请重新初始化账户。');
  }
}

function validProbability(market: Market): market is Market & { probability: number } {
  return typeof market.probability === 'number' && Number.isFinite(market.probability) &&
    market.probability >= 0 && market.probability <= 1;
}

function quoteIsStale(market: Market, nowMs: number): boolean {
  if (market.synthetic) return false;
  const updatedMs = Date.parse(market.updatedAt);
  return !Number.isFinite(updatedMs) || nowMs - updatedMs > LIVE_PRICE_MAX_AGE_MS || updatedMs - nowMs > 60_000;
}

function executablePrice(market: Market, side: 'YES' | 'NO', now: string): number {
  if (side !== 'YES' && side !== 'NO') throw new Error('请选择 YES 或 NO。');
  if (market.status !== 'active') throw new Error('该市场已经关闭，不能模拟成交。');
  if (!validProbability(market)) throw new Error('当前没有有效报价，不能模拟成交。');
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error('模拟交易时间无效。');
  if (quoteIsStale(market, nowMs)) throw new Error('真实市场报价已超过 10 分钟或时间无效，请先刷新报价。');
  const price = side === 'YES' ? market.probability : 1 - market.probability;
  if (price <= 0) throw new Error('所选方向的报价为零，不能据此模拟成交。');
  return price;
}

/** amount is the complete cash outlay, including the simulated entry fee. */
export function paperBuy(account: Account, market: Market, side: 'YES' | 'NO', amount: number, now = new Date().toISOString()): Account {
  validateAccount(account);
  if (!Number.isFinite(amount) || amount < 0.01) throw new Error('模拟金额至少为 $0.01。');
  const cashOutlay = round(amount);
  const limit = Math.min(account.maxTrade, 10);
  if (cashOutlay > limit) throw new Error(`单笔模拟总支出不能超过 $${limit.toFixed(2)}（含手续费）。`);
  if (cashOutlay > account.cash) throw new Error('模拟余额不足。');
  const price = executablePrice(market, side, now);
  const fee = round(cashOutlay * account.feeRate);
  const shares = round((cashOutlay - fee) / price, 8);
  if (!Number.isFinite(shares) || shares <= 0) throw new Error('金额或报价无法形成有效份额。');
  const position: Position = {
    id: `paper-${globalThis.crypto.randomUUID()}`,
    marketId: market.id,
    question: market.question,
    side,
    shares,
    entryPrice: price,
    cost: cashOutlay,
    fee,
    openedAt: now,
    closedAt: null,
    proceeds: null,
    exitPrice: null,
  };
  return { ...account, cash: round(account.cash - cashOutlay), positions: [...account.positions, position] };
}

export function paperClose(account: Account, market: Market, positionId: string, now = new Date().toISOString()): Account {
  validateAccount(account);
  const position = account.positions.find((item) => item.id === positionId);
  if (!position) throw new Error('找不到该模拟持仓。');
  if (position.closedAt !== null) throw new Error('该模拟持仓已经平仓。');
  if (position.marketId !== market.id) throw new Error('持仓与市场不匹配。');
  const price = executablePrice(market, position.side, now);
  const gross = position.shares * price;
  const exitFee = round(gross * account.feeRate);
  const proceeds = round(gross - exitFee);
  return {
    ...account,
    cash: round(account.cash + proceeds),
    positions: account.positions.map((item) => item.id === positionId ? { ...item, closedAt: now, proceeds, exitPrice: price } : item),
  };
}

/** Missing quotes preserve cost as an explicit unpriced placeholder; they cannot manufacture P&L. */
export function accountMetrics(account: Account, markets: Market[]): AccountMetrics {
  const byId = new Map(markets.map((market) => [market.id, market]));
  const open = account.positions.filter((position) => position.closedAt === null);
  const closed = account.positions.filter((position) => position.closedAt !== null);
  let marketValue = 0;
  let unpricedPositions = 0;
  let stalePositions = 0;
  const nowMs = Date.now();
  for (const position of open) {
    const market = byId.get(position.marketId);
    if (!market || !validProbability(market)) {
      marketValue += position.cost;
      unpricedPositions++;
    } else {
      const price = position.side === 'YES' ? market.probability : 1 - market.probability;
      marketValue += position.shares * price;
      if (quoteIsStale(market, nowMs)) stalePositions++;
    }
  }
  const costBasis = open.reduce((sum, item) => sum + item.cost, 0);
  const realizedPnl = closed.reduce((sum, item) => sum + (item.proceeds ?? 0) - item.cost, 0);
  const feesPaid = account.positions.reduce((sum, item) => sum + item.fee +
    (item.closedAt !== null && item.exitPrice !== null && item.proceeds !== null
      ? Math.max(0, item.shares * item.exitPrice - item.proceeds)
      : 0), 0);
  const equity = account.cash + marketValue;
  const totalPnl = equity - account.startingBalance;
  return {
    equity: round(equity),
    cash: round(account.cash),
    marketValue: round(marketValue),
    costBasis: round(costBasis),
    unrealizedPnl: round(marketValue - costBasis),
    realizedPnl: round(realizedPnl),
    totalPnl: round(totalPnl),
    returnPct: account.startingBalance > 0 ? round(totalPnl / account.startingBalance * 100) : 0,
    feesPaid: round(feesPaid),
    openPositions: open.length,
    closedPositions: closed.length,
    unpricedPositions,
    stalePositions,
  };
}
