import "server-only";

/**
 * Canonical public site URL, centralized so metadata, sitemap, robots, and
 * canonical tags all agree. The apex domain is canonical (proxy.ts redirects
 * www -> apex), and APP_PUBLIC_URL overrides for preview/staging deploys.
 */
export const SITE_URL = (
  process.env.APP_PUBLIC_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://voxtts.online"
)
  .trim()
  .replace(/\/+$/, "");

/** Build an absolute URL for a site-relative path. */
export function absoluteUrl(path = "/"): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${suffix}`;
}
