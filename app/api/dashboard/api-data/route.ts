import { NextResponse } from "next/server";

import { getApiAccessStatus } from "@/lib/api-access";
import { getCurrentUser } from "@/lib/current-user";
import { withDatabaseGuard } from "@/lib/db-guard";
import { cachedDashboardValue, dashboardCacheKey } from "@/lib/dashboard-count-cache";
import {
  getApiUsageStats,
  listUserApiKeys,
  listUserBatchJobs,
  listUserBusinessApiRequests,
  listUserGenerations,
  listUserWebhookTestEvents,
} from "@/lib/store";

export async function GET() {
  return withDatabaseGuard(async () => {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await cachedDashboardValue(dashboardCacheKey(user.id, "api:data"), 10, async () => {
    const [usage, apiKeys, apiGenerations, apiAccess, batchJobs, businessRequests, webhookTests] = await Promise.all([
      cachedDashboardValue(dashboardCacheKey(user.id, "api:usage"), 8, () => getApiUsageStats(user.id)),
      listUserApiKeys(user.id),
      listUserGenerations(user.id, {
        source: "api_key",
        limit: 120,
      }),
      getApiAccessStatus(user.id),
      listUserBatchJobs(user.id, { limit: 80 }),
      listUserBusinessApiRequests(user.id),
      listUserWebhookTestEvents(user.id, { limit: 20 }),
    ]);
    const requestCountByKey = new Map<string, number>();
    for (const item of apiGenerations) {
      if (!item.apiKeyId) continue;
      requestCountByKey.set(item.apiKeyId, (requestCountByKey.get(item.apiKeyId) ?? 0) + 1);
    }

    return {
      apiAccess,
      usage,
      apiKeys: apiKeys.map((key) => ({
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        dailyTokenLimit: key.dailyTokenLimit,
        monthlyTokenLimit: key.monthlyTokenLimit,
        maxConcurrentRequests: key.maxConcurrentRequests,
        maxConcurrentJobs: key.maxConcurrentJobs,
        maxQueuedJobs: key.maxQueuedJobs,
        createdAt: key.createdAt,
        lastUsedAt: key.lastUsedAt,
        revokedAt: key.revokedAt,
        requestCount: requestCountByKey.get(key.id) ?? 0,
      })),
      requestLogs: apiGenerations.slice(0, 20).map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        mode: item.mode,
        source: item.source,
        status: item.status,
        inputChars: item.inputChars,
        inputPreview: item.inputPreview,
        outputSeconds: item.outputSeconds,
        creditsCharged: item.creditsCharged,
      })),
      batchJobs: batchJobs.filter((job) => job.source === "api_key"),
      businessRequests,
      webhookTests,
    };
  });

    return NextResponse.json(payload);
  });
}
