import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticateApiKeyFromRequest } from "@/lib/api-key-auth";
import {
  ApiKeyLimitError,
  apiKeyUsagePolicy,
  enforceApiKeyQueuedJobLimit,
  enforceApiKeyTokenLimit,
} from "@/lib/api-key-limits";
import {
  BatchJobServiceError,
  type BatchLineInput,
  createQueuedBatchJob,
  estimateBatchLineUsage,
  kickBatchWorker,
  MAX_BATCH_ITEMS,
  MAX_BATCH_SPEAKER_CHARS,
  MAX_EXTERNAL_ID_CHARS,
  MAX_WEBHOOK_URL_CHARS,
  parseBatchMetadataJson,
  parseBatchLines,
  serializeBatchMetadata,
} from "@/lib/batch-service";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { acquireUsageLimit, type UsageLimitResult } from "@/lib/rate-limit";
import { isJsonRequestError, jsonRequestErrorBody, readJsonRequest } from "@/lib/request-json";
import { getUsagePolicy } from "@/lib/server-usage-policy";
import { MAX_MODEL_CHARS, MAX_TEXT_CHARS, MAX_VOICE_CHARS } from "@/lib/usage-policy";
import { DEFAULT_TTS_VOICE_PROMPT } from "@/lib/voice-defaults";

export const runtime = "nodejs";

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

const batchLineObjectSchema = z.object({
  text: z.string().min(1).max(MAX_TEXT_CHARS),
  external_id: z.string().max(MAX_EXTERNAL_ID_CHARS).nullable().optional(),
  speaker: z.string().max(MAX_BATCH_SPEAKER_CHARS).nullable().optional(),
  start_ms: z.number().min(0).nullable().optional(),
  end_ms: z.number().min(0).nullable().optional(),
  metadata: z.unknown().nullable().optional(),
});

const batchSchema = z.object({
  input: z.union([
    z.string().min(1).max(MAX_TEXT_CHARS * MAX_BATCH_ITEMS),
    z.array(z.string().min(1).max(MAX_TEXT_CHARS)).min(1).max(MAX_BATCH_ITEMS),
    z.array(batchLineObjectSchema).min(1).max(MAX_BATCH_ITEMS),
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
  const auth = await authenticateApiKeyFromRequest(request);
  if (!auth.ok) {
    return jsonWithCors({ error: auth.error }, { status: auth.status });
  }

  let limit: Extract<UsageLimitResult, { ok: true }> | null = null;

  try {
    const body = await readJsonRequest(request);
    const parsed = batchSchema.safeParse(body);
    if (!parsed.success) {
      return jsonWithCors({ error: "Invalid batch request payload." }, { status: 400 });
    }
    if (parsed.data.voice) {
      const inputVoice = parsed.data.voice.trim().toLowerCase();
      if (inputVoice !== "female" && inputVoice !== "male") {
        return jsonWithCors(
          { error: "Only 'female' and 'male' preset voices are supported in Standard TTS.", code: "VOICE_UNSUPPORTED" },
          { status: 400 },
        );
      }
    }

    const lines = batchInputToLines(parsed.data.input);
    await enforceApiKeyTokenLimit(auth.apiKey, estimateBatchLineUsage(lines, "tts").creditsEstimated);
    await enforceApiKeyQueuedJobLimit(auth.apiKey);

    const usageLimit = await acquireUsageLimit(
      `api:${auth.userId}:${auth.apiKeyId}:batch-tts`,
      apiKeyUsagePolicy(auth.apiKey, getUsagePolicy("apiTts")),
    );
    if (!usageLimit.ok) {
      return jsonWithCors(
        { error: usageLimit.message, code: usageLimit.code },
        { status: usageLimit.status, headers: usageLimit.headers },
      );
    }
    limit = usageLimit;

    const result = await createQueuedBatchJob({
      userId: auth.userId,
      apiKeyId: auth.apiKeyId,
      source: "api_key",
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

    return jsonWithCors(
      {
        ok: true,
        queued: true,
        job: {
          id: result.job.id,
          external_id: result.job.externalId,
          mode: result.job.mode,
          status: result.job.status,
          title: result.job.title,
          total_items: result.job.totalItems,
          credits_estimated: result.job.creditsEstimated,
          metadata: parseBatchMetadataJson(result.job.metadataJson),
          webhook: {
            configured: Boolean(result.job.webhookCallbackUrl),
            status: result.job.webhookStatus,
          },
          created_at: result.job.createdAt,
        },
        items: result.items.map((item) => ({
          index: item.itemIndex,
          external_id: item.externalId,
          speaker: item.speaker,
          start_ms: item.startMs,
          end_ms: item.endMs,
          metadata: parseBatchMetadataJson(item.metadataJson),
          status: item.status,
          generation_id: item.generationId,
          audio_base64: item.audioBase64,
          content_type: item.contentType,
          output_seconds: item.outputSeconds,
          credits_charged: item.creditsCharged,
          error: item.errorMessage,
        })),
      },
      { status: 202, headers: limit.headers },
    );
  } catch (error) {
    if (isJsonRequestError(error)) {
      return jsonWithCors(jsonRequestErrorBody(error), { status: error.status, headers: limit?.headers });
    }
    if (error instanceof ApiKeyLimitError) {
      return jsonWithCors({ error: error.message, code: error.code }, { status: error.status, headers: limit?.headers });
    }
    if (error instanceof BatchJobServiceError) {
      return jsonWithCors(
        { error: error.message, code: error.code, remainingTokens: error.remainingTokens },
        { status: error.status, headers: limit?.headers },
      );
    }
    return jsonWithCors({ error: "Batch generation failed." }, { status: 500, headers: limit?.headers });
  } finally {
    await limit?.release();
  }
}
