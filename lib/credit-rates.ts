import type { GenerationMode } from "@/lib/types";

export const TTS_CREDITS_PER_SECOND = 1.5;
export const STANDARD_CLONE_CREDITS_PER_SECOND = 2;
export const BUSINESS_CLONE_CREDITS_PER_SECOND = 1.5;
export const ENTERPRISE_CLONE_CREDITS_PER_SECOND = 1;

const ALLOWED_CLONE_CREDIT_RATES = [
  ENTERPRISE_CLONE_CREDITS_PER_SECOND,
  BUSINESS_CLONE_CREDITS_PER_SECOND,
  STANDARD_CLONE_CREDITS_PER_SECOND,
] as const;

export function normalizeCloneCreditRate(
  input: number | string | null | undefined,
  fallback = BUSINESS_CLONE_CREDITS_PER_SECOND,
): number {
  if (input === null || input === undefined || input === "") return fallback;
  const value = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(value)) return fallback;
  const rounded = Math.round(Number(value) * 10) / 10;
  return ALLOWED_CLONE_CREDIT_RATES.includes(rounded as (typeof ALLOWED_CLONE_CREDIT_RATES)[number])
    ? rounded
    : fallback;
}

export function creditsPerSecondForMode(
  mode: GenerationMode,
  cloneCreditsPerSecond = STANDARD_CLONE_CREDITS_PER_SECOND,
): number {
  return mode === "clone"
    ? normalizeCloneCreditRate(cloneCreditsPerSecond, STANDARD_CLONE_CREDITS_PER_SECOND)
    : TTS_CREDITS_PER_SECOND;
}

export function calculateCreditsForSeconds(
  seconds: number,
  mode: GenerationMode,
  cloneCreditsPerSecond = STANDARD_CLONE_CREDITS_PER_SECOND,
): number {
  const wholeSeconds = Math.max(1, Math.ceil(seconds));
  return Math.max(1, Math.ceil(wholeSeconds * creditsPerSecondForMode(mode, cloneCreditsPerSecond)));
}

export function formatCloneCreditRate(rate: number | null | undefined): string {
  return `${normalizeCloneCreditRate(rate).toLocaleString(undefined, { maximumFractionDigits: 1 })} tokens/sec`;
}
