import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import type { DocumentDto, DocumentVersionDto } from "./api/documents-api";
import {
  DEFAULT_DOCUMENT_TYPE,
  DOCUMENTATION_EMPTY_STATE,
  DOCUMENT_SOURCE_TYPE_LABELS,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPE_OPTIONS,
  DOCUMENT_TYPES,
  applyDocumentCreated,
  applyDocumentRemoved,
  applyDocumentUpdated,
  canPreviewDocument,
  countDocumentationByType,
  describeVersion,
  documentCardActions,
  documentSourceLabel,
  documentTypeLabel,
  documentVersionLabel,
  externalReferenceHost,
  formatDocumentDate,
  formatDocumentSize,
  formatTagInput,
  isExternalReference,
  parseTagInput,
  resolveDocumentPreviewKind,
  sortDocumentation,
  suggestDocumentTitle,
  suggestDocumentType,
  unsupportedPreviewMessage,
  validateExternalUrlInput,
} from "./component-documentation";

/**
 * Pass 1 coverage: Component Documentation presentation.
 *
 * There is no DOM testing library in this workspace (no jsdom/RTL), so rendering
 * claims are covered by source assertions over the real files — the convention
 * used by the consolidation and review-queue suites. Everything else is pure
 * logic and is exercised directly.
 */

const webRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const repoRoot = path.resolve(webRoot, "../..");
const read = (absolutePath: string) => fs.readFileSync(absolutePath, "utf8");

const panelPath = path.join(
  webRoot,
  "components/documentation/documentation-panel.tsx",
);
const cardPath = path.join(
  webRoot,
  "components/documentation/documentation-card.tsx",
);
const addDialogPath = path.join(
  webRoot,
  "components/documentation/add-documentation-dialog.tsx",
);
const editDialogPath = path.join(
  webRoot,
  "components/documentation/edit-documentation-dialog.tsx",
);
const viewerPath = path.join(webRoot, "components/ui/document-viewer.tsx");
const versionDialogPath = path.join(
  webRoot,
  "components/ui/version-history-dialog.tsx",
);
const documentsApiPath = path.join(webRoot, "lib/api/documents-api.ts");
const componentPagePath = path.join(webRoot, "app/components/[id]/page.tsx");
const legacyPanelPath = path.join(webRoot, "components/ui/attachment-panel.tsx");
const apiTypesPath = path.join(
  repoRoot,
  "apps/api/src/documents/document-types.ts",
);
const apiFileRulesPath = path.join(
  repoRoot,
  "apps/api/src/documents/document-file.ts",
);

function buildDocument(overrides: Partial<DocumentDto> = {}): DocumentDto {
  return {
    id: "doc-1",
    entityType: "Component",
    entityId: "comp-1",
    documentType: "DATASHEET",
    sourceType: "UPLOADED_FILE",
    title: "RC0805 Datasheet",
    description: null,
    tags: [],
    isConfidential: false,
    externalUrl: null,
    externalUrlHost: null,
    fileName: "RC0805.pdf",
    fileUrl: "/documents/doc-1/download",
    mimeType: "application/pdf",
    sizeBytes: 2048,
    currentVersion: 1,
    uploadedById: "user-1",
    createdAt: "2026-09-18T10:00:00.000Z",
    updatedAt: "2026-09-19T10:00:00.000Z",
    downloadPath: "/documents/doc-1/download",
    previewPath: "/documents/doc-1/preview",
    ...overrides,
  };
}

function buildExternal(overrides: Partial<DocumentDto> = {}): DocumentDto {
  return buildDocument({
    id: "doc-link",
    sourceType: "EXTERNAL_URL",
    documentType: "PRODUCT_PAGE",
    title: "Manufacturer product page",
    externalUrl: "https://www.vishay.com/en/product/88746/",
    externalUrlHost: "www.vishay.com",
    fileName: null,
    fileUrl: null,
    mimeType: null,
    sizeBytes: null,
    downloadPath: null,
    previewPath: null,
    ...overrides,
  });
}

