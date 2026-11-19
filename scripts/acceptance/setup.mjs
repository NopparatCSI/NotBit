import {readFileSync,writeFileSync,mkdirSync,existsSync,cpSync,symlinkSync,lstatSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createPublicClient,createWalletClient,http,toHex} from 'viem';
import {mnemonicToAccount} from 'viem/accounts';
import {hardhat} from 'viem/chains';

// Public Hardhat development mnemonic. Never fund these accounts on public chains.
const mnemonic='test test test test test test test test test test test junk';
const names=['buyer','seller','admin','superAdmin','treasury','evidenceSigner','outsider','deployer','sender'];
const accounts=Object.fromEntries(names.map((name,index)=>[name,mnemonicToAccount(mnemonic,{addressIndex:index})]));
const directory=resolve('.runtime/acceptance'),app=resolve(directory,'app');mkdirSync(app,{recursive:true});
const rpcUrl='http://127.0.0.1:8545';const client=createPublicClient({chain:hardhat,transport:http(rpcUrl)});
if(await client.getChainId()!==31337)throw new Error('Acceptance setup requires the separate local Hardhat chain.');
const output=execFileSync(process.execPath,[resolve('node_modules/supabase/dist/supabase.js'),'status','--workdir',directory,'--output','json'],{stdio:['pipe','pipe','pipe']}).toString();
const settings=JSON.parse(output.slice(output.indexOf('{'),output.lastIndexOf('}')+1));
if(settings.API_URL!=='http://127.0.0.1:54331')throw new Error('Unexpected acceptance database URL.');
const artifact=JSON.parse(readFileSync('contracts/artifacts/contracts/MarketplaceEscrow.sol/MarketplaceEscrow.json','utf8'));
const wallet=createWalletClient({account:accounts.deployer,chain:hardhat,transport:http(rpcUrl)});
const hash=await wallet.deployContract({abi:artifact.abi,bytecode:artifact.bytecode,args:[accounts.treasury.address,accounts.evidenceSigner.address,accounts.admin.address,accounts.superAdmin.address]});
const receipt=await client.waitForTransactionReceipt({hash});if(!receipt.contractAddress||receipt.status!=='success')throw new Error('Local deployment failed');
await client.request({method:'evm_setIntervalMining',params:[1000]});
const secret=randomBytes(32).toString('hex');
const state={appUrl:'http://localhost:3201',supabaseUrl:settings.API_URL,rpcUrl,chainId:31337,escrowAddress:receipt.contractAddress,deployHash:hash,startBlock:String(receipt.blockNumber),roles:Object.fromEntries(names.map(n=>[n,accounts[n].address.toLowerCase()]))};
const credentials={publishableKey:settings.PUBLISHABLE_KEY,serviceKey:settings.SECRET_KEY,indexerSecret:secret};
writeFileSync(resolve(directory,'state.json'),JSON.stringify(state,null,2));writeFileSync(resolve(directory,'credentials.json'),JSON.stringify(credentials),{mode:0o600});
const key=name=>toHex(accounts[name].getHdKey().privateKey);
writeFileSync(resolve(app,'.env.local'),Object.entries({NEXT_PUBLIC_SUPABASE_URL:settings.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:settings.PUBLISHABLE_KEY,SUPABASE_SECRET_KEY:settings.SECRET_KEY,NEXT_PUBLIC_ESCROW_ADDRESS:receipt.contractAddress,ESCROW_ADDRESS:receipt.contractAddress,ESCROW_CHAIN_ID:'31337',ESCROW_RPC_URL:'http://127.0.0.1:8546',ESCROW_START_BLOCK:String(receipt.blockNumber),EVIDENCE_SIGNER_PRIVATE_KEY:key('evidenceSigner'),INDEXER_SENDER_PRIVATE_KEY:key('sender'),INDEXER_SECRET:secret}).map(([n,v])=>`${n}=${v}`).join('\n'),{mode:0o600});
for(const file of['package.json','next.config.ts','tsconfig.json','postcss.config.mjs'])cpSync(file,resolve(app,file));
// Next dev's watcher skips a source junction under an ignored directory on Windows.
const source=resolve(app,'src');if(existsSync(source)&&lstatSync(source).isSymbolicLink())unlinkSync(source);
cpSync(resolve('src'),source,{recursive:true});
for(const folder of['public','packages','contracts','node_modules'])if(!existsSync(resolve(app,folder)))symlinkSync(resolve(folder),resolve(app,folder),'junction');
execFileSync('docker',['exec','-i','supabase_db_notbit-acceptance','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-q'],{input:`insert into public.staff_wallets(wallet,role) values('${state.roles.admin}','ADMIN'),('${state.roles.superAdmin}','SUPER_ADMIN') on conflict(wallet) do nothing;`,stdio:['pipe','pipe','pipe']});
console.log('Acceptance Supabase/Contract/app settings prepared. Public contract: '+state.escrowAddress);
