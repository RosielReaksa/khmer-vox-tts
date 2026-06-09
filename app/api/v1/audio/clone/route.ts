import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticateApiKeyFromRequest } from "@/lib/api-key-auth";
import { ApiKeyLimitError, apiKeyUsagePolicy, enforceApiKeyTokenLimit } from "@/lib/api-key-limits";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { calculateGenerationUsage, GenerationServiceError, runGenerationForUser } from "@/lib/generation-service";
import { acquireUsageLimit, type UsageLimitResult } from "@/lib/rate-limit";
import { getUsagePolicy } from "@/lib/server-usage-policy";
import { PUBLIC_AUDIO_OUTPUT_FORMAT, isUnsupportedPublicAudioOutputFormat } from "@/lib/audio-api";
import { isJsonRequestError, jsonRequestErrorBody, readJsonRequest } from "@/lib/request-json";
import {
  MAX_CLONE_SAMPLE_BYTES,
  MAX_MODEL_CHARS,
  MAX_TEXT_CHARS,
  MAX_VOICE_CHARS,
} from "@/lib/usage-policy";
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

const cloneJsonSchema = z.object({
  input: z.string().min(1).max(MAX_TEXT_CHARS),
  voice: z.string().min(1).max(MAX_VOICE_CHARS).optional(),
  model: z.string().min(1).max(MAX_MODEL_CHARS).optional(),
  clone_audio_base64: z.string().min(1).optional(),
  reference_audio_base64: z.string().min(1).optional(),
  clone_audio_mime_type: z.string().optional(),
  reference_audio_mime_type: z.string().optional(),
  voice_consent: z.union([z.boolean(), z.string()]).optional(),
  output_format: z.string().max(16).optional(),
});

export async function POST(request: Request) {
  const auth = await authenticateApiKeyFromRequest(request);
  if (!auth.ok) {
    return jsonWithCors({ error: auth.error }, { status: auth.status });
  }

  let limit: Extract<UsageLimitResult, { ok: true }> | null = null;

  try {
    const contentType = request.headers.get("content-type") ?? "";
    let text = "";
    let voice = DEFAULT_CLONE_VOICE_INSTRUCTION;
    let model: string | undefined;
    let sampleBytes: Uint8Array | null = null;
    let sampleMimeType = "audio/wav";
    let fileName = "sample.wav";
    let voiceConsentAccepted = false;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const sample = formData.get("sample") ?? formData.get("reference_audio") ?? formData.get("reference");
      const input = formData.get("input");
      const inputAlt = formData.get("text");
      const voiceField = formData.get("voice");
      const modelField = formData.get("model");
      const consentField = formData.get("voice_consent");
      const outputFormatField = formData.get("output_format");

      text = typeof input === "string" ? input : typeof inputAlt === "string" ? inputAlt : "";
      voice = typeof voiceField === "string" && voiceField.trim() ? voiceField : DEFAULT_CLONE_VOICE_INSTRUCTION;
      model = typeof modelField === "string" && modelField.trim() ? modelField : undefined;
      voiceConsentAccepted = isVoiceCloneConsentAccepted(consentField);
      if (isUnsupportedPublicAudioOutputFormat(outputFormatField)) {
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
      const body = await readJsonRequest(request);
      const parsed = cloneJsonSchema.safeParse(body);
      if (!parsed.success) {
        return jsonWithCors(
          { error: `Invalid clone request payload. Input max is ${MAX_TEXT_CHARS.toLocaleString()} characters.` },
          { status: 400 },
        );
      }

      text = parsed.data.input;
      voice = parsed.data.voice ?? DEFAULT_CLONE_VOICE_INSTRUCTION;
      model = parsed.data.model;
      voiceConsentAccepted = isVoiceCloneConsentAccepted(parsed.data.voice_consent);
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
      sampleMimeType = parsed.data.reference_audio_mime_type ?? parsed.data.clone_audio_mime_type ?? "audio/wav";
      sampleBytes = Buffer.from(sampleBase64, "base64");

      if (sampleBytes.byteLength === 0 || sampleBytes.byteLength > MAX_CLONE_SAMPLE_BYTES) {
        return jsonWithCors({ error: "Invalid clone sample bytes." }, { status: 400 });
      }
    }

    const textParsed = z.string().min(1).max(MAX_TEXT_CHARS).safeParse(text);
    if (!textParsed.success) {
      return jsonWithCors(
        { error: `Invalid clone request payload. Input max is ${MAX_TEXT_CHARS.toLocaleString()} characters.` },
        { status: 400 },
      );
    }
    const voiceParsed = z.string().min(1).max(MAX_VOICE_CHARS).safeParse(voice);
    if (!voiceParsed.success) {
      return jsonWithCors({ error: "Invalid voice input." }, { status: 400 });
    }
    const modelParsed = z.string().min(1).max(MAX_MODEL_CHARS).optional().safeParse(model);
    if (!modelParsed.success) {
      return jsonWithCors({ error: "Invalid model input." }, { status: 400 });
    }
    if (!voiceConsentAccepted) {
      return jsonWithCors(
        { error: "Voice clone consent is required.", code: "VOICE_CLONE_CONSENT_REQUIRED" },
        { status: 400 },
      );
    }
    await enforceApiKeyTokenLimit(
      auth.apiKey,
      calculateGenerationUsage(textParsed.data, "clone", {
        cloneCreditsPerSecond: auth.apiAccess.cloneCreditsPerSecond,
      }).creditsRequested,
    );

    const usageLimit = await acquireUsageLimit(
      `api:${auth.userId}:${auth.apiKeyId}:clone`,
      apiKeyUsagePolicy(auth.apiKey, getUsagePolicy("apiClone")),
    );
    if (!usageLimit.ok) {
      return jsonWithCors(
        { error: usageLimit.message, code: usageLimit.code },
        { status: usageLimit.status, headers: usageLimit.headers },
      );
    }
    limit = usageLimit;

    const result = await runGenerationForUser({
      userId: auth.userId,
      apiKeyId: auth.apiKeyId,
      source: "api_key",
      mode: "clone",
      text: textParsed.data,
      voice: voiceParsed.data,
      model: modelParsed.data,
      cloneCreditsPerSecond: auth.apiAccess.cloneCreditsPerSecond,
      cloneSample: {
        bytes: sampleBytes,
        mimeType: sampleMimeType,
        fileName,
      },
    });

    return new NextResponse(Buffer.from(result.audioBase64, "base64"), {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "X-Generation-Id": result.generationId,
        "X-Credits-Charged": String(result.creditsCharged),
        "X-Remaining-Tokens": String(result.remainingTokens),
        "X-Output-Format": PUBLIC_AUDIO_OUTPUT_FORMAT,
        ...corsHeaders(),
        ...limit.headers,
      },
    });
  } catch (error) {
    if (isJsonRequestError(error)) {
      return jsonWithCors(jsonRequestErrorBody(error), { status: error.status, headers: limit?.headers });
    }
    if (error instanceof ApiKeyLimitError) {
      return jsonWithCors({ error: error.message, code: error.code }, { status: error.status, headers: limit?.headers });
    }
    if (error instanceof GenerationServiceError) {
      return jsonWithCors(
        {
          error: error.message,
          code: error.code,
          remainingTokens: error.remainingTokens,
        },
        { status: error.status, headers: { ...corsHeaders(), ...limit?.headers } },
      );
    }
    return jsonWithCors({ error: "Clone generation failed." }, { status: 500, headers: limit?.headers });
  } finally {
    await limit?.release();
  }
}
