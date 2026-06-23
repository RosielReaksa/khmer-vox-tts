import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/app/components/public-header";
import { getLocale, t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: t("business.title", locale),
    description: t("business.body", locale),
    alternates: { canonical: "/business" },
  };
}

function businessFeatures(locale: Locale) {
  return [
    { title: t("business.f1.title", locale), body: t("business.f1.body", locale) },
    { title: t("business.f2.title", locale), body: t("business.f2.body", locale) },
    { title: t("business.f3.title", locale), body: t("business.f3.body", locale) },
    { title: t("business.f4.title", locale), body: t("business.f4.body", locale) },
    { title: t("business.f5.title", locale), body: t("business.f5.body", locale) },
  ];
}

const readinessItems = [
  "Paid API access and active token balance",
  "Production API key created from dashboard",
  "Business request approved by admin",
  "Webhook URL tested with sample callback",
  "One clone batch tested before real customer traffic",
  "Clear support contact for payment and API issues",
];

const apiSteps = [
  { title: "1. Submit business request", body: "Tell us monthly token volume, peak concurrency, app name, webhook URL, and support contact." },
  { title: "2. Admin applies limits", body: "Your API keys receive safe token, concurrency, queue, and clone-rate settings based on the approved request." },
  { title: "3. Run clone batch jobs", body: "Use reference audio for the speaker, send text lines, and track the async job until completion." },
  { title: "4. Receive webhook callback", body: "Your backend receives completed or failed events, then pulls job audio or updates your customer workflow." },
];

export default async function BusinessPage() {
  const locale = await getLocale();
  const features = businessFeatures(locale);

  return (
    <div className="min-h-screen bg-background text-primary font-body flex flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-6xl px-5 py-10 lg:px-8 text-left">
        <section className="border-4 border-outline bg-white p-6 lg:p-10 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] relative">
          <div className="absolute -top-4 -right-4 w-8 h-8 bg-[#ffcc00] border-4 border-outline"></div>
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="flex flex-col gap-4 items-start">
              <div className="inline-block bg-[#ffcc00] border-2 border-outline px-3 py-1 font-headline font-bold uppercase tracking-tight text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">{t("business.title", locale)}</div>
              <h1 className="text-4xl font-headline font-black uppercase tracking-tighter text-primary lg:text-6xl leading-none">{t("business.subtitle", locale)}</h1>
              <p className="font-body text-sm leading-relaxed text-on-surface-variant max-w-xl border-l-4 border-outline pl-4">{t("business.heroBody", locale)}</p>
              <div className="flex flex-wrap gap-3 mt-2">
                <Link href="/app/dashboard/business" className="px-6 py-3 bg-primary text-on-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-[#0055ff] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">{t("business.openSetup", locale)}</Link>
                <Link href="/docs#batch" className="px-6 py-3 bg-white text-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-surface-variant transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">{t("business.batchDocs", locale)}</Link>
              </div>
              <p className="font-mono text-[10px] font-bold text-on-surface-variant mt-2">{t("business.heroNote", locale)}</p>
            </div>
            <div className="grid gap-4">
              <div className="border-2 border-outline bg-[#faf7f2] p-4 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                <p className="text-[10px] font-headline font-black uppercase text-[#4a4a4a] tracking-wider">{t("business.cloneRate", locale)}</p>
                <p className="mt-1 text-2xl font-headline font-black uppercase text-primary">{t("business.cloneRateValue", locale)}</p>
                <p className="mt-1 text-xs text-on-surface-variant font-body">{t("business.cloneRateNote", locale)}</p>
              </div>
              <div className="border-2 border-outline bg-[#faf7f2] p-4 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                <p className="text-[10px] font-headline font-black uppercase text-[#4a4a4a] tracking-wider">{t("business.status", locale)}</p>
                <p className="mt-1 text-2xl font-headline font-black uppercase text-primary">{t("business.statusValue", locale)}</p>
              </div>
              <div className="border-2 border-outline bg-[#faf7f2] p-4 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                <p className="text-[10px] font-headline font-black uppercase text-[#4a4a4a] tracking-wider">{t("business.safeLimits", locale)}</p>
                <p className="mt-1 text-xs text-primary font-body font-bold">{t("business.safeLimitsValue", locale)}</p>
              </div>
              <div className="border-2 border-outline bg-[#faf7f2] p-4 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                <p className="text-[10px] font-headline font-black uppercase text-[#4a4a4a] tracking-wider">{t("business.webhookEvent", locale)}</p>
                <pre className="mt-2 overflow-x-auto border-2 border-outline bg-primary text-on-primary p-3 font-mono text-[10px] leading-5">{"{\n  \"event\": \"batch.completed\",\n  \"job_id\": \"job_...\",\n  \"status\": \"completed\"\n}"}</pre>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.title} className="border-4 border-outline bg-white p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
              <h2 className="text-sm font-headline font-black uppercase text-primary border-b-2 border-outline pb-2 mb-3">{feature.title}</h2>
              <p className="text-xs font-body text-on-surface-variant leading-relaxed">{feature.body}</p>
            </article>
          ))}
        </section>

        <section className="mt-12 border-4 border-outline bg-white p-6 lg:p-8 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col gap-4 items-start">
            <div className="inline-block bg-[#0055ff] text-white border-2 border-outline px-3 py-1 font-headline font-bold uppercase tracking-tight text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">{t("business.launchChecklist", locale)}</div>
            <h2 className="text-3xl font-headline font-black uppercase text-primary leading-none">{t("business.launchBody", locale)}</h2>
            <p className="text-sm text-on-surface-variant font-body leading-relaxed border-l-4 border-outline pl-4">{t("business.launchBody2", locale)}</p>
          </div>
          <div className="grid gap-3">
            {readinessItems.map((item, index) => (
              <div key={item} className="border-2 border-outline bg-[#eee9e0] px-4 py-3 text-xs font-body font-bold text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                <span className="mr-2 inline-flex h-6 w-6 items-center justify-center border-2 border-outline bg-[#ffcc00] text-primary text-[10px] font-headline font-black">{index + 1}</span>
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 border-4 border-outline bg-[#1a1a1a] p-6 text-white lg:p-8 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
          <h2 className="text-3xl font-headline font-black uppercase text-white tracking-tighter mb-2">{t("business.apiFlow", locale)}</h2>
          <p className="max-w-3xl text-xs font-body text-[#e8e3da] mb-6">{t("business.flowBody", locale)}</p>
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
          <h2 className="text-3xl font-headline font-black uppercase text-primary tracking-tighter leading-none mb-3">{t("business.prepare", locale)}</h2>
          <p className="mx-auto max-w-2xl text-xs font-body text-on-surface-variant font-bold mb-6">{t("business.prepareBody", locale)}</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/app/dashboard/business" className="px-6 py-3 bg-[#ffcc00] text-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-[#e6b800] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">{t("business.openSetup", locale)}</Link>
            <Link href="/support" className="px-6 py-3 bg-white text-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-surface-variant transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">{t("business.contactSupport", locale)}</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
