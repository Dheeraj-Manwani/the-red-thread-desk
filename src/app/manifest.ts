import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Red Thread Autoreply",
    short_name: "Red Thread",
    description: "Inbox and automations for Red Thread",
    start_url: "/inbox",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#b91c1c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
