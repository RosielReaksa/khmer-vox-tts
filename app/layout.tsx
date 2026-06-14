import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk, Inter } from "next/font/google";
import { NavigationShell } from "@/app/components/navigation-shell";
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
  metadataBase: new URL("https://voxtts.online"),
  title: "Khmer Vox TTS",
  description:
    "Khmer Vox TTS is a Khmer text-to-speech API with temporary clone voice batch generation.",
  applicationName: "Khmer Vox TTS",
  openGraph: {
    type: "website",
    siteName: "Khmer Vox TTS",
    url: "https://voxtts.online",
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
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <NavigationShell>{children}</NavigationShell>
      </body>
    </html>
  );
}
