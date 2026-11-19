import assert from "node:assert/strict";
import {readFileSync,writeFileSync,appendFileSync,existsSync} from "node:fs";
import {parseEnv} from "node:util";
import {createServerClient} from "@supabase/ssr";
import {createClient} from "@supabase/supabase-js";
import {createPublicClient,createWalletClient,http,keccak256,type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {createSiweMessage,generateSiweNonce} from "viem/siwe";
import {sepolia} from "viem/chains";
import sharp from "sharp";
import {escrowAbi,toChainId,hashAgreement,orderStatuses,viewerSchema} from "@marketplace/shared";
import {offerTypedData,type Offer} from "../../src/lib/offers/model";
import {readReleaseEnvironment,validateReleaseEnvironment} from "../../scripts/release/environment.mjs";

if(process.env.PREVIEW_ACCEPTANCE!=="1")throw new Error("PREVIEW_ACCEPTANCE=1 is required for online testnet acceptance.");
export const env=readReleaseEnvironment() as Record<string,string>&{SEPOLIA_TREASURY_ADDRESS:Hex};
assert.deepEqual(validateReleaseEnvironment(env),[]);
export const origin=new URL(env.INDEXER_SCHEDULE_URL).origin;
assert.ok(['https://notbit-7n2v2lrq5-nopparatcsis-projects.vercel.app','https://notbit-preview-nopparatcsi.vercel.app'].includes(origin),'Use the reviewed Preview origin.');
assert.equal(env.INDEXER_SCHEDULE_URL,origin+"/api/v1/internal/indexer");
assert.ok(env.VERCEL_AUTOMATION_BYPASS_SECRET);
const local=Object.assign({},...['.env','.env.local'].filter(existsSync).map(f=>parseEnv(readFileSync(f,'utf8'))));
const keys=JSON.parse(readFileSync('.runtime/acceptance/sepolia-wallets.json','utf8'));
export const accounts={buyer:privateKeyToAccount(keys.buyer),seller:privateKeyToAccount(keys.seller),admin:privateKeyToAccount(local.SEPOLIA_ADMIN_PRIVATE_KEY as Hex),superAdmin:privateKeyToAccount(local.SEPOLIA_SUPER_ADMIN_PRIVATE_KEY as Hex)};
export type Person=keyof typeof accounts;
export const client=createPublicClient({chain:sepolia,transport:http(env.ESCROW_RPC_URL,{retryCount:2,timeout:15000})});
export const service=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
export const address=env.NEXT_PUBLIC_ESCROW_ADDRESS as Hex;
assert.equal(address,JSON.parse(readFileSync('.runtime/release/online-deployment.json','utf8')).escrowAddress);
const headers={"x-vercel-protection-bypass":env.VERCEL_AUTOMATION_BYPASS_SECRET};
const jars={} as Record<Person,Map<string,string>>;
const file='.runtime/release/demo-state.json';
export const demo:Record<string,any>=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{origin,escrowAddress:address,deals:{}};
assert.equal(demo.escrowAddress,address);
demo.verifiedOrigins=[...new Set([...(demo.verifiedOrigins??[]),origin])];
export function save(){writeFileSync(file,JSON.stringify(demo,null,2));}
export function record(step:string,data:Record<string,unknown>){appendFileSync('.runtime/release/preview-results.jsonl',JSON.stringify({time:new Date().toISOString(),step,...data},(_,v)=>typeof v==='bigint'?v.toString():v)+'\n');console.log(`PASS Preview ${step}`);}
export async function login(person:Person){
 const jar=jars[person]=new Map<string,string>();
 const auth=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});
 const account=accounts[person],message=createSiweMessage({domain:new URL(origin).host,uri:origin,address:account.address,chainId:11155111,version:'1',nonce:generateSiweNonce(),statement:'Authorized NOTBIT Preview testnet acceptance.'});
 const result=await auth.auth.signInWithWeb3({chain:'ethereum',message,signature:await account.signMessage({message})});
 if(result.error||!result.data.user)throw new Error(`Cloud wallet sign-in failed for ${person}: ${result.error?.status} ${result.error?.code} ${result.error?.message}`);
 const viewer=await auth.rpc('get_marketplace_viewer').single();
 assert.equal(viewer.error,null);assert.equal(viewerSchema.parse(viewer.data).role,person==='admin'?'ADMIN':person==='superAdmin'?'SUPER_ADMIN':'USER');
 return auth;
}
export async function apiResponse(person:Person|null,path:string,body?:unknown){
 const r=await fetch(origin+'/api/v1'+path,{method:body?'POST':'GET',redirect:'error',headers:{...headers,...(person?{Cookie:[...jars[person]].map(([n,v])=>`${n}=${v}`).join('; ')}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(65000)});
 const json=await r.json();return {status:r.status,...json};
}
export async function api(person:Person,path:string,body?:unknown){const r=await apiResponse(person,path,body);if(r.status>=400)throw new Error(`Preview API ${path} returned ${r.status}: ${r.error?.code}`);return r.data;}
export async function index(){const r=await fetch(env.INDEXER_SCHEDULE_URL,{method:'POST',redirect:'error',headers:{...headers,Authorization:`Bearer ${env.INDEXER_SECRET}`},signal:AbortSignal.timeout(65000)});if(!r.ok)throw new Error(`Preview indexer returned ${r.status}`);return(await r.json()).data;}
export async function sync(deal:Deal,status:string){
 const end=Date.now()+180_000;
 while(Date.now()<end){await index();const projected=await api('buyer',`/orders/${deal.offer.id}`);if(projected.orderStatus===status)return projected;await new Promise(r=>setTimeout(r,4000));}
 throw new Error(`Projection did not reach ${status}.`);
}
export async function send(person:Person,functionName:string,args:readonly unknown[],value?:bigint){
 const {request}=await client.simulateContract({address,abi:escrowAbi,functionName:functionName as never,args:args as never,account:accounts[person],...(value!==undefined?{value}:{})});
 const wallet=createWalletClient({account:accounts[person],chain:sepolia,transport:http(env.ESCROW_RPC_URL)});
 const hash=await wallet.writeContract(request as never);
 record('submitted',{person,functionName,hash});
 const receipt=await client.waitForTransactionReceipt({hash,confirmations:3,timeout:180_000,pollingInterval:3000});assert.equal(receipt.status,'success');
 record(functionName,{person,hash,block:receipt.blockNumber});return receipt;
}
export async function createDeal(label:string):Promise<Deal>{
 if(demo.deals[label])return demo.deals[label] as Deal;
 const amount='10000000000000';
 const listing=await api('seller','/listings',{gameSlug:'warframe',title:`DEMO ${label} ${crypto.randomUUID().slice(0,8)}`,description:'Sepolia testnet demo. No real game item is offered.',quantity:1,region:'Asia',deliveryMethod:'Demo in-game trade',priceWei:amount});
 const room=await api('buyer','/conversations',{listingId:listing.id});
 const context=(await api('seller',`/conversations/${room.id}/offers`)).context;
 assert.equal(context.chainId,11155111);assert.equal(context.escrowAddress,address);
 const id=crypto.randomUUID(),agreement={title:listing.title,quantity:1,gameSlug:'warframe',region:'Asia',buyerCharacter:'DEMO Buyer',sellerCharacter:'DEMO Seller',deliveryMethod:'Demo in-game trade',meetingTime:new Date(Date.now()+3600_000).toISOString()};
 const offer:Offer={id,agreement,...context,status:'OPEN',signedOffer:{orderId:toChainId(id),listingId:toChainId(listing.id),buyer:context.buyer,seller:context.seller,amount,expiresAt:Math.floor(Date.now()/1000)+1700,agreementHash:hashAgreement(agreement),signature:'0x'}};
 offer.signedOffer.signature=await accounts.seller.signTypedData(offerTypedData(offer));
 await api('seller',`/conversations/${room.id}/offers`,{id,agreement,signedOffer:offer.signedOffer});
 const deal={offer,conversationId:room.id,listingId:listing.id,transactions:{} as Record<string,Hex>};demo.deals[label]=deal;save();record('demo-created',{label,orderId:id,conversationId:room.id});return deal;
}
export type Deal={offer:Offer;conversationId:string;listingId:string;transactions:Record<string,Hex>;status?:string;deadline?:number};
export async function chainOrder(deal:Deal){return client.readContract({address,abi:escrowAbi,functionName:'getOrder',args:[deal.offer.signedOffer.orderId]});}
export async function fund(deal:Deal){
 const order=await chainOrder(deal);
 if(order.status===0){const r=await send('buyer','fundOrder',[offerTypedData(deal.offer).message,deal.offer.signedOffer.signature],BigInt(deal.offer.signedOffer.amount));deal.transactions.fund=r.transactionHash;save();}
 assert.ok(deal.transactions.fund,'Recover the recorded submitted funding hash before retrying.');
 await api('buyer',`/orders/${deal.offer.id}`,{hash:deal.transactions.fund});
 await sync(deal,order.status===0?'FUNDED':orderStatuses[order.status]);
}
export async function evidence(person:'buyer'|'seller',deal:Deal,stage:'delivery'|'receipt'|'dispute'){
 const bytes=await sharp({create:{width:64,height:64,channels:3,background:stage==='delivery'?'#2463eb':'#18a058'}}).png().toBuffer();
 const ticket=await api(person,'/uploads',{purpose:'evidence',scopeId:deal.offer.id,contentType:'image/png',sizeBytes:bytes.length,fileHash:keccak256(bytes)});
 const uploaded=await fetch(ticket.signedUrl,{method:'PUT',headers:{'Content-Type':'image/png','x-upsert':'false'},body:bytes,redirect:'error'});assert.ok(uploaded.ok);
 return(await api(person,`/orders/${deal.offer.id}/evidence`,{stage,ticketIds:[ticket.ticketId]})).receipt;
}
export async function delivery(deal:Deal){
 if((await chainOrder(deal)).status===1){const {signature,...fields}=await evidence('seller',deal,'delivery');const r=await send('seller','confirmDelivery',[fields,signature]);deal.transactions.delivery=r.transactionHash;save();}
 await sync(deal,'DELIVERED');
}
export function sanitize(error:unknown){return String(error instanceof Error?error.message:error).replace(/https?:\/\/\S+/g,'[endpoint]').replace(/0x[0-9a-fA-F]{64,}/g,'[hex]').slice(0,600);}
