import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/app/components/public-header";
import { getLocale, t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: t("payments.title", locale),
    description: t("payments.body", locale),
    alternates: { canonical: "/payments" },
  };
}

function steps(locale: Locale) {
  return [
    { title: t("payments.step1.title", locale), body: t("payments.step1.body", locale) },
    { title: t("payments.step2.title", locale), body: t("payments.step2.body", locale) },
    { title: t("payments.step3.title", locale), body: t("payments.step3.body", locale) },
    { title: t("payments.step4.title", locale), body: t("payments.step4.body", locale) },
  ];
}

function safetyRows(locale: Locale) {
  return [
    [t("payments.safety.duplicateProtection", locale), t("payments.safety.duplicateProtectionDesc", locale)],
    [t("payments.safety.orderStatus", locale), t("payments.safety.orderStatusDesc", locale)],
    [t("payments.safety.adminAudit", locale), t("payments.safety.adminAuditDesc", locale)],
    [t("payments.safety.supportFallback", locale), t("payments.safety.supportFallbackDesc", locale)],
  ] as [string, string][];
}

export default async function PaymentsPage() {
  const locale = await getLocale();
  const stepsList = steps(locale);
  const rows = safetyRows(locale);

  return (
    <div className="min-h-screen bg-background text-primary font-body flex flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-6xl gap-8 px-5 py-10 lg:px-8 text-left">
        <section className="border-4 border-outline bg-white p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] lg:p-10 relative">
          <div className="absolute -top-4 -right-4 w-8 h-8 bg-[#ffcc00] border-4 border-outline"></div>
          <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-center">
            <div>
              <div className="inline-block bg-[#ffcc00] border-2 border-outline px-3 py-1 font-headline font-bold uppercase tracking-tight text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] mb-4">
                {t("payments.title", locale)}
              </div>
              <h1 className="text-4xl font-headline font-black uppercase tracking-tighter text-primary lg:text-6xl leading-none">
                {t("payments.h1", locale)}
              </h1>
              <p className="mt-4 font-body text-sm leading-relaxed text-on-surface-variant max-w-2xl border-l-4 border-outline pl-4">
                {t("payments.heroBody", locale)}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/app/signup" className="px-5 py-2.5 bg-[#ffcc00] text-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-[#e6b800] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
                  {t("payments.createAccount", locale)}
                </Link>
                <Link href="/review" className="px-5 py-2.5 bg-white text-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-surface-variant transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
                  {t("payments.reviewChecklist", locale)}
                </Link>
                <Link href="/payment-guide" className="px-5 py-2.5 bg-white text-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-surface-variant transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
                  {t("payments.paymentGuide", locale)}
                </Link>
              </div>
            </div>
            <div className="border-4 border-outline bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
              <div className="grid aspect-square place-items-center border-2 border-outline bg-white p-4 text-center">
                <div>
                  <span className="material-symbols-outlined text-6xl text-primary" aria-hidden="true">qr_code_2</span>
                  <p className="mt-3 font-headline text-xl font-black uppercase text-primary">{t("payments.dynamicQr", locale)}</p>
                  <p className="mt-2 text-xs font-bold text-on-surface-variant">{t("payments.dynamicQrDesc", locale)}</p>
                </div>
              </div>
              <p className="mt-3 text-center text-[10px] font-bold text-on-surface-variant font-body">
                {t("payments.dynamicQrBody", locale)}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-12 grid gap-4 lg:grid-cols-4">
          {stepsList.map((step, index) => (
            <article key={step.title} className="border-4 border-outline bg-white p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
              <span className="grid h-8 w-8 place-items-center border-2 border-outline bg-[#ffcc00] text-xs font-headline font-black text-primary">{index + 1}</span>
              <h2 className="mt-4 text-sm font-headline font-black uppercase text-primary border-b border-outline pb-1 mb-2">{step.title}</h2>
              <p className="text-xs font-body text-on-surface-variant leading-relaxed">{step.body}</p>
            </article>
          ))}
        </section>

        <section className="mt-12 grid gap-6 border-4 border-outline bg-white p-6 lg:grid-cols-2 lg:p-8 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
          <div>
            <h2 className="text-2xl font-headline font-black uppercase text-primary border-b-2 border-outline pb-2 mb-3">{t("payments.currentMode", locale)}</h2>
            <p className="text-sm font-body text-on-surface-variant leading-relaxed">
              KHQRcc creates a payment QR for the exact order amount and verifies the transaction before credits are added. Old receipt-based orders remain visible only for history and support.
            </p>
            <div className="mt-5 border-2 border-outline bg-[#def3e5] p-4 text-xs font-bold text-[#0d5f2e] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
              No receipt upload is required for new KHQRcc orders. The app verifies payment status server-side before crediting an account.
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-headline font-black uppercase text-primary border-b-2 border-outline pb-2 mb-3">{t("payments.webhookVerification", locale)}</h2>
            <p className="text-sm font-body text-on-surface-variant leading-relaxed mb-4">
              KHQRcc sends a signed callback and the app can also poll KHQRcc verification before approving an order.
            </p>
            <div className="grid gap-2 text-xs font-medium">
              <InfoRow label={t("payments.callbackEndpoint", locale)} value="/api/webhooks/khqrcc" />
              <InfoRow label={t("payments.verification", locale)} value="signature, amount, currency, order status" />
              <InfoRow label={t("payments.duplicateHandling", locale)} value="provider transaction ID and order state" />
            </div>
          </div>
        </section>

        <section className="mt-12 border-4 border-outline bg-white p-6 lg:p-8 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
          <h2 className="text-2xl font-headline font-black uppercase text-primary border-b-2 border-outline pb-2 mb-4">{t("payments.safetyControls", locale)}</h2>
          <div className="overflow-hidden border-4 border-outline bg-white shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
            <table className="w-full text-sm">
              <tbody className="font-body text-xs font-medium">
                {rows.map(([label, value]) => (
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
