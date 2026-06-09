import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { isAdminEmail } from "@/lib/admin";
import { checkBakongVerificationToken } from "@/lib/bakong";
import { createKhqrCheckout } from "@/lib/khqr";
import { createPaywayOrderId, createPaywayQrCheckout, normalizePaywayWebhook, verifyPaywayWebhookSignature } from "@/lib/payway";
import { readSessionFromCookie } from "@/lib/session";
import { getStoreMode, getUserTokenBalance } from "@/lib/store";
import { sendTelegramAdminTestMessage } from "@/lib/telegram";
import { getUpstreamEndpoints, resetEndpointPool } from "@/lib/tts-endpoints";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const testSchema = z.object({
  action: z.enum(["database", "telegram", "payway_signature", "payway_qr", "khqr", "bakong_verify", "modal_tts"]),
});

type TestStatus = "ok" | "warn" | "error";

function cleanEnv(name: string): string {
  return (process.env[name] ?? "").trim().replace(/^"|"$/g, "");
}

function result(status: TestStatus, detail: string, extra?: Record<string, unknown>) {
  return NextResponse.json({
    ok: status === "ok",
    status,
    detail,
    checkedAt: new Date().toISOString(),
    ...extra,
  });
}

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

async function testDatabase() {
  const startedAt = Date.now();
  try {
    await getUserTokenBalance("system-test-probe");
    return result("ok", `${getStoreMode()} store responded in ${Date.now() - startedAt}ms.`);
  } catch (error) {
    return result(
      "error",
      error instanceof Error ? error.message.slice(0, 180) : "Database test failed.",
    );
  }
}

async function testTelegram() {
  const telegram = await sendTelegramAdminTestMessage();
  if (telegram.sent) {
    return result("ok", "Telegram test message sent to the configured admin chat.");
  }
  if (telegram.reason === "not_configured") {
    return result("error", "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured.");
  }
  return result("error", "Telegram API rejected the test message. Check bot token and chat ID.");
}

async function testPaywaySignature() {
  const secret = cleanEnv("PAYWAY_WEBHOOK_SECRET");
  if (!secret) {
    return result("error", "PAYWAY_WEBHOOK_SECRET is not configured.");
  }

  const payload = {
    merchant_ref: "system-signature-test",
    payment_status_code: "0",
    payment_status: "success",
    original_amount: "0.20",
    original_currency: "USD",
  };
  const rawBody = JSON.stringify(payload);
  const signature = createHmac("sha512", secret).update(rawBody).digest("base64");
  const headers = new Headers({
    "x-payway-hmac-sha512": signature,
  });
  const verified = verifyPaywayWebhookSignature({
    rawBody,
    payload,
    headers,
  });
  const normalized = normalizePaywayWebhook(payload);

  if (!verified.valid || normalized.orderId !== "system-signature-test") {
    return result("error", "PayWay signature verification failed for a known-good signed sample.");
  }
  return result("ok", "PayWay signature verification works with the configured secret.");
}

async function testKhqr() {
  try {
    const checkout = await createKhqrCheckout({
      orderId: `system-test-${Date.now()}`,
      totalPriceCents: 20,
    });
    return result("ok", `Generated a ${checkout.amountLabel} KHQR payload.`, {
      expiresAt: checkout.expiresAt,
    });
  } catch (error) {
    return result(
      "error",
      error instanceof Error ? error.message.slice(0, 180) : "Could not generate KHQR.",
    );
  }
}

async function testBakongVerify() {
  const check = await checkBakongVerificationToken();
  if (check.status === "ok") {
    return result("ok", `Bakong API accepted the token at ${check.baseUrl}.`);
  }
  if (check.status === "not_configured") {
    return result("warn", check.message);
  }
  return result("error", `${check.message} Endpoint: ${check.baseUrl}.`);
}

async function testPaywayQr() {
  try {
    const checkout = await createPaywayQrCheckout({
      orderId: createPaywayOrderId(),
      totalPriceCents: 20,
      planName: "Starter",
      quantity: 1,
      userEmail: "system-test@voxtts.local",
    });
    return result("ok", `PayWay generated a ${checkout.amountLabel} QR payload.`, {
      expiresAt: checkout.expiresAt,
    });
  } catch (error) {
    return result(
      "error",
      error instanceof Error ? error.message.replace(/^PAYWAY_QR_FAILED:\s*/, "").slice(0, 220) : "PayWay QR test failed.",
    );
  }
}

async function testModalTts() {
  const startedAt = Date.now();
  const pool = getUpstreamEndpoints();
  if (pool.length === 0) {
    return result("error", "No TTS upstream endpoints configured.");
  }

  // Check health of each endpoint in parallel
  const checks = await Promise.all(
    pool.map(async (endpoint) => {
      const healthUrl = endpoint.url.replace(/\/v1\/audio\/speech\/?$/, "/health");
      const headers: HeadersInit = {};
      if (endpoint.token) {
        headers.Authorization = `Bearer ${endpoint.token}`;
      }

      const start = Date.now();
      try {
        const res = await fetch(healthUrl, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(45000), // 45s timeout to handle GPU cold starts
        });

        if (res.ok) {
          const body = await res.json().catch(() => ({}));
          return {
            label: endpoint.label,
            url: endpoint.url,
            ok: true,
            latency: Date.now() - start,
            detail: body.status === "ok" ? "Healthy (Model Loaded)" : "Healthy",
          };
        } else {
          return {
            label: endpoint.label,
            url: endpoint.url,
            ok: false,
            latency: Date.now() - start,
            detail: `Failed with status ${res.status}: ${res.statusText}`,
          };
        }
      } catch (err) {
        return {
          label: endpoint.label,
          url: endpoint.url,
          ok: false,
          latency: Date.now() - start,
          detail: err instanceof Error ? err.message : String(err),
        };
      }
    })
  );

  const healthyCount = checks.filter((c) => c.ok).length;
  const failedCount = checks.length - healthyCount;

  // Reset blocklist so admin can manually clear any temporary blocks
  resetEndpointPool();

  if (failedCount === 0) {
    return result(
      "ok",
      `All ${pool.length} endpoints are healthy. Latency check completed in ${Date.now() - startedAt}ms.`,
      { endpoints: checks }
    );
  }

  if (healthyCount > 0) {
    return result(
      "warn",
      `${healthyCount} of ${pool.length} endpoints are healthy. ${failedCount} endpoints failed. Blocklist has been reset.`,
      { endpoints: checks }
    );
  }

  return result(
    "error",
    `All ${pool.length} endpoints failed health checks. Blocklist has been reset.`,
    { endpoints: checks }
  );
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const body = await request.json().catch(() => null);
  const parsed = testSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid system test action." }, { status: 400 });
  }

  if (parsed.data.action === "database") return testDatabase();
  if (parsed.data.action === "telegram") return testTelegram();
  if (parsed.data.action === "payway_signature") return testPaywaySignature();
  if (parsed.data.action === "payway_qr") return testPaywayQr();
  if (parsed.data.action === "khqr") return testKhqr();
  if (parsed.data.action === "bakong_verify") return testBakongVerify();
  return testModalTts();
}
