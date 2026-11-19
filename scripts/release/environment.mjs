import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { privateKeyToAccount } from 'viem/accounts';

export const cloudProject = 'fkhboutupdlaxdhmtkjx';
export function readReleaseEnvironment(file = '.env.preview.local') {
  return parseEnv(readFileSync(file, 'utf8'));
}
export function validateReleaseEnvironment(env) {
  const issues = [];
  const require = (ok, field, reason) => { if (!ok) issues.push({ field, reason }); };
  require(env.NEXT_PUBLIC_SUPABASE_URL === `https://${cloudProject}.supabase.co`, 'NEXT_PUBLIC_SUPABASE_URL', 'Use the selected Cloud project.');
  require(/^sb_publishable_/.test(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''), 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'A Cloud publishable key is required.');
  let serviceKey = /^sb_secret_/.test(env.SUPABASE_SECRET_KEY ?? '');
  if (!serviceKey) try { serviceKey = JSON.parse(Buffer.from(env.SUPABASE_SECRET_KEY.split('.')[1], 'base64url').toString()).role === 'service_role'; } catch {}
  require(serviceKey, 'SUPABASE_SECRET_KEY', 'A server secret key is required.');
  require(env.ESCROW_CHAIN_ID === '11155111', 'ESCROW_CHAIN_ID', 'Online demos must use Sepolia.');
  for (const name of ['NEXT_PUBLIC_ESCROW_ADDRESS', 'SEPOLIA_TREASURY_ADDRESS', 'SEPOLIA_EVIDENCE_SIGNER_ADDRESS', 'SEPOLIA_ADMIN_ADDRESS', 'SEPOLIA_SUPER_ADMIN_ADDRESS']) require(/^0x[0-9a-fA-F]{40}$/.test(env[name] ?? ''), name, 'A public address is required; never put a private key here.');
  require(env.SEPOLIA_ADMIN_ADDRESS?.toLowerCase() !== env.SEPOLIA_SUPER_ADMIN_ADDRESS?.toLowerCase(), 'SEPOLIA_SUPER_ADMIN_ADDRESS', 'The staff wallets must differ.');
  require(!env.ESCROW_ADDRESS || env.ESCROW_ADDRESS.toLowerCase() === env.NEXT_PUBLIC_ESCROW_ADDRESS?.toLowerCase(), 'ESCROW_ADDRESS', 'The server and browser must use the same escrow.');
  require(/^[1-9][0-9]*$/.test(env.ESCROW_START_BLOCK ?? ''), 'ESCROW_START_BLOCK', 'Use the actual deployment block.');
  require(/^0x[0-9a-fA-F]{64}$/.test(env.ESCROW_DEPLOY_TX_HASH ?? ''), 'ESCROW_DEPLOY_TX_HASH', 'Use the deployment transaction hash.');
  try { require(new URL(env.ESCROW_RPC_URL).protocol === 'https:', 'ESCROW_RPC_URL', 'Use an HTTPS Sepolia RPC.'); } catch { require(false, 'ESCROW_RPC_URL', 'Use an HTTPS Sepolia RPC.'); }
  for (const name of ['EVIDENCE_SIGNER_PRIVATE_KEY', 'INDEXER_SENDER_PRIVATE_KEY']) require(/^0x[0-9a-fA-F]{64}$/.test(env[name] ?? ''), name, 'A valid server-only signing key is required.');
  try { require(privateKeyToAccount(env.EVIDENCE_SIGNER_PRIVATE_KEY).address.toLowerCase() === env.SEPOLIA_EVIDENCE_SIGNER_ADDRESS?.toLowerCase(), 'EVIDENCE_SIGNER_PRIVATE_KEY', 'The signing key must match the deployed signer.'); } catch {}
  require(env.SEPOLIA_EVIDENCE_SIGNER_ADDRESS?.toLowerCase() !== '0xd89aff5edc4310114bd436fe66357ebc5eb8f001', 'SEPOLIA_EVIDENCE_SIGNER_ADDRESS', 'Use the new online signer because the old test key appeared in a log.');
  require(env.SEPOLIA_TREASURY_ADDRESS?.toLowerCase() !== '0x9ac1ca9fe5994ead03392168660186d149312a0e', 'SEPOLIA_TREASURY_ADDRESS', 'Use the new online treasury.');
  require((env.INDEXER_SECRET?.length ?? 0) >= 32, 'INDEXER_SECRET', 'Use a dedicated random bearer secret.');
  return issues;
}
