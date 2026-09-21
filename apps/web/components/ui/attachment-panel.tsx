"use client";

/**
 * Superseded by the Component Documentation section.
 *
 * The original panel was a dormant, unreachable draft: it rendered every
 * document through a `/uploads/...` URL that was never served, uploaded base64
 * JSON, and had no document types, external references, permissions or file
 * validation. It has been replaced by `DocumentationPanel`
 * (`components/documentation/documentation-panel.tsx`), which covers the same
 * "documents attached to an entity" surface with a real, production-ready
 * implementation.
 *
 * This re-export is kept so the old import path still resolves to that single
 * implementation rather than a second, divergent copy.
 */
export {
  DocumentationPanel as AttachmentPanel,
  type DocumentationPanelProps as AttachmentPanelProps,
} from "@/components/documentation/documentation-panel";
