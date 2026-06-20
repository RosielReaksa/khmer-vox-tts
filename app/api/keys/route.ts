import { NextResponse } from "next/server";
import { z } from "zod";

import { getApiAccessStatus } from "@/lib/api-access";
import { isJsonRequestError, jsonRequestErrorBody, readJsonRequest } from "@/lib/request-json";
import { readSessionFromCookie } from "@/lib/session";
import { generateApiKey } from "@/lib/security";
import { createApiKey, findUserById, listUserApiKeys } from "@/lib/store";

const createKeySchema = z.object({
  name: z.string().min(2).max(50),
  dailyTokenLimit: z.number().int().positive().nullable().optional(),
  monthlyTokenLimit: z.number().int().positive().nullable().optional(),
});

export async function GET() {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keys = await listUserApiKeys(session.userId);
  return NextResponse.json({
    keys: keys.map((key) => ({
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      dailyTokenLimit: key.dailyTokenLimit,
      monthlyTokenLimit: key.monthlyTokenLimit,
      maxConcurrentRequests: key.maxConcurrentRequests,
      maxConcurrentJobs: key.maxConcurrentJobs,
      maxQueuedJobs: key.maxQueuedJobs,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
      revokedAt: key.revokedAt,
      requestCount: 0,
    })),
  });
}

export async function POST(request: Request) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await findUserById(session.userId);
  if (!user || user.suspendedAt) {
    return NextResponse.json({ error: "Account is suspended." }, { status: 403 });
  }
  const apiAccess = await getApiAccessStatus(session.userId);
  if (!apiAccess.hasPaidApiAccess) {
    return NextResponse.json(
      {
        error: "API keys require a paid token pack. Buy Creator or a token pack first.",
        code: "PAID_PLAN_REQUIRED",
      },
      { status: 402 },
    );
  }

  try {
    const body = await readJsonRequest(request);
    const parsed = createKeySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid API key name." }, { status: 400 });
    }

    const generated = generateApiKey();
    const isBusiness = apiAccess.businessLimits !== null;

    const key = await createApiKey(
      session.userId,
      parsed.data.name.trim(),
      generated.keyPrefix,
      generated.keyHash,
      {
        dailyTokenLimit: parsed.data.dailyTokenLimit ?? (isBusiness ? apiAccess.businessLimits?.dailyTokenLimit : null) ?? null,
        monthlyTokenLimit: parsed.data.monthlyTokenLimit ?? (isBusiness ? apiAccess.businessLimits?.monthlyTokenLimit : null) ?? null,
        maxConcurrentRequests: isBusiness ? (apiAccess.businessLimits?.maxConcurrentRequests ?? null) : null,
        maxConcurrentJobs: isBusiness ? (apiAccess.businessLimits?.maxConcurrentJobs ?? null) : null,
        maxQueuedJobs: isBusiness ? (apiAccess.businessLimits?.maxQueuedJobs ?? null) : null,
      },
    );

    return NextResponse.json({
      ok: true,
      key: {
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        dailyTokenLimit: key.dailyTokenLimit,
        monthlyTokenLimit: key.monthlyTokenLimit,
        maxConcurrentRequests: key.maxConcurrentRequests,
        maxConcurrentJobs: key.maxConcurrentJobs,
        maxQueuedJobs: key.maxQueuedJobs,
        createdAt: key.createdAt,
        lastUsedAt: key.lastUsedAt,
        revokedAt: key.revokedAt,
        requestCount: 0,
      },
      rawKey: generated.rawKey,
    });
  } catch (error) {
    if (isJsonRequestError(error)) {
      return NextResponse.json(jsonRequestErrorBody(error), { status: error.status });
    }
    return NextResponse.json({ error: "Could not create API key." }, { status: 500 });
  }
}
