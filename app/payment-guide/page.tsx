import Image from "next/image";
import Link from "next/link";
import { PublicHeader } from "@/app/components/public-header";

import { staticPaywayQrImageUrl } from "@/lib/static-payway";

const steps = [
  {
    title: "Choose token pack",
    body: "Open Billing or Checkout, choose Starter or Creator, and confirm the total amount before paying.",
  },
  {
    title: "Scan ABA/KHQR",
    body: "Use ABA Mobile or any KHQR-supported bank app. If the page shows a static PayWay QR, enter the exact amount manually.",
  },
  {
    title: "Upload receipt",
    body: "Click I Paid and upload the ABA receipt screenshot. The order remains pending while admin checks the payment notice.",
  },
  {
    title: "Tokens credited",
    body: "After approval, tokens are added once and API keys can use the paid balance.",
  },
];

const statusRows = [
  ["pending", "Order created. Pay and upload receipt, or wait for admin verification."],
  ["approved", "Payment matched. Tokens have been credited."],
  ["rejected", "Admin could not verify the payment, amount, or receipt."],
  ["expired", "The QR/order expired. Create a new order before paying."],
  ["cancelled", "Customer cancelled before payment approval. No tokens were credited."],
];

export default function PaymentGuidePage() {
  return (
    <div className="min-h-screen bg-background text-primary font-body flex flex-col">
      <PublicHeader />

      <main className="mx-auto w-full max-w-6xl px-5 py-10 lg:px-8 text-left">
        <section className="mx-auto grid max-w-5xl gap-6">
          <article className="border-4 border-outline bg-white p-6 lg:grid-cols-[1fr_320px] lg:p-8 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] grid gap-6 relative">
            <div className="absolute -top-4 -right-4 w-8 h-8 bg-[#ffcc00] border-4 border-outline"></div>
            <div>
              <div className="flex gap-2 text-xs font-headline font-bold uppercase mb-4">
                <Link href="/" className="text-tertiary hover:underline">
                  Back to home
                </Link>
                <span className="text-on-surface-variant">/</span>
                <Link href="/app/dashboard" className="text-tertiary hover:underline">
                  Back to dashboard
                </Link>
              </div>
              <h1 className="text-4xl font-headline font-black uppercase tracking-tighter text-primary lg:text-6xl leading-none">
                How to pay with ABA KHQR
              </h1>
              <p className="mt-4 font-body text-sm leading-relaxed text-on-surface-variant max-w-2xl border-l-4 border-outline pl-4">
                Khmer Vox TTS uses manual ABA/KHQR receipt approval while PayWay API onboarding is delayed.
                This lets customers buy prepaid TTS tokens without waiting for Visa/Mastercard checkout.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/app/checkout"
                  className="px-5 py-2.5 bg-[#ffcc00] text-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-[#e6b800] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  Open Checkout
                </Link>
                <Link
                  href="/refund-policy"
                  className="px-5 py-2.5 bg-white text-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-surface-variant transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  Refund Policy
                </Link>
              </div>
            </div>
            <div className="border-4 border-outline bg-[#faf7f2] p-4 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] self-center">
              <div className="border-2 border-outline bg-white p-3">
                <Image
                  src={staticPaywayQrImageUrl()}
                  width={290}
                  height={290}
                  alt="ABA PayWay QR code"
                  className="mx-auto h-auto w-full max-w-[290px]"
                  priority
                />
              </div>
              <p className="mt-3 text-center text-[10px] font-bold text-on-surface-variant font-body leading-relaxed">
                If static QR mode is active, enter the exact amount shown in checkout.
              </p>
            </div>
          </article>

          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <article key={step.title} className="border-4 border-outline bg-white p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
                <span className="grid h-8 w-8 place-items-center border-2 border-outline bg-[#ffcc00] text-xs font-headline font-black text-primary">
                  {index + 1}
                </span>
                <h2 className="mt-4 text-sm font-headline font-black uppercase text-primary border-b border-outline pb-1 mb-2">{step.title}</h2>
                <p className="text-xs font-body text-on-surface-variant leading-relaxed">{step.body}</p>
              </article>
            ))}
          </section>

          <section className="border-4 border-outline bg-white p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
            <h2 className="text-2xl font-headline font-black uppercase text-primary border-b-2 border-outline pb-2 mb-4">Order Status Meaning</h2>
            <div className="overflow-hidden border-4 border-outline bg-white shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
              <table className="w-full text-sm">
                <tbody className="font-body text-xs font-medium">
                  {statusRows.map(([status, meaning]) => (
                    <tr key={status} className="border-t-2 border-outline first:border-t-0">
                      <td className="w-36 px-4 py-3 font-mono font-bold text-tertiary border-r-2 border-outline">{status}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="border-4 border-outline bg-[#ffdad6] p-6 text-xs font-bold text-[#93000a] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
            <h2 className="text-lg font-headline font-black uppercase text-[#93000a] mb-2">Important</h2>
            <p className="font-body leading-relaxed">
              Do not cancel an order after paying. If you already paid, upload the receipt and contact support
              with the order ID. Approved orders are credited once; duplicate receipts do not create extra tokens.
            </p>
          </section>
        </section>
      </main>
    </div>
  );
}