describe("Documentation vocabulary", () => {
  it("mirrors the API document type vocabulary exactly", () => {
    const apiSource = read(apiTypesPath);
    const apiTypes = [...apiSource.matchAll(/^ {2}'([A-Z_]+)',$/gm)].map(
      (match) => match[1],
    );

    expect(apiTypes.length).toBeGreaterThan(0);
    expect([...DOCUMENT_TYPES]).toEqual(apiTypes);
  });

  it("labels every type and offers every type in a selector", () => {
    for (const type of DOCUMENT_TYPES) {
      expect(DOCUMENT_TYPE_LABELS[type]).toBeTruthy();
    }
    expect(DOCUMENT_TYPE_OPTIONS.map((option) => option.value)).toEqual([
      ...DOCUMENT_TYPES,
    ]);
    expect(DOCUMENT_TYPE_OPTIONS.every((option) => option.label.length > 0)).toBe(
      true,
    );
    expect(documentTypeLabel("THREE_D_MODEL")).toBe("3D Model");
    expect(documentTypeLabel("FOOTPRINT")).toBe("Footprint");
    expect(documentTypeLabel("PRODUCT_PAGE")).toBe("Product Page");
    expect(documentTypeLabel(null)).toBe("Other");
    expect(documentTypeLabel("NONSENSE")).toBe("Other");
    expect(DEFAULT_DOCUMENT_TYPE).toBe("OTHER");
  });

  it("labels both source kinds", () => {
    expect(documentSourceLabel(buildDocument())).toBe(
      DOCUMENT_SOURCE_TYPE_LABELS.UPLOADED_FILE,
    );
    expect(documentSourceLabel(buildExternal())).toBe(
      DOCUMENT_SOURCE_TYPE_LABELS.EXTERNAL_URL,
    );
  });
});

describe("Documentation preview capability", () => {
  it("classifies what the viewer can actually render", () => {
    expect(resolveDocumentPreviewKind("application/pdf")).toBe("PDF");
    expect(resolveDocumentPreviewKind("image/png")).toBe("IMAGE");
    expect(resolveDocumentPreviewKind("text/plain")).toBe("TEXT");
    expect(resolveDocumentPreviewKind("application/json")).toBe("TEXT");
    expect(resolveDocumentPreviewKind("application/pdf; charset=x")).toBe("PDF");
  });

  it("reports engineering formats as unsupported instead of pretending", () => {
    for (const mime of [
      "model/step",
      "model/stl",
      "image/vnd.dwg",
      "image/vnd.dxf",
      "image/tiff",
      "application/octet-stream",
      "application/zip",
    ]) {
      expect(resolveDocumentPreviewKind(mime)).toBe("UNSUPPORTED");
    }
    expect(resolveDocumentPreviewKind(null)).toBe("UNSUPPORTED");
    expect(resolveDocumentPreviewKind(undefined)).toBe("UNSUPPORTED");
  });

  it("treats only browser-renderable image types as images", () => {
    for (const mime of [
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "image/bmp",
      "image/svg+xml",
    ]) {
      expect(resolveDocumentPreviewKind(mime)).toBe("IMAGE");
    }
  });

  it("never offers preview for an external reference or an unrenderable file", () => {
    expect(canPreviewDocument(buildDocument({ mimeType: "application/pdf" }))).toBe(
      true,
    );
    expect(canPreviewDocument(buildDocument({ mimeType: "model/step" }))).toBe(
      false,
    );
    expect(canPreviewDocument(buildExternal())).toBe(false);
  });

  it("explains the unsupported state and points at the download", () => {
    const message = unsupportedPreviewMessage(
      buildDocument({ mimeType: "model/step", fileName: "bracket.step" }),
    );
    expect(message).toContain("model/step");
    expect(message).toContain("bracket.step");
    expect(message).toMatch(/download/i);
  });
});

describe("Documentation card actions", () => {
  it("offers file actions for an uploaded file", () => {
    expect(documentCardActions(buildDocument())).toEqual([
      "PREVIEW",
      "DOWNLOAD",
      "VERSIONS",
      "EDIT",
      "DELETE",
    ]);
  });

  it("offers only link actions for an external reference", () => {
    const actions = documentCardActions(buildExternal());
    expect(actions).toEqual(["OPEN", "EDIT", "DELETE"]);
    for (const forbidden of ["PREVIEW", "DOWNLOAD", "VERSIONS"]) {
      expect(actions).not.toContain(forbidden);
    }
  });

  it("renders the version badge only for stored files", () => {
    expect(documentVersionLabel(buildDocument({ currentVersion: 3 }))).toBe("v3");
    expect(documentVersionLabel(buildExternal())).toBeNull();
  });

  it("describes a revision with its size", () => {
    const version: DocumentVersionDto = {
      id: "v-2",
      documentId: "doc-1",
      versionNumber: 2,
      fileName: "a.pdf",
      fileUrl: "/documents/doc-1/download?version=2",
      mimeType: "application/pdf",
      sizeBytes: 4096,
      changelog: null,
      uploadedById: null,
      createdAt: "2026-09-20T10:00:00.000Z",
    };
    expect(describeVersion(version)).toBe("v2 • 4.0 KB");
  });
});

