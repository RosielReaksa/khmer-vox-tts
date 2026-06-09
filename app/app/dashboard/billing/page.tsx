import { redirect } from "next/navigation";
import { Suspense } from "react";

import { BillingClient } from "@/app/app/dashboard/billing/billing-client";
import { VoxLoader } from "@/app/components/vox-loader";
import { isBakongVerificationConfigured } from "@/lib/bakong";
import { getCurrentUser } from "@/lib/current-user";
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
import type { PaymentOrderRecord } from "@/lib/types";

export default function BillingPage() {
  return (
    <section className="dashboard-enter grid gap-8 pb-12 min-w-0">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end pb-6 border-b-4 border-primary">
        <div>
          <p className="text-xs font-label font-bold text-[#4a4a4a] uppercase tracking-widest mb-2">
            Prepaid Token Packs & Subscriptions
          </p>
          <h1 className="text-5xl md:text-6xl font-headline font-black uppercase tracking-tighter text-primary">
            Billing
          </h1>
        </div>
      </header>
      <Suspense fallback={<BillingFallback />}>
        <BillingData />
      </Suspense>
    </section>
  );
}

async function BillingData() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/app/signin");
  }

  const [orders, supportTickets, totalCreditsEarned, apiAccess] = await Promise.all([
    listUserPaymentOrders(user.id),
    listUserPaymentSupportTickets(user.id),
    getUserTotalCreditsEarned(user.id),
    getApiAccessStatus(user.id),
  ]);
  const totalCredits = Math.max(totalCreditsEarned, user.tokenBalance);
  const usedCredits = Math.max(0, totalCredits - user.tokenBalance);
  const usagePercent = totalCredits > 0 ? Math.min(100, Math.round((usedCredits / totalCredits) * 100)) : 0;
  const latestPaidOrder = getLatestApprovedOrder(orders);
  const currentPlanName = apiAccess.currentPlanName;
  const currentPlanNote = apiAccess.currentPlanName === "Business API"
    ? "Custom business plan access active"
    : (latestPaidOrder
        ? `${latestPaidOrder.planName} x ${latestPaidOrder.quantity} paid pack`
        : "Free starter credits");
  const checkoutMode: "local_khqr" | "payway_qr" | "static_payway_qr" = isStaticPaywayQrEnabled()
    ? "static_payway_qr"
    : isPaywayQrEnabled()
      ? "payway_qr"
      : "local_khqr";
  const adminActiveSetting = await getSystemSetting("admin_active", "true");
  const initialAdminActive = adminActiveSetting === "true";

  const paymentInfo = {
    khqrName: process.env.KHQR_DISPLAY_NAME?.trim() || "Khmer Vox TTS",
    khqrAccount: isStaticPaywayQrEnabled()
      ? staticPaywayQrAccountLabel()
      : process.env.KHQR_ACCOUNT?.trim() || "Set KHQR_ACCOUNT in .env",
    telegramHandle: process.env.TELEGRAM_ADMIN_HANDLE?.trim() || "https://t.me/OfficalVoxTTS",
    staticQrImageUrl: staticPaywayQrImageUrl(),
    autoVerificationEnabled: isStaticPaywayQrEnabled()
      ? false
      : isPaywayQrEnabled() || isBakongVerificationConfigured(),
    checkoutMode,
    initialAdminActive,
  };

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Current Plan Card */}
        <article className="bg-white border-4 border-primary p-4 md:p-6 shadow-[4px_4px_0px_0px_#1a1a1a] relative min-w-0 flex flex-col justify-between">
          <div className="absolute -top-4 -left-4 bg-[#ffcc00] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase text-primary">
            Current Plan
          </div>
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-3xl md:text-4xl font-headline font-black uppercase text-primary leading-none">
                {currentPlanName}
              </h2>
              <p className="mt-2 text-sm text-[#4a4a4a] font-body">{currentPlanNote}</p>
            </div>
            <span className="w-fit border-2 border-primary bg-[#10b981] px-3 py-1.5 text-xs font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_#1a1a1a]">
              {apiAccess.hasPaidApiAccess || latestPaidOrder ? "Paid" : "Active"}
            </span>
          </div>
          <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="grid h-24 w-24 place-items-center border-4 border-primary bg-[#f5f0e8] text-center shrink-0 shadow-[2px_2px_0px_0px_#1a1a1a]">
              <div>
                <p className="text-2xl font-headline font-black text-primary leading-none">{usagePercent}%</p>
                <p className="text-[10px] uppercase font-headline font-bold text-[#4a4a4a] mt-1">used</p>
              </div>
            </div>
            <div className="grid gap-2 text-sm font-body w-full">
              <p className="flex items-center justify-between gap-8 border-b border-[#e5e5e5] pb-1">
                <span className="text-[#4a4a4a] font-semibold">Total Earned</span>
                <span className="font-bold">{totalCredits.toLocaleString()}</span>
              </p>
              <p className="flex items-center justify-between gap-8 border-b border-[#e5e5e5] pb-1">
                <span className="text-[#4a4a4a] font-semibold">Used</span>
                <span className="font-bold">{usedCredits.toLocaleString()}</span>
              </p>
              <p className="flex items-center justify-between gap-8">
                <span className="text-[#4a4a4a] font-semibold">Remaining</span>
                <span className="font-bold text-[#10b981]">{user.tokenBalance.toLocaleString()}</span>
              </p>
            </div>
          </div>
          <div className="mt-4 h-4 border-3 border-primary bg-[#faf7f2] overflow-hidden shadow-[1px_1px_0px_0px_#1a1a1a]">
            <div
              className="h-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          <p className="mt-2 text-right text-xs font-mono font-semibold text-[#4a4a4a]">
            {user.tokenBalance.toLocaleString()} tokens left
          </p>
        </article>

        {/* Payment Method Card */}
        <article className="bg-white border-4 border-primary p-4 md:p-6 shadow-[4px_4px_0px_0px_#1a1a1a] relative min-w-0 flex flex-col justify-between">
          <div className="absolute -top-4 -left-4 bg-[#ffcc00] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase text-primary">
            Payment Method
          </div>
          <div>
            <p className="mt-4 text-sm text-[#4a4a4a] font-body">
              Official channels for token purchase and checkout.
            </p>
            <div className="mt-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-3 border-primary bg-[#faf7f2] p-4 shadow-[3px_3px_0px_0px_#1a1a1a]">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center border-2 border-primary bg-[#e63b2e] text-xs font-headline font-black text-white shadow-[1px_1px_0px_0px_#1a1a1a] shrink-0">
                  KHQR
                </div>
                <div>
                  <p className="font-headline font-bold uppercase text-sm text-primary">
                    {paymentInfo.checkoutMode === "static_payway_qr" ? "ABA PayWay QR (Manual)" : "Bakong KHQR"}
                  </p>
                  <p className="text-xs text-[#4a4a4a] font-body mt-1">
                    {paymentInfo.checkoutMode === "static_payway_qr"
                      ? "Static merchant QR, receipt approval"
                      : "Local QR checkout from your KHQR account"}
                  </p>
                </div>
              </div>
              <span className="w-fit border-2 border-primary bg-[#10b981] px-3 py-1 text-[10px] font-headline font-bold uppercase text-primary shadow-[1px_1px_0px_0px_#1a1a1a]">
                {paymentInfo.autoVerificationEnabled ? "Auto check" : "Manual approval"}
              </span>
            </div>
          </div>
          {!paymentInfo.autoVerificationEnabled ? (
            <p className="mt-4 border-2 border-primary bg-[#ffcc00]/10 p-4 text-xs font-semibold leading-relaxed text-[#1a1a1a] font-body shadow-[2px_2px_0px_0px_#1a1a1a]">
              {paymentInfo.checkoutMode === "static_payway_qr"
                ? "Current mode: manual ABA PayWay QR. Customers enter the exact amount, upload the ABA receipt, and tokens are added after admin confirmation. PayWay API/webhook is not active yet."
                : "This site generates KHQR codes locally and does not need the PayWay QR API. Tokens are added after admin confirmation from the Telegram or bank payment notice."}
            </p>
          ) : null}
        </article>
      </div>

      <BillingClient
        plans={TOKEN_PACK_PLANS}
        initialOrders={orders}
        initialSupportTickets={supportTickets}
        paymentInfo={paymentInfo}
        currentBalance={user.tokenBalance}
        apiAccess={apiAccess}
      />
    </>
  );
}

