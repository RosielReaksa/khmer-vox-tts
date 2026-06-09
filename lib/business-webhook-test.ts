import { createHmac, randomUUID } from "node:crypto";
import "server-only";

import { normalizeWebhookCallbackUrl } from "@/lib/batch-service";
import { createWebhookTestEvent } from "@/lib/store";
import type { WebhookTestEventRecord, WebhookTestEventType } from "@/lib/types";

const WEBHOOK_TEST_TIMEOUT_MS = 8_000;

function cleanEnv(name: string): string {
  return (process.env[name] ?? "").trim().replace(/^"|"$/g, "");
}

function webhookSigningSecret(): string {
  return cleanEnv("BATCH_WEBHOOK_SIGNING_SECRET");
}

function buildWebhookTestPayload(eventType: WebhookTestEventType) {
  const now = new Date().toISOString();
  const status = eventType === "completed" ? "completed" : "failed";
  return {
    event: `webhook.test.${eventType}`,
    test: true,
    created_at: now,
    job: {
      id: `test_${randomUUID()}`,
      external_id: "webhook-test",
      mode: "clone",
      status,
      title: "Khmer Vox TTS webhook test",
      metadata: {
        source: "dashboard",
        note: "This is a delivery test. No customer tokens were charged.",
      },
      total_items: 1,
      completed_items: eventType === "completed" ? 1 : 0,
      failed_items: eventType === "failed" ? 1 : 0,
      credits_estimated: 0,
      credits_charged: 0,
      output_seconds: 0,
      output_format: "mp3",
      error: eventType === "failed" ? "Sample failed-job webhook test." : null,
      created_at: now,
      started_at: now,
      completed_at: now,
      status_url: null,
      download_url: null,
    },
    items: [
      {
        index: 0,
        external_id: "webhook-test-line",
        speaker: "reference-audio",
        start_ms: null,
        end_ms: null,
        metadata: null,
        status: eventType === "completed" ? "success" : "failed",
        generation_id: null,
        content_type: eventType === "completed" ? "audio/mpeg" : null,
        output_format: "mp3",
        output_seconds: 0,
        credits_charged: 0,
        error: eventType === "failed" ? "Sample item failure." : null,
        has_audio: eventType === "completed",
      },
    ],
  };
}

function buildWebhookHeaders(eventType: WebhookTestEventType, body: string): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const event = `webhook.test.${eventType}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Khmer-Vox-TTS-Webhook-Test/1.0",
    "X-Khmer-Vox-Event": event,
    "X-Khmer-Vox-Test": "true",
    "X-Khmer-Vox-Timestamp": timestamp,
  };

  const secret = webhookSigningSecret();
  if (!secret) {
    headers["X-Khmer-Vox-Signature-Configured"] = "false";
    return headers;
  }

  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  headers["X-Khmer-Vox-Signature"] = `sha256=${signature}`;
  headers["X-Khmer-Vox-Signature-Configured"] = "true";
  return headers;
}

async function postJsonWithTimeout(url: string, body: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function previewText(input: string): string | null {
  const trimmed = input.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length <= 240 ? trimmed : `${trimmed.slice(0, 240)}...`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 260);
  }
  return "Webhook test delivery failed.";
}

export async function sendBusinessWebhookTest(input: {
  userId: string;
  webhookUrl: string;
  eventType: WebhookTestEventType;
}): Promise<WebhookTestEventRecord> {
  const webhookUrl = normalizeWebhookCallbackUrl(input.webhookUrl);
  if (!webhookUrl) {
    throw new Error("Webhook URL is required.");
  }

  const payload = buildWebhookTestPayload(input.eventType);
  const body = JSON.stringify(payload);
  const startedAt = Date.now();
  try {
    const response = await postJsonWithTimeout(webhookUrl, body, buildWebhookHeaders(input.eventType, body));
    const responseText = await response.text().catch(() => "");
    return createWebhookTestEvent({
      userId: input.userId,
      webhookUrl,
      eventType: input.eventType,
      deliveryStatus: response.ok ? "delivered" : "failed",
      httpStatus: response.status,
      responsePreview: previewText(responseText),
      errorMessage: response.ok ? null : `Webhook responded with HTTP ${response.status}.`,
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    return createWebhookTestEvent({
      userId: input.userId,
      webhookUrl,
      eventType: input.eventType,
      deliveryStatus: "failed",
      httpStatus: null,
      responsePreview: null,
      errorMessage: errorMessage(error),
      latencyMs: Date.now() - startedAt,
    });
  }
}
