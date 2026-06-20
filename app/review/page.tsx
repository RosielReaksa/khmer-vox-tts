import Link from "next/link";
import { PublicHeader } from "@/app/components/public-header";

const businessRows = [
  ["Service name", "VoxTTS Online / Khmer Vox TTS"],
  ["Website", "https://voxtts.online and https://voxtts-online.vercel.app"],
  ["Business model", "Prepaid token packs for Khmer text-to-speech API usage."],
  ["Customers", "Developers, creators, dubbing tools, automation builders, and Khmer content teams."],
  ["Support", "Telegram @OfficalVoxTTS and in-dashboard support tickets."],
];

const productFlow = [
  "User signs up and receives free trial tokens.",
  "User buys a prepaid token pack from Billing.",
  "User generates Khmer speech from dashboard or API.",
  "System deducts credits based on generated audio seconds.",
  "User can download audio, batch ZIP output, or call the API from another app.",
];

const paymentChecklist: Array<[string, string]> = [
  ["Plans visible", "Free, Creator, Pro, and Business plans are shown with can-use and not-included details."],
  ["Free limits", "Free users can test the dashboard with trial tokens but cannot create or use public API keys."],
  ["Business limits", "Business is contact-first, admin-approved, and used for high-volume clone/batch/webhook API access."],
  ["KHQRcc ABA Pay", "Checkout creates exact-amount KHQRcc ABA Pay QR orders."],
  ["No receipt upload", "New orders are verified by KHQRcc webhook or server-side transaction check."],
  ["Automatic approval", "The app credits the account only after amount, status, and duplicate checks pass."],
  ["Double credit guard", "Approved orders cannot be credited twice."],
  ["Webhook ready", "KHQRcc callback endpoint is /api/webhooks/khqrcc."],
];

const apiChecklist: Array<[string, string]> = [
  ["API keys", "Paid users can create and revoke API keys from dashboard. Free users cannot create or use API keys."],
  ["Speech endpoint", "POST /api/v1/audio/speech returns WAV audio."],
  ["Clone endpoint", "POST /api/v1/audio/clone supports session reference audio."],
  ["Batch jobs", "Batch endpoints queue multiple text lines and return downloadable ZIP output."],
  ["Usage logs", "Dashboard shows request history, duration, credits, and downloads."],
];

