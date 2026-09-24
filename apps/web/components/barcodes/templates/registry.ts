/**
 * Label template registry — the one place a label template is declared.
 *
 * Adding a template means adding a member here (the compiler then demands an
 * entry in {@link TEMPLATE_OPTIONS}), a file in this folder, and a branch in
 * `label-preview.tsx`. Before this registry existed, the template list and its
 * picker labels were written out separately on the studio page and in both
 * print dialogs, so a new template could appear on one surface and be missing
 * from another.
 */

export type LabelTemplate =
  | "COMPACT"
  | "STANDARD"
  | "DETAILED"
  | "SHELF_BIN"
  | "SQUARE"
  | "QR_ONLY"
  | "MINI_QR";

/**
 * Picker labels, including each label's physical size where it has one.
 *
 * Typed as a total record of {@link LabelTemplate}, so a new template cannot be
 * added without a label for the picker.
 */
export const TEMPLATE_OPTIONS: Record<LabelTemplate, string> = {
  STANDARD: 'Standard (2" x 4")',
  COMPACT: 'Compact (1" x 2")',
  DETAILED: 'Detailed (3" x 4")',
  SHELF_BIN: 'Shelf Bin Tag (3" x 1.5")',
  SQUARE: 'Square Tag (2" x 2")',
  QR_ONLY: 'QR Only (1 Inch x 1 Inch)',
  MINI_QR: "Mini QR (1.1 cm x 1.1 cm)",
};

/**
 * Templates that carry a QR code and no 1D barcode, so the symbology picker is
 * meaningless for them.
 */
export const QR_ONLY_TEMPLATES: readonly LabelTemplate[] = [
  "COMPACT",
  "SHELF_BIN",
  "SQUARE",
  "QR_ONLY",
  "MINI_QR",
];

export function isQrOnlyTemplate(template: LabelTemplate): boolean {
  return QR_ONLY_TEMPLATES.includes(template);
}
