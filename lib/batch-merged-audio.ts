import "server-only";

import { PUBLIC_AUDIO_CONTENT_TYPE } from "@/lib/audio-api";
import { resolveAudioBytes } from "@/lib/audio-storage";
import { getUserBatchJobWithItems, getUserGenerationRecord, getUserTokenBalance } from "@/lib/store";
import { mergePublicMp3SegmentsForDelivery } from "@/lib/tts-provider";
import type { BatchJobRecord } from "@/lib/types";

export class BatchMergedAudioError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "BatchMergedAudioError";
    this.status = status;
  }
}

export type BatchMergedAudioResult = {
  job: BatchJobRecord;
  bytes: Uint8Array;
  contentType: string;
  outputSeconds: number;
  remainingTokens: number;
  latencyMs: number;
};

export async function buildMergedBatchAudioForUser(
  userId: string,
  jobId: string,
): Promise<BatchMergedAudioResult> {
  const result = await getUserBatchJobWithItems(userId, jobId);
  if (!result) {
    throw new BatchMergedAudioError(404, "Batch job not found.");
  }

  const { job, items } = result;
  if (job.status !== "completed" && job.status !== "partial") {
    throw new BatchMergedAudioError(400, "Batch job is not completed yet.");
  }

  const savedMergedGeneration = await getUserGenerationRecord(userId, jobId);
  if (
    savedMergedGeneration?.status === "success" &&
    (savedMergedGeneration.audioBase64 || savedMergedGeneration.audioObjectKey)
  ) {
    const savedBytes = await resolveAudioBytes({
      audioBase64: savedMergedGeneration.audioBase64,
      audioObjectKey: savedMergedGeneration.audioObjectKey,
    });
    if (savedBytes?.byteLength) {
      const remainingTokens = await getUserTokenBalance(userId);
      return {
        job,
        bytes: savedBytes,
        contentType: savedMergedGeneration.contentType || PUBLIC_AUDIO_CONTENT_TYPE,
        outputSeconds: savedMergedGeneration.outputSeconds || job.outputSeconds,
        remainingTokens,
        latencyMs: savedMergedGeneration.latencyMs || (job.startedAt && job.completedAt
          ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()
          : 0),
      };
    }
  }

  const successfulItems = items
    .filter((item) => item.status === "success" && (item.audioBase64 || item.audioObjectKey))
    .sort((a, b) => a.itemIndex - b.itemIndex);

  if (successfulItems.length === 0) {
    throw new BatchMergedAudioError(404, "No successful audio segments found in this batch job.");
  }

  const buffers: Uint8Array[] = [];
  for (const item of successfulItems) {
    const bytes = await resolveAudioBytes({
      audioBase64: item.audioBase64,
      audioObjectKey: item.audioObjectKey,
    });
    if (bytes?.byteLength) buffers.push(bytes);
  }

  if (buffers.length === 0) {
    throw new BatchMergedAudioError(404, "No successful audio segments found in this batch job.");
  }

  const cleanedAudio = await mergePublicMp3SegmentsForDelivery(buffers, job.outputSeconds, job.mode);
  const remainingTokens = await getUserTokenBalance(userId);
  return {
    job,
    bytes: cleanedAudio.bytes,
    contentType: cleanedAudio.contentType || PUBLIC_AUDIO_CONTENT_TYPE,
    outputSeconds: cleanedAudio.outputSeconds ?? job.outputSeconds,
    remainingTokens,
    latencyMs: job.startedAt && job.completedAt
      ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()
      : 0,
  };
}

export function dashboardMergedAudioUrl(jobId: string): string {
  return `/api/batch/jobs/${encodeURIComponent(jobId)}/merged/audio`;
}
