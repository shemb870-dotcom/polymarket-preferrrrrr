import { env } from 'cloudflare:workers';
export function aiConfig(){
  const vars=env as unknown as Record<string,unknown>;
  const key=typeof vars.OPENAI_API_KEY==='string'?vars.OPENAI_API_KEY:'';
  const model=typeof vars.OPENAI_MODEL==='string'&&vars.OPENAI_MODEL.trim()?vars.OPENAI_MODEL.trim():'gpt-5.4';
  return {key,model,dailyLimit:3};
}
