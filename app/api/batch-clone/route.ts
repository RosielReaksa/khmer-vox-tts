import { NextResponse } from "next/server";
import { z } from "zod";

import {
  BatchJobServiceError,
  type BatchLineInput,
  createQueuedBatchJob,
  kickBatchWorker,
  MAX_BATCH_ITEMS,
  MAX_BATCH_SPEAKER_CHARS,
  MAX_EXTERNAL_ID_CHARS,
  parseBatchLines,
  serializeBatchMetadata,
} from "@/lib/batch-service";
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

const textSchema = z.string().min(1).max(MAX_TEXT_CHARS * MAX_BATCH_ITEMS);
const voiceSchema = z.string().min(1).max(MAX_VOICE_CHARS);
const modelSchema = z.string().min(1).max(MAX_MODEL_CHARS);
const batchLineObjectSchema = z.object({
  text: z.string().min(1).max(MAX_TEXT_CHARS),
  external_id: z.string().max(MAX_EXTERNAL_ID_CHARS).nullable().optional(),
  speaker: z.string().max(MAX_BATCH_SPEAKER_CHARS).nullable().optional(),
  start_ms: z.number().min(0).nullable().optional(),
  end_ms: z.number().min(0).nullable().optional(),
  metadata: z.unknown().nullable().optional(),
});
const structuredInputSchema = z.union([
  z.array(z.string().min(1).max(MAX_TEXT_CHARS)).min(1).max(MAX_BATCH_ITEMS),
  z.array(batchLineObjectSchema).min(1).max(MAX_BATCH_ITEMS),
]);

function structuredInputToLines(input: z.infer<typeof structuredInputSchema>): BatchLineInput[] {
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

function parseCloneBatchLines(inputValue: FormDataEntryValue | null, inputJsonValue: FormDataEntryValue | null): {
  ok: true;
  lines: Array<string | BatchLineInput>;
} | {
  ok: false;
  error: string;
} {
  if (typeof inputJsonValue === "string" && inputJsonValue.trim()) {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(inputJsonValue);
    } catch {
      return { ok: false, error: "Invalid dubbing JSON input." };
    }
    const payload = typeof parsedJson === "object" && parsedJson !== null && "input" in parsedJson
      ? (parsedJson as { input?: unknown }).input
      : parsedJson;
    const parsedStructured = structuredInputSchema.safeParse(payload);
    if (!parsedStructured.success) {
      return { ok: false, error: "Dubbing JSON must be an array of strings or line objects." };
    }
    return { ok: true, lines: structuredInputToLines(parsedStructured.data) };
  }

  const inputParsed = textSchema.safeParse(typeof inputValue === "string" ? inputValue : "");
  if (!inputParsed.success) {
    return { ok: false, error: "Invalid batch text input." };
  }
  return { ok: true, lines: parseBatchLines(inputParsed.data) };
}

export async function POST(request: Request) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let limit: Extract<UsageLimitResult, { ok: true }> | null = null;

  try {
    const formData = await request.formData();
    const inputValue = formData.get("input") ?? formData.get("text") ?? "";
    const voiceValue = formData.get("voice");
    const modelValue = formData.get("model");
    const titleValue = formData.get("title");
    const sampleValue = formData.get("sample");
    const consentValue = formData.get("voice_consent");
    const inputJsonValue = formData.get("input_json");
    const externalIdValue = formData.get("external_id");
    const metadataValue = formData.get("metadata");
    const webhookValue = formData.get("webhook_url");

    const parsedLines = parseCloneBatchLines(inputValue, inputJsonValue);
    if (!parsedLines.ok) {
      return NextResponse.json({ error: parsedLines.error }, { status: 400 });
    }

    const voiceParsed = voiceSchema.safeParse(
      typeof voiceValue === "string" && voiceValue.trim() ? voiceValue : DEFAULT_CLONE_VOICE_INSTRUCTION,
    );
    if (!voiceParsed.success) {
      return NextResponse.json({ error: "Invalid voice input." }, { status: 400 });
    }

    const modelParsed = modelSchema.safeParse(typeof modelValue === "string" ? modelValue : undefined);
    const model = modelParsed.success ? modelParsed.data : undefined;
    const title = typeof titleValue === "string" ? titleValue.slice(0, 120) : undefined;
    const externalId = typeof externalIdValue === "string" ? externalIdValue : undefined;
    const metadataJson = typeof metadataValue === "string" && metadataValue.trim()
      ? serializeBatchMetadata(metadataValue)
      : undefined;
    const webhookCallbackUrl = typeof webhookValue === "string" ? webhookValue : undefined;

    let cloneSample: {
      bytes: Uint8Array;
      mimeType: string;
      fileName: string;
    };
    const hasUploadedSample = sampleValue instanceof File && sampleValue.size > 0;
    if (hasUploadedSample) {
      if (sampleValue.size > MAX_CLONE_SAMPLE_BYTES) {
        return NextResponse.json({ error: "Voice sample must be between 1 byte and 8MB." }, { status: 400 });
      }
      if (!isVoiceCloneConsentAccepted(consentValue)) {
        return NextResponse.json(
          { error: "Voice clone consent is required.", code: "VOICE_CLONE_CONSENT_REQUIRED" },
          { status: 400 },
        );
      }
      cloneSample = {
        bytes: new Uint8Array(await sampleValue.arrayBuffer()),
        mimeType: sampleValue.type || "audio/wav",
        fileName: sampleValue.name || "sample.wav",
      };
    } else {
      const savedVoice = await findUserVoiceById(session.userId, voiceParsed.data);
      if (!savedVoice) {
        return NextResponse.json({ error: "Choose an uploaded reference sample or a saved voice from your library." }, { status: 400 });
      }
      cloneSample = {
        bytes: new Uint8Array(Buffer.from(savedVoice.audioBase64, "base64")),
        mimeType: savedVoice.mimeType,
        fileName: savedVoice.fileName,
      };
    }

    const usageLimit = await acquireUsageLimit(
      `dashboard:${session.userId}:batch-clone`,
      getUsagePolicy("dashboardClone"),
    );
    if (!usageLimit.ok) {
      return NextResponse.json(
        { error: usageLimit.message, code: usageLimit.code },
        { status: usageLimit.status, headers: usageLimit.headers },
      );
    }
    limit = usageLimit;

    const result = await createQueuedBatchJob({
      userId: session.userId,
      source: "dashboard",
      mode: "clone",
      title,
      lines: parsedLines.lines,
      voice: voiceParsed.data,
      model,
      externalId,
      metadataJson,
      cloneSample,
      cloneConsentAccepted: true,
      webhookCallbackUrl,
    });
    kickBatchWorker(result.job.id);

    return NextResponse.json({ ok: true, queued: true, ...result }, { status: 202, headers: limit.headers });
  } catch (error) {
    if (error instanceof BatchJobServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code, remainingTokens: error.remainingTokens },
        { status: error.status, headers: limit?.headers },
      );
    }
    return NextResponse.json({ error: "Clone batch generation failed." }, { status: 500, headers: limit?.headers });
  } finally {
    await limit?.release();
  }
}
