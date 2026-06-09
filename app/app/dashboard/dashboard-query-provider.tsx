"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { registerDashboardQueryClient } from "@/app/app/dashboard/dashboard-data-cache";
import { useDashboardLiveEvents } from "@/app/app/dashboard/dashboard-live-events";

export function DashboardQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          gcTime: 5 * 60 * 1000,
          refetchOnReconnect: true,
          retry: 1,
          staleTime: 15 * 1000,
        },
      },
    });
    registerDashboardQueryClient(client);
    return client;
  });
  useDashboardLiveEvents();

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
