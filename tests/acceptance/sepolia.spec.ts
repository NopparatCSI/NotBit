import { test,expect } from "vitest";
import nextEnv from "@next/env";
import { readFileSync,writeFileSync,existsSync,appendFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { createPublicClient,createWalletClient,http,keccak256,type Hex,type Address } from "viem";
import { generatePrivateKey,privateKeyToAccount } from "viem/accounts";
import { createSiweMessage,generateSiweNonce } from "viem/siwe";
import { sepolia } from "viem/chains";
import sharp from "sharp";
import { escrowAbi,toChainId,hashAgreement } from "@marketplace/shared";
import { offerTypedData,type Offer } from "../../src/lib/offers/model";
import { resolveEscrowSettings } from "../../src/lib/chain/settings";

test("original Sepolia escrow: signed evidence settlement and both staff decisions",async()=>{
  try {
  if(process.env.ACCEPTANCE_SEPOLIA!=="1")throw new Error("Explicit ACCEPTANCE_SEPOLIA=1 is required for testnet transactions.");
  nextEnv.loadEnvConfig(process.cwd(),true);const e=process.env,config=resolveEscrowSettings(e);
  if(config?.chainId!==11155111||config.escrowAddress!=="0x3d32396cd1017ded8cce5150b88ee6feb3ca6ebe")throw new Error("The original Sepolia test escrow is required.");
  for(const name of ["SEPOLIA_TREASURY_ADDRESS","SEPOLIA_EVIDENCE_SIGNER_ADDRESS","SEPOLIA_ADMIN_ADDRESS","SEPOLIA_SUPER_ADMIN_ADDRESS"]){if(!/^0x[0-9a-fA-F]{40}$/.test(e[name]??""))throw new Error(`Invalid public address format in ${name}; value withheld.`);}
  const client=createPublicClient({chain:sepolia,transport:http(config.rpcUrl,{retryCount:2,timeout:15000})});
  expect(await client.getChainId()).toBe(11155111);
  const file=".runtime/acceptance/sepolia-wallets.json";
  const keys=existsSync(file)?JSON.parse(readFileSync(file,"utf8")):{buyer:generatePrivateKey(),seller:generatePrivateKey()};
  if(!existsSync(file))writeFileSync(file,JSON.stringify(keys),{mode:0o600});
  const accounts={buyer:privateKeyToAccount(keys.buyer),seller:privateKeyToAccount(keys.seller),admin:privateKeyToAccount(e.SEPOLIA_ADMIN_PRIVATE_KEY as Hex),superAdmin:privateKeyToAccount(e.SEPOLIA_SUPER_ADMIN_PRIVATE_KEY as Hex),deployer:privateKeyToAccount(e.SEPOLIA_DEPLOYER_PRIVATE_KEY as Hex)};
  type Person=keyof typeof accounts;
  for(const person of ["admin","superAdmin"] as const)expect((await client.readContract({address:config.escrowAddress,abi:escrowAbi,functionName:person})).toLowerCase()).toBe(accounts[person].address.toLowerCase());
  const getWallet=(person:Person)=>createWalletClient({account:accounts[person],chain:sepolia,transport:http(config.rpcUrl)});
  const log=(step:string,data:Record<string,unknown>)=>{appendFileSync(".runtime/acceptance/sepolia-results.jsonl",JSON.stringify({time:new Date().toISOString(),step,...data},(_,v)=>typeof v==="bigint"?v.toString():v)+"\n");console.log(`PASS Sepolia ${step}`);};
  async function receipt(hash:Hex){const r=await client.waitForTransactionReceipt({hash,confirmations:3,timeout:180000,pollingInterval:3000});expect(r.status).toBe("success");return r;}
  for(const person of ["buyer","seller"] as const)if(await client.getBalance({address:accounts[person].address})<500000000000000n){
    const hash=await getWallet("deployer").sendTransaction({account:accounts.deployer,chain:sepolia,to:accounts[person].address,value:1500000000000000n});await receipt(hash);log("test-wallet-funded",{person,address:accounts[person].address,hash});
  }
  const jars={} as Record<Person,Map<string,string>>;
  for(const person of ["buyer","seller","admin","superAdmin"] as const){
    const jar=jars[person]=new Map();const auth=createServerClient(e.NEXT_PUBLIC_SUPABASE_URL!,e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});
    const message=createSiweMessage({domain:"localhost:3001",uri:"http://localhost:3001",address:accounts[person].address,chainId:11155111,version:"1",nonce:generateSiweNonce(),statement:"Authorized Sepolia marketplace acceptance."});
    const result=await auth.auth.signInWithWeb3({chain:"ethereum",message,signature:await accounts[person].signMessage({message})});if(result.error)throw new Error(`Sepolia ${person} sign-in failed.`);
  }
  async function api(person:Person,path:string,body?:unknown){const r=await fetch(`http://localhost:3001/api/v1${path}`,{method:body?"POST":"GET",headers:{Cookie:[...jars[person]].map(([n,v])=>`${n}=${v}`).join("; "),...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});const data=await r.json();if(!r.ok)throw new Error(`Acceptance API ${path} returned ${r.status}: ${data.error?.message}`);return data.data;}
  async function index(){const r=await fetch("http://localhost:3001/api/v1/internal/indexer",{method:"POST",headers:{Authorization:`Bearer ${e.INDEXER_SECRET}`},signal:AbortSignal.timeout(60000)});if(!r.ok)throw new Error("Sepolia indexer failed.");}
  async function send(person:Person,functionName:string,args:unknown[],value?:bigint){try{const {request}=await client.simulateContract({account:accounts[person],address:config!.escrowAddress,abi:escrowAbi,functionName:functionName as never,args:args as never,...(value?{value}:{})});const hash=await getWallet(person).writeContract(request as never);const r=await receipt(hash);log(functionName,{person,hash,block:r.blockNumber});return r;}catch(error){throw new Error(`Sepolia ${functionName} failed: ${(error as {shortMessage?:string}).shortMessage?.replace(/https?:\/\/\S+/g,"[rpc]")??"See private local run log."}`);}}
  const bytes=await sharp({create:{width:32,height:32,channels:3,background:"#2463eb"}}).png().toBuffer();
  async function upload(person:Person,id:string,stage:string){const ticket=await api(person,"/uploads",{purpose:"evidence",scopeId:id,contentType:"image/png",sizeBytes:bytes.length,fileHash:keccak256(bytes)});const stored=await fetch(ticket.signedUrl,{method:"PUT",headers:{"Content-Type":"image/png"},body:bytes});expect(stored.ok).toBe(true);return(await api(person,`/orders/${id}/evidence`,{stage,ticketIds:[ticket.ticketId]})).receipt;}
  for(const outcome of ["receipt","refund","release"]){
    const amount="10000000000000";
    const listing=await api("seller","/listings",{gameSlug:"warframe",title:`Sepolia acceptance ${outcome} ${crypto.randomUUID().slice(0,8)}`,description:"Authorized testnet acceptance",quantity:1,region:"Asia",deliveryMethod:"In-game trade",priceWei:amount});
    const room=await api("buyer","/conversations",{listingId:listing.id});const context=(await api("seller",`/conversations/${room.id}/offers`)).context;
    const id=crypto.randomUUID(),agreement={title:listing.title,quantity:1,gameSlug:"warframe",region:"Asia",deliveryMethod:"In-game trade",buyerCharacter:"Sepolia acceptance buyer",sellerCharacter:"Sepolia acceptance seller",meetingTime:new Date(Date.now()+3600000).toISOString()};
    const offer:Offer={id,agreement,...context,status:"OPEN",signedOffer:{orderId:toChainId(id),listingId:toChainId(listing.id),buyer:context.buyer,seller:context.seller,amount,expiresAt:Math.floor(Date.now()/1000)+1700,agreementHash:hashAgreement(agreement),signature:"0x"}};
    offer.signedOffer.signature=await accounts.seller.signTypedData(offerTypedData(offer));await api("seller",`/conversations/${room.id}/offers`,{id,agreement,signedOffer:offer.signedOffer});
    const funding=await send("buyer","fundOrder",[offerTypedData(offer).message,offer.signedOffer.signature],BigInt(amount));await api("buyer",`/orders/${id}`,{hash:funding.transactionHash});await index();
    expect((await api("buyer",`/orders/${id}`)).projectionReady).toBe(true);
    const sellerBefore=await client.getBalance({address:accounts.seller.address}),buyerBefore=await client.getBalance({address:accounts.buyer.address}),treasury=config!.escrowAddress&&e.SEPOLIA_TREASURY_ADDRESS as Address;
    const treasuryBefore=await client.getBalance({address:treasury});let sellerGas=0n,buyerGas=0n;
    if(outcome==="receipt"){
      const delivery=await upload("seller",id,"delivery"),{signature,...fields}=delivery;const delivered=await send("seller","confirmDelivery",[fields,signature]);sellerGas=delivered.gasUsed*delivered.effectiveGasPrice;await index();
      const received=await upload("buyer",id,"receipt"),{signature:signature2,...fields2}=received;const confirmed=await send("buyer","confirmReceipt",[fields2,signature2]);buyerGas=confirmed.gasUsed*confirmed.effectiveGasPrice;
    }else{
      await api("buyer",`/orders/${id}/dispute`,{reason:"Acceptance dispute for original fixed-role Contract"});const disputed=await send("buyer","openDispute",[offer.signedOffer.orderId]);buyerGas=disputed.gasUsed*disputed.effectiveGasPrice;await index();
      const staff=outcome==="refund"?"admin":"superAdmin";const draft=await api(staff,`/admin/orders/${id}/decision`,{refundBuyer:outcome==="refund",reason:`Verified Sepolia acceptance ${outcome}`});
      const resolved=await send(staff,"resolveDispute",[offer.signedOffer.orderId,outcome==="refund",draft.decisionHash]);await api(staff,"/admin/activity",{action:"DECISION_SUBMITTED",orderId:id,txHash:resolved.transactionHash});
    }
    await index();const expected=outcome==="refund"?"REFUNDED":"RELEASED";
    for(const person of ["buyer","seller"] as const)expect((await api(person,`/orders/${id}`)).orderStatus).toBe(expected);
    expect(await client.getBalance({address:accounts.seller.address})-sellerBefore+sellerGas).toBe(outcome==="refund"?0n:9500000000000n);
    expect(await client.getBalance({address:treasury})-treasuryBefore).toBe(outcome==="refund"?0n:500000000000n);
    if(outcome==="refund")expect(await client.getBalance({address:accounts.buyer.address})-buyerBefore+buyerGas).toBe(BigInt(amount));
    log(outcome,{passed:true,orderId:id,chainOrderId:offer.signedOffer.orderId,conversationId:room.id,amountWei:amount,result:expected});
  }
  } catch(error) {
    const message=error instanceof Error?error.message:"Acceptance failed";
    throw new Error(message.replace(/https?:\/\/\S+/g,"[endpoint]").replace(/0x[0-9a-fA-F]{64,}/g,"[hex value]").slice(0,500));
  }
});
