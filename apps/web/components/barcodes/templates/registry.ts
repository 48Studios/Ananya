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
  | "QR_CODE_2_INCH"
  | "QR_CODE_1_INCH"
  | "QR_CODE_11MM";

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
  QR_CODE_2_INCH: "QR Code (2 Inch x 1.25 Inch)",
  QR_CODE_1_INCH: "QR Code (1 Inch x 0.67 Inch)",
  QR_CODE_11MM: "QR Code (11 MM x 8 MM)",
};

/**
 * Templates that carry a QR code and no 1D barcode, so the symbology picker is
 * meaningless for them.
 *
 * "QR only" here is the *rule* (no linear barcode), not a template key: the
 * `QR_ONLY` template was merged into `QR_CODE_2_INCH`.
 */
export const QR_ONLY_TEMPLATES: readonly LabelTemplate[] = [
  "COMPACT",
  "SHELF_BIN",
  "QR_CODE_2_INCH",
  "QR_CODE_1_INCH",
  "QR_CODE_11MM",
];

export function isQrOnlyTemplate(template: LabelTemplate): boolean {
  return QR_ONLY_TEMPLATES.includes(template);
}
