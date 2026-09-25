/**
 * Rules for the standalone scanner surface (`/scan`).
 *
 * These are the parts of the scanner that can be reasoned about without a
 * camera or a network: the scan lifecycle, the duplicate-detection guard, the
 * mapping between the on-screen reticle and the pixels the decoder is handed,
 * and the copy shown over the camera. The camera component and the result
 * handler stay presentational and call in here, so the behaviour is testable
 * without a DOM (this workspace has no DOM test environment).
 */

import { ApiError } from "./api-client";
import { barcodesApi, BarcodeLookupResult } from "./api/barcodes-api";

/**
 * Lifecycle of the scanner, exactly as the operator experiences it.
 *
 * `idle` covers both "the camera has not been asked for yet" and "the camera
 * is not running"; `error` means a lookup failed — the camera keeps scanning
 * underneath, because the only useful thing after a failed scan is the next
 * scan.
 */
export type ScannerState =
  | "idle"
  | "scanning"
  | "processing"
  | "showing-details"
  | "error";

/**
 * States in which the camera must not decode: either a lookup is in flight, or
 * its result owns the screen. This is what stops the frames that arrive while
 * the details modal is open from re-resolving what is still in front of the
 * lens.
 */
export function isScannerBusy(state: ScannerState): boolean {
  return state === "processing" || state === "showing-details";
}

/**
 * How long the value that was just handled stays ignored once scanning
 * resumes.
 *
 * A code stays under the lens after the modal closes, so without a cooldown the
 * very next frame would reopen the same record — the operator would have to
 * pull the phone away at exactly the right moment. The window is measured from
 * the moment the scan is handled, so it also covers the modal being dismissed
 * immediately.
 */
export const SCAN_SUPPRESSION_MS = 1500;

/** How long a failed scan stays on screen before the message clears itself. */
export const SCAN_ERROR_VISIBLE_MS = 4000;

/**
 * How long the frame must be clear before the just-handled code can be read
 * again.
 *
 * A decoder misses the occasional frame, so a single empty frame cannot mean
 * "the label is gone" — requiring a clear stretch of frames can.
 */
export const SCAN_REARM_CLEAR_MS = 400;

/**
 * The duplicate-detection guard.
 *
 * The camera loop runs continuously, so the same code is reported on every
 * frame it is visible in — twenty times in half a second is normal. The handler
 * holds the in-flight lock that makes those a single lookup; this gate is the
 * second half of the rule, and it survives the lock being released. A handled
 * value is ignored until both of these are true:
 *
 * - the cooldown has elapsed, and
 * - the code has left the frame for `SCAN_REARM_CLEAR_MS`.
 *
 * The cooldown alone would be wrong in the ordinary case: the operator closes
 * the modal with the label still in front of the lens, so a cooldown-only gate
 * would reopen the same record a second and a half later, and scanning the next
 * component would mean pulling the phone away first. Requiring the frame to
 * clear first is what makes "close, then scan the next label" work.
 */
export interface ScanGateState {
  /** Value most recently handled, or `null` when nothing is suppressed. */
  suppressedValue: string | null;
  /** Epoch milliseconds until which `suppressedValue` is ignored. */
  suppressedUntil: number;
  /** When the frame first went clear, or `null` while a code is in it. */
  clearSince: number | null;
}

export const INITIAL_SCAN_GATE_STATE: ScanGateState = {
  suppressedValue: null,
  suppressedUntil: 0,
  clearSince: null,
};

/** Scanned text as the rest of the scanner sees it. */
export function normalizeScannedValue(raw: string): string {
  return raw.trim();
}

/**
 * Whether a detection should start a lookup.
 *
 * A different code is always accepted, so scanning the next component is never
 * delayed by the previous one. The code that was just handled is only readable
 * again once it has left the frame — `noteEmptyFrame` releases the suppression
 * when that happens, so this is a re-check of the rule rather than the rule
 * itself.
 */
export function shouldHandleDetection(
  state: ScanGateState,
  value: string,
  now: number = Date.now(),
): boolean {
  const normalized = normalizeScannedValue(value);
  if (!normalized) return false;
  if (state.suppressedValue !== normalized) return true;
  return state.clearSince !== null && now >= state.suppressedUntil;
}