export default function ReviewPage() {
  return (
    <div className="min-h-screen bg-background text-primary font-body flex flex-col">
      <PublicHeader />

      <main className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-10 lg:px-8 text-left">
        <section className="border-4 border-outline bg-white p-6 lg:p-10 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] relative">
          <div className="absolute -top-4 -right-4 w-8 h-8 bg-[#ffcc00] border-4 border-outline"></div>
          <div className="inline-block bg-[#ffcc00] border-2 border-outline px-3 py-1 font-headline font-bold uppercase tracking-tight text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] mb-4">
            Merchant review
          </div>
          <h1 className="text-4xl font-headline font-black uppercase tracking-tighter text-primary lg:text-6xl leading-none">
            VoxTTS Online business and payment review page
          </h1>
          <p className="mt-4 font-body text-sm leading-relaxed text-on-surface-variant max-w-2xl border-l-4 border-outline pl-4">
            This page summarizes the service, customer flow, payment handling, API usage,
            and KHQRcc ABA Pay handling for bank or payment gateway review.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/payments"
              className="px-5 py-2.5 bg-[#0055ff] text-white border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-primary transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              Payment flow
            </Link>
            <Link
              href="/docs"
              className="px-5 py-2.5 bg-white text-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-surface-variant transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              API docs
            </Link>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <article className="border-4 border-outline bg-white p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
            <h2 className="text-2xl font-headline font-black uppercase text-primary border-b-2 border-outline pb-2 mb-4">Business information</h2>
            <div className="grid gap-2 text-xs">
              {businessRows.map(([label, value]) => (
                <InfoRow key={label} label={label} value={value} />
              ))}
            </div>
          </article>

          <article className="border-4 border-outline bg-white p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
            <h2 className="text-2xl font-headline font-black uppercase text-primary border-b-2 border-outline pb-2 mb-4">Product flow</h2>
            <ol className="grid gap-3 text-xs">
              {productFlow.map((item, index) => (
                <li key={item} className="flex gap-3 border-2 border-outline bg-[#eee9e0] px-4 py-3 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] font-body font-bold text-primary">
                  <span className="grid h-6 w-6 shrink-0 place-items-center border-2 border-outline bg-[#ffcc00] text-[10px] font-headline font-black text-primary">
                    {index + 1}
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <ChecklistCard title="Payment readiness" rows={paymentChecklist} />
          <ChecklistCard title="API readiness" rows={apiChecklist} />
        </section>

        <section className="border-4 border-outline bg-white p-6 lg:p-8 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
          <h2 className="text-2xl font-headline font-black uppercase text-primary border-b-2 border-outline pb-2 mb-4">Current production payment mode</h2>
          <div className="grid gap-4 leading-relaxed text-sm lg:grid-cols-2">
            <div className="border-2 border-outline bg-[#eee9e0] p-4 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
              <h3 className="font-headline font-black uppercase text-xs text-primary border-b border-outline pb-1 mb-2">Current mode</h3>
              <p className="text-xs font-body text-on-surface-variant leading-relaxed">
                KHQRcc ABA Pay QR checkout creates exact-amount orders and supports signed
                callback verification.
              </p>
            </div>
            <div className="border-2 border-outline bg-[#eee9e0] p-4 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
              <h3 className="font-headline font-black uppercase text-xs text-primary border-b border-outline pb-1 mb-2">Verification mode</h3>
              <p className="text-xs font-body text-on-surface-variant leading-relaxed">
                Signed KHQRcc callback plus server-side transaction check, automatic credit,
                and duplicate transaction protection.
              </p>
            </div>
          </div>
        </section>

        <section className="border-4 border-outline bg-[#1a1a1a] p-6 text-white lg:p-8 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
          <h2 className="text-2xl font-headline font-black uppercase text-[#ffcc00] border-b-2 border-outline pb-2 mb-4">Reviewer quick links</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <QuickLink href="/" title="Public home" body="Service overview, pricing, and product summary." />
            <QuickLink href="/payments" title="Payment flow" body="KHQRcc checkout and verification flow." />
            <QuickLink href="/docs" title="API docs" body="Speech, clone, batch, token, and webhook endpoints." />
          </div>
        </section>
      </main>
    </div>
  );
}


function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="grid gap-1 border-2 border-outline bg-[#eee9e0] px-4 py-3 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
      <span className="text-[10px] font-headline font-black uppercase tracking-wider text-[#4a4a4a] border-b border-outline pb-1 mb-1">{label}</span>
      <span className="font-body font-bold text-primary truncate">{value}</span>
    </p>
  );
}

function ChecklistCard({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <article className="border-4 border-outline bg-white p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
      <h2 className="text-2xl font-headline font-black uppercase text-primary border-b-2 border-outline pb-2 mb-4">{title}</h2>
      <div className="grid gap-4">
        {rows.map(([label, value]) => (
          <div key={label} className="border-2 border-outline bg-[#eee9e0] p-4 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
            <p className="font-headline font-black uppercase text-xs text-primary border-b border-outline pb-1.5 mb-2">{label}</p>
            <p className="text-xs font-body text-on-surface-variant leading-relaxed">{value}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function QuickLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="block border-2 border-outline bg-[#2d2d2d] p-4 hover:bg-[#ffcc00] hover:text-primary transition-all shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] text-[#faf7f2] group">
      <h3 className="font-headline font-black uppercase text-sm group-hover:text-primary text-[#ffcc00]">{title}</h3>
      <p className="mt-2 text-xs font-body text-[#e8e3da] group-hover:text-primary leading-relaxed">{body}</p>
    </Link>
  );
}
