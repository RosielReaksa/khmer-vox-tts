import { NextResponse } from "next/server";

import { clearSessionCookie } from "@/lib/session";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  await clearSessionCookie();
  return NextResponse.redirect(new URL("/app/signin", request.url), {
    headers: { "Cache-Control": "no-store" },
  });
}
