import { NextResponse } from "next/server";

import { authenticateApiKeyFromRequest } from "@/lib/api-key-auth";
import { PUBLIC_AUDIO_OUTPUT_FORMAT, publicBatchJobUrls } from "@/lib/audio-api";
import { parseBatchMetadataJson } from "@/lib/batch-service";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { getBatchJobWithItems } from "@/lib/store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

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

export async function GET(request: Request, context: RouteContext) {
  const auth = await authenticateApiKeyFromRequest(request);
  if (!auth.ok) {
    return jsonWithCors({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const result = await getBatchJobWithItems(id);
  if (!result || result.job.userId !== auth.userId) {
    return jsonWithCors({ error: "Batch job not found." }, { status: 404 });
  }
  const urls = publicBatchJobUrls(result.job.id);

  return jsonWithCors({
    ok: true,
    job: {
      id: result.job.id,
      external_id: result.job.externalId,
      mode: result.job.mode,
      source: result.job.source,
      status: result.job.status,
      title: result.job.title,
      model: result.job.model,
      total_items: result.job.totalItems,
      completed_items: result.job.completedItems,
      failed_items: result.job.failedItems,
      total_input_chars: result.job.totalInputChars,
      credits_estimated: result.job.creditsEstimated,
      credits_charged: result.job.creditsCharged,
      output_seconds: result.job.outputSeconds,
      output_format: PUBLIC_AUDIO_OUTPUT_FORMAT,
      error: result.job.errorMessage,
      status_url: urls.status_url,
      download_url: urls.download_url,
      next_retry_at: result.job.nextRetryAt,
      dead_letter_reason: result.job.deadLetterReason,
      worker_attempt_count: result.job.workerAttemptCount,
      last_worker_error: result.job.lastWorkerError,
      metadata: parseBatchMetadataJson(result.job.metadataJson),
      webhook: {
        configured: Boolean(result.job.webhookCallbackUrl),
        status: result.job.webhookStatus,
        attempts: result.job.webhookAttempts,
        last_error: result.job.webhookLastError,
        last_attempt_at: result.job.webhookLastAttemptAt,
      },
      created_at: result.job.createdAt,
      updated_at: result.job.updatedAt,
      started_at: result.job.startedAt,
      completed_at: result.job.completedAt,
    },
    items: result.items.map((item) => ({
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
      has_audio: Boolean(item.audioBase64),
    })),
  });
}
