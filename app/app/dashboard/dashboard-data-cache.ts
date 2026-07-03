"use client";

import {
  useQuery,
  useQueryClient,
  type Query,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";

import { fetchJsonForQuery } from "@/lib/edge-fetch";

type CachedState<T> = {
  data: T | null;
  error: string;
  loading: boolean;
};

type DashboardQueryMeta = {
  dashboardKey?: string;
};

let dashboardQueryClient: QueryClient | null = null;

export function registerDashboardQueryClient(client: QueryClient) {
  dashboardQueryClient = client;
}

export function clearDashboardCache(keyPrefix?: string) {
  if (!dashboardQueryClient) return;

  if (!keyPrefix) {
    void dashboardQueryClient.invalidateQueries({ queryKey: ["dashboard-json"] });
    return;
  }

  void dashboardQueryClient.invalidateQueries({
    predicate: (query) => isDashboardQueryMatch(query, keyPrefix),
  });
}

export function useCachedJson<T>(
  key: string,
  url: string,
  options: {
    pollMs?: number;
    refreshOnFocus?: boolean;
  } = {},
): CachedState<T> & {
  refresh: () => Promise<void>;
} {
  const { pollMs = 0, refreshOnFocus = true } = options;
  const queryClient = useQueryClient();
  const query = useQuery<T, Error>({
    queryKey: dashboardQueryKey(key, url),
    meta: { dashboardKey: key } satisfies DashboardQueryMeta,
    queryFn: async ({ signal }) => fetchJsonForQuery<T>("dashboard", url, signal),
    placeholderData: (previousData) => previousData,
    refetchInterval: pollMs > 0 ? pollMs : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: refreshOnFocus,
    staleTime: pollMs > 0 ? Math.max(1000, Math.floor(pollMs / 2)) : 15_000,
  });

  async function refresh() {
    await queryClient.invalidateQueries({
      predicate: (item) => isDashboardQueryMatch(item, key),
    });
  }

  return {
    data: query.data ?? null,
    error: query.error?.message ?? "",
    loading: query.isPending || (query.isFetching && !query.data),
    refresh,
  };
}

function dashboardQueryKey(key: string, url: string): QueryKey {
  return ["dashboard-json", key, url];
}

function isDashboardQueryMatch(query: Query, keyPrefix: string): boolean {
  const dashboardKey =
    typeof query.meta?.dashboardKey === "string"
      ? query.meta.dashboardKey
      : typeof query.queryKey[1] === "string"
        ? query.queryKey[1]
        : "";
  return dashboardKey.startsWith(keyPrefix);
}
