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

const speechSchema = z.object({
  input: z.string().min(1).max(MAX_TEXT_CHARS),
  voice: z.string().min(1).max(MAX_VOICE_CHARS).optional(),
  model: z.string().min(1).max(MAX_MODEL_CHARS).optional(),
  output_format: z.string().max(16).optional(),
});

export async function POST(request: Request) {
  const auth = await authenticateApiKeyFromRequest(request);
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
    await enforceApiKeyTokenLimit(auth.apiKey, calculateGenerationUsage(parsed.data.input, "tts").creditsRequested);

    const usageLimit = await acquireUsageLimit(
      `api:${auth.userId}:${auth.apiKeyId}:tts`,
      apiKeyUsagePolicy(auth.apiKey, getUsagePolicy("apiTts")),
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
      mode: "tts",
      text: parsed.data.input,
      voice: parsed.data.voice ?? DEFAULT_TTS_VOICE_PROMPT,
      model: parsed.data.model,
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
    return jsonWithCors({ error: "Speech generation failed." }, { status: 500, headers: limit?.headers });
  } finally {
    await limit?.release();
  }
}
