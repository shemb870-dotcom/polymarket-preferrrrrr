import { getChatGPTUser } from '../../chatgpt-auth';
import { aiConfig } from '../../../lib/ai-config';
export const dynamic='force-dynamic';
export async function GET(){
  if(!await getChatGPTUser())return Response.json({error:'请先登录。'},{status:401});
  const {key,model,dailyLimit}=aiConfig();
  return Response.json({configured:!!key,model,dailyLimit,message:key?'服务端密钥已配置；首次成功生成报告后才能确认调用可用。':'尚未配置模型密钥。请通过 OpenAI Developers 安全连接 API。'},{headers:{'Cache-Control':'no-store'}});
}
