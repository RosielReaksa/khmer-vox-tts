"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const SAFETY_TIMEOUT_MS = 6500;
const SAME_PATH_SETTLE_MS = 900;
const SETTLE_DELAY_MS = 140;
const WARMUP_DELAY_MS = 450;

const publicWarmupRoutes = [
  "/docs",
  "/payments",
  "/payment-guide",
  "/business",
  "/review",
  "/support",
  "/terms",
  "/privacy",
  "/app/signin",
  "/app/signup",
  "/app/dashboard",
];

const dashboardWarmupRoutes = [
  "/app/dashboard",
  "/app/dashboard/voice-cloning",
  "/app/dashboard/history",
  "/app/dashboard/jobs",
  "/app/dashboard/business",
  "/app/dashboard/api",
  "/app/dashboard/billing",
  "/app/dashboard/settings",
];

const adminWarmupRoutes = [
  "/app/admin",
  "/app/admin/customers",
  "/app/admin/business",
  "/app/admin/usage",
  "/app/admin/jobs",
  "/app/admin/payments",
  "/app/admin/payway-application",
  "/app/admin/payment-support",
  "/app/admin/payment-webhooks",
  "/app/admin/payment-telegram",
  "/app/admin/system",
];

type NavigationShellProps = {
  children: ReactNode;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => {
    finished: Promise<void>;
    ready: Promise<void>;
    updateCallbackDone: Promise<void>;
  };
};

function getWarmupRoutes(pathname: string | null): string[] {
  if (!pathname) return publicWarmupRoutes;
  if (pathname.startsWith("/app/admin")) return adminWarmupRoutes;
  if (pathname.startsWith("/app/dashboard")) return dashboardWarmupRoutes;
  if (pathname.startsWith("/app")) return [...dashboardWarmupRoutes, "/app/checkout"];
  return publicWarmupRoutes;
}

