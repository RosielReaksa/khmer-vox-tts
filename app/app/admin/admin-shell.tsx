"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { AdminQueryProvider } from "@/app/app/admin/admin-query-provider";
import { AdminPanelSkeleton } from "@/app/app/admin/admin-shared";

type AdminShellProps = {
  children: ReactNode;
  userEmail: string;
};

type AdminNavItem = {
  href: string;
  label: string;
  shortLabel: string;
  match?: string;
};

const primaryNavItems: AdminNavItem[] = [
  { href: "/app/admin", label: "Overview", shortLabel: "OV" },
  { href: "/app/admin/customers", label: "Customers", shortLabel: "CU" },
  { href: "/app/admin/business", label: "Business API", shortLabel: "BA" },
  { href: "/app/admin/usage", label: "Usage", shortLabel: "US" },
  { href: "/app/admin/activity", label: "Activity Log", shortLabel: "AL" },
  { href: "/app/admin/errors", label: "API Error Log", shortLabel: "EL" },
  { href: "/app/admin/jobs", label: "Worker Queue", shortLabel: "WQ" },
  { href: "/app/admin/payments", label: "Payments", shortLabel: "PM" },
  { href: "/app/admin/payway-application", label: "PayWay App", shortLabel: "PA" },
  { href: "/app/admin/payment-support", label: "Payment Support", shortLabel: "SP" },
  { href: "/app/admin/payment-webhooks", label: "PayWay Webhooks", shortLabel: "WH" },
  { href: "/app/admin/payment-telegram", label: "Telegram Pay", shortLabel: "TG" },
  { href: "/app/admin/modal", label: "Modal Pool", shortLabel: "MP" },
  { href: "/app/admin/system", label: "System Checks", shortLabel: "SY" },
];

const exportItems: AdminNavItem[] = [
  { href: "/api/admin/export/customers", label: "Export Customers CSV", shortLabel: "EC" },
  { href: "/api/admin/export/jobs", label: "Export Jobs CSV", shortLabel: "EJ" },
];

export function AdminShell({ children, userEmail }: AdminShellProps) {
  const pathname = usePathname();
  const [optimisticPath, setOptimisticPath] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const displayPath = optimisticPath ?? pathname;
  const loadingLabel = useMemo(() => getLoadingLabel(displayPath), [displayPath]);
  const isRouteLoading = optimisticPath !== null && optimisticPath !== pathname;

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [displayPath]);

  useEffect(() => {
    if (optimisticPath && optimisticPath === pathname) {
      const timeout = window.setTimeout(() => setOptimisticPath(null), 0);
      return () => window.clearTimeout(timeout);
    }
  }, [optimisticPath, pathname]);

  useEffect(() => {
    function onNavigationIntent(event: Event) {
      const href =
        event instanceof CustomEvent && typeof event.detail?.href === "string"
          ? event.detail.href
          : "";
      if (!href.startsWith("/app/admin")) return;

      const url = new URL(href, window.location.origin);
      if (url.pathname === pathname) return;
      setOptimisticPath(url.pathname);
    }

    window.addEventListener("khmer-vox:navigation-intent", onNavigationIntent);
    return () => {
      window.removeEventListener("khmer-vox:navigation-intent", onNavigationIntent);
    };
  }, [pathname]);

  async function signOut() {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } finally {
      window.location.replace("/app/signin");
    }
  }

  return (
    <AdminQueryProvider>
    <div className="h-screen overflow-hidden bg-background text-primary font-body">
      <div className="flex h-screen min-h-0">
        <aside className="flex h-screen w-[252px] shrink-0 flex-col border-r-4 border-primary bg-surface max-md:w-[78px]">
          <div className="flex h-[74px] items-center gap-3 border-b-4 border-primary px-4 max-md:justify-center max-md:px-2">
            <Link
              href="/app/admin"
              className="grid h-11 w-11 shrink-0 place-items-center border-2 border-primary bg-primary-fixed text-sm font-headline font-black text-primary uppercase shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-surface-container-high transition-colors"
              title="Admin overview"
            >
              KV
            </Link>
            <div className="min-w-0 max-md:hidden">
              <p className="text-sm font-headline font-bold uppercase text-primary leading-none">Khmer Vox TTS</p>
              <p className="text-[10px] font-label font-bold text-on-surface-variant uppercase mt-1">Admin Panel</p>
            </div>
          </div>

          <nav className="smooth-scroll-region flex-1 overflow-y-auto px-3 py-4 max-md:px-2">
            <SidebarGroup label="Admin">
              {primaryNavItems.map((item) => (
                <SidebarLink key={item.href} item={item} active={isActive(displayPath, item.href)} />
              ))}
            </SidebarGroup>

            <SidebarGroup label="Exports">
              {exportItems.map((item) => (
                <SidebarLink key={item.href} item={item} active={false} external />
              ))}
            </SidebarGroup>
          </nav>

          <div className="border-t-2 border-primary p-3 max-md:px-2 bg-surface-container-low">
            <div className="mb-3 border-2 border-primary bg-[#f2ede5] p-3 max-md:hidden shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
              <p className="text-[10px] font-headline font-bold uppercase text-on-surface-variant">Signed in</p>
              <p className="mt-1 truncate text-xs font-body font-bold text-primary">{userEmail}</p>
            </div>
            <div className="grid gap-2">
              <SidebarUtilityLink href="/app/dashboard" label="Dashboard" shortLabel="DB" />
              <SidebarUtilityLink href="/" label="Public Site" shortLabel="PS" />
              <button
                type="button"
                onClick={signOut}
                className="flex h-11 items-center gap-3 border-2 border-transparent hover:border-primary hover:bg-surface-container-high px-3 text-left text-sm font-headline font-bold uppercase tracking-wider max-md:justify-center max-md:px-0 transition-all cursor-pointer"
                title="Log out"
              >
                <span className="grid h-7 w-7 place-items-center border-2 border-primary bg-[#ffb3ab] text-primary text-[11px] font-headline font-black">LO</span>
                <span className="max-md:hidden">Log out</span>
              </button>
            </div>
          </div>
        </aside>

        <main ref={mainRef} className="smooth-scroll-region min-w-0 flex-1 overflow-y-auto p-6 md:p-8 bg-background">
          <div key={displayPath} className="dashboard-enter min-w-0">
            {isRouteLoading ? <AdminPanelSkeleton label={loadingLabel} /> : children}
          </div>
        </main>
      </div>
    </div>
    </AdminQueryProvider>
  );
}

function SidebarGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <p className="mb-2 px-3 text-[10px] font-label font-black uppercase tracking-[0.14em] text-on-surface-variant max-md:hidden">
        {label}
      </p>
      <div className="grid gap-1">{children}</div>
    </div>
  );
}

function SidebarLink({
  item,
  active,
  external = false,
}: {
  item: AdminNavItem;
  active: boolean;
  external?: boolean;
}) {
  return (
    <Link
      href={item.href}
      prefetch={external ? false : undefined}
      className={`flex h-11 items-center gap-3 border-2 px-3 text-sm font-headline font-bold uppercase tracking-wider max-md:justify-center max-md:px-0 transition-all ${
        active
          ? "bg-primary-fixed text-primary border-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] translate-x-0.5 -translate-y-0.5"
          : "text-primary border-transparent hover:border-primary hover:bg-surface-container-high"
      }`}
      title={item.label}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
    >
      <span className={`grid h-7 w-7 place-items-center border-2 text-[11px] font-headline font-black ${
        active ? "bg-primary text-surface border-primary" : "bg-[#f2ede5] text-primary border-primary"
      }`}>
        {item.shortLabel}
      </span>
      <span className="max-md:hidden">{item.label}</span>
    </Link>
  );
}

function SidebarUtilityLink({ href, label, shortLabel }: AdminNavItem) {
  return (
    <Link
      href={href}
      className="flex h-11 items-center gap-3 border-2 border-transparent hover:border-primary hover:bg-surface-container-high px-3 text-sm font-headline font-bold uppercase tracking-wider max-md:justify-center max-md:px-0 transition-all"
      title={label}
    >
      <span className="grid h-7 w-7 place-items-center border-2 border-primary bg-[#f2ede5] text-primary text-[11px] font-headline font-black">
        {shortLabel}
      </span>
      <span className="max-md:hidden">{label}</span>
    </Link>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/app/admin") return pathname === href;
  return pathname.startsWith(href);
}

function getLoadingLabel(pathname: string): string {
  if (pathname.startsWith("/app/admin/customers/")) return "Opening customer details";
  const item = primaryNavItems.find((navItem) => isActive(pathname, navItem.href));
  return item ? `Opening ${item.label}` : "Opening admin page";
}
