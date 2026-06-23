import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/app/components/public-header";
import { getLocale, t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: t("paymentGuide.title", locale),
    description: t("paymentGuide.body", locale),
    alternates: { canonical: "/payment-guide" },
  };
}

function steps(locale: Locale) {
  return [
    { title: t("paymentGuide.step1.title", locale), body: t("paymentGuide.step1.body", locale) },
    { title: t("paymentGuide.step2.title", locale), body: t("paymentGuide.step2.body", locale) },
    { title: t("paymentGuide.step3.title", locale), body: t("paymentGuide.step3.body", locale) },
    { title: t("paymentGuide.step4.title", locale), body: t("paymentGuide.step4.body", locale) },
  ];
}

function statusRows(locale: Locale) {
  return [
    ["pending", t("paymentGuide.status.pending", locale)],
    ["approved", t("paymentGuide.status.approved", locale)],
    ["rejected", t("paymentGuide.status.rejected", locale)],
    ["expired", t("paymentGuide.status.expired", locale)],
    ["cancelled", t("paymentGuide.status.cancelled", locale)],
  ] as const;
}

export default async function PaymentGuidePage() {
  const locale = await getLocale();
  const stepList = steps(locale);
  const statuses = statusRows(locale);

  return (
    <div className="min-h-screen bg-background text-primary font-body flex flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-6xl px-5 py-10 lg:px-8 text-left">
        <section className="mx-auto grid max-w-5xl gap-6">
          <article className="border-4 border-outline bg-white p-6 lg:grid-cols-[1fr_320px] lg:p-8 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] grid gap-6 relative">
            <div className="absolute -top-4 -right-4 w-8 h-8 bg-[#ffcc00] border-4 border-outline"></div>
            <div>
              <div className="flex gap-2 text-xs font-headline font-bold uppercase mb-4">
                <Link href="/" className="text-tertiary hover:underline">{t("paymentGuide.backHome", locale)}</Link>
                <span className="text-on-surface-variant">/</span>
                <Link href="/app/dashboard" className="text-tertiary hover:underline">{t("paymentGuide.backDashboard", locale)}</Link>
              </div>
              <h1 className="text-4xl font-headline font-black uppercase tracking-tighter text-primary lg:text-6xl leading-none">{t("paymentGuide.title", locale)}</h1>
              <p className="mt-4 font-body text-sm leading-relaxed text-on-surface-variant max-w-2xl border-l-4 border-outline pl-4">{t("paymentGuide.body", locale)}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/app/checkout" className="px-5 py-2.5 bg-[#ffcc00] text-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-[#e6b800] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">{t("paymentGuide.openCheckout", locale)}</Link>
                <Link href="/refund-policy" className="px-5 py-2.5 bg-white text-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-surface-variant transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">{t("paymentGuide.refundPolicy", locale)}</Link>
              </div>
            </div>
            <div className="border-4 border-outline bg-[#faf7f2] p-4 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] self-center">
              <div className="grid aspect-square place-items-center border-2 border-outline bg-white p-3 text-center">
                <div>
                  <span className="material-symbols-outlined text-6xl text-primary" aria-hidden="true">qr_code_2</span>
                  <p className="mt-3 font-headline text-xl font-black uppercase text-primary">{t("paymentGuide.dynamicQr", locale)}</p>
                  <p className="mt-2 text-xs font-bold text-on-surface-variant">{t("paymentGuide.dynamicQrDesc", locale)}</p>
                </div>
              </div>
              <p className="mt-3 text-center text-[10px] font-bold text-on-surface-variant font-body leading-relaxed">{t("paymentGuide.qrCaptionBody", locale)}</p>
            </div>
          </article>
          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {stepList.map((step, index) => (
              <article key={step.title} className="border-4 border-outline bg-white p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
                <span className="grid h-8 w-8 place-items-center border-2 border-outline bg-[#ffcc00] text-xs font-headline font-black text-primary">{index + 1}</span>
                <h2 className="mt-4 text-sm font-headline font-black uppercase text-primary border-b border-outline pb-1 mb-2">{step.title}</h2>
                <p className="text-xs font-body text-on-surface-variant leading-relaxed">{step.body}</p>
              </article>
            ))}
          </section>
          <section className="border-4 border-outline bg-white p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
            <h2 className="text-2xl font-headline font-black uppercase text-primary border-b-2 border-outline pb-2 mb-4">{t("paymentGuide.statusMeaning", locale)}</h2>
            <div className="overflow-hidden border-4 border-outline bg-white shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
              <table className="w-full text-sm">
                <tbody className="font-body text-xs font-medium">
                  {statuses.map(([status, meaning]) => (
                    <tr key={status} className="border-t-2 border-outline first:border-t-0">
                      <td className="w-36 px-4 py-3 font-mono font-bold text-tertiary border-r-2 border-outline">{status}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="border-4 border-outline bg-[#ffdad6] p-6 text-xs font-bold text-[#93000a] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
            <h2 className="text-lg font-headline font-black uppercase text-[#93000a] mb-2">{t("paymentGuide.important", locale)}</h2>
            <p className="font-body leading-relaxed">{t("paymentGuide.importantBody", locale)}</p>
          </section>
        </section>
      </main>
    </div>
  );
}
