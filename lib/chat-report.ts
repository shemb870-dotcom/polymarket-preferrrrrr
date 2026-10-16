import { z } from 'zod';
import type { Market, ResearchReport } from './types.ts';
const line=z.string().trim().min(1).max(4000),lines=z.array(line).max(12);
const p=z.number().finite().min(0).max(1).nullable();
export const chatReportSchema=z.object({requestId:z.string().uuid(),marketId:z.string().min(1).max(250),ruleHash:z.string().max(25000),analyzedAt:z.string().datetime(),title:z.string().trim().min(1).max(200),summary:line,supporting:lines,opposing:lines,missing:lines,nextSteps:lines,probability:p,low:p,high:p,baseRate:line,invalidation:line,sources:z.array(z.object({title:z.string().min(1).max(200),url:z.string().url().max(2000).refine(v=>{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;},'来源必须是无凭据的 HTTPS 链接'),claim:line,publishedAt:z.string().max(50),stance:z.enum(['yes','no','neutral'])})).max(12)}).strict();
export type ChatReportInput=z.infer<typeof chatReportSchema>;
export function buildChatReport(m:Market,input:unknown,now=new Date().toISOString()):ResearchReport{
 const f=chatReportSchema.parse(input);
 if(f.marketId!==m.id||f.ruleHash!==m.ruleHash)throw new Error('市场或结算规则已变化，请重新读取后审阅。');
 if(Date.parse(f.analyzedAt)>Date.parse(now))throw new Error('判断时间不能在未来。');
 if(f.sources.some(s=>s.publishedAt&&(!Number.isFinite(Date.parse(s.publishedAt))||Date.parse(s.publishedAt)>Date.parse(f.analyzedAt))))throw new Error('来源日期无效或晚于判断时间。');
 if(f.probability===null?(f.low!==null||f.high!==null):(f.low===null||f.high===null||f.low>f.probability||f.high<f.probability))throw new Error('概率区间无效；弃权时三项均须为 null。');
 if(f.probability!==null&&(!m.rules.trim()||!m.resolutionSource.trim()||!f.supporting.length||!f.opposing.length||f.sources.length<2))throw new Error('概率估计需要完整规则、正反论据及至少两条来源；不足时请弃权。');
 return {id:`chat-${f.requestId}`,createdAt:f.analyzedAt,title:f.title,summary:f.summary,supporting:f.supporting,opposing:f.opposing,missing:f.missing,nextSteps:f.nextSteps,probability:f.probability,evidenceIds:m.evidence.map(e=>e.id),methodology:'聊天助手提交的研究报告；本站未调用模型 API，未自动抓取或核实所列来源。概率为未校准主观估计。市场快照记录保存时数据，不构成历史回测。',chat:{low:f.low,high:f.high,abstain:f.probability===null,baseRate:f.baseRate,invalidation:f.invalidation,ruleHash:m.ruleHash,sources:f.sources,savedAt:now},snapshot:{rules:m.rules,resolutionSource:m.resolutionSource,endsAt:m.endsAt,marketProbability:m.probability,quoteUpdatedAt:m.updatedAt,evidence:structuredClone(m.evidence)}};
}
const string={type:'string'},nullable={type:['number','null'],minimum:0,maximum:1},array={type:'array',items:string,maxItems:12};
const sourceProps={title:string,url:string,claim:string,publishedAt:string,stance:{type:'string',enum:['yes','no','neutral']}};
const props={requestId:{type:'string',format:'uuid'},marketId:string,ruleHash:string,analyzedAt:{type:'string',format:'date-time'},title:string,summary:string,supporting:array,opposing:array,missing:array,nextSteps:array,probability:nullable,low:nullable,high:nullable,baseRate:string,invalidation:string,sources:{type:'array',maxItems:12,items:{type:'object',properties:sourceProps,required:Object.keys(sourceProps),additionalProperties:false}}};
export const chatReportJsonSchema={type:'object',properties:props,required:Object.keys(props),additionalProperties:false};
