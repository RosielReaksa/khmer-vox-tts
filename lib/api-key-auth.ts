import "server-only";

import { getApiAccessStatus, type ApiAccessStatus } from "@/lib/api-access";
import type { ApiKeyRecord } from "@/lib/types";
import { findActiveApiKeyByRawKey, findUserById } from "@/lib/store";
import { logApiError } from "@/lib/api-error-log";

type AuthFailure = { ok: false; status: number; error: string };

// Log every authentication failure to the API error log so admins can see
// auth/quota rejections (401/402/403) that never reach a route handler.
function authFailure(request: Request, status: number, error: string, code: string): AuthFailure {
  logApiError({
    request,
    statusCode: status,
    errorMessage: error,
    errorCode: code,
    source: "api_key",
  });
  return { ok: false, status, error };
}

export async function authenticateApiKeyFromRequest(request: Request): Promise<
  | {
      ok: true;
      userId: string;
      apiKeyId: string;
      apiKey: ApiKeyRecord;
      apiAccess: ApiAccessStatus;
    }
  | AuthFailure
> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return authFailure(request, 401, "Missing bearer token.", "MISSING_BEARER_TOKEN");
  }

  const rawKey = authHeader.slice(7).trim();
  if (!rawKey) {
    return authFailure(request, 401, "Missing bearer token.", "MISSING_BEARER_TOKEN");
  }

  const key = await findActiveApiKeyByRawKey(rawKey);
  if (!key) {
    return authFailure(request, 403, "Invalid bearer token.", "INVALID_BEARER_TOKEN");
  }

  const user = await findUserById(key.userId);
  if (!user) {
    return authFailure(request, 403, "API key owner not found.", "API_KEY_OWNER_NOT_FOUND");
  }
  if (user.suspendedAt) {
    return authFailure(request, 403, "Account is suspended.", "ACCOUNT_SUSPENDED");
  }
  const apiAccess = await getApiAccessStatus(user.id);
  if (!apiAccess.hasPaidApiAccess) {
    return authFailure(
      request,
      402,
      "API access requires a paid token pack. Buy Creator or a token pack to use API keys.",
      "API_ACCESS_REQUIRED",
    );
  }

  return {
    ok: true,
    userId: user.id,
    apiKeyId: key.id,
    apiKey: key,
    apiAccess,
  };
}
