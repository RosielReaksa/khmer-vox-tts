import { NextResponse } from "next/server";

import { PUBLIC_AUDIO_CONTENT_TYPE, PUBLIC_AUDIO_OUTPUT_FORMAT } from "@/lib/audio-api";
import { getUserBatchJobWithItems } from "@/lib/store";
import { readSessionFromCookie } from "@/lib/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; itemId: string }>;
};

function safeFileStem(value: string | null): string | null {
  const cleaned = value
    ?.trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
  return cleaned || null;
}

function batchItemFileName(index: number, externalId: string | null): string {
  const prefix = String(index + 1).padStart(3, "0");
  const stem = safeFileStem(externalId);
  return `${stem ? `${prefix}_${stem}` : prefix}.${PUBLIC_AUDIO_OUTPUT_FORMAT}`;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, itemId } = await context.params;
  const result = await getUserBatchJobWithItems(session.userId, id);
  if (!result) {
    return NextResponse.json({ error: "Batch job not found." }, { status: 404 });
  }

  const item = result.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    return NextResponse.json({ error: "Batch job item not found." }, { status: 404 });
  }
  if (item.status !== "success" || !item.audioBase64) {
    return NextResponse.json({ error: "Audio is not available for this line yet." }, { status: 404 });
  }

  const bytes = Buffer.from(item.audioBase64, "base64");
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return new NextResponse(new Blob([body], { type: item.contentType ?? PUBLIC_AUDIO_CONTENT_TYPE }), {
    status: 200,
    headers: {
      "Content-Type": item.contentType ?? PUBLIC_AUDIO_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${batchItemFileName(item.itemIndex, item.externalId)}"`,
      "Content-Length": String(bytes.byteLength),
    },
  });
}
