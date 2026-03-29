// =============================================
// 爆款對標系統 — Session 管理
// HMAC-SHA256 signed cookie, 不需額外套件
// =============================================

import { cookies } from "next/headers";

const COOKIE_NAME = "vb_session";
const SESSION_DAYS = 7;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

function getSecret(): string {
  return process.env.SESSION_SECRET || "fallback_dev_secret_do_not_use";
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function hmacVerify(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const expected = await hmacSign(payload, secret);
  return expected === signature;
}

/** 建立 session cookie（登入成功後呼叫） */
export async function createSession(): Promise<void> {
  const exp = Date.now() + SESSION_MS;
  const payload = JSON.stringify({ ok: true, exp });
  const payloadB64 = btoa(payload);
  const sig = await hmacSign(payloadB64, getSecret());
  const token = `${payloadB64}.${sig}`;

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

/** 驗證 session cookie（Server Component / API Route 呼叫） */
export async function verifySession(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(COOKIE_NAME);
    if (!cookie?.value) return false;

    const [payloadB64, sig] = cookie.value.split(".");
    if (!payloadB64 || !sig) return false;

    const valid = await hmacVerify(payloadB64, sig, getSecret());
    if (!valid) return false;

    const { exp } = JSON.parse(atob(payloadB64));
    return Date.now() < exp;
  } catch {
    return false;
  }
}

/** 刪除 session cookie（登出時呼叫） */
export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/**
 * 輕量檢查（給 middleware 用，不做 HMAC 驗證，只檢查過期）
 * middleware 拿不到 async cookies()，所以用 request.cookies
 */
export function checkSessionCookie(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;
  try {
    const [payloadB64] = cookieValue.split(".");
    if (!payloadB64) return false;
    const { exp } = JSON.parse(atob(payloadB64));
    return Date.now() < exp;
  } catch {
    return false;
  }
}
