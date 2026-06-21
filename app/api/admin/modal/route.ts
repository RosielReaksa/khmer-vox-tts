import { NextResponse } from "next/server";
import { z } from "zod";

import { isAdminEmail } from "@/lib/admin";
import { readSessionFromCookie } from "@/lib/session";
import { getModalAccounts, readAccountsConfig, writeAccountsConfig, clearModalBillingCache } from "@/lib/modal-accounts";
import { getUpstreamEndpoints } from "@/lib/tts-endpoints";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const saveConfigSchema = z.object({
  label: z.string(),
  profile: z.string().min(1, "Profile name cannot be empty"),
  initialCredits: z.number().nonnegative("Initial credits must be a positive number"),
  notes: z.string(),
});

async function requireAdmin() {
  const session = await readSessionFromCookie();
  if (!session) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isAdminEmail(session.email)) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const, session };
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const urlObj = new URL(request.url);
  const forceRefresh = urlObj.searchParams.get("refresh") === "true";
  const pingLabel = urlObj.searchParams.get("ping");

  if (pingLabel) {
    try {
      const endpoints = getUpstreamEndpoints();
      const endpoint = endpoints.find(
        (ep, idx) =>
          ep.label === pingLabel ||
          `Modal Account ${idx + 1}` === pingLabel ||
          `Account ${idx + 1}` === pingLabel
      );

      if (!endpoint) {
        return NextResponse.json({ ok: false, status: "Endpoint not found" }, { status: 404 });
      }

      const healthUrl = endpoint.url.replace(/\/v1\/audio\/speech\/?$/, "/health");
      const headers: HeadersInit = {};
      if (endpoint.token) {
        headers.Authorization = `Bearer ${endpoint.token}`;
      }

      const start = Date.now();
      const res = await fetch(healthUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(45000), // 45s cold start timeout
      });

      const latency = Date.now() - start;
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        return NextResponse.json({
          ok: true,
          status: body.status === "ok" ? "Healthy (Loaded)" : "Healthy",
          latency,
        });
      } else {
        return NextResponse.json({
          ok: false,
          status: `Failed (${res.status}): ${res.statusText}`,
          latency,
        });
      }
    } catch (err) {
      // Admin diagnostic endpoint: the error detail is the point (timeout, DNS,
      // connection refused, etc.), and this is admin-gated, so surface it — but
      // also log server-side for observability.
      console.error(`[admin/modal] Ping failed for "${pingLabel}":`, err);
      return NextResponse.json({
        ok: false,
        status: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (forceRefresh) {
    clearModalBillingCache();
  }

  try {
    const accounts = await getModalAccounts(forceRefresh);
    return NextResponse.json({ ok: true, accounts });
  } catch (error) {
    console.error("[admin/modal] Failed to load Modal accounts:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load Modal accounts" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    const body = await request.json().catch(() => null);
    const parsed = saveConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message || "Invalid configuration parameters" },
        { status: 400 }
      );
    }

    const { label, profile, initialCredits, notes } = parsed.data;

    // Load, update and save the config file
    const configMap = await readAccountsConfig();
    configMap[label] = {
      profile,
      initialCredits,
      notes,
    };
    await writeAccountsConfig(configMap);

    // Clear cache to force a re-evaluation next time details are retrieved
    clearModalBillingCache();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/modal] Failed to save account configuration:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to save account configuration" },
      { status: 500 }
    );
  }
}
