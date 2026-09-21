import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import type {
  AttributeCandidateDto,
  DocumentAnalysisDto,
  DocumentAnalysisStateDto,
  DocumentEvidenceDto,
} from "./api/documentation-intelligence-api";
import type { DocumentDto } from "./api/documents-api";
import {
  ANALYSIS_RUNNING_COPY,
  COMPONENT_REVIEW_QUEUE_ROUTE,
  COMPONENT_WRITE_PERMISSION,
  analysisFailureMessage,
  analysisStatusLabel,
  applicableCandidates,
  applyAnalysisResult,
  applyAnalysisState,
  buildAnalysisSummaryRows,
  buildEvidenceViewModel,
  candidateHeading,
  candidateResolutionLabel,
  candidateValueText,
  describeAnalysisStatus,
  describeEvidenceSource,
  describeFindingForDocument,
  deriveAnalyzeAction,
  hasDocumentExcerpt,
  hasReviewableOutput,
  markAnalysisInProgress,
  mergeAnalysisResult,
  supersededAnalysisNotice,
  unresolvedCandidates,
  type AnalysisStateMap,
} from "./document-intelligence";

/**
 * Pass 2 frontend coverage for Documentation Intelligence.
 *
 * Pure logic is exercised directly; rendering claims are source assertions over
 * the real files (this workspace has no DOM testing library).
 */

const webRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const repoRoot = path.resolve(webRoot, "../..");
const read = (absolutePath: string) => fs.readFileSync(absolutePath, "utf8");

const dialogPath = path.join(
  webRoot,
  "components/documentation/document-analysis-dialog.tsx",
);
const cardPath = path.join(
  webRoot,
  "components/documentation/documentation-card.tsx",
);
const panelPath = path.join(
  webRoot,
  "components/documentation/documentation-panel.tsx",
);
const apiPath = path.join(
  webRoot,
  "lib/api/documentation-intelligence-api.ts",
);
const apiDtosPath = path.join(
  repoRoot,
  "apps/api/src/ml/documentation-intelligence.dtos.ts",
);

const HTTPS_CONTEXT = {
  documentId: "doc-1",
  documentVersion: 2,
  documentFileName: "MC0805S8F3000T5E.pdf",
  contentHash: "a".repeat(64),
};

function evidence(overrides: Partial<DocumentEvidenceDto> = {}): DocumentEvidenceDto {
  return {
    type: "datasheet_param",
    description: "Extracted resistance rating 300Ω",
    weight: 0.95,
    source: "extractor:ee_regex",
    extractionMethod: "extractor:ee_regex",
    documentId: HTTPS_CONTEXT.documentId,
    documentVersion: HTTPS_CONTEXT.documentVersion,
    documentFileName: HTTPS_CONTEXT.documentFileName,
    documentContentHash: HTTPS_CONTEXT.contentHash,
    page: 3,
    text: "... resistance 300 ohm ±1% ...",
    role: "PRIMARY",
    section: "ELECTRICAL_CHARACTERISTICS",
    ...overrides,
  };
}

function candidate(
  overrides: Partial<AttributeCandidateDto> = {},
): AttributeCandidateDto {
  return {
    extractedCode: "resistance",
    formatted: "300Ω",
    unit: "ohm",
    rawValue: 300,
    confidence: 0.95,
    confidenceLevel: "HIGH",
    evidence: [evidence()],
    resolution: "DEFINITION_MATCHED",
    resolutionDetail: null,
    attributeDefinitionId: "def-resistance",
    attributeCode: "resistance",
    attributeName: "Resistance",
    dataType: "QUANTITY",
    normalizedValue: { value: 300, unit: "ohm" },
    optionCode: null,
    currentValue: null,
    conflict: false,
    resolutionState: "RESOLVED",
    validationState: "VALID",
    validationReason: null,
    applicable: true,
    inapplicableReason: null,
    validationDetail: null,
    resolutionConfidence: 0.96,
    resolutionReasons: [
      "the attribute code matches the extracted property exactly",
    ],
    resolutionCandidates: [],
    review: {
      findingId: "f-attr-1",
      status: "PENDING",
      fingerprint: "fp-attr-1",
      isNew: true,
      applied: false,
    },
    ...overrides,
  };
}

