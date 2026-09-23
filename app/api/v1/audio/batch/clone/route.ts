import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticateApiKeyFromRequest, authenticateApiKeyFromApiKeyString } from "@/lib/api-key-auth";
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
import { logApiError } from "@/lib/api-error-log";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { acquireUsageLimit, type UsageLimitResult } from "@/lib/rate-limit";
import { isJsonRequestError, jsonRequestErrorBody, readJsonRequest } from "@/lib/request-json";
import { getUsagePolicy } from "@/lib/server-usage-policy";
import {
  MAX_CLONE_SAMPLE_BYTES,
  MAX_MODEL_CHARS,
  MAX_TEXT_CHARS,
  MAX_VOICE_CHARS,
} from "@/lib/usage-policy";
import {
  PUBLIC_AUDIO_OUTPUT_FORMAT,
  isUnsupportedPublicAudioOutputFormat,
  publicBatchJobUrls,
} from "@/lib/audio-api";
import { isVoiceCloneConsentAccepted } from "@/lib/voice-consent";
import { DEFAULT_CLONE_VOICE_INSTRUCTION } from "@/lib/voice-defaults";

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
  id: z.string().max(MAX_EXTERNAL_ID_CHARS).nullable().optional(),
  text: z.string().min(1).max(MAX_TEXT_CHARS),
  external_id: z.string().max(MAX_EXTERNAL_ID_CHARS).nullable().optional(),
  speaker: z.string().max(MAX_BATCH_SPEAKER_CHARS).nullable().optional(),
  start_ms: z.number().min(0).nullable().optional(),
  end_ms: z.number().min(0).nullable().optional(),
  metadata: z.unknown().nullable().optional(),
});

const cloneBatchInputSchema = z.union([
  z.string().min(1).max(MAX_TEXT_CHARS * MAX_BATCH_ITEMS),
  z.array(z.string().min(1).max(MAX_TEXT_CHARS)).min(1).max(MAX_BATCH_ITEMS),
  z.array(batchLineObjectSchema).min(1).max(MAX_BATCH_ITEMS),
]);

const cloneJsonSchema = z.object({
  input: cloneBatchInputSchema.optional(),
  items: cloneBatchInputSchema.optional(),
  voice: z.string().min(1).max(MAX_VOICE_CHARS).optional(),
  model: z.string().min(1).max(MAX_MODEL_CHARS).optional(),
  title: z.string().max(120).optional(),
  external_id: z.string().max(MAX_EXTERNAL_ID_CHARS).nullable().optional(),
  metadata: z.unknown().nullable().optional(),
  clone_audio_base64: z.string().min(1).optional(),
  reference_audio_base64: z.string().min(1).optional(),
  clone_audio_mime_type: z.string().optional(),
  reference_audio_mime_type: z.string().optional(),
  voice_consent: z.union([z.boolean(), z.string()]).optional(),
  webhook_url: z.string().max(MAX_WEBHOOK_URL_CHARS).nullable().optional(),
  output_format: z.string().max(16).optional(),
});

function batchInputToLines(input: z.infer<typeof cloneBatchInputSchema>): BatchLineInput[] {
  if (typeof input === "string") {
    return parseBatchLines(input).map((text) => ({ text }));
  }
  return input.map((line) => {
    if (typeof line === "string") return { text: line };
    return {
      text: line.text,
      externalId: line.external_id ?? line.id ?? null,
      speaker: line.speaker ?? null,
      startMs: line.start_ms ?? null,
      endMs: line.end_ms ?? null,
      metadataJson: serializeBatchMetadata(line.metadata),
    };
  });
}

