import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client（使用 service_role key）
 * Lazy initialization — 避免 build 階段 env 未注入時報錯
 */
let _client: SupabaseClient | null = null;

// Hardcode fallback（和 next.config.ts 的 env 一致）
const FALLBACK_URL = "https://thpdbrqadcdixtqhvigg.supabase.co";
const FALLBACK_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export function getSupabaseServer(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || FALLBACK_KEY;

  if (!key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY env var"
    );
  }

  _client = createClient(url, key);
  return _client;
}
