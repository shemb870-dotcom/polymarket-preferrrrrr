import type { BookSnapshot } from './clob';
export type Mode = 'demo' | 'live';
export type Evidence = { id: string; title: string; url: string; claim: string; stance: 'yes' | 'no' | 'neutral'; publishedAt: string; addedAt: string; verified: boolean };
export type AIAnalysis = { model: string; responseId: string; promptVersion: string; low: number|null; high: number|null; abstain: boolean; baseRate: string; invalidation: string; ruleHash: string; sources: {title:string;url:string;claim:string;publishedAt:string;stance:'yes'|'no'|'neutral'}[]; inputTokens:number; outputTokens:number };
export type ResearchReport = { id: string; createdAt: string; title: string; summary: string; supporting: string[]; opposing: string[]; missing: string[]; nextSteps: string[]; probability: number | null; methodology: string; evidenceIds: string[]; ai?: AIAnalysis; chat?: Pick<AIAnalysis,'low'|'high'|'abstain'|'baseRate'|'invalidation'|'ruleHash'|'sources'> & {savedAt:string}; snapshot?: { rules: string; resolutionSource: string; endsAt: string; marketProbability: number | null; quoteUpdatedAt: string; evidence: Evidence[] } };
export type Market = { id: string; slug: string; question: string; category: string; rules: string; resolutionSource: string; probability: number | null; changePp: number; volume: number; liquidity: number; updatedAt: string; endsAt: string; status: 'active' | 'closed'; synthetic: boolean; watched: boolean; history: { at: string; p: number }[]; evidence: Evidence[]; reports: ResearchReport[]; baseline: number | null; ruleHash: string; tokenIds: { yes: string; no: string } | null; book?: BookSnapshot | null };
export type Alert = { id: string; marketId: string; title: string; message: string; kind: 'price' | 'rules' | 'quality'; createdAt: string; read: boolean };
export type Position = { id: string; marketId: string; question: string; side: 'YES' | 'NO'; shares: number; entryPrice: number; cost: number; fee: number; openedAt: string; closedAt: string | null; proceeds: number | null; exitPrice: number | null };
export type Account = { startingBalance: number; cash: number; feeRate: number; maxTrade: number; positions: Position[] };
export type Workspace = { version: number; mode: Mode; markets: Market[]; alerts: Alert[]; settings: { thresholdPp: number; pollSeconds: number; aiAuto?:boolean }; aiUsage?:{day:string;attempts:number;lastAttempt:string;busyUntil:string;jobId:string;message:string}; account: Account; health: { status: 'demo' | 'ok' | 'error' | 'idle'; message: string; checkedAt: string | null }; user: string };
export type Action =
 | { type: 'toggle_watch'; id: string }
 | { type: 'add_market'; slug: string }
 | { type: 'add_evidence'; marketId: string; title: string; url: string; claim: string; stance: 'yes' | 'no' | 'neutral'; publishedAt?: string }
 | { type: 'analyze'; id: string }
 | { type: 'ai_analyze'; id?:string; automatic?:boolean }
 | { type: 'ai_settings'; enabled:boolean }
 | { type: 'refresh' }
 | { type: 'refresh_books' }
 | { type: 'mark_read'; id: string }
 | { type: 'settings'; thresholdPp: number; pollSeconds: number }
 | { type: 'set_mode'; mode: Mode }
 | { type: 'reset_demo' }
 | { type: 'paper_buy'; marketId: string; side: 'YES' | 'NO'; amount: number }
 | { type: 'paper_close'; id: string };
