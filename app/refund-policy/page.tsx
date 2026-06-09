import Link from "next/link";

const refundApproved = [
  "Duplicate payment for the same order.",
  "Wrong payment amount where the order cannot be fulfilled.",
  "Successful payment that was not credited after admin verification.",
  "Platform-side technical failure before meaningful token use.",
  "Failed audio generation where tokens were charged but no audio output was produced.",
];

const refundNotApproved = [
  "Tokens already consumed by successful audio generation.",
  "Customer mistake after meaningful use of the token pack.",
  "Fraud, payment abuse, API abuse, or voice-clone misuse.",
  "Customer network issues, integration errors, or leaked API keys.",
];

export default function RefundPolicyPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-primary font-body flex justify-center items-start">
      <article className="w-full max-w-5xl border-4 border-outline bg-white p-6 lg:p-8 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] relative text-left">
        <div className="absolute -top-4 -right-4 w-8 h-8 bg-[#ffcc00] border-4 border-outline"></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-outline pb-4 mb-6">
          <Link
            href="/"
            className="px-4 py-2 border-2 border-outline bg-white text-primary font-headline font-bold uppercase text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#eee9e0] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            Back to home
          </Link>
          <Link
            href="/payment-guide"
            className="px-4 py-2 border-2 border-outline bg-[#ffcc00] text-primary font-headline font-bold uppercase text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#e6b800] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            Payment Guide
          </Link>
        </div>

        <div className="inline-block bg-[#ffcc00] border-2 border-outline px-3 py-1 font-headline font-bold uppercase tracking-tight text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] mb-4">
          Cancellation and refund policy
        </div>
        <h1 className="text-4xl font-headline font-black uppercase tracking-tighter text-primary lg:text-6xl leading-none mb-4">
          Prepaid token orders and failed generation refunds
        </h1>
        <p className="font-body text-sm leading-relaxed text-on-surface-variant max-w-3xl border-l-4 border-outline pl-4 mb-6">
          Khmer Vox TTS sells prepaid digital token packs for Khmer speech generation. Orders can be
          cancelled before payment approval. After tokens are credited, refund requests are reviewed
          case by case because the service is digital and usage can begin immediately.
        </p>

        <section className="grid gap-6 lg:grid-cols-2 mb-8">
          <PolicyPanel title="Refunds may be approved" items={refundApproved} tone="good" />
          <PolicyPanel title="Refunds are normally not approved" items={refundNotApproved} tone="risk" />
        </section>

        <section className="border-4 border-outline bg-[#eee9e0] p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] mb-6">
          <h2 className="text-2xl font-headline font-black uppercase text-primary border-b-2 border-outline pb-2 mb-4">Cancellation Rules</h2>
          <p className="text-xs font-body text-on-surface-variant leading-relaxed mb-3">
            A customer may cancel an unpaid pending order from the billing page. If the customer already
            paid, they should not cancel. They should upload the ABA receipt and contact support with the
            order ID so admin can match the payment.
          </p>
          <p className="text-xs font-body text-on-surface-variant leading-relaxed">
            Approved orders are credited once. Duplicate receipt submissions, fake receipts, and mismatched
            payment amounts may be rejected.
          </p>
        </section>

        <section className="border-4 border-outline bg-white p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] mb-8">
          <h2 className="text-2xl font-headline font-black uppercase text-primary border-b-2 border-outline pb-2 mb-4">How to Request Review</h2>
          <ol className="grid gap-3 text-xs font-body font-bold text-on-surface-variant list-decimal pl-5">
            <li>Contact support within 7 calendar days from payment date.</li>
            <li>Include account email, order ID, payment amount, payment date, and ABA receipt.</li>
            <li>Admin checks the order, bank notice, usage history, and token transaction.</li>
            <li>Approved refunds are handled through the original payment channel where possible.</li>
          </ol>
        </section>

        <p className="text-[10px] font-mono font-bold text-on-surface-variant">Last updated: June 2, 2026</p>
      </article>
    </main>
  );
}

function PolicyPanel({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "good" | "risk";
}) {
  const panelClass = tone === "good" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-red-200 bg-red-50 text-red-950";
  return (
    <section className={`border-4 border-outline p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] ${panelClass}`}>
      <h2 className="text-sm font-headline font-black uppercase border-b-2 border-outline pb-1.5 mb-3">{title}</h2>
      <ul className="grid gap-2 text-xs font-body leading-relaxed list-disc pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
