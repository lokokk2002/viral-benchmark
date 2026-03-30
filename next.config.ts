import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 確保環境變數在 runtime 正確注入（解決 Zeabur build-time 未注入問題）
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
};

export default nextConfig;
