import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ProjectProvider } from "@/lib/project-context";
import Sidebar from "@/components/sidebar";
import MobileNav from "@/components/mobile-nav";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hant"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-screen flex flex-col md:flex-row">
        <ProjectProvider>
          <MobileNav />
          <div className="hidden md:flex md:shrink-0">
            <Sidebar />
          </div>
          <main className="flex-1 overflow-auto pt-14 md:pt-0">{children}</main>
        </ProjectProvider>
      </body>
    </html>
  );
}
