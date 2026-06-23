import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { readSessionFromCookie } from "@/lib/session";
import { unsuspendCustomer, recordAdminAction } from "@/lib/store";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const user = await unsuspendCustomer({
    userId: id,
    adminUserId: session.userId,
  });
  if (!user) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  recordAdminAction({
    adminUserId: session.userId,
    adminEmail: session.email,
    action: "unsuspend_customer",
    targetType: "user",
    targetId: id,
    detail: "Unsuspended customer",
  }).catch(() => {});

  return NextResponse.json({ ok: true, user });
}
