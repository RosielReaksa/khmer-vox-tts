import type { Metadata } from "next";
import Link from "next/link";

import { SupportActions } from "@/app/support/support-actions";
import { PublicHeader } from "@/app/components/public-header";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Get help with Khmer Vox TTS — billing, API keys, voice cloning, and account questions. Contact our team on Telegram.",
  alternates: { canonical: "/support" },
};

function telegramHandle(): string {
  return (process.env.TELEGRAM_ADMIN_HANDLE ?? "https://t.me/OfficalVoxTTS").trim() || "https://t.me/OfficalVoxTTS";
}

function telegramUrl(handle: string): string {
  if (handle.startsWith("http://") || handle.startsWith("https://")) {
    return handle;
  }
  const clean = handle.replace(/^@/, "");
  return `https://t.me/${clean || "OfficalVoxTTS"}`;
}

function telegramLabel(handle: string): string {
  const clean = handle.startsWith("http://") || handle.startsWith("https://")
    ? handle.replace(/\/+$/, "").split("/").pop()
    : handle.replace(/^@/, "");
  return `@${clean || "OfficalVoxTTS"}`;
}

const supportTopics = [
  {
    title: "Payment not credited",
    detail: "Send your account email, KHQR order ID, paid amount, and ABA or bank payment screenshot.",
  },
  {
    title: "API request failed",
    detail: "Send your generation ID, response error, request time, endpoint, and whether it was normal TTS or clone voice.",
  },
  {
    title: "Voice clone problem",
    detail: "Use a clear 5 to 30 second single-speaker sample. Avoid music, background noise, and multiple speakers.",
  },
  {
    title: "Account suspended",
    detail: "Contact support with your account email and explain the payment or API activity that should be reviewed.",
  },
];

export default function SupportPage() {
  const handle = telegramHandle();
  const url = telegramUrl(handle);
  const label = telegramLabel(handle);

  return (
    <div className="min-h-screen bg-background text-primary font-body flex flex-col">
      <PublicHeader />

      <main className="mx-auto w-full max-w-5xl px-5 py-10 lg:px-8 text-left">
        <section className="mx-auto grid gap-6">
          <article className="border-4 border-outline bg-white p-6 lg:p-8 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] relative">
            <div className="absolute -top-4 -right-4 w-8 h-8 bg-[#ffcc00] border-4 border-outline"></div>
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
              Support for Khmer Vox TTS
            </h1>
            <p className="mt-4 font-body text-sm leading-relaxed text-on-surface-variant max-w-2xl border-l-4 border-outline pl-4">
              Use this page when payment, token balance, API, or clone voice generation needs help.
              Include exact IDs so support can verify the request quickly.
            </p>
            <SupportActions telegramUrl={url} telegramLabel={label} />
          </article>

          <section className="grid gap-4 md:grid-cols-2">
            {supportTopics.map((topic) => (
              <article key={topic.title} className="border-4 border-outline bg-white p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
                <h2 className="text-sm font-headline font-black uppercase text-primary border-b border-outline pb-1 mb-2">{topic.title}</h2>
                <p className="text-xs font-body text-on-surface-variant leading-relaxed">{topic.detail}</p>
              </article>
            ))}
          </section>

          <article className="border-4 border-outline bg-[#eee9e0] p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
            <h2 className="text-2xl font-headline font-black uppercase text-primary border-b-2 border-outline pb-2 mb-4">What to send</h2>
            <ul className="grid gap-2 text-xs font-body font-bold text-on-surface-variant list-disc pl-5">
              <li>Account email used on Khmer Vox TTS.</li>
              <li>Order ID, generation ID, or API key prefix.</li>
              <li>Screenshot or exact error response.</li>
              <li>Time of the issue and whether it was dashboard or API.</li>
            </ul>
            <div className="mt-6 flex flex-wrap gap-3 pt-6 border-t-2 border-outline">
              <Link
                href="/payment-guide"
                className="px-4 py-2 border-2 border-outline bg-white text-primary font-headline font-bold uppercase text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#eee9e0] transition-colors"
              >
                Payment Guide
              </Link>
              <Link
                href="/refund-policy"
                className="px-4 py-2 border-2 border-outline bg-white text-primary font-headline font-bold uppercase text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#eee9e0] transition-colors"
              >
                Refund Policy
              </Link>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}

