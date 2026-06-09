import "server-only";

import {
  BUSINESS_CLONE_CREDITS_PER_SECOND,
  STANDARD_CLONE_CREDITS_PER_SECOND,
  normalizeCloneCreditRate,
} from "@/lib/credit-rates";
import { listUserBusinessApiRequests, listUserPaymentOrders } from "@/lib/store";

export type ApiAccessStatus = {
  hasPaidApiAccess: boolean;
  currentPlanName: string;
  cloneCreditsPerSecond: number;
  businessLimits: {
    dailyTokenLimit: number | null;
    monthlyTokenLimit: number | null;
    maxConcurrentRequests: number | null;
    maxConcurrentJobs: number | null;
    maxQueuedJobs: number | null;
    cloneCreditRate: number;
  } | null;
};

export async function getApiAccessStatus(userId: string): Promise<ApiAccessStatus> {
  const [orders, businessRequests] = await Promise.all([
    listUserPaymentOrders(userId),
    listUserBusinessApiRequests(userId),
  ]);
  const latestPaidOrder =
    orders
      .filter((order) => order.status === "approved" && order.totalPriceCents > 0 && order.tokens > 0)
      .sort((a, b) => paymentOrderTime(b) - paymentOrderTime(a))[0] ?? null;
  const latestBusinessApproval =
    businessRequests
      .filter((request) => request.status === "approved")
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null;

  if (latestBusinessApproval) {
    const cloneCreditRate = normalizeCloneCreditRate(
      latestBusinessApproval.appliedCloneCreditRate,
      BUSINESS_CLONE_CREDITS_PER_SECOND,
    );
    return {
      hasPaidApiAccess: true,
      currentPlanName: "Business API",
      cloneCreditsPerSecond: cloneCreditRate,
      businessLimits: {
        dailyTokenLimit: latestBusinessApproval.appliedDailyTokenLimit,
        monthlyTokenLimit: latestBusinessApproval.appliedMonthlyTokenLimit,
        maxConcurrentRequests: latestBusinessApproval.appliedMaxConcurrentRequests,
        maxConcurrentJobs: latestBusinessApproval.appliedMaxConcurrentJobs,
        maxQueuedJobs: latestBusinessApproval.appliedMaxQueuedJobs,
        cloneCreditRate,
      },
    };
  }

  return {
    hasPaidApiAccess: Boolean(latestPaidOrder),
    currentPlanName: latestPaidOrder ? `${latestPaidOrder.planName} x${latestPaidOrder.quantity}` : "Free",
    cloneCreditsPerSecond: STANDARD_CLONE_CREDITS_PER_SECOND,
    businessLimits: null,
  };
}

function paymentOrderTime(order: {
  approvedAt: string | null;
  paidAt: string | null;
  updatedAt: string;
  createdAt: string;
}): number {
  return new Date(order.approvedAt ?? order.paidAt ?? order.updatedAt ?? order.createdAt).getTime();
}
