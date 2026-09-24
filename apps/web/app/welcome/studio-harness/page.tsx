"use client";

// TEMPORARY verification harness — renders the REAL studio page on a public
// route (the /barcodes URL itself is behind auth middleware). Deleted after
// the zoom control is verified.
import BarcodesHubPage from "@/app/barcodes/page";

export default function StudioHarnessPage() {
  return <BarcodesHubPage />;
}
