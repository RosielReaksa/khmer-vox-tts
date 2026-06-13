import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF protection for user-supplied outbound URLs (e.g. batch webhook callbacks).
 *
 * In production we resolve the target host and refuse to connect to private,
 * loopback, link-local, or cloud-metadata addresses, and we follow redirects
 * manually so each hop is re-validated. In development the guard is relaxed so
 * local webhook testing against localhost keeps working.
 */

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

const MAX_REDIRECT_HOPS = 3;

function guardEnabled(): boolean {
  // Allow explicit override for hardening dev/staging; default on only in prod.
  const flag = process.env.WEBHOOK_SSRF_GUARD?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "on") return true;
  if (flag === "0" || flag === "false" || flag === "off") return false;
  return process.env.NODE_ENV === "production";
}

function parseIpv4(host: string): number[] | null {
  if (isIP(host) !== 4) return null;
  const parts = host.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }
  return parts;
}

function isPrivateIpv4(host: string): boolean {
  const octets = parseIpv4(host);
  if (!octets) return false;
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // multicast / reserved / broadcast
  return false;
}

function normalizeIpv6(host: string): string {
  // Strip zone id and surrounding brackets, lowercase for comparison.
  return host.replace(/^\[/, "").replace(/\]$/, "").split("%")[0].toLowerCase();
}

function isPrivateIpv6(host: string): boolean {
  if (isIP(host) !== 6) return false;
  const addr = normalizeIpv6(host);
  if (addr === "::1" || addr === "::") return true; // loopback / unspecified
  if (addr.startsWith("fe80")) return true; // link-local
  if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // unique local fc00::/7
  // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded IPv4.
  const mapped = addr.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped && isPrivateIpv4(mapped[1])) return true;
  return false;
}

function isBlockedIp(host: string): boolean {
  return isPrivateIpv4(host) || isPrivateIpv6(host);
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/\.$/, "");
  if (lower === "localhost") return true;
  if (lower.endsWith(".localhost")) return true;
  // Internal Kubernetes / Docker service names: no dot ("web") or cluster suffix.
  if (!lower.includes(".")) return true;
  if (lower.endsWith(".local")) return true;
  if (lower.endsWith(".internal")) return true;
  if (lower.endsWith(".svc.cluster.local") || lower.endsWith(".cluster.local")) return true;
  return false;
}

/**
 * Validate that a URL's host is safe to reach. Resolves DNS in production and
 * rejects if any resolved address falls in a blocked range. Throws SsrfBlockedError.
 */
export async function assertSafeOutboundUrl(rawUrl: string): Promise<void> {
  if (!guardEnabled()) return;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError("Webhook URL is not a valid URL.");
  }

  const hostname = url.hostname;

  // Literal IP target.
  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new SsrfBlockedError("Webhook URL targets a private or reserved address.");
    }
    return;
  }

  if (isBlockedHostname(hostname)) {
    throw new SsrfBlockedError("Webhook URL targets an internal host.");
  }

  // Resolve and validate every address the host points to.
  let resolved: { address: string }[];
  try {
    resolved = await lookup(hostname, { all: true });
  } catch {
    throw new SsrfBlockedError("Webhook URL host could not be resolved.");
  }

  if (resolved.length === 0) {
    throw new SsrfBlockedError("Webhook URL host could not be resolved.");
  }

  for (const entry of resolved) {
    if (isBlockedIp(entry.address)) {
      throw new SsrfBlockedError("Webhook URL resolves to a private or reserved address.");
    }
  }
}

/**
 * fetch() wrapper that validates the target before each request and follows
 * redirects manually, re-validating every hop. Use for all user-supplied
 * outbound webhook delivery.
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit & { signal?: AbortSignal },
): Promise<Response> {
  let currentUrl = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    await assertSafeOutboundUrl(currentUrl);

    const response = await fetch(currentUrl, { ...init, redirect: "manual" });

    const isRedirect = response.status >= 300 && response.status < 400 && response.headers.has("location");
    if (!isRedirect) {
      return response;
    }

    if (hop === MAX_REDIRECT_HOPS) {
      throw new SsrfBlockedError("Webhook URL exceeded the maximum number of redirects.");
    }

    const location = response.headers.get("location") ?? "";
    let nextUrl: URL;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      throw new SsrfBlockedError("Webhook redirect target is not a valid URL.");
    }
    if (nextUrl.protocol !== "https:" && nextUrl.protocol !== "http:") {
      throw new SsrfBlockedError("Webhook redirect target uses an unsupported protocol.");
    }
    currentUrl = nextUrl.toString();
  }

  // Unreachable: loop either returns or throws.
  throw new SsrfBlockedError("Webhook URL could not be delivered safely.");
}
