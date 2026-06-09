import { NextResponse } from "next/server";
import { z } from "zod";

import { isAdminEmail } from "@/lib/admin";
import { readSessionFromCookie } from "@/lib/session";
import { getSystemSetting, setSystemSetting } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusSchema = z.object({
  active: z.boolean(),
});

async function requireAdmin() {
  const session = await readSessionFromCookie();
  if (!session) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isAdminEmail(session.email)) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const, session };
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const active = await getSystemSetting("admin_active", "true");
  return NextResponse.json({ active: active === "true" });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const body = await request.json().catch(() => null);
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid status body." }, { status: 400 });
  }

  await setSystemSetting("admin_active", String(parsed.data.active));
  return NextResponse.json({ ok: true, active: parsed.data.active });
}
