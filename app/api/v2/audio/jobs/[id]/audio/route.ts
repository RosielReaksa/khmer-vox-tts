import { NextResponse } from "next/server";

import { authenticateApiKeyFromRequest } from "@/lib/api-key-auth";
import { PUBLIC_AUDIO_CONTENT_TYPE, PUBLIC_AUDIO_OUTPUT_FORMAT } from "@/lib/audio-api";
import { resolveAudioBytes } from "@/lib/audio-storage";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { getBatchJobWithItems } from "@/lib/store";
import { mergePublicMp3SegmentsForDelivery } from "@/lib/tts-provider";

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

function completedStatus(status: string): boolean {
  return status === "completed" || status === "partial";
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await authenticateApiKeyFromRequest(request);
  if (!auth.ok) {
    return jsonWithCors({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const result = await getBatchJobWithItems(id);
  if (!result || result.job.userId !== auth.userId) {
    return jsonWithCors({ error: "Audio job not found." }, { status: 404 });
  }
  if (!completedStatus(result.job.status)) {
    return jsonWithCors(
      {
        error: "Audio job is not completed yet.",
        code: "JOB_NOT_READY",
        status: result.job.status,
      },
      { status: 409 },
    );
  }

  const successfulItems = result.items
    .filter((item) => item.status === "success" && (item.audioBase64 || item.audioObjectKey))
    .sort((a, b) => a.itemIndex - b.itemIndex);
  if (successfulItems.length === 0) {
    return jsonWithCors({ error: "No generated audio is available for this job." }, { status: 404 });
  }

  try {
    const buffers: Buffer[] = [];
    for (const item of successfulItems) {
      const bytes = await resolveAudioBytes({
        audioBase64: item.audioBase64,
        audioObjectKey: item.audioObjectKey,
      });
      if (bytes?.byteLength) buffers.push(Buffer.from(bytes));
    }
    if (buffers.length === 0) {
      return jsonWithCors({ error: "No generated audio is available for this job." }, { status: 404 });
    }

    const cleaned = await mergePublicMp3SegmentsForDelivery(buffers, result.job.outputSeconds, result.job.mode);
    const body = new ArrayBuffer(cleaned.bytes.byteLength);
    new Uint8Array(body).set(cleaned.bytes);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": cleaned.contentType || PUBLIC_AUDIO_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${result.job.id}.${PUBLIC_AUDIO_OUTPUT_FORMAT}"`,
        "Content-Length": String(cleaned.bytes.byteLength),
        "X-Audio-Job-Id": result.job.id,
        "X-Audio-Job-Status": result.job.status,
        "X-Audio-Job-Partial": result.job.status === "partial" ? "true" : "false",
        "X-Credits-Charged": String(result.job.creditsCharged),
        "X-Output-Seconds": String(cleaned.outputSeconds ?? result.job.outputSeconds),
        ...corsHeaders(),
      },
    });
  } catch (error) {
    console.error(`[v2-audio] Failed to build audio for job ${id}:`, error);
    return jsonWithCors(
      { error: error instanceof Error ? error.message : "Failed to build audio." },
      { status: 500 },
    );
  }
}
