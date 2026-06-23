import { NextResponse } from "next/server";
import { z } from "zod";

import { isAdminEmail } from "@/lib/admin";
import { readSessionFromCookie } from "@/lib/session";
import {
  adjustCustomerTokens,
  createBusinessApiRequest,
  findUserById,
  recordAdminAction,
  reviewBusinessApiRequest,
} from "@/lib/store";

const optionalLimitSchema = z.number().int().positive().max(100_000_000).nullable().optional();

const grantBusinessAccessSchema = z.object({
  tokenCredit: z.number().int().min(0).max(100_000_000).nullable().optional(),
  dailyTokenLimit: optionalLimitSchema,
  monthlyTokenLimit: optionalLimitSchema,
  maxConcurrentRequests: z.number().int().positive().max(100).nullable().optional(),
  maxConcurrentJobs: z.number().int().positive().max(100).nullable().optional(),
  maxQueuedJobs: z.number().int().positive().max(10_000).nullable().optional(),
  cloneCreditRate: z.union([z.literal(1), z.literal(1.5), z.literal(2)]).optional(),
  note: z.string().max(500).optional(),
  applyToActiveKeys: z.boolean().optional(),
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
  const parsed = grantBusinessAccessSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid business access details." }, { status: 400 });
  }

  const { id } = await params;
  const customer = await findUserById(id);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  const data = parsed.data;
  const tokenCredit = data.tokenCredit ?? 0;
  const note = data.note?.trim() || "Admin granted Business API access.";
  const businessRequest = await createBusinessApiRequest({
    userId: id,
    companyName: customer.email,
    appName: "Admin Business API Grant",
    useCase: note,
    expectedMonthlyTokens: data.monthlyTokenLimit ?? Math.max(tokenCredit, 100_000),
    expectedPeakConcurrency: data.maxConcurrentRequests ?? data.maxConcurrentJobs ?? 3,
    webhookUrl: null,
    contactTelegram: null,
    contactEmail: customer.email,
  });

  const approvedRequest = await reviewBusinessApiRequest({
    requestId: businessRequest.id,
    adminUserId: session.userId,
    status: "approved",
    adminNote: note,
    limits: {
      dailyTokenLimit: data.dailyTokenLimit ?? null,
      monthlyTokenLimit: data.monthlyTokenLimit ?? null,
      maxConcurrentRequests: data.maxConcurrentRequests ?? null,
      maxConcurrentJobs: data.maxConcurrentJobs ?? null,
      maxQueuedJobs: data.maxQueuedJobs ?? null,
      cloneCreditRate: data.cloneCreditRate ?? 1.5,
    },
    applyToActiveKeys: data.applyToActiveKeys !== false,
  });

  let balance: number | null = null;
  if (tokenCredit > 0) {
    const tokenResult = await adjustCustomerTokens({
      userId: id,
      adminUserId: session.userId,
      amount: tokenCredit,
      note: `Business API credit: ${note}`,
    });
    if (!tokenResult.ok) {
      return NextResponse.json({ error: "Business access was granted, but token credit failed." }, { status: 400 });
    }
    balance = tokenResult.balance;
  }

  recordAdminAction({
    adminUserId: session.userId,
    adminEmail: session.email,
    action: "grant_business_access",
    targetType: "user",
    targetId: id,
    detail: `Granted Business API access${tokenCredit > 0 ? ` with ${tokenCredit} token credit` : ""}: ${note}`,
    metadata: {
      tokenCredit,
      dailyTokenLimit: data.dailyTokenLimit ?? null,
      monthlyTokenLimit: data.monthlyTokenLimit ?? null,
      maxConcurrentRequests: data.maxConcurrentRequests ?? null,
      maxConcurrentJobs: data.maxConcurrentJobs ?? null,
      maxQueuedJobs: data.maxQueuedJobs ?? null,
      cloneCreditRate: data.cloneCreditRate ?? 1.5,
      applyToActiveKeys: data.applyToActiveKeys !== false,
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    businessRequest: approvedRequest,
    creditedTokens: tokenCredit,
    balance,
  });
}
