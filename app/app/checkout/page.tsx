import { redirect } from "next/navigation";
import { Suspense } from "react";

import { CheckoutClient } from "@/app/app/checkout/checkout-client";
import { CheckoutUserProvider } from "@/app/app/checkout/checkout-user-provider";
import { VoxLoader } from "@/app/components/vox-loader";
import { isBakongVerificationConfigured } from "@/lib/bakong";
import { getCurrentUser } from "@/lib/current-user";
import { isPaywayQrEnabled } from "@/lib/payway";
import { isStaticPaywayQrEnabled, staticPaywayQrAccountLabel, staticPaywayQrImageUrl } from "@/lib/static-payway";

export default function CheckoutPage() {
  return (
    <Suspense fallback={<VoxLoader variant="panel" label="Loading checkout..." />}>
      <CheckoutData />
    </Suspense>
  );
}

async function CheckoutData() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/app/signin");
  }

  const checkoutMode: "local_khqr" | "payway_qr" | "static_payway_qr" = isStaticPaywayQrEnabled()
    ? "static_payway_qr"
    : isPaywayQrEnabled()
      ? "payway_qr"
      : "local_khqr";

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
  };

  return (
    <CheckoutUserProvider
      email={user.email}
      tokenBalance={user.tokenBalance}
      suspendedAt={user.suspendedAt}
      suspendedReason={user.suspendedReason}
    >
      <CheckoutClient
        userEmail={user.email}
        tokenBalance={user.tokenBalance}
        suspendedAt={user.suspendedAt}
        suspendedReason={user.suspendedReason}
        paymentInfo={paymentInfo}
      />
    </CheckoutUserProvider>
  );
}