function getLatestApprovedOrder(orders: PaymentOrderRecord[]): PaymentOrderRecord | null {
  return (
    orders
      .filter((order) => order.status === "approved")
      .sort((a, b) => paymentOrderTime(b) - paymentOrderTime(a))[0] ?? null
  );
}

function paymentOrderTime(order: PaymentOrderRecord): number {
  return new Date(order.approvedAt ?? order.paidAt ?? order.updatedAt ?? order.createdAt).getTime();
}

function BillingFallback() {
  return (
    <>
      <VoxLoader variant="panel" label="Loading billing..." />
      <div className="grid gap-6 xl:grid-cols-2">
        <article className="bg-white border-4 border-primary p-4 md:p-6 shadow-[4px_4px_0px_0px_#1a1a1a] relative min-w-0">
          <div className="absolute -top-4 -left-4 bg-[#ffcc00] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase text-primary">
            Current Plan
          </div>
          <div className="mt-4 flex items-center justify-between">
            <h2 className="text-3xl font-headline font-black uppercase text-primary">Free</h2>
            <span className="border-2 border-primary bg-[#f5f0e8] px-3 py-1 text-xs font-headline font-bold uppercase text-primary">
              Active
            </span>
          </div>
          <div className="mt-4 h-4 border-3 border-primary bg-[#faf7f2]" />
          <p className="mt-2 text-right text-xs font-mono font-semibold text-[#4a4a4a]">-- total</p>
        </article>

        <article className="bg-white border-4 border-primary p-4 md:p-6 shadow-[4px_4px_0px_0px_#1a1a1a] relative min-w-0">
          <div className="absolute -top-4 -left-4 bg-[#ffcc00] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase text-primary">
            Payment Method
          </div>
          <div className="mt-4 flex items-center justify-between border-3 border-primary bg-[#faf7f2] p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center border-2 border-primary bg-[#e63b2e] text-xs font-headline font-black text-white">
                KHQR
              </div>
              <div>
                <p className="font-headline font-bold uppercase text-sm text-primary">Bakong KHQR</p>
                <p className="text-xs text-[#4a4a4a] font-body mt-1">Local QR checkout from your KHQR account</p>
              </div>
            </div>
            <span className="border-2 border-primary bg-[#10b981] px-3 py-1 text-[10px] font-headline font-bold uppercase text-primary">
              Active
            </span>
          </div>
        </article>
      </div>
    </>
  );
}
