import { SignJWT, jwtVerify } from "jose";
import "server-only";

const PAYMENT_PROOF_EXPIRES_IN_SECONDS = 60 * 60 * 2;

type PaymentProofPayload = {
  orderId: string;
  userId: string;
};

function getSecret(): Uint8Array {
  const value = process.env.SESSION_SECRET?.trim();
  if (!value || value === "dev_only_change_me" || value === "replace-with-a-long-random-secret") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be set to create payment proof links in production.");
    }
    return new TextEncoder().encode("dev_only_change_me");
  }
  return new TextEncoder().encode(value);
}

export async function createPaymentProofToken(input: PaymentProofPayload): Promise<string> {
  return new SignJWT({ typ: "payment-proof", userId: input.userId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.orderId)
    .setIssuedAt()
    .setExpirationTime(`${PAYMENT_PROOF_EXPIRES_IN_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyPaymentProofToken(token: string): Promise<PaymentProofPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    if (
      payload.typ !== "payment-proof" ||
      typeof payload.sub !== "string" ||
      typeof payload.userId !== "string"
    ) {
      return null;
    }
    return {
      orderId: payload.sub,
      userId: payload.userId,
    };
  } catch {
    return null;
  }
}

