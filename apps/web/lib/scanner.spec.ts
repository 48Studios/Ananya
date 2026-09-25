/**
 * Rules behind the standalone scanner surface (`/scan`).
 *
 * The workspace has no DOM testing library, so the scanner's behaviour that can
 * be expressed as rules lives in `lib/scanner.ts` and is tested here: the
 * duplicate-detection guard, the reticle→frame mapping, the failure copy and
 * the resolver's delegation. The camera plumbing itself is verified in the
 * browser instead (source assertions for the parts that are structural live in
 * `scanner-app-structure.spec.ts`).
 */

import { describe, it, expect } from "vitest";
import { ApiError } from "./api-client";
import {
  CAMERA_PERMISSION_FAILURE,
  CAMERA_UNSUPPORTED_FAILURE,
  INITIAL_SCAN_GATE_STATE,
  SCAN_ERROR_VISIBLE_MS,
  SCAN_REARM_CLEAR_MS,
  SCAN_SUPPRESSION_MS,
  displayRectToVideoCrop,
  describeCameraFailure,
  describeScanFailure,
  isScannerBusy,
  isStandaloneDisplay,
  normalizeScannedValue,
  noteDetection,
  noteEmptyFrame,
  resolveScannedCode,
  shouldHandleDetection,
  suppressAfterHandledScan,
} from "./scanner";

describe("scanner lifecycle", () => {
  it("treats only a lookup in flight or its modal as busy", () => {
    expect(isScannerBusy("idle")).toBe(false);
    expect(isScannerBusy("scanning")).toBe(false);
    expect(isScannerBusy("error")).toBe(false);
    expect(isScannerBusy("processing")).toBe(true);
    expect(isScannerBusy("showing-details")).toBe(true);
  });

  it("keeps a failed-scan message on screen long enough to read", () => {
    expect(SCAN_ERROR_VISIBLE_MS).toBeGreaterThan(2000);
  });
});

describe("scanner duplicate detection guard", () => {
  it("handles a burst of identical detections once", () => {
    // 20 frames of the same code in 500ms, as jsQR reports it.
    const start = 1_000;
    let gate = INITIAL_SCAN_GATE_STATE;
    let handled = 0;

    for (let frame = 0; frame < 20; frame += 1) {
      const now = start + frame * 25;
      if (!shouldHandleDetection(gate, "ANANYA-COMP-123", now)) continue;
      handled += 1;
      gate = suppressAfterHandledScan("ANANYA-COMP-123", now);
    }

    expect(handled).toBe(1);
  });

  it("still recognises the same code once it has left the frame", () => {
    let gate = suppressAfterHandledScan("CMP-000001", 5_000);
    const cleared = 5_000 + SCAN_SUPPRESSION_MS;

    // The label is gone: the frame stays clear for longer than the debounce.
    gate = noteEmptyFrame(gate, cleared);
    gate = noteEmptyFrame(gate, cleared + SCAN_REARM_CLEAR_MS);

    expect(gate).toEqual(INITIAL_SCAN_GATE_STATE);
    expect(shouldHandleDetection(gate, "CMP-000001", cleared)).toBe(true);
  });

  it("keeps ignoring the code that is still in front of the lens", () => {
    let gate = suppressAfterHandledScan("CMP-000001", 5_000);

    // Three seconds of the same label, long past the cooldown.
    for (let frame = 0; frame < 60; frame += 1) {
      gate = noteDetection(gate);
      expect(shouldHandleDetection(gate, "CMP-000001", 8_000)).toBe(false);
    }
  });

  it("does not re-arm during the cooldown, however clear the frame is", () => {
    let gate = suppressAfterHandledScan("CMP-000001", 5_000);

    gate = noteEmptyFrame(gate, 5_100);
    gate = noteEmptyFrame(gate, 5_200);

    expect(gate.clearSince).toBeNull();
    expect(shouldHandleDetection(gate, "CMP-000001", 5_200)).toBe(false);
  });

  it("treats a single missed frame as the code still being there", () => {
    let gate = suppressAfterHandledScan("CMP-000001", 5_000);

    gate = noteEmptyFrame(gate, 6_500);
    gate = noteDetection(gate);

    expect(gate.clearSince).toBeNull();
    expect(shouldHandleDetection(gate, "CMP-000001", 6_600)).toBe(false);
  });

  it("never delays the next component because of the previous one", () => {
    const handledAt = 9_000;
    const gate = suppressAfterHandledScan("CMP-000001", handledAt);

    expect(shouldHandleDetection(gate, "CMP-000002", handledAt + 1)).toBe(true);
  });

  it("ignores empty detections", () => {
    expect(shouldHandleDetection(INITIAL_SCAN_GATE_STATE, "")).toBe(false);
    expect(shouldHandleDetection(INITIAL_SCAN_GATE_STATE, "   ")).toBe(false);
  });

  it("compares values as the scanner normalises them", () => {
    const handledAt = 2_000;
    const gate = suppressAfterHandledScan(" CMP-000001\n", handledAt);

    expect(gate.suppressedValue).toBe("CMP-000001");
    expect(normalizeScannedValue("\tCMP-000001")).toBe("CMP-000001");
    expect(
      shouldHandleDetection(gate, "  CMP-000001 ", handledAt + 10),
    ).toBe(false);
  });
});

