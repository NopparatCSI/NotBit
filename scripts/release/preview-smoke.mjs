import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {createServerClient} from '@supabase/ssr';
import {privateKeyToAccount} from 'viem/accounts';
import {createSiweMessage,generateSiweNonce} from 'viem/siwe';
import {readReleaseEnvironment,validateReleaseEnvironment} from './environment.mjs';

let browser;
const authClients=[];
try{
 const env=readReleaseEnvironment();assert.deepEqual(validateReleaseEnvironment(env),[]);
 const origin=new URL(env.INDEXER_SCHEDULE_URL).origin;
 assert.equal(origin,'https://notbit-preview-nopparatcsi.vercel.app');
 assert.ok(env.VERCEL_AUTOMATION_BYPASS_SECRET);
 const root=Object.assign({},...['.env','.env.local'].filter(existsSync).map(f=>parseEnv(readFileSync(f,'utf8'))));
 const keys=JSON.parse(readFileSync('.runtime/acceptance/sepolia-wallets.json','utf8'));
 const demo=JSON.parse(readFileSync('.runtime/release/demo-state.json','utf8'));
 const accountKeys={buyer:keys.buyer,seller:keys.seller,admin:root.SEPOLIA_ADMIN_PRIVATE_KEY,superAdmin:root.SEPOLIA_SUPER_ADMIN_PRIVATE_KEY};
 process.env.PLAYWRIGHT_BROWSERS_PATH=resolve('.runtime/playwright-browsers');
 browser=await chromium.launch({channel:'chromium',headless:true});
 const assets=new Set(),results=[];
 const serverSecrets=Object.entries(env).filter(([k,v])=>/PRIVATE_KEY|SECRET/.test(k)&&v.length>=32);
 for(const person of ['anonymous','buyer','seller','admin','superAdmin']){
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.route(origin+'/**',r=>r.continue({headers:{...r.request().headers(),'x-vercel-protection-bypass':env.VERCEL_AUTOMATION_BYPASS_SECRET}}));
  if(person!=='anonymous'){
   const jar=new Map(),auth=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});
   authClients.push(auth);
   const account=privateKeyToAccount(accountKeys[person]);
   const message=createSiweMessage({domain:new URL(origin).host,uri:origin,address:account.address,chainId:11155111,version:'1',nonce:generateSiweNonce(),statement:'Authorized Preview rendering check; wallet signatures supplied by Node.'});
   const signed=await auth.auth.signInWithWeb3({chain:'ethereum',message,signature:await account.signMessage({message})});assert.equal(signed.error,null);
   await context.addCookies([...jar].map(([name,value])=>({name,value,url:origin,secure:true,sameSite:'Lax'})));
  }
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('response',r=>{const u=new URL(r.url());if(u.origin===origin&&u.pathname.endsWith('.js'))assets.add(r.url());});
  const room=demo.deals['normal-receipt'].conversationId;
  const paths=person==='anonymous'?['/','/account']:person==='admin'?['/admin','/admin/orders/'+demo.deals['open-review'].offer.id,'/admin/history']:person==='superAdmin'?['/admin/super']:person==='seller'?['/sell','/trade/'+room]:['/account','/buy','/trade/'+room];
  for(const path of paths){
   const response=await page.goto(origin+path,{waitUntil:'networkidle',timeout:45000});assert.equal(response.status(),200,`${person} ${path}`);
   await page.locator('h1').first().waitFor();
   const body=await page.locator('body').innerText();assert.ok(!body.includes('Could not load the review queue'));
   if(person!=='anonymous'&&path==='/account')await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();
   if(path.startsWith('/trade/')){
    await page.getByRole('tab',{name:'Evidence',exact:true}).click();
    await page.getByText('RELEASED',{exact:true}).first().waitFor({timeout:25000});
   }
   if(path==='/admin')assert.ok(body.includes('DEMO open-review'),'Cloud queue must show the real pending dispute.');
   results.push({person,path,status:response.status(),clientErrorCount:errors.length});assert.equal(errors.length,0,`Client errors on ${person} ${path}; details withheld.`);
  }
  if(person==='admin')await page.screenshot({path:'.runtime/release/preview-admin.png',fullPage:true});
  await context.close();
 }
 for(const url of assets){
  const response=await fetch(url,{headers:{'x-vercel-protection-bypass':env.VERCEL_AUTOMATION_BYPASS_SECRET},redirect:'error'});assert.ok(response.ok);
  const js=await response.text();for(const [name,value]of serverSecrets)assert.ok(!js.includes(value),`${name} appeared in a client asset.`);
 }
 const summary={origin,results,checkedClientAssets:assets.size,secretLeaks:0,authentication:'Node SIWE sessions; no MetaMask signing claimed'};
 writeFileSync('.runtime/release/preview-browser-results.json',JSON.stringify(summary,null,2));
 console.log(JSON.stringify(summary));
}catch(error){console.error('Preview browser check failed: '+String(error?.message??'Unknown failure').replace(/https?:\/\/\S+/g,'[endpoint]').replace(/0x[0-9a-fA-F]{64,}/g,'[hex]').slice(0,400));process.exitCode=1;}
finally{for(const auth of authClients)await auth.auth.signOut({scope:'local'}).catch(()=>{});await browser?.close();}