function analysis(
  overrides: Partial<DocumentAnalysisDto> = {},
): DocumentAnalysisDto {
  return {
    id: "analysis-1",
    document: {
      documentId: "doc-1",
      documentVersion: 2,
      fileName: "MC0805S8F3000T5E.pdf",
      documentType: "DATASHEET",
      contentHash: HTTPS_CONTEXT.contentHash,
      fileSizeBytes: 1400000,
    },
    componentId: "comp-1",
    status: "FINDINGS_AVAILABLE",
    intelligenceVersion: "datasheet-extract-v1",
    extractorVersion: "datasheet-extract-v1",
    isCurrent: true,
    supersededByVersion: null,
    failureReason: null,
    pageCount: 4,
    pagesAnalyzed: 4,
    extractedTextPreview: "…",
    identity: {
      manufacturerName: "Yageo",
      manufacturerId: "mfg-yageo",
      manufacturerCode: "YAGEO",
      manufacturerResolution: "EXISTING",
      manufacturerMatchType: "datasheet_mention",
      manufacturerConfidence: 0.94,
      manufacturerConfidenceLevel: "HIGH",
      manufacturerPartNumber: "MC0805S8F3000T5E",
      manufacturerPartNumberSource: "DOCUMENT_TEXT",
      manufacturerPartNumberConfidence: 0.9,
      categoryName: null,
      categoryId: null,
      evidence: [evidence({ page: null, text: null })],
    },
    summary: {
      extractedSpecifications: 4,
      matchedDefinitions: 3,
      unresolvedDefinitions: 1,
      unresolvedValues: 0,
      conflicts: 1,
      evidenceCount: 12,
      findingsCreated: 2,
      findingsPending: 5,
    },
    attributes: [candidate()],
    evidence: [evidence()],
    findings: [
      {
        id: "f-1",
        issueType: "MPN_MISSING",
        issueCategory: "IDENTITY",
        field: "manufacturerPartNumber",
        title: "Manufacturer part number not recorded",
        status: "PENDING",
        fingerprint: "fp-1",
        confidence: 0.9,
        confidenceLevel: "HIGH",
        isNew: true,
        attributeDefinitionId: null,
        applied: false,
      },
    ],
    analyzedAt: "2026-09-20T10:00:00.000Z",
    analyzedByEmail: "engineer@48studios.local",
    ...overrides,
  };
}

function documentDto(overrides: Partial<DocumentDto> = {}): DocumentDto {
  return {
    id: "doc-1",
    entityType: "Component",
    entityId: "comp-1",
    documentType: "DATASHEET",
    sourceType: "UPLOADED_FILE",
    title: "Datasheet",
    description: null,
    tags: [],
    isConfidential: false,
    externalUrl: null,
    externalUrlHost: null,
    fileName: "MC0805S8F3000T5E.pdf",
    fileUrl: "/documents/doc-1/download",
    mimeType: "application/pdf",
    sizeBytes: 1400000,
    currentVersion: 2,
    uploadedById: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-19T00:00:00.000Z",
    downloadPath: "/documents/doc-1/download",
    previewPath: "/documents/doc-1/preview",
    ...overrides,
  };
}

