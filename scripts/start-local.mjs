import './sites-env.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';

function run(args) {
  const result=spawnSync(process.execPath,args,{stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
}
if(Number(process.versions.node.split('.')[0])<22)throw new Error('Please install Node.js >=22.13.');
if(!existsSync('node_modules/vinext/dist/cli.js')){
  const npm=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
  if(!existsSync(npm))throw new Error('npm is unavailable. Install Node.js LTS, then run npm run install:ci.');
  run([npm,'run','install:ci']);
}
if(!existsSync('dist/server/wrangler.json'))run(['scripts/run-framework.mjs','build']);
// Idempotent creation for the initial schema; never reset existing local records.
const sql=readFileSync('drizzle/0000_wet_hiroim.sql','utf8').replaceAll('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS ');
run(['--import','./scripts/sites-env.mjs','node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--command',sql]);
console.log('\nStarting Event Mirror. Open the Local URL below. Keep this window open; Ctrl+C stops it.\n');
const child=spawn(process.execPath,['scripts/run-framework.mjs','dev'],{stdio:'inherit'});
child.on('error',e=>{console.error(e.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code||0;});
process.on('SIGINT',()=>child.kill('SIGINT'));
