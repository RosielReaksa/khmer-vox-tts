import { NextResponse } from "next/server";

import { corsHeaders } from "@/lib/cors";

export const runtime = "nodejs";

// Catch-all for /api/* paths that no route handler matches. Without this,
// unknown API paths return the HTML not-found page, which is hostile to API
// consumers (and broke the reporter's polling when they hit /api/v1/audio/jobs
// instead of /api/v1/audio/batch/jobs). Static, more specific route handlers
// keep precedence over this dynamic catch-all.
function jsonNotFound(request: Request) {
  const url = new URL(request.url);
  return NextResponse.json(
    {
      error: `Unknown API path: ${url.pathname}`,
      code: "NOT_FOUND",
      hint: "See /docs for the list of valid endpoints.",
    },
    { status: 404, headers: corsHeaders() },
  );
}

export async function GET(request: Request) {
  return jsonNotFound(request);
}

export async function POST(request: Request) {
  return jsonNotFound(request);
}

export async function PUT(request: Request) {
  return jsonNotFound(request);
}

export async function PATCH(request: Request) {
  return jsonNotFound(request);
}

export async function DELETE(request: Request) {
  return jsonNotFound(request);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
