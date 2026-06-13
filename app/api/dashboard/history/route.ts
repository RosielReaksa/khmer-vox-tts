import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/current-user";
import { cachedDashboardValue, dashboardCacheKey } from "@/lib/dashboard-count-cache";
import {
  getGenerationStats,
  listUserGenerations,
  countUserGenerations,
} from "@/lib/store";
import type { GenerationMode } from "@/lib/types";

function parseMode(input: string | null): GenerationMode {
  return input === "clone" ? "clone" : "tts";
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const mode = parseMode(url.searchParams.get("mode"));
  const q = url.searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize")) || 30));
  const offset = (page - 1) * pageSize;

  const searchOpts = { source: "all" as const, mode, search: q || undefined };

  const countCachePart = q ? `history:${mode}:count:${Buffer.from(q).toString("base64url")}` : `history:${mode}:count:all`;
  const [stats, total, rows] = await Promise.all([
    cachedDashboardValue(dashboardCacheKey(user.id, `history:${mode}:stats`), 5, () =>
      getGenerationStats(user.id, mode),
    ),
    cachedDashboardValue(dashboardCacheKey(user.id, countCachePart), 5, () => countUserGenerations(user.id, searchOpts)),
    listUserGenerations(user.id, {
      ...searchOpts,
      limit: pageSize,
      offset,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return NextResponse.json({
    mode,
    q,
    stats,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
    recent: rows.map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      mode: item.mode,
      source: item.source,
      status: item.status,
      inputChars: item.inputChars,
      inputPreview: item.inputPreview,
      outputSeconds: item.outputSeconds,
      creditsCharged: item.creditsCharged,
      errorMessage: item.errorMessage,
      hasAudio: Boolean(item.hasAudio || item.audioBase64 || item.audioObjectKey),
      voice: item.voice,
      model: item.model,
    })),
  });
}
