import "server-only";

import { getApiAccessStatus, type ApiAccessStatus } from "@/lib/api-access";
import type { ApiKeyRecord } from "@/lib/types";
import { findActiveApiKeyByRawKey, findUserById } from "@/lib/store";

export async function authenticateApiKeyFromRequest(request: Request): Promise<
  | {
      ok: true;
      userId: string;
      apiKeyId: string;
      apiKey: ApiKeyRecord;
      apiAccess: ApiAccessStatus;
    }
  | {
      ok: false;
      status: number;
      error: string;
    }
> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return { ok: false, status: 401, error: "Missing bearer token." };
  }

  const rawKey = authHeader.slice(7).trim();
  if (!rawKey) {
    return { ok: false, status: 401, error: "Missing bearer token." };
  }

  const key = await findActiveApiKeyByRawKey(rawKey);
  if (!key) {
    return { ok: false, status: 403, error: "Invalid bearer token." };
  }

  const user = await findUserById(key.userId);
  if (!user) {
    return { ok: false, status: 403, error: "API key owner not found." };
  }
  if (user.suspendedAt) {
    return { ok: false, status: 403, error: "Account is suspended." };
  }
  const apiAccess = await getApiAccessStatus(user.id);
  if (!apiAccess.hasPaidApiAccess) {
    return {
      ok: false,
      status: 402,
      error: "API access requires a paid token pack. Buy Starter or Creator to use API keys.",
    };
  }

  return {
    ok: true,
    userId: user.id,
    apiKeyId: key.id,
    apiKey: key,
    apiAccess,
  };
}
