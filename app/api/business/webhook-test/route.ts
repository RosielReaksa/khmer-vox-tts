import { NextResponse } from "next/server";
import { z } from "zod";

import { BatchJobServiceError } from "@/lib/batch-service";
import { sendBusinessWebhookTest } from "@/lib/business-webhook-test";
import { getCurrentUser } from "@/lib/current-user";
import { listUserWebhookTestEvents } from "@/lib/store";

const webhookTestSchema = z.object({
  webhookUrl: z.string().trim().min(1).max(2_048),
  eventType: z.enum(["completed", "failed"]).default("completed"),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const events = await listUserWebhookTestEvents(user.id, { limit: 20 });
  return NextResponse.json({ events });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = webhookTestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid webhook test details." }, { status: 400 });
  }

  try {
    const event = await sendBusinessWebhookTest({
      userId: user.id,
      webhookUrl: parsed.data.webhookUrl,
      eventType: parsed.data.eventType,
    });
    return NextResponse.json({ ok: event.deliveryStatus === "delivered", event });
  } catch (error) {
    if (error instanceof BatchJobServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Could not send webhook test." }, { status: 500 });
  }
}
