import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoWorkspace, createLiveWorkspace } from '../lib/demo.ts';
import { buildReport } from '../lib/research.ts';
import { accountMetrics, paperBuy, paperClose } from '../lib/paper.ts';

const now = '2026-10-12T06:00:00.000Z';

test('demo fixtures are explicitly fictional and neither mode fabricates a trading history', () => {
  const demo = createDemoWorkspace('test-user');
  assert.equal(demo.markets.length, 6);
  assert.equal(demo.account.cash, 100);
  assert.deepEqual(demo.account.positions, []);
  assert.ok(demo.markets.every((market) => market.synthetic && market.question.includes('示例') && market.evidence.length === 0));
  assert.ok(demo.markets.every((market) => market.history.at(-1)?.p === market.probability));
  assert.equal(accountMetrics(demo.account, demo.markets).totalPnl, 0);
  const live = createLiveWorkspace('test-user');
  assert.equal(live.mode, 'live');
  assert.equal(live.markets.length, 0);
  assert.equal(live.alerts.length, 0);
  assert.equal(live.health.status, 'idle');
});

test('research preserves evidence sides, treats unverified input as unverified, and never fabricates probability', () => {
  const market = createDemoWorkspace('test-user').markets[0];
  market.evidence = [
    { id: 'a', title: '人工录入 A', url: 'https://example.com/a', claim: '假设支持条件得到确认', stance: 'yes', publishedAt: now, addedAt: now, verified: false },
    { id: 'b', title: '人工录入 B', url: 'https://example.com/b', claim: '假设关键期限可能延后', stance: 'no', publishedAt: now, addedAt: now, verified: false },
  ];
  const report = buildReport(market, now);
  assert.equal(report.probability, null);
  assert.ok(report.supporting[0].includes('未核验'));
  assert.ok(report.opposing[0].includes('可能延后'));
  assert.deepEqual(report.evidenceIds, ['a', 'b']);
  assert.ok(report.nextSteps.some((step) => step.includes(market.rules)));
  assert.ok(report.missing.some((item) => item.includes('2 条材料尚未核验')));
});

test('buying and closing at the same price debits both simulated fees without mutating history', () => {
  const workspace = createDemoWorkspace('test-user');
  const market = { ...workspace.markets[0], probability: 0.5 };
  const account = paperBuy(workspace.account, market, 'YES', 10, now);
  assert.equal(workspace.account.cash, 100);
  assert.equal(workspace.account.positions.length, 0);
  assert.equal(account.cash, 90);
  assert.equal(account.positions[0].shares, 19.8);
  assert.equal(account.positions[0].fee, 0.1);
  assert.equal(accountMetrics(account, [market]).equity, 99.9);
  const closed = paperClose(account, market, account.positions[0].id, now);
  assert.equal(account.positions[0].closedAt, null);
  assert.equal(closed.cash, 99.801);
  assert.equal(closed.positions[0].proceeds, 9.801);
  const metrics = accountMetrics(closed, [market]);
  assert.equal(metrics.totalPnl, -0.199);
  assert.equal(metrics.realizedPnl, -0.199);
  assert.equal(metrics.unrealizedPnl, 0);
  assert.equal(metrics.feesPaid, 0.199);
  assert.equal(metrics.openPositions, 0);
  assert.equal(metrics.closedPositions, 1);
  assert.throws(() => paperClose(closed, market, closed.positions[0].id, now), /已经平仓/);
});

test('NO positions gain when YES price falls, while absent quotes cannot invent a profit', () => {
  const workspace = createDemoWorkspace('test-user');
  const market = { ...workspace.markets[0], probability: 0.6 };
  const account = paperBuy(workspace.account, market, 'NO', 10, now);
  assert.equal(account.positions[0].shares, 24.75);
  const marked = accountMetrics(account, [{ ...market, probability: 0.4 }]);
  assert.equal(marked.marketValue, 14.85);
  assert.equal(marked.totalPnl, 4.85);
  const unpriced = accountMetrics(account, []);
  assert.equal(unpriced.unpricedPositions, 1);
  assert.equal(unpriced.totalPnl, 0);
});

test('risk checks reject over-limit, missing, invalid, closed and stale live quotes', () => {
  const workspace = createDemoWorkspace('test-user');
  const market = workspace.markets[0];
  assert.throws(() => paperBuy(workspace.account, market, 'YES', 10.01, now), /单笔/);
  assert.throws(() => paperBuy({ ...workspace.account, cash: 1 }, market, 'YES', 2, now), /余额不足/);
  assert.throws(() => paperBuy(workspace.account, market, 'YES', NaN, now), /金额/);
  assert.throws(() => paperBuy(workspace.account, { ...market, status: 'closed' }, 'YES', 1, now), /已经关闭/);
  assert.throws(() => paperBuy(workspace.account, { ...market, probability: null }, 'YES', 1, now), /有效报价/);
  assert.throws(() => paperBuy(workspace.account, { ...market, probability: 1.1 }, 'YES', 1, now), /有效报价/);
  assert.throws(() => paperBuy(workspace.account, { ...market, probability: 0 }, 'YES', 1, now), /报价为零/);
  assert.throws(() => paperBuy(workspace.account, { ...market, synthetic: false, updatedAt: '2026-10-12T05:49:59Z' }, 'YES', 1, now), /10 分钟/);
  assert.throws(() => paperBuy(workspace.account, { ...market, synthetic: false, updatedAt: '2026-10-12T06:10:00Z' }, 'YES', 1, now), /10 分钟/);
  const fresh = paperBuy(workspace.account, { ...market, synthetic: false, updatedAt: now }, 'YES', 1, now);
  assert.equal(fresh.cash, 99);
});

test('close validates market ownership and live price freshness without losing the position', () => {
  const workspace = createDemoWorkspace('test-user');
  const market = { ...workspace.markets[0], synthetic: false, updatedAt: now };
  const account = paperBuy(workspace.account, market, 'YES', 10, now);
  assert.throws(() => paperClose(account, { ...market, id: 'different-market' }, account.positions[0].id, now), /不匹配/);
  assert.throws(() => paperClose(account, market, account.positions[0].id, '2026-10-12T06:11:00Z'), /10 分钟/);
  assert.equal(account.cash, 90);
  assert.equal(account.positions[0].closedAt, null);
});
