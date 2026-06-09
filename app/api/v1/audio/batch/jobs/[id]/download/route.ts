import { NextResponse } from "next/server";

import { authenticateApiKeyFromRequest } from "@/lib/api-key-auth";
import { PUBLIC_AUDIO_OUTPUT_FORMAT } from "@/lib/audio-api";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { getBatchJobWithItems } from "@/lib/store";
import { createZip } from "@/lib/zip";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function OPTIONS() {
  return corsOptionsResponse();
}

function extensionFor(contentType: string | null): string {
  if (!contentType) return PUBLIC_AUDIO_OUTPUT_FORMAT;
  if (contentType.includes("mpeg") || contentType.includes("mp3")) return "mp3";
  if (contentType.includes("ogg")) return "ogg";
  if (contentType.includes("webm")) return "webm";
  return "wav";
}

function safeFileStem(value: string | null): string | null {
  const cleaned = value
    ?.trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
  return cleaned || null;
}

function batchItemFileName(index: number, externalId: string | null, contentType: string | null): string {
  const prefix = String(index + 1).padStart(3, "0");
  const stem = safeFileStem(externalId);
  return `${stem ? `${prefix}_${stem}` : prefix}.${extensionFor(contentType)}`;
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

  const files = result.items
    .filter((item) => item.status === "success" && item.audioBase64)
    .map((item) => ({
      name: batchItemFileName(item.itemIndex, item.externalId, item.contentType),
      data: Buffer.from(item.audioBase64 ?? "", "base64"),
    }));

  if (files.length === 0) {
    return jsonWithCors({ error: "No generated audio files are available yet." }, { status: 404 });
  }

  const zip = createZip(files);
  const body = new ArrayBuffer(zip.byteLength);
  new Uint8Array(body).set(zip);
  return new NextResponse(new Blob([body], { type: "application/zip" }), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${result.job.id}.zip"`,
      "Content-Length": String(zip.byteLength),
      ...corsHeaders(),
    },
  });
}
