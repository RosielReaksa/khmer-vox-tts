import { NextResponse } from "next/server";
import { z } from "zod";

import { isAdminEmail } from "@/lib/admin";
import { readSessionFromCookie } from "@/lib/session";
import { updateApiKeyLimits, recordAdminAction } from "@/lib/store";

const optionalLimitSchema = z.number().int().positive().max(100_000_000).nullable().optional();

const updateBusinessLimitsSchema = z.object({
  dailyTokenLimit: optionalLimitSchema,
  monthlyTokenLimit: optionalLimitSchema,
  maxConcurrentRequests: z.number().int().positive().max(100).nullable().optional(),
  maxConcurrentJobs: z.number().int().positive().max(100).nullable().optional(),
  maxQueuedJobs: z.number().int().positive().max(10_000).nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; keyId: string }> },
) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateBusinessLimitsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid API key business limits." }, { status: 400 });
  }

  const { id, keyId } = await params;
  const key = await updateApiKeyLimits(id, keyId, parsed.data);
  if (!key) {
    return NextResponse.json({ error: "API key not found." }, { status: 404 });
  }

  recordAdminAction({
    adminUserId: session.userId,
    adminEmail: session.email,
    action: "update_key_limits",
    targetType: "api_key",
    targetId: keyId,
    detail: `Updated business limits for API key ${keyId}`,
    metadata: { userId: id, ...parsed.data },
  }).catch(() => {});

  return NextResponse.json({ ok: true, key });
}
