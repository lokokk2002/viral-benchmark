import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client（使用 service_role key）
 * Lazy initialization — 避免 build 階段 env 未注入時報錯
 */
let _client: SupabaseClient | null = null;

export function getSupabaseServer(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  _client = createClient(url, key);
  return _client;
}
