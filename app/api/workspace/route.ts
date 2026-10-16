import { getChatGPTUser } from '../../chatgpt-auth';
import { readWorkspace } from '../../../lib/workspace';
export const dynamic='force-dynamic';
export async function GET(){
  const user=await getChatGPTUser();
  if(!user)return Response.json({error:'请先使用 ChatGPT 登录。'},{status:401});
  try{return Response.json(await readWorkspace(user.userId,user.displayName),{headers:{'Cache-Control':'no-store'}});}
  catch(e){console.error('Workspace read failed',e instanceof Error?e.message:'unknown');return Response.json({error:'研究数据库暂时不可用，请稍后重试。'},{status:503});}
}
