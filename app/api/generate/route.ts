import { NextResponse } from "next/server";
import { z } from "zod";

import { runGenerationForUser, GenerationServiceError, countChars } from "@/lib/generation-service";
import { acquireUsageLimit, type UsageLimitResult } from "@/lib/rate-limit";
import { isJsonRequestError, jsonRequestErrorBody, readJsonRequest } from "@/lib/request-json";
import { getUsagePolicy } from "@/lib/server-usage-policy";
import { readSessionFromCookie } from "@/lib/session";
import { MAX_MODEL_CHARS, MAX_TEXT_CHARS, MAX_VOICE_CHARS } from "@/lib/usage-policy";
import { DEFAULT_TTS_VOICE_PROMPT } from "@/lib/voice-defaults";

export const runtime = "nodejs";

const generateSchema = z.object({
  text: z.string().min(1).max(MAX_TEXT_CHARS),
  voice: z.string().min(1).max(MAX_VOICE_CHARS).optional(),
  model: z.string().min(1).max(MAX_MODEL_CHARS).optional(),
});

export async function POST(request: Request) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let limit: Extract<UsageLimitResult, { ok: true }> | null = null;

  try {
    const body = await readJsonRequest(request);
    const parsed = generateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: `Invalid generation payload. Text max is ${MAX_TEXT_CHARS.toLocaleString()} characters.` },
        { status: 400 },
      );
    }
    if (parsed.data.voice) {
      const inputVoice = parsed.data.voice.trim().toLowerCase();
      if (inputVoice !== "female" && inputVoice !== "male") {
        return NextResponse.json(
          { error: "Only 'female' and 'male' preset voices are supported in Standard TTS.", code: "VOICE_UNSUPPORTED" },
          { status: 400 },
        );
      }
    }

    const textChars = countChars(parsed.data.text);
    const AUTO_QUEUE_THRESHOLD = 2000;
    if (textChars >= AUTO_QUEUE_THRESHOLD) {
      const { splitTextIntoChunks } = await import("@/lib/tts-provider");
      const { createQueuedBatchJob, kickBatchWorker } = await import("@/lib/batch-service");

      const chunks = splitTextIntoChunks(parsed.data.text, 1000);
      const lines = chunks.map((chunk) => ({ text: chunk }));

      const { job } = await createQueuedBatchJob({
        userId: session.userId,
        source: "dashboard",
        mode: "tts",
        title: `Auto-segmented TTS (${textChars} chars)`,
        lines,
        voice: parsed.data.voice ?? DEFAULT_TTS_VOICE_PROMPT,
        model: parsed.data.model,
      });

      kickBatchWorker(job.id);

      return NextResponse.json({
        ok: true,
        queued: true,
        jobId: job.id,
      });
    }

    const usageLimit = await acquireUsageLimit(
      `dashboard:${session.userId}:tts`,
      getUsagePolicy("dashboardTts"),
    );
    if (!usageLimit.ok) {
      return NextResponse.json(
        { error: usageLimit.message, code: usageLimit.code },
        { status: usageLimit.status, headers: usageLimit.headers },
      );
    }
    limit = usageLimit;

    const result = await runGenerationForUser({
      userId: session.userId,
      source: "dashboard",
      mode: "tts",
      text: parsed.data.text,
      voice: parsed.data.voice ?? DEFAULT_TTS_VOICE_PROMPT,
      model: parsed.data.model,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    }, {
      headers: limit.headers,
    });
  } catch (error) {
    if (isJsonRequestError(error)) {
      return NextResponse.json(jsonRequestErrorBody(error), { status: error.status, headers: limit?.headers });
    }
    if (error instanceof GenerationServiceError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          remainingTokens: error.remainingTokens,
        },
        { status: error.status, headers: limit?.headers },
      );
    }
    if (error instanceof BatchJobServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code, remainingTokens: error.remainingTokens },
        { status: error.status, headers: limit?.headers },
      );
    }
    console.error("[/api/generate] Unhandled generation error:", error);
    return NextResponse.json({ error: "Generation failed." }, { status: 500, headers: limit?.headers });
  } finally {
    await limit?.release();
  }
}
