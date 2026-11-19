import {describe,expect,it} from "vitest";
import {privateKeyToAccount,generatePrivateKey} from "viem/accounts";
import {validateReleaseEnvironment} from "../scripts/release/environment.mjs";

function environment(){
  const key=generatePrivateKey();
  return {NEXT_PUBLIC_SUPABASE_URL:"https://fkhboutupdlaxdhmtkjx.supabase.co",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_fixture",SUPABASE_SECRET_KEY:"sb_secret_fixture",ESCROW_CHAIN_ID:"11155111",NEXT_PUBLIC_ESCROW_ADDRESS:"0x1111111111111111111111111111111111111111",SEPOLIA_TREASURY_ADDRESS:"0x2222222222222222222222222222222222222222",SEPOLIA_EVIDENCE_SIGNER_ADDRESS:privateKeyToAccount(key).address,SEPOLIA_ADMIN_ADDRESS:"0x3333333333333333333333333333333333333333",SEPOLIA_SUPER_ADMIN_ADDRESS:"0x4444444444444444444444444444444444444444",ESCROW_START_BLOCK:"123",ESCROW_DEPLOY_TX_HASH:`0x${"1".repeat(64)}`,ESCROW_RPC_URL:"https://rpc.example.test",EVIDENCE_SIGNER_PRIVATE_KEY:key,INDEXER_SENDER_PRIVATE_KEY:generatePrivateKey(),INDEXER_SECRET:"x".repeat(64)};
}
describe("online release configuration boundaries",()=>{
  it("accepts the selected Cloud project and distinct Sepolia roles",()=>expect(validateReleaseEnvironment(environment())).toEqual([]));
  it("rejects local database, wrong chain and browser/server contract drift",()=>{
    const issues=validateReleaseEnvironment({...environment(),NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:54321",ESCROW_CHAIN_ID:"31337",ESCROW_ADDRESS:"0x5555555555555555555555555555555555555555"});
    expect(issues.map(i=>i.field)).toEqual(expect.arrayContaining(["NEXT_PUBLIC_SUPABASE_URL","ESCROW_CHAIN_ID","ESCROW_ADDRESS"]));
  });
  it("rejects key-shaped addresses without putting the value in the diagnostic",()=>{
    const env=environment(),mistake=generatePrivateKey();const issues=validateReleaseEnvironment({...env,SEPOLIA_TREASURY_ADDRESS:mistake});
    expect(issues.some(i=>i.field==="SEPOLIA_TREASURY_ADDRESS")).toBe(true);expect(JSON.stringify(issues)).not.toContain(mistake);
  });
  it("rejects mismatched signers and the old exposed online credentials",()=>{
    const issues=validateReleaseEnvironment({...environment(),SEPOLIA_EVIDENCE_SIGNER_ADDRESS:"0xd89aff5edc4310114bd436fe66357ebc5eb8f001",SEPOLIA_TREASURY_ADDRESS:"0x9ac1ca9fe5994ead03392168660186d149312a0e"});
    expect(issues.map(i=>i.field)).toEqual(expect.arrayContaining(["EVIDENCE_SIGNER_PRIVATE_KEY","SEPOLIA_EVIDENCE_SIGNER_ADDRESS","SEPOLIA_TREASURY_ADDRESS"]));
  });
  it("rejects missing server credentials and shared staff wallets",()=>{
    const env=environment();const issues=validateReleaseEnvironment({...env,SUPABASE_SECRET_KEY:"",INDEXER_SECRET:"short",SEPOLIA_SUPER_ADMIN_ADDRESS:env.SEPOLIA_ADMIN_ADDRESS});
    expect(issues.map(i=>i.field)).toEqual(expect.arrayContaining(["SUPABASE_SECRET_KEY","INDEXER_SECRET","SEPOLIA_SUPER_ADMIN_ADDRESS"]));
  });
});
