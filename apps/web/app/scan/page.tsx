import * as React from "react";
import type { Metadata, Viewport } from "next";
import { ScannerApp } from "@/components/scanner/scanner-app";

/**
 * The scanner route.
 *
 * Deliberately a shell around one client component: everything the surface does
 * is decided by `ScannerApp`, and the route exists to give it a stable URL
 * (`/scan`) — the same URL the printed QR labels encode, so the phone's own
 * camera app and the installed app land in exactly the same place.
 */

export const metadata: Metadata = {
  title: "Ananya Scanner",
  description: "Scan Ananya QR labels and read the record without leaving the camera.",
  // The installed app is the scanner: this manifest is what the iPhone Home
  // Screen reads when the operator adds `/scan` to it.
  manifest: "/scan/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Ananya Scanner",
    // The camera feed runs under the status bar; the scanner insets its own
    // chrome by the safe-area values instead of leaving a letterboxed strip.
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-icon.png",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Safe-area insets only exist when the page is allowed to reach the edges of
  // the screen, which is what `viewport-fit=cover` grants.
  viewportFit: "cover",
  themeColor: "#000000",
  colorScheme: "light dark",
};

export default function ScanPage() {
  return (
    <React.Suspense fallback={<ScannerBootScreen />}>
      <ScannerApp />
    </React.Suspense>
  );
}

/** One black screen while the client component boots — never a flash of the ERP. */
function ScannerBootScreen() {
  return (
    <div className="fixed inset-0 bg-black" data-scanner-boot="true" />
  );
}
