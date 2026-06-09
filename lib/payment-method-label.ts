import type { PaymentOrderRecord } from "@/lib/types";

type PaymentPayload = {
  paymentMethod?: unknown;
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  ABA: "ABA Mobile / ABA PayWay QR",
  ACLEDA: "ACLEDA Mobile / ACLEDA Unity",
};

export function paymentMethodLabel(order: PaymentOrderRecord): string {
  const method = paymentMethodFromPayload(order.providerPayload);
  if (method) return PAYMENT_METHOD_LABELS[method] ?? method;
  if (order.paymentProvider === "static_payway") return "ABA PayWay QR";
  if (order.paymentProvider === "payway") return "ABA PayWay";
  if (order.paymentProvider === "telegram_payway") return "Telegram PayWay notice";
  if (order.paymentMethod === "khqr") return "KHQR";
  return "-";
}

function paymentMethodFromPayload(rawPayload: string | null): string | null {
  if (!rawPayload) return null;
  try {
    const payload = JSON.parse(rawPayload) as PaymentPayload;
    return typeof payload.paymentMethod === "string" && payload.paymentMethod.trim()
      ? payload.paymentMethod.trim()
      : null;
  } catch {
    return null;
  }
}
