import type { MetadataRoute } from "next";

/** Makes the app installable to an iOS/Android home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GSD — Get Sh*t Done",
    short_name: "GSD",
    description: "Notes and tasks, organised the Getting Things Done way.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
