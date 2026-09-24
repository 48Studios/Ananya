/**
 * Shared text helpers for label faces.
 *
 * A label receives `subtitle` as a display string built by the API's label
 * endpoint (e.g. `SKU: CMP-RES-0012 | Stock: 5000 pcs`), and some of it is
 * noise on a printed sticker. Trimming it here keeps every template that shows a
 * subtitle treating the string the same way.
 */
export function cleanSubtitle(text?: string): string {
  if (!text) return "";
  return text
    .replace(/\|\s*Unit:\s*[^|]+/gi, "")
    .replace(/Unit:\s*[^|]+/gi, "")
    .replace(/\|\s*Units:\s*[^|]+/gi, "")
    .replace(/\s+units?\b/gi, "")
    .replace(/\s*\|\s*$/, "")
    .replace(/^\s*\|\s*/, "")
    .trim();
}
