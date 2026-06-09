import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import "server-only";

type StaticPaywayCheckout = {
  payload: string;
  md5: string;
  imageDataUrl: string;
  currency: "USD" | "KHR";
  amount: number;
  amountLabel: string;
  expiresAt: string | null;
};

function cleanEnv(input: string | undefined): string {
  return input?.trim().replace(/^"|"$/g, "") ?? "";
}

function checkoutMode(): string {
  return cleanEnv(process.env.PAYMENT_CHECKOUT_MODE).toLowerCase();
}

function centsToAmount(totalPriceCents: number, currency: "USD" | "KHR"): number {
  if (currency === "USD") return Number((totalPriceCents / 100).toFixed(2));
  const exchangeRate = Number(cleanEnv(process.env.KHQR_USD_TO_KHR_RATE) || "4100");
  return Math.round((totalPriceCents / 100) * exchangeRate);
}

function formatAmount(amount: number, currency: "USD" | "KHR"): string {
  return currency === "USD" ? `$${amount.toFixed(2)}` : `${Math.round(amount).toLocaleString()} KHR`;
}

function orderLifetimeMinutes(): number {
  const configured = Number(cleanEnv(process.env.STATIC_PAYWAY_ORDER_LIFETIME_MINUTES));
  if (Number.isFinite(configured) && configured > 0) return Math.min(120, configured);
  return 20;
}

function configuredImageUrl(): string {
  return cleanEnv(process.env.STATIC_PAYWAY_QR_IMAGE_URL) || "/payway-static-qr-code.png";
}

function publicImageExists(imageUrl: string): boolean {
  if (imageUrl.startsWith("data:image/") || imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return true;
  }
  if (!imageUrl.startsWith("/")) return false;
  return existsSync(path.join(process.cwd(), "public", imageUrl.replace(/^\/+/, "")));
}

function getPublicImageAsDataUrl(imageUrl: string): string {
  if (imageUrl.startsWith("data:image/")) {
    return imageUrl;
  }
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }
  try {
    const filePath = path.join(process.cwd(), "public", imageUrl.replace(/^\/+/, ""));
    if (existsSync(filePath)) {
      const buffer = readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase().replace(/^\./, "");
      let mime = "image/png";
      if (ext === "jpg" || ext === "jpeg") mime = "image/jpeg";
      else if (ext === "webp") mime = "image/webp";
      else if (ext === "svg") mime = "image/svg+xml";
      return `data:${mime};base64,${buffer.toString("base64")}`;
    }
  } catch (err) {
    console.error("Failed to read image as Data URL:", err);
  }
  return imageUrl;
}

export function isStaticPaywayQrEnabled(): boolean {
  return checkoutMode() === "static_payway_qr";
}

export function staticPaywayQrImageUrl(): string {
  return getPublicImageAsDataUrl(configuredImageUrl());
}

export function hasStaticPaywayQrImage(): boolean {
  return publicImageExists(configuredImageUrl());
}

export function staticPaywayQrAccountLabel(): string {
  return cleanEnv(process.env.STATIC_PAYWAY_QR_ACCOUNT_LABEL) || cleanEnv(process.env.KHQR_ACCOUNT) || "PayWay static QR";
}

export function createStaticPaywayQrCheckout(input: {
  orderId: string;
  totalPriceCents: number;
}): StaticPaywayCheckout {
  const imageUrl = configuredImageUrl();
  if (!publicImageExists(imageUrl)) {
    throw new Error("STATIC_PAYWAY_QR_IMAGE_NOT_FOUND");
  }

  const currency = cleanEnv(process.env.KHQR_CURRENCY).toUpperCase() === "KHR" ? "KHR" : "USD";
  const amount = centsToAmount(input.totalPriceCents, currency);
  const expiresAt = new Date(Date.now() + orderLifetimeMinutes() * 60 * 1000).toISOString();
  return {
    payload: cleanEnv(process.env.STATIC_PAYWAY_QR_PAYLOAD) || `static-payway:${input.orderId}`,
    md5: `static-payway:${input.orderId}`,
    imageDataUrl: getPublicImageAsDataUrl(imageUrl),
    currency,
    amount,
    amountLabel: formatAmount(amount, currency),
    expiresAt,
  };
}
