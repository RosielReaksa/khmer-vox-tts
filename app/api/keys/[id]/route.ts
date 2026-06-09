import { NextResponse } from "next/server";
import { z } from "zod";

import { isJsonRequestError, jsonRequestErrorBody, readJsonRequest } from "@/lib/request-json";
import { readSessionFromCookie } from "@/lib/session";
import { updateApiKeyLimits } from "@/lib/store";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const updateKeySchema = z.object({
  dailyTokenLimit: z.number().int().positive().nullable().optional(),
  monthlyTokenLimit: z.number().int().positive().nullable().optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = await context.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid API key id." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await readJsonRequest(request);
  } catch (error) {
    if (isJsonRequestError(error)) {
      return NextResponse.json(jsonRequestErrorBody(error), { status: error.status });
    }
    throw error;
  }

  const parsedBody = updateKeySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid API key limits." }, { status: 400 });
  }

  const key = await updateApiKeyLimits(session.userId, parsedParams.data.id, parsedBody.data);
  if (!key) {
    return NextResponse.json({ error: "API key not found." }, { status: 404 });
  }

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
    },
  });
}