describe("Documentation formatting", () => {
  it("formats file sizes and tolerates missing values", () => {
    expect(formatDocumentSize(512)).toBe("512 B");
    expect(formatDocumentSize(2048)).toBe("2.0 KB");
    expect(formatDocumentSize(5 * 1024 * 1024)).toBe("5.0 MB");
    // External references have no size, and none is invented for them.
    expect(formatDocumentSize(null)).toBeNull();
    expect(formatDocumentSize(undefined)).toBeNull();
  });

  it("formats dates and refuses to guess an invalid one", () => {
    expect(formatDocumentDate("2026-09-20T10:00:00.000Z")).toMatch(/2026/);
    expect(formatDocumentDate("not-a-date")).toBe("—");
  });

  it("shows the host of an external reference from the API value", () => {
    expect(externalReferenceHost(buildExternal())).toBe("www.vishay.com");
    expect(
      externalReferenceHost(buildExternal({ externalUrlHost: null })),
    ).toBe("www.vishay.com");
    expect(
      externalReferenceHost(
        buildExternal({ externalUrlHost: null, externalUrl: "broken" }),
      ),
    ).toBeNull();
    expect(externalReferenceHost(buildDocument())).toBeNull();
  });

  it("detects external references", () => {
    expect(isExternalReference(buildExternal())).toBe(true);
    expect(isExternalReference(buildDocument())).toBe(false);
  });
});

describe("Documentation add defaults", () => {
  it("suggests a document type from the file without analysing its content", () => {
    expect(suggestDocumentType("bracket.step")).toBe("THREE_D_MODEL");
    expect(suggestDocumentType("board.dxf")).toBe("CAD_DRAWING");
    expect(suggestDocumentType("photo.png", "image/png")).toBe("PHOTOGRAPH");
    expect(suggestDocumentType("sheet.pdf", "application/pdf")).toBe("DATASHEET");
    expect(suggestDocumentType("results.csv", "text/csv")).toBe("TEST_REPORT");
    expect(suggestDocumentType("notes.txt", "text/plain")).toBe(
      "TECHNICAL_MANUAL",
    );
    expect(suggestDocumentType("mystery")).toBe(DEFAULT_DOCUMENT_TYPE);
  });

  it("derives a readable title from the file name", () => {
    expect(suggestDocumentTitle("RC0805FR-0710KL.pdf")).toBe(
      "RC0805FR-0710KL",
    );
    expect(suggestDocumentTitle("no-extension")).toBe("no-extension");
    expect(suggestDocumentTitle("   ")).toBe("");
  });

  it("validates external URLs with the same rules as the API", () => {
    const ok = validateExternalUrlInput("https://example.com/a.pdf");
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.host).toBe("example.com");
    }

    for (const rejected of [
      "",
      "example.com",
      "javascript:alert(1)",
      "ftp://example.com/a",
      "https://user:pass@example.com/a",
    ]) {
      expect(validateExternalUrlInput(rejected).ok).toBe(false);
    }
  });

  it("normalises the tag input", () => {
    expect(parseTagInput("power, smd , power,  ,thermal")).toEqual([
      "power",
      "smd",
      "thermal",
    ]);
    expect(parseTagInput("")).toEqual([]);
    expect(formatTagInput(["a", "b"])).toBe("a, b");
    expect(formatTagInput(null)).toBe("");
    expect(parseTagInput(formatTagInput(["x", "y"]))).toEqual(["x", "y"]);
  });
});

