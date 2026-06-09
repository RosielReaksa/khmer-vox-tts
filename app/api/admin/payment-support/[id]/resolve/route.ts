import { NextResponse } from "next/server";
import { z } from "zod";

import { isAdminEmail } from "@/lib/admin";
import { readSessionFromCookie } from "@/lib/session";
import { resolvePaymentSupportTicket } from "@/lib/store";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const bodySchema = z.object({
  adminNote: z.string().trim().max(500).optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

const reasonMessages: Record<string, string> = {
  TICKET_NOT_FOUND: "Support ticket not found.",
  TICKET_ALREADY_RESOLVED: "Support ticket is already resolved.",
};

export async function POST(request: Request, context: RouteContext) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = await context.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid support ticket id." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid admin note." }, { status: 400 });
  }

  const result = await resolvePaymentSupportTicket({
    ticketId: parsedParams.data.id,
    adminUserId: session.userId,
    adminNote: parsedBody.data.adminNote?.trim() || null,
  });

  if (!result.ok || !result.ticket) {
    return NextResponse.json(
      { error: reasonMessages[result.reason ?? ""] ?? "Could not resolve support ticket." },
      { status: result.reason === "TICKET_NOT_FOUND" ? 404 : 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    ticket: result.ticket,
    message:
      result.reason === "TICKET_ALREADY_RESOLVED"
        ? reasonMessages.TICKET_ALREADY_RESOLVED
        : "Support ticket resolved.",
  });
}
