import type { PaymentPlanId } from "@/lib/types";
import {
  STANDARD_CLONE_CREDITS_PER_SECOND,
  TTS_CREDITS_PER_SECOND,
} from "@/lib/credit-rates";

export type TokenPackPlan = {
  id: PaymentPlanId;
  name: string;
  tokens: number;
  priceCents: number;
  description: string;
};

export const TOKEN_PACK_PLANS: TokenPackPlan[] = [
  {
    id: "creator",
    name: "Creator",
    tokens: 10_000,
    priceCents: 150,
    description: "Built for regular batch generation workloads.",
  },
  {
    id: "pro",
    name: "Pro",
    tokens: 30_000,
    priceCents: 400,
    description: "More credits for growing creators and larger batch workloads.",
  },
  {
    id: "pack_5",
    name: "40K Token Pack",
    tokens: 40_000,
    priceCents: 500,
    description: "Affordable add-on for medium projects.",
  },
  {
    id: "pack_10",
    name: "85K Token Pack",
    tokens: 85_000,
    priceCents: 1000,
    description: "Standard pack for power users.",
  },
  {
    id: "pack_15",
    name: "130K Token Pack",
    tokens: 130_000,
    priceCents: 1500,
    description: "High volume pack for creators.",
  },
  {
    id: "pack_20",
    name: "180K Token Pack",
    tokens: 180_000,
    priceCents: 2000,
    description: "Bulk tier with highest value.",
  },
];

export function findTokenPackPlan(planId: string): TokenPackPlan | null {
  return TOKEN_PACK_PLANS.find((plan) => plan.id === planId) ?? null;
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatAudioDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  const parts: string[] = [];

  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}s`);

  return parts.join(" ");
}

export function getAudioDurationEstimates(tokens: number): {
  standard: string;
  clone: string;
} {
  return {
    standard: formatAudioDuration(Math.floor(tokens / TTS_CREDITS_PER_SECOND)),
    clone: formatAudioDuration(Math.floor(tokens / STANDARD_CLONE_CREDITS_PER_SECOND)),
  };
}
