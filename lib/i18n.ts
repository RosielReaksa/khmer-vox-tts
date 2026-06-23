import "server-only";

import { cookies } from "next/headers";

import en from "@/messages/en.json";
import km from "@/messages/km.json";

// Re-export the locale-safe type/constants so server callers can import
// everything from one place, while client code imports only from lib/locale.ts.
export {
  type Locale,
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  SUPPORTED_LOCALES,
  acceptLocale,
  ogLocaleFor,
} from "@/lib/locale";

const MESSAGES: Record<string, Record<string, string>> = {
  en: en as Record<string, string>,
  km: km as Record<string, string>,
};

import type { Locale } from "@/lib/locale";

/**
 * Read the active locale from the request cookie. Server-only; used by
 * `app/layout.tsx`, `generateMetadata`, and server components that need the
 * current locale before render.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const { acceptLocale, LOCALE_COOKIE } = await import("@/lib/locale");
  return acceptLocale(store.get(LOCALE_COOKIE)?.value);
}

/**
 * Translate a message key for the given locale, with optional `{param}`
 * interpolation. Falls back to English if the key is missing in the locale,
 * then to the key itself if missing everywhere (so missing translations are
 * obvious in dev without crashing).
 */
export function t(
  key: string,
  locale: Locale,
  params?: Record<string, string | number>,
): string {
  const dict = MESSAGES[locale] ?? MESSAGES.en;
  let value = dict[key] ?? MESSAGES.en[key] ?? key;
  if (params) {
    for (const [name, replacement] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${name}\\}`, "g"), String(replacement));
    }
  }
  return value;
}

/** The full message dictionary for a locale — passed to the client provider
 *  so client components can translate without re-reading JSON. */
export function messagesFor(locale: Locale): Record<string, string> {
  return MESSAGES[locale] ?? MESSAGES.en;
}
