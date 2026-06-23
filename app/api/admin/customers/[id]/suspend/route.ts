import { NextResponse } from "next/server";
import { z } from "zod";

import { isAdminEmail } from "@/lib/admin";
import { readSessionFromCookie } from "@/lib/session";
import { suspendCustomer, recordAdminAction } from "@/lib/store";

const suspendSchema = z.object({
  reason: z.string().trim().min(2).max(500),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (id === session.userId) {
    return NextResponse.json({ error: "You cannot suspend your own admin account." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = suspendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Suspension reason is required." }, { status: 400 });
  }

  const user = await suspendCustomer({
    userId: id,
    adminUserId: session.userId,
    reason: parsed.data.reason,
  });
  if (!user) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  recordAdminAction({
    adminUserId: session.userId,
    adminEmail: session.email,
    action: "suspend_customer",
    targetType: "user",
    targetId: id,
    detail: `Suspended customer: ${parsed.data.reason}`,
    metadata: { reason: parsed.data.reason },
  }).catch(() => {});

  return NextResponse.json({ ok: true, user });
}
