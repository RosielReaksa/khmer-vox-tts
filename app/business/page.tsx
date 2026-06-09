import Link from "next/link";
import { PublicHeader } from "@/app/components/public-header";

export const metadata = {
  title: "Business API | Khmer Vox TTS",
  description: "High-volume Khmer clone voice and batch text-to-speech API for business customers.",
};

const businessFeatures = [
  {
    title: "Clone voice for production",
    body: "Business workloads use reference audio for speaker consistency. Normal random-speaker TTS is only for quick tests.",
  },
  {
    title: "Async batch jobs",
    body: "Submit many lines, track queued/running/completed status, and download results when worker processing finishes.",
  },
  {
    title: "Business token rate",
    body: "Business clone rate is only for approved Business plan accounts. It starts at 1.5 tokens per generated audio second, and high-volume prepaid accounts can request 1 token per audio second.",
  },
  {
    title: "Webhook callbacks",
    body: "Send completed or failed job events back to your customer system, dubbing tool, or internal backend.",
  },
  {
    title: "Per-key controls",
    body: "Admin can set daily/monthly token limits, max concurrent requests, running jobs, and queued jobs per API key.",
  },
];

const readinessItems = [
  "Paid API access and active token balance",
  "Production API key created from dashboard",
  "Business request approved by admin",
  "Webhook URL tested with sample callback",
  "One clone batch tested before real customer traffic",
  "Clear support contact for payment and API issues",
];

const apiSteps = [
  {
    title: "1. Submit business request",
    body: "Tell us monthly token volume, peak concurrency, app name, webhook URL, and support contact.",
  },
  {
    title: "2. Admin applies limits",
    body: "Your API keys receive safe token, concurrency, queue, and clone-rate settings based on the approved request.",
  },
  {
    title: "3. Run clone batch jobs",
    body: "Use reference audio for the speaker, send text lines, and track the async job until completion.",
  },
  {
    title: "4. Receive webhook callback",
    body: "Your backend receives completed or failed events, then pulls job audio or updates your customer workflow.",
  },
];

