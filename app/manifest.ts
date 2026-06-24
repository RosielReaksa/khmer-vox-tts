import type { MetadataRoute } from "next";

/**
 * PWA web app manifest. Enables "Add to Home Screen" / installability and gives
 * the browser the brand theme color. Icons reference the existing app/icon.svg
 * (served at /icon.svg); SVG with sizes "any" is accepted by modern browsers.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Khmer Vox TTS",
    short_name: "Vox TTS",
    description:
      "Khmer text-to-speech API with natural voices, temporary voice cloning, and batch generation.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f0e8",
    theme_color: "#ffcc00",
    lang: "en",
    categories: ["developer", "productivity", "utilities"],
    icons: [
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
      {
        src: "/apple-touch-icon.png",
        type: "image/png",
        sizes: "180x180",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        type: "image/png",
        sizes: "192x192",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "maskable",
      },
    ],
  };
}
