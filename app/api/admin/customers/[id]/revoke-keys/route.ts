import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { readSessionFromCookie } from "@/lib/session";
import { revokeAllUserApiKeysForAdmin, recordAdminAction } from "@/lib/store";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const revokedCount = await revokeAllUserApiKeysForAdmin(id);

  recordAdminAction({
    adminUserId: session.userId,
    adminEmail: session.email,
    action: "revoke_keys",
    targetType: "user",
    targetId: id,
    detail: `Revoked ${revokedCount} API keys`,
    metadata: { revokedCount },
  }).catch(() => {});

  return NextResponse.json({ ok: true, revokedCount });
}
