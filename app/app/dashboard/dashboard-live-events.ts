"use client";

import { useEffect } from "react";

import { clearDashboardCache } from "@/app/app/dashboard/dashboard-data-cache";

type DashboardUpdateEvent = {
  at: string;
  scopes: Array<"user" | "billing" | "history" | "api" | "admin-payments">;
};

type LiveEventOptions = {
  onUpdate?: (event: DashboardUpdateEvent) => void;
};

const scopePrefixes: Record<DashboardUpdateEvent["scopes"][number], string[]> = {
  user: ["dashboard:billing", "dashboard:api"],
  billing: ["dashboard:billing"],
  history: ["dashboard:history", "dashboard:api"],
  api: ["dashboard:api"],
  "admin-payments": [],
};

export function useDashboardLiveEvents({ onUpdate }: LiveEventOptions = {}) {
  useEffect(() => {
    let closed = false;
    let source: EventSource | null = null;
    let retryTimer: number | null = null;

    function connect() {
      if (closed) return;
      source = new EventSource("/api/dashboard/events");

      source.addEventListener("dashboard-update", (event) => {
        const payload = parseUpdateEvent(event);
        if (!payload) return;

        for (const scope of payload.scopes) {
          for (const prefix of scopePrefixes[scope]) {
            clearDashboardCache(prefix);
          }
        }
        onUpdate?.(payload);
      });

      source.onerror = () => {
        source?.close();
        source = null;
        if (!closed) {
          retryTimer = window.setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      closed = true;
      source?.close();
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [onUpdate]);
}

function parseUpdateEvent(event: Event): DashboardUpdateEvent | null {
  if (!(event instanceof MessageEvent) || typeof event.data !== "string") return null;
  try {
    const payload = JSON.parse(event.data) as DashboardUpdateEvent;
    return Array.isArray(payload.scopes) ? payload : null;
  } catch {
    return null;
  }
}
