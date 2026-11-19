import nextEnv from '@next/env';
import {readFileSync,appendFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {createPublicClient,createWalletClient,http,parseAbi} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {createSiweMessage,generateSiweNonce} from 'viem/siwe';
import {sepolia} from 'viem/chains';

// Close only orders belonging to the fresh acceptance buyer/seller if a test run
// was interrupted. Never delete chain history or touch another user's orders.
try{
  if(process.env.ACCEPTANCE_SEPOLIA!=='1')throw new Error('Explicit testnet opt-in required');
  nextEnv.loadEnvConfig(process.cwd(),true);const e=process.env;
  const escrow=(e.ESCROW_ADDRESS||e.NEXT_PUBLIC_ESCROW_ADDRESS).toLowerCase();
  if(escrow!=='0x3d32396cd1017ded8cce5150b88ee6feb3ca6ebe')throw new Error('Original test escrow required');
  const keys=JSON.parse(readFileSync('.runtime/acceptance/sepolia-wallets.json','utf8'));
  const accounts={buyer:privateKeyToAccount(keys.buyer),seller:privateKeyToAccount(keys.seller),admin:privateKeyToAccount(e.SEPOLIA_ADMIN_PRIVATE_KEY)};
  const rpc=e.ESCROW_RPC_URL||e.SEPOLIA_RPC_URL||e.NEXT_PUBLIC_SEPOLIA_RPC_URL;
  const client=createPublicClient({chain:sepolia,transport:http(rpc)});
  if(await client.getChainId()!==11155111)throw new Error('Sepolia required');
  const abi=parseAbi(['function admin() view returns(address)','function openDispute(bytes32 orderId)','function resolveDispute(bytes32 orderId,bool refundBuyer,bytes32 decisionHash)']);
  if((await client.readContract({address:escrow,abi,functionName:'admin'})).toLowerCase()!==accounts.admin.address.toLowerCase())throw new Error('Wrong administrator');
  const db=createClient(e.NEXT_PUBLIC_SUPABASE_URL,e.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  await index();
  const orders=await db.from('orders').select('id,chain_order_id,status').eq('chain_id',11155111).eq('escrow_address',escrow).eq('on_chain',true).eq('buyer_wallet',accounts.buyer.address.toLowerCase()).eq('seller_wallet',accounts.seller.address.toLowerCase()).in('status',['FUNDED','DELIVERED','IN_REVIEW']);
  if(orders.error)throw new Error('Could not read own acceptance orders');
  const jars={};
  for(const person of ['buyer','admin']){
    const jar=jars[person]=new Map();const auth=createServerClient(e.NEXT_PUBLIC_SUPABASE_URL,e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});
    const message=createSiweMessage({domain:'localhost:3001',uri:'http://localhost:3001',address:accounts[person].address,chainId:11155111,version:'1',nonce:generateSiweNonce(),statement:'Recover interrupted authorized testnet acceptance.'});
    const result=await auth.auth.signInWithWeb3({chain:'ethereum',message,signature:await accounts[person].signMessage({message})});if(result.error)throw new Error('Sign-in failed');
  }
  const log=(step,data)=>appendFileSync('.runtime/acceptance/sepolia-results.jsonl',JSON.stringify({time:new Date().toISOString(),step,...data})+'\n');
  async function index(){for(let attempt=0;attempt<3;attempt++){const r=await fetch('http://localhost:3001/api/v1/internal/indexer',{method:'POST',headers:{Authorization:`Bearer ${e.INDEXER_SECRET}`},signal:AbortSignal.timeout(60000)});if(r.ok)return;await new Promise(resolve=>setTimeout(resolve,2000));}throw new Error('Indexer failed');}
  async function api(person,path,body){const r=await fetch('http://localhost:3001/api/v1'+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:[...jars[person]].map(([n,v])=>`${n}=${v}`).join('; ')},body:JSON.stringify(body)});const result=await r.json();if(!r.ok)throw new Error('Acceptance recovery API failed');return result.data;}
  async function send(person,functionName,args){const wallet=createWalletClient({account:accounts[person],chain:sepolia,transport:http(rpc)});const {request}=await client.simulateContract({account:accounts[person],address:escrow,abi,functionName,args});const hash=await wallet.writeContract(request);const receipt=await client.waitForTransactionReceipt({hash,confirmations:3,timeout:180000,pollingInterval:3000});if(receipt.status!=='success')throw new Error('Recovery transaction failed');log('recovery-'+functionName,{hash});await index();}
  for(const order of orders.data){
    if(order.status!=='IN_REVIEW'){
      await api('buyer',`/orders/${order.id}/dispute`,{reason:'Refund the interrupted acceptance fixture; no item was delivered.'});
      await send('buyer','openDispute',[order.chain_order_id]);
    }
    const draft=await api('admin',`/admin/orders/${order.id}/decision`,{refundBuyer:true,reason:'Clean up an interrupted testnet acceptance run with a full refund.'});
    await send('admin','resolveDispute',[order.chain_order_id,true,draft.decisionHash]);
    log('interrupted-order-refunded',{orderId:order.id,passed:true});
    console.log('Recovered interrupted acceptance order '+order.id+' with a confirmed refund.');
  }
  console.log('No open orders remain for these acceptance wallets.');
}catch{console.error('Acceptance recovery failed; private provider details withheld.');process.exitCode=1;}
