"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

import type { Locale } from "@/lib/locale";

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

type LocaleContextValue = {
  locale: Locale;
  t: TranslateFn;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Client-side locale context. The server layout reads the locale cookie,
 * passes the locale + that locale's message dictionary down here, and this
 * provider exposes a stable `t()` via context. Because the server rendered
 * with the same locale and dictionary, the client's first render matches —
 * no hydration mismatch.
 */
export function LocaleProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Record<string, string>;
  children: ReactNode;
}) {
  const t = useCallback<TranslateFn>(
    (key, params) => {
      let value = messages[key] ?? key;
      if (params) {
        for (const [name, replacement] of Object.entries(params)) {
          value = value.replace(new RegExp(`\\{${name}\\}`, "g"), String(replacement));
        }
      }
      return value;
    },
    [messages],
  );

  const value = useMemo<LocaleContextValue>(() => ({ locale, t }), [locale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  const ctx = useContext(LocaleContext);
  return ctx?.locale ?? "en";
}

export function useT(): TranslateFn {
  const ctx = useContext(LocaleContext);
  // Outside the provider (e.g. a route that forgot to wrap), fall back to a
  // no-op identity function so the component renders the key instead of crashing.
  return useCallback<TranslateFn>(
    (key, params) => {
      if (ctx) return ctx.t(key, params);
      let value = key;
      if (params) {
        for (const [name, replacement] of Object.entries(params)) {
          value = value.replace(new RegExp(`\\{${name}\\}`, "g"), String(replacement));
        }
      }
      return value;
    },
    [ctx],
  );
}