describe("reticle to video mapping", () => {
  /**
   * An iPhone in portrait: a tall viewport over a landscape camera frame, which
   * `object-cover` upscales until it covers the screen.
   */
  it("maps a centred reticle onto the frame of a portrait phone", () => {
    const viewport = { x: 0, y: 0, width: 390, height: 844 };
    const reticleSize = Math.min(viewport.width, viewport.height) * 0.72;
    const reticle = {
      x: (viewport.width - reticleSize) / 2,
      y: (viewport.height - reticleSize) / 2,
      width: reticleSize,
      height: reticleSize,
    };

    const crop = displayRectToVideoCrop(reticle, viewport, {
      width: 1280,
      height: 720,
    });

    // Closest whole frame the phone can give: the reticle is square and the
    // crop stays square, centred on the frame's own centre.
    expect(crop).toEqual({ x: 520, y: 240, width: 240, height: 240 });
    expect(crop!.x + crop!.width / 2).toBeCloseTo(640, -1);
    expect(crop!.y + crop!.height / 2).toBeCloseTo(360, -1);
  });

  it("maps a letterboxed frame using the smaller scale", () => {
    const container = { x: 0, y: 0, width: 1000, height: 500 };
    const crop = displayRectToVideoCrop(
      { x: 400, y: 150, width: 200, height: 200 },
      container,
      { width: 640, height: 480 },
    );

    // Cover scale is 1000/640 = 1.5625, so the frame renders 750px tall and is
    // centred: 125px are hidden above and below, which the y offset accounts for.
    expect(crop).toEqual({ x: 256, y: 176, width: 128, height: 128 });
  });

  it("keeps the crop inside the frame for a reticle at the edge", () => {
    const container = { x: 0, y: 0, width: 300, height: 300 };
    const crop = displayRectToVideoCrop(
      { x: -40, y: -40, width: 200, height: 200 },
      container,
      { width: 1280, height: 720 },
    );

    expect(crop).not.toBeNull();
    expect(crop!.x).toBeGreaterThanOrEqual(0);
    expect(crop!.y).toBeGreaterThanOrEqual(0);
    expect(crop!.x + crop!.width).toBeLessThanOrEqual(1280);
    expect(crop!.y + crop!.height).toBeLessThanOrEqual(720);
  });

  it("refuses to guess before the video reports its size", () => {
    const container = { x: 0, y: 0, width: 390, height: 844 };
    const reticle = { x: 50, y: 200, width: 280, height: 280 };

    expect(
      displayRectToVideoCrop(reticle, container, { width: 0, height: 0 }),
    ).toBeNull();
    expect(
      displayRectToVideoCrop(
        { x: 50, y: 200, width: 0, height: 0 },
        container,
        { width: 1280, height: 720 },
      ),
    ).toBeNull();
    expect(
      displayRectToVideoCrop(reticle, { x: 0, y: 0, width: 0, height: 0 }, {
        width: 1280,
        height: 720,
      }),
    ).toBeNull();
  });
});

describe("scanner failure copy", () => {
  it("reports an unknown code as not found, naming what was scanned", () => {
    const failure = describeScanFailure(
      new ApiError(404, "No entity matched"),
      "CMP-999999",
    );

    expect(failure.kind).toBe("NOT_FOUND");
    expect(failure.title).toBe("Component not found");
    expect(failure.description).toContain("CMP-999999");
  });

  it("separates an unusable payload from an unknown one", () => {
    const failure = describeScanFailure(new ApiError(400, "bad input"), "%%%");

    expect(failure.kind).toBe("INVALID");
    expect(failure.title).toBe("Invalid QR code");
  });

  it("tells the operator to sign in when the session is gone", () => {
    const failure = describeScanFailure(
      new ApiError(401, "Unauthorized"),
      "CMP-000001",
    );

    expect(failure.kind).toBe("SESSION");
    expect(failure.description).toContain("sign in");
  });

  it("treats anything that never reached the API as a connection problem", () => {
    const failure = describeScanFailure(
      new TypeError("Failed to fetch"),
      "CMP-000001",
    );

    expect(failure.kind).toBe("NETWORK");
    expect(failure.title).toBe("Unable to load component");
    expect(failure.description).toBe("Check your connection and try again.");
  });

  it("never sends an empty payload to the API", async () => {
    await expect(resolveScannedCode("   ")).rejects.toBeInstanceOf(ApiError);
    const failure = describeScanFailure(new ApiError(400, ""), "");
    expect(failure.kind).toBe("INVALID");
  });
});

describe("camera failure copy", () => {
  it("explains that a blocked permission is required, not broken", () => {
    const failure = describeCameraFailure(
      Object.assign(new Error("denied"), { name: "NotAllowedError" }),
    );

    expect(failure).toEqual(CAMERA_PERMISSION_FAILURE);
    expect(failure.description).toContain("camera access");
  });

  it("distinguishes an absent camera from a refused one", () => {
    expect(
      describeCameraFailure(
        Object.assign(new Error("none"), { name: "NotFoundError" }),
      ).kind,
    ).toBe("no-camera");
    expect(
      describeCameraFailure(
        Object.assign(new Error("busy"), { name: "NotReadableError" }),
      ).kind,
    ).toBe("unavailable");
  });

  it("stays retryable when the browser gives no recognisable reason", () => {
    expect(describeCameraFailure(null).kind).toBe("unknown");
    expect(describeCameraFailure(new Error("nope")).kind).toBe("unknown");
  });

  it("states the HTTPS requirement when there is no camera API at all", () => {
    expect(CAMERA_UNSUPPORTED_FAILURE.description).toContain("HTTPS");
  });
});

describe("installed-app detection", () => {
  it("is false outside a browser", () => {
    expect(isStandaloneDisplay()).toBe(false);
  });
});
