import { NextResponse } from "next/server";

import { readSessionFromCookie } from "@/lib/session";
import { getUserGenerationRecord } from "@/lib/store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function extensionFor(contentType: string | null | undefined): string {
  const normalized = contentType?.toLowerCase() ?? "";
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("webm")) return "webm";
  return "wav";
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const generation = await getUserGenerationRecord(session.userId, id);
  if (!generation) {
    return NextResponse.json({ error: "Generation not found." }, { status: 404 });
  }

  if (generation.status !== "success" || !generation.audioBase64) {
    return NextResponse.json({ error: "Generated audio is not available for this history item." }, { status: 404 });
  }

  const { searchParams } = new URL(_request.url);
  const isInline = searchParams.get("inline") === "true";

  const bytes = Buffer.from(generation.audioBase64, "base64");
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  const contentType = generation.contentType ?? "audio/wav";
  const extension = extensionFor(contentType);

  const disposition = isInline ? "inline" : "attachment";

  return new NextResponse(new Blob([body], { type: contentType }), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${disposition}; filename="voxtts-${generation.mode}-${generation.id}.${extension}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