export async function POST(request: Request) {
  // Support API key via query param (works around Next.js header truncation bug)
  const url = new URL(request.url);
  const queryKey = url.searchParams.get("api_key");
  let auth;
  if (queryKey) { auth = await authenticateApiKeyFromApiKeyString(queryKey); } else { auth = await authenticateApiKeyFromRequest(request); }
  if (!auth.ok) {
    return jsonWithCors({ error: auth.error }, { status: auth.status });
  }

  let limit: Extract<UsageLimitResult, { ok: true }> | null = null;

  try {
    const contentType = request.headers.get("content-type") ?? "";
    let input: string | string[] | BatchLineInput[];
    let voice = DEFAULT_CLONE_VOICE_INSTRUCTION;
    let model: string | undefined;
    let title: string | undefined;
    let webhookCallbackUrl: string | null | undefined;
    let externalId: string | null | undefined;
    let metadataJson: string | null | undefined;
    let sampleBytes: Uint8Array;
    let sampleMimeType = "audio/wav";
    let fileName = "sample.wav";
    let voiceConsentAccepted = false;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const inputValue = formData.get("input") ?? formData.get("text") ?? "";
      const sample = formData.get("sample");
      const voiceValue = formData.get("voice");
      const modelValue = formData.get("model");
      const titleValue = formData.get("title");
      const consentValue = formData.get("voice_consent");
      const webhookValue = formData.get("webhook_url");
      const outputFormatValue = formData.get("output_format");
      const externalIdValue = formData.get("external_id");
      const metadataValue = formData.get("metadata");

      input = typeof inputValue === "string" ? inputValue : "";
      voice = typeof voiceValue === "string" && voiceValue.trim() ? voiceValue : DEFAULT_CLONE_VOICE_INSTRUCTION;
      model = typeof modelValue === "string" && modelValue.trim() ? modelValue : undefined;
      title = typeof titleValue === "string" ? titleValue.slice(0, 120) : undefined;
      webhookCallbackUrl = typeof webhookValue === "string" ? webhookValue : undefined;
      externalId = typeof externalIdValue === "string" ? externalIdValue : undefined;
      metadataJson = typeof metadataValue === "string" ? serializeBatchMetadata(metadataValue) : undefined;
      voiceConsentAccepted = isVoiceCloneConsentAccepted(consentValue);
      if (isUnsupportedPublicAudioOutputFormat(outputFormatValue)) {
        return jsonWithCors(
          { error: "Only MP3 output is supported.", code: "OUTPUT_FORMAT_UNSUPPORTED" },
          { status: 400 },
        );
      }

      if (!(sample instanceof File)) {
        return jsonWithCors({ error: "Missing sample file." }, { status: 400 });
      }
      if (sample.size <= 0 || sample.size > MAX_CLONE_SAMPLE_BYTES) {
        return jsonWithCors({ error: "Sample must be between 1 byte and 8MB." }, { status: 400 });
      }
      sampleBytes = new Uint8Array(await sample.arrayBuffer());
      sampleMimeType = sample.type || "audio/wav";
      fileName = sample.name || "sample.wav";
    } else {
      const parsed = cloneJsonSchema.safeParse(await readJsonRequest(request));
      if (!parsed.success) {
        return jsonWithCors({ error: "Invalid clone batch request payload." }, { status: 400 });
      }
      const inputPayload = parsed.data.items ?? parsed.data.input;
      if (!inputPayload) {
        return jsonWithCors({ error: "Clone batch requires input or items." }, { status: 400 });
      }
      if (isUnsupportedPublicAudioOutputFormat(parsed.data.output_format)) {
        return jsonWithCors(
          { error: "Only MP3 output is supported.", code: "OUTPUT_FORMAT_UNSUPPORTED" },
          { status: 400 },
        );
      }
      input = batchInputToLines(inputPayload);
      voice = parsed.data.voice ?? DEFAULT_CLONE_VOICE_INSTRUCTION;
      model = parsed.data.model;
      title = parsed.data.title;
      webhookCallbackUrl = parsed.data.webhook_url;
      externalId = parsed.data.external_id;
      metadataJson = serializeBatchMetadata(parsed.data.metadata);
      voiceConsentAccepted = isVoiceCloneConsentAccepted(parsed.data.voice_consent);
      const sampleBase64 = parsed.data.reference_audio_base64 ?? parsed.data.clone_audio_base64;
      if (!sampleBase64) {
        return jsonWithCors({ error: "Missing reference_audio_base64 or clone_audio_base64." }, { status: 400 });
      }
      sampleMimeType = parsed.data.reference_audio_mime_type ?? parsed.data.clone_audio_mime_type ?? "audio/wav";
      sampleBytes = Buffer.from(sampleBase64, "base64");
      if (sampleBytes.byteLength <= 0 || sampleBytes.byteLength > MAX_CLONE_SAMPLE_BYTES) {
        return jsonWithCors({ error: "Invalid clone sample bytes." }, { status: 400 });
      }
    }
    if (!voiceConsentAccepted) {
      return jsonWithCors(
        { error: "Voice clone consent is required.", code: "VOICE_CLONE_CONSENT_REQUIRED" },
        { status: 400 },
      );
    }
    const lines = Array.isArray(input) && input.every((line) => typeof line !== "string")
      ? input
      : parseBatchLines(input as string | string[]).map((text) => ({ text }));
    await enforceApiKeyTokenLimit(
      auth.apiKey,
      estimateBatchLineUsage(lines, "clone", {
        cloneCreditsPerSecond: auth.apiAccess.cloneCreditsPerSecond,
      }).creditsEstimated,
    );
    await enforceApiKeyQueuedJobLimit(auth.apiKey);

    const usageLimit = await acquireUsageLimit(
      `api:${auth.userId}:${auth.apiKeyId}:batch-clone`,
      apiKeyUsagePolicy(auth.apiKey, getUsagePolicy("apiClone")),
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

    const result = await createQueuedBatchJob({
      userId: auth.userId,
      apiKeyId: auth.apiKeyId,
      source: "api_key",
      mode: "clone",
      title,
      lines,
      voice,
      model,
      externalId,
      metadataJson,
      cloneSample: {
        bytes: sampleBytes,
        mimeType: sampleMimeType,
        fileName,
      },
      cloneConsentAccepted: true,
      webhookCallbackUrl,
    });
    kickBatchWorker(result.job.id);
    const urls = publicBatchJobUrls(result.job.id);

    return jsonWithCors(
      {
        ok: true,
        queued: true,
        job_id: result.job.id,
        status: result.job.status,
        status_url: urls.status_url,
        download_url: urls.download_url,
        output_format: PUBLIC_AUDIO_OUTPUT_FORMAT,
        job: {
          id: result.job.id,
          external_id: result.job.externalId,
          mode: result.job.mode,
          status: result.job.status,
          title: result.job.title,
          total_items: result.job.totalItems,
          credits_estimated: result.job.creditsEstimated,
          output_format: PUBLIC_AUDIO_OUTPUT_FORMAT,
          status_url: urls.status_url,
          download_url: urls.download_url,
          metadata: parseBatchMetadataJson(result.job.metadataJson),
          webhook: {
            configured: Boolean(result.job.webhookCallbackUrl),
            status: result.job.webhookStatus,
          },
          created_at: result.job.createdAt,
        },
        items: result.items.map((item) => ({
          id: item.externalId ?? String(item.itemIndex + 1),
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
          output_format: PUBLIC_AUDIO_OUTPUT_FORMAT,
          output_seconds: item.outputSeconds,
          credits_charged: item.creditsCharged,
          error: item.errorMessage,
        })),
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
        { status: error.status, headers: limit?.headers },
      );
    }
    logApiError({
      request,
      statusCode: 500,
      errorMessage: error instanceof Error ? error.message : "Clone batch generation failed.",
      errorCode: "INTERNAL_ERROR",
      source: "api_key",
      userId: auth.userId,
      apiKeyId: auth.apiKeyId,
    });
    return jsonWithCors({ error: "Clone batch generation failed." }, { status: 500, headers: limit?.headers });
  } finally {
    await limit?.release();
  }
}