/** Gate state after a value has been handed to the resolver. */
export function suppressAfterHandledScan(
  value: string,
  now: number = Date.now(),
  suppressionMs: number = SCAN_SUPPRESSION_MS,
): ScanGateState {
  return {
    suppressedValue: normalizeScannedValue(value),
    suppressedUntil: now + suppressionMs,
    clearSince: null,
  };
}

/** Gate state after a detection: whatever it was, the frame is not clear. */
export function noteDetection(state: ScanGateState): ScanGateState {
  if (state.clearSince === null) return state;
  return { ...state, clearSince: null };
}

/**
 * Gate state after a frame in which nothing was decoded.
 *
 * Returns the same state until the frame has been clear for long enough, at
 * which point the handled value is released and the next code — the same one
 * held up again, or the next label — is read normally.
 */
export function noteEmptyFrame(
  state: ScanGateState,
  now: number = Date.now(),
  rearmClearMs: number = SCAN_REARM_CLEAR_MS,
): ScanGateState {
  if (state.suppressedValue === null) return state;
  if (now < state.suppressedUntil) return state;
  if (state.clearSince === null) return { ...state, clearSince: now };
  if (now - state.clearSince < rearmClearMs) return state;
  return INITIAL_SCAN_GATE_STATE;
}

export type ScanFailureKind =
  | "NOT_FOUND"
  | "INVALID"
  | "NETWORK"
  | "SESSION"
  | "UNKNOWN";

/** What the operator is told when a scan could not be resolved. */
export interface ScanFailure {
  kind: ScanFailureKind;
  title: string;
  description: string;
}

/**
 * The scanner's single resolution entry point.
 *
 * It deliberately adds nothing to the lookup the ERP already performs: a
 * scanned value means exactly what it means everywhere else in Ananya, so a
 * `ANANYA:V1:COMPONENT:<id>` payload, a label URL captured by the phone's own
 * camera, a raw UUID, a component SKU, a location code and the other entity
 * numbers all resolve through the one endpoint (including unwrapping a
 * `?code=` URL), and the result is the same record the ERP's own scan dialog
 * shows.
 */
export async function resolveScannedCode(
  value: string,
): Promise<BarcodeLookupResult> {
  const code = normalizeScannedValue(value);
  if (!code) {
    // Classified as INVALID by `describeScanFailure`; never a network call.
    throw new ApiError(400, "Barcode or QR input string cannot be empty.");
  }
  return barcodesApi.lookup(code);
}

/**
 * Turns a failed lookup into what the operator reads.
 *
 * The API answers 404 for "nothing matched" and 400 for input it cannot use, so
 * a wrong label and an unreadable one are different messages; anything that did
 * not come back as an `ApiError` never reached the server, which on a phone
 * almost always means the connection.
 */
export function describeScanFailure(error: unknown, code: string): ScanFailure {
  const scanned = normalizeScannedValue(code);

  if (!scanned) {
    return {
      kind: "INVALID",
      title: "Invalid QR code",
      description: "This label does not carry a code Ananya can read.",
    };
  }

  if (error instanceof ApiError) {
    if (error.statusCode === 404) {
      return {
        kind: "NOT_FOUND",
        title: "Component not found",
        description: `No component, location or order in Ananya matches "${scanned}".`,
      };
    }
    if (error.statusCode === 400) {
      return {
        kind: "INVALID",
        title: "Invalid QR code",
        description: "This label does not carry a code Ananya can read.",
      };
    }
    if (error.statusCode === 401 || error.statusCode === 403) {
      return {
        kind: "SESSION",
        title: "Session expired",
        description: "Please sign in again to keep scanning.",
      };
    }
    return {
      kind: "UNKNOWN",
      title: "Unable to load component",
      description: error.message || "The server could not resolve this code.",
    };
  }

  return {
    kind: "NETWORK",
    title: "Unable to load component",
    description: "Check your connection and try again.",
  };
}

export type CameraFailureKind =
  | "unsupported"
  | "permission-denied"
  | "unavailable"
  | "no-camera"
  | "unknown";

/** What the operator is told when the camera cannot be opened. */
export interface CameraFailure {
  kind: CameraFailureKind;
  title: string;
  description: string;
}

/**
 * Shown when the browser exposes no camera API at all.
 *
 * On iPhone that is not a broken phone: camera access requires a secure
 * context, so a scanner served over plain HTTP has no `navigator.mediaDevices`
 * and can never scan. Saying so is the only way the operator can tell this
 * apart from a denied permission.
 */
