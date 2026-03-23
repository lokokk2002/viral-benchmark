"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import Sidebar from "./sidebar";

export default function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // 路由切換自動關閉
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // 開啟時鎖定 body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <>
      {/* 頂部 Navbar — 僅手機顯示 */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 bg-sidebar-bg text-sidebar-text flex items-center justify-between px-4 h-14 shadow-md">
        <button
          onClick={() => setIsOpen(true)}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          aria-label="開啟選單"
        >
          <Menu size={24} />
        </button>
        <span className="text-sm font-medium truncate">爆款對標系統</span>
        <div className="w-9" />
      </header>

      {/* 遮罩 */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* 抽屜 */}
      <div
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-60 transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar onNavigate={() => setIsOpen(false)} />
      </div>
    </>
  );
}
