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
import { isUnsupportedPublicAudioOutputFormat } from "@/lib/audio-api";
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
import { isVoiceCloneConsentAccepted } from "@/lib/voice-consent";
import { DEFAULT_CLONE_VOICE_INSTRUCTION } from "@/lib/voice-defaults";
import {
  expandV2AudioInputToLines,
  serializeV2AudioJob,
  type V2AudioInput,
  type V2AudioLineObject,
} from "@/lib/v2-audio-jobs";

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

const cloneJsonSchema = z.object({
  input: inputSchema.optional(),
  items: inputSchema.optional(),
  voice: z.string().min(1).max(MAX_VOICE_CHARS).optional(),
  model: z.string().min(1).max(MAX_MODEL_CHARS).optional(),
  title: z.string().max(120).optional(),
  external_id: z.string().max(MAX_EXTERNAL_ID_CHARS).nullable().optional(),
  metadata: z.unknown().nullable().optional(),
  reference_audio_base64: z.string().min(1).optional(),
  clone_audio_base64: z.string().min(1).optional(),
  reference_audio_mime_type: z.string().optional(),
  clone_audio_mime_type: z.string().optional(),
  voice_consent: z.union([z.boolean(), z.string()]).optional(),
  webhook_url: z.string().max(MAX_WEBHOOK_URL_CHARS).nullable().optional(),
  output_format: z.string().max(16).optional(),
});

function parseJsonInput(value: FormDataEntryValue | null): V2AudioInput | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    const candidate = typeof parsed === "object" && parsed !== null && "input" in parsed
      ? (parsed as { input?: unknown }).input
      : parsed;
    const validated = inputSchema.safeParse(candidate);
    return validated.success ? validated.data as V2AudioInput : null;
  } catch {
    return null;
  }
}

function stringToInput(value: FormDataEntryValue | null): V2AudioInput {
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  const auth = await authenticateApiKeyFromRequest(request);
  if (!auth.ok) {
    return jsonWithCors({ error: auth.error }, { status: auth.status });
  }

  let limit: Extract<UsageLimitResult, { ok: true }> | null = null;

  try {
    const contentType = request.headers.get("content-type") ?? "";
    let input: V2AudioInput;
    let voice = DEFAULT_CLONE_VOICE_INSTRUCTION;
    let model: string | undefined;
    let title: string | undefined;
    let webhookCallbackUrl: string | null | undefined;
    let externalId: string | null | undefined;
    let metadataJson: string | null | undefined;
    let sampleBytes: Uint8Array;
    let sampleMimeType = "audio/wav";
    let fileName = "reference.wav";
    let voiceConsentAccepted = false;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const sample = formData.get("sample") ?? formData.get("reference_audio");
      const inputJson = parseJsonInput(formData.get("items") ?? formData.get("input_json"));
      input = inputJson ?? stringToInput(formData.get("input") ?? formData.get("text"));
      const voiceValue = formData.get("voice");
      const modelValue = formData.get("model");
      const titleValue = formData.get("title");
      const webhookValue = formData.get("webhook_url");
      const externalIdValue = formData.get("external_id");
      const metadataValue = formData.get("metadata");
      const outputFormatValue = formData.get("output_format");

      if (isUnsupportedPublicAudioOutputFormat(outputFormatValue)) {
        return jsonWithCors(
          { error: "Only MP3 output is supported.", code: "OUTPUT_FORMAT_UNSUPPORTED" },
          { status: 400 },
        );
      }
      if (!(sample instanceof File)) {
        return jsonWithCors({ error: "Missing reference audio sample file." }, { status: 400 });
      }
      if (sample.size <= 0 || sample.size > MAX_CLONE_SAMPLE_BYTES) {
        return jsonWithCors({ error: "Reference sample must be between 1 byte and 8MB." }, { status: 400 });
      }

      voice = typeof voiceValue === "string" && voiceValue.trim() ? voiceValue : DEFAULT_CLONE_VOICE_INSTRUCTION;
      model = typeof modelValue === "string" && modelValue.trim() ? modelValue : undefined;
      title = typeof titleValue === "string" ? titleValue.slice(0, 120) : undefined;
      webhookCallbackUrl = typeof webhookValue === "string" ? webhookValue : undefined;
      externalId = typeof externalIdValue === "string" ? externalIdValue : undefined;
      metadataJson = typeof metadataValue === "string" ? serializeBatchMetadata(metadataValue) : undefined;
      voiceConsentAccepted = isVoiceCloneConsentAccepted(formData.get("voice_consent"));
      sampleBytes = new Uint8Array(await sample.arrayBuffer());
      sampleMimeType = sample.type || "audio/wav";
      fileName = sample.name || "reference.wav";
    } else {
      const parsed = cloneJsonSchema.safeParse(await readJsonRequest(request));
      if (!parsed.success) {
        return jsonWithCors({ error: "Invalid async clone job payload." }, { status: 400 });
      }
      const inputPayload = parsed.data.items ?? parsed.data.input;
      if (!inputPayload) {
        return jsonWithCors({ error: "Clone job requires input or items." }, { status: 400 });
      }
      if (isUnsupportedPublicAudioOutputFormat(parsed.data.output_format)) {
        return jsonWithCors(
          { error: "Only MP3 output is supported.", code: "OUTPUT_FORMAT_UNSUPPORTED" },
          { status: 400 },
        );
      }
      const sampleBase64 = parsed.data.reference_audio_base64 ?? parsed.data.clone_audio_base64;
      if (!sampleBase64) {
        return jsonWithCors({ error: "Missing reference_audio_base64 or clone_audio_base64." }, { status: 400 });
      }

      input = inputPayload as string | string[] | V2AudioLineObject[];
      voice = parsed.data.voice ?? DEFAULT_CLONE_VOICE_INSTRUCTION;
      model = parsed.data.model;
      title = parsed.data.title;
      webhookCallbackUrl = parsed.data.webhook_url;
      externalId = parsed.data.external_id;
      metadataJson = serializeBatchMetadata(parsed.data.metadata);
      voiceConsentAccepted = isVoiceCloneConsentAccepted(parsed.data.voice_consent);
      sampleMimeType = parsed.data.reference_audio_mime_type ?? parsed.data.clone_audio_mime_type ?? "audio/wav";
      sampleBytes = Buffer.from(sampleBase64, "base64");
      if (sampleBytes.byteLength <= 0 || sampleBytes.byteLength > MAX_CLONE_SAMPLE_BYTES) {
        return jsonWithCors({ error: "Invalid reference audio bytes." }, { status: 400 });
      }
    }

    if (!voiceConsentAccepted) {
      return jsonWithCors(
        { error: "Voice clone consent is required.", code: "VOICE_CLONE_CONSENT_REQUIRED" },
        { status: 400 },
      );
    }

    const lines: BatchLineInput[] = expandV2AudioInputToLines(input);
    await enforceApiKeyTokenLimit(
      auth.apiKey,
      estimateBatchLineUsage(lines, "clone", {
        cloneCreditsPerSecond: auth.apiAccess.cloneCreditsPerSecond,
      }).creditsEstimated,
    );
    await enforceApiKeyQueuedJobLimit(auth.apiKey);

    const usageLimit = await acquireUsageLimit(
      `api:${auth.userId}:${auth.apiKeyId}:v2-clone-job`,
      apiKeyUsagePolicy(auth.apiKey, getUsagePolicy("apiClone")),
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
      mode: "clone",
      title: title ?? "Async Clone Voice",
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
    return jsonWithCors({ error: "Async clone job could not be queued." }, { status: 500, headers: limit?.headers });
  } finally {
    await limit?.release();
  }
}
