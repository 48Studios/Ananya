import { NextResponse } from "next/server";
import type { MetadataRoute } from "next";

/**
 * The scanner's Web App Manifest, served at `/scan/manifest.webmanifest`.
 *
 * A route handler rather than the `app/manifest.ts` file convention, because
 * that convention only exists at the root of the app — and this manifest belongs
 * to the scanner route: the ERP has no business advertising a scanner as its own
 * installed identity. Served from inside `/scan` so the manifest, the icon and
 * the surface it describes all live in one place.
 *
 * The installed app launches into `/scan` in standalone mode, in portrait, on a
 * black background that matches the camera feed.
 *
 * `scope` is the site root, not `/scan`, because the one navigation the
 * installed app can legitimately make is to `/login` when the session has
 * expired — with a narrower scope that would be handed to Safari and the
 * operator would lose the app. The app's *identity* stays `/scan` via `id`, so
 * re-installing from a different URL still lands on the same installed app.
 */
const scannerManifest: MetadataRoute.Manifest = {
  id: "/scan",
  name: "Ananya Scanner",
  short_name: "Scanner",
  description:
    "Scan Ananya QR labels and read the record without leaving the camera.",
  start_url: "/scan",
  scope: "/",
  display: "standalone",
  orientation: "portrait",
  background_color: "#000000",
  theme_color: "#000000",
  icons: [
    // The 180px icon is what iOS uses for the Home Screen; the SVG covers
    // every other size and is the app's own vector mark.
    { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
  ],
};

export function GET() {
  return new NextResponse(JSON.stringify(scannerManifest), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
