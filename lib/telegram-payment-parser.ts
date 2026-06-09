import "server-only";

export type ParsedTelegramPayment = {
  status: "success" | "failed" | "unknown";
  amount: number | null;
  currency: "USD" | "KHR" | null;
  transactionId: string | null;
  reference: string | null;
};

function normalizeNumber(input: string): number | null {
  const compact = input.replace(/[,\s]/g, "");
  const value = Number(compact);
  return Number.isFinite(value) ? value : null;
}

function firstAmount(patterns: RegExp[], text: string): number | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const value = normalizeNumber(match[1]);
    if (value !== null) return value;
  }
  return null;
}

function firstText(patterns: RegExp[], text: string): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const value = match[1].trim().replace(/[),.;\]]+$/g, "");
    if (value.length >= 6) return value;
  }
  return null;
}

export function parseTelegramPaymentText(text: string): ParsedTelegramPayment {
  const normalizedText = text.replace(/\r\n/g, "\n").trim();
  const lower = normalizedText.toLowerCase();

  const failed = /\b(failed|fail|rejected|cancelled|canceled|void|unsuccessful)\b/i.test(normalizedText);
  const success =
    /\b(success|successful|successfully|paid|payment received|received payment|completed|approved)\b/i.test(
      normalizedText,
    );

  const usdAmount = firstAmount(
    [
      /\$\s*([0-9][0-9,\s]*(?:\.[0-9]{1,2})?)/i,
      /\busd\s*([0-9][0-9,\s]*(?:\.[0-9]{1,2})?)/i,
      /([0-9][0-9,\s]*(?:\.[0-9]{1,2})?)\s*usd\b/i,
    ],
    normalizedText,
  );
  const khrAmount = firstAmount(
    [
      /\bkhr\s*([0-9][0-9,\s]*)\b/i,
      /([0-9][0-9,\s]*)\s*khr\b/i,
      /\briel\s*([0-9][0-9,\s]*)\b/i,
      /([0-9][0-9,\s]*)\s*riel\b/i,
    ],
    normalizedText,
  );

  const transactionId = firstText(
    [
      /\b(?:transaction|txn|trans|tran|receipt|rrn|payment)\s*(?:id|no|number|ref|reference)?\s*[:#-]\s*([a-z0-9][a-z0-9_-]{5,})/i,
      /\b(?:id|ref|reference|hash)\s*[:#-]\s*([a-z0-9][a-z0-9_-]{5,})/i,
    ],
    normalizedText,
  );
  const reference = firstText(
    [
      /\b(?:reference|ref|invoice|order)\s*(?:id|no|number)?\s*[:#-]\s*([a-z0-9][a-z0-9_-]{5,})/i,
      /\b(?:remark|note)\s*[:#-]\s*([a-z0-9][a-z0-9_-]{5,})/i,
    ],
    normalizedText,
  );

  return {
    status: failed ? "failed" : success ? "success" : lower.includes("payway") ? "unknown" : "unknown",
    amount: usdAmount ?? khrAmount,
    currency: usdAmount !== null ? "USD" : khrAmount !== null ? "KHR" : null,
    transactionId,
    reference,
  };
}