export function NavigationShell({ children }: NavigationShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const safetyTimerRef = useRef<number | null>(null);
  const previousPathnameRef = useRef<string | null>(null);
  const prefetchedHrefsRef = useRef<Set<string>>(new Set());

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const clearSafetyTimer = useCallback(() => {
    if (safetyTimerRef.current !== null) {
      window.clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  }, []);

  const finishProgress = useCallback(() => {
    clearSafetyTimer();
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setPending(false);
      setPendingHref(null);
      document.documentElement.removeAttribute("data-route-pending");
      hideTimerRef.current = null;
    }, SETTLE_DELAY_MS);
  }, [clearHideTimer, clearSafetyTimer]);

  const startProgress = useCallback((href?: string | null) => {
    clearHideTimer();
    clearSafetyTimer();
    document.documentElement.setAttribute("data-route-pending", "true");
    setPendingHref(href ?? null);
    setPending(true);
    safetyTimerRef.current = window.setTimeout(() => {
      finishProgress();
    }, SAFETY_TIMEOUT_MS);
  }, [clearHideTimer, clearSafetyTimer, finishProgress]);

  const prefetchRoute = useCallback(
    (href: string) => {
      const prefetchHref = href.split("#")[0] || href;
      if (!prefetchHref || prefetchHref.startsWith("/api/")) return;

      const prefetchedHrefs = prefetchedHrefsRef.current;
      if (prefetchedHrefs.has(prefetchHref)) return;

      if (prefetchedHrefs.size > 120) {
        prefetchedHrefs.clear();
      }

      prefetchedHrefs.add(prefetchHref);
      router.prefetch(prefetchHref);
    },
    [router],
  );

  const pushRoute = useCallback(
    (href: string) => {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const transitionDocument = document as ViewTransitionDocument;

      if (!prefersReducedMotion && typeof transitionDocument.startViewTransition === "function") {
        try {
          transitionDocument.startViewTransition(() => {
            router.push(href);
          });
          return;
        } catch {
          // Fall through to normal navigation if the browser rejects the transition.
        }
      }

      router.push(href);
    },
    [router],
  );

  useEffect(() => {
    if (previousPathnameRef.current === null) {
      previousPathnameRef.current = pathname;
      return;
    }

    if (previousPathnameRef.current !== pathname) {
      previousPathnameRef.current = pathname;
      finishProgress();
    }
  }, [finishProgress, pathname]);

  useEffect(() => {
    const routes = getWarmupRoutes(pathname).filter((href) => href !== pathname);
    if (routes.length === 0) return;

    const warmupTimer = window.setTimeout(() => {
      routes.forEach(prefetchRoute);
    }, WARMUP_DELAY_MS);

    return () => {
      window.clearTimeout(warmupTimer);
    };
  }, [pathname, prefetchRoute]);

  useEffect(() => {
    function onNavigationStart(event: Event) {
      const href =
        event instanceof CustomEvent && typeof event.detail?.href === "string"
          ? event.detail.href
          : null;
      startProgress(href);
    }

    window.addEventListener("khmer-vox:navigation-start", onNavigationStart);
    window.addEventListener("khmer-vox:navigation-end", finishProgress);

    return () => {
      window.removeEventListener("khmer-vox:navigation-start", onNavigationStart);
      window.removeEventListener("khmer-vox:navigation-end", finishProgress);
    };
  }, [finishProgress, startProgress]);

  useEffect(() => {
    function findAnchor(target: EventTarget | null): HTMLAnchorElement | null {
      if (!(target instanceof Element)) return null;
      return target.closest("a[href]");
    }

    function getInternalHref(anchor: HTMLAnchorElement): string | null {
      if (anchor.target && anchor.target !== "_self") return null;
      if (anchor.hasAttribute("download")) return null;
      if (anchor.dataset.nativeNavigation === "true") return null;
      if (anchor.dataset.spaNavigation === "true") return null;

      const rawHref = anchor.getAttribute("href");
      if (!rawHref) return null;

      const loweredHref = rawHref.trim().toLowerCase();
      if (
        loweredHref.startsWith("#") ||
        loweredHref.startsWith("mailto:") ||
        loweredHref.startsWith("tel:") ||
        loweredHref.startsWith("javascript:")
      ) {
        return null;
      }

      const url = new URL(rawHref, window.location.href);
      if (url.origin !== window.location.origin) return null;
      if (url.pathname.startsWith("/api/")) return null;
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return null;
      }

      return `${url.pathname}${url.search}${url.hash}`;
    }

    function onClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const anchor = findAnchor(event.target);
      if (!anchor) return;

      const href = getInternalHref(anchor);
      if (!href) return;

      event.preventDefault();
      window.dispatchEvent(new CustomEvent("khmer-vox:navigation-intent", { detail: { href } }));
      startProgress(href);
      pushRoute(href);
      if (new URL(href, window.location.href).pathname === window.location.pathname) {
        window.setTimeout(finishProgress, SAME_PATH_SETTLE_MS);
      }
    }

    function onRouteIntent(event: Event) {
      const anchor = findAnchor(event.target);
      if (!anchor) return;

      const href = getInternalHref(anchor);
      if (!href) return;

      prefetchRoute(href);
    }

    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerover", onRouteIntent);
    document.addEventListener("focusin", onRouteIntent);

    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerover", onRouteIntent);
      document.removeEventListener("focusin", onRouteIntent);
    };
  }, [finishProgress, prefetchRoute, pushRoute, startProgress]);

  useEffect(() => {
    return () => {
      clearHideTimer();
      clearSafetyTimer();
      document.documentElement.removeAttribute("data-route-pending");
    };
  }, [clearHideTimer, clearSafetyTimer]);

  return (
    <>
      <div className="page-transition-bar" data-active={pending ? "true" : "false"} aria-hidden="true">
        <div className="page-transition-bar__fill route-progress" />
      </div>
      <div className="route-pending-card" data-active={pending && pendingHref ? "true" : "false"} aria-live="polite">
        Opening page...
      </div>
      <div className="route-shell">{children}</div>
    </>
  );
}
