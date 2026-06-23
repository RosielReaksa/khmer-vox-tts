import type { Metadata } from "next";
import Link from "next/link";

import { getLocale, t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: t("refund.title", locale),
    description: t("refund.body", locale),
    alternates: { canonical: "/refund-policy" },
  };
}

function refundApproved(locale: Locale) {
  return [
    t("refund.approved.1", locale),
    t("refund.approved.2", locale),
    t("refund.approved.3", locale),
    t("refund.approved.4", locale),
    t("refund.approved.5", locale),
  ];
}

function refundNotApproved(locale: Locale) {
  return [
    t("refund.notApproved.1", locale),
    t("refund.notApproved.2", locale),
    t("refund.notApproved.3", locale),
    t("refund.notApproved.4", locale),
  ];
}

export default async function RefundPolicyPage() {
  const locale = await getLocale();
  const approved = refundApproved(locale);
  const notApproved = refundNotApproved(locale);

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-primary font-body flex justify-center items-start">
      <article className="w-full max-w-5xl border-4 border-outline bg-white p-6 lg:p-8 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] relative text-left">
        <div className="absolute -top-4 -right-4 w-8 h-8 bg-[#ffcc00] border-4 border-outline"></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-outline pb-4 mb-6">
          <Link href="/" className="px-4 py-2 border-2 border-outline bg-white text-primary font-headline font-bold uppercase text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#eee9e0] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
            {t("refund.backHome", locale)}
          </Link>
          <Link href="/payment-guide" className="px-4 py-2 border-2 border-outline bg-[#ffcc00] text-primary font-headline font-bold uppercase text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#e6b800] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
            {t("refund.paymentGuide", locale)}
          </Link>
        </div>

        <div className="inline-block bg-[#ffcc00] border-2 border-outline px-3 py-1 font-headline font-bold uppercase tracking-tight text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] mb-4">
          {t("refund.title", locale)}
        </div>
        <h1 className="text-4xl font-headline font-black uppercase tracking-tighter text-primary lg:text-6xl leading-none mb-4">
          {t("refund.heading", locale)}
        </h1>
        <p className="font-body text-sm leading-relaxed text-on-surface-variant max-w-3xl border-l-4 border-outline pl-4 mb-6">
          {t("refund.intro", locale)}
        </p>

        <section className="grid gap-6 lg:grid-cols-2 mb-8">
          <PolicyPanel title={t("refund.approvedTitle", locale)} items={approved} tone="good" />
          <PolicyPanel title={t("refund.notApprovedTitle", locale)} items={notApproved} tone="risk" />
        </section>

        <section className="border-4 border-outline bg-[#eee9e0] p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] mb-6">
          <h2 className="text-2xl font-headline font-black uppercase text-primary border-b-2 border-outline pb-2 mb-4">{t("refund.cancellationRules", locale)}</h2>
          <p className="text-xs font-body text-on-surface-variant leading-relaxed mb-3">{t("refund.cancellationBody1", locale)}</p>
          <p className="text-xs font-body text-on-surface-variant leading-relaxed">{t("refund.cancellationBody2", locale)}</p>
        </section>

        <section className="border-4 border-outline bg-white p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] mb-8">
          <h2 className="text-2xl font-headline font-black uppercase text-primary border-b-2 border-outline pb-2 mb-4">{t("refund.howToRequest", locale)}</h2>
          <ol className="grid gap-3 text-xs font-body font-bold text-on-surface-variant list-decimal pl-5">
            <li>{t("refund.request.s1", locale)}</li>
            <li>{t("refund.request.s2", locale)}</li>
            <li>{t("refund.request.s3", locale)}</li>
            <li>{t("refund.request.s4", locale)}</li>
          </ol>
        </section>

        <p className="text-[10px] font-mono font-bold text-on-surface-variant">{t("refund.lastUpdated", locale)}</p>
      </article>
    </main>
  );
}

function PolicyPanel({ title, items, tone }: { title: string; items: string[]; tone: "good" | "risk" }) {
  const panelClass = tone === "good" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-red-200 bg-red-50 text-red-950";
  return (
    <section className={`border-4 border-outline p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] ${panelClass}`}>
      <h2 className="text-sm font-headline font-black uppercase border-b-2 border-outline pb-1.5 mb-3">{title}</h2>
      <ul className="grid gap-2 text-xs font-body leading-relaxed list-disc pl-5">
        {items.map((item) => (<li key={item}>{item}</li>))}
      </ul>
    </section>
  );
}
