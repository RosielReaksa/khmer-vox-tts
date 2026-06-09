"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function PublicHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (menuOpen) {
      document.body.classList.add("no-scroll");
    } else {
      document.body.classList.remove("no-scroll");
    }
    return () => {
      document.body.classList.remove("no-scroll");
    };
  }, [menuOpen]);

  const navLinks = [
    { href: "/#features", label: "Features" },
    { href: "/#pricing", label: "Pricing" },
    { href: "/business", label: "Business" },
    { href: "/docs", label: "API Docs" },
    { href: "/payments", label: "Payments" },
    { href: "/review", label: "Review" },
    { href: "/support", label: "Support" },
  ];

  const isActive = (href: string) => {
    if (href.startsWith("/#")) return false; // Hash links
    return pathname === href;
  };

  return (
    <>
      <header className="sticky top-0 z-50 flex justify-between items-center px-4 md:px-8 py-4 bg-background border-b-4 border-outline w-full">
        <div className="flex items-center gap-6">
          {/* Mobile Menu Toggle */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="md:hidden flex h-10 w-10 items-center justify-center border-2 border-outline bg-white text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#eee9e0] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer shrink-0"
            title="Open Menu"
          >
            <span className="material-symbols-outlined font-black">menu</span>
          </button>

          <Link href="/" className="group flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center border-2 border-outline bg-primary-fixed text-primary text-sm font-headline font-black uppercase tracking-tight shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
              KV
            </span>
            <span className="hidden sm:block text-left">
              <span className="block text-sm font-headline font-black uppercase tracking-tight text-primary">Khmer Vox TTS</span>
              <span className="block text-[10px] font-bold text-on-surface-variant tracking-normal">DEVELOPER PORTAL</span>
            </span>
          </Link>
        </div>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex gap-6 items-center font-headline font-bold uppercase text-primary text-xs lg:text-sm">
          {navLinks.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`py-1 hover:text-tertiary transition-all ${
                  active ? "border-b-4 border-secondary text-secondary" : ""
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/app/signin"
            className="hidden sm:inline-flex font-headline font-bold uppercase text-xs border-2 border-outline bg-white px-4 py-2 hover:bg-surface-variant transition-colors shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            LOGIN
          </Link>
          <Link
            href="/app/signup"
            className="px-4 py-2 bg-[#ffcc00] text-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#e6b800] transition-colors active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            Start Free
          </Link>
        </div>
      </header>

      {/* Mobile Drawer Overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-[100] md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-[#1a1a1a]/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMenuOpen(false)}
          />
          {/* Drawer Panel */}
          <div className="fixed inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col border-r-4 border-primary bg-[#f5f0e8] shadow-[4px_0px_0px_0px_rgba(26,26,26,1)]">
            <div className="flex h-[72px] shrink-0 items-center justify-between border-b-4 border-primary bg-[#ffcc00] px-4">
              <div className="flex items-center gap-2">
                <span className="grid h-10 w-10 place-items-center border-2 border-outline bg-primary text-white font-headline font-black text-sm uppercase tracking-tight shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                  KV
                </span>
                <span className="font-headline font-black text-xs uppercase tracking-tight text-primary">Khmer Vox TTS</span>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="flex h-10 w-10 items-center justify-center border-2 border-outline bg-white text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#ffdad6] hover:text-[#93000a] transition-colors cursor-pointer"
                title="Close Menu"
              >
                <span className="material-symbols-outlined font-black">close</span>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-4 space-y-3">
              {navLinks.map((link) => {
                const active = isActive(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 w-full border-2 border-primary p-3 transition-all duration-100 ease-linear shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] font-headline font-bold uppercase text-xs ${
                      active
                        ? "bg-[#ffcc00] text-primary translate-x-[1px] translate-y-[1px] shadow-none"
                        : "bg-[#faf7f2] text-[#4a4a4a] hover:bg-[#eee9e0]"
                    }`}
                  >
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="p-4 border-t-4 border-primary bg-[#faf7f2] grid grid-cols-2 gap-2">
              <Link
                href="/app/signin"
                onClick={() => setMenuOpen(false)}
                className="flex h-12 items-center justify-center border-2 border-primary bg-white text-primary font-headline font-black uppercase text-xs hover:bg-[#eee9e0] transition-colors shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
              >
                LOGIN
              </Link>
              <Link
                href="/app/signup"
                onClick={() => setMenuOpen(false)}
                className="flex h-12 items-center justify-center border-2 border-primary bg-[#ffcc00] text-primary font-headline font-black uppercase text-xs hover:bg-[#e6b800] transition-colors shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
              >
                SIGN UP
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
