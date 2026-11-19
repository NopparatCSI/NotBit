import {readFileSync,writeFileSync,mkdirSync,cpSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const directory=resolve('.runtime/acceptance');mkdirSync(resolve(directory,'supabase'),{recursive:true});
let config=readFileSync('supabase/config.toml','utf8').replace('project_id = "game-item-marketplace"','project_id = "notbit-acceptance"');
const ports={54321:54331,54322:54332,54320:54330,54329:54339,54323:54333,54324:54334,54327:54337};
config=config.replace(/\b543(?:20|21|22|23|24|27|29)\b/g,n=>String(ports[n])).replaceAll('localhost:3000','localhost:3201').replaceAll('127.0.0.1:3000','127.0.0.1:3201');
if(!config.includes('project_id = "notbit-acceptance"'))throw new Error('Unexpected database project configuration');
writeFileSync(resolve(directory,'supabase/config.toml'),config);
cpSync('supabase/migrations',resolve(directory,'supabase/migrations'),{recursive:true});cpSync('supabase/seed.sql',resolve(directory,'supabase/seed.sql'));
try{
  // CLI start/status output contains credentials. Never relay it to the terminal.
  execFileSync(process.execPath,[resolve('node_modules/supabase/dist/supabase.js'),'start','--workdir',directory,'--exclude','studio,postgres-meta,mailpit,edge-runtime,logflare,vector,supavisor'],{stdio:['ignore','pipe','pipe'],timeout:300000});
  // A restarted Hardhat chain may reuse the same contract address. Reset this
  // disposable database so an old checkpoint cannot be mistaken for that chain.
  const written=readFileSync(resolve(directory,'supabase/config.toml'),'utf8');
  if(!written.includes('project_id = "notbit-acceptance"')||!written.includes('port = 54332')||!directory.endsWith(resolve('.runtime/acceptance')))throw new Error('Acceptance reset guard failed');
  execFileSync(process.execPath,[resolve('node_modules/supabase/dist/supabase.js'),'db','reset','--local','--workdir',directory],{stdio:['ignore','pipe','pipe'],timeout:300000});
  console.log('Separate acceptance Supabase reset and ready on API 54331 / database 54332.');
}catch{throw new Error('Acceptance Supabase could not start. Check Docker and ports 54330–54339; credential output withheld.');}
