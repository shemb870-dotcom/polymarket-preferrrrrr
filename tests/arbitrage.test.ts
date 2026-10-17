import test from 'node:test';
import assert from 'node:assert/strict';
import { ARB_DUST_THRESHOLD_USD, scanArbitrage } from '../lib/arbitrage.ts';
import { BOOK_TTL_MS } from '../lib/clob.ts';
import { createDemoWorkspace } from '../lib/demo.ts';

const now = '2026-10-13T12:00:00.000Z';
const NOW_MS = Date.parse(now);

function liveMarket() {
  const m: any = {
    ...createDemoWorkspace('test').markets[0],
    synthetic: false, watched: true, updatedAt: now, endsAt: '2026-12-01T00:00:00Z',
    probability: 0.4, liquidity: 1000,
    tokenIds: { yes: '32338220190071351435772801779725302244575775216413325951443816017994629993401', no: '25659310674993675562345759665114759892400026242514633218387667107987341231962' },
  };
  m.reports = [];
  m.evidence = [];
  return m;
}
function freshBook(execAskYes: number, execAskNo: number, at = now, fullyFilled = true) {
  const side = (ask: number) => ({ bestBid: ask - 0.01, bestAsk: ask, spread: 0.01, execAsk: ask, execShares: 25, fullyFilled, fetchedAt: at });
  return { yes: side(execAskYes), no: side(execAskNo), fetchedAt: at };
}

test('双边合计低于 1 美元（含费用）时触发信号', () => {
  const m = { ...liveMarket(), book: freshBook(0.40, 0.55) };
  const [row] = scanArbitrage([m], 0.02, ARB_DUST_THRESHOLD_USD, NOW_MS) as any[];
  assert.equal(row.signal, true);
  assert.deepEqual(row.blockers, []);
  // totalCost = 0.40 + 0.55 + 2*0.02 = 0.99；lockedProfit = 0.01
  assert.ok(Math.abs(row.totalCost - 0.99) < 1e-9);
  assert.ok(Math.abs(row.lockedProfit - 0.01) < 1e-9);
});

test('使用深度行走的可执行卖价而非最优一档价', () => {
  // bestAsk 0.40 很诱人，但按深度行走的可执行均价是 0.52 → 合计超 1，无信号
  const book = freshBook(0.52, 0.55);
  book.yes = { ...book.yes, bestAsk: 0.40, execAsk: 0.52 };
  const [row] = scanArbitrage([{ ...liveMarket(), book }], 0.02, ARB_DUST_THRESHOLD_USD, NOW_MS) as any[];
  assert.equal(row.yesExecAsk, 0.52);
  assert.equal(row.signal, false);
  assert.ok(row.blockers.some((b: string) => b.includes('不低于 1 美元')));
});

test('费用计入后合计不低于 1 美元则不触发', () => {
  const m = { ...liveMarket(), book: freshBook(0.48, 0.50) };
  const [row] = scanArbitrage([m], 0.02, ARB_DUST_THRESHOLD_USD, NOW_MS) as any[];
  assert.equal(row.signal, false);
  assert.ok(Math.abs(row.totalCost! - 1.02) < 1e-9);
  assert.ok(row.blockers.some((b: string) => b.includes('不低于 1 美元')));
});

test('任一腿盘口缺失时被阻断', () => {
  const [row] = scanArbitrage([liveMarket()], 0.02, ARB_DUST_THRESHOLD_USD, NOW_MS) as any[];
  assert.equal(row.signal, false);
  assert.equal(row.lockedProfit, null);
  assert.ok(row.blockers.some((b: string) => b.includes('盘口缺失或过期')));
});

test('盘口过期（超 10 分钟）时被阻断', () => {
  const staleAt = new Date(NOW_MS - BOOK_TTL_MS - 60000).toISOString();
  const m = { ...liveMarket(), book: freshBook(0.40, 0.55, staleAt) };
  const [row] = scanArbitrage([m], 0.02, ARB_DUST_THRESHOLD_USD, NOW_MS) as any[];
  assert.equal(row.signal, false);
  assert.ok(row.blockers.some((b: string) => b.includes('盘口缺失或过期')));
});

test('任一腿深度不足时被阻断', () => {
  const m = { ...liveMarket(), book: freshBook(0.40, 0.55, now, false) };
  const [row] = scanArbitrage([m], 0.02, ARB_DUST_THRESHOLD_USD, NOW_MS) as any[];
  assert.equal(row.signal, false);
  assert.ok(row.blockers.some((b: string) => b.includes('盘口深度不足')));
});

test('锁定利润未超过防尘阈值时被过滤', () => {
  // locked = 1 - (0.40+0.55+0.04) = 0.01 > 0.005 → 信号
  const dust = { ...liveMarket(), book: freshBook(0.40, 0.556) };
  const [dusty] = scanArbitrage([dust], 0.02, ARB_DUST_THRESHOLD_USD, NOW_MS) as any[];
  assert.ok(Math.abs(dusty.lockedProfit! - 0.004) < 1e-9);
  assert.equal(dusty.signal, false);
  assert.ok(dusty.blockers.some((b: string) => b.includes('防尘阈值')));
  // 阈值可配置：降到 0.003 则同一行触发
  const [loud] = scanArbitrage([dust], 0.02, 0.003, NOW_MS) as any[];
  assert.equal(loud.signal, true);
});

test('虚构样本与缺少 token 的市场被阻断', () => {
  const demo = { ...liveMarket(), synthetic: true, book: freshBook(0.40, 0.55) };
  const [r1] = scanArbitrage([demo], 0.02, ARB_DUST_THRESHOLD_USD, NOW_MS) as any[];
  assert.equal(r1.signal, false);
  assert.ok(r1.blockers.some((b: string) => b.includes('虚构样本')));
  const noToken = { ...liveMarket(), tokenIds: null, book: freshBook(0.40, 0.55) };
  const [r2] = scanArbitrage([noToken], 0.02, ARB_DUST_THRESHOLD_USD, NOW_MS) as any[];
  assert.equal(r2.signal, false);
  assert.ok(r2.blockers.some((b: string) => b.includes('缺少盘口 token')));
});

test('非法成本假设与阈值抛错', () => {
  const m = { ...liveMarket(), book: freshBook(0.40, 0.55) };
  assert.throws(() => scanArbitrage([m], -0.01), /成本假设/);
  assert.throws(() => scanArbitrage([m], 0.02, -0.001), /防尘阈值/);
});
