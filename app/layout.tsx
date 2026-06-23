import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Noto_Sans_Khmer, Space_Grotesk } from "next/font/google";

import { LocaleProvider } from "@/app/components/locale-provider";
import { NavigationShell } from "@/app/components/navigation-shell";
import { getLocale, messagesFor, ogLocaleFor, t } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site-url";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

// Khmer-capable font. Loaded with the `khmer` subset so it only ships the
// Khmer glyphs (Latin glyphs come from Inter/Space Grotesk above). Used
// automatically when <html lang="km"> via the globals.css swap rule.
const notoSansKhmer = Noto_Sans_Khmer({
  variable: "--font-khmer",
  subsets: ["khmer"],
  weight: ["400", "500", "700"],
});

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
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} ${ibmPlexMono.variable} ${notoSansKhmer.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
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
