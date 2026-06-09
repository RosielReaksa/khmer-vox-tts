import { NextResponse } from "next/server";
import { z } from "zod";

import { readSessionFromCookie } from "@/lib/session";
import { revokeApiKey } from "@/lib/store";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = await context.params;
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid API key id." }, { status: 400 });
  }

  const ok = await revokeApiKey(session.userId, parsed.data.id);
  if (!ok) {
    return NextResponse.json({ error: "API key not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
