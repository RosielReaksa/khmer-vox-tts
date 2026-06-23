import type { Metadata } from "next";
import Link from "next/link";

import { getLocale, t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: t("privacy.title", locale),
    description: t("privacy.body", locale),
    alternates: { canonical: "/privacy" },
  };
}

function sections(locale: Locale) {
  return [
    { title: t("privacy.section1.title", locale), body: t("privacy.section1.body", locale) },
    { title: t("privacy.section2.title", locale), body: t("privacy.section2.body", locale) },
    { title: t("privacy.section3.title", locale), body: t("privacy.section3.body", locale) },
    { title: t("privacy.section4.title", locale), body: t("privacy.section4.body", locale) },
    { title: t("privacy.section5.title", locale), body: t("privacy.section5.body", locale) },
    { title: t("privacy.section6.title", locale), body: t("privacy.section6.body", locale) },
  ];
}

export default async function PrivacyPage() {
  const locale = await getLocale();
  const items = sections(locale);

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-primary font-body flex justify-center items-start">
      <article className="w-full max-w-4xl border-4 border-outline bg-white p-6 lg:p-8 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] relative text-left">
        <div className="absolute -top-4 -right-4 w-8 h-8 bg-[#ffcc00] border-4 border-outline"></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-outline pb-4 mb-6">
          <Link
            href="/"
            className="px-4 py-2 border-2 border-outline bg-white text-primary font-headline font-bold uppercase text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#eee9e0] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            {t("privacy.backHome", locale)}
          </Link>
          <Link
            href="/docs"
            className="px-4 py-2 border-2 border-outline bg-[#ffcc00] text-primary font-headline font-bold uppercase text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#e6b800] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            {t("privacy.docs", locale)}
          </Link>
        </div>
        <h1 className="text-4xl font-headline font-black uppercase tracking-tighter text-primary lg:text-5xl mb-2">{t("privacy.title", locale)}</h1>
        <p className="text-sm font-body font-medium text-on-surface-variant max-w-2xl leading-relaxed mb-1 border-l-4 border-outline pl-4">
          {t("privacy.intro", locale)}
        </p>
        <p className="text-[10px] font-mono font-bold text-on-surface-variant mb-8">{t("privacy.lastUpdated", locale)}</p>

        <div className="grid gap-6">
          {items.map((section) => (
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
