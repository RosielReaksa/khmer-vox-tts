import { NextResponse } from "next/server";
import { z } from "zod";

import { BatchJobServiceError, normalizeWebhookCallbackUrl } from "@/lib/batch-service";
import { getCurrentUser } from "@/lib/current-user";
import { createBusinessApiRequest, listUserBusinessApiRequests } from "@/lib/store";

const requestSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  appName: z.string().trim().min(2).max(120),
  useCase: z.string().trim().min(20).max(2_000),
  expectedMonthlyTokens: z.number().int().positive().max(100_000_000),
  expectedPeakConcurrency: z.number().int().positive().max(100),
  webhookUrl: z.string().trim().max(2_048).nullable().optional(),
  contactTelegram: z.string().trim().max(120).nullable().optional(),
  contactEmail: z.string().trim().email().max(180).optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requests = await listUserBusinessApiRequests(user.id);
  return NextResponse.json({ requests });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid business request details." }, { status: 400 });
  }

  try {
    const webhookUrl = normalizeWebhookCallbackUrl(parsed.data.webhookUrl);
    const businessRequest = await createBusinessApiRequest({
      userId: user.id,
      companyName: parsed.data.companyName,
      appName: parsed.data.appName,
      useCase: parsed.data.useCase,
      expectedMonthlyTokens: parsed.data.expectedMonthlyTokens,
      expectedPeakConcurrency: parsed.data.expectedPeakConcurrency,
      webhookUrl,
      contactTelegram: parsed.data.contactTelegram?.trim() || null,
      contactEmail: parsed.data.contactEmail?.trim() || user.email,
    });

    return NextResponse.json({ ok: true, request: businessRequest });
  } catch (error) {
    if (error instanceof BatchJobServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Could not submit business API request." }, { status: 500 });
  }
}
