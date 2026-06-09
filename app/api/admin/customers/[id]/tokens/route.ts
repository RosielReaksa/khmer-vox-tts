import { NextResponse } from "next/server";
import { z } from "zod";

import { isAdminEmail } from "@/lib/admin";
import { readSessionFromCookie } from "@/lib/session";
import { adjustCustomerTokens } from "@/lib/store";

const tokenAdjustmentSchema = z.object({
  amount: z.number().int().min(-100_000_000).max(100_000_000).refine((value) => value !== 0),
  note: z.string().max(500).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = tokenAdjustmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Amount must be a non-zero whole number." }, { status: 400 });
  }

  const { id } = await params;
  const result = await adjustCustomerTokens({
    userId: id,
    adminUserId: session.userId,
    amount: parsed.data.amount,
    note: parsed.data.note?.trim() || null,
  });

  if (!result.ok) {
    const status = result.reason === "USER_NOT_FOUND" ? 404 : 400;
    const message =
      result.reason === "INSUFFICIENT_BALANCE"
        ? "Cannot remove more tokens than the customer has."
        : "Customer not found.";
    return NextResponse.json({ error: message, reason: result.reason, balance: result.balance }, { status });
  }

  return NextResponse.json({
    ok: true,
    transaction: result.transaction,
    balance: result.balance,
  });
}
