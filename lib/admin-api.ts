import "server-only";

import { isAdminEmail } from "@/lib/admin";
import { readSessionFromCookie } from "@/lib/session";

type AdminApiAuthResult =
  | {
      ok: true;
      userId: string;
      email: string;
    }
  | {
      ok: false;
      status: 401 | 403;
      error: string;
    };

export async function requireAdminApiSession(): Promise<AdminApiAuthResult> {
  const session = await readSessionFromCookie();
  if (!session) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  if (!isAdminEmail(session.email)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: true, userId: session.userId, email: session.email };
}
