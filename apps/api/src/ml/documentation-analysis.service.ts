import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { db } from '@ananya/database';
import {
  attributeDefinitions,
  attributeOptions,
  componentIntelligenceFindings,
  components,
  documentIntelligenceAnalyses,
  documents,
  manufacturers,
} from '@ananya/database/schema';
import { and, desc, eq, inArray } from '@ananya/database/query';
import { StorageService } from '../documents/storage.service';
import { DocumentsService } from '../documents/documents.service';
import { ActivityService } from '../activity/activity.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import { MlClientService } from './ml-client.service';
import { MlService, extractManufacturerPartNumber } from './ml.service';
import {
  extractCandidateMpnFromText,
  normalizeName,
} from './component-duplicate-intelligence';
import {
  ComponentReviewQueueService,
  type PersistFindingsResult,
} from './component-review-queue.service';
import { DataPacksService } from '../data-packs/data-packs.service';
import {
  DATASHEET_INTELLIGENCE_VERSION,
  DOCUMENT_ANALYSIS_SOURCE,
  MAX_IDENTITY_TEXT_CHARS,
  type AnalysisEligibility,
  type AttributeCandidateDto,
  type DocumentAnalysisActor,
  type DocumentAnalysisDto,
  type DocumentAnalysisFindingDto,
  type DocumentAnalysisOptions,
  type DocumentAnalysisStateDto,
  type DocumentAnalysisStatus,
  type DocumentEvidenceDto,
  type DocumentIdentityDto,
  type RunDocumentAnalysisResultDto,
} from './documentation-intelligence.dtos';
import {
  ATTRIBUTE_VALUE_ISSUE_CATEGORY,
  buildDocumentAttributeFindings,
  DOCUMENT_ATTRIBUTE_SOURCE,
  suggestedAttributeDisplay,
} from './document-attribute-value-review';
import { loadComponentAttributeDisplays } from './current-attribute-value';
import {
  buildDocumentFindingFingerprints,
  buildDocumentIdentity,
  buildDocumentIdentityFindings,
  collectAnalysisEvidence,
  evaluateAnalysisEligibility,
  normalizeExtraction,
  resolveAttributeCandidates,
  selectManufacturerPartNumberCandidate,
  summarizeDocumentAnalysis,
  type AttributeDefinitionRef,
  type CurrentAttributeValue,
} from './documentation-intelligence';

interface AnalysisRow {
  id: string;
  documentId: string;
  componentId: string;
  documentVersion: number;
  contentHash: string;
  intelligenceVersion: string;
  extractorVersion: string | null;
  status: string;
  failureReason: string | null;
  documentType: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  pageCount: number | null;
  pagesAnalyzed: number | null;
  extractedTextPreview: string | null;
  identity: Record<string, unknown> | null;
  attributes: Array<Record<string, unknown>> | null;
  evidence: Array<Record<string, unknown>> | null;
  summary: Record<string, unknown> | null;
  findingFingerprints: string[] | null;
  analyzedByEmail: string | null;
  analyzedAt: Date;
}

/** Defaults used when a stored analysis has no identity payload yet. */
const EMPTY_DOCUMENT_IDENTITY: DocumentIdentityDto = {
  evidence: [],
  manufacturerName: null,
  manufacturerId: null,
  manufacturerCode: null,
  manufacturerResolution: null,
  manufacturerMatchType: null,
  manufacturerConfidence: null,
  manufacturerConfidenceLevel: null,
  manufacturerPartNumber: null,
  manufacturerPartNumberSource: null,
  manufacturerPartNumberConfidence: null,
  categoryName: null,
  categoryId: null,
};

/** Defaults used when a stored analysis has no summary payload yet. */
const EMPTY_ANALYSIS_SUMMARY = {
  extractedSpecifications: 0,
  matchedDefinitions: 0,
  unresolvedDefinitions: 0,
  unresolvedValues: 0,
  conflicts: 0,
  evidenceCount: 0,
  findingsCreated: 0,
  findingsPending: 0,
} as const;

/**
 * Datasheet Documentation Intelligence.
 *
 * The pipeline is deliberately one-way and advisory:
 *
 *   document → storage bytes → existing ML extraction → existing component
 *   intelligence → evidence → reviewable candidates + EXISTING review-queue
 *   findings → human decision → EXISTING apply workflow
 *
 * Guarantees enforced here:
 *  - everything is resolved server-side (document, component, version, bytes);
 *    no client-supplied id, path, key or version is trusted;
 *  - the analysis never mutates a component, manufacturer, MPN, category or
 *    attribute value — the only writes are the analysis record and findings;
 *  - the analysis is bound to the exact bytes it read (SHA-256 + version), so
 *    evidence can never be attributed to a revision that did not produce it;
 *  - re-running the same analysis is idempotent (same identity → same row, same
 *    finding fingerprints → no duplicates);
 *  - a failed ML call writes an explicit ANALYSIS_FAILED row and zero findings,
 *    leaving normal ERP operation untouched.
 */
@Injectable()
export class DocumentationAnalysisService {
  private readonly logger = new Logger(DocumentationAnalysisService.name);

