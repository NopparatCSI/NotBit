import { timingSafeEqual } from "node:crypto";
import { fail, ok } from "@/lib/api/response";
import { redactError } from "@/lib/indexer/plan";
import { runIndexer } from "@/lib/indexer/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  // INDEXER_SECRET for Supabase Cron. CRON_SECRET is what Vercel Cron sends, if used.
  return [process.env.INDEXER_SECRET, process.env.CRON_SECRET].some((secret) => {
    if (!secret || secret.length < 32) return false;
    const expected = Buffer.from(`Bearer ${secret}`);
    const actual = Buffer.from(header);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}

// Called every minute by Supabase Cron. Reads confirmed escrow events, updates the
// projection and checkpoint atomically, then escalates overdue orders to staff review.
async function run(request: Request) {
  if (!authorized(request)) return fail(401, "UNAUTHENTICATED", "Missing or invalid indexer secret.");
  try {
    return ok(await runIndexer());
  } catch (error) {
    // Leave state untouched. The next run retries from the stored checkpoint.
    console.error("indexer run failed:", redactError(error));
    return fail(503, "UNAVAILABLE", redactError(error));
  }
}

export const GET = run;
export const POST = run;