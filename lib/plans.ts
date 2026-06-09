import type { PaymentPlanId } from "@/lib/types";

export type TokenPackPlan = {
  id: PaymentPlanId;
  name: string;
  tokens: number;
  priceCents: number;
  description: string;
};

export const TOKEN_PACK_PLANS: TokenPackPlan[] = [
  {
    id: "starter",
    name: "Starter",
    tokens: 1_000,
    priceCents: 20,
    description: "Good for short tests and quick bot integrations.",
  },
  {
    id: "creator",
    name: "Creator",
    tokens: 10_000,
    priceCents: 150,
    description: "Built for regular batch generation workloads.",
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

