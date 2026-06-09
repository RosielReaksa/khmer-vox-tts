import "server-only";

import { getApiKeyBatchJobCounts, getApiKeyTokenUsage } from "@/lib/store";
import type { ApiKeyRecord } from "@/lib/types";
import type { UsagePolicy } from "@/lib/usage-policy";

export class ApiKeyLimitError extends Error {
  status: number;
  code: string;

  constructor(message: string, code = "API_KEY_TOKEN_LIMIT_REACHED", status = 429) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function envPositiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function effectiveApiKeyMaxQueuedJobs(apiKey: ApiKeyRecord): number {
  return apiKey.maxQueuedJobs ?? envPositiveInt("API_KEY_DEFAULT_MAX_QUEUED_JOBS", 10);
}

export function effectiveApiKeyMaxConcurrentJobs(apiKey: ApiKeyRecord): number {
  return apiKey.maxConcurrentJobs ?? envPositiveInt("API_KEY_DEFAULT_MAX_CONCURRENT_JOBS", 2);
}

export function apiKeyUsagePolicy(apiKey: ApiKeyRecord, basePolicy: UsagePolicy): UsagePolicy {
  return {
    ...basePolicy,
    maxConcurrent: apiKey.maxConcurrentRequests ?? basePolicy.maxConcurrent,
  };
}

export async function enforceApiKeyTokenLimit(
  apiKey: ApiKeyRecord,
  creditsRequested: number,
): Promise<void> {
  const requested = Math.max(0, Math.round(creditsRequested));
  if (apiKey.dailyTokenLimit !== null) {
    const usedToday = await getApiKeyTokenUsage(apiKey.id, "day");
    if (usedToday + requested > apiKey.dailyTokenLimit) {
      throw new ApiKeyLimitError("API key daily token limit reached.");
    }
  }
  if (apiKey.monthlyTokenLimit !== null) {
    const usedThisMonth = await getApiKeyTokenUsage(apiKey.id, "month");
    if (usedThisMonth + requested > apiKey.monthlyTokenLimit) {
      throw new ApiKeyLimitError("API key monthly token limit reached.");
    }
  }
}

export async function enforceApiKeyQueuedJobLimit(apiKey: ApiKeyRecord): Promise<void> {
  const counts = await getApiKeyBatchJobCounts(apiKey.id);
  const maxQueuedJobs = effectiveApiKeyMaxQueuedJobs(apiKey);
  if (counts.queued >= maxQueuedJobs) {
    throw new ApiKeyLimitError(
      `API key queued job limit reached. Wait for queued jobs to start or raise this key's max queued jobs.`,
      "API_KEY_QUEUED_JOB_LIMIT_REACHED",
    );
  }
}
