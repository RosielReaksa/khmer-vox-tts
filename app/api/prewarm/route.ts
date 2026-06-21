import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { getApiAccessStatus } from "@/lib/api-access";
import { isPrewarmEnabled, prewarmUpstream } from "@/lib/prewarm";
import { readSessionFromCookie } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Lightweight, auth-gated endpoint the dashboard pings when a signed-in user is
 * about to generate (workspace mount / text-box focus). It triggers the Modal
 * GPU to spin up so the real generation a few seconds later hits a warm
 * container instead of a ~58s cold start.
 *
 * Returns immediately: the warm ping is fire-and-forget and globally throttled
 * inside prewarmUpstream(), so this can be called liberally from the client
 * without running up GPU cost. Requires a session so anonymous traffic can't
 * trigger GPU spin-up; requires paid API access (or admin) so free-account abuse
 * cannot repeatedly warm GPUs without a billing relationship. The endpoint still
 * returns 200 for ineligible signed-in users because warming is best-effort and
 * the dashboard should not surface eligibility details.
 */
export async function POST() {
  if (!isPrewarmEnabled()) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      eligible: false,
      attempted: 0,
      skippedThrottled: 0,
      endpoints: 0,
      skippedReason: "disabled",
    });
  }

  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = isAdminEmail(session.email);
  const access = isAdmin ? null : await getApiAccessStatus(session.userId);
  if (!isAdmin && !access?.hasPaidApiAccess) {
    return NextResponse.json({
      ok: true,
      enabled: true,
      eligible: false,
      attempted: 0,
      skippedThrottled: 0,
      endpoints: 0,
      skippedReason: "paid_access_required",
    });
  }

  const result = prewarmUpstream();
  return NextResponse.json({ ok: true, eligible: true, ...result });
}
