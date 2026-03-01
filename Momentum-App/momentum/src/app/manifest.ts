import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Momentum - Din AI-coach mot prokrastinering",
    short_name: "Momentum",
    description:
      "Momentum hjälper dig att komma igång direkt med mikro-steg, AI Task Splitting och Vision Mode.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#060915",
    theme_color: "#6d4aff",
    orientation: "portrait",
    lang: "sv-SE",
    categories: ["productivity", "lifestyle"],
    icons: [
      {
        src: "/icons/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
      },
      {
        src: "/icons/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
      },
      {
        src: "/icons/maskable-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