export const CAMERA_UNSUPPORTED_FAILURE: CameraFailure = {
  kind: "unsupported",
  title: "Camera unavailable",
  description:
    "This browser cannot reach a camera. On iPhone the scanner has to be served over HTTPS and opened in Safari.",
};

/** Copy for a denied/blocked camera permission. */
export const CAMERA_PERMISSION_FAILURE: CameraFailure = {
  kind: "permission-denied",
  title: "Camera access is required",
  description:
    "Ananya needs the camera to scan. Allow camera access for this site, then try again.",
};

const CAMERA_FAILURE_BY_ERROR_NAME: Record<string, CameraFailure> = {
  NotAllowedError: CAMERA_PERMISSION_FAILURE,
  SecurityError: CAMERA_PERMISSION_FAILURE,
  NotFoundError: {
    kind: "no-camera",
    title: "No camera found",
    description: "This device did not report a camera to the browser.",
  },
  DevicesNotFoundError: {
    kind: "no-camera",
    title: "No camera found",
    description: "This device did not report a camera to the browser.",
  },
  OverconstrainedError: {
    kind: "no-camera",
    title: "Camera unavailable",
    description: "The rear camera could not be opened on this device.",
  },
  NotReadableError: {
    kind: "unavailable",
    title: "Camera is busy",
    description: "Another app is using the camera. Close it and try again.",
  },
  TrackStartError: {
    kind: "unavailable",
    title: "Camera is busy",
    description: "Another app is using the camera. Close it and try again.",
  },
  AbortError: {
    kind: "unavailable",
    title: "Camera stopped",
    description: "The camera stopped before it was ready. Try again.",
  },
};

/**
 * Classifies a `getUserMedia` rejection.
 *
 * The browser error names are the only stable signal here, so the lookup is by
 * name and anything unrecognised falls back to a retryable message rather than
 * claiming a cause.
 */
export function describeCameraFailure(error: unknown): CameraFailure {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name?: unknown }).name ?? "")
      : "";

  return (
    CAMERA_FAILURE_BY_ERROR_NAME[name] ?? {
      kind: "unknown",
      title: "Camera did not start",
      description:
        "The camera could not be opened. Close other camera apps and try again.",
    }
  );
}

export interface DisplayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SourceCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Maps the reticle, measured in CSS pixels, onto the video's own pixels.
 *
 * The preview is `object-cover`, so the frame is scaled up until it covers the
 * element and then centred — the visible window is a crop of the source, not
 * the whole source. Decoding only the reticle is what makes the guide honest
 * (the scanner reads where the operator aims) and keeps each frame cheap on a
 * phone. Returns `null` when the video has not reported its dimensions yet or
 * the element is not laid out, so callers can skip the frame instead of
 * decoding a stale region.
 */
export function displayRectToVideoCrop(
  rect: DisplayRect,
  container: DisplayRect,
  source: { width: number; height: number },
): SourceCrop | null {
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    container.width <= 0 ||
    container.height <= 0 ||
    source.width <= 0 ||
    source.height <= 0
  ) {
    return null;
  }

  const scale = Math.max(
    container.width / source.width,
    container.height / source.height,
  );
  const offsetX = (container.width - source.width * scale) / 2;
  const offsetY = (container.height - source.height * scale) / 2;

  const x = clamp(
    Math.round((rect.x - container.x - offsetX) / scale),
    0,
    source.width - 1,
  );
  const y = clamp(
    Math.round((rect.y - container.y - offsetY) / scale),
    0,
    source.height - 1,
  );
  const width = clamp(
    Math.round(rect.width / scale),
    1,
    source.width - x,
  );
  const height = clamp(
    Math.round(rect.height / scale),
    1,
    source.height - y,
  );

  return { x, y, width, height };
}

/**
 * Whether the page is running as an installed app (iPhone Home Screen).
 *
 * iOS still only reports the legacy `navigator.standalone`, Safari and other
 * browsers report the `display-mode` media query, so both are checked. Used to
 * keep an "exit to dashboard" affordance out of the installed app, which has no
 * browser chrome to escape from and must stay a scanner.
 */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;

  const legacyStandalone = (
    window.navigator as Navigator & { standalone?: boolean }
  ).standalone;
  if (legacyStandalone === true) return true;

  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches
  );
}
