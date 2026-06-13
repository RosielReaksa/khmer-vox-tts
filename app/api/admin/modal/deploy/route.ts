import { NextResponse } from "next/server";
import { z } from "zod";

import { isAdminEmail } from "@/lib/admin";
import { readSessionFromCookie } from "@/lib/session";
import { getDeployStatus, startDeploy } from "@/lib/modal-deployer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Modal CLI args are passed to a spawned process. Restrict to characters that
// cannot break out of an argument or inject shell commands, even though the
// deployer also validates defensively before spawning.
const SAFE_TOKEN_ID = /^[A-Za-z0-9._:-]+$/;
const SAFE_TOKEN_SECRET = /^[A-Za-z0-9._:-]+$/;
const SAFE_PROFILE = /^[A-Za-z0-9._-]+$/;
const SAFE_MODEL_FILE = /^[A-Za-z0-9._/-]+\.py$/;

const deployRequestSchema = z.object({
  label: z.string().min(1, "Account label is required").max(120),
  profile: z
    .string()
    .min(1, "Profile name is required")
    .max(120)
    .regex(SAFE_PROFILE, "Profile name contains invalid characters"),
  tokenId: z
    .string()
    .min(1, "Token ID is required")
    .max(200)
    .regex(SAFE_TOKEN_ID, "Token ID contains invalid characters"),
  tokenSecret: z
    .string()
    .min(1, "Token Secret is required")
    .max(200)
    .regex(SAFE_TOKEN_SECRET, "Token Secret contains invalid characters"),
  initialCredits: z.number().nonnegative("Initial credits must be a positive number"),
  notes: z.string().max(2_000),
  modelFile: z
    .string()
    .max(200)
    .regex(SAFE_MODEL_FILE, "Model file name is invalid")
    .optional(),
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

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  return NextResponse.json({ ok: true, deploy: await getDeployStatus() });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    const body = await request.json().catch(() => null);
    const parsed = deployRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message || "Invalid deployment parameters" },
        { status: 400 }
      );
    }

    const deployStatus = await getDeployStatus();
    if (deployStatus.status === "configuring_token" || deployStatus.status === "creating_secret" || deployStatus.status === "deploying") {
      return NextResponse.json(
        { ok: false, error: "A deployment is already active. Please wait for it to complete." },
        { status: 409 }
      );
    }

    // Start background deployment
    startDeploy(parsed.data);

    return NextResponse.json({ ok: true, message: "Deployment started" });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to start deployment" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const urlObj = new URL(request.url);
  const label = urlObj.searchParams.get("label");
  const profile = urlObj.searchParams.get("profile");
  const endpointUrl = urlObj.searchParams.get("url");

  if (label && profile) {
    const deployStatus = await getDeployStatus();
    if (deployStatus.status === "configuring_token" || deployStatus.status === "creating_secret" || deployStatus.status === "deploying") {
      return NextResponse.json(
        { ok: false, error: "A deployment or undeployment is already active. Please wait." },
        { status: 409 }
      );
    }

    const { startUndeploy } = await import("@/lib/modal-deployer");
    startUndeploy({ label, profile, url: endpointUrl || undefined });
    return NextResponse.json({ ok: true, message: "Undeployment started" });
  }

  const { resetDeployStatus } = await import("@/lib/modal-deployer");
  await resetDeployStatus();
  return NextResponse.json({ ok: true });
}
