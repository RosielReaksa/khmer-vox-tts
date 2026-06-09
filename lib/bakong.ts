import "server-only";

import type { PaymentOrderRecord } from "@/lib/types";

type BakongVerifyResult =
  | { status: "paid"; transactionHash: string | null; message: string }
  | { status: "not_paid"; message: string }
  | { status: "not_configured"; message: string }
  | { status: "mismatch"; message: string };

type BakongTokenCheckResult =
  | { status: "ok"; message: string; baseUrl: string }
  | { status: "not_configured"; message: string; baseUrl: string | null }
  | { status: "unauthorized"; message: string; baseUrl: string }
  | { status: "error"; message: string; baseUrl: string };

type BakongTransactionResponse = {
  responseCode?: number;
  responseMessage?: string;
  data?: {
    hash?: string;
    toAccountId?: string;
    currency?: string;
    amount?: number | string;
  };
};

function cleanEnv(input: string | undefined): string {
  return input?.trim().replace(/^"|"$/g, "") ?? "";
}

function bakongAccountId(): string {
  return cleanEnv(process.env.KHQR_BAKONG_ACCOUNT_ID) || cleanEnv(process.env.KHQR_ACCOUNT);
}

function bakongBaseUrl(): string {
  return cleanEnv(process.env.BAKONG_API_BASE_URL) || "https://api-bakong.nbc.gov.kh";
}

export function isBakongVerificationConfigured(): boolean {
  return (
    cleanEnv(process.env.PAYMENT_AUTO_VERIFY_ENABLED).toLowerCase() === "true" &&
    Boolean(cleanEnv(process.env.BAKONG_API_TOKEN))
  );
}

function amountsMatch(expected: number | null, actual: number | string | undefined): boolean {
  if (expected === null || actual === undefined) return false;
  const actualNumber = Number(actual);
  if (!Number.isFinite(actualNumber)) return false;
  return Math.abs(actualNumber - expected) < 0.01;
}

export async function checkBakongVerificationToken(): Promise<BakongTokenCheckResult> {
  const autoEnabled = cleanEnv(process.env.PAYMENT_AUTO_VERIFY_ENABLED).toLowerCase() === "true";
  const token = cleanEnv(process.env.BAKONG_API_TOKEN);
  const baseUrl = bakongBaseUrl();

  if (!autoEnabled) {
    return {
      status: "not_configured",
      message: "Automatic Bakong checking is disabled.",
      baseUrl,
    };
  }
  if (!token) {
    return {
      status: "not_configured",
      message: "BAKONG_API_TOKEN is not configured.",
      baseUrl,
    };
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/check_transaction_by_md5`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ md5: "00000000000000000000000000000000" }),
    });
    const data = (await response.json().catch(() => null)) as BakongTransactionResponse | null;
    const message = data?.responseMessage ?? `HTTP ${response.status}`;

    if (response.status === 401) {
      return {
        status: "unauthorized",
        message: "Bakong token was rejected by the configured endpoint.",
        baseUrl,
      };
    }
    if (!response.ok) {
      return {
        status: "error",
        message,
        baseUrl,
      };
    }
    return {
      status: "ok",
      message,
      baseUrl,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not reach Bakong API.",
      baseUrl,
    };
  }
}

export async function verifyBakongPayment(order: PaymentOrderRecord): Promise<BakongVerifyResult> {
  if (cleanEnv(process.env.PAYMENT_AUTO_VERIFY_ENABLED).toLowerCase() !== "true") {
    return {
      status: "not_configured",
      message: "Automatic payment checking is disabled. This payment is waiting for admin confirmation.",
    };
  }

  const token = cleanEnv(process.env.BAKONG_API_TOKEN);
  const md5 = order.khqrMd5;
  if (!token || !md5) {
    return {
      status: "not_configured",
      message: "Automatic Bakong checking is not available yet. This payment is waiting for admin confirmation.",
    };
  }

  const baseUrl = bakongBaseUrl();
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/check_transaction_by_md5`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ md5 }),
  });

  if (response.status === 404) {
    return { status: "not_paid", message: "Payment has not been found yet." };
  }
  if (response.status === 401) {
    return { status: "not_configured", message: "Bakong token is invalid or expired." };
  }
  if (!response.ok) {
    return { status: "not_paid", message: "Bakong did not confirm this payment yet." };
  }

  const data = (await response.json()) as BakongTransactionResponse;
  if (data.responseCode !== 0 || !data.data) {
    return { status: "not_paid", message: data.responseMessage ?? "Payment has not been found yet." };
  }

  const expectedAccount = bakongAccountId().toLowerCase();
  const paidAccount = data.data.toAccountId?.toLowerCase();
  if (expectedAccount && paidAccount && paidAccount !== expectedAccount) {
    return { status: "mismatch", message: "Payment was sent to a different Bakong account." };
  }

  if (order.khqrCurrency && data.data.currency && data.data.currency !== order.khqrCurrency) {
    return { status: "mismatch", message: "Payment currency does not match the order." };
  }

  if (!amountsMatch(order.khqrAmount, data.data.amount)) {
    return { status: "mismatch", message: "Payment amount does not match the order total." };
  }

  return {
    status: "paid",
    transactionHash: data.data.hash ?? null,
    message: data.responseMessage ?? "Payment confirmed.",
  };
}