function state(
  overrides: Partial<DocumentAnalysisStateDto> = {},
): DocumentAnalysisStateDto {
  return {
    documentId: "doc-1",
    eligibility: { available: true },
    analysis: null,
    latestAnalysis: null,
    inProgress: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Analyze action availability
// ---------------------------------------------------------------------------

describe("Analyze with AI availability", () => {
  it('offers the action for an uploaded datasheet when the user can write', () => {
    expect(
      deriveAnalyzeAction({
        document: documentDto(),
        eligibility: { available: true },
        analyzing: false,
        canWrite: true,
      }),
    ).toEqual({ visible: true, enabled: true, reason: null });
  });

  it('hides the action for external references', () => {
    const action = deriveAnalyzeAction({
      document: documentDto({ sourceType: "EXTERNAL_URL" }),
      eligibility: {
        available: false,
        reason: "EXTERNAL_REFERENCE",
        message: "External links are not downloaded or analyzed.",
      },
      analyzing: false,
      canWrite: true,
    });

    expect(action.visible).toBe(false);
    expect(action.reason).toMatch(/external links/i);
  });

  it('hides the action for non-datasheet documents', () => {
    expect(
      deriveAnalyzeAction({
        document: documentDto({ documentType: "CAD_DRAWING" }),
        eligibility: {
          available: false,
          reason: "NOT_A_DATASHEET",
          message: "Only documents typed as Datasheet can be analyzed.",
        },
        analyzing: false,
        canWrite: true,
      }).visible,
    ).toBe(false);
  });

  it('hides the action for an image datasheet', () => {
    expect(
      deriveAnalyzeAction({
        document: documentDto({ mimeType: "image/png", fileName: "scan.png" }),
        eligibility: {
          available: false,
          reason: "NOT_A_PDF",
          message: "Datasheet analysis supports PDF files.",
        },
        analyzing: false,
        canWrite: true,
      }).visible,
    ).toBe(false);
  });

  it('disables the action while a request is in flight', () => {
    const action = deriveAnalyzeAction({
      document: documentDto(),
      eligibility: { available: true },
      analyzing: true,
      canWrite: true,
    });
    expect(action.visible).toBe(true);
    expect(action.enabled).toBe(false);
    expect(action.reason).toMatch(/running/i);
  });

  it('keeps the action visible but disabled without the write permission', () => {
    const action = deriveAnalyzeAction({
      document: documentDto(),
      eligibility: { available: true },
      analyzing: false,
      canWrite: false,
    });

    expect(action.visible).toBe(true);
    expect(action.enabled).toBe(false);
    expect(action.reason).toContain(COMPONENT_WRITE_PERMISSION);
  });

  it('never offers the action for a non-datasheet upload', () => {
    for (const documentType of ["USER_MANUAL", "PHOTOGRAPH", "OTHER"]) {
      const action = deriveAnalyzeAction({
        document: documentDto({ documentType }),
        eligibility: null,
        analyzing: false,
        canWrite: true,
      });
      expect(action.visible).toBe(false);
    }
  });

  it('reuses the existing component-write permission', () => {
    expect(COMPONENT_WRITE_PERMISSION).toBe("Inventory.Update");
  });
});

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

describe("analysis status", () => {
  it('labels every lifecycle state', () => {
    for (const status of [
      "ANALYZING",
      "ANALYZED",
      "FINDINGS_AVAILABLE",
      "ANALYSIS_FAILED",
    ]) {
      expect(analysisStatusLabel(status)).not.toBe(status);
    }
    expect(analysisStatusLabel("FINDINGS_AVAILABLE")).toBe(
      "Findings available",
    );
  });

  it('reports pending suggestions as work awaiting review', () => {
    expect(describeAnalysisStatus(analysis())).toContain("awaiting review");
  });

  it('reports extraction counts when nothing is pending', () => {
    expect(
      describeAnalysisStatus(
        analysis({
          summary: {
            extractedSpecifications: 4,
            matchedDefinitions: 4,
            unresolvedDefinitions: 0,
            unresolvedValues: 0,
            conflicts: 0,
            evidenceCount: 5,
            findingsCreated: 0,
            findingsPending: 0,
          },
        }),
      ),
    ).toBe("4 specifications extracted");
  });

  it('says so plainly when nothing reviewable was found', () => {
    expect(
      describeAnalysisStatus(
        analysis({
          summary: {
            extractedSpecifications: 0,
            matchedDefinitions: 0,
            unresolvedDefinitions: 0,
            unresolvedValues: 0,
            conflicts: 0,
            evidenceCount: 1,
            findingsCreated: 0,
            findingsPending: 0,
          },
        }),
      ),
    ).toMatch(/nothing reviewable/i);
  });

  it('flags an analysis of an older revision and never claims it is current', () => {
    const stale = analysis({ isCurrent: false, supersededByVersion: 3 });
    expect(describeAnalysisStatus(stale)).toMatch(/re-run/i);

    const notice = supersededAnalysisNotice(stale);
    expect(notice).toBeTruthy();
    expect(notice).toContain("version 2");
    expect(supersededAnalysisNotice(analysis())).toBeNull();
  });

  it('surfaces failures explicitly', () => {
    expect(
      describeAnalysisStatus(
        analysis({ status: "ANALYSIS_FAILED", failureReason: "ML unavailable" }),
      ),
    ).toBe("Analysis failed");
  });
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

describe("analysis summary", () => {
  it('builds rows from the reported counts only', () => {
    const rows = buildAnalysisSummaryRows(analysis());
    const byLabel = Object.fromEntries(rows.map((row) => [row.label, row.value]));

    expect(byLabel.Manufacturer).toBe("Yageo");
    expect(byLabel["Manufacturer part number"]).toBe("MC0805S8F3000T5E");
    expect(byLabel["Extracted specifications"]).toBe("3");
    expect(byLabel["Unresolved properties"]).toBe("1");
    expect(byLabel["Conflicts with recorded values"]).toBe("1");
    expect(byLabel["Evidence items"]).toBe("12");
    expect(byLabel["Review suggestions"]).toBe("5");
    // Every row explains itself.
    expect(rows.every((row) => row.hint.length > 0)).toBe(true);
  });

  it('omits rows that have nothing to report instead of showing zeros', () => {
    const rows = buildAnalysisSummaryRows(
      analysis({
        identity: {
          ...analysis().identity,
          manufacturerName: null,
          manufacturerPartNumber: null,
        },
        summary: {
          extractedSpecifications: 0,
          matchedDefinitions: 0,
          unresolvedDefinitions: 0,
          unresolvedValues: 0,
          conflicts: 0,
          evidenceCount: 0,
          findingsCreated: 0,
          findingsPending: 0,
        },
      }),
    );

    expect(rows).toEqual([]);
  });

  it('distinguishes where the part number came from', () => {
    const fromFile = buildAnalysisSummaryRows(
      analysis({
        identity: {
          ...analysis().identity,
          manufacturerPartNumberSource: "DOCUMENT_FILE_NAME",
        },
      }),
    ).find((row) => row.label === "Manufacturer part number")!;
    expect(fromFile.hint).toMatch(/file name/i);

    const fromText = buildAnalysisSummaryRows(analysis()).find(
      (row) => row.label === "Manufacturer part number",
    )!;
    expect(fromText.hint).toMatch(/document text/i);
  });
});

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

describe("attribute candidates", () => {
  it('labels each resolution state in the reviewer’s terms', () => {
    expect(candidateResolutionLabel("DEFINITION_MATCHED")).toMatch(/matched/i);
    expect(candidateResolutionLabel("NO_DEFINITION")).toBe(
      "Attribute definition not found",
    );
    expect(candidateResolutionLabel("UNRESOLVED_VALUE")).toMatch(/not/i);
  });

  it('separates applicable candidates from unresolved properties', () => {
    const matched = candidate();
    const noDefinition = candidate({
      extractedCode: "thermal_resistance",
      resolution: "NO_DEFINITION",
      attributeDefinitionId: null,
      normalizedValue: null,
    });
    const unresolvedValue = candidate({
      extractedCode: "tolerance",
      resolution: "UNRESOLVED_VALUE",
      normalizedValue: null,
    });

    const all = [matched, noDefinition, unresolvedValue];
    expect(applicableCandidates(all)).toEqual([matched]);
    expect(unresolvedCandidates(all)).toEqual([noDefinition, unresolvedValue]);
  });

  it('prefers the ERP attribute name for a resolved candidate', () => {
    expect(candidateHeading(candidate())).toBe("Resistance");
    expect(
      candidateHeading(
        candidate({
          attributeName: null,
          attributeCode: null,
        }),
      ),
    ).toBe("resistance");
  });

  it("does not duplicate the unit when it is already in the value", () => {
    // The extractor renders the unit symbolically, so the unit name is not
    // appended after it: the reviewer must never read "300Ω ohm".
    expect(candidateValueText(candidate({ formatted: "300Ω", unit: "ohm" }))).toBe(
      "300Ω",
    );
    expect(candidateValueText(candidate({ formatted: "1%", unit: "%" }))).toBe(
      "1%",
    );
    expect(candidateValueText(candidate({ formatted: "0.125W", unit: "W" }))).toBe(
      "0.125W",
    );
    expect(candidateValueText(candidate({ formatted: "300 ohm", unit: "ohm" }))).toBe(
      "300 ohm",
    );
    expect(candidateValueText(candidate({ formatted: "0805", unit: null }))).toBe(
      "0805",
    );
    // A bare number still gets the definition's unit.
    expect(candidateValueText(candidate({ formatted: "300", unit: "ohm" }))).toBe(
      "300 ohm",
    );
  });

  it('offers review only when there is something to review', () => {
    expect(hasReviewableOutput(analysis())).toBe(true);
    expect(
      hasReviewableOutput(analysis({ findings: [], attributes: [] })),
    ).toBe(false);
    // A candidate with no definition is not applicable, so it is not reviewable
    // through the attribute path.
    expect(
      hasReviewableOutput(
        analysis({
          findings: [],
          attributes: [
            candidate({
              resolution: "NO_DEFINITION",
              attributeDefinitionId: null,
            }),
          ],
        }),
      ),
    ).toBe(false);
  });

  it('points at the existing review queue', () => {
    expect(COMPONENT_REVIEW_QUEUE_ROUTE).toBe("/components/review-queue");
  });
});

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

describe("evidence display", () => {
  it('names the document, version, and page when the page is known', () => {
    expect(describeEvidenceSource(evidence())).toBe(
      "MC0805S8F3000T5E.pdf • v2 • Page 3",
    );
  });

  it('claims no page when the extractor could not locate the value', () => {
    const source = describeEvidenceSource(evidence({ page: null }));
    expect(source).toBe("MC0805S8F3000T5E.pdf • v2");
    expect(source).not.toMatch(/page/i);
  });

  it('degrades gracefully without a file name', () => {
    expect(
      describeEvidenceSource(evidence({ documentFileName: null, page: 1 })),
    ).toBe("Datasheet • v2 • Page 1");
  });

  it('builds a view model carrying the excerpt and method', () => {
    const [item] = buildEvidenceViewModel([evidence()]);
    expect(item!.source).toContain("Page 3");
    expect(item!.excerpt).toContain("300 ohm");
    expect(item!.extractionMethod).toBe("extractor:ee_regex");
    expect(item!.weight).toBe(0.95);
  });

  it('shows the description when there is no excerpt to quote', () => {
    const [item] = buildEvidenceViewModel([evidence({ text: null, page: null })]);
    expect(item!.excerpt).toBeNull();
    expect(item!.description).toContain("resistance");
    expect(hasDocumentExcerpt({ text: null })).toBe(false);
    expect(hasDocumentExcerpt({ text: "  " })).toBe(false);
    expect(hasDocumentExcerpt({ text: "300 ohm" })).toBe(true);
  });

  it('keeps a stable identity per evidence item', () => {
    const items = buildEvidenceViewModel([
      evidence(),
      evidence({ page: 4 }),
    ]);
    expect(items[0]!.id).not.toBe(items[1]!.id);
  });
});

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

describe("finding presentation", () => {
  it('names the document that produced the finding', () => {
    const text = describeFindingForDocument(
      {
        issueType: "MPN_MISSING",
        title: "Manufacturer part number not recorded",
        status: "PENDING",
      },
      { fileName: "MC0805S8F3000T5E.pdf", documentVersion: 2 },
    );

    expect(text).toContain("MC0805S8F3000T5E.pdf");
    expect(text).toContain("v2");
  });

  it('marks superseded findings as such', () => {
    expect(
      describeFindingForDocument(
        { issueType: "MPN_MISSING", title: "Title", status: "STALE" },
        { fileName: "d.pdf", documentVersion: 1 },
      ),
    ).toContain("superseded");
  });
});

// ---------------------------------------------------------------------------
// Targeted cache updates
// ---------------------------------------------------------------------------

describe("analysis state updates", () => {
  const initial: AnalysisStateMap = { "doc-1": state() };

  it('stores state per document without touching others', () => {
    const next = applyAnalysisState(initial, "doc-2", state({ documentId: "doc-2" }));
    expect(Object.keys(next).sort()).toEqual(["doc-1", "doc-2"]);
    expect(next["doc-1"]!.analysis).toBeNull();
  });

  it('merges a completed run so the card updates without a refetch', () => {
    const next = applyAnalysisResult(initial, { analysis: analysis() });
    expect(next["doc-1"]!.analysis?.id).toBe("analysis-1");
    expect(next["doc-1"]!.latestAnalysis?.id).toBe("analysis-1");
    expect(next["doc-1"]!.inProgress).toBe(false);
    // Eligibility is retained: it was already resolved.
    expect(next["doc-1"]!.eligibility).toEqual({ available: true });
  });

  it('merges a completed run into a single document state', () => {
    const merged = mergeAnalysisResult(null, { analysis: analysis() });
    expect(merged.documentId).toBe("doc-1");
    expect(merged.analysis?.id).toBe("analysis-1");
    expect(merged.inProgress).toBe(false);

    const retained = mergeAnalysisResult(state(), { analysis: analysis() });
    expect(retained.eligibility).toEqual({ available: true });
  });

  it('tracks the in-flight flag and clears it', () => {
    const running = markAnalysisInProgress(initial, "doc-1", true);
    expect(running["doc-1"]!.inProgress).toBe(true);

    const done = markAnalysisInProgress(running, "doc-1", false);
    expect(done["doc-1"]!.inProgress).toBe(false);
  });

  it('ignores a flag change for an unknown document instead of inventing state', () => {
    expect(markAnalysisInProgress(initial, "doc-unknown", true)).toBe(initial);
  });

  it('does not mutate the previous map', () => {
    const before = JSON.stringify(initial);
    applyAnalysisResult(initial, { analysis: analysis() });
    expect(JSON.stringify(initial)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Failure copy
// ---------------------------------------------------------------------------

describe("analysis failure copy", () => {
  it('uses the API message, which explains the specific case', () => {
    expect(
      analysisFailureMessage(new Error("Document is too large for datasheet analysis.")),
    ).toBe("Document is too large for datasheet analysis.");
    expect(
      analysisFailureMessage(
        new Error("Datasheet extraction did not complete. The ML service may be unavailable."),
      ),
    ).toMatch(/ML service/i);
  });

  it('states that nothing changed when there is no detail', () => {
    expect(analysisFailureMessage(undefined)).toMatch(
      /nothing on the component was changed/i,
    );
  });

  it('explains what is happening while running', () => {
    expect(ANALYSIS_RUNNING_COPY).toMatch(/extracting/i);
  });
});

// ---------------------------------------------------------------------------
// UI wiring (source assertions; no DOM library in this workspace)
// ---------------------------------------------------------------------------

describe("documentation intelligence UI wiring", () => {
  it('offers the Analyze with AI action on the document card', () => {
    const card = read(cardPath);
    expect(card).toContain("Analyze with AI");
    expect(card).toContain("deriveAnalyzeAction");
    expect(card).toContain("AI Analysis");
    expect(card).toContain("View AI Analysis");
  });

  it('shows a loading state while analyzing', () => {
    const card = read(cardPath);
    expect(card).toContain("Analyzing…");
    expect(card).toContain("animate-spin");
  });

  it('shows the analysis summary and evidence in the dialog', () => {
    const dialog = read(dialogPath);
    expect(dialog).toContain("buildAnalysisSummaryRows");
    expect(dialog).toContain("buildEvidenceViewModel");
    expect(dialog).toContain("Evidence");
    expect(dialog).toContain("Unresolved properties");
    expect(dialog).toContain("Summary");
  });

  it('states that analysis is advisory and never applied automatically', () => {
    const dialog = read(dialogPath);
    expect(dialog).toMatch(/suggestions only/i);
    expect(dialog).toMatch(/Nothing on the component changes/i);
  });

  it('hands review to the existing Component Review Queue', () => {
    const dialog = read(dialogPath);
    const panel = read(panelPath);
    expect(dialog).toContain("Review suggestions");
    expect(dialog).toContain("Open review queue");
    expect(panel).toContain("ComponentReviewQueueDialog");
    // No second review surface was created.
    for (const forbidden of [
      "DocumentationReviewQueue",
      "DocumentReviewQueue",
      "DatasheetReviewQueue",
    ]) {
      expect(dialog).not.toContain(forbidden);
      expect(panel).not.toContain(forbidden);
    }
  });

  it('explains unavailable analysis in the UI', () => {
    expect(read(dialogPath)).toContain("Analysis unavailable");
    expect(read(cardPath)).toContain("analyzeAction.reason");
  });

  it('warns when the analysis belongs to an older revision', () => {
    expect(read(dialogPath)).toContain("supersededAnalysisNotice");
  });

  it('updates the UI from the response without reloading', () => {
    const dialog = read(dialogPath);
    expect(dialog).toContain("mergeAnalysisResult");
    expect(dialog).not.toContain("window.location.reload");
    expect(dialog).not.toContain("router.refresh");
    expect(read(cardPath)).not.toContain("window.location.reload");
    expect(read(panelPath)).not.toContain("window.location.reload");
  });

  it('gates analysis on the component-write permission', () => {
    const panel = read(panelPath);
    expect(panel).toContain("hasPermission(COMPONENT_WRITE_PERMISSION)");
    expect(panel).toContain("canWrite={canWrite}");
  });

  it('queries analysis state only for eligible documents', () => {
    const panel = read(panelPath);
    expect(panel).toContain('document.documentType === "DATASHEET"');
    expect(panel).toContain('document.sourceType === "UPLOADED_FILE"');
  });

  it('never calls a mutation endpoint for component data', () => {
    const api = read(apiPath);
    // Only analysis endpoints exist in this client. Pass 4 adds the
    // component-level pair (state + analyze), which still analyses and persists
    // findings — it never writes a component field, and it addresses the
    // component only so the server can resolve its own documents.
    const calledEndpoints = [...api.matchAll(/`(\/[^`]*)`/g)].map(
      (match) => match[1]!,
    );
    expect(calledEndpoints.length).toBe(4);
    for (const endpoint of calledEndpoints) {
      expect(
        endpoint.startsWith("/ml/documents/") ||
          endpoint.startsWith("/ml/components/"),
      ).toBe(true);
      // Every path ends in an analysis route: reading state, or running it.
      expect(
        endpoint.endsWith("/analysis") ||
          endpoint.endsWith("/analyze") ||
          endpoint.endsWith("/documentation"),
      ).toBe(true);
    }
    expect(calledEndpoints.some((endpoint) => endpoint.endsWith("/analysis"))).toBe(
      true,
    );
    expect(calledEndpoints.some((endpoint) => endpoint.endsWith("/analyze"))).toBe(
      true,
    );

    // No component, attribute or manufacturer mutation path is reachable.
    expect(api).not.toContain("/attributes");
    expect(api).not.toContain("/review-queue");
    expect(api).not.toContain("apiClient.put");
    expect(api).not.toContain("apiClient.patch");
    expect(api).not.toContain("apiClient.delete");
  });

  it('mirrors the API contract version rather than inventing one', () => {
    const apiDtos = read(apiDtosPath);
    const web = read(path.join(webRoot, "lib/api/documentation-intelligence-api.ts"));
    expect(apiDtos).toContain("datasheet-extract-v2");
    // The web client consumes the version from the payload, never hardcoding a
    // second copy of it.
    expect(web).not.toContain("datasheet-extract-v1");
    expect(web).not.toContain("datasheet-extract-v2");
    for (const status of [
      "ANALYZING",
      "ANALYZED",
      "FINDINGS_AVAILABLE",
      "ANALYSIS_FAILED",
    ]) {
      expect(web).toContain(status);
    }
  });

  it('reuses the existing evidence conventions instead of a new framework', () => {
    const lib = read(path.join(webRoot, "lib/document-intelligence.ts"));
    // Evidence keeps the established type/description/weight/source shape.
    expect(lib).toContain("extractionMethod");
    expect(lib).not.toContain("createEvidenceFramework");
    for (const forbidden of ["newEvidenceSystem", "EvidenceFramework"]) {
      expect(lib).not.toContain(forbidden);
    }
  });
});
