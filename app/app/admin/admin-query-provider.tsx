"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { useDashboardLiveEvents } from "@/app/app/dashboard/dashboard-live-events";
import { clearAdminCache, registerAdminQueryClient } from "@/app/app/admin/admin-data-cache";

export function AdminQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          gcTime: 10 * 60 * 1000,
          refetchOnReconnect: true,
          retry: 1,
          staleTime: 30 * 1000,
        },
      },
    });
    registerAdminQueryClient(client);
    return client;
  });

  const handleLiveUpdate = useCallback((event: { scopes: string[] }) => {
    if (
      event.scopes.includes("admin-payments") ||
      event.scopes.includes("billing") ||
      event.scopes.includes("history") ||
      event.scopes.includes("api")
    ) {
      clearAdminCache();
    }
  }, []);

  useDashboardLiveEvents({ onUpdate: handleLiveUpdate });

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