describe("Documentation list updates (targeted cache behaviour)", () => {
  const older = buildDocument({
    id: "doc-old",
    createdAt: "2026-09-01T00:00:00.000Z",
  });
  const newer = buildDocument({
    id: "doc-new",
    createdAt: "2026-09-10T00:00:00.000Z",
  });

  it("adds a created record in place, newest first, without refetching", () => {
    const list = applyDocumentCreated([older], newer);
    expect(list.map((document) => document.id)).toEqual([
      "doc-new",
      "doc-old",
    ]);
  });

  it("does not duplicate a record that is already listed", () => {
    const list = applyDocumentCreated([older], older);
    expect(list).toHaveLength(1);
  });

  it("replaces a record after an edit or a new version", () => {
    const updated = buildDocument({
      id: "doc-new",
      title: "Renamed",
      currentVersion: 2,
      createdAt: "2026-09-10T00:00:00.000Z",
    });
    const list = applyDocumentUpdated([newer, older], updated);
    expect(list.find((document) => document.id === "doc-new")?.title).toBe(
      "Renamed",
    );
    expect(list.find((document) => document.id === "doc-new")?.currentVersion).toBe(
      2,
    );
    expect(list).toHaveLength(2);
  });

  it("ignores an update for a record that is not in the list", () => {
    const list = applyDocumentUpdated([older], newer);
    expect(list).toEqual([older]);
  });

  it("removes a deleted record", () => {
    const list = applyDocumentRemoved([newer, older], "doc-new");
    expect(list.map((document) => document.id)).toEqual(["doc-old"]);
  });

  it("sorts newest first without mutating the input", () => {
    const input = [older, newer];
    const sorted = sortDocumentation(input);
    expect(sorted.map((document) => document.id)).toEqual([
      "doc-new",
      "doc-old",
    ]);
    expect(input[0]!.id).toBe("doc-old");
  });

  it("counts records by type", () => {
    expect(
      countDocumentationByType([
        buildDocument({ documentType: "DATASHEET" }),
        buildDocument({ id: "b", documentType: "DATASHEET" }),
        buildExternal(),
      ]),
    ).toEqual({ DATASHEET: 2, PRODUCT_PAGE: 1 });
  });
});

describe("Documentation empty state", () => {
  it("states what documentation is for", () => {
    expect(DOCUMENTATION_EMPTY_STATE.title).toBe(
      "No documentation has been added to this component yet.",
    );
    expect(DOCUMENTATION_EMPTY_STATE.description).toContain("datasheets");
    expect(DOCUMENTATION_EMPTY_STATE.description).toContain("CAD files");
    expect(DOCUMENTATION_EMPTY_STATE.actionLabel).toBe("Add Documentation");
  });
});

