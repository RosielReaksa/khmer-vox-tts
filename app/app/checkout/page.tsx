import { redirect } from "next/navigation";
import { Suspense } from "react";

import { CheckoutClient } from "@/app/app/checkout/checkout-client";
import { CheckoutUserProvider } from "@/app/app/checkout/checkout-user-provider";
import { VoxLoader } from "@/app/components/vox-loader";
import { getCurrentUser } from "@/lib/current-user";
import { isKhqrccConfigured, khqrccAccountLabel } from "@/lib/khqrcc";

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

  const checkoutMode = "khqrcc_qr" as const;

  const paymentInfo = {
    khqrName: "Automatic ABA QR",
    khqrAccount: khqrccAccountLabel(),
    telegramHandle: process.env.TELEGRAM_ADMIN_HANDLE?.trim() || "https://t.me/OfficalVoxTTS",
    staticQrImageUrl: "",
    autoVerificationEnabled: isKhqrccConfigured(),
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
