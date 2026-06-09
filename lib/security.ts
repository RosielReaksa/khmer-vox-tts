import { createHash, randomBytes } from "node:crypto";
import "server-only";

import bcrypt from "bcryptjs";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
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

