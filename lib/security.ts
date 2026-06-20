import { createHash, randomBytes } from "node:crypto";
import "server-only";

import bcrypt from "bcryptjs";

// bcrypt work factor. Configurable via env so we can tune CPU cost without a
// code change. Default 10 is a current industry-standard cost and ~4x cheaper
// per hash than 12, which matters a lot on small (2-core) nodes under
// concurrent signups. Clamped to bcrypt's valid 4..15 range here.
// IMPORTANT: this only affects NEWLY created hashes. bcrypt.compare reads the
// cost from each stored hash, so existing users (hashed at cost 12) keep
// working unchanged.
function bcryptCost(): number {
  const raw = Number(process.env.BCRYPT_COST);
  if (!Number.isInteger(raw) || raw < 4 || raw > 15) {
    return 10;
  }
  return raw;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, bcryptCost());
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generatePasswordResetToken(): {
  rawToken: string;
  tokenHash: string;
} {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  return { rawToken, tokenHash };
}

export function hashPasswordResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function generateApiKey(): {
  rawKey: string;
  keyPrefix: string;
  keyHash: string;
} {
  const raw = randomBytes(24).toString("base64url");
  const rawKey = `vx_live_${raw}`;
  const keyPrefix = rawKey.slice(0, 16);
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  return { rawKey, keyPrefix, keyHash };
}
