import "server-only";

import {
  DEFAULT_USAGE_POLICIES,
  type UsagePolicy,
  type UsagePolicyName,
} from "@/lib/usage-policy";

const envKeys: Record<UsagePolicyName, { requests: string; concurrent: string }> = {
  dashboardTts: {
    requests: "TTS_DASHBOARD_RATE_LIMIT",
    concurrent: "TTS_DASHBOARD_CONCURRENT_LIMIT",
  },
  dashboardClone: {
    requests: "TTS_DASHBOARD_CLONE_RATE_LIMIT",
    concurrent: "TTS_DASHBOARD_CLONE_CONCURRENT_LIMIT",
  },
  apiTts: {
    requests: "TTS_API_RATE_LIMIT",
    concurrent: "TTS_API_CONCURRENT_LIMIT",
  },
  apiClone: {
    requests: "TTS_API_CLONE_RATE_LIMIT",
    concurrent: "TTS_API_CLONE_CONCURRENT_LIMIT",
  },
  authSignin: {
    requests: "AUTH_SIGNIN_RATE_LIMIT",
    concurrent: "AUTH_SIGNIN_CONCURRENT_LIMIT",
  },
  authSignup: {
    requests: "AUTH_SIGNUP_RATE_LIMIT",
    concurrent: "AUTH_SIGNUP_CONCURRENT_LIMIT",
  },
};

function readPositiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function getUsagePolicy(name: UsagePolicyName): UsagePolicy {
  const defaults = DEFAULT_USAGE_POLICIES[name];
  const keys = envKeys[name];
  return {
    maxRequests: readPositiveInt(keys.requests, defaults.maxRequests),
    windowMs: readPositiveInt("TTS_RATE_LIMIT_WINDOW_MS", defaults.windowMs),
    maxConcurrent: readPositiveInt(keys.concurrent, defaults.maxConcurrent),
  };
}
