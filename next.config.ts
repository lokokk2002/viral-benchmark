import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 硬寫 public key 確保 Zeabur build-time 一定拿到（這些是 anon key，非機密）
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://thpdbrqadcdixtqhvigg.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_78U0n8QrTMSBqyx5A7dfoA_M0j3MFUO",
  },
};

export default nextConfig;
