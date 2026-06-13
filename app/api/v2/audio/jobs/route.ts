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
  MAX_BATCH_TOTAL_CHARS,
  MAX_EXTERNAL_ID_CHARS,
  MAX_WEBHOOK_URL_CHARS,
  serializeBatchMetadata,
} from "@/lib/batch-service";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { acquireUsageLimit, type UsageLimitResult } from "@/lib/rate-limit";
import { isJsonRequestError, jsonRequestErrorBody, readJsonRequest } from "@/lib/request-json";
import { getUsagePolicy } from "@/lib/server-usage-policy";
import { MAX_MODEL_CHARS, MAX_TEXT_CHARS, MAX_VOICE_CHARS } from "@/lib/usage-policy";
import { DEFAULT_TTS_VOICE_PROMPT } from "@/lib/voice-defaults";
import {
  expandV2AudioInputToLines,
  serializeV2AudioJob,
  type V2AudioLineObject,
} from "@/lib/v2-audio-jobs";
import { isUnsupportedPublicAudioOutputFormat } from "@/lib/audio-api";

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

const lineObjectSchema = z.object({
  id: z.string().max(MAX_EXTERNAL_ID_CHARS).nullable().optional(),
  text: z.string().min(1).max(MAX_BATCH_TOTAL_CHARS),
  external_id: z.string().max(MAX_EXTERNAL_ID_CHARS).nullable().optional(),
  speaker: z.string().max(MAX_BATCH_SPEAKER_CHARS).nullable().optional(),
  start_ms: z.number().min(0).nullable().optional(),
  end_ms: z.number().min(0).nullable().optional(),
  metadata: z.unknown().nullable().optional(),
});

const inputSchema = z.union([
  z.string().min(1).max(MAX_BATCH_TOTAL_CHARS),
  z.array(z.string().min(1).max(MAX_TEXT_CHARS)).min(1).max(MAX_BATCH_ITEMS),
  z.array(lineObjectSchema).min(1).max(MAX_BATCH_ITEMS),
]);

const jobSchema = z.object({
  input: inputSchema,
  voice: z.string().min(1).max(MAX_VOICE_CHARS).optional(),
  model: z.string().min(1).max(MAX_MODEL_CHARS).optional(),
  title: z.string().max(120).optional(),
  external_id: z.string().max(MAX_EXTERNAL_ID_CHARS).nullable().optional(),
  metadata: z.unknown().nullable().optional(),
  webhook_url: z.string().max(MAX_WEBHOOK_URL_CHARS).nullable().optional(),
  output_format: z.string().max(16).optional(),
});

function toV2Input(input: z.infer<typeof inputSchema>): string | string[] | V2AudioLineObject[] {
  return input as string | string[] | V2AudioLineObject[];
}

export async function POST(request: Request) {
  const auth = await authenticateApiKeyFromRequest(request);
  if (!auth.ok) {
    return jsonWithCors({ error: auth.error }, { status: auth.status });
  }

  let limit: Extract<UsageLimitResult, { ok: true }> | null = null;

  try {
    const parsed = jobSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) {
      return jsonWithCors({ error: "Invalid async audio job payload." }, { status: 400 });
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
    if (isUnsupportedPublicAudioOutputFormat(parsed.data.output_format)) {
      return jsonWithCors(
        { error: "Only MP3 output is supported.", code: "OUTPUT_FORMAT_UNSUPPORTED" },
        { status: 400 },
      );
    }

    const lines: BatchLineInput[] = expandV2AudioInputToLines(toV2Input(parsed.data.input));
    await enforceApiKeyTokenLimit(auth.apiKey, estimateBatchLineUsage(lines, "tts").creditsEstimated);
    await enforceApiKeyQueuedJobLimit(auth.apiKey);

    const usageLimit = await acquireUsageLimit(
      `api:${auth.userId}:${auth.apiKeyId}:v2-tts-job`,
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
      title: parsed.data.title ?? "Async Standard TTS",
      lines,
      voice: parsed.data.voice ?? DEFAULT_TTS_VOICE_PROMPT,
      model: parsed.data.model,
      externalId: parsed.data.external_id,
      metadataJson: serializeBatchMetadata(parsed.data.metadata),
      webhookCallbackUrl: parsed.data.webhook_url,
    });
    kickBatchWorker(result.job.id);

    const job = serializeV2AudioJob(result.job, result.items);
    return jsonWithCors(
      {
        ok: true,
        queued: true,
        job_id: result.job.id,
        status: result.job.status,
        status_url: job.status_url,
        audio_url: job.audio_url,
        zip_url: job.zip_url,
        job,
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
    return jsonWithCors({ error: "Async audio job could not be queued." }, { status: 500, headers: limit?.headers });
  } finally {
    await limit?.release();
  }
}
