import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/current-user";
import { cachedDashboardValue, dashboardCacheKey } from "@/lib/dashboard-count-cache";
import { isKhqrccConfigured, khqrccAccountLabel } from "@/lib/khqrcc";
import { TOKEN_PACK_PLANS } from "@/lib/plans";
import {
  getSystemSetting,
  getUserTotalCreditsEarned,
  listUserPaymentOrders,
  listUserPaymentSupportTickets,
} from "@/lib/store";
import { getApiAccessStatus } from "@/lib/api-access";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [orders, supportTickets, totalCreditsEarned, apiAccess, adminActiveSetting] = await Promise.all([
    listUserPaymentOrders(user.id),
    listUserPaymentSupportTickets(user.id),
    cachedDashboardValue(dashboardCacheKey(user.id, "billing:credits-earned"), 8, () =>
      getUserTotalCreditsEarned(user.id),
    ),
    getApiAccessStatus(user.id),
    getSystemSetting("admin_active", "true"),
  ]);

  return NextResponse.json({
    orders,
    supportTickets,
    plans: TOKEN_PACK_PLANS,
    currentBalance: user.tokenBalance,
    totalCreditsEarned,
    apiAccess,
    paymentInfo: {
      khqrName: "KHQRcc ABA Pay",
      khqrAccount: khqrccAccountLabel(),
      telegramHandle: process.env.TELEGRAM_ADMIN_HANDLE?.trim() || "https://t.me/OfficalVoxTTS",
      staticQrImageUrl: "",
      autoVerificationEnabled: isKhqrccConfigured(),
      checkoutMode: "khqrcc_qr",
      initialAdminActive: adminActiveSetting === "true",
    },
  });
}
