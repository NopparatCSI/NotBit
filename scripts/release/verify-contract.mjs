import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import solc from 'solc';
import {readReleaseEnvironment} from './environment.mjs';

try{
  const env=readReleaseEnvironment(),address=env.NEXT_PUBLIC_ESCROW_ADDRESS;
  if(!/^0x[0-9a-fA-F]{40}$/.test(address??'')||env.ESCROW_CHAIN_ID!=='11155111')throw new Error('A Sepolia deployment is required.');
  const artifact=JSON.parse(readFileSync('contracts/artifacts/contracts/MarketplaceEscrow.sol/MarketplaceEscrow.json','utf8'));
  const info=JSON.parse(readFileSync(`contracts/artifacts/build-info/${artifact.buildInfoId}.json`,'utf8'));
  const own=new Set(['project/contracts/MarketplaceEscrow.sol','project/contracts/EscrowSettlement.sol','project/contracts/IEscrow.sol']);
  const sources=Object.fromEntries(Object.entries(info.input.sources).filter(([name,value])=>typeof value.content==='string'&&(own.has(name)||name.startsWith('npm/@openzeppelin/contracts@5.6.1/'))));
  const settings={...info.input.settings,outputSelection:{[artifact.inputSourceName]:{[artifact.contractName]:['evm.bytecode.object','evm.deployedBytecode.object','metadata']}}};
  const stdJsonInput={language:'Solidity',sources,settings};
  assert.ok(solc.version().startsWith(info.solcLongVersion));
  const compiled=JSON.parse(solc.compile(JSON.stringify(stdJsonInput))).contracts?.[artifact.inputSourceName]?.[artifact.contractName];
  assert.equal('0x'+compiled.evm.bytecode.object,artifact.bytecode);assert.equal('0x'+compiled.evm.deployedBytecode.object,artifact.deployedBytecode);
  mkdirSync('.runtime/release',{recursive:true});
  const file=`.runtime/release/verification-${address.toLowerCase()}.json`;
  const input={stdJsonInput,compilerVersion:info.solcLongVersion,contractIdentifier:`${artifact.inputSourceName}:${artifact.contractName}`,creationTransactionHash:env.ESCROW_DEPLOY_TX_HASH};
  writeFileSync(file,JSON.stringify(input));
  const root='https://sourcify.dev/server',path=`${root}/v2/contract/11155111/${address}`;
  const request=(url,options={})=>fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(25000)});
  const lookup=await request(path);const found=lookup.ok?await lookup.json():null;
  if(found?.match==='exact_match'){console.log(JSON.stringify({verified:true,address,match:found.match,sourceFiles:Object.keys(sources).length}));process.exit(0);}
  if(!process.argv.includes('--submit')){console.log(JSON.stringify({prepared:true,verified:false,address,sourceFiles:Object.keys(sources).length}));process.exit(0);}
  const jobFile=`.runtime/release/verification-job-${address.toLowerCase()}.json`;
  let job=existsSync(jobFile)?JSON.parse(readFileSync(jobFile,'utf8')):null;
  if(!job){const response=await request(`${root}/v2/verify/11155111/${address}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});job=await response.json();if(!response.ok||!job.verificationId)throw new Error('Verification submission failed.');writeFileSync(jobFile,JSON.stringify({verificationId:job.verificationId}));}
  const status=await request(`${root}/v2/verify/${encodeURIComponent(job.verificationId)}`);const result=await status.json();
  console.log(JSON.stringify({verificationId:job.verificationId,complete:result.isJobCompleted,match:result.contract?.match??result.match??null}));
}catch{console.error('Source verification not completed. Provider details withheld; retry the saved verification job.');process.exitCode=1;}
