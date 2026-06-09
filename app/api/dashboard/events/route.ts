import { isAdminEmail } from "@/lib/admin";
import { readSessionFromCookie } from "@/lib/session";
import {
  getUserTokenBalance,
  listPaymentOrdersForAdmin,
  listUserApiKeys,
  listUserBusinessApiRequests,
  listUserGenerations,
  listUserPaymentOrders,
  listUserPaymentSupportTickets,
  listUserWebhookTestEvents,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_MS = 10_000;
const MAX_STREAM_MS = 55_000;

type LiveScope = "user" | "billing" | "history" | "api" | "admin-payments";
type Snapshot = Partial<Record<LiveScope, string>>;

export async function GET(request: Request) {
  const session = await readSessionFromCookie();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  const isAdmin = isAdminEmail(session.email);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let previous = await buildSnapshot(session.userId, isAdmin);
      const startedAt = Date.now();
      controller.enqueue(encoder.encode(": connected\n\n"));

      while (!request.signal.aborted && Date.now() - startedAt < MAX_STREAM_MS) {
        await sleep(POLL_MS, request.signal);
        if (request.signal.aborted) break;

        try {
          const next = await buildSnapshot(session.userId, isAdmin);
          const scopes = changedScopes(previous, next);
          if (scopes.length > 0) {
            controller.enqueue(
              encoder.encode(
                `event: dashboard-update\ndata: ${JSON.stringify({
                  at: new Date().toISOString(),
                  scopes,
                })}\n\n`,
              ),
            );
            previous = next;
          } else {
            controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
          }
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `event: dashboard-error\ndata: ${JSON.stringify({
                at: new Date().toISOString(),
                message: error instanceof Error ? error.message : "Live update failed",
              })}\n\n`,
            ),
          );
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}

async function buildSnapshot(userId: string, includeAdmin: boolean): Promise<Snapshot> {
  const [
    tokenBalance,
    orders,
    tickets,
    generations,
    apiKeys,
    businessRequests,
    webhookTests,
    adminOrders,
  ] = await Promise.all([
    getUserTokenBalance(userId),
    listUserPaymentOrders(userId),
    listUserPaymentSupportTickets(userId),
    listUserGenerations(userId, { source: "all", mode: "all", limit: 10 }),
    listUserApiKeys(userId),
    listUserBusinessApiRequests(userId),
    listUserWebhookTestEvents(userId, { limit: 10 }),
    includeAdmin ? listPaymentOrdersForAdmin("pending") : Promise.resolve([]),
  ]);

  return {
    user: stableStringify({ tokenBalance }),
    billing: stableStringify({
      orders: orders.map((order) => [
        order.id,
        order.status,
        order.updatedAt,
        order.paidAt,
        order.approvedAt,
        Boolean(order.proofImageDataUrl),
      ]),
      tickets: tickets.map((ticket) => [ticket.id, ticket.status, ticket.updatedAt]),
    }),
    history: stableStringify({
      generations: generations.map((item) => [
        item.id,
        item.mode,
        item.source,
        item.status,
        item.outputSeconds,
        item.creditsCharged,
        Boolean(item.hasAudio || item.audioBase64),
      ]),
    }),
    api: stableStringify({
      apiKeys: apiKeys.map((key) => [
        key.id,
        key.revokedAt,
        key.lastUsedAt,
        key.dailyTokenLimit,
        key.monthlyTokenLimit,
        key.maxConcurrentRequests,
        key.maxConcurrentJobs,
        key.maxQueuedJobs,
      ]),
      businessRequests: businessRequests.map((request) => [
        request.id,
        request.status,
        request.updatedAt,
        request.reviewedAt,
        request.appliedDailyTokenLimit,
        request.appliedMonthlyTokenLimit,
        request.appliedMaxConcurrentRequests,
        request.appliedMaxConcurrentJobs,
        request.appliedMaxQueuedJobs,
      ]),
      webhookTests: webhookTests.map((event) => [
        event.id,
        event.eventType,
        event.deliveryStatus,
        event.httpStatus,
        event.createdAt,
      ]),
    }),
    ...(includeAdmin
      ? {
          "admin-payments": stableStringify({
            orders: adminOrders.slice(0, 100).map((order) => [
              order.id,
              order.status,
              order.updatedAt,
              order.paidAt,
              order.approvedAt,
              order.rejectedAt,
              Boolean(order.proofImageDataUrl),
              order.providerStatus,
            ]),
          }),
        }
      : {}),
  };
}

function changedScopes(previous: Snapshot, next: Snapshot): LiveScope[] {
  return (Object.keys(next) as LiveScope[]).filter((scope) => previous[scope] !== next[scope]);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}
