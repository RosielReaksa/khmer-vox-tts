"use client";

import {
  useQuery,
  useQueryClient,
  type Query,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";

type AdminQueryMeta = {
  adminKey?: string;
};

let adminQueryClient: QueryClient | null = null;

export function registerAdminQueryClient(client: QueryClient) {
  adminQueryClient = client;
}

export function clearAdminCache(keyPrefix?: string) {
  if (!adminQueryClient) return;

  if (!keyPrefix) {
    void adminQueryClient.invalidateQueries({ queryKey: ["admin-json"] });
    return;
  }

  void adminQueryClient.invalidateQueries({
    predicate: (query) => isAdminQueryMatch(query, keyPrefix),
  });
}

export function useAdminCachedJson<T>(
  key: string,
  url: string,
  options: {
    pollMs?: number;
    refreshOnFocus?: boolean;
    staleMs?: number;
  } = {},
): {
  data: T | null;
  error: string;
  loading: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
} {
  const { pollMs = 0, refreshOnFocus = true, staleMs = 30_000 } = options;
  const queryClient = useQueryClient();
  const query = useQuery<T, Error>({
    queryKey: adminQueryKey(key, url),
    meta: { adminKey: key } satisfies AdminQueryMeta,
    queryFn: async ({ signal }) => fetchJson<T>(url, signal),
    placeholderData: (previousData) => previousData,
    refetchInterval: pollMs > 0 ? pollMs : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: refreshOnFocus,
    staleTime: pollMs > 0 ? Math.max(500, Math.floor(pollMs / 2)) : staleMs,
  });

  async function refresh() {
    await queryClient.invalidateQueries({
      predicate: (item) => isAdminQueryMatch(item, key),
    });
  }

  return {
    data: query.data ?? null,
    error: query.error?.message ?? "",
    loading: query.isPending || (query.isFetching && !query.data),
    refreshing: query.isFetching && Boolean(query.data),
    refresh,
  };
}

function adminQueryKey(key: string, url: string): QueryKey {
  return ["admin-json", key, url];
}

function isAdminQueryMatch(query: Query, keyPrefix: string): boolean {
  const adminKey =
    typeof query.meta?.adminKey === "string"
      ? query.meta.adminKey
      : typeof query.queryKey[1] === "string"
        ? query.queryKey[1]
        : "";
  return adminKey.startsWith(keyPrefix);
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
  }
  return data;
}