describe("Documentation API client", () => {
  it("sends multipart requests and never base64 payloads", () => {
    const source = read(documentsApiPath);
    expect(source).toContain("new FormData()");
    expect(source).toContain("form.append(\"file\"");
    for (const forbidden of ["fileContent", "readAsDataURL", "storageKey"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("updates metadata with PATCH, matching the controller route", () => {
    const source = read(documentsApiPath);
    expect(source).toContain("apiClient.patch");
    expect(source).not.toMatch(/apiClient\.post<DocumentDto>\(\s*`\/documents\/\$\{id\}`/);
    const apiClientSource = read(path.join(webRoot, "lib/api-client.ts"));
    expect(apiClientSource).toContain("patch: <T, B = unknown>");
  });

  it("fetches document bytes through authenticated blob endpoints", () => {
    const source = read(documentsApiPath);
    expect(source).toContain("fetchDocumentBlob");
    expect(source).toContain("fetchPreviewBlob");
    expect(source).toContain("/download");
    expect(source).toContain("/preview");
    const apiClientSource = read(path.join(webRoot, "lib/api-client.ts"));
    expect(apiClientSource).toContain("getBlob");
    expect(apiClientSource).toContain("authorizationHeaders");
  });

  it("no longer references the unserved /uploads path", () => {
    const files = [
      documentsApiPath,
      panelPath,
      cardPath,
      viewerPath,
      versionDialogPath,
      addDialogPath,
    ];
    for (const file of files) {
      expect(read(file)).not.toContain("/uploads/");
    }
    // The superseded panel is prose only: it renders nothing of its own.
    const legacy = read(legacyPanelPath);
    expect(legacy).not.toContain("href=");
    expect(legacy).not.toContain("fileUrl");
  });
});

describe("Documentation UI wiring", () => {
  it("mounts the documentation section on the component detail page", () => {
    const page = read(componentPagePath);
    expect(page).toContain("DocumentationPanel");
    expect(page).toContain('entityType="Component"');
    expect(page).toContain("entityId={component.id}");
  });

  it("reuses the existing panel path for a single implementation", () => {
    const legacy = read(legacyPanelPath);
    expect(legacy).toContain("DocumentationPanel");
    expect(legacy).toMatch(/superseded/i);
    // No second, divergent implementation is left behind.
    expect(legacy).not.toContain("documentsApi");
    expect(legacy).not.toContain("FileUploader");
  });

  it("offers the empty state with an add action", () => {
    const panel = read(panelPath);
    expect(panel).toContain("DOCUMENTATION_EMPTY_STATE");
    expect(panel).toContain("Add Documentation");
    expect(panel).toContain("EmptyState");
  });

  it("updates the list from each mutation response instead of reloading", () => {
    const panel = read(panelPath);
    expect(panel).toContain("applyDocumentCreated");
    expect(panel).toContain("applyDocumentUpdated");
    expect(panel).toContain("applyDocumentRemoved");
    expect(panel).not.toContain("window.location.reload");
    expect(panel).not.toContain("router.refresh");
  });

  it("offers both add modes with the required fields", () => {
    const dialog = read(addDialogPath);
    expect(dialog).toContain("Upload File");
    expect(dialog).toContain("External URL");
    for (const field of [
      "Document Type",
      "Title",
      "Description",
      "Tags",
      "URL",
    ]) {
      expect(dialog).toContain(field);
    }
    expect(dialog).toContain("suggestDocumentType");
    expect(dialog).toContain("suggestDocumentTitle");
  });

  it("keeps the source kind fixed when editing", () => {
    const dialog = read(editDialogPath);
    expect(dialog).toContain("updateMetadata");
    expect(dialog).toMatch(/fixed|replaced by uploading/i);
  });

  it("previews from a fetched blob and reports unsupported formats", () => {
    const viewer = read(viewerPath);
    expect(viewer).toContain("fetchPreviewBlob");
    expect(viewer).toContain("createObjectURL");
    expect(viewer).toContain("revokeObjectURL");
    expect(viewer).toContain("unsupportedPreviewMessage");
  });

  it("uploads revisions as multipart and keeps them downloadable", () => {
    const dialog = read(versionDialogPath);
    expect(dialog).toContain("createVersion");
    expect(dialog).toContain("fetchDocumentBlob");
    expect(dialog).not.toContain("readAsDataURL");
  });

  it("renders the card fields and action labels", () => {
    const card = read(cardPath);
    for (const label of [
      "Preview",
      "Download",
      "Versions",
      "Edit",
      "Open",
    ]) {
      expect(card).toContain(label);
    }
    expect(card).toContain("documentTypeLabel");
    expect(card).toContain("documentSourceLabel");
    expect(card).toContain("formatDocumentDate");
  });

  it("uploads only files the API accepts", () => {
    const library = read(path.join(webRoot, "lib/component-documentation.ts"));
    const acceptConstant = library.slice(
      library.indexOf("DOCUMENT_FILE_ACCEPT"),
      library.indexOf("export type DocumentPreviewKind"),
    );
    // The picker advertises the same engineering formats the API resolves.
    for (const extension of [".step", ".stl", ".dwg", ".dxf", ".pdf"]) {
      expect(acceptConstant).toContain(extension);
    }
    expect(read(apiFileRulesPath)).toContain("model/step");
    // The dialog uses that single definition rather than its own list.
    expect(read(addDialogPath)).toContain("DOCUMENT_FILE_ACCEPT");
  });

  it("never fakes file metadata for an external reference", () => {
    const addDialog = read(addDialogPath);
    // The URL mode does not send file fields at all.
    const urlBranch = addDialog.slice(addDialog.indexOf("createExternalUrl"));
    expect(urlBranch).not.toContain("form.append(\"file\"");
    expect(addDialog).toContain("Nothing is downloaded or mirrored");
  });
});

describe("Documentation section boundaries", () => {
  it("parses no documents in the browser", () => {
    // Pass 2 added AI analysis, but the extraction itself stays server-side:
    // the documentation UI never reads or interprets file bytes client-side.
    const files = [panelPath, cardPath, addDialogPath, editDialogPath];
    for (const file of files) {
      const source = read(file).toLowerCase();
      for (const forbidden of [
        "ocr",
        "crawl",
        "scrape",
        "pdf-parse",
        "pdfjs",
        "extracttext",
      ]) {
        expect(source).not.toContain(forbidden);
      }
    }
  });

  it("sends analysis to the API instead of implementing it", () => {
    const dialog = read(
      path.join(webRoot, "components/documentation/document-analysis-dialog.tsx"),
    );
    expect(dialog).toContain("documentationIntelligenceApi");
    // No client-side extraction library is imported anywhere in the feature.
    const library = read(
      path.join(webRoot, "lib/document-intelligence.ts"),
    );
    for (const forbidden of ["pdfjs", "pdf-parse", "tesseract"]) {
      expect(library).not.toContain(forbidden);
    }
  });

  it("never mutates component data from the documentation UI", () => {
    // Applying a suggestion happens in the existing Component Review Queue or
    // the existing attribute endpoint, never from the documentation section.
    const files = [
      panelPath,
      cardPath,
      addDialogPath,
      editDialogPath,
      path.join(webRoot, "components/documentation/document-analysis-dialog.tsx"),
    ];
    for (const file of files) {
      const source = read(file);
      expect(source).not.toContain("componentsApi.update");
      expect(source).not.toContain('apiClient.put("/components');
      expect(source).not.toContain("/components/attributes");
    }
  });
});
