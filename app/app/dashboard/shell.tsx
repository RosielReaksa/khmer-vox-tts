"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { DashboardUserProvider } from "@/app/app/dashboard/dashboard-user-context";
import { DashboardQueryProvider } from "@/app/app/dashboard/dashboard-query-provider";
import { DashboardSpa } from "@/app/app/dashboard/dashboard-spa";

type DashboardShellProps = {
  children: React.ReactNode;
  userEmail: string;
  isAdmin: boolean;
  tokenBalance: number;
  suspendedAt: string | null;
  suspendedReason: string | null;
};

const navItems = [
  { href: "/app/dashboard", label: "Text to Speech", icon: GridIcon },
  { href: "/app/dashboard/voice-cloning", label: "Voice Cloning", icon: VoiceIcon },
  { href: "/app/dashboard/voices", label: "Saved Voices", icon: MicIcon },
  { href: "/app/dashboard/history", label: "History", icon: HistoryIcon },
  { href: "/app/dashboard/jobs", label: "Batch Jobs", icon: JobsIcon },
  { href: "/app/dashboard/business", label: "Business", icon: BusinessIcon },
  { href: "/app/dashboard/api", label: "API", icon: KeyIcon },
  { href: "/app/dashboard/analytics", label: "Analytics", icon: AnalyticsIcon },
  { href: "/app/dashboard/billing", label: "Billing", icon: CardIcon },
] as const;

