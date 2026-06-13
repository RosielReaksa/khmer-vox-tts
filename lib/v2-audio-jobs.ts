import "server-only";

import {
  PUBLIC_AUDIO_OUTPUT_FORMAT,
  publicBatchJobUrls,
} from "@/lib/audio-api";
import {
  BatchJobServiceError,
  type BatchLineInput,
  MAX_BATCH_ITEMS,
  MAX_BATCH_TOTAL_CHARS,
  MAX_EXTERNAL_ID_CHARS,
  parseBatchMetadataJson,
  serializeBatchMetadata,
} from "@/lib/batch-service";
import { countChars } from "@/lib/generation-service";
import { prepareTextForSpeech } from "@/lib/speech-text-sanitizer";
import { splitTextIntoChunks } from "@/lib/tts-provider";
import type { BatchJobItemRecord, BatchJobRecord } from "@/lib/types";
import { MAX_TEXT_CHARS } from "@/lib/usage-policy";

const DEFAULT_ASYNC_JOB_CHUNK_TARGET_SECONDS = 60;
const DEFAULT_ASYNC_JOB_CHARS_PER_SECOND = 20;

export type V2AudioLineObject = {
  id?: string | null;
  text: string;
  external_id?: string | null;
  speaker?: string | null;
  start_ms?: number | null;
  end_ms?: number | null;
  metadata?: unknown;
};

export type V2AudioInput = string | string[] | V2AudioLineObject[];

function chunkChars(totalChars: number): number {
  const configured = Number(process.env.V2_AUDIO_JOB_CHUNK_CHARS);
  const targetSeconds = Number(process.env.V2_AUDIO_JOB_CHUNK_TARGET_SECONDS);
  const fallbackTargetSeconds =
    Number.isFinite(targetSeconds) && targetSeconds >= 15 && targetSeconds <= 120
      ? targetSeconds
      : DEFAULT_ASYNC_JOB_CHUNK_TARGET_SECONDS;
  const fallback = Math.round(DEFAULT_ASYNC_JOB_CHARS_PER_SECOND * fallbackTargetSeconds);
  const base = Number.isInteger(configured) && configured >= 600
    ? configured
    : fallback;
  const minForBatchLimit = Math.ceil(Math.max(1, totalChars) / MAX_BATCH_ITEMS);
  return Math.min(MAX_TEXT_CHARS, Math.max(base, minForBatchLimit));
}

function safeExternalId(value: string | null | undefined, suffix?: number): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const withSuffix = suffix && suffix > 1 ? `${trimmed}-${suffix}` : trimmed;
  return withSuffix.slice(0, MAX_EXTERNAL_ID_CHARS);
}

function splitOneLine(input: BatchLineInput): BatchLineInput[] {
  const text = prepareTextForSpeech(input.text);
  if (!text) return [];
  const totalChars = countChars(text);
  const chunks = splitTextIntoChunks(text, chunkChars(totalChars));
  return chunks.map((chunk, index) => ({
    text: chunk,
    externalId: safeExternalId(input.externalId, chunks.length > 1 ? index + 1 : undefined),
    speaker: input.speaker ?? null,
    startMs: input.startMs ?? null,
    endMs: input.endMs ?? null,
    metadataJson: input.metadataJson ?? null,
  }));
}

function normalizeLineObject(line: V2AudioLineObject): BatchLineInput {
  return {
    text: line.text,
    externalId: line.external_id ?? line.id ?? null,
    speaker: line.speaker ?? null,
    startMs: line.start_ms ?? null,
    endMs: line.end_ms ?? null,
    metadataJson: serializeBatchMetadata(line.metadata),
  };
}

export function expandV2AudioInputToLines(input: V2AudioInput): BatchLineInput[] {
  const rawLines: BatchLineInput[] = typeof input === "string"
    ? [{ text: input }]
    : input.map((line) => typeof line === "string" ? { text: line } : normalizeLineObject(line));

  const lines = rawLines.flatMap(splitOneLine);
  const totalChars = lines.reduce((sum, line) => sum + countChars(line.text), 0);
  if (lines.length === 0) {
    throw new BatchJobServiceError("At least one text line is required.", 400, "BATCH_EMPTY");
  }
  if (lines.length > MAX_BATCH_ITEMS) {
    throw new BatchJobServiceError(
      `Async job max is ${MAX_BATCH_ITEMS.toLocaleString()} generated segments.`,
      400,
      "BATCH_TOO_MANY_ITEMS",
    );
  }
  if (totalChars > MAX_BATCH_TOTAL_CHARS) {
    throw new BatchJobServiceError(
      `Async job max is ${MAX_BATCH_TOTAL_CHARS.toLocaleString()} total characters.`,
      400,
      "BATCH_TOO_LARGE",
    );
  }
  return lines;
}

export function serializeV2AudioJob(job: BatchJobRecord, items?: BatchJobItemRecord[]) {
  const urls = publicBatchJobUrls(job.id);
  return {
    id: job.id,
    external_id: job.externalId,
    mode: job.mode,
    source: job.source,
    status: job.status,
    title: job.title,
    model: job.model,
    total_items: job.totalItems,
    completed_items: job.completedItems,
    failed_items: job.failedItems,
    total_input_chars: job.totalInputChars,
    credits_estimated: job.creditsEstimated,
    credits_charged: job.creditsCharged,
    output_seconds: job.outputSeconds,
    output_format: PUBLIC_AUDIO_OUTPUT_FORMAT,
    error: job.errorMessage,
    status_url: urls.v2_status_url,
    audio_url: urls.v2_audio_url,
    zip_url: urls.zip_url,
    legacy_status_url: urls.status_url,
    legacy_zip_url: urls.download_url,
    next_retry_at: job.nextRetryAt,
    dead_letter_reason: job.deadLetterReason,
    worker_attempt_count: job.workerAttemptCount,
    last_worker_error: job.lastWorkerError,
    metadata: parseBatchMetadataJson(job.metadataJson),
    webhook: {
      configured: Boolean(job.webhookCallbackUrl),
      status: job.webhookStatus,
      attempts: job.webhookAttempts,
      last_error: job.webhookLastError,
      last_attempt_at: job.webhookLastAttemptAt,
    },
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    started_at: job.startedAt,
    completed_at: job.completedAt,
    items: items?.map((item) => ({
      id: item.externalId ?? String(item.itemIndex + 1),
      index: item.itemIndex,
      external_id: item.externalId,
      speaker: item.speaker,
      start_ms: item.startMs,
      end_ms: item.endMs,
      metadata: parseBatchMetadataJson(item.metadataJson),
      status: item.status,
      generation_id: item.generationId,
      content_type: item.contentType,
      output_format: PUBLIC_AUDIO_OUTPUT_FORMAT,
      output_seconds: item.outputSeconds,
      credits_charged: item.creditsCharged,
      attempt_count: item.attemptCount,
      next_retry_at: item.nextRetryAt,
      error: item.errorMessage,
      has_audio: Boolean(item.audioBase64 || item.audioObjectKey),
    })),
  };
}
