import Link from "next/link";

const sections = [
  {
    title: "Account Data",
    body: "We store account email, password hash, token balance records, API key metadata, payment orders, and generation history so users can manage billing and usage.",
  },
  {
    title: "Generation Data",
    body: "We store generation metadata such as time, mode, status, input length, short input preview, credits charged, and latency. This helps users audit token usage and helps admins debug failures.",
  },
  {
    title: "Voice Samples",
    body: "Session clone voice samples are used to generate the requested audio for that request or batch. They are not intended to become permanent public voice profiles.",
  },
  {
    title: "Payments",
    body: "KHQR payment data may include order IDs, payment status, transaction references, amount, currency, optional webhook payloads, and admin notes. This data protects token balances from fake or duplicate payments.",
  },
  {
    title: "API Security",
    body: "Raw API keys are shown once when created. The platform stores hashed keys and metadata such as prefix, creation time, last usage time, and revoke state.",
  },
  {
    title: "Admin Access",
    body: "Admins can inspect customers, payment orders, webhook events, API usage, and account status for support, fraud prevention, and operational safety.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-primary font-body flex justify-center items-start">
      <article className="w-full max-w-4xl border-4 border-outline bg-white p-6 lg:p-8 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] relative text-left">
        <div className="absolute -top-4 -right-4 w-8 h-8 bg-[#ffcc00] border-4 border-outline"></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-outline pb-4 mb-6">
          <Link
            href="/"
            className="px-4 py-2 border-2 border-outline bg-white text-primary font-headline font-bold uppercase text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#eee9e0] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            Back to home
          </Link>
          <Link
            href="/docs"
            className="px-4 py-2 border-2 border-outline bg-[#ffcc00] text-primary font-headline font-bold uppercase text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#e6b800] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            API Docs
          </Link>
        </div>
        <h1 className="text-4xl font-headline font-black uppercase tracking-tighter text-primary lg:text-5xl mb-2">Privacy Policy</h1>
        <p className="text-sm font-body font-medium text-on-surface-variant max-w-2xl leading-relaxed mb-1 border-l-4 border-outline pl-4">
          This page explains what Khmer Vox TTS stores for accounts, payments, API usage, and
          session clone voice generation.
        </p>
        <p className="text-[10px] font-mono font-bold text-on-surface-variant mb-8">Last updated: May 30, 2026</p>
        
        <div className="grid gap-6">
          {sections.map((section) => (
            <section key={section.title} className="border-2 border-outline bg-[#eee9e0] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
              <h2 className="text-sm font-headline font-black uppercase text-primary border-b border-outline pb-1.5 mb-2">{section.title}</h2>
              <p className="text-xs font-body text-on-surface-variant leading-relaxed">{section.body}</p>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
