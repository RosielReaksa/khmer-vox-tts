"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

export type HeaderUser = {
  email: string;
  isAdmin?: boolean;
};

export function AppShell({
  children,
  initialUser,
}: {
  children: React.ReactNode;
  initialUser: HeaderUser | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [userOverride, setUserOverride] = useState<HeaderUser | null | undefined>(undefined);
  const user = userOverride === undefined ? initialUser : userOverride;
  const isDashboardRoute = pathname.startsWith("/app/dashboard");
  const isAdminRoute = pathname.startsWith("/app/admin");
  const isAuthRoute =
    pathname === "/app/signin" ||
    pathname === "/app/signup" ||
    pathname.startsWith("/app/forgot-password") ||
    pathname.startsWith("/app/reset-password");
  const isCheckoutRoute = pathname.startsWith("/app/checkout");

  async function signOut() {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } finally {
      setUserOverride(null);
      router.replace("/app/signin");
      router.refresh();
    }
  }

  if (isDashboardRoute || isAdminRoute || isAuthRoute) {
    return children;
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f3f8f4] text-[#101615]">
      {!isCheckoutRoute && (
        <header className="border-b border-[var(--line)] bg-white/80">
          <div
            className={`mx-auto flex w-full items-center justify-between px-5 py-4 ${
              isAdminRoute ? "max-w-[min(1500px,100vw)]" : "max-w-5xl"
            }`}
          >
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Khmer Vox TTS
            </Link>
            <HeaderNav user={user} onSignOut={signOut} />
          </div>
        </header>
      )}
      <main
        className={`mx-auto w-full px-5 py-8 ${
          isAdminRoute ? "max-w-[min(1500px,100vw)]" : "max-w-5xl"
        }`}
      >
        {children}
      </main>
    </div>
  );
}

function HeaderNav({
  user,
  onSignOut,
}: {
  user: HeaderUser | null | undefined;
  onSignOut: () => void;
}) {
  if (user === undefined) {
    return (
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/app/dashboard" className="hover:text-[var(--accent)]">
          Dashboard
        </Link>
      </nav>
    );
  }

  if (user) {
    return (
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/app/dashboard" className="hover:text-[var(--accent)]">
          Dashboard
        </Link>
        {user.isAdmin ? (
          <>
            <Link href="/app/admin" className="hover:text-[var(--accent)]">
              Admin
            </Link>
            <Link href="/app/admin/customers" className="hover:text-[var(--accent)]">
              Customers
            </Link>
            <Link href="/app/admin/usage" className="hover:text-[var(--accent)]">
              Usage
            </Link>
            <Link href="/app/admin/payments" className="hover:text-[var(--accent)]">
              Payments
            </Link>
            <Link href="/app/admin/payment-support" className="hover:text-[var(--accent)]">
              Support
            </Link>
            <Link href="/app/admin/payment-webhooks" className="hover:text-[var(--accent)]">
              Webhooks
            </Link>
            <Link href="/app/admin/payment-telegram" className="hover:text-[var(--accent)]">
              Telegram Pay
            </Link>
            <Link href="/app/admin/system" className="hover:text-[var(--accent)]">
              System
            </Link>
          </>
        ) : null}
        <span className="hidden max-w-[180px] truncate text-[#6a7282] sm:inline">{user.email}</span>
        <button
          type="button"
          onClick={onSignOut}
          className="rounded-full border border-[#d8e0da] px-3 py-1.5 font-medium hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          Log out
        </button>
      </nav>
    );
  }

  return (
    <nav className="flex items-center gap-4 text-sm">
      <Link href="/app/signin" className="hover:text-[var(--accent)]">
        Sign In
      </Link>
      <Link href="/app/signup" className="hover:text-[var(--accent)]">
        Sign Up
      </Link>
      <Link href="/" className="hover:text-[var(--accent)]">
        Public Site
      </Link>
    </nav>
  );
}
