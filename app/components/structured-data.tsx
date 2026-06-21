import { SITE_URL } from "@/lib/site-url";

/**
 * JSON-LD structured data for the marketing home page. Helps search engines
 * understand the brand (Organization), the site (WebSite), and the product
 * (SoftwareApplication / API), which can enable richer search results.
 *
 * Rendered as a server component; the JSON is static so it is safe to inject
 * via dangerouslySetInnerHTML (no user input is interpolated).
 */
export function HomeStructuredData() {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "Khmer Vox TTS",
        url: SITE_URL,
        logo: `${SITE_URL}/icon.svg`,
        description:
          "Khmer text-to-speech and voice-cloning API for developers, creators, and businesses.",
        areaServed: "KH",
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: "Khmer Vox TTS",
        publisher: { "@id": `${SITE_URL}/#organization` },
        inLanguage: "en",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#software`,
        name: "Khmer Vox TTS API",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web",
        url: SITE_URL,
        description:
          "Khmer text-to-speech API with natural voices, temporary voice cloning, and batch generation. Prepaid token packs with KHQR / ABA Pay checkout.",
        offers: {
          "@type": "Offer",
          price: "1.50",
          priceCurrency: "USD",
          description: "Creator token pack (10,000 tokens).",
        },
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // Static, no user input — safe to inject.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
