import { NextResponse } from "next/server";

import { isBakongVerificationConfigured } from "@/lib/bakong";
import { getCurrentUser } from "@/lib/current-user";
import { cachedDashboardValue, dashboardCacheKey } from "@/lib/dashboard-count-cache";
import { isPaywayQrEnabled } from "@/lib/payway";
import { TOKEN_PACK_PLANS } from "@/lib/plans";
import { isStaticPaywayQrEnabled, staticPaywayQrAccountLabel, staticPaywayQrImageUrl } from "@/lib/static-payway";
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
      khqrName: process.env.KHQR_DISPLAY_NAME?.trim() || "Khmer Vox TTS",
      khqrAccount: isStaticPaywayQrEnabled()
        ? staticPaywayQrAccountLabel()
        : process.env.KHQR_ACCOUNT?.trim() || "Set KHQR_ACCOUNT in .env",
      telegramHandle: process.env.TELEGRAM_ADMIN_HANDLE?.trim() || "https://t.me/OfficalVoxTTS",
      staticQrImageUrl: staticPaywayQrImageUrl(),
      autoVerificationEnabled: isStaticPaywayQrEnabled()
        ? false
        : isPaywayQrEnabled() || isBakongVerificationConfigured(),
      checkoutMode: isStaticPaywayQrEnabled() ? "static_payway_qr" : isPaywayQrEnabled() ? "payway_qr" : "local_khqr",
      initialAdminActive: adminActiveSetting === "true",
    },
  });
}