  /**
   * Per-document in-flight guard.
   *
   * Synchronous request/response is adequate here (the existing ML envelope is
   * a few hundred milliseconds), but two concurrent clicks must not both run and
   * race on the analysis row, so a second concurrent request is refused with a
   * clear conflict instead of duplicating work or failing on the unique index.
   */
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly documentsService: DocumentsService,
    private readonly storageService: StorageService,
    private readonly mlClient: MlClientService,
    private readonly mlService: MlService,
    private readonly reviewQueue: ComponentReviewQueueService,
    private readonly dataPacksService: DataPacksService,
    private readonly activityService: ActivityService,
    private readonly auditService: SecurityAuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async getAnalysisState(
    documentId: string,
  ): Promise<DocumentAnalysisStateDto> {
    const document = await this.loadDocument(documentId);
    const eligibility = await this.evaluateEligibility(document.id);

    const [current, latest] = await Promise.all([
      this.findAnalysisForVersion(document.id, document.currentVersion),
      this.findLatestAnalysis(document.id),
    ]);

    const [currentFindings, latestFindings] = await Promise.all([
      current
        ? this.loadFindingsForAnalysis(document.id, current.componentId)
        : Promise.resolve([]),
      latest && (!current || latest.id !== current.id)
        ? this.loadFindingsForAnalysis(document.id, latest.componentId)
        : Promise.resolve([]),
    ]);

    return {
      documentId,
      eligibility,
      analysis: current
        ? await this.toDto(current, document.currentVersion, currentFindings)
        : null,
      latestAnalysis:
        latest && (!current || latest.id !== current.id)
          ? await this.toDto(latest, document.currentVersion, latestFindings)
          : null,
      inProgress: this.inFlight.has(document.id),
    };
  }

  // -------------------------------------------------------------------------
  // Analysis
  // -------------------------------------------------------------------------

  async analyzeDocument(
    documentId: string,
    actor: DocumentAnalysisActor,
    options: DocumentAnalysisOptions = {},
  ): Promise<RunDocumentAnalysisResultDto> {
    const startedAt = Date.now();
    const document = await this.loadDocument(documentId);

    const eligibility = await this.evaluateEligibility(document.id);
    if (!eligibility.available) {
      throw new BadRequestException(eligibility.message);
    }

    if (this.inFlight.has(document.id)) {
      throw new ConflictException(
        'An analysis of this document is already running. Wait for it to finish.',
      );
    }
    this.inFlight.add(document.id);

    try {
      return await this.runAnalysis(document, actor, startedAt, options);
    } finally {
      this.inFlight.delete(document.id);
    }
  }

