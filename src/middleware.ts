import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkSessionCookie } from "@/lib/session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 放行的路徑
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".png")
  ) {
    return NextResponse.next();
  }

  // 檢查 session cookie
  const sessionValue = request.cookies.get("vb_session")?.value;
  const isValid = checkSessionCookie(sessionValue);

  if (!isValid) {
    // 未登入 → 導向登入頁
    const loginUrl = new URL("/login", request.url);
    const response = NextResponse.redirect(loginUrl);
    // 清除過期 cookie
    if (sessionValue) {
      response.cookies.delete("vb_session");
    }
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
