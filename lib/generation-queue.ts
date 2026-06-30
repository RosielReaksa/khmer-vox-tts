import "server-only";

import {
  BatchJobServiceError,
  createQueuedDashboardBatchJob,
  dashboardMergeMetadataJson,
  kickBatchWorker,
  MAX_DASHBOARD_BATCH_ITEMS,
  type BatchLineInput,
} from "@/lib/batch-service";
import { countChars } from "@/lib/generation-service";
import {
  dashboardMaxQueuedJobsPerUser,
  dashboardMaxRunningJobsPerUser,
} from "@/lib/dashboard-job-limits";
import { prepareTextForSpeech } from "@/lib/speech-text-sanitizer";
import { splitTextIntoChunks, type CloneSample } from "@/lib/tts-provider";
import type { BatchJobRecord, GenerationMode, GenerationSource } from "@/lib/types";
import { MAX_TEXT_CHARS } from "@/lib/usage-policy";
import { normalizeVoiceStyle } from "@/lib/voice-defaults";

const DEFAULT_DASHBOARD_JOB_CHUNK_TARGET_SECONDS = 60;

function estimatedCharsPerSecond(mode: GenerationMode): number {
  return mode === "clone" ? 13 : 20;
}

function dashboardJobChunkChars(totalChars: number, mode: GenerationMode): number {
  const configured = Number(process.env.DASHBOARD_GENERATION_CHUNK_CHARS);
  const targetSeconds = Number(process.env.DASHBOARD_GENERATION_CHUNK_TARGET_SECONDS);
  const fallbackTargetSeconds =
    Number.isFinite(targetSeconds) && targetSeconds >= 15 && targetSeconds <= 120
      ? targetSeconds
      : DEFAULT_DASHBOARD_JOB_CHUNK_TARGET_SECONDS;
  const fallback = Math.round(estimatedCharsPerSecond(mode) * fallbackTargetSeconds);
  const base = Number.isInteger(configured) && configured >= 600
    ? configured
    : fallback;
  const minForBatchLimit = Math.ceil(Math.max(1, totalChars) / MAX_DASHBOARD_BATCH_ITEMS);
  return Math.min(MAX_TEXT_CHARS, Math.max(base, minForBatchLimit));
}

export function splitDashboardTextForJob(text: string, mode: GenerationMode = "tts"): string[] {
  const prepared = prepareTextForSpeech(text);
  if (!prepared) {
    throw new BatchJobServiceError("Text input is required.", 400, "TEXT_REQUIRED");
  }

  const totalChars = countChars(prepared);
  return splitTextIntoChunks(prepared, dashboardJobChunkChars(totalChars, mode));
}

function dashboardJobTitle(mode: GenerationMode, totalChars: number, totalItems: number): string {
  const label = mode === "clone" ? "Clone Voice" : "Standard TTS";
  const segmentation = totalItems > 1 ? `${totalItems} segments` : "1 segment";
  return `Dashboard ${label} (${totalChars.toLocaleString()} chars, ${segmentation})`;
}

export async function createQueuedDashboardGeneration(params: {
  userId: string;
  source?: GenerationSource;
  mode: GenerationMode;
  text: string;
  voice: string;
  model?: string;
  cloneSample?: CloneSample;
  cloneConsentAccepted?: boolean;
  denoiseReference?: boolean;
  voiceStyle?: unknown;
}): Promise<{ job: BatchJobRecord }> {
  const chunks = splitDashboardTextForJob(params.text, params.mode);
  const lines: BatchLineInput[] = chunks.map((text) => ({ text }));
  const totalChars = lines.reduce((sum, line) => sum + countChars(line.text), 0);
  const voiceStyle = normalizeVoiceStyle(params.voiceStyle);

  const { job } = await createQueuedDashboardBatchJob({
    userId: params.userId,
    source: params.source ?? "dashboard",
    mode: params.mode,
    title: dashboardJobTitle(params.mode, totalChars, lines.length),
    lines,
    voice: params.voice,
    model: params.model,
    cloneSample: params.cloneSample,
    cloneConsentAccepted: params.cloneConsentAccepted,
    // Tag as a dashboard auto-chunked generation so the worker hides the
    // per-chunk segment records and saves one merged full-audio history entry.
    // Carries the opt-in reference-denoise flag and the voice-style preset so
    // the worker can forward them.
    metadataJson: dashboardMergeMetadataJson({
      denoiseReference: params.denoiseReference === true,
      voiceStyle,
    }),
  }, {
    maxRunning: dashboardMaxRunningJobsPerUser(),
    maxQueued: dashboardMaxQueuedJobsPerUser(),
  });

  kickBatchWorker(job.id);
  return { job };
}
