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

export type { CompactHalfInchLabelProps } from "./compact-half-inch-label";
export { CompactHalfInchLabel } from "./compact-half-inch-label";

export type { DetailedLabelProps } from "./detailed-label";
export { DetailedLabel } from "./detailed-label";

export type { ShelfBinLabelProps } from "./shelf-bin-label";
export { ShelfBinLabel } from "./shelf-bin-label";

export type { QrCode2InchLabelProps } from "./qr-code-2-inch-label";
export { QrCode2InchLabel } from "./qr-code-2-inch-label";

export type { QrCode1InchLabelProps } from "./qr-code-1-inch-label";
export { QrCode1InchLabel } from "./qr-code-1-inch-label";

export type { QrCode11MmLabelProps } from "./qr-code-11mm-label";
export { QrCode11MmLabel } from "./qr-code-11mm-label";
