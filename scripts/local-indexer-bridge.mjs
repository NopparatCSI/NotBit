import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);
const secret = process.env.INDEXER_SECRET || process.env.CRON_SECRET;
if (!secret || secret.length < 32) throw new Error("Configure an indexer secret before starting the local bridge.");
const target = new URL("/api/v1/internal/indexer", process.env.LOCAL_APP_URL || "http://127.0.0.1:3001");
if (!["127.0.0.1", "localhost"].includes(target.hostname)) throw new Error("The bridge target must be local.");
const expected = Buffer.from(`Bearer ${secret}`);
createServer(async (req, res) => {
  const actual = Buffer.from(req.headers.authorization || "");
  if (req.url !== "/api/v1/internal/indexer" || !["GET", "POST"].includes(req.method || "")) { res.writeHead(404).end(); return; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) { res.writeHead(401).end(); return; }
  try {
    const response = await fetch(target, { method: "POST", headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(60000) });
    res.writeHead(response.status, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(await response.text());
  } catch { res.writeHead(503).end('{"error":{"code":"UNAVAILABLE","message":"Local app unavailable."}}'); }
}).listen(Number(process.env.INDEXER_BRIDGE_PORT || 3301), "0.0.0.0", () => console.log("Local indexer bridge ready; only the authenticated indexer route is forwarded."));
