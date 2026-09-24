/**
 * QR / barcode label templates.
 *
 * One file per template face, plus the registry that declares which templates
 * exist. `label-preview.tsx` owns the props and the dispatch; each template
 * renders one physical sticker and nothing else.
 */

export type { LabelTemplate } from "./registry";
export {
  TEMPLATE_OPTIONS,
  QR_ONLY_TEMPLATES,
  isQrOnlyTemplate,
} from "./registry";

export { cleanSubtitle } from "./label-text";

export type { StandardLabelProps } from "./standard-label";
export { StandardLabel } from "./standard-label";

export type { CompactLabelProps } from "./compact-label";
export { CompactLabel } from "./compact-label";

export type { DetailedLabelProps } from "./detailed-label";
export { DetailedLabel } from "./detailed-label";

export type { ShelfBinLabelProps } from "./shelf-bin-label";
export { ShelfBinLabel } from "./shelf-bin-label";

export type { SquareLabelProps } from "./square-label";
export { SquareLabel } from "./square-label";

export type { QrOnlyLabelProps } from "./qr-only-label";
export { QrOnlyLabel } from "./qr-only-label";

export type { MiniQrLabelProps } from "./mini-qr-label";
export { MiniQrLabel } from "./mini-qr-label";
