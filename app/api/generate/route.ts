import { NextResponse } from "next/server";
import { z } from "zod";

import { BatchJobServiceError } from "@/lib/batch-service";
import { DashboardJobLimitError } from "@/lib/dashboard-job-limits";
import { createQueuedDashboardGeneration } from "@/lib/generation-queue";
import { acquireUsageLimit, type UsageLimitResult } from "@/lib/rate-limit";
import { isJsonRequestError, jsonRequestErrorBody, readJsonRequest } from "@/lib/request-json";
import { getUsagePolicy } from "@/lib/server-usage-policy";
import { readSessionFromCookie } from "@/lib/session";
import { MAX_DASHBOARD_TTS_CHARS, MAX_MODEL_CHARS, MAX_VOICE_CHARS } from "@/lib/usage-policy";
import { DEFAULT_TTS_VOICE_PROMPT, VOICE_STYLE_IDS } from "@/lib/voice-defaults";

export const runtime = "nodejs";

const generateSchema = z.object({
  text: z.string().min(1).max(MAX_DASHBOARD_TTS_CHARS),
  voice: z.string().min(1).max(MAX_VOICE_CHARS).optional(),
  model: z.string().min(1).max(MAX_MODEL_CHARS).optional(),
  voiceStyle: z.enum(VOICE_STYLE_IDS).optional(),
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
        { error: `Invalid generation payload. Text max is ${MAX_DASHBOARD_TTS_CHARS.toLocaleString()} characters.` },
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

    const { job } = await createQueuedDashboardGeneration({
      userId: session.userId,
      mode: "tts",
      text: parsed.data.text,
      voice: parsed.data.voice ?? DEFAULT_TTS_VOICE_PROMPT,
      model: parsed.data.model,
      voiceStyle: parsed.data.voiceStyle,
    });

    return NextResponse.json({
      ok: true,
      queued: true,
      jobId: job.id,
      job: {
        id: job.id,
        status: job.status,
        totalItems: job.totalItems,
        creditsEstimated: job.creditsEstimated,
      },
    }, {
      status: 202,
      headers: limit.headers,
    });
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
    if (error instanceof DashboardJobLimitError) {
      return NextResponse.json(
        { error: error.message, code: error.code, counts: error.counts, limit: error.limit },
        { status: error.status, headers: limit?.headers },
      );
    }
    console.error("[/api/generate] Unhandled generation error:", error);
    return NextResponse.json({ error: "Generation failed." }, { status: 500, headers: limit?.headers });
  } finally {
    await limit?.release();
  }
}
