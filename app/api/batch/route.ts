import { NextResponse } from "next/server";
import { z } from "zod";

import {
  BatchJobServiceError,
  type BatchLineInput,
  createQueuedBatchJob,
  kickBatchWorker,
  MAX_BATCH_ITEMS,
  MAX_BATCH_SPEAKER_CHARS,
  MAX_EXTERNAL_ID_CHARS,
  MAX_WEBHOOK_URL_CHARS,
  parseBatchLines,
  serializeBatchMetadata,
} from "@/lib/batch-service";
import { acquireUsageLimit, type UsageLimitResult } from "@/lib/rate-limit";
import { isJsonRequestError, jsonRequestErrorBody, readJsonRequest } from "@/lib/request-json";
import { getUsagePolicy } from "@/lib/server-usage-policy";
import { readSessionFromCookie } from "@/lib/session";
import { MAX_MODEL_CHARS, MAX_TEXT_CHARS, MAX_VOICE_CHARS } from "@/lib/usage-policy";
import { DEFAULT_TTS_VOICE_PROMPT } from "@/lib/voice-defaults";

export const runtime = "nodejs";

const batchSchema = z.object({
  input: z.union([
    z.string().min(1).max(MAX_TEXT_CHARS * MAX_BATCH_ITEMS),
    z.array(z.string().min(1).max(MAX_TEXT_CHARS)).min(1).max(MAX_BATCH_ITEMS),
    z.array(z.object({
      text: z.string().min(1).max(MAX_TEXT_CHARS),
      external_id: z.string().max(MAX_EXTERNAL_ID_CHARS).nullable().optional(),
      speaker: z.string().max(MAX_BATCH_SPEAKER_CHARS).nullable().optional(),
      start_ms: z.number().min(0).nullable().optional(),
      end_ms: z.number().min(0).nullable().optional(),
      metadata: z.unknown().nullable().optional(),
    })).min(1).max(MAX_BATCH_ITEMS),
  ]),
  voice: z.string().min(1).max(MAX_VOICE_CHARS).optional(),
  model: z.string().min(1).max(MAX_MODEL_CHARS).optional(),
  title: z.string().max(120).optional(),
  external_id: z.string().max(MAX_EXTERNAL_ID_CHARS).nullable().optional(),
  metadata: z.unknown().nullable().optional(),
  webhook_url: z.string().max(MAX_WEBHOOK_URL_CHARS).nullable().optional(),
});

function batchInputToLines(input: z.infer<typeof batchSchema>["input"]): BatchLineInput[] {
  if (typeof input === "string") {
    return parseBatchLines(input).map((text) => ({ text }));
  }
  return input.map((line) => {
    if (typeof line === "string") return { text: line };
    return {
      text: line.text,
      externalId: line.external_id ?? null,
      speaker: line.speaker ?? null,
      startMs: line.start_ms ?? null,
      endMs: line.end_ms ?? null,
      metadataJson: serializeBatchMetadata(line.metadata),
    };
  });
}

export async function POST(request: Request) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let limit: Extract<UsageLimitResult, { ok: true }> | null = null;

  try {
    const body = await readJsonRequest(request);
    const parsed = batchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid batch payload." }, { status: 400 });
    }

    const lines = batchInputToLines(parsed.data.input);
    const usageLimit = await acquireUsageLimit(
      `dashboard:${session.userId}:batch-tts`,
      getUsagePolicy("dashboardTts"),
    );
    if (!usageLimit.ok) {
      return NextResponse.json(
        { error: usageLimit.message, code: usageLimit.code },
        { status: usageLimit.status, headers: usageLimit.headers },
      );
    }
    limit = usageLimit;

    const result = await createQueuedBatchJob({
      userId: session.userId,
      source: "dashboard",
      mode: "tts",
      title: parsed.data.title,
      lines,
      voice: parsed.data.voice ?? DEFAULT_TTS_VOICE_PROMPT,
      model: parsed.data.model,
      externalId: parsed.data.external_id,
      metadataJson: serializeBatchMetadata(parsed.data.metadata),
      webhookCallbackUrl: parsed.data.webhook_url,
    });
    kickBatchWorker(result.job.id);

    return NextResponse.json({ ok: true, queued: true, ...result }, { status: 202, headers: limit.headers });
  } catch (error) {
    if (isJsonRequestError(error)) {
      return NextResponse.json(jsonRequestErrorBody(error), { status: error.status, headers: limit?.headers });
    }
    if (error instanceof BatchJobServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code, remainingTokens: error.remainingTokens },
        { status: error.status, headers: limit?.headers },
      );
    }
    return NextResponse.json({ error: "Batch generation failed." }, { status: 500, headers: limit?.headers });
  } finally {
    await limit?.release();
  }
}
