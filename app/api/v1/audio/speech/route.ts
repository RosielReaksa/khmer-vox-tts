import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticateApiKeyFromRequest, authenticateApiKeyFromApiKeyString } from "@/lib/api-key-auth";
import { ApiKeyLimitError, apiKeyUsagePolicy, enforceApiKeyTokenLimit, enforceApiKeyQueuedJobLimit } from "@/lib/api-key-limits";
import { logApiError } from "@/lib/api-error-log";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { calculateGenerationUsage, GenerationServiceError } from "@/lib/generation-service";
import { acquireUsageLimit, type UsageLimitResult } from "@/lib/rate-limit";
import { getUsagePolicy } from "@/lib/server-usage-policy";
import { PUBLIC_AUDIO_OUTPUT_FORMAT, isUnsupportedPublicAudioOutputFormat } from "@/lib/audio-api";
import { isJsonRequestError, jsonRequestErrorBody, readJsonRequest } from "@/lib/request-json";
import { MAX_MODEL_CHARS, MAX_TEXT_CHARS, MAX_VOICE_CHARS } from "@/lib/usage-policy";
import { DEFAULT_TTS_VOICE_PROMPT, VOICE_STYLE_IDS } from "@/lib/voice-defaults";
import {
  BatchJobServiceError,
  createQueuedBatchJob,
  estimateBatchLineUsage,
  kickBatchWorker,
  parseBatchLines,
} from "@/lib/batch-service";

export const runtime = "nodejs";

export async function OPTIONS() {
  return corsOptionsResponse();
}

function jsonWithCors(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...corsHeaders(),
      ...(init.headers || {}),
    },
  });
}

const speechSchema = z.object({
  input: z.string().min(1).max(MAX_TEXT_CHARS),
  voice: z.string().min(1).max(MAX_VOICE_CHARS).optional(),
  model: z.string().min(1).max(MAX_MODEL_CHARS).optional(),
  output_format: z.string().max(16).optional(),
  voice_style: z.enum(VOICE_STYLE_IDS).optional(),
});

export async function POST(request: Request) {
  // Support API key via query param (works around Next.js header truncation bug)
  const url = new URL(request.url);
  const queryKey = url.searchParams.get("api_key");
  let auth;
  if (queryKey) {
    auth = await authenticateApiKeyFromApiKeyString(queryKey);
  } else {
    auth = await authenticateApiKeyFromRequest(request);
  }
  if (!auth.ok) {
    return jsonWithCors({ error: auth.error }, { status: auth.status });
  }

  let limit: Extract<UsageLimitResult, { ok: true }> | null = null;

  try {
    const body = await readJsonRequest(request);
    const parsed = speechSchema.safeParse(body);
    if (!parsed.success) {
      return jsonWithCors(
        { error: `Invalid request payload. Input max is ${MAX_TEXT_CHARS.toLocaleString()} characters.` },
        { status: 400 },
      );
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

    // Always use batch processing for reliability (avoids 502 timeouts)
    await enforceApiKeyQueuedJobLimit(auth.apiKey);
    const lines = parseBatchLines(parsed.data.input).map((text) => ({ text }));
    const estimatedCredits = estimateBatchLineUsage(lines, "tts").creditsEstimated;
    await enforceApiKeyTokenLimit(auth.apiKey, estimatedCredits);

    const usageLimit = await acquireUsageLimit(
      `api:${auth.userId}:${auth.apiKeyId}:tts`,
      apiKeyUsagePolicy(auth.apiKey, getUsagePolicy("apiTts")),
    );
    if (!usageLimit.ok) {
      logApiError({
        request,
        statusCode: usageLimit.status,
        errorMessage: usageLimit.message,
        errorCode: usageLimit.code,
        source: "api_key",
        userId: auth.userId,
        apiKeyId: auth.apiKeyId,
      });
      return jsonWithCors(
        { error: usageLimit.message, code: usageLimit.code },
        { status: usageLimit.status, headers: usageLimit.headers },
      );
    }
    limit = usageLimit;

    const batch = await createQueuedBatchJob({
      userId: auth.userId,
      apiKeyId: auth.apiKeyId,
      source: "api_key",
      mode: "tts",
      lines,
      voice: parsed.data.voice ?? DEFAULT_TTS_VOICE_PROMPT,
      model: parsed.data.model,
    });
    kickBatchWorker(batch.job.id);

    return jsonWithCors(
      {
        ok: true,
        queued: true,
        message: "Speech generation queued. Poll the job endpoint to retrieve audio.",
        job: {
          id: batch.job.id,
          status: batch.job.status,
          total_items: batch.job.totalItems,
          completed_items: 0,
          credits_estimated: batch.job.creditsEstimated,
          credits_charged: 0,
          created_at: batch.job.createdAt,
        },
          poll_url: `/api/v1/audio/batch/jobs/${batch.job.id}`,
          audio_url: `/api/v1/audio/batch/jobs/${batch.job.id}/download`,
      },
      { status: 202, headers: limit.headers },
    );
  } catch (error) {
    if (isJsonRequestError(error)) {
      logApiError({
        request,
        statusCode: error.status,
        errorMessage: error.message,
        errorCode: "INVALID_JSON",
        source: "api_key",
        userId: auth.userId,
        apiKeyId: auth.apiKeyId,
      });
      return jsonWithCors(jsonRequestErrorBody(error), { status: error.status, headers: limit?.headers });
    }
    if (error instanceof ApiKeyLimitError) {
      logApiError({
        request,
        statusCode: error.status,
        errorMessage: error.message,
        errorCode: error.code,
        source: "api_key",
        userId: auth.userId,
        apiKeyId: auth.apiKeyId,
      });
      return jsonWithCors({ error: error.message, code: error.code }, { status: error.status, headers: limit?.headers });
    }
    if (error instanceof GenerationServiceError) {
      logApiError({
        request,
        statusCode: error.status,
        errorMessage: error.message,
        errorCode: error.code,
        source: "api_key",
        userId: auth.userId,
        apiKeyId: auth.apiKeyId,
      });
      return jsonWithCors(
        { error: error.message, code: error.code, remainingTokens: error.remainingTokens },
        { status: error.status, headers: { ...corsHeaders(), ...(limit?.headers || {}) } },
      );
    }
    if (error instanceof BatchJobServiceError) {
      logApiError({
        request,
        statusCode: error.status,
        errorMessage: error.message,
        errorCode: error.code,
        source: "api_key",
        userId: auth.userId,
        apiKeyId: auth.apiKeyId,
      });
      return jsonWithCors(
        { error: error.message, code: error.code, remainingTokens: error.remainingTokens },
        { status: error.status, headers: { ...corsHeaders(), ...(limit?.headers || {}) } },
      );
    }
    logApiError({
      request,
      statusCode: 500,
      errorMessage: error instanceof Error ? error.message : "Speech generation failed.",
      errorCode: "INTERNAL_ERROR",
      source: "api_key",
      userId: auth.userId,
      apiKeyId: auth.apiKeyId,
    });
    return jsonWithCors({ error: "Speech generation failed." }, { status: 500, headers: limit?.headers });
  } finally {
    await limit?.release();
  }
}
