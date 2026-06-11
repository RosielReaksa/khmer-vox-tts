import Link from "next/link";
import { PublicHeader } from "@/app/components/public-header";

const steps = [
  {
    title: "Choose a token pack",
    body: "Users select Creator, Pro, or a paid token pack, choose quantity, and the site calculates total price and credit amount.",
  },
  {
    title: "Scan the KHQRcc ABA Pay QR",
    body: "The checkout creates a fresh QR for the exact order amount. Users pay from ABA Mobile or another KHQR-supported app.",
  },
  {
    title: "Automatic verification",
    body: "KHQRcc confirms the transaction by webhook or server check. No receipt upload is needed for new orders.",
  },
  {
    title: "Credits added",
    body: "The system validates order ID, amount, currency, status, and duplicate protection before crediting the account once.",
  },
];

const safetyRows = [
  ["Duplicate protection", "Approved orders cannot be credited again."],
  ["Order status", "Pending, reported, approved, rejected, expired, and cancelled states are tracked."],
  ["Admin audit", "Payment orders store approved time, provider response, webhook audit, and credit transaction."],
  ["Support fallback", "Users can open a support ticket and contact Telegram if payment confirmation is delayed."],
];

export default function PaymentsPage() {
  return (
    <div className="min-h-screen bg-background text-primary font-body flex flex-col">
      <PublicHeader />

      <main className="mx-auto w-full max-w-6xl gap-8 px-5 py-10 lg:px-8 text-left">
        <section className="border-4 border-outline bg-white p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] lg:p-10 relative">
          <div className="absolute -top-4 -right-4 w-8 h-8 bg-[#ffcc00] border-4 border-outline"></div>
          <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-center">
            <div>
              <div className="inline-block bg-[#ffcc00] border-2 border-outline px-3 py-1 font-headline font-bold uppercase tracking-tight text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] mb-4">
                Payment flow
              </div>
              <h1 className="text-4xl font-headline font-black uppercase tracking-tighter text-primary lg:text-6xl leading-none">
                KHQRcc ABA Pay checkout for prepaid TTS credits
              </h1>
              <p className="mt-4 font-body text-sm leading-relaxed text-on-surface-variant max-w-2xl border-l-4 border-outline pl-4">
                VoxTTS Online now uses KHQRcc ABA Pay QR checkout. Users pay the exact
                order amount, and the system verifies KHQRcc confirmation before adding
                credits automatically.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/app/signup"
                  className="px-5 py-2.5 bg-[#ffcc00] text-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-[#e6b800] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  Create account
                </Link>
                <Link
                  href="/review"
                  className="px-5 py-2.5 bg-white text-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-surface-variant transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  Review checklist
                </Link>
                <Link
                  href="/payment-guide"
                  className="px-5 py-2.5 bg-white text-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-surface-variant transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  Payment guide
                </Link>
              </div>
            </div>

            <div className="border-4 border-outline bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
              <div className="grid aspect-square place-items-center border-2 border-outline bg-white p-4 text-center">
                <div>
                  <span className="material-symbols-outlined text-6xl text-primary">qr_code_2</span>
                  <p className="mt-3 font-headline text-xl font-black uppercase text-primary">Dynamic QR</p>
                  <p className="mt-2 text-xs font-bold text-on-surface-variant">Generated per order by KHQRcc</p>
                </div>
              </div>
              <p className="mt-3 text-center text-[10px] font-bold text-on-surface-variant font-body">
                Each checkout receives a new exact-amount ABA Pay QR.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-12 grid gap-4 lg:grid-cols-4">
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

        <section className="mt-12 grid gap-6 border-4 border-outline bg-white p-6 lg:grid-cols-2 lg:p-8 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
          <div>
            <h2 className="text-2xl font-headline font-black uppercase text-primary border-b-2 border-outline pb-2 mb-3">Current KHQRcc mode</h2>
            <p className="text-sm font-body text-on-surface-variant leading-relaxed">
              KHQRcc creates a payment QR for the exact order amount and verifies the
              transaction before credits are added. Old receipt-based orders remain visible
              only for history and support.
            </p>
            <div className="mt-5 border-2 border-outline bg-[#def3e5] p-4 text-xs font-bold text-[#0d5f2e] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
              No receipt upload is required for new KHQRcc orders. The app verifies payment
              status server-side before crediting an account.
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-headline font-black uppercase text-primary border-b-2 border-outline pb-2 mb-3">Webhook verification</h2>
            <p className="text-sm font-body text-on-surface-variant leading-relaxed mb-4">
              KHQRcc sends a signed callback and the app can also poll KHQRcc verification
              before approving an order.
            </p>
            <div className="grid gap-2 text-xs font-medium">
              <InfoRow label="Callback endpoint" value="/api/webhooks/khqrcc" />
              <InfoRow label="Verification" value="signature, amount, currency, order status" />
              <InfoRow label="Duplicate handling" value="provider transaction ID and order state" />
            </div>
          </div>
        </section>

        <section className="mt-12 border-4 border-outline bg-white p-6 lg:p-8 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
          <h2 className="text-2xl font-headline font-black uppercase text-primary border-b-2 border-outline pb-2 mb-4">Payment safety controls</h2>
          <div className="overflow-hidden border-4 border-outline bg-white shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
            <table className="w-full text-sm">
              <tbody className="font-body text-xs font-medium">
                {safetyRows.map(([label, value]) => (
                  <tr key={label} className="border-t-2 border-outline first:border-t-0">
                    <td className="w-56 px-4 py-3 font-bold border-r-2 border-outline text-primary">{label}</td>
                    <td className="px-4 py-3 text-on-surface-variant">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}


function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex gap-4 border-2 border-outline bg-[#eee9e0] px-4 py-3 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
      <span className="w-40 shrink-0 font-headline font-bold uppercase text-xs text-primary">{label}</span>
      <span className="text-xs font-body font-medium text-on-surface-variant">{value}</span>
    </p>
  );
}
