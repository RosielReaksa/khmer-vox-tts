import type { Metadata, Viewport } from "next";

import { LocaleProvider } from "@/app/components/locale-provider";
import { NavigationShell } from "@/app/components/navigation-shell";
import { getLocale, messagesFor, ogLocaleFor, t } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site-url";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const title = t("home.hero.title", locale);
  const description = t("home.hero.body", locale);
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: title,
      template: `%s | ${t("header.brand", locale)}`,
    },
    description,
    applicationName: t("header.brand", locale),
    keywords: [
      "Khmer text to speech",
      "Khmer TTS",
      "Khmer voice cloning",
      "Cambodia TTS API",
      "text to speech API",
      "Khmer AI voice",
      "voxtts",
    ],
    alternates: {
      canonical: "/",
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    openGraph: {
      type: "website",
      siteName: t("header.brand", locale),
      url: SITE_URL,
      locale: ogLocaleFor(locale),
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    icons: {
      icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#ffcc00",
  colorScheme: "light",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = messagesFor(locale);

  return (
    <html
      lang={locale}
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        />
        {/* Pass the active locale to the client provider without exposing it
            via a cookie read on first paint (avoids hydration mismatch). */}
        <meta name="kvx-locale" content={locale} />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <LocaleProvider locale={locale} messages={messages}>
          <NavigationShell>{children}</NavigationShell>
        </LocaleProvider>
      </body>
    </html>
  );
}
