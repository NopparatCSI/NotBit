import assert from "node:assert/strict";
import {test,expect,beforeAll} from "vitest";
import {escrowAbi} from "@marketplace/shared";
import {accounts,address,api,apiResponse,chainOrder,client,createDeal,demo,delivery,evidence,env,fund,index,login,origin,record,sanitize,save,send,sync} from "./environment";

beforeAll(async()=>{
 try{
  expect(await client.getChainId()).toBe(11155111);
  for(const person of ['admin','superAdmin'] as const)expect((await client.readContract({address,abi:escrowAbi,functionName:person})).toLowerCase()).toBe(accounts[person].address.toLowerCase());
  for(const person of ['buyer','seller','admin','superAdmin'] as const)await login(person);
  for(const person of ['buyer','seller'] as const)assert.ok(await client.getBalance({address:accounts[person].address})>100_000_000_000_000n,'Existing Sepolia acceptance wallet needs test ETH. No automatic transfer is performed.');
  record('cloud-login-roles',{origin,escrowAddress:address,roles:['USER','USER','ADMIN','SUPER_ADMIN']});
 }catch(e){throw new Error(sanitize(e));}
});

test('24/25 Preview Cloud authentication, role boundaries and protected indexer',async()=>{
 try{
  expect((await apiResponse(null,'/listings')).status).toBe(200);
  expect((await apiResponse(null,'/admin/transactions')).status).toBe(401);
  expect((await apiResponse('buyer','/admin/transactions')).status).toBe(403);
  expect((await apiResponse('admin',`/admin/transactions?hash=${env.ESCROW_DEPLOY_TX_HASH}`)).status).toBe(200);
  expect((await apiResponse('admin','/listings',{gameSlug:'warframe',title:'Must be denied',description:'Must not be created',quantity:1,region:'Asia',deliveryMethod:'Demo',priceWei:'10000000000000'})).status).toBe(403);
  const protectedResponse=await fetch(env.INDEXER_SCHEDULE_URL,{method:'POST',headers:{'x-vercel-protection-bypass':env.VERCEL_AUTOMATION_BYPASS_SECRET},redirect:'error'});
  expect(protectedResponse.status).toBe(401);
  const result=await index();expect(result.escrowAddress).toBe(address);
  record('preview-permissions',{passed:true});
 }catch(e){throw new Error(sanitize(e));}
});

for(const outcome of ['refund','staff-release','open-review','funded-deadline','delivered-deadline'])test(`27 real Sepolia demo ${outcome}`,async()=>{
 try{
  const deal=await createDeal(outcome);await fund(deal);
  let current=await chainOrder(deal);
  if(outcome==='delivered-deadline'){await delivery(deal);current=await chainOrder(deal);}
  else if(['refund','staff-release','open-review'].includes(outcome)){
   if(current.status===1){
    await evidence('buyer',deal,'dispute');
    await api('buyer',`/orders/${deal.offer.id}/dispute`,{reason:`DEMO ${outcome}: simulated disagreement for testnet acceptance.`});
    const r=await send('buyer','openDispute',[deal.offer.signedOffer.orderId]);deal.transactions.dispute=r.transactionHash;save();await sync(deal,'IN_REVIEW');
   }
   if(outcome!=='open-review'&&((await chainOrder(deal)).status===3)){
    const refundBuyer=outcome==='refund',staff=refundBuyer?'admin':'superAdmin';
    const buyerBefore=await client.getBalance({address:accounts.buyer.address}),sellerBefore=await client.getBalance({address:accounts.seller.address}),treasuryBefore=await client.getBalance({address:env.SEPOLIA_TREASURY_ADDRESS});
    const draft=await api(staff,`/admin/orders/${deal.offer.id}/decision`,{refundBuyer,reason:`DEMO verified Preview ${outcome}`});
    const r=await send(staff,'resolveDispute',[deal.offer.signedOffer.orderId,refundBuyer,draft.decisionHash]);deal.transactions.decision=r.transactionHash;save();
    await api(staff,'/admin/activity',{action:'DECISION_SUBMITTED',orderId:deal.offer.id,txHash:r.transactionHash});
    await sync(deal,refundBuyer?'REFUNDED':'RELEASED');
    expect(await client.getBalance({address:accounts.buyer.address})-buyerBefore).toBe(refundBuyer?10_000_000_000_000n:0n);
    expect(await client.getBalance({address:accounts.seller.address})-sellerBefore).toBe(refundBuyer?0n:9_500_000_000_000n);
    expect(await client.getBalance({address:env.SEPOLIA_TREASURY_ADDRESS})-treasuryBefore).toBe(refundBuyer?0n:500_000_000_000n);
    record('balance-verified',{outcome,orderId:deal.offer.id,amountWei:deal.offer.signedOffer.amount,feePercent:refundBuyer?0:5});
   }
  }
  current=await chainOrder(deal);
  const expected=outcome==='refund'?'REFUNDED':outcome==='staff-release'?'RELEASED':outcome==='open-review'?'IN_REVIEW':outcome==='delivered-deadline'?'DELIVERED':'FUNDED';
  await sync(deal,expected);deal.status=expected;deal.deadline=Number(current.deadline);save();
  record('demo-complete',{outcome,orderId:deal.offer.id,conversationId:deal.conversationId,status:expected,deadline:deal.deadline,transactions:deal.transactions});
 }catch(e){throw new Error(sanitize(e));}
});

test('25 prepare an unfunded signed offer for actual MetaMask browser acceptance',async()=>{
 try{const deal=await createDeal('metamask-receipt');expect((await chainOrder(deal)).status).toBe(0);record('metamask-fixture',{orderId:deal.offer.id,conversationId:deal.conversationId});}
 catch(e){throw new Error(sanitize(e));}
});

test('25 Preview normal delivery and receipt settle exactly 95/5 on the new escrow',async()=>{
 try{
  const deal=await createDeal('normal-receipt');await fund(deal);
  if((await chainOrder(deal)).status!==4){
   await delivery(deal);
   const sellerBefore=await client.getBalance({address:accounts.seller.address}),treasuryBefore=await client.getBalance({address:env.SEPOLIA_TREASURY_ADDRESS});
   const {signature,...fields}=await evidence('buyer',deal,'receipt');
   const r=await send('buyer','confirmReceipt',[fields,signature]);deal.transactions.receipt=r.transactionHash;save();
   await sync(deal,'RELEASED');
   expect(await client.getBalance({address:accounts.seller.address})-sellerBefore).toBe(9_500_000_000_000n);
   expect(await client.getBalance({address:env.SEPOLIA_TREASURY_ADDRESS})-treasuryBefore).toBe(500_000_000_000n);
   record('balance-verified',{outcome:'normal-receipt',orderId:deal.offer.id,amountWei:deal.offer.signedOffer.amount,feePercent:5});
  }
  await sync(deal,'RELEASED');deal.status='RELEASED';save();record('normal-receipt',{orderId:deal.offer.id,transactions:deal.transactions,provider:'Node wallet; actual MetaMask remains blocked by the domain warning'});
 }catch(e){throw new Error(sanitize(e));}
});
