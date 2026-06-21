import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "kvx_session";

function getSessionSecret(): Uint8Array {
  const value = process.env.SESSION_SECRET?.trim();
  if (!value || value === "dev_only_change_me" || value === "replace-with-a-long-random-secret") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be set to a strong random value in production.");
    }
    console.warn("[proxy] Using dev-only SESSION_SECRET. Set SESSION_SECRET in .env for production.");
    return new TextEncoder().encode("dev_only_change_me");
  }
  return new TextEncoder().encode(value);
}

function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function verifyAdminSession(
  request: NextRequest,
): Promise<{ ok: true; email: string } | { ok: false }> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return { ok: false };

  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), {
      algorithms: ["HS256"],
    });
    if (typeof payload.email !== "string") return { ok: false };

    const email = payload.email.toLowerCase();
    const adminEmails = getAdminEmails();
    if (adminEmails.length === 0 || !adminEmails.includes(email)) {
      return { ok: false };
    }

    return { ok: true, email };
  } catch {
    return { ok: false };
  }
}

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const ALLOWED_MULTIPART_API_ROUTES = new Set([
  "/api/batch-clone",
  "/api/dashboard/voices",
  "/api/generate-clone",
]);

function booleanEnv(name: string): boolean | null {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return null;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return null;
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function shouldUseSecureCookie(request: NextRequest, hostname: string): boolean {
  const csrfOverride = booleanEnv("CSRF_COOKIE_SECURE");
  if (csrfOverride !== null) return csrfOverride;
  const sharedOverride = booleanEnv("COOKIE_SECURE");
  if (sharedOverride !== null) return sharedOverride;
  if (isLocalHostname(hostname)) return false;

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwardedProto) return forwardedProto === "https";

  return request.nextUrl.protocol === "https:" || process.env.NODE_ENV === "production";
}

function isRateLimited(ip: string): boolean {
  const limit = Math.max(1, Number(process.env.RATE_LIMIT_MAX) || 300);
  const windowMs = Math.max(1000, Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000);
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return false;
  }

  if (record.count >= limit) {
    return true;
  }

  record.count++;
  return false;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const method = request.method;
  const host = request.headers.get("host") || "";
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  const isInternalServiceHost =
    hostname === "web" ||
    hostname === "khmer-vox-web-svc" ||
    hostname.endsWith(".svc") ||
    hostname.endsWith(".svc.cluster.local");

  if (hostname === "www.voxtts.online") {
    const url = request.nextUrl.clone();
    url.hostname = "voxtts.online";
    url.protocol = "https:";
    url.port = "";
    return NextResponse.redirect(url, 301);
  }

  // Bypass all middleware logic for health check probe
  if (pathname === "/api/health") {
    return NextResponse.next();
  }

  // Generate CSRF token if missing
  let csrfToken = request.cookies.get("csrf-token")?.value;
  let didGenerateCsrf = false;
  if (!csrfToken && !pathname.startsWith("/_next") && !pathname.includes(".")) {
    csrfToken = crypto.randomUUID().replace(/-/g, "");
    request.cookies.set("csrf-token", csrfToken);
    didGenerateCsrf = true;
  }

  // 1. Force HTTPS redirect in production
  const xForwardedProto = request.headers.get("x-forwarded-proto");
  const disableHttpsRedirect = booleanEnv("DISABLE_HTTPS_REDIRECT") === true;
  if (
    !disableHttpsRedirect &&
    xForwardedProto === "http" &&
    !host.includes("localhost") &&
    !host.includes("127.0.0.1") &&
    !isInternalServiceHost
  ) {
    return NextResponse.redirect(`https://${host}${pathname}${request.nextUrl.search}`, 301);
  }

  // 2. Rate limiting (skip static files)
  if (!pathname.startsWith("/_next") && !pathname.includes(".")) {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
    if (isRateLimited(ip)) {
      return new NextResponse(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "60",
          },
        }
      );
    }
  }

  // CSRF protection for state-changing methods
  const isStateChanging = ["POST", "PUT", "DELETE", "PATCH"].includes(method);
  const isExempt =
    pathname.startsWith("/api/v1/") ||
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/internal/");

  if (isStateChanging && !isExempt) {
    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");
    const host = request.headers.get("host");
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    const isMultipartForm = contentType.includes("multipart/form-data");
    const isServerAction = request.headers.has("next-action");
    const isAllowedMultipartApiRoute = ALLOWED_MULTIPART_API_ROUTES.has(pathname);

    if (isMultipartForm && !isServerAction && !isAllowedMultipartApiRoute) {
      return new NextResponse(
        JSON.stringify({ error: "Unsupported media type for this route." }),
        { status: 415, headers: { "Content-Type": "application/json" } },
      );
    }

    const allowedOrigins = [
      "http://localhost:3000",
      "https://localhost:3000",
    ];
    if (host) {
      allowedOrigins.push(`http://${host}`);
      allowedOrigins.push(`https://${host}`);
    }

    if (origin && !allowedOrigins.includes(origin)) {
      return new NextResponse(
        JSON.stringify({ error: "CSRF validation failed: invalid origin" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!origin && referer) {
      try {
        const refererUrl = new URL(referer);
        const refererOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
        if (!allowedOrigins.includes(refererOrigin)) {
          return new NextResponse(
            JSON.stringify({ error: "CSRF validation failed: invalid referer" }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          );
        }
      } catch {
        return new NextResponse(
          JSON.stringify({ error: "CSRF validation failed: malformed referer" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }
  }

  // Protect admin page routes: /app/admin/*
  if (pathname.startsWith("/app/admin")) {
    const session = await verifyAdminSession(request);
    if (!session.ok) {
      return NextResponse.redirect(new URL("/app/signin", request.url));
    }
  }

  // Protect admin API routes: /api/admin/*
  if (pathname.startsWith("/api/admin")) {
    const session = await verifyAdminSession(request);
    if (!session.ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  if (didGenerateCsrf && csrfToken) {
    response.cookies.set("csrf-token", csrfToken, {
      httpOnly: true,
      secure: shouldUseSecureCookie(request, hostname),
      sameSite: "lax",
      path: "/",
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
