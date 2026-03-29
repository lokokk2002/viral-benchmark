import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { ProjectProvider } from "@/lib/project-context";
import Sidebar from "@/components/sidebar";
import MobileNav from "@/components/mobile-nav";
import { checkSessionCookie } from "@/lib/session";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "爆款對標系統",
  description: "自動化短影音爆款發現、腳本生成、拍攝計畫產出",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 檢查登入狀態
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get("vb_session")?.value;
  const isLoggedIn = checkSessionCookie(sessionValue);

  return (
    <html
      lang="zh-Hant"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-screen flex flex-col md:flex-row">
        {isLoggedIn ? (
          <ProjectProvider>
            <MobileNav />
            <div className="hidden md:flex md:shrink-0">
              <Sidebar />
            </div>
            <main className="flex-1 overflow-auto pt-14 md:pt-0">
              {children}
            </main>
          </ProjectProvider>
        ) : (
          <main className="flex-1">{children}</main>
        )}
      </body>
    </html>
  );
}
