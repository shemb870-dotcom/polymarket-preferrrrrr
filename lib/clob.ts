// CLOB 公开盘口（只读）：https://clob.polymarket.com 的免 key 公开接口。
// 方法论参考公开资料：0106ss/polymarket-market-scanner（按深度行走的可执行价、
// 费用未知时 fail-closed）与 nanare-sudo/kalshi-polymarket-spreads
// （可执行价不等于中间价，价差要走真实盘口、扣掉费用才有意义）。
// 本文件不包含任何交易、签名或钱包代码；所有数字均为快照，不承诺可成交。

export const CLOB = 'https://clob.polymarket.com';
/** 盘口快照有效期：10 分钟，与 Gamma 指示价的有效期一致。 */
export const BOOK_TTL_MS = 10 * 60 * 1000;
/** 深度行走的参考名义金额（美元），与模拟账户单笔上限一致。 */
export const BOOK_REF_NOTIONAL_USD = 10;

export type Level = { price: number; size: number };
export type Book = {
  tokenId: string;
  bids: Level[];
  asks: Level[];
  fetchedAt: string;
  /** CLOB 服务端时间戳（毫秒 epoch 字符串），缺失时为空字符串。 */
  serverTs: string;
};
export type SideBook = {
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  /** 参考名义金额下按深度行走的可执行卖价（买入价）。 */
  execAsk: number | null;
  execShares: number;
  fullyFilled: boolean;
  fetchedAt: string;
};
export type BookSnapshot = { yes: SideBook | null; no: SideBook | null; fetchedAt: string };

type Raw = Record<string, unknown>;
function list(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  try { const p = JSON.parse(typeof v === 'string' ? v : ''); return Array.isArray(p) ? p : []; } catch { return []; }
}
const isTokenId = (v: unknown): v is string => typeof v === 'string' && /^[0-9]{8,}$/.test(v);

/**
 * 从 Gamma 原始市场数据中按 outcome 位置验证 YES/NO → tokenId 映射。
 * 不假设 token 数组的固定顺序：按 outcomes 数组里 'yes'/'no' 的下标取值。
 */
export function extractTokenIds(raw: Raw): { yes: string; no: string } | null {
  const outcomes = list(raw.outcomes).map(v => String(v).toLowerCase());
  const ids = list(raw.clobTokenIds);
  if (outcomes.length !== 2) return null;
  const yi = outcomes.indexOf('yes'), ni = outcomes.indexOf('no');
  if (yi < 0 || ni < 0 || yi === ni) return null;
  const yes = ids[yi], no = ids[ni];
  if (!isTokenId(yes) || !isTokenId(no)) return null;
  return { yes, no };
}

function toLevel(v: unknown): Level | null {
  if (!v || typeof v !== 'object') return null;
  const price = Number((v as Raw).price), size = Number((v as Raw).size);
  if (!Number.isFinite(price) || !Number.isFinite(size) || price <= 0 || price >= 1 || size <= 0) return null;
  return { price, size };
}

/** 纯函数：解析 /book 响应。档位不保证有序，这里一律重排；非法档位丢弃。 */
export function parseBookResponse(json: unknown, tokenId: string, fetchedAt: string): Book {
  if (!json || typeof json !== 'object') throw new Error('盘口数据格式不受支持。');
  const raw = json as Raw;
  const bids = list(raw.bids).map(toLevel).filter((l): l is Level => l !== null).sort((a, b) => b.price - a.price);
  const asks = list(raw.asks).map(toLevel).filter((l): l is Level => l !== null).sort((a, b) => a.price - b.price);
  const ts = typeof raw.timestamp === 'string' && /^[0-9]{10,}$/.test(raw.timestamp) ? raw.timestamp : '';
  return { tokenId, bids, asks, fetchedAt, serverTs: ts };
}

async function clobGet(path: string): Promise<unknown> {
  const res = await fetch(`${CLOB}${path}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (res.status === 451) throw new Error('Polymarket 返回 HTTP 451：该数据在当前服务区域不可用。不会绕过访问限制。');
  if (!res.ok) throw new Error(`CLOB 盘口请求失败（HTTP ${res.status}）。旧快照已保留，不伪造行情。`);
  return res.json();
}

/** 拉取单个 token 的公开盘口（免 key，只读）。失败时抛错，由调用方按 fail-closed 处理。 */
export async function fetchBook(tokenId: string, fetchedAt = new Date().toISOString()): Promise<Book> {
  if (!isTokenId(tokenId)) throw new Error('盘口 token 格式无效。');
  return parseBookResponse(await clobGet(`/book?token_id=${tokenId}`), tokenId, fetchedAt);
}

/**
 * 按卖盘深度行走：用 budgetUsd 美元按最优卖价逐档吃掉，返回成交量加权均价。
 * 吃不完返回 filled=false；无卖盘或预算无效返回 null。
 */
export function fillPrice(asks: Level[], budgetUsd: number): { vwap: number; shares: number; filled: boolean } | null {
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0 || !asks.length) return null;
  let remaining = budgetUsd, shares = 0, cost = 0;
  for (const level of asks) {
    if (remaining <= 0) break;
    const take = Math.min(remaining / level.price, level.size);
    if (take <= 0) continue;
    shares += take; cost += take * level.price; remaining -= take * level.price;
  }
  if (shares <= 0) return null;
  return { vwap: cost / shares, shares, filled: remaining <= 1e-9 };
}

/** 把一侧盘口汇总为 UI 与筛选可用的快照。 */
export function summarizeSide(book: Book, notionalUsd = BOOK_REF_NOTIONAL_USD): SideBook {
  const bestBid = book.bids.length ? book.bids[0].price : null;
  const bestAsk = book.asks.length ? book.asks[0].price : null;
  const fill = fillPrice(book.asks, notionalUsd);
  return {
    bestBid, bestAsk,
    spread: bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null,
    execAsk: fill ? fill.vwap : null,
    execShares: fill ? fill.shares : 0,
    fullyFilled: fill ? fill.filled : false,
    fetchedAt: book.fetchedAt,
  };
}

/** 拉取 YES/NO 双侧盘口并汇总。任一侧失败则该侧为 null（调用方按 fail-closed 处理）。 */
export async function fetchBookSnapshot(tokenIds: { yes: string; no: string }, fetchedAt = new Date().toISOString()): Promise<BookSnapshot> {
  const [yes, no] = await Promise.all([
    fetchBook(tokenIds.yes, fetchedAt).then(b => summarizeSide(b), () => null),
    fetchBook(tokenIds.no, fetchedAt).then(b => summarizeSide(b), () => null),
  ]);
  return { yes, no, fetchedAt };
}

/** 快照是否在有效期内。允许 60 秒的未来时钟偏差。 */
export function bookFresh(fetchedAt: string, now = Date.now()): boolean {
  const age = now - Date.parse(fetchedAt);
  return Number.isFinite(age) && age >= -60000 && age <= BOOK_TTL_MS;
}
