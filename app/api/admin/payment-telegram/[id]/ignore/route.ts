import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { readSessionFromCookie } from "@/lib/session";
import { recordAdminAction, updateTelegramPaymentEventDecision } from "@/lib/store";

async function readReturnTo(request: Request): Promise<{ adminNote: string | null; returnTo: string | null }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as {
      adminNote?: unknown;
      returnTo?: unknown;
    };
    return {
      adminNote: typeof body.adminNote === "string" ? body.adminNote.trim().slice(0, 500) : null,
      returnTo: typeof body.returnTo === "string" ? body.returnTo : null,
    };
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) return { adminNote: null, returnTo: null };
  const adminNote = formData.get("adminNote");
  const returnTo = formData.get("returnTo");
  return {
    adminNote: typeof adminNote === "string" ? adminNote.trim().slice(0, 500) : null,
    returnTo: typeof returnTo === "string" ? returnTo : null,
  };
}

function redirectOrJson(request: Request, returnTo: string | null, data: unknown, status = 200) {
  if (returnTo?.startsWith("/app/admin/")) {
    return NextResponse.redirect(new URL(returnTo, request.url), { status: 303 });
  }
  return NextResponse.json(data, { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { adminNote, returnTo } = await readReturnTo(request);
  const { id } = await params;
  const event = await updateTelegramPaymentEventDecision({
    eventId: id,
    decisionStatus: "ignored",
    decisionReason: adminNote || "IGNORED_BY_ADMIN",
  });

  if (!event) {
    return redirectOrJson(request, returnTo, { error: "Telegram payment event not found." }, 404);
  }

  recordAdminAction({
    adminUserId: session.userId,
    adminEmail: session.email,
    action: "ignore_telegram_payment",
    targetType: "telegram_event",
    targetId: id,
    detail: `Ignored Telegram payment event${adminNote ? `: ${adminNote}` : ""}`,
    metadata: { adminNote },
  }).catch(() => {});

  return redirectOrJson(request, returnTo, { ok: true, event });
}
