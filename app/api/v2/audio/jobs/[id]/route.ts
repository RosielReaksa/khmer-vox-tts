import { NextResponse } from "next/server";

import { authenticateApiKeyFromRequest } from "@/lib/api-key-auth";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { getBatchJobWithItems } from "@/lib/store";
import { serializeV2AudioJob } from "@/lib/v2-audio-jobs";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function OPTIONS() {
  return corsOptionsResponse();
}

function jsonWithCors(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...corsHeaders(),
      ...init.headers,
    },
  });
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await authenticateApiKeyFromRequest(request);
  if (!auth.ok) {
    return jsonWithCors({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const result = await getBatchJobWithItems(id);
  if (!result || result.job.userId !== auth.userId) {
    return jsonWithCors({ error: "Audio job not found." }, { status: 404 });
  }

  const job = serializeV2AudioJob(result.job, result.items);
  return jsonWithCors({
    ok: true,
    job,
  });
}
