import "server-only";
import { createClient } from "@supabase/supabase-js";
import { ChatError } from "@/lib/trade/server";

export function createServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new ChatError(503, "UNAVAILABLE", "Server storage is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
