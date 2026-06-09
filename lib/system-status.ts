import { Pool } from "pg";
import "server-only";

import { checkBakongVerificationToken } from "@/lib/bakong";
import { isKhqrConfigured, createKhqrCheckout } from "@/lib/khqr";
import { isPaywayQrConfigured, isPaywayQrEnabled } from "@/lib/payway";
import {
  hasStaticPaywayQrImage,
  isStaticPaywayQrEnabled,
  staticPaywayQrImageUrl,
} from "@/lib/static-payway";
import { getStoreMode } from "@/lib/store";
import { getBlockedEndpoints, getUpstreamEndpoints } from "@/lib/tts-endpoints";

export type CheckStatus = "ok" | "warn" | "error";

export type SystemCheck = {
  name: string;
  status: CheckStatus;
  detail: string;
};

export type EnvCheck = SystemCheck & {
  variable: string;
};

export type LaunchChecklistItem = {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  required: boolean;
};

export type LaunchChecklistGroup = {
  title: string;
  items: LaunchChecklistItem[];
};

export type SystemStatus = {
  generatedAt: string;
  nodeEnv: string;
  database: {
    mode: "json" | "postgres";
    label: string;
    health: SystemCheck;
  };
  env: EnvCheck[];
  quickChecks: SystemCheck[];
  launchChecklist: LaunchChecklistGroup[];
  webhookUrl: string | null;
  warnings: string[];
};

function cleanEnv(name: string): string {
  return (process.env[name] ?? "").trim().replace(/^"|"$/g, "");
}

function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    !value ||
    lower.includes("your_") ||
    lower.includes("replace") ||
    lower.includes("example") ||
    lower.includes("dev_only") ||
    lower.includes("set ")
  );
}

function cleanDetailForStatus(urlOrPath: string): string {
  if (urlOrPath.startsWith("data:image/")) {
    const parts = urlOrPath.split(";");
    return `${parts[0]};base64,... (${Math.round(urlOrPath.length / 1024)} KB)`;
  }
  if (urlOrPath.length > 200) {
    return urlOrPath.slice(0, 197) + "...";
  }
  return urlOrPath;
}

function configuredCheck(variable: string, label: string, options?: { minLength?: number }): EnvCheck {
  const value = cleanEnv(variable);
  if (isPlaceholder(value)) {
    return {
      variable,
      name: label,
      status: "error",
      detail: `${variable} is not configured.`,
    };
  }
  if (options?.minLength && value.length < options.minLength) {
    return {
      variable,
      name: label,
      status: "warn",
      detail: `${variable} is set but should be longer.`,
    };
  }
  return {
    variable,
    name: label,
    status: "ok",
    detail: `${variable} is configured.`,
  };
}

function urlCheck(variable: string, label: string, options?: { requireHttps?: boolean }): EnvCheck {
  const value = cleanEnv(variable);
  if (isPlaceholder(value)) {
    return {
      variable,
      name: label,
      status: "error",
      detail: `${variable} is not configured.`,
    };
  }

  try {
    const parsed = new URL(value);
    if (options?.requireHttps && parsed.protocol !== "https:") {
      return {
        variable,
        name: label,
        status: "warn",
        detail: `${variable} should use HTTPS before production.`,
      };
    }
    return {
      variable,
      name: label,
      status: "ok",
      detail: `${variable} is configured.`,
    };
  } catch {
    return {
      variable,
      name: label,
      status: "error",
      detail: `${variable} is not a valid URL.`,
    };
  }
}

