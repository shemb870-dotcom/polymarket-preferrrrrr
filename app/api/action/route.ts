import { getChatGPTUser } from '../../chatgpt-auth';
import { act, RequestError } from '../../../lib/workspace';
export const dynamic='force-dynamic';
export async function POST(request:Request){
  const user=await getChatGPTUser();
  if(!user)return Response.json({error:'请先使用 ChatGPT 登录。'},{status:401});
  const origin=request.headers.get('origin');
  if(origin && origin!==new URL(request.url).origin)return Response.json({error:'拒绝跨站请求。'},{status:403});
  if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'请使用 JSON 请求。'},{status:415});
  try{
    const raw=await request.text();if(raw.length>30000)throw new RequestError('请求内容过长。',413);
    let input:unknown;try{input=JSON.parse(raw);}catch{throw new RequestError('JSON 格式不正确。');}
    return Response.json(await act(user.userId,user.displayName,input),{headers:{'Cache-Control':'no-store'}});
  }catch(e){
    if(e instanceof RequestError)return Response.json({error:e.message},{status:e.status});
    if(e instanceof Error && !/D1|SQLITE|database|binding/i.test(e.message))return Response.json({error:e.message},{status:400});
    console.error('Workspace action failed',e instanceof Error?e.message:'unknown');return Response.json({error:'数据保存暂时失败，请刷新后重试。'},{status:503});
  }
}
