import { NextResponse } from "next/server";
import { z } from "zod";

import { runGenerationForUser, GenerationServiceError, countChars } from "@/lib/generation-service";
import { acquireUsageLimit, type UsageLimitResult } from "@/lib/rate-limit";
import { getUsagePolicy } from "@/lib/server-usage-policy";
import { readSessionFromCookie } from "@/lib/session";
import { findUserVoiceById } from "@/lib/store";
import {
  MAX_CLONE_SAMPLE_BYTES,
  MAX_MODEL_CHARS,
  MAX_TEXT_CHARS,
  MAX_VOICE_CHARS,
} from "@/lib/usage-policy";
import { isVoiceCloneConsentAccepted } from "@/lib/voice-consent";
import { DEFAULT_CLONE_VOICE_INSTRUCTION } from "@/lib/voice-defaults";

export const runtime = "nodejs";

const textSchema = z.string().min(1).max(MAX_TEXT_CHARS);
const voiceSchema = z.string().min(1).max(MAX_VOICE_CHARS);
const modelSchema = z.string().min(1).max(MAX_MODEL_CHARS);

export async function POST(request: Request) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let limit: Extract<UsageLimitResult, { ok: true }> | null = null;

  try {
    const formData = await request.formData();
    const textValue = formData.get("text");
    const voiceValue = formData.get("voice");
    const modelValue = formData.get("model");
    const sampleValue = formData.get("sample");
    const consentValue = formData.get("voice_consent");

    const textParsed = textSchema.safeParse(typeof textValue === "string" ? textValue : "");
    if (!textParsed.success) {
      return NextResponse.json(
        { error: `Invalid text input. Text max is ${MAX_TEXT_CHARS.toLocaleString()} characters.` },
        { status: 400 },
      );
    }

    const voiceParsed = voiceSchema.safeParse(
      typeof voiceValue === "string" && voiceValue.trim() ? voiceValue : DEFAULT_CLONE_VOICE_INSTRUCTION,
    );
    if (!voiceParsed.success) {
      return NextResponse.json({ error: "Invalid voice input." }, { status: 400 });
    }

    const modelParsed = modelSchema.safeParse(typeof modelValue === "string" ? modelValue : undefined);
    const model = modelParsed.success ? modelParsed.data : undefined;

    let sampleBytes: Uint8Array;
    let mimeType: string;
    let fileName: string;

    if (!(sampleValue instanceof File) || sampleValue.size === 0) {
      // No file uploaded, check if voiceValue points to a saved user voice
      const voiceId = typeof voiceValue === "string" ? voiceValue.trim() : "";
      const savedVoice = voiceId ? await findUserVoiceById(session.userId, voiceId) : null;
      if (!savedVoice) {
        return NextResponse.json({ error: "Voice sample file is required." }, { status: 400 });
      }
      const buffer = Buffer.from(savedVoice.audioBase64, "base64");
      sampleBytes = new Uint8Array(buffer);
      mimeType = savedVoice.mimeType;
      fileName = savedVoice.fileName;
    } else {
      if (sampleValue.size > MAX_CLONE_SAMPLE_BYTES) {
        return NextResponse.json(
          { error: "Voice sample must be between 1 byte and 8MB." },
          { status: 400 },
        );
      }
      if (!isVoiceCloneConsentAccepted(consentValue)) {
        return NextResponse.json(
          { error: "Voice clone consent is required.", code: "VOICE_CLONE_CONSENT_REQUIRED" },
          { status: 400 },
        );
      }
      sampleBytes = new Uint8Array(await sampleValue.arrayBuffer());
      mimeType = sampleValue.type || "audio/wav";
      fileName = sampleValue.name;
    }

    const textChars = countChars(textParsed.data);
    const AUTO_QUEUE_THRESHOLD = 2000;
    if (textChars >= AUTO_QUEUE_THRESHOLD) {
      const { splitTextIntoChunks } = await import("@/lib/tts-provider");
      const { createQueuedBatchJob, kickBatchWorker } = await import("@/lib/batch-service");

      const chunks = splitTextIntoChunks(textParsed.data, 1000);
      const lines = chunks.map((chunk) => ({ text: chunk }));

      const { job } = await createQueuedBatchJob({
        userId: session.userId,
        source: "dashboard",
        mode: "clone",
        title: `Auto-segmented Clone (${textChars} chars)`,
        lines,
        voice: voiceParsed.data,
        model,
        cloneSample: {
          bytes: sampleBytes,
          mimeType,
          fileName,
        },
        cloneConsentAccepted: true,
      });

      kickBatchWorker(job.id);

      return NextResponse.json({
        ok: true,
        queued: true,
        jobId: job.id,
      });
    }

    const usageLimit = await acquireUsageLimit(
      `dashboard:${session.userId}:clone`,
      getUsagePolicy("dashboardClone"),
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
      mode: "clone",
      text: textParsed.data,
      voice: voiceParsed.data,
      model,
      cloneSample: {
        bytes: sampleBytes,
        mimeType: mimeType,
        fileName: fileName,
      },
    });

    return NextResponse.json({
      ok: true,
      ...result,
    }, {
      headers: limit.headers,
    });
  } catch (error) {
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
    return NextResponse.json({ error: "Clone generation failed." }, { status: 500, headers: limit?.headers });
  } finally {
    await limit?.release();
  }
}
