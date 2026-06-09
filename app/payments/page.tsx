import Image from "next/image";
import Link from "next/link";
import { PublicHeader } from "@/app/components/public-header";

const steps = [
  {
    title: "Choose a token pack",
    body: "Users select Starter or Creator, choose quantity, and the site calculates total price and token amount.",
  },
  {
    title: "Scan the ABA PayWay QR",
    body: "The checkout displays the merchant QR, exact amount, and order ID. Users pay from ABA Mobile or another KHQR-supported app.",
  },
  {
    title: "Upload receipt",
    body: "Users upload the ABA receipt from phone or computer. The order stays pending until admin review.",
  },
  {
    title: "Admin approves",
    body: "Admin checks user email, plan, quantity, amount, receipt, and bank notice. Tokens are credited only once.",
  },
];

const safetyRows = [
  ["Duplicate protection", "Approved orders cannot be credited again."],
  ["Order status", "Pending, reported, approved, rejected, expired, and cancelled states are tracked."],
  ["Admin audit", "Payment orders store approved time, admin note, receipt proof, and token transaction."],
  ["Support fallback", "Users can open a support ticket and contact Telegram if receipt approval is delayed."],
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
                ABA PayWay QR checkout for prepaid TTS tokens
              </h1>
              <p className="mt-4 font-body text-sm leading-relaxed text-on-surface-variant max-w-2xl border-l-4 border-outline pl-4">
                VoxTTS Online currently uses manual ABA PayWay QR checkout while production
                API credentials are under review. Users pay the exact order amount, upload
                receipt proof, then admin approves and the system credits tokens.
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
              <div className="border-2 border-outline bg-white p-4">
                <Image
                  src="/payway-static-qr-code.png"
                  width={290}
                  height={290}
                  alt="ABA PayWay QR code"
                  className="mx-auto h-auto w-full max-w-[290px]"
                  priority
                />
              </div>
              <p className="mt-3 text-center text-[10px] font-bold text-on-surface-variant font-body">
                Production review QR. Users must enter the exact order amount shown in checkout.
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
            <h2 className="text-2xl font-headline font-black uppercase text-primary border-b-2 border-outline pb-2 mb-3">Current manual mode</h2>
            <p className="text-sm font-body text-on-surface-variant leading-relaxed">
              Manual mode is intentionally simple for review and early customers. It prevents
              fake billing by requiring receipt upload and admin confirmation before tokens are
              added.
            </p>
            <div className="mt-5 border-2 border-outline bg-[#ffdad6] p-4 text-xs font-bold text-[#93000a] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
              PayWay API and webhook automation are not active yet. They will be enabled after
              ABA PayWay provides production merchant credentials.
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-headline font-black uppercase text-primary border-b-2 border-outline pb-2 mb-3">Production PayWay plan</h2>
            <p className="text-sm font-body text-on-surface-variant leading-relaxed mb-4">
              When credentials are approved, checkout can create dynamic PayWay QR orders and
              credit users automatically after a signed webhook or verified transaction result.
            </p>
            <div className="grid gap-2 text-xs font-medium">
              <InfoRow label="Callback endpoint" value="/api/webhooks/payway" />
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
