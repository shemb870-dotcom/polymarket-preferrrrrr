import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOK_TTL_MS, bookFresh, extractTokenIds, fillPrice, parseBookResponse, summarizeSide } from '../lib/clob.ts';
import { normalizeMarket } from '../lib/markets.ts';
import { opportunities } from '../lib/opportunities.ts';
import { createDemoWorkspace } from '../lib/demo.ts';

const now = '2026-10-13T12:00:00.000Z';
const NOW_MS = Date.parse(now);
const YES_ID = '32338220190071351435772801779725302244575775216413325951443816017994629993401';
const NO_ID = '25659310674993675562345759665114759892400026242514633218387667107987341231962';

test('token mapping follows outcome order instead of a fixed position', () => {
  const base = { outcomes: '["No","Yes"]', clobTokenIds: `["${NO_ID}","${YES_ID}"]` };
  assert.deepEqual(extractTokenIds(base), { yes: YES_ID, no: NO_ID });
  assert.deepEqual(extractTokenIds({ outcomes: '["Yes","No"]', clobTokenIds: `["${YES_ID}","${NO_ID}"]` }), { yes: YES_ID, no: NO_ID });
  assert.deepEqual(extractTokenIds({ outcomes: '["YES","NO"]', clobTokenIds: `["${YES_ID}","${NO_ID}"]` }), { yes: YES_ID, no: NO_ID });
  assert.equal(extractTokenIds({ outcomes: '["Yes","No"]' }), null);
  assert.equal(extractTokenIds({ outcomes: '["Yes","No"]', clobTokenIds: `["${YES_ID}"]` }), null);
  assert.equal(extractTokenIds({ outcomes: '["Yes","No"]', clobTokenIds: '["abc","def"]' }), null);
  assert.equal(extractTokenIds({ outcomes: '["A","B"]', clobTokenIds: `["${YES_ID}","${NO_ID}"]` }), null);
});

test('book parser sorts levels, drops invalid entries and keeps server timestamp', () => {
  const book = parseBookResponse({
    timestamp: '1792218125000',
    bids: [{ price: '0.4', size: '10' }, { price: '0.5', size: '5' }, { price: 'bad', size: '1' }, { price: '0.3', size: '-2' }],
    asks: [{ price: '0.7', size: '8' }, { price: '0.6', size: '4' }, { price: '1.5', size: '4' }],
  }, YES_ID, now);
  assert.deepEqual(book.bids.map(b => b.price), [0.5, 0.4]);
  assert.deepEqual(book.asks.map(a => a.price), [0.6, 0.7]);
  assert.equal(book.serverTs, '1792218125000');
  assert.throws(() => parseBookResponse(null, YES_ID, now), /格式/);
  const empty = parseBookResponse([], YES_ID, now);
  assert.deepEqual(empty.bids, []); assert.deepEqual(empty.asks, []);
});

test('depth walk computes executable price and reports thin books honestly', () => {
  const asks = [{ price: 0.5, size: 10 }, { price: 0.6, size: 10 }];
  const full = fillPrice(asks, 10)!;
  assert.equal(full.filled, true);
  assert.ok(Math.abs(full.vwap - 10 / (10 + 25 / 3)) < 1e-9);
  const thin = fillPrice(asks, 100)!;
  assert.equal(thin.filled, false);
  assert.ok(Math.abs(thin.shares - 20) < 1e-9);
  assert.equal(fillPrice([], 10), null);
  assert.equal(fillPrice(asks, 0), null);
  const side = summarizeSide({ tokenId: YES_ID, bids: [{ price: 0.48, size: 10 }], asks, fetchedAt: now, serverTs: '' });
  assert.equal(side.bestBid, 0.48);
  assert.equal(side.bestAsk, 0.5);
  assert.ok(Math.abs(side.spread! - 0.02) < 1e-9);
  assert.equal(side.fullyFilled, true);
});

