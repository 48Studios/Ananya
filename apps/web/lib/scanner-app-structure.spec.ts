import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

/**
 * Standalone scanner app — structural guarantees.
 *
 * The scanner's rules are behavioural (does it navigate? does it open the ERP's
 * modal? does it survive a repeated scan?), and the workspace has no DOM testing
 * library, so the parts of those rules that are structural are pinned here by
 * reading the real sources — the same convention the rest of the web suite uses.
 * Anything that needs a camera or a DOM is verified in the browser instead.
 */

const webRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (relativePath: string) =>
  fs.readFileSync(path.join(webRoot, relativePath), "utf8");

const SCANNER_DIR = "components/scanner";
const SCANNER_FILES = [
  "scanner-app.tsx",
  "scanner-camera.tsx",
  "scanner-controls.tsx",
  "scanner-overlay.tsx",
  "scanner-details-modal.tsx",
  "scan-result-handler.ts",
] as const;

type ScannerFile = (typeof SCANNER_FILES)[number];

const scannerSources = Object.fromEntries(
  SCANNER_FILES.map((file) => [file, read(`${SCANNER_DIR}/${file}`)]),
) as Record<ScannerFile, string>;

const pageSource = read("app/scan/page.tsx");
const manifestSource = read("app/scan/manifest.webmanifest/route.ts");
const dashboardLayoutSource = read("components/dashboard-layout.tsx");
const detailsModalSource = read("components/barcodes/scanned-entity-modal.tsx");
const scanDialogSource = read("components/barcodes/scan-dialog.tsx");
const packageJson = JSON.parse(read("package.json")) as {
  dependencies: Record<string, string>;
};

/** Everything the scanner renders, as one string. */
const scannerSource = Object.values(scannerSources).join("\n");

