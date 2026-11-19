import {createClient} from '@supabase/supabase-js';
import {createPublicClient,http,parseAbi,decodeAbiParameters} from 'viem';
import {sepolia} from 'viem/chains';
import {readReleaseEnvironment,validateReleaseEnvironment} from './environment.mjs';
try{
  const env=readReleaseEnvironment();const issues=validateReleaseEnvironment(env);
  if(issues.length){console.log(JSON.stringify({ready:false,issues}));process.exit(1);}
  const rpc=createPublicClient({chain:sepolia,transport:http(env.ESCROW_RPC_URL)});
  if(await rpc.getChainId()!==11155111)throw new Error('RPC chain mismatch');
  const tx=await rpc.getTransaction({hash:env.ESCROW_DEPLOY_TX_HASH}),receipt=await rpc.getTransactionReceipt({hash:env.ESCROW_DEPLOY_TX_HASH});
  if(tx.to!==null||receipt.status!=='success'||receipt.contractAddress?.toLowerCase()!==env.NEXT_PUBLIC_ESCROW_ADDRESS.toLowerCase()||String(receipt.blockNumber)!==env.ESCROW_START_BLOCK)throw new Error('Deployment mismatch');
  const actual=decodeAbiParameters([{type:'address'},{type:'address'},{type:'address'},{type:'address'}],`0x${tx.input.slice(-256)}`);
  const names=['SEPOLIA_TREASURY_ADDRESS','SEPOLIA_EVIDENCE_SIGNER_ADDRESS','SEPOLIA_ADMIN_ADDRESS','SEPOLIA_SUPER_ADMIN_ADDRESS'];
  if(actual.some((a,i)=>a.toLowerCase()!==env[names[i]].toLowerCase()))throw new Error('Role mismatch');
  const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const staff=await db.from('staff_wallets').select('wallet,role');if(staff.error||staff.data.length!==2||!staff.data.some(s=>s.role==='ADMIN'&&s.wallet===actual[2].toLowerCase())||!staff.data.some(s=>s.role==='SUPER_ADMIN'&&s.wallet===actual[3].toLowerCase()))throw new Error('Cloud staff mismatch');
  for(const name of ['order-evidence','upload-staging','chat-images']){const r=await db.storage.getBucket(name);if(r.error||r.data.public)throw new Error('Private bucket check failed');}
  console.log(JSON.stringify({ready:true,chain:11155111,contract:env.NEXT_PUBLIC_ESCROW_ADDRESS,startBlock:env.ESCROW_START_BLOCK,staff:2,privateStorage:true}));
}catch{console.error('Release readiness failed. Check missing configuration, deployment or Cloud permissions; values withheld.');process.exitCode=1;}