test('book freshness uses a 10-minute TTL with small future tolerance', () => {
  assert.equal(bookFresh(now, NOW_MS), true);
  assert.equal(bookFresh(new Date(NOW_MS - BOOK_TTL_MS + 1000).toISOString(), NOW_MS), true);
  assert.equal(bookFresh(new Date(NOW_MS - BOOK_TTL_MS - 1000).toISOString(), NOW_MS), false);
  assert.equal(bookFresh(new Date(NOW_MS + 30000).toISOString(), NOW_MS), true);
  assert.equal(bookFresh('not-a-date', NOW_MS), false);
});

test('normalizeMarket keeps verified token ids for live markets', () => {
  const m = normalizeMarket({
    id: '42', slug: 's', question: 'Q?', outcomes: '["No","Yes"]', outcomePrices: '["0.6","0.4"]',
    clobTokenIds: `["${NO_ID}","${YES_ID}"]`, description: 'r', resolutionSource: 'src',
    endDate: '2026-12-01T00:00:00Z', updatedAt: now, active: true, closed: false,
  }, now)!;
  assert.deepEqual(m.tokenIds, { yes: YES_ID, no: NO_ID });
  assert.equal(m.book, null);
  assert.equal(normalizeMarket({ id: '43', slug: 's2', question: 'Q2?', outcomes: '["Yes","No"]', outcomePrices: '["0.4","0.6"]', description: 'r', resolutionSource: 'src', endDate: '2026-12-01T00:00:00Z', updatedAt: now, active: true, closed: false }, now)!.tokenIds, null);
});

function liveMarket() {
  const m: any = { ...createDemoWorkspace('test').markets[0], synthetic: false, watched: true, updatedAt: now, endsAt: '2026-12-01T00:00:00Z', probability: 0.4, liquidity: 1000 };
  m.reports = [{
    id: 'r1', createdAt: now, title: 't', summary: 's', supporting: [], opposing: [], missing: [], nextSteps: [],
    probability: 0.6, methodology: 'm', evidenceIds: [],
    ai: { model: 'x', responseId: 'y', promptVersion: 'v', low: 0.5, high: 0.7, abstain: false, baseRate: '', invalidation: '', ruleHash: m.ruleHash, sources: [], inputTokens: 0, outputTokens: 0 },
  }];
  return m;
}
function freshBook(execAskYes: number, execAskNo: number, at = now) {
  const side = (ask: number) => ({ bestBid: ask - 0.01, bestAsk: ask, spread: 0.01, execAsk: ask, execShares: 25, fullyFilled: true, fetchedAt: at });
  return { yes: side(execAskYes), no: side(execAskNo), fetchedAt: at };
}

test('opportunities prefers the executable book ask and fails closed without it', () => {
  const withBook = { ...liveMarket(), book: freshBook(0.42, 0.58) };
  const [yes, no] = opportunities([withBook], 0.02, NOW_MS) as any[];
  assert.equal(yes.priceSource, 'book');
  assert.ok(Math.abs(yes.price - 0.42) < 1e-9);
  assert.ok(Math.abs(yes.conservativeEv - (0.5 - 0.42 - 0.02)) < 1e-9);
  assert.ok(Math.abs(no.price - 0.58) < 1e-9);
  assert.deepEqual(yes.blockers, []);

  const missing = opportunities([liveMarket()], 0.02, NOW_MS)[0] as any;
  assert.equal(missing.priceSource, 'indicative');
  assert.ok(missing.blockers.some((b: string) => b.includes('盘口缺失或过期')));
  assert.equal(missing.ev, null);

  const staleAt = new Date(NOW_MS - BOOK_TTL_MS - 60000).toISOString();
  const stale = opportunities([{ ...liveMarket(), book: freshBook(0.42, 0.58, staleAt) }], 0.02, NOW_MS)[0] as any;
  assert.ok(stale.blockers.some((b: string) => b.includes('盘口缺失或过期')));
  assert.equal(stale.ev, null);
});

test('thin books are blocked instead of presented as executable', () => {
  const book = freshBook(0.42, 0.58);
  book.yes = { ...book.yes, fullyFilled: false };
  const [yes] = opportunities([{ ...liveMarket(), book }], 0.02, NOW_MS) as any[];
  assert.ok(yes.blockers.some((b: string) => b.includes('盘口深度不足')));
  assert.equal(yes.ev, null);
});
