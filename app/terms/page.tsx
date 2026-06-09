import Link from "next/link";

const sections = [
  {
    title: "Acceptable Use",
    body: "Use Khmer Vox TTS only for content you have the right to create. Do not use the service for fraud, impersonation, harassment, scams, illegal content, or content that violates another person's rights.",
  },
  {
    title: "Voice Clone Consent",
    body: "You must own or have clear permission to use any voice sample you upload. Voice cloning must not be used to deceive people, impersonate someone, or hide the identity of a speaker without consent.",
  },
  {
    title: "API Keys",
    body: "You are responsible for keeping your API keys private. Requests made with your API key consume your tokens. Revoke keys immediately if you believe they are exposed.",
  },
  {
    title: "Tokens and Billing",
    body: "Tokens are prepaid usage credits for speech generation. Normal speech and clone voice may charge at different rates. KHQR orders are credited after payment confirmation or admin review.",
  },
  {
    title: "Cancellation and Refunds",
    body: "Pending unpaid orders can be cancelled before approval. After tokens are credited, refunds are reviewed case by case. Failed generations are designed to refund charged tokens when no audio is produced. See the cancellation and refund policy for duplicate payment, wrong amount, uncredited payment, and technical failure cases.",
  },
  {
    title: "Service Availability",
    body: "The service depends on GPU workers and upstream model infrastructure. Requests can fail, be rate limited, or be delayed during high load. Failed generations are designed to refund charged tokens when the worker does not produce audio.",
  },
  {
    title: "Account Enforcement",
    body: "Accounts may be suspended when payment abuse, API abuse, clone-voice misuse, or security risk is detected. Suspended accounts cannot generate audio, create API keys, buy packs, or call public API endpoints.",
  },
];

export default function TermsPage() {
  return (
    <PolicyPage
      title="Terms of Service"
      intro="Rules for using Khmer Vox TTS, API keys, token packs, and session clone voice."
      sections={sections}
    />
  );
}

function PolicyPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: string;
  sections: Array<{ title: string; body: string }>;
}) {
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
            href="/app/signup"
            className="px-4 py-2 border-2 border-outline bg-[#ffcc00] text-primary font-headline font-bold uppercase text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#e6b800] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            Start Free
          </Link>
        </div>
        <h1 className="text-4xl font-headline font-black uppercase tracking-tighter text-primary lg:text-5xl mb-2">{title}</h1>
        <p className="text-sm font-body font-medium text-on-surface-variant max-w-2xl leading-relaxed mb-1 border-l-4 border-outline pl-4">
          {intro}
        </p>
        <p className="text-[10px] font-mono font-bold text-on-surface-variant mb-4">Last updated: May 30, 2026</p>

        <div className="flex flex-wrap gap-3 mb-8">
          <Link
            href="/refund-policy"
            className="px-4 py-2 border-2 border-outline bg-white text-primary font-headline font-bold uppercase text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#eee9e0] transition-colors"
          >
            Refund Policy
          </Link>
          <Link
            href="/payment-guide"
            className="px-4 py-2 border-2 border-outline bg-white text-primary font-headline font-bold uppercase text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#eee9e0] transition-colors"
          >
            Payment Guide
          </Link>
        </div>

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
