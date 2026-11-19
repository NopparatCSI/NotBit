import { readFileSync,writeFileSync,existsSync,mkdirSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createPublicClient,createWalletClient,http,encodeDeployData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { readReleaseEnvironment } from './environment.mjs';

try {
  const env=readReleaseEnvironment();
  const names=['SEPOLIA_TREASURY_ADDRESS','SEPOLIA_EVIDENCE_SIGNER_ADDRESS','SEPOLIA_ADMIN_ADDRESS','SEPOLIA_SUPER_ADMIN_ADDRESS'];
  for(const name of names)if(!/^0x[0-9a-fA-F]{40}$/.test(env[name]??''))throw new Error(`Invalid public address in ${name}; value withheld.`);
  if(env.ESCROW_CHAIN_ID!=='11155111'||new URL(env.ESCROW_RPC_URL).protocol!=='https:')throw new Error('Sepolia HTTPS configuration required.');
  let local={};for(const file of ['.env','.env.local'])if(existsSync(file))local={...local,...parseEnv(readFileSync(file,'utf8'))};
  if(!/^0x[0-9a-fA-F]{64}$/.test(local.SEPOLIA_DEPLOYER_PRIVATE_KEY??''))throw new Error('A local deployer key is required.');
  const account=privateKeyToAccount(local.SEPOLIA_DEPLOYER_PRIVATE_KEY);
  const client=createPublicClient({chain:sepolia,transport:http(env.ESCROW_RPC_URL)});
  const wallet=createWalletClient({account,chain:sepolia,transport:http(env.ESCROW_RPC_URL)});
  if(await client.getChainId()!==11155111)throw new Error('RPC chain mismatch.');
  const artifact=JSON.parse(readFileSync('contracts/artifacts/contracts/MarketplaceEscrow.sol/MarketplaceEscrow.json','utf8'));
  const deployment={abi:artifact.abi,bytecode:artifact.bytecode,args:names.map(n=>env[n])};
  mkdirSync('.runtime/release',{recursive:true});const file='.runtime/release/online-deployment.json';
  const state=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{};
  const data=encodeDeployData(deployment);
  // A dry run exits before every write operation, including recovery/funding.
  if(!process.argv.includes('--send')){
    const [gas,fees]=await Promise.all([client.estimateGas({account:account.address,data}),client.estimateFeesPerGas()]);
    console.log(JSON.stringify({dryRun:true,chainId:11155111,roles:Object.fromEntries(names.map(n=>[n,env[n]])),maximumGasWei:String(gas*fees.maxFeePerGas),existingTransaction:state.transactionHash??null}));
    process.exit(0);
  }
  if(!state.transactionHash){
    const [gas,fees,balance]=await Promise.all([client.estimateGas({account:account.address,data}),client.estimateFeesPerGas(),client.getBalance({address:account.address})]);
    const maximum=gas*fees.maxFeePerGas;
    if(maximum>10000000000000000n||balance<maximum)throw new Error('Deployment gas exceeds the 0.01 test ETH cap or available balance.');
    console.log(JSON.stringify({chainId:11155111,roles:Object.fromEntries(names.map(n=>[n,env[n]])),maximumGasWei:String(maximum),broadcast:process.argv.includes('--send')}));
    state.transactionHash=await wallet.deployContract({...deployment,gas,...fees});
    writeFileSync(file,JSON.stringify(state,null,2));console.log('Deployment transaction '+state.transactionHash);
  }
  const tx=await client.getTransaction({hash:state.transactionHash});
  if(tx.from.toLowerCase()!==account.address.toLowerCase()||tx.to!==null||tx.input.toLowerCase()!==data.toLowerCase())throw new Error('Saved transaction does not match the reviewed deployment.');
  const receipt=await client.waitForTransactionReceipt({hash:state.transactionHash,confirmations:3,timeout:240000,pollingInterval:3000});
  if(receipt.status!=='success'||!receipt.contractAddress)throw new Error('Deployment failed.');
  Object.assign(state,{chainId:11155111,escrowAddress:receipt.contractAddress.toLowerCase(),startBlock:String(receipt.blockNumber),roles:Object.fromEntries(names.map(n=>[n,env[n].toLowerCase()]))});
  Object.assign(env,{NEXT_PUBLIC_ESCROW_ADDRESS:state.escrowAddress,ESCROW_START_BLOCK:state.startBlock,ESCROW_DEPLOY_TX_HASH:state.transactionHash});
  writeFileSync('.env.preview.local',Object.entries(env).map(([n,v])=>`${n}=${v}`).join('\n')+'\n',{mode:0o600});writeFileSync(file,JSON.stringify(state,null,2));
  const sender=privateKeyToAccount(env.INDEXER_SENDER_PRIVATE_KEY);
  if(await client.getBalance({address:sender.address})<500000000000000n){
    if(!state.senderFundingHash){state.senderFundingHash=await wallet.sendTransaction({to:sender.address,value:1000000000000000n});writeFileSync(file,JSON.stringify(state,null,2));}
    const funding=await client.waitForTransactionReceipt({hash:state.senderFundingHash,confirmations:3,timeout:180000,pollingInterval:3000});if(funding.status!=='success')throw new Error('Sender funding failed.');
  }
  console.log(JSON.stringify({ready:true,escrowAddress:state.escrowAddress,startBlock:state.startBlock,transactionHash:state.transactionHash,sender:sender.address}));
}catch(error){console.error(error instanceof Error&&error.message.startsWith('Invalid public address')?error.message:'Online deployment not completed. Inspect the saved public transaction hash before retrying; provider details withheld.');process.exitCode=1;}