  private async runAnalysis(
    document: Awaited<ReturnType<DocumentationAnalysisService['loadDocument']>>,
    actor: DocumentAnalysisActor,
    startedAt: number,
    options: DocumentAnalysisOptions = {},
  ): Promise<RunDocumentAnalysisResultDto> {
    const componentId = await this.resolveComponentId(document);
    const version = document.currentVersion;

    // Read the exact bytes of the current version. The version is resolved
    // server-side here, never taken from the request.
    const file = await this.documentsService.resolveFileContent(
      document.id,
      version,
    );
    const contentHash = createHash('sha256').update(file.buffer).digest('hex');

    const context = {
      documentId: document.id,
      documentVersion: version,
      documentFileName: file.fileName ?? document.fileName ?? null,
      contentHash,
    };

    const existing = await this.findAnalysisForVersion(document.id, version);
    if (existing && existing.contentHash === contentHash) {
      // Same bytes, same extractor: the previous result is authoritative and is
      // refreshed in place rather than duplicated.
      this.logger.log(
        `Re-using the existing analysis for document ${document.id} v${version}.`,
      );
    }

    const datapackHints = await this.dataPacksService
      .getActiveIntelligenceHints()
      .catch(() => []);

    const extractionResponse = await this.mlClient.extractDatasheet({
      pdf_base64: file.buffer.toString('base64'),
      datapack_hints: datapackHints,
    });

    if (!extractionResponse) {
      // Explicit failure: record it, produce NO findings, mutate nothing.
      const failed = await this.persistAnalysis({
        document,
        componentId,
        version,
        contentHash,
        status: 'ANALYSIS_FAILED',
        extractorVersion: null,
        failureReason:
          'Datasheet extraction did not complete. The ML service may be unavailable or the file could not be parsed.',
        documentType: document.documentType,
        fileName: file.fileName ?? document.fileName ?? null,
        fileSizeBytes: file.buffer.length,
        pageCount: null,
        pagesAnalyzed: null,
        extractedTextPreview: null,
        extraction: {},
        identity: {},
        attributes: [],
        evidence: [],
        summary: {},
        findingFingerprints: [],
        mlDurationMs: Date.now() - startedAt,
        actor,
      });

      throw new BadRequestException(
        failed.failureReason ?? 'Datasheet extraction did not complete.',
      );
    }

    const normalized = normalizeExtraction(extractionResponse);
    const identity = await this.buildIdentity(
      document,
      normalized.extractedText,
      context,
      normalized.pageCount,
    );

    const [definitions, currentValues] = await Promise.all([
      this.loadAttributeDefinitions(),
      this.loadCurrentAttributeValues(componentId),
    ]);

    const attributes = resolveAttributeCandidates({
      extraction: normalized,
      definitions,
      currentValues,
      context,
    });

    const evidence = collectAnalysisEvidence(attributes, identity);

    const component = await this.loadComponentForFindings(componentId);

    // Identity suggestions and attribute-value suggestions are both persisted
    // through the same review queue, in one call: same fingerprinting, same
    // lifecycle, same apply endpoint. Analysis still mutates nothing.
    const identityFindings = buildDocumentIdentityFindings({
      component,
      identity,
      context,
      documentTitle: document.title,
    });
    // A component-level aggregation is the authoritative materialization point
    // for actionable attribute findings, so an analysis run as one of its inputs
    // records the extraction without creating per-document suggestions that
    // would only be retired moments later.
    const materializeAttributeFindings =
      options.purpose !== 'AGGREGATION_SOURCE';

    const attributePlan = materializeAttributeFindings
      ? buildDocumentAttributeFindings({
          component,
          candidates: attributes,
          document: {
            documentId: document.id,
            documentVersion: version,
            documentFileName: file.fileName ?? document.fileName ?? null,
            contentHash,
            documentTitle: document.title,
          },
        })
      : null;

    const persisted = await this.persistFindings([
      ...identityFindings,
      ...(attributePlan?.findings ?? []),
    ]);

    // Attach the persisted review state to each candidate so the UI can render
    // one row per specification with its own Accept/Reject/Apply controls. When
    // attribute findings are deferred to aggregation, no per-document finding
    // exists to attach here: the component-level analysis links the candidate to
    // the aggregate finding instead, at read time.
    const candidatesWithReview = attributePlan
      ? this.attachReviewState(
          attributes,
          persisted.findings,
          attributePlan.fingerprintByAttributeDefinitionId,
        )
      : attributes;

    // Findings from an older revision of the same document describe bytes that
    // are no longer current: mark them stale so the reviewer cannot apply
    // evidence that does not match the file they are looking at. Historical
    // rows are preserved, never rewritten or deleted.
    const staledPreviousCount = await this.staleSupersededFindings(
      document.id,
      componentId,
      version,
    );

    const summary = summarizeDocumentAnalysis({
      attributes,
      identity,
      evidence,
      findingsCreated: persisted.createdCount,
      findingsPending: persisted.pendingCount,
    });

    const status: DocumentAnalysisStatus =
      persisted.findings.length > 0 ? 'FINDINGS_AVAILABLE' : 'ANALYZED';

    const row = await this.persistAnalysis({
      document,
      componentId,
      version,
      contentHash,
      status,
      extractorVersion: normalized.extractorVersion,
      failureReason: null,
      documentType: document.documentType,
      fileName: file.fileName ?? document.fileName ?? null,
      fileSizeBytes: file.buffer.length,
      pageCount: normalized.pageCount,
      pagesAnalyzed: normalized.pagesAnalyzed,
      extractedTextPreview: normalized.extractedTextPreview,
      extraction: {
        intelligenceVersion: DATASHEET_INTELLIGENCE_VERSION,
        extractorVersion: normalized.extractorVersion,
        attributeCount: normalized.attributes.length,
        extractedTextCharacters: normalized.extractedText?.length ?? 0,
        attributes: normalized.attributes,
      },
      identity: identity as unknown as Record<string, unknown>,
      attributes: candidatesWithReview as unknown as Array<
        Record<string, unknown>
      >,
      evidence: evidence as unknown as Array<Record<string, unknown>>,
      summary: summary as unknown as Record<string, unknown>,
      findingFingerprints: persisted.fingerprints,
      mlDurationMs: Date.now() - startedAt,
      actor,
    });

    await this.auditAnalysis(
      row.id,
      document.id,
      componentId,
      version,
      status,
      actor,
      {
        findingCount: persisted.findings.length,
        createdFindingCount: persisted.createdCount,
        attributeFindingCount: attributePlan?.findings.length ?? 0,
        // Recorded explicitly so a stored analysis explains why it carries no
        // attribute findings of its own.
        attributeFindingsDeferred: !materializeAttributeFindings,
        actionableAttributeCount: candidatesWithReview.filter(
          (candidate) => candidate.applicable,
        ).length,
        staleCount: staledPreviousCount,
        extractorVersion: normalized.extractorVersion,
      },
    );

    return {
      analysis: await this.toDto(
        row,
        document.currentVersion,
        persisted.findings,
      ),
      createdFindingCount: persisted.createdCount,
      staledPreviousCount,
      durationMs: Date.now() - startedAt,
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async loadDocument(documentId: string) {
    const [row] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Document #${documentId} not found`);
    }
    return row;
  }

  /**
   * Resolves the component a document belongs to.
   *
   * The relationship is read from the persisted document row, never from the
   * request, so a caller cannot analyze another component's documentation by
   * changing an id.
   */
  private async resolveComponentId(document: {
    entityType: string;
    entityId: string;
    id: string;
  }): Promise<string> {
    if (document.entityType !== 'Component') {
      throw new BadRequestException(
        'Datasheet analysis currently supports documentation filed against a component.',
      );
    }

    const [component] = await db
      .select({ id: components.id })
      .from(components)
      .where(eq(components.id, document.entityId))
      .limit(1);

    if (!component) {
      throw new NotFoundException(
        `Component #${document.entityId} for document #${document.id} not found`,
      );
    }

    return component.id;
  }

  /** Verifies eligibility from persisted state plus a real storage lookup. */
  private async evaluateEligibility(
    documentId: string,
  ): Promise<AnalysisEligibility> {
    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (!document) {
      throw new NotFoundException(`Document #${documentId} not found`);
    }

    let storageObjectExists = false;
    if (document.storageKey) {
      // The provider reports absence by resolving `false`; an unexpected error
      // is logged and treated as "not available" rather than blocking analysis.
      try {
        storageObjectExists = await this.storageService.exists(
          document.storageKey,
        );
      } catch (error) {
        this.logger.warn(
          `Storage check failed for document ${documentId}: ${String(error)}`,
        );
      }
    }

    return evaluateAnalysisEligibility({
      sourceType: document.sourceType,
      documentType: document.documentType,
      mimeType: document.mimeType,
      fileName: document.fileName,
      sizeBytes: document.sizeBytes,
      storageKey: document.storageKey,
      storageObjectExists,
    });
  }

  private async buildIdentity(
    document: { id: string; fileName: string | null; title: string },
    extractedText: string | null,
    context: {
      documentId: string;
      documentVersion: number;
      documentFileName: string | null;
      contentHash: string;
    },
    pageCount: number | null,
  ): Promise<DocumentIdentityDto> {
    const [allManufacturers, packagePatterns] = await Promise.all([
      db.select().from(manufacturers),
      this.loadPackagePatterns(),
    ]);

    // Reuses the existing pure MPN extractors: the document text is scanned with
    // the token-scanning variant (which keeps looking for a real part number
    // instead of stopping at the first word), while the file name — an
    // operator-chosen string that often carries internal references — is only a
    // last resort. Whichever candidate wins, its source is recorded.
    const mpnCandidate = selectManufacturerPartNumberCandidate([
      {
        value:
          extractCandidateMpnFromText(
            (extractedText ?? '').slice(0, 2000),
            allManufacturers,
            packagePatterns,
          ) ?? null,
        source: 'DOCUMENT_TEXT',
      },
      {
        value:
          extractManufacturerPartNumber(
            document.fileName ?? '',
            allManufacturers,
          ) ?? null,
        source: 'DOCUMENT_FILE_NAME',
      },
    ]);

    // Reuses the existing component intelligence (category + manufacturer +
    // duplicate detection) with the extracted document text as its input.
    let suggestion = null;
    try {
      suggestion = await this.mlService.suggest({
        query: (document.fileName ?? document.title).slice(0, 500),
        partNumber: mpnCandidate.value ?? undefined,
        description: document.title.slice(0, 1000),
        datasheetText: (extractedText ?? '').slice(0, MAX_IDENTITY_TEXT_CHARS),
      });
    } catch (error) {
      // Identity intelligence is best-effort: a failure degrades the analysis
      // (no identity candidates) instead of losing the extracted attributes.
      this.logger.warn(
        `Identity resolution failed for document ${document.id}: ${String(error)}`,
      );
      suggestion = null;
    }

    // A part number printed in the document wins over a file-name guess: it is
    // the more authoritative of the two, and the source is recorded either way.
    const fromSuggestion = suggestion?.manufacturerPartNumber?.trim() || null;
    const partNumber = fromSuggestion ?? mpnCandidate.value;
    const partNumberSource = fromSuggestion
      ? 'COMPONENT_INTELLIGENCE'
      : mpnCandidate.source;

    return buildDocumentIdentity({
      suggestion,
      manufacturerPartNumber: partNumber,
      manufacturerPartNumberSource: partNumberSource,
      context,
      pageCount,
    });
  }

  private async loadPackagePatterns(): Promise<string[]> {
    try {
      const hints = await this.dataPacksService.getActiveIntelligenceHints();
      const patterns = (hints ?? [])
        .flatMap((hint) => hint.packagePatterns ?? [])
        .filter((pattern): pattern is string => Boolean(pattern));
      return Array.from(new Set(patterns));
    } catch {
      return [];
    }
  }

  private async loadAttributeDefinitions(): Promise<AttributeDefinitionRef[]> {
    const [definitions, options] = await Promise.all([
      db.select().from(attributeDefinitions),
      db.select().from(attributeOptions),
    ]);

    const optionsByDefinition = new Map<
      string,
      Array<{ code: string; label: string }>
    >();
    for (const option of options) {
      const bucket =
        optionsByDefinition.get(option.attributeDefinitionId) ?? [];
      bucket.push({ code: option.code, label: option.label });
      optionsByDefinition.set(option.attributeDefinitionId, bucket);
    }

    return definitions.map((definition) => ({
      id: definition.id,
      code: definition.code,
      name: definition.name,
      dataType: definition.dataType,
      // The declared dimension is what lets the comparison layer judge whether an
      // extracted unit is the right kind of unit, not merely a known one.
      unitCategory: definition.unitCategory,
      defaultUnit: definition.defaultUnit,
      aliases: definition.aliases ?? [],
      options: optionsByDefinition.get(definition.id) ?? [],
      isActive: definition.isActive,
    }));
  }

  /** Current component values, used only to detect conflicts for the reviewer. */
  private async loadCurrentAttributeValues(
    componentId: string,
  ): Promise<Map<string, CurrentAttributeValue>> {
    // One shared, bounded reader (three queries for any number of attributes), so
    // the display form recorded here is exactly what the queue and the apply path
    // compare against later.
    const displays = await loadComponentAttributeDisplays(componentId);
    return new Map(
      [...displays].map(([attributeDefinitionId, display]) => [
        attributeDefinitionId,
        { attributeDefinitionId, display },
      ]),
    );
  }

  private async loadComponentForFindings(componentId: string) {
    const [component] = await db
      .select({
        id: components.id,
        sku: components.sku,
        name: components.name,
        manufacturerId: components.manufacturerId,
        manufacturerPartNumber: components.manufacturerPartNumber,
        updatedAt: components.updatedAt,
      })
      .from(components)
      .where(eq(components.id, componentId))
      .limit(1);

    if (!component) {
      throw new NotFoundException(`Component #${componentId} not found`);
    }
    return component;
  }

  /** Persists findings through the existing review queue, never directly. */
  private async persistFindings(
    findings: ReturnType<typeof buildDocumentIdentityFindings>,
  ): Promise<{
    findings: DocumentAnalysisFindingDto[];
    /** The queue's own finding records, for attaching review state. */
    rawFindings: PersistFindingsResult['findings'];
    fingerprints: string[];
    createdCount: number;
    pendingCount: number;
  }> {
    if (findings.length === 0) {
      return {
        findings: [],
        rawFindings: [],
        fingerprints: [],
        createdCount: 0,
        pendingCount: 0,
      };
    }

    const fingerprints = buildDocumentFindingFingerprints(findings);
    const before = await this.loadExistingFingerprints(fingerprints);

    const result: PersistFindingsResult =
      await this.reviewQueue.persistFindings(findings);

    const dtos = result.findings.map((finding) =>
      this.toFindingDto(finding, before.has(finding.fingerprint)),
    );

    return {
      findings: dtos,
      rawFindings: result.findings,
      fingerprints,
      createdCount: dtos.filter((dto) => dto.isNew).length,
      pendingCount: dtos.filter((dto) => dto.status === 'PENDING').length,
    };
  }

  private async loadExistingFingerprints(
    fingerprints: string[],
  ): Promise<Set<string>> {
    if (fingerprints.length === 0) return new Set();
    const rows = await db
      .select({ fingerprint: componentIntelligenceFindings.fingerprint })
      .from(componentIntelligenceFindings)
      .where(inArray(componentIntelligenceFindings.fingerprint, fingerprints));
    return new Set(rows.map((row) => row.fingerprint));
  }

  private toFindingDto(
    finding: PersistFindingsResult['findings'][number],
    existed: boolean,
  ): DocumentAnalysisFindingDto {
    return {
      id: finding.id,
      issueType: finding.issueType,
      issueCategory: finding.issueCategory,
      field: this.readFindingField(finding.metadata),
      title: finding.title,
      status: finding.status,
      fingerprint: finding.fingerprint,
      confidence: finding.confidence,
      confidenceLevel: finding.confidenceLevel,
      isNew: !existed,
      attributeDefinitionId: readString(
        finding.metadata?.attributeDefinitionId,
      ),
      applied: finding.metadata?.applicationResult === 'APPLIED',
    };
  }

  /**
   * Attaches the persisted review state to the candidates it belongs to.
   *
   * Matched by fingerprint: the plan maps each attribute definition to the
   * fingerprint its finding was persisted under, and the analysis finding DTO
   * carries the review state that resulted. Candidates without an actionable
   * finding keep `review: null` and remain informational, so the UI never
   * implies there is something to apply when there is not.
   */
  private attachReviewState(
    candidates: AttributeCandidateDto[],
    findings: DocumentAnalysisFindingDto[],
    fingerprintByAttributeDefinitionId: Map<string, string>,
  ): AttributeCandidateDto[] {
    const findingByFingerprint = new Map(
      findings.map((finding) => [finding.fingerprint, finding]),
    );

    return candidates.map((candidate) => {
      if (!candidate.applicable || !candidate.attributeDefinitionId) {
        return candidate;
      }

      const fingerprint = fingerprintByAttributeDefinitionId.get(
        candidate.attributeDefinitionId,
      );
      const finding = fingerprint
        ? findingByFingerprint.get(fingerprint)
        : undefined;
      if (!finding) return candidate;

      return {
        ...candidate,
        review: {
          findingId: finding.id,
          status: finding.status,
          fingerprint: finding.fingerprint,
          // Whether this suggestion is new since the previous analysis run: the
          // reviewer is told what changed, not just what exists.
          isNew: finding.isNew,
          applied: finding.applied,
        },
      };
    });
  }

  /**
   * Stales this document's findings that were produced from a different
   * revision, so the queue never offers evidence that does not describe the
   * current file. Runs through the review queue's existing stale mechanism.
   */
  private async staleSupersededFindings(
    documentId: string,
    componentId: string,
    currentVersion: number,
  ): Promise<number> {
    const rows = await db
      .select({
        id: componentIntelligenceFindings.id,
        metadata: componentIntelligenceFindings.metadata,
      })
      .from(componentIntelligenceFindings)
      .where(
        and(
          eq(componentIntelligenceFindings.componentId, componentId),
          // Identity suggestions and attribute-value suggestions both describe
          // the document revision they were extracted from, so a new revision
          // makes both kinds historical.
          inArray(componentIntelligenceFindings.source, [
            DOCUMENT_ANALYSIS_SOURCE,
            DOCUMENT_ATTRIBUTE_SOURCE,
          ]),
          eq(componentIntelligenceFindings.status, 'PENDING'),
        ),
      );

    const superseded = rows.filter((row) => {
      const metadata = row.metadata ?? {};
      const documentRef =
        typeof metadata.document === 'object' && metadata.document !== null
          ? (metadata.document as Record<string, unknown>)
          : {};
      return (
        documentRef.documentId === documentId &&
        typeof documentRef.documentVersion === 'number' &&
        documentRef.documentVersion !== currentVersion
      );
    });

    if (superseded.length === 0) return 0;

    const result = await this.reviewQueue.markFindingsStale({
      ids: superseded.map((row) => row.id),
      reason: `Superseded by analysis of datasheet version ${currentVersion}`,
    });

    return result.staledCount;
  }

  private async persistAnalysis(input: {
    document: { id: string; title: string };
    componentId: string;
    version: number;
    contentHash: string;
    status: DocumentAnalysisStatus;
    extractorVersion: string | null;
    failureReason: string | null;
    documentType: string | null;
    fileName: string | null;
    fileSizeBytes: number | null;
    pageCount: number | null;
    pagesAnalyzed: number | null;
    extractedTextPreview: string | null;
    extraction: Record<string, unknown>;
    identity: Record<string, unknown>;
    attributes: Array<Record<string, unknown>>;
    evidence: Array<Record<string, unknown>>;
    summary: Record<string, unknown>;
    findingFingerprints: string[];
    mlDurationMs: number | null;
    actor: DocumentAnalysisActor;
  }): Promise<AnalysisRow> {
    const values = {
      documentId: input.document.id,
      componentId: input.componentId,
      documentVersion: input.version,
      contentHash: input.contentHash,
      intelligenceVersion: DATASHEET_INTELLIGENCE_VERSION,
      extractorVersion: input.extractorVersion,
      status: input.status,
      failureReason: input.failureReason,
      documentType: input.documentType,
      fileName: input.fileName,
      fileSizeBytes: input.fileSizeBytes,
      pageCount: input.pageCount,
      pagesAnalyzed: input.pagesAnalyzed,
      extractedTextPreview: input.extractedTextPreview,
      extraction: input.extraction,
      identity: input.identity,
      attributes: input.attributes,
      evidence: input.evidence,
      summary: input.summary,
      findingFingerprints: input.findingFingerprints,
      mlDurationMs: input.mlDurationMs,
      analyzedById: input.actor.id ?? null,
      analyzedByEmail: input.actor.email ?? null,
      analyzedAt: new Date(),
      updatedAt: new Date(),
    };

    // Upsert on the deterministic analysis identity: re-analyzing identical
    // bytes with the same contract refreshes the row instead of adding one, so
    // an idempotent re-run cannot accumulate duplicate rows.
    const [row] = await db
      .insert(documentIntelligenceAnalyses)
      .values(values)
      .onConflictDoUpdate({
        target: [
          documentIntelligenceAnalyses.documentId,
          documentIntelligenceAnalyses.documentVersion,
          documentIntelligenceAnalyses.contentHash,
          documentIntelligenceAnalyses.intelligenceVersion,
        ],
        set: {
          status: values.status,
          failureReason: values.failureReason,
          extractorVersion: values.extractorVersion,
          pageCount: values.pageCount,
          pagesAnalyzed: values.pagesAnalyzed,
          extractedTextPreview: values.extractedTextPreview,
          extraction: values.extraction,
          identity: values.identity,
          attributes: values.attributes,
          evidence: values.evidence,
          summary: values.summary,
          findingFingerprints: values.findingFingerprints,
          mlDurationMs: values.mlDurationMs,
          analyzedById: values.analyzedById,
          analyzedByEmail: values.analyzedByEmail,
          analyzedAt: values.analyzedAt,
          updatedAt: values.updatedAt,
        },
      })
      .returning();

    if (!row) {
      throw new Error('Failed to persist the document analysis record.');
    }

    return row;
  }

  private async auditAnalysis(
    analysisId: string,
    documentId: string,
    componentId: string,
    documentVersion: number,
    status: DocumentAnalysisStatus,
    actor: DocumentAnalysisActor,
    details: Record<string, unknown>,
  ): Promise<void> {
    // Reuses the existing activity + security audit infrastructure. Both are
    // best-effort: a telemetry failure must never lose a completed analysis.
    const metadata = {
      analysisId,
      documentId,
      componentId,
      documentVersion,
      status,
      intelligenceVersion: DATASHEET_INTELLIGENCE_VERSION,
      ...details,
    };

    try {
      await this.activityService.createEvent({
        module: 'Documents',
        entityType: 'Component',
        entityId: componentId,
        eventType: 'DOCUMENT_ANALYZED',
        description: `Analyzed datasheet documentation (${status})`,
        severity: status === 'ANALYSIS_FAILED' ? 'WARN' : 'INFO',
        status: 'COMPLETED',
        metadata,
        userId: actor.id,
        userEmail: actor.email,
      });
    } catch (error) {
      this.logger.warn(
        `Could not record the analysis activity event: ${String(error)}`,
      );
    }

    try {
      await this.auditService.record({
        action: 'DOCUMENT_ANALYZED',
        category: 'Documents',
        userId: actor.id,
        userEmail: actor.email,
        details: metadata,
      });
    } catch (error) {
      this.logger.warn(
        `Could not record the analysis security audit entry: ${String(error)}`,
      );
    }
  }

  private async findAnalysisForVersion(
    documentId: string,
    version: number,
  ): Promise<AnalysisRow | null> {
    const [row] = await db
      .select()
      .from(documentIntelligenceAnalyses)
      .where(
        and(
          eq(documentIntelligenceAnalyses.documentId, documentId),
          eq(documentIntelligenceAnalyses.documentVersion, version),
        ),
      )
      .orderBy(desc(documentIntelligenceAnalyses.analyzedAt))
      .limit(1);
    return (row as AnalysisRow | undefined) ?? null;
  }

  private async findLatestAnalysis(
    documentId: string,
  ): Promise<AnalysisRow | null> {
    const [row] = await db
      .select()
      .from(documentIntelligenceAnalyses)
      .where(eq(documentIntelligenceAnalyses.documentId, documentId))
      .orderBy(desc(documentIntelligenceAnalyses.analyzedAt))
      .limit(1);
    return (row as AnalysisRow | undefined) ?? null;
  }

  private async toDto(
    row: AnalysisRow,
    liveDocumentVersion: number,
    findings?: DocumentAnalysisFindingDto[],
  ): Promise<DocumentAnalysisDto> {
    const identity = (row.identity ?? {}) as unknown as DocumentIdentityDto;
    const storedAttributes = (row.attributes ??
      []) as unknown as AttributeCandidateDto[];
    const evidence = (row.evidence ?? []) as unknown as DocumentEvidenceDto[];

    return {
      id: row.id,
      document: {
        documentId: row.documentId,
        documentVersion: row.documentVersion,
        fileName: row.fileName,
        documentType: row.documentType,
        contentHash: row.contentHash,
        fileSizeBytes: row.fileSizeBytes,
      },
      componentId: row.componentId,
      status: row.status as DocumentAnalysisStatus,
      intelligenceVersion: row.intelligenceVersion,
      extractorVersion: row.extractorVersion,
      isCurrent: row.documentVersion === liveDocumentVersion,
      supersededByVersion:
        row.documentVersion === liveDocumentVersion
          ? null
          : Math.max(row.documentVersion, liveDocumentVersion),
      failureReason: row.failureReason,
      pageCount: row.pageCount,
      pagesAnalyzed: row.pagesAnalyzed,
      extractedTextPreview: row.extractedTextPreview,
      identity: {
        ...EMPTY_DOCUMENT_IDENTITY,
        ...identity,
      },
      summary: {
        ...EMPTY_ANALYSIS_SUMMARY,
        evidenceCount: evidence.length,
        ...((row.summary ?? {}) as unknown as Record<string, number>),
      },
      attributes: await this.refreshCandidateState(
        storedAttributes,
        findings ?? [],
        row.componentId,
      ),
      evidence,
      findings: findings ?? [],
      analyzedAt: row.analyzedAt.toISOString(),
      analyzedByEmail: row.analyzedByEmail,
    };
  }

  /**
   * Re-reads each specification's live state from the component and the current
   * finding rows.
   *
   * The stored `attributes` payload is the analysis-time snapshot, which cannot
   * know about a decision or an application made afterwards. Without this the
   * same specification would show as `Applied` in the review queue and as
   * pending with an empty `Current` in the datasheet panel — the reviewer would
   * have to re-run the analysis to see what already happened.
   *
   * Two bounded reads, never one per row: the component's attribute values, and
   * the findings already loaded by the caller. Matched by the fingerprint
   * recorded on both the candidate and the finding, so no field is re-parsed;
   * when a candidate has no fingerprint — because this analysis was an input to a
   * component-level aggregation and therefore has no per-document finding — the
   * authoritative attribute finding for the component is matched by attribute
   * definition instead.
   */
  private async refreshCandidateState(
    attributes: AttributeCandidateDto[],
    findings: DocumentAnalysisFindingDto[],
    componentId: string,
  ): Promise<AttributeCandidateDto[]> {
    if (attributes.length === 0) return attributes;

    const currentValues = await this.loadCurrentAttributeValues(componentId);
    const findingByFingerprint = new Map(
      findings.map((finding) => [finding.fingerprint, finding]),
    );
    // Attribute findings are component-scoped now, so the same finding is the
    // authoritative review item for this specification on every document.
    // Prefer a pending one, then the most recently created: that is the row a
    // reviewer would act on.
    const findingByAttribute = new Map<string, DocumentAnalysisFindingDto>();
    for (const finding of findings) {
      if (!finding.attributeDefinitionId) continue;
      const existing = findingByAttribute.get(finding.attributeDefinitionId);
      if (
        !existing ||
        (finding.status === 'PENDING' && existing.status !== 'PENDING')
      ) {
        findingByAttribute.set(finding.attributeDefinitionId, finding);
      }
    }

    return attributes.map((candidate) => {
      const attributeDefinitionId = candidate.attributeDefinitionId;
      const stored = candidate.review;

      const finding = stored?.fingerprint
        ? findingByFingerprint.get(stored.fingerprint)
        : attributeDefinitionId
          ? findingByAttribute.get(attributeDefinitionId)
          : undefined;

      const currentValue = attributeDefinitionId
        ? (currentValues.get(attributeDefinitionId)?.display ?? null)
        : candidate.currentValue;

      // `conflict` only has a meaning for a specification that is still
      // actionable; everything else keeps the analysis-time verdict (an
      // already-current value is informational, not a conflict to resolve).
      const conflict =
        !candidate.applicable || currentValue === candidate.currentValue
          ? candidate.conflict
          : currentValue !== null &&
            normalizeName(currentValue) !==
              normalizeName(suggestedAttributeDisplay(candidate));

      if (!finding && currentValue === candidate.currentValue) return candidate;

      return {
        ...candidate,
        currentValue,
        conflict,
        review: finding
          ? {
              findingId: finding.id,
              status: finding.status,
              fingerprint: finding.fingerprint,
              // `isNew` describes the run that produced the payload, so it is
              // kept as recorded; only state that changes over time is
              // refreshed.
              isNew: stored?.isNew ?? false,
              applied: finding.applied,
            }
          : candidate.review,
      };
    });
  }

  /**
   * Findings previously persisted for a document, used when rendering a stored
   * analysis (so a page reload shows the same review state without re-running
   * the extraction).
   */
  async loadFindingsForAnalysis(
    documentId: string,
    componentId: string,
  ): Promise<DocumentAnalysisFindingDto[]> {
    const rows = await db
      .select({
        id: componentIntelligenceFindings.id,
        issueType: componentIntelligenceFindings.issueType,
        issueCategory: componentIntelligenceFindings.issueCategory,
        title: componentIntelligenceFindings.title,
        status: componentIntelligenceFindings.status,
        fingerprint: componentIntelligenceFindings.fingerprint,
        confidence: componentIntelligenceFindings.confidence,
        confidenceLevel: componentIntelligenceFindings.confidenceLevel,
        metadata: componentIntelligenceFindings.metadata,
      })
      .from(componentIntelligenceFindings)
      .where(
        and(
          eq(componentIntelligenceFindings.componentId, componentId),
          // Both producers of document-derived findings, so an analysis reload
          // shows identity and attribute suggestions together.
          inArray(componentIntelligenceFindings.source, [
            DOCUMENT_ANALYSIS_SOURCE,
            DOCUMENT_ATTRIBUTE_SOURCE,
          ]),
        ),
      )
      .orderBy(desc(componentIntelligenceFindings.createdAt));

    return rows
      .filter((row) => {
        // Identity findings describe the document revision they were extracted
        // from, so they are scoped to it. Attribute findings are component-scoped
        // by design: the authoritative item for a specification is the
        // component-level one, whichever document happens to be open.
        if (row.issueCategory === ATTRIBUTE_VALUE_ISSUE_CATEGORY) return true;

        const metadata = row.metadata ?? {};
        const documentRef =
          typeof metadata.document === 'object' && metadata.document !== null
            ? (metadata.document as Record<string, unknown>)
            : {};
        return documentRef.documentId === documentId;
      })
      .map((row) => ({
        id: row.id,
        issueType: row.issueType,
        issueCategory: row.issueCategory,
        field: this.readFindingField(row.metadata),
        title: row.title,
        status: row.status,
        fingerprint: row.fingerprint,
        confidence: row.confidence === null ? null : Number(row.confidence),
        confidenceLevel:
          row.confidenceLevel === 'HIGH' ||
          row.confidenceLevel === 'MEDIUM' ||
          row.confidenceLevel === 'LOW'
            ? row.confidenceLevel
            : null,
        isNew: false,
        attributeDefinitionId: readString(row.metadata?.attributeDefinitionId),
        applied: row.metadata?.applicationResult === 'APPLIED',
      }));
  }

  /**
   * Component field a finding targets.
   *
   * The queue stores the field it was persisted with, which is authoritative for
   * every producer (`attributes.resistance` for attribute suggestions,
   * `manufacturer`/`manufacturerPartNumber` for identity). The rule-based
   * fallback covers rows persisted before the metadata carried a field.
   */
  private readFindingField(
    metadata: Record<string, unknown> | null,
  ): string | null {
    const stored = readString(metadata?.field);
    if (stored) return stored;

    const rule = metadata?.rule;
    if (
      rule === 'MANUFACTURER_UNRESOLVED' ||
      rule === 'MANUFACTURER_CONFLICT'
    ) {
      return 'manufacturer';
    }
    if (rule === 'MPN_MISSING' || rule === 'MPN_CONFLICT') {
      return 'manufacturerPartNumber';
    }
    return null;
  }
}

/** Narrows an unknown metadata value to a non-empty string. */
function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
