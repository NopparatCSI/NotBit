import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, openSync } from 'node:fs';
import { resolve } from 'node:path';
const state=JSON.parse(readFileSync('.runtime/acceptance/state.json','utf8'));
const {indexerSecret}=JSON.parse(readFileSync('.runtime/acceptance/credentials.json','utf8'));
if(state.appUrl!=='http://localhost:3201')throw new Error('Local acceptance app required');
const log=openSync('.runtime/acceptance/managed-app.log','a');let child;
async function start(){
  child=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3201'],{cwd:resolve('.runtime/acceptance/app'),stdio:['ignore',log,log],windowsHide:true});
  for(let n=0;n<60;n++){
    if(child.exitCode!==null)throw new Error('Acceptance app stopped');
    try{const r=await fetch(state.appUrl+'/api/v1/me',{signal:AbortSignal.timeout(1000)});if(r.status===401)return;}catch{}
    await new Promise(r=>setTimeout(r,500));
  }throw new Error('Acceptance app startup timed out');
}
async function stop(){if(child&&child.exitCode===null){const ended=new Promise(r=>child.once('exit',r));child.kill();await ended;}}
await start();let restarting=false;
const control=createServer(async(req,res)=>{
  if(req.headers.authorization!==`Bearer ${indexerSecret}`){res.writeHead(403).end();return;}
  if(req.method==='POST'&&req.url==='/restart'){
    if(restarting){res.writeHead(409).end();return;}
    restarting=true;try{await stop();await start();res.setHeader('Content-Type','application/json');res.end(JSON.stringify({restarted:true,pid:child.pid}));}catch{res.writeHead(503).end();}finally{restarting=false;}
  }else{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({pid:child.pid}));}
}).listen(3202,'127.0.0.1',()=>console.log('Acceptance app ready; local-only authenticated restart control on 3202.'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{control.close();await stop();process.exit(0);});
