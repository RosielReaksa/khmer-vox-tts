export const MAX_TEXT_CHARS = 5_000;
export const MAX_DASHBOARD_TTS_CHARS = 5_000;
export const MAX_VOICE_CHARS = 120;
export const MAX_MODEL_CHARS = 80;
export const MAX_CLONE_SAMPLE_BYTES = 8 * 1024 * 1024;

export type UsagePolicyName =
  | "dashboardTts"
  | "dashboardClone"
  | "apiTts"
  | "apiClone"
  | "authSignin"
  | "authSignup";

export type UsagePolicy = {
  maxRequests: number;
  windowMs: number;
  maxConcurrent: number;
};

export const DEFAULT_USAGE_POLICIES: Record<UsagePolicyName, UsagePolicy> = {
  dashboardTts: {
    maxRequests: 20,
    windowMs: 60_000,
    maxConcurrent: 2,
  },
  dashboardClone: {
    maxRequests: 8,
    windowMs: 60_000,
    maxConcurrent: 1,
  },
  apiTts: {
    maxRequests: 60,
    windowMs: 60_000,
    maxConcurrent: 4,
  },
  apiClone: {
    maxRequests: 20,
    windowMs: 60_000,
    maxConcurrent: 2,
  },
  authSignin: {
    maxRequests: 12,
    windowMs: 60_000,
    maxConcurrent: 4,
  },
  authSignup: {
    maxRequests: 5,
    windowMs: 60_000,
    maxConcurrent: 2,
  },
};
