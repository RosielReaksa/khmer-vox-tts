import { createRequire } from "node:module";
import "server-only";

import QRCode from "qrcode";

type KhqrCurrency = "USD" | "KHR";

type KhqrCheckout = {
  payload: string;
  md5: string;
  imageDataUrl: string;
  currency: KhqrCurrency;
  amount: number;
  amountLabel: string;
  expiresAt: string;
};

type BakongKhqrModule = {
  BakongKHQR: new () => {
    generateIndividual: (info: unknown) => {
      status: { code: number; message?: string | null };
      data?: { qr?: string; md5?: string };
    };
  };
  IndividualInfo: new (
    bakongAccountID: string,
    merchantName: string,
    merchantCity: string,
    optional?: Record<string, unknown>,
  ) => unknown;
  khqrData: {
    currency: {
      usd: number;
      khr: number;
    };
  };
};

const require = createRequire(import.meta.url);
const { BakongKHQR, IndividualInfo, khqrData } = require("bakong-khqr") as BakongKhqrModule;

function cleanEnv(input: string | undefined): string {
  return input?.trim().replace(/^"|"$/g, "") ?? "";
}

function shortText(input: string, maxLength: number): string {
  const cleaned = input.trim();
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

function khqrAccountId(): string {
  return cleanEnv(process.env.KHQR_BAKONG_ACCOUNT_ID) || cleanEnv(process.env.KHQR_ACCOUNT);
}

function khqrCurrency(): KhqrCurrency {
  return cleanEnv(process.env.KHQR_CURRENCY).toUpperCase() === "KHR" ? "KHR" : "USD";
}

function centsToKhqrAmount(totalPriceCents: number, currency: KhqrCurrency): number {
  if (currency === "USD") {
    return Number((totalPriceCents / 100).toFixed(2));
  }

  const exchangeRate = Number(cleanEnv(process.env.KHQR_USD_TO_KHR_RATE) || "4100");
  return Math.round((totalPriceCents / 100) * exchangeRate);
}

function formatKhqrAmount(amount: number, currency: KhqrCurrency): string {
  return currency === "USD" ? `$${amount.toFixed(2)}` : `${amount.toLocaleString()} KHR`;
}

export function isKhqrConfigured(): boolean {
  const accountId = khqrAccountId();
  return Boolean(accountId && !accountId.toLowerCase().startsWith("set "));
}

export async function createKhqrCheckout(input: {
  orderId: string;
  totalPriceCents: number;
}): Promise<KhqrCheckout> {
  const accountId = khqrAccountId();
  if (!isKhqrConfigured()) {
    throw new Error("KHQR_ACCOUNT_NOT_CONFIGURED");
  }

  const merchantName = shortText(cleanEnv(process.env.KHQR_DISPLAY_NAME) || "Khmer Vox TTS", 25);
  const merchantCity = shortText(cleanEnv(process.env.KHQR_CITY) || "Phnom Penh", 15);
  const currency = khqrCurrency();
  const amount = centsToKhqrAmount(input.totalPriceCents, currency);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const billNumber = shortText(input.orderId, 25);

  const info = new IndividualInfo(accountId, merchantName, merchantCity, {
    currency: currency === "USD" ? khqrData.currency.usd : khqrData.currency.khr,
    amount,
    billNumber,
    storeLabel: merchantName,
    terminalLabel: "WEB",
    expirationTimestamp: new Date(expiresAt).getTime(),
    merchantCategoryCode: "5815",
  });

  const response = new BakongKHQR().generateIndividual(info);
  if (response.status.code !== 0 || !response.data?.qr || !response.data.md5) {
    throw new Error(response.status.message ?? "KHQR_GENERATION_FAILED");
  }

  const imageDataUrl = await QRCode.toDataURL(response.data.qr, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 360,
    color: {
      dark: "#10131b",
      light: "#ffffff",
    },
  });

  return {
    payload: response.data.qr,
    md5: response.data.md5,
    imageDataUrl,
    currency,
    amount,
    amountLabel: formatKhqrAmount(amount, currency),
    expiresAt,
  };
}
