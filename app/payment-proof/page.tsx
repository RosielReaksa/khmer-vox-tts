import { PaymentProofClient } from "@/app/payment-proof/payment-proof-client";
import { verifyPaymentProofToken } from "@/lib/payment-proof-token";
import { listUserPaymentOrders } from "@/lib/store";

export default async function PaymentProofPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token ?? "";
  const tokenPayload = token ? await verifyPaymentProofToken(token) : null;
  const orders = tokenPayload ? await listUserPaymentOrders(tokenPayload.userId) : [];
  const order = tokenPayload ? orders.find((item) => item.id === tokenPayload.orderId) ?? null : null;

  if (!tokenPayload || !order) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f7f5] px-4 py-8">
        <section className="max-w-lg rounded-3xl border border-[#dce3df] bg-white p-6 text-center shadow-sm">
          <h1 className="text-3xl font-semibold text-[#151922]">Payment link unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-[#5d6675]">
            This upload link is invalid or expired. Return to Billing and generate a new phone upload QR.
          </p>
        </section>
      </main>
    );
  }

  return <PaymentProofClient token={token} order={order} />;
}

