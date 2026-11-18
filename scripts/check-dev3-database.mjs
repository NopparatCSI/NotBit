import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { keccak256 } from "viem";

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local or the server environment.");
  process.exit(1);
}

const database = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
console.log(`Database: ${new URL(url).origin}`);
const checks = {
  staff_order_overview: "id,status,on_chain,deadline,in_review_at,resolved_at,conversation_id,buyer_id,seller_id,amount_wei",
  evidence: "id,order_id,object_path,file_hash,stage,submitted_by",
  evidence_receipts: "id,order_id,evidence_ids,evidence_hash,signature",
  decision_drafts: "id,order_id,staff_id,decision_hash",
  audit_logs: "id,staff_id,order_id,action,details",
  chain_events: "tx_hash,log_index,block_number,block_hash,block_timestamp,payload",
  chain_checkpoints: "chain_id,escrow_address,block_number,block_hash",
  order_escalations: "order_id,tx_hash,attempts,sent_at",
  staff_wallets: "wallet,role",
  escrow_payout_balances: "chain_id,escrow_address,wallet,pending_wei",
  escrow_funding_state: "chain_id,escrow_address,funding_paused,block_number",
};
let failures = 0;
await Promise.all(Object.entries(checks).map(async ([table, columns]) => {
  const { error } = await database.from(table).select(columns).limit(0);
  if (error) {
    failures++;
    // Never print provider responses that could contain URLs/credentials.
    console.error(`FAIL ${table}: ${error.code || "connection failed"}. Check the server key and pending migrations.`);
  } else console.log(`OK ${table}`);
}));

const { data: bucket, error: bucketError } = await database.storage.getBucket("order-evidence");
const types = bucket?.allowed_mime_types ?? [];
if (bucketError || !bucket || bucket.public || bucket.file_size_limit !== 10 * 1024 * 1024
  || !["image/jpeg", "image/png", "image/webp"].every(type => types.includes(type))) {
  failures++;
  console.error("FAIL order-evidence: expected a private bucket with a 10 MB image limit. Check storage migrations.");
} else console.log("OK private order-evidence bucket (10 MB, JPEG/PNG/WebP)");

if (process.argv.includes("--storage-write")) {
  // Opt-in round trip. Delete only the fresh diagnostic object created by this run.
  const path = `_connection-check/${crypto.randomUUID()}.png`;
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==", "base64");
  let uploaded = false;
  try {
    const upload = await database.storage.from("order-evidence").upload(path, bytes, { contentType: "image/png", upsert: false });
    if (upload.error) throw new Error("upload");
    uploaded = true;
    const signed = await database.storage.from("order-evidence").createSignedUrl(path, 60);
    if (signed.error || !signed.data) throw new Error("signed URL");
    const read = await fetch(signed.data.signedUrl);
    if (!read.ok || keccak256(new Uint8Array(await read.arrayBuffer())) !== keccak256(bytes)) throw new Error("file hash");
    const publicFile = database.storage.from("order-evidence").getPublicUrl(path);
    if ((await fetch(publicFile.data.publicUrl)).ok) throw new Error("private access");
    console.log("OK storage upload / signed download / file hash / public access denied");
  } catch {
    failures++;
    console.error("FAIL storage round trip. Check bucket access and the server key.");
  } finally {
    if (uploaded) {
      const cleanup = await database.storage.from("order-evidence").remove([path]);
      if (cleanup.error) {
        failures++;
        console.error(`FAIL removing diagnostic object: ${path}`);
      } else console.log("OK diagnostic storage object removed");
    }
  }
}

const now = new Date().toISOString();
const queues = {
  review: database.from("staff_order_overview").select("id").eq("on_chain", true).eq("status", "IN_REVIEW").order("in_review_at").limit(100),
  overdue: database.from("staff_order_overview").select("id").eq("on_chain", true).in("status", ["FUNDED", "DELIVERED"]).lte("deadline", now).order("deadline").limit(100),
  resolved: database.from("staff_order_overview").select("id").eq("on_chain", true).not("resolved_at", "is", null).order("resolved_at", { ascending: false }).limit(10),
};
for (const [name, query] of Object.entries(queues)) {
  const { data, error } = await query;
  if (error) {
    failures++;
    console.error(`FAIL ${name} queue: ${error.code || "connection failed"}`);
  } else console.log(`OK ${name} queue: ${data.length} rows`);
}

// These are separate from database connectivity. Missing keys must not be invented.
for (const name of ["EVIDENCE_SIGNER_PRIVATE_KEY", "ESCROW_START_BLOCK", "INDEXER_SENDER_PRIVATE_KEY"]) {
  console.log(`${process.env[name] ? "CONFIGURED" : "MISSING"} ${name}`);
}
console.log(`${process.env.INDEXER_SECRET || process.env.CRON_SECRET ? "CONFIGURED" : "MISSING"} indexer endpoint secret`);
console.log(failures ? `Database checks failed: ${failures}` : "Database checks passed. Signing and scheduled indexing require their own configuration.");
process.exitCode = failures ? 1 : 0;
