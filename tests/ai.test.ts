import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoWorkspace } from '../lib/demo.ts';
import { parseAIResponse,requestBody,runAIResearch } from '../lib/ai-research.ts';
import { aiDue,opportunities } from '../lib/opportunities.ts';
const now='2026-10-13T12:00:00.000Z';
function market(){return {...createDemoWorkspace('test').markets[0],synthetic:false,updatedAt:now,endsAt:'2026-12-01T00:00:00Z',probability:0.4,watched:true};}
function withBook(m:any){const side=(ask:number)=>({bestBid:ask-0.01,bestAsk:ask,spread:0.01,execAsk:ask,execShares:25,fullyFilled:true,fetchedAt:now});return {...m,book:{yes:side(0.4),no:side(0.6),fetchedAt:now}};}
function response(overrides:Record<string,unknown>={}){
 const f={summary:'研究结论',supporting:['支持 [1]'],opposing:['反对 [2]'],missing:[],nextSteps:['核验'],probability:0.6,low:0.5,high:0.7,abstain:false,baseRate:'暂无可比案例',invalidation:'新决议',sources:[{title:'一',url:'https://one.example/a',claim:'来源一',publishedAt:'2026-10-12',stance:'yes'},{title:'二',url:'https://two.example/b',claim:'来源二',publishedAt:'',stance:'no'}],...overrides};
 return {id:'response-test',status:'completed',output:[{type:'web_search_call',action:{sources:[{url:'https://one.example/a'},{url:'https://two.example/b'}]}},{type:'message',content:[{type:'output_text',text:JSON.stringify(f)}]}],usage:{input_tokens:100,output_tokens:200}};
}
test('AI validates provenance, keeps timestamped snapshots and never sends quote as model input',()=>{
 const m=market(),r=parseAIResponse(response(),m,'test',now);
 assert.equal(r.probability,0.6);assert.equal(r.snapshot?.marketProbability,0.4);assert.equal(r.ai?.sources.length,2);
 const input=JSON.parse(requestBody(m,'test',now).input);
 assert.equal('probability' in input,false);assert.equal('history' in input,false);
});
test('unretrieved citations, incomplete responses and future evidence are rejected',()=>{
 assert.throws(()=>parseAIResponse(response({sources:[{title:'假',url:'https://fake.example',claim:'无',publishedAt:'',stance:'yes'}]}),market(),'test',now),/未出现在检索/);
 assert.throws(()=>parseAIResponse({...response(),status:'incomplete'},market(),'test',now));
 assert.throws(()=>parseAIResponse(response({sources:[{title:'未来',url:'https://one.example/a',claim:'无',publishedAt:'2027-01-01',stance:'yes'}]}),market(),'test',now),/晚于/);
});
test('bad intervals and explicit abstentions cannot create actionable forecasts',()=>{
 assert.equal(parseAIResponse(response({low:0.8}),market(),'test',now).probability,null);
 assert.equal(parseAIResponse(response({abstain:true}),market(),'test',now).probability,null);
 assert.equal(parseAIResponse(response({sources:[]}),market(),'test',now).ai?.abstain,true);
});
test('NO bounds reverse correctly and costs reduce conservative scenario value',()=>{
 const m=market();m.reports=[parseAIResponse(response(),m,'test',now)];
 const [yes,no]=opportunities([withBook(m)],0.02,Date.parse(now));
 assert.ok(Math.abs(yes.conservativeEv!-0.08)<1e-9);
 assert.ok(Math.abs(no.low!-0.3)<1e-9);assert.equal(no.high,0.5);
 assert.ok(Math.abs(no.conservativeEv!+0.32)<1e-9);
 assert.equal(yes.odds,2.5);
});
test('stale, changed rules, fictional events and new evidence never produce a candidate',()=>{
 const m=market();m.reports=[parseAIResponse(response(),m,'test',now)];
 for(const changed of [{...m,updatedAt:'2026-10-12T00:00:00Z'},{...m,ruleHash:'changed'},{...m,synthetic:true},{...m,status:'closed' as const}])assert.equal(opportunities([changed],0.02,Date.parse(now))[0].ev,null);
 assert.throws(()=>opportunities([m],NaN),/成本/);
 assert.equal(aiDue(m,Date.parse(now)+1000),false);
 assert.equal(aiDue({...m,updatedAt:new Date(Date.parse(now)+21601000).toISOString()},Date.parse(now)+21601000),true);
});
test('provider errors do not expose bodies or credentials and never retry',async()=>{
 let calls=0;
 const fetcher=(async()=>{calls++;return new Response('secret provider error',{status:401});}) as typeof fetch;
 await assert.rejects(runAIResearch(market(),'secret-key','test',now,fetcher),/HTTP 401/);
 assert.equal(calls,1);
 await assert.rejects(runAIResearch({...market(),synthetic:true},'secret','test',now,fetcher),/演示/);
 assert.equal(calls,1);
});