const sectionTitles: Array<{ prefix: string; title: string }> = [
  { prefix: "/app/dashboard/settings", title: "Settings" },
  { prefix: "/app/dashboard/voice-cloning", title: "Voice Cloning" },
  { prefix: "/app/dashboard/voices", title: "Saved Voices" },
  { prefix: "/app/dashboard/history", title: "History" },
  { prefix: "/app/dashboard/jobs", title: "Batch Jobs" },
  { prefix: "/app/dashboard/business", title: "Business API" },
  { prefix: "/app/dashboard/api", title: "API" },
  { prefix: "/app/dashboard/analytics", title: "Analytics" },
  { prefix: "/app/dashboard/billing", title: "Billing" },
  { prefix: "/app/dashboard", title: "Generate Speech" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/app/dashboard") return pathname === href;
  return pathname.startsWith(href);
}

function getSectionTitle(pathname: string): string {
  const match = sectionTitles.find((item) => pathname.startsWith(item.prefix));
  return match?.title ?? "Dashboard";
}

export function DashboardShell({
  children,
  userEmail,
  isAdmin,
  tokenBalance,
  suspendedAt,
  suspendedReason,
}: DashboardShellProps) {
  const pathname = usePathname() ?? "/app/dashboard";
  const searchParams = useSearchParams();
  const initialPath = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);
  const [spaReady, setSpaReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [clientPath, setClientPath] = useState(initialPath);
  const [liveTokenBalance, setLiveTokenBalance] = useState(tokenBalance);
  const mainRef = useRef<HTMLElement | null>(null);
  const avatarLetter = userEmail.slice(0, 1).toUpperCase();
  const sectionTitle = useMemo(() => getSectionTitle(clientPath), [clientPath]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSpaReady(true), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.classList.add("no-scroll");
    } else {
      document.body.classList.remove("no-scroll");
    }
    return () => {
      document.body.classList.remove("no-scroll");
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setClientPath(initialPath), 0);
    return () => window.clearTimeout(timeout);
  }, [initialPath]);

  useEffect(() => {
    function onPopState() {
      setClientPath(`${window.location.pathname}${window.location.search}`);
    }

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [clientPath]);

  useEffect(() => {
    async function refreshUser() {
      try {
        const response = await fetch("/api/me", { cache: "no-store" });
        const data = (await response.json()) as {
          user?: {
            tokenBalance?: number;
          } | null;
        };
        if (response.ok && typeof data.user?.tokenBalance === "number") {
          setLiveTokenBalance(data.user.tokenBalance);
        }
      } catch {
        // Keep the last known balance; polling should not interrupt dashboard work.
      }
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshUser();
      }
    }, 60000);
    window.addEventListener("focus", refreshUser);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshUser);
    };
  }, []);

  function navigateTo(href: string) {
    if (href === `${window.location.pathname}${window.location.search}`) return;
    window.dispatchEvent(new Event("khmer-vox:navigation-start"));
    window.history.pushState(null, "", href);
    setClientPath(href);
    window.setTimeout(() => {
      window.dispatchEvent(new Event("khmer-vox:navigation-end"));
    }, 120);
  }

  function navigate(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    navigateTo(href);
  }

  async function signOut() {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } finally {
      window.location.replace("/app/signin");
    }
  }

  return (
    <DashboardUserProvider
      value={{
        email: userEmail,
        tokenBalance: liveTokenBalance,
        setTokenBalance: setLiveTokenBalance,
        suspendedAt,
        suspendedReason,
      }}
    >
    <div className="h-screen overflow-hidden bg-[#f5f0e8] text-[#1a1a1a] font-body">
      <div className="flex h-screen min-h-0">
        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            {/* Backdrop overlay */}
            <div
              className="fixed inset-0 bg-[#1a1a1a]/40 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
            />
            {/* Drawer container */}
            <div className="fixed inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col border-r-4 border-primary bg-[#f5f0e8] shadow-[4px_0px_0px_0px_rgba(26,26,26,1)]">
              {/* Drawer Header */}
              <div className="flex h-[72px] shrink-0 items-center justify-between border-b-4 border-primary bg-[#ffcc00] px-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-10 w-10 items-center justify-center border-2 border-primary bg-primary text-[#faf7f2] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                    <LogoIcon />
                  </span>
                  <span className="font-headline font-black text-sm uppercase tracking-tight text-primary">Khmer Vox TTS</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex h-10 w-10 items-center justify-center border-2 border-primary bg-white text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#ffdad6] hover:text-[#93000a] transition-colors cursor-pointer"
                  title="Close Menu"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Drawer Balance Info */}
              <div className="p-4 border-b-4 border-primary bg-white">
                <div className="border-2 border-primary bg-[#f5f0e8] p-3 text-xs font-headline font-bold uppercase shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                  <p className="text-[#4a4a4a]">Credits Balance</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <p className="text-base font-black text-primary">
                      {liveTokenBalance.toLocaleString()} Tokens
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        navigateTo("/app/dashboard/billing");
                        setMobileMenuOpen(false);
                      }}
                      className="font-headline font-black text-[10px] uppercase bg-[#ffcc00] border-2 border-primary px-2 py-1 shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] hover:bg-[#e6b800] cursor-pointer"
                    >
                      Buy Tokens
                    </button>
                  </div>
                </div>
              </div>

              {/* Drawer Nav Items */}
              <nav className="flex-1 overflow-y-auto p-4 space-y-3">
                {navItems.map((item) => {
                  const active = isActive(clientPath, item.href);
                  const Icon = item.icon;
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      data-spa-navigation="true"
                      onClick={(event) => {
                        navigate(event, item.href);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex items-center gap-3 w-full border-2 border-primary p-3 transition-all duration-100 ease-linear shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] font-headline font-bold uppercase text-xs ${
                        active
                          ? "bg-[#ffcc00] text-primary translate-x-[1px] translate-y-[1px] shadow-none"
                          : "bg-[#faf7f2] text-[#4a4a4a] hover:bg-[#eee9e0]"
                      }`}
                    >
                      <span className="shrink-0"><Icon /></span>
                      <span>{item.label}</span>
                    </a>
                  );
                })}
              </nav>

              {/* Drawer Footer Actions */}
              <div className="p-4 border-t-4 border-primary bg-[#faf7f2] shrink-0">
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <a
                    href="/app/dashboard/settings"
                    data-spa-navigation="true"
                    onClick={(event) => {
                      navigate(event, "/app/dashboard/settings");
                      setMobileMenuOpen(false);
                    }}
                    className={`flex h-12 items-center justify-center border-2 border-primary transition-all duration-100 ease-linear shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] ${
                      clientPath.startsWith("/app/dashboard/settings")
                        ? "bg-[#ffcc00] text-primary translate-x-[1px] translate-y-[1px] shadow-none"
                        : "bg-white text-[#4a4a4a] hover:bg-[#eee9e0]"
                    }`}
                    title="Settings"
                  >
                    <SettingsIcon />
                  </a>
                  <a
                    href="/support"
                    className="flex h-12 items-center justify-center border-2 border-primary bg-white text-[#4a4a4a] hover:bg-[#eee9e0] transition-colors shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
                    title="Help"
                  >
                    <InfoIcon />
                  </a>
                  <button
                    type="button"
                    className="flex h-12 items-center justify-center border-2 border-primary bg-white text-[#4a4a4a] hover:bg-[#ffb3ab] transition-colors shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] cursor-pointer"
                    title="Log out"
                    onClick={signOut}
                  >
                    <LogoutIcon />
                  </button>
                </div>
                <div className="flex justify-between text-[10px] font-headline font-bold uppercase text-[#4a4a4a] select-none px-1">
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-[#0055ff]">
                    Terms
                  </a>
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-[#0055ff]">
                    Privacy
                  </a>
                  <a href="/refund-policy" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-[#0055ff]">
                    Refund Policy
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        <aside className="hidden lg:flex sticky top-0 h-screen w-[252px] shrink-0 flex-col border-r-4 border-primary bg-[#f5f0e8]">
          <div className="flex h-[72px] items-center gap-3 border-b-4 border-primary px-4 bg-[#ffcc00]">
            <a
              href="/app/dashboard"
              data-spa-navigation="true"
              onClick={(event) => navigate(event, "/app/dashboard")}
              className="flex h-11 w-11 shrink-0 items-center justify-center border-2 border-primary bg-primary text-[#faf7f2] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#ffcc00] hover:text-primary transition-colors duration-100"
              title="Khmer Vox TTS"
            >
              <LogoIcon />
            </a>
            <div className="min-w-0">
              <p className="text-sm font-headline font-black uppercase text-primary leading-none tracking-tight">Khmer Vox TTS</p>
              <p className="text-[10px] font-label font-bold text-on-surface-variant uppercase mt-1">V2.4.0</p>
            </div>
          </div>

          <nav className="mt-6 flex flex-1 flex-col gap-3 overflow-y-auto min-h-0 w-full no-scrollbar px-4 pb-4">
            {navItems.map((item) => {
              const active = isActive(clientPath, item.href);
              const Icon = item.icon;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  data-spa-navigation="true"
                  title={item.label}
                  aria-current={active ? "page" : undefined}
                  onClick={(event) => navigate(event, item.href)}
                  className={`flex h-12 items-center gap-3 w-full border-2 border-primary p-3 transition-all duration-100 ease-linear shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] font-headline font-bold uppercase text-xs cursor-pointer ${
                    active
                      ? "bg-[#ffcc00] text-primary translate-x-[1px] translate-y-[1px] shadow-none"
                      : "bg-[#faf7f2] text-[#4a4a4a] hover:bg-[#eee9e0] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]"
                  }`}
                >
                  <span className="shrink-0"><Icon /></span>
                  <span className="truncate">{item.label}</span>
                </a>
              );
            })}
          </nav>

          <div className="border-t-2 border-primary p-4 bg-[#faf7f2] shrink-0">
            <div className="grid grid-cols-3 gap-2 mb-3">
              <a
                href="/app/dashboard/settings"
                data-spa-navigation="true"
                onClick={(event) => navigate(event, "/app/dashboard/settings")}
                className={`flex h-12 items-center justify-center border-2 border-primary transition-all duration-100 ease-linear shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] ${
                  clientPath.startsWith("/app/dashboard/settings")
                    ? "bg-[#ffcc00] text-primary translate-x-[1px] translate-y-[1px] shadow-none"
                    : "bg-white text-[#4a4a4a] hover:bg-[#eee9e0]"
                }`}
                title="Settings"
              >
                <SettingsIcon />
              </a>
              <a
                href="/support"
                className="flex h-12 items-center justify-center border-2 border-primary bg-white text-[#4a4a4a] hover:bg-[#eee9e0] transition-colors shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
                title="Help"
              >
                <InfoIcon />
              </a>
              <button
                type="button"
                className="flex h-12 items-center justify-center border-2 border-primary bg-white text-[#4a4a4a] hover:bg-[#ffb3ab] transition-colors shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] cursor-pointer"
                title="Log out"
                onClick={signOut}
              >
                <LogoutIcon />
              </button>
            </div>
            <div className="flex justify-between text-[10px] font-headline font-bold uppercase text-[#4a4a4a] select-none px-1">
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-[#0055ff]">
                Terms
              </a>
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-[#0055ff]">
                Privacy
              </a>
              <a href="/refund-policy" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-[#0055ff]">
                Refund Policy
              </a>
            </div>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-[72px] shrink-0 items-center border-b-4 border-primary bg-[#f5f0e8] px-4 md:px-6">
            <button
              type="button"
              className="lg:hidden mr-3 flex h-10 w-10 items-center justify-center border-2 border-primary bg-white text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#eee9e0] cursor-pointer shrink-0"
              onClick={() => setMobileMenuOpen(true)}
              title="Open Menu"
            >
              <MenuIcon />
            </button>
            <p className="font-headline font-black text-lg md:text-xl uppercase tracking-tight text-primary truncate">{sectionTitle}</p>
            <div className="ml-auto flex items-center gap-3">
              <div className="hidden lg:inline-flex items-center gap-1 bg-[#10b981] text-white border-2 border-primary px-3 py-1.5 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] font-headline uppercase font-black text-xs">
                Balance: {liveTokenBalance.toLocaleString()} Tokens
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo("/app/dashboard/billing");
                }}
                className="hidden lg:inline-flex font-headline font-black text-xs uppercase bg-[#ffcc00] border-2 border-primary px-3 py-1.5 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#e6b800] active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
              >
                Buy Tokens
              </button>
              <button
                type="button"
                className="hidden lg:inline-flex items-center gap-1 font-headline font-bold text-xs uppercase border-2 border-primary px-3 py-1.5 bg-white shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
              >
                EN
              </button>
              <div className="relative">
                <button
                  type="button"
                  aria-expanded={menuOpen}
                  className="flex h-10 w-10 items-center justify-center border-2 border-primary bg-primary text-[#ffcc00] text-sm font-black uppercase shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#ffcc00] hover:text-primary transition-all duration-100 ease-linear cursor-pointer"
                  onClick={() => setMenuOpen((prev) => !prev)}
                  title={userEmail}
                >
                  {avatarLetter}
                </button>

                {menuOpen ? (
                  <div className="absolute right-0 top-12 z-30 w-64 border-4 border-primary bg-[#f5f0e8] p-4 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] text-[#1a1a1a]">
                    <p className="text-[10px] font-headline font-black uppercase text-[#4a4a4a]">Signed in</p>
                    <p className="mt-0.5 truncate text-sm font-semibold border-b-2 border-primary pb-2 mb-3">{userEmail}</p>
                    <div className="border-2 border-primary bg-white p-3 text-xs font-headline font-bold uppercase mb-3">
                      <p className="text-[#4a4a4a]">Available credits</p>
                      <p className="mt-1 text-base font-black text-primary">
                        {liveTokenBalance.toLocaleString()}
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <a
                        href="/app/dashboard/settings"
                        data-spa-navigation="true"
                        className="w-full text-left font-headline font-bold uppercase text-xs border-2 border-primary bg-white px-3 py-2 hover:bg-[#eee9e0] transition-colors"
                        onClick={(event) => {
                          navigate(event, "/app/dashboard/settings");
                          setMenuOpen(false);
                        }}
                      >
                        Settings
                      </a>
                      {isAdmin ? (
                        <>
                          <Link
                            href="/app/admin"
                            className="w-full text-left font-headline font-bold uppercase text-xs border-2 border-primary bg-white px-3 py-2 hover:bg-[#eee9e0] transition-colors"
                            onClick={() => setMenuOpen(false)}
                          >
                            Admin Overview
                          </Link>
                          <Link
                            href="/app/admin/customers"
                            className="w-full text-left font-headline font-bold uppercase text-xs border-2 border-primary bg-white px-3 py-2 hover:bg-[#eee9e0] transition-colors"
                            onClick={() => setMenuOpen(false)}
                          >
                            Admin Customers
                          </Link>
                          <Link
                            href="/app/admin/usage"
                            className="w-full text-left font-headline font-bold uppercase text-xs border-2 border-primary bg-white px-3 py-2 hover:bg-[#eee9e0] transition-colors"
                            onClick={() => setMenuOpen(false)}
                          >
                            Admin Usage
                          </Link>
                          <Link
                            href="/app/admin/jobs"
                            className="w-full text-left font-headline font-bold uppercase text-xs border-2 border-primary bg-white px-3 py-2 hover:bg-[#eee9e0] transition-colors"
                            onClick={() => setMenuOpen(false)}
                          >
                            Admin Batch Jobs
                          </Link>
                          <Link
                            href="/app/admin/payments"
                            className="w-full text-left font-headline font-bold uppercase text-xs border-2 border-primary bg-white px-3 py-2 hover:bg-[#eee9e0] transition-colors"
                            onClick={() => setMenuOpen(false)}
                          >
                            Admin Payments
                          </Link>
                          <Link
                            href="/app/admin/payment-webhooks"
                            className="w-full text-left font-headline font-bold uppercase text-xs border-2 border-primary bg-white px-3 py-2 hover:bg-[#eee9e0] transition-colors"
                            onClick={() => setMenuOpen(false)}
                          >
                            Payment Webhooks
                          </Link>
                          <Link
                            href="/app/admin/system"
                            className="w-full text-left font-headline font-bold uppercase text-xs border-2 border-primary bg-white px-3 py-2 hover:bg-[#eee9e0] transition-colors"
                            onClick={() => setMenuOpen(false)}
                          >
                            Admin System
                          </Link>
                        </>
                      ) : null}
                      <a
                        href="/app/dashboard/billing"
                        data-spa-navigation="true"
                        className="w-full text-left font-headline font-bold uppercase text-xs border-2 border-primary bg-white px-3 py-2 hover:bg-[#eee9e0] transition-colors"
                        onClick={(event) => {
                          navigate(event, "/app/dashboard/billing");
                          setMenuOpen(false);
                        }}
                      >
                        Billing
                      </a>
                      <div className="border-t-2 border-primary pt-2 mt-1 pb-1.5 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] font-headline font-bold uppercase text-[#4a4a4a] select-none">
                        <a
                          href="/terms"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline hover:text-[#0055ff]"
                        >
                          Terms
                        </a>
                        <a
                          href="/privacy"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline hover:text-[#0055ff] text-right"
                        >
                          Privacy
                        </a>
                        <a
                          href="/refund-policy"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline hover:text-[#0055ff] col-span-2 text-center"
                        >
                          Refund Policy
                        </a>
                      </div>
                      <button
                        type="button"
                        onClick={signOut}
                        className="w-full text-left font-headline font-bold uppercase text-xs border-2 border-primary bg-[#ffb3ab] px-3 py-2 hover:bg-[#e63b2e] hover:text-white transition-colors cursor-pointer"
                      >
                        Log out
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </header>
          <main ref={mainRef} className="smooth-scroll-region flex-1 overflow-y-auto p-4 md:p-5 lg:p-6 bg-[#f5f0e8]">
            {suspendedAt ? (
              <div className="mb-5 border-4 border-primary bg-[#ffdad6] p-4 text-sm font-bold text-[#93000a] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
                <span className="font-headline font-black uppercase text-base block mb-1">Account Suspended</span>
                Generation, API usage, key credentials creation, and checkout payments are currently blocked.
                {suspendedReason ? <p className="mt-1 font-body normal-case font-normal">Reason: {suspendedReason}</p> : null}
              </div>
            ) : null}
            <DashboardQueryProvider>
              {spaReady ? (
                <DashboardSpa activePath={clientPath} onNavigate={navigateTo} />
              ) : (
                children
              )}
            </DashboardQueryProvider>
          </main>
        </div>
      </div>
    </div>
    </DashboardUserProvider>
  );
}

function LogoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M40 40 L90 160 L105 160 L55 40 Z" fill="currentColor"/>
      <path d="M160 40 L110 160 L95 160 L145 40 Z" fill="#10b981"/>
      <rect x="90" y="145" width="20" height="15" fill="currentColor"/>
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function VoiceIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12a8 8 0 108-8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 4v6h6M12 8v5l3 2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function JobsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 6h14M5 12h14M5 18h14" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  );
}

function BusinessIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 20V5.8L12 3l7 2.8V20" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 9h2M8 13h2M14 9h2M14 13h2M10 20v-4h4v4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="8.5" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 12h8M17 12v3M20 12v2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 11v5M12 8h.01" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 17H6a2 2 0 01-2-2V9a2 2 0 012-2h4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M14 8l4 4-4 4M9 12h9" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 14.5A8.5 8.5 0 119.5 4 7 7 0 0020 14.5z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 9.2a2.8 2.8 0 100 5.6 2.8 2.8 0 000-5.6z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M20 13.2v-2.4l-2-.7a6.6 6.6 0 00-.6-1.4l.9-1.9-1.7-1.7-1.9.9c-.5-.3-.9-.5-1.4-.6L10.8 3h-2.4l-.7 2a6.6 6.6 0 00-1.4.6l-1.9-.9-1.7 1.7.9 1.9c-.3.5-.5.9-.6 1.4L1 10.8v2.4l2 .7c.1.5.3.9.6 1.4l-.9 1.9 1.7 1.7 1.9-.9c.5.3.9.5 1.4.6l.7 2h2.4l.7-2c.5-.1.9-.3 1.4-.6l1.9.9 1.7-1.7-.9-1.9c.3-.5.5-.9.6-1.4l2-.7z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function AnalyticsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 10a7 7 0 0014 0M12 17v4M8 21h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
