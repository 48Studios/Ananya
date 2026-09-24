"use client";

import type { LabelData } from "@/lib/api/barcodes-api";
import { QRCodeViewer } from "../qr-code-viewer";

// ---------------------------------------------------------------------------
// Mini QR label — 11 × 11 mm (1.1 cm square)
// ---------------------------------------------------------------------------
//
// The smallest face in the studio, for the lid of a small SMD box or the front
// of a drawer divider. It is `QR_ONLY` reduced to a 1.1 cm sticker: the QR does
// the identifying, and the item code underneath is there for the human who
// cannot scan for some reason.
//
// Everything is in `mm`, because a label measured in pixels changes size with
// browser zoom, and this one is 11 mm wide — a 1px rounding is already 0.26 mm
// of the printed sticker.
//
// The QR block is given the whole square minus the padding when there is no
// item code to print, so the loss of the code line buys back scanability rather
// than leaving a blank strip.
//
// Scanability: at the code-bearing size the block holds a ~7.0 mm symbol after
// its quiet zone; the actionable `/scan?code=…` payload is a 37-module symbol,
// so ≈300 dpi is what keeps two printer dots per module (203 dpi gives 1.4).

/** Printed edge length. 1.1 cm, so the size is stated once, in mm. */
export const MINI_QR_LABEL_MM = 11;

/** Inner margin. At this size every 0.1 mm is worth arguing about. */
export const MINI_QR_PADDING_MM = 0.4;

/** Gap between the QR block and the item code. */
export const MINI_QR_GAP_MM = 0.3;

/** QR block when the item code line is present, quiet zone included. */
export const MINI_QR_SIZE_MM = 8;

/** Item code size. The only text an 11 mm sticker can afford. */
export const MINI_QR_CODE_FONT_MM = 1.5;

export interface MiniQrLabelProps {
  label: LabelData;
  className?: string;
}

/**
 * Mini QR label — 11 × 11 mm.
 *
 * Black on white with no border, radius, shadow or gradient: it is a thermal
 * label, and at this size decoration is a millimetre the QR does not get.
 */
export function MiniQrLabel({ label, className = "" }: MiniQrLabelProps) {
  const code = (label.primaryCode ?? "").trim();
  const qrSizeMm = code
    ? MINI_QR_SIZE_MM
    : MINI_QR_LABEL_MM - 2 * MINI_QR_PADDING_MM;

  return (
    <div
      className={`bg-white text-black select-none flex flex-col items-center justify-center print:break-inside-avoid ${className}`}
      style={{
        width: `${MINI_QR_LABEL_MM}mm`,
        height: `${MINI_QR_LABEL_MM}mm`,
        boxSizing: "border-box",
        padding: `${MINI_QR_PADDING_MM}mm`,
        gap: `${MINI_QR_GAP_MM}mm`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${qrSizeMm}mm`,
          height: `${qrSizeMm}mm`,
          flex: "0 0 auto",
          // A flex box, not a block: an inline-level child would add a line box
          // and its font's descender space below the SVG (~1 mm at this size),
          // which is how a 4 px overflow appears on an 11 mm label.
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {label.qrPayload ? (
          <QRCodeViewer
            value={label.qrPayload}
            // `[&>svg]` scales the vector to this mm box; the SVG carries a
            // viewBox and `shapeRendering="crispEdges"`, so it stays square and
            // stays crisp at any physical size.
            className="h-full w-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
            // An 11 mm label cannot afford the viewer's screen chrome: its
            // default p-1 + border is ~2.6 mm of the block on screen. `display`
            // is inline here because the viewer's own `inline-block` class and a
            // `block` utility are the same property at the same specificity —
            // which one wins is stylesheet order, not the class attribute.
            style={{
              display: "block",
              padding: 0,
              border: "none",
              borderRadius: 0,
              width: "100%",
              height: "100%",
            }}
          />
        ) : null}
      </div>

      {code ? (
        <span
          // `truncate` is the whole overflow strategy here: one line, ellipsized
          // by the browser. A 1.1 cm label has no room for a second line.
          className="block max-w-full truncate text-center font-mono font-bold"
          style={{
            fontSize: `${MINI_QR_CODE_FONT_MM}mm`,
            lineHeight: 1.1,
          }}
        >
          {code}
        </span>
      ) : null}
    </div>
  );
}