function databaseLabel(): string {
  const url = cleanEnv("DATABASE_URL");
  if (!url.startsWith("postgres://") && !url.startsWith("postgresql://")) {
    return "Local JSON store";
  }

  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}`;
  } catch {
    return "Postgres URL configured";
  }
}

async function checkDatabaseHealth(mode: "json" | "postgres"): Promise<SystemCheck> {
  if (mode === "json") {
    return {
      name: "Database health",
      status: process.env.NODE_ENV === "production" ? "error" : "warn",
      detail: "Using data/store.json. Good for local testing only.",
    };
  }

  const pool = new Pool({
    connectionString: cleanEnv("DATABASE_URL"),
    max: 1,
    ssl: cleanEnv("DATABASE_SSL") === "false" ? false : { rejectUnauthorized: false },
  });

  try {
    const result = await pool.query("select now() as now");
    return {
      name: "Database health",
      status: "ok",
      detail: `Postgres responded at ${new Date(result.rows[0].now).toISOString()}.`,
    };
  } catch (error) {
    return {
      name: "Database health",
      status: "error",
      detail: error instanceof Error ? error.message.slice(0, 180) : "Could not connect to Postgres.",
    };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function checkKhqr(): Promise<SystemCheck> {
  if (!isKhqrConfigured()) {
    return {
      name: "KHQR generation",
      status: "error",
      detail: "KHQR_BAKONG_ACCOUNT_ID or KHQR_ACCOUNT is not configured.",
    };
  }

  try {
    const checkout = await createKhqrCheckout({
      orderId: "system-check",
      totalPriceCents: 20,
    });
    return {
      name: "KHQR generation",
      status: "ok",
      detail: `Generated a test ${checkout.amountLabel} QR payload.`,
    };
  } catch (error) {
    return {
      name: "KHQR generation",
      status: "error",
      detail: error instanceof Error ? error.message.slice(0, 180) : "Could not generate KHQR.",
    };
  }
}

async function checkBakongVerification(): Promise<SystemCheck> {
  const check = await checkBakongVerificationToken();
  if (check.status === "ok") {
    return {
      name: "Bakong verification",
      status: "ok",
      detail: `Bakong API accepted the token at ${check.baseUrl}.`,
    };
  }
  if (check.status === "not_configured") {
    return {
      name: "Bakong verification",
      status: "warn",
      detail: check.message,
    };
  }
  return {
    name: "Bakong verification",
    status: "error",
    detail: `${check.message} Endpoint: ${check.baseUrl}.`,
  };
}

function ttsConfigCheck(): SystemCheck {
  const pool = getUpstreamEndpoints();
  if (pool.length === 0) {
    return {
      name: "Modal TTS endpoint",
      status: "error",
      detail: "No TTS upstream endpoints configured. Set TTS_UPSTREAM_POOL or TTS_UPSTREAM_URL.",
    };
  }

  const blocked = getBlockedEndpoints();
  if (pool.length === 1) {
    const ep = pool[0];
    try {
      new URL(ep.url);
      const isBlocked = blocked.some(b => b.url === ep.url);
      if (isBlocked) {
        return {
          name: "Modal TTS endpoint",
          status: "warn",
          detail: `Single endpoint configured but currently disabled due to error.`,
        };
      }
      return {
        name: "Modal TTS endpoint",
        status: "ok",
        detail: `Configured: ${ep.label} (${ep.url}).`,
      };
    } catch {
      return {
        name: "Modal TTS endpoint",
        status: "error",
        detail: `Configured endpoint URL is invalid: ${ep.url}`,
      };
    }
  }

  // Multi-account pool check
  const activeCount = pool.length - blocked.length;
  if (activeCount === 0) {
    return {
      name: "Modal TTS endpoint",
      status: "error",
      detail: `All ${pool.length} endpoints in pool are temporarily disabled due to errors.`,
    };
  }

  if (blocked.length > 0) {
    return {
      name: "Modal TTS endpoint",
      status: "warn",
      detail: `Pool has ${pool.length} endpoints. ${activeCount} active, ${blocked.length} temporarily disabled.`,
    };
  }

  return {
    name: "Modal TTS endpoint",
    status: "ok",
    detail: `Pool is healthy with ${pool.length} active load-balanced endpoints.`,
  };
}

function paywaySigningCheck(): SystemCheck {
  const secret = cleanEnv("PAYWAY_WEBHOOK_SECRET");
  if (isPlaceholder(secret)) {
    return {
      name: "PayWay webhook signing",
      status: "error",
      detail: "PAYWAY_WEBHOOK_SECRET is required before production.",
    };
  }
  if (secret.length < 32) {
    return {
      name: "PayWay webhook signing",
      status: "warn",
      detail: "PAYWAY_WEBHOOK_SECRET is set but should be at least 32 characters.",
    };
  }
  return {
    name: "PayWay webhook signing",
    status: "ok",
    detail: "Webhook signing secret is configured.",
  };
}

function paywayQrConfigCheck(): SystemCheck {
  if (isStaticPaywayQrEnabled()) {
    const imageUrl = staticPaywayQrImageUrl();
    if (!hasStaticPaywayQrImage()) {
      return {
        name: "Optional PayWay QR API",
        status: "error",
        detail: `Static PayWay QR mode is enabled, but ${cleanDetailForStatus(imageUrl)} is not available. Save your working QR image in public/payway-static-qr-code.png or set STATIC_PAYWAY_QR_IMAGE_URL.`,
      };
    }
    return {
      name: "Optional PayWay QR API",
      status: "ok",
      detail: `Using static PayWay QR image ${cleanDetailForStatus(imageUrl)}. Customers enter the exact amount manually; admin/Telegram approval credits tokens.`,
    };
  }
  if (cleanEnv("PAYMENT_CHECKOUT_MODE").toLowerCase() === "local_khqr") {
    return {
      name: "Optional PayWay QR API",
      status: "ok",
      detail: "Disabled intentionally. Billing uses local KHQR generation and admin approval.",
    };
  }
  if (!isPaywayQrEnabled()) {
    return {
      name: "Optional PayWay QR API",
      status: "ok",
      detail: "PAYWAY_QR_ENABLED is false. Billing uses local KHQR generation and admin approval.",
    };
  }
  if (!isPaywayQrConfigured()) {
    return {
      name: "Optional PayWay QR API",
      status: "error",
      detail: "PAYWAY_MERCHANT_ID and PAYWAY_API_KEY are required when PayWay QR is enabled.",
    };
  }
  return {
    name: "Optional PayWay QR API",
    status: "ok",
    detail: "PayWay QR credentials are configured. Use Live Tests to verify the sandbox accepts them.",
  };
}

function telegramPaymentMonitorCheck(): SystemCheck {
  const botToken = cleanEnv("TELEGRAM_BOT_TOKEN");
  const groupId = cleanEnv("TELEGRAM_PAYMENT_GROUP_ID");
  const allowedSenders = cleanEnv("TELEGRAM_PAYMENT_ALLOWED_SENDERS");
  const webhookSecret = cleanEnv("TELEGRAM_WEBHOOK_SECRET");

  if (isPlaceholder(botToken)) {
    return {
      name: "Telegram payment monitor",
      status: "error",
      detail: "TELEGRAM_BOT_TOKEN is required for Telegram payment monitoring.",
    };
  }
  if (isPlaceholder(groupId)) {
    return {
      name: "Telegram payment monitor",
      status: "warn",
      detail: "TELEGRAM_PAYMENT_GROUP_ID is not set; messages from any chat would be accepted.",
    };
  }
  if (isPlaceholder(allowedSenders)) {
    return {
      name: "Telegram payment monitor",
      status: "warn",
      detail: "TELEGRAM_PAYMENT_ALLOWED_SENDERS is not set; payment messages cannot be trusted.",
    };
  }
  if (isPlaceholder(webhookSecret) || webhookSecret.length < 32) {
    return {
      name: "Telegram payment monitor",
      status: "warn",
      detail: "TELEGRAM_WEBHOOK_SECRET should be a long random secret before deployment.",
    };
  }
  return {
    name: "Telegram payment monitor",
    status: "ok",
    detail: "Group ID, allowed sender list, bot token, and webhook secret are configured.",
  };
}

function webhookUrl(): string | null {
  const base = cleanEnv("APP_PUBLIC_URL");
  if (!base || isPlaceholder(base)) return null;
  try {
    const parsed = new URL(base);
    parsed.pathname = "/api/webhooks/payway";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function warningMessages(status: Pick<SystemStatus, "database" | "env" | "quickChecks">): string[] {
  const warnings: string[] = [];
  if (status.database.mode === "json") {
    warnings.push("JSON storage is unsafe for public users and real payments.");
  }
  for (const item of [...status.env, ...status.quickChecks, status.database.health]) {
    if (item.status === "error") warnings.push(item.detail);
  }
  return Array.from(new Set(warnings));
}

function envByName(env: EnvCheck[], variable: string): EnvCheck {
  const check = env.find((item) => item.variable === variable);
  if (!check) {
    return {
      variable,
      name: variable,
      status: "error",
      detail: `${variable} check is missing.`,
    };
  }
  return check;
}

function checklistItem(input: {
  id: string;
  label: string;
  check: SystemCheck;
  required?: boolean;
}): LaunchChecklistItem {
  return {
    id: input.id,
    label: input.label,
    status: input.check.status,
    detail: input.check.detail,
    required: input.required ?? true,
  };
}

function launchChecklist(input: {
  database: SystemStatus["database"];
  env: EnvCheck[];
  quickChecks: SystemCheck[];
}): LaunchChecklistGroup[] {
  const quickByName = new Map(input.quickChecks.map((check) => [check.name, check]));
  const paymentQrCheck = quickByName.get("KHQR generation") ??
    quickByName.get("Optional PayWay QR API") ?? {
      name: "Payment QR checkout",
      status: "error" as const,
      detail: "Payment QR checkout check is missing.",
    };
  const databaseStatus: SystemCheck =
    input.database.mode === "postgres"
      ? input.database.health
      : {
          name: "Production database",
          status: "error",
          detail: "Use Postgres/Supabase before public users and real payments.",
        };

  return [
    {
      title: "Core App",
      items: [
        checklistItem({ id: "database", label: "Production database", check: databaseStatus }),
        checklistItem({
          id: "session",
          label: "Strong session secret",
          check: envByName(input.env, "SESSION_SECRET"),
        }),
        checklistItem({
          id: "admin",
          label: "Admin email allowlist",
          check: envByName(input.env, "ADMIN_EMAILS"),
        }),
        checklistItem({
          id: "domain",
          label: "Public HTTPS URL",
          check: envByName(input.env, "APP_PUBLIC_URL"),
        }),
        checklistItem({
          id: "worker_secret",
          label: "Batch worker secret",
          check: envByName(input.env, "JOB_WORKER_SECRET"),
        }),
      ],
    },
    {
      title: "Payment",
      items: [
        checklistItem({
          id: "payment_qr",
          label: "Payment QR checkout",
          check: paymentQrCheck,
        }),
        checklistItem({
          id: "bakong_verify",
          label: "Bakong auto verification",
          check: quickByName.get("Bakong verification") ?? {
            name: "Bakong verification",
            status: "warn",
            detail: "Bakong verification check is missing.",
          },
          required: false,
        }),
        checklistItem({
          id: "manual_review",
          label: "Manual payment review",
          check: envByName(input.env, "TELEGRAM_CHAT_ID"),
        }),
        checklistItem({
          id: "payway_qr",
          label: "Optional PayWay QR API",
          check: quickByName.get("Optional PayWay QR API") ?? {
            name: "Optional PayWay QR API",
            status: "warn",
            detail: "Optional PayWay QR check is missing.",
          },
          required: false,
        }),
        checklistItem({
          id: "telegram_payment_monitor",
          label: "Telegram payment monitor",
          check: quickByName.get("Telegram payment monitor") ?? {
            name: "Telegram payment monitor",
            status: "warn",
            detail: "Telegram payment monitor check is missing.",
          },
          required: false,
        }),
      ],
    },
    {
      title: "AI And Alerts",
      items: [
        ...(input.env.some(item => item.variable === "TTS_UPSTREAM_POOL")
          ? [
              checklistItem({
                id: "tts_pool",
                label: "Modal Upstream Pool JSON",
                check: envByName(input.env, "TTS_UPSTREAM_POOL"),
              }),
            ]
          : [
              checklistItem({
                id: "tts_url",
                label: "Modal TTS URL",
                check: envByName(input.env, "TTS_UPSTREAM_URL"),
              }),
              checklistItem({
                id: "tts_token",
                label: "Modal TTS token",
                check: envByName(input.env, "TTS_UPSTREAM_TOKEN"),
              }),
            ]),
        checklistItem({
          id: "telegram_bot",
          label: "Telegram bot token",
          check: envByName(input.env, "TELEGRAM_BOT_TOKEN"),
        }),
        checklistItem({
          id: "telegram_chat",
          label: "Telegram chat ID",
          check: envByName(input.env, "TELEGRAM_CHAT_ID"),
        }),
      ],
    },
  ];
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const mode = getStoreMode();
  const database = {
    mode,
    label: databaseLabel(),
    health: await checkDatabaseHealth(mode),
  };

  const paywayQrEnabled = isPaywayQrEnabled();
  const staticPaywayOnly = isStaticPaywayQrEnabled();
  const localKhqrOnly = !paywayQrEnabled && !staticPaywayOnly;
  const env: EnvCheck[] = [
    configuredCheck("SESSION_SECRET", "Session secret", { minLength: 32 }),
    configuredCheck("ADMIN_EMAILS", "Admin email allowlist"),
    urlCheck("APP_PUBLIC_URL", "Public app URL", { requireHttps: true }),
    configuredCheck("PAYMENT_CHECKOUT_MODE", "Payment checkout mode"),
    ...(localKhqrOnly ? [configuredCheck("KHQR_BAKONG_ACCOUNT_ID", "KHQR account ID")] : []),
    ...(staticPaywayOnly
      ? [
          {
            variable: "STATIC_PAYWAY_QR_IMAGE_URL",
            name: "Static PayWay QR image",
            status: hasStaticPaywayQrImage() ? "ok" : "error",
            detail: hasStaticPaywayQrImage()
              ? `Static PayWay QR image is available at ${cleanDetailForStatus(staticPaywayQrImageUrl())}.`
              : `Save your working QR image to public/payway-static-qr-code.png or set STATIC_PAYWAY_QR_IMAGE_URL.`,
          } satisfies EnvCheck,
        ]
      : []),
    ...(paywayQrEnabled
      ? [
          configuredCheck("PAYWAY_WEBHOOK_SECRET", "PayWay webhook secret", { minLength: 32 }),
          configuredCheck("PAYWAY_MERCHANT_ID", "PayWay merchant ID"),
          configuredCheck("PAYWAY_API_KEY", "PayWay API key", { minLength: 20 }),
        ]
      : []),
    ...(cleanEnv("TTS_UPSTREAM_POOL")
      ? [configuredCheck("TTS_UPSTREAM_POOL", "Modal Upstream Pool JSON")]
      : [
          urlCheck("TTS_UPSTREAM_URL", "Modal TTS URL"),
          configuredCheck("TTS_UPSTREAM_TOKEN", "Modal TTS token"),
        ]),
    configuredCheck("TELEGRAM_BOT_TOKEN", "Telegram bot token"),
    configuredCheck("TELEGRAM_CHAT_ID", "Telegram chat ID"),
    configuredCheck("TELEGRAM_PAYMENT_GROUP_ID", "Telegram payment group ID"),
    configuredCheck("TELEGRAM_PAYMENT_ALLOWED_SENDERS", "Telegram payment allowed senders"),
    configuredCheck("TELEGRAM_WEBHOOK_SECRET", "Telegram webhook secret", { minLength: 32 }),
    configuredCheck("JOB_WORKER_SECRET", "Batch worker secret", { minLength: 32 }),
    ...(cleanEnv("TELEGRAM_PAYMENT_AUTO_APPROVE") === "beta"
      ? [configuredCheck("TELEGRAM_PAYMENT_BETA_EMAILS", "Telegram payment beta emails")]
      : []),
  ];

  const quickChecks = [
    database.health,
    ...(localKhqrOnly ? [await checkKhqr(), await checkBakongVerification()] : []),
    ttsConfigCheck(),
    ...(paywayQrEnabled ? [paywaySigningCheck()] : []),
    paywayQrConfigCheck(),
    telegramPaymentMonitorCheck(),
  ];

  const baseStatus = {
    generatedAt: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV ?? "development",
    database,
    env,
    quickChecks,
    launchChecklist: launchChecklist({ database, env, quickChecks }),
    webhookUrl: webhookUrl(),
  };

  return {
    ...baseStatus,
    warnings: warningMessages(baseStatus),
  };
}