describe("scanner surface never navigates", () => {
  it("uses no route change anywhere in the scanner", () => {
    // The one thing a scan may do is open the details modal. A route change
    // would replace the scanner instead of overlaying it.
    const navigationCalls = [
      /router\.push\(/,
      /router\.replace\(/,
      /window\.location\.href\s*=/,
      /window\.location\.assign\(/,
      /window\.location\.replace\(/,
    ];

    for (const call of navigationCalls) {
      expect(scannerSource).not.toMatch(call);
    }
  });

  it("keeps the resolved record in state instead of a route", () => {
    const handler = scannerSources["scan-result-handler.ts"];

    expect(handler).toContain("setDetailsOpen(true)");
    expect(handler).toContain('transition("showing-details")');
  });

  it("returns to scanning when the modal closes", () => {
    const handler = scannerSources["scan-result-handler.ts"];
    const closeDetails = handler.slice(
      handler.indexOf("const closeDetails = React.useCallback"),
    );

    expect(closeDetails).toContain("setDetailsOpen(false)");
    expect(closeDetails).toContain('transition("scanning")');
  });
});

describe("scanner reuses the ERP's own details modal", () => {
  it("mounts the existing modal with navigation switched off", () => {
    const detailsModal = scannerSources["scanner-details-modal.tsx"];

    expect(detailsModal).toContain(
      'import { ScannedEntityModal } from "@/components/barcodes/scanned-entity-modal"',
    );
    expect(detailsModal).toContain("allowNavigation={false}");
  });

  it("never renders a second copy of the record markup", () => {
    // The stock/location/description block exists once, in the shared modal.
    const copies = SCANNER_FILES.filter((file) =>
      scannerSources[file].includes("Total On-Hand Stock"),
    );

    expect(copies).toEqual([]);
    expect(detailsModalSource).toContain("Total On-Hand Stock");
  });

  it("guards the shared modal's own navigation, not just its buttons", () => {
    expect(detailsModalSource).toContain("if (!allowNavigation) return;");
    expect(detailsModalSource).toContain("allowNavigation = true");
  });

  it("leaves the ERP's in-app scan dialog untouched", () => {
    // The ERP keeps its dialog; the scanner is a separate surface, not a
    // replacement, so the dialog must not have been repointed at it.
    expect(scanDialogSource).toContain("ScannedEntityModal");
    expect(scanDialogSource).not.toContain("ScannerDetailsModal");
  });
});

describe("scanner duplicate detection", () => {
  const handler = scannerSources["scan-result-handler.ts"];

  it("sets the in-flight lock before the lookup is awaited", () => {
    const lockAt = handler.indexOf("inFlightRef.current = true");
    const awaitAt = handler.indexOf("await resolveScannedCode(code)");

    expect(lockAt).toBeGreaterThan(-1);
    expect(awaitAt).toBeGreaterThan(lockAt);
  });

  it("gates detections through the suppression window", () => {
    expect(handler).toContain("shouldHandleDetection(gateRef.current, value)");
    expect(handler).toContain("isScannerBusy(state)");
    expect(handler).toContain("suppressAfterHandledScan(code)");
  });

  it("pauses decoding while a lookup or the modal owns the screen", () => {
    expect(scannerSources["scanner-app.tsx"]).toContain(
      "paused={isScannerBusy(scannerState)}",
    );
    expect(scannerSources["scanner-camera.tsx"]).toContain("pausedRef.current");
  });

  it("only reads the same code again after it has left the frame", () => {
    // The camera reports completed passes that found nothing, and the gate
    // releases the handled code on those — so closing the modal with the label
    // still in front of the lens does not reopen the same record.
    expect(scannerSources["scanner-camera.tsx"]).toContain(
      "callbacksRef.current.onEmptyFrame()",
    );
    expect(handler).toContain("noteEmptyFrame(gateRef.current)");
    expect(handler).toContain("noteDetection(gateRef.current)");
  });
});

describe("scanner camera hygiene", () => {
  const camera = scannerSources["scanner-camera.tsx"];

  it("releases the stream and its loop on unmount", () => {
    expect(camera).toContain("getTracks().forEach((track) => track.stop())");
    expect(camera).toContain("return () => stopCamera();");
    expect(camera).toContain("cancelAnimationFrame");
    expect(camera).toContain("clearTimeout");
  });

  it("discards a stream that arrived after the surface moved on", () => {
    expect(camera).toContain("generation !== generationRef.current");
  });

  it("uses the decoder the ERP already ships", () => {
    expect(camera).toContain('import jsQR from "jsqr"');
    expect(packageJson.dependencies.jsqr).toBeDefined();

    for (const addedDependency of [
      "html5-qrcode",
      "@zxing/browser",
      "@zxing/library",
      "quagga",
      "react-qr-reader",
    ]) {
      expect(packageJson.dependencies[addedDependency]).toBeUndefined();
    }
  });

  it("decodes the reticle, not just the middle of the frame", () => {
    expect(camera).toContain("displayRectToVideoCrop(");
    expect(scannerSources["scanner-overlay.tsx"]).toContain("reticleRef");
  });
});

describe("scanner PWA configuration", () => {
  it("launches into the scanner as an installed app", () => {
    expect(manifestSource).toContain('start_url: "/scan"');
    expect(manifestSource).toContain('id: "/scan"');
    expect(manifestSource).toContain('display: "standalone"');
    expect(manifestSource).toContain('orientation: "portrait"');
    // `/login` must stay in scope, or a re-authentication is handed to Safari.
    expect(manifestSource).toContain('scope: "/"');
  });

  it("points the route at its manifest and the iPhone Home Screen icon", () => {
    expect(pageSource).toContain('manifest: "/scan/manifest.webmanifest"');
    expect(pageSource).toContain('apple: "/apple-icon.png"');
    expect(pageSource).toContain("capable: true");
  });

  it("opts into safe-area insets", () => {
    expect(pageSource).toContain('viewportFit: "cover"');
  });

  it("renders the scanner app, not an ERP page", () => {
    expect(pageSource).toContain(
      'import { ScannerApp } from "@/components/scanner/scanner-app"',
    );
    expect(pageSource).toContain("<ScannerApp />");
  });

  it("keeps the ERP shell off the scanner route", () => {
    expect(dashboardLayoutSource).toContain('const STANDALONE_ROUTES = ["/scan"]');
    expect(dashboardLayoutSource).toContain("isPublicRoute || isStandaloneRoute");
  });
});

describe("iPhone safe areas", () => {
  it("insets every piece of scanner chrome", () => {
    for (const inset of [
      "env(safe-area-inset-top)",
      "env(safe-area-inset-right)",
      "env(safe-area-inset-bottom)",
      "env(safe-area-inset-left)",
    ]) {
      expect(scannerSource).toContain(inset);
    }
  });

  it("never scrolls the page behind the camera", () => {
    expect(scannerSources["scanner-app.tsx"]).toContain(
      "fixed inset-0 select-none overflow-hidden overscroll-none",
    );
  });
});
