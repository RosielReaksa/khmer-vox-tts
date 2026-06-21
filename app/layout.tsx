import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Space_Grotesk, Inter } from "next/font/google";
import { NavigationShell } from "@/app/components/navigation-shell";
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

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Khmer Vox TTS — Khmer Text-to-Speech & Voice Cloning API",
    template: "%s | Khmer Vox TTS",
  },
  description:
    "Khmer Vox TTS is a Khmer text-to-speech API with natural voices, temporary voice cloning, and batch generation. Built for Cambodian creators, businesses, and developers.",
  applicationName: "Khmer Vox TTS",
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
    siteName: "Khmer Vox TTS",
    url: SITE_URL,
    locale: "en_US",
    title: "Khmer Vox TTS — Khmer Text-to-Speech API",
    description:
      "Natural Khmer voices, voice cloning, and batch generation. Convert text to natural speech with a simple API.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Khmer Vox TTS — Khmer Text-to-Speech API",
    description:
      "Natural Khmer voices, voice cloning, and batch generation. Convert text to natural speech with a simple API.",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffcc00",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} ${ibmPlexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <NavigationShell>{children}</NavigationShell>
      </body>
    </html>
  );
}