export default function BusinessPage() {
  return (
    <div className="min-h-screen bg-background text-primary font-body flex flex-col">
      <PublicHeader />

      <main className="mx-auto w-full max-w-6xl px-5 py-10 lg:px-8 text-left">
        <section className="border-4 border-outline bg-white p-6 lg:p-10 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] relative">
          <div className="absolute -top-4 -right-4 w-8 h-8 bg-[#ffcc00] border-4 border-outline"></div>
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="flex flex-col gap-4 items-start">
              <div className="inline-block bg-[#ffcc00] border-2 border-outline px-3 py-1 font-headline font-bold uppercase tracking-tight text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                Business API
              </div>
              <h1 className="text-4xl font-headline font-black uppercase tracking-tighter text-primary lg:text-6xl leading-none">
                Khmer clone voice API for production systems
              </h1>
              <p className="font-body text-sm leading-relaxed text-on-surface-variant max-w-xl border-l-4 border-outline pl-4">
                Build dubbing tools, narration systems, and customer workflows with async clone voice jobs,
                webhook callbacks, and admin-approved API limits.
              </p>
              <div className="flex flex-wrap gap-3 mt-2">
                <Link
                  href="/app/dashboard/business"
                  className="px-6 py-3 bg-primary text-on-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-[#0055ff] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  Open Business Setup
                </Link>
                <Link
                  href="/docs#batch"
                  className="px-6 py-3 bg-white text-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-surface-variant transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  Batch API Docs
                </Link>
              </div>
              <p className="font-mono text-[10px] font-bold text-on-surface-variant mt-2">
                Business users should use reference-audio clone voice, not named random-speaker defaults.
              </p>
            </div>

            <div className="grid gap-4">
              <div className="border-2 border-outline bg-[#faf7f2] p-4 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                <p className="text-[10px] font-headline font-black uppercase text-[#4a4a4a] tracking-wider">Business clone rate</p>
                <p className="mt-1 text-2xl font-headline font-black uppercase text-primary">Starts at 1.5 tokens/sec</p>
                <p className="mt-1 text-xs text-on-surface-variant font-body">Only approved Business plan accounts. High-volume prepaid can request 1 token/sec.</p>
              </div>
              <div className="border-2 border-outline bg-[#faf7f2] p-4 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                <p className="text-[10px] font-headline font-black uppercase text-[#4a4a4a] tracking-wider">Business status</p>
                <p className="mt-1 text-2xl font-headline font-black uppercase text-primary">Request / Approve / Launch</p>
              </div>
              <div className="border-2 border-outline bg-[#faf7f2] p-4 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                <p className="text-[10px] font-headline font-black uppercase text-[#4a4a4a] tracking-wider">Safe limits</p>
                <p className="mt-1 text-xs text-primary font-body font-bold">Daily tokens, monthly tokens, concurrency, running jobs, queue size</p>
              </div>
              <div className="border-2 border-outline bg-[#faf7f2] p-4 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                <p className="text-[10px] font-headline font-black uppercase text-[#4a4a4a] tracking-wider">Webhook event</p>
                <pre className="mt-2 overflow-x-auto border-2 border-outline bg-primary text-on-primary p-3 font-mono text-[10px] leading-5">
                  {`{\n  "event": "batch.completed",\n  "job_id": "job_...",\n  "status": "completed"\n}`}
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {businessFeatures.map((feature) => (
            <article key={feature.title} className="border-4 border-outline bg-white p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
              <h2 className="text-sm font-headline font-black uppercase text-primary border-b-2 border-outline pb-2 mb-3">{feature.title}</h2>
              <p className="text-xs font-body text-on-surface-variant leading-relaxed">{feature.body}</p>
            </article>
          ))}
        </section>

        <section className="mt-12 border-4 border-outline bg-white p-6 lg:p-8 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col gap-4 items-start">
            <div className="inline-block bg-[#0055ff] text-white border-2 border-outline px-3 py-1 font-headline font-bold uppercase tracking-tight text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
              Launch checklist
            </div>
            <h2 className="text-3xl font-headline font-black uppercase text-primary leading-none">What business customers need</h2>
            <p className="text-sm text-on-surface-variant font-body leading-relaxed border-l-4 border-outline pl-4">
              These steps reduce payment, queue, and voice-consistency problems before real customer traffic starts.
            </p>
          </div>
          <div className="grid gap-3">
            {readinessItems.map((item, index) => (
              <div key={item} className="border-2 border-outline bg-[#eee9e0] px-4 py-3 text-xs font-body font-bold text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                <span className="mr-2 inline-flex h-6 w-6 items-center justify-center border-2 border-outline bg-[#ffcc00] text-primary text-[10px] font-headline font-black">
                  {index + 1}
                </span>
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 border-4 border-outline bg-[#1a1a1a] p-6 text-white lg:p-8 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
          <h2 className="text-3xl font-headline font-black uppercase text-white tracking-tighter mb-2">Business API flow</h2>
          <p className="max-w-3xl text-xs font-body text-[#e8e3da] mb-6">
            Keep customer systems responsive by using async jobs and callbacks instead of waiting on GPU generation in one request.
          </p>
          <div className="grid gap-4 lg:grid-cols-4">
            {apiSteps.map((step) => (
              <article key={step.title} className="border-2 border-outline bg-[#2d2d2d] p-4 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                <h3 className="font-headline font-black uppercase text-[10px] text-[#ffcc00] border-b border-outline pb-1.5 mb-2">{step.title}</h3>
                <p className="text-xs font-body text-[#faf7f2] leading-relaxed">{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12 border-4 border-outline bg-[#d6e3ff] p-8 text-center shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
          <h2 className="text-3xl font-headline font-black uppercase text-primary tracking-tighter leading-none mb-3">Prepare business API access</h2>
          <p className="mx-auto max-w-2xl text-xs font-body text-on-surface-variant font-bold mb-6">
            Start with a paid token pack, create an API key, then submit business limits from the dashboard.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/app/dashboard/business"
              className="px-6 py-3 bg-[#ffcc00] text-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-[#e6b800] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              Open Business Setup
            </Link>
            <Link
              href="/support"
              className="px-6 py-3 bg-white text-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-surface-variant transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              Contact Support
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

