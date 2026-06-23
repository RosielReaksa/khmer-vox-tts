// Bare locale type and constants — no "server-only" import, so it's safe to
// import from client components. The server-only helpers (cookie reads,
// dictionary loading) live in lib/i18n.ts.

export type Locale = "en" | "km";

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "kvx_locale";
export const SUPPORTED_LOCALES: Locale[] = ["en", "km"];

/** Normalize an arbitrary cookie/header value into a supported Locale. */
export function acceptLocale(value: string | null | undefined): Locale {
  if (value && value.toLowerCase().startsWith("km")) return "km";
  return DEFAULT_LOCALE;
}

/** OG `locale` tag per Locale. */
export function ogLocaleFor(locale: Locale): string {
  return locale === "km" ? "km_KH" : "en_US";
}
