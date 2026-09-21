import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { db } from '@ananya/database';
import {
  attributeDefinitions,
  categoryAttributes,
  componentIntelligenceFindings,
  components,
} from '@ananya/database/schema';
import { and, eq, inArray } from '@ananya/database/query';
import type { ComponentIntelligenceFinding } from '@ananya/database/schema';
import { DocumentsService } from '../documents/documents.service';
import type { DocumentationRecord } from '../documents/documents.service';
import { DataPacksService } from '../data-packs/data-packs.service';
import { DocumentationAnalysisService } from './documentation-analysis.service';
import {
  ComponentReviewQueueService,
  buildFindingFingerprint,
} from './component-review-queue.service';
import {
  ATTRIBUTE_VALUE_ISSUE_CATEGORY,
  DOCUMENT_ATTRIBUTE_SOURCE,
} from './document-attribute-value-review';
import {
  DATASHEET_INTELLIGENCE_VERSION,
  MAX_COMPONENT_DOCUMENTS_ANALYZED,
  MAX_EVIDENCE_ITEMS_PER_SPECIFICATION,
  MAX_COMPONENT_SPECIFICATIONS,
  SPECIFICATION_DOCUMENT_TYPES,
  type AttributeCandidateDto,
  type AttributeCandidateReviewDto,
  type ComponentDocumentSkipDto,
  type ComponentDocumentationStateDto,
  type ComponentDocumentationSummaryDto,
  type DocumentAnalysisActor,
  type DocumentEvidenceDto,
  type RunComponentDocumentationAnalysisResultDto,
  type SpecificationAggregateDto,
  type SpecificationSourceDto,
  type SpecificationValueGroupDto,
  type UnmappedSpecificationDto,
} from './documentation-intelligence.dtos';
import {
  aggregateSpecifications,
  type AggregatedAttributeDefinition,
  type AggregatedSpecification,
  type SpecificationSourceCandidate,
} from './specification-aggregation';
import {
  loadComponentAttributeDisplays,
  loadUnitCatalog,
} from './current-attribute-value';

/** Finding types this service owns on the shared review queue. */
const SUGGESTION_ISSUE_TYPE = 'ATTRIBUTE_VALUE_SUGGESTION';
const CONFLICT_ISSUE_TYPE = 'DOCUMENT_CONFLICT';

/**
 * Component-level specification intelligence.
 *
 * Per-document analysis stays the authoritative primitive: this service is a
 * bounded aggregation layer over it. It discovers a component's own documents
 * server-side, analyses the eligible ones through the existing per-document
 * pipeline, and then combines what they say about the same attribute.
 *
 * Why it exists: one component usually states a specification in more than one
 * place. Analysing documents one at a time would produce a suggestion per
 * document, and a disagreement would be decided by whichever ran last. Here,
 * agreement produces **one** finding with every document as evidence, and
 * disagreement produces a conflict that no one can apply.
 *
 * Nothing here mutates component data. Applying a value remains the Pass 3
 * workflow on the existing review queue.
 */
@Injectable()
export class ComponentSpecificationIntelligenceService {
  private readonly logger = new Logger(
    ComponentSpecificationIntelligenceService.name,
  );

  constructor(
    private readonly documents: DocumentsService,
    private readonly analysis: DocumentationAnalysisService,
    private readonly reviewQueue: ComponentReviewQueueService,
    private readonly dataPacks?: DataPacksService,
  ) {}

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  /** The current specification intelligence for a component, without re-running. */
  async getState(componentId: string): Promise<ComponentDocumentationStateDto> {
    await this.assertComponentExists(componentId);

    const documents = await this.discoverDocuments(componentId);
    const [definitions, units, context] = await Promise.all([
      this.loadDefinitions(),
      loadUnitCatalog(),
      this.loadResolutionContext(componentId),
    ]);
    const currentValues = await this.loadCurrentValues(componentId);

    const { candidates, unmapped, analyzedDocumentIds, skipped } =
      await this.collectStoredCandidates(
        componentId,
        this.boundedDocuments(documents),
      );

    const aggregates = aggregateSpecifications({
      definitions,
      candidates,
      units,
      currentValues,
      expectedAttributeCodes: context.expectedAttributeCodes,
    }).slice(0, MAX_COMPONENT_SPECIFICATIONS);

    const findings = await this.loadAttributeFindings(componentId);
    const specifications = aggregates.map((aggregate) =>
      this.toSpecificationDto(aggregate, findings),
    );

    return {
      componentId,
      summary: await this.buildSummary({
        componentId,
        specifications,
        unmapped,
        documentsAnalyzed: analyzedDocumentIds.length,
        documentsNotAnalyzed: documents
          .filter((document) => !analyzedDocumentIds.includes(document.id))
          .map((document) => document.id),
        documentsSkipped: skipped,
        actor: null,
        durationMs: 0,
      }),
      specifications,
      unmapped,
      eligibleDocumentIds: documents.map((document) => document.id),
    };
  }

  // -------------------------------------------------------------------------
  // Analyze
  // -------------------------------------------------------------------------

  /**
   * Analyses every eligible document of a component and aggregates the result.
   *
   * Bounded at every level: documents analysed, specifications returned, and
   * evidence items per specification. A document that cannot be analysed is
   * reported as a skip rather than failing the run, so one unreadable file does
   * not hide the specifications the other documents state.
   */
  async analyzeComponent(
    componentId: string,
    actor: DocumentAnalysisActor,
  ): Promise<RunComponentDocumentationAnalysisResultDto> {
    const startedAt = Date.now();
    await this.assertComponentExists(componentId);

    const documents = await this.discoverDocuments(componentId);
    if (documents.length === 0) {
      return {
        summary: await this.buildSummary({
          componentId,
          specifications: [],
          unmapped: [],
          documentsAnalyzed: 0,
          documentsNotAnalyzed: [],
          documentsSkipped: [],
          actor,
          durationMs: Date.now() - startedAt,
        }),
        specifications: [],
        unmapped: [],
        createdFindingCount: 0,
        staledFindingCount: 0,
      };
    }

    const [definitions, units, context] = await Promise.all([
      this.loadDefinitions(),
      loadUnitCatalog(),
      this.loadResolutionContext(componentId),
    ]);

    const candidates: SpecificationSourceCandidate[] = [];
    const unmapped: UnmappedSpecificationDto[] = [];
    const analyzedDocumentIds: string[] = [];
    const skipped: ComponentDocumentSkipDto[] = [];

    for (const document of this.boundedDocuments(documents)) {
      try {
        // `AGGREGATION_SOURCE` records the extraction, its evidence and the
        // analysis row, but materializes no per-document attribute finding: the
        // aggregate persisted below is the authoritative review item for a
        // specification. Creating a suggestion per document here would mean
        // creating one only to retire it, and re-running would revive and retire
        // them again — churn that grows the stale set for no benefit.
        const result = await this.analysis.analyzeDocument(document.id, actor, {
          purpose: 'AGGREGATION_SOURCE',
        });
        analyzedDocumentIds.push(document.id);

        const analysis = result.analysis;
        for (const candidate of analysis.attributes) {
          if (!isMapped(candidate)) {
            unmapped.push(this.toUnmappedDto(candidate, document.id));
            continue;
          }
          // Mapped candidates are collected even when they are not applicable, so
          // a value the component already records is reported as ALREADY_CURRENT
          // rather than silently disappearing from the panel.
          candidates.push(
            this.toSourceCandidate(candidate, {
              documentId: document.id,
              documentVersion: analysis.document.documentVersion,
              documentContentHash: analysis.document.contentHash,
              documentFileName: document.fileName,
              documentType: document.documentType,
            }),
          );
        }
      } catch (error) {
        // One document failing must not lose the others' specifications.
        skipped.push({
          reason: 'ANALYSIS_FAILED',
          message:
            error instanceof Error
              ? error.message
              : 'The document could not be analyzed.',
          documentIds: [document.id],
        });
        this.logger.warn(
          `Component ${componentId}: document ${document.id} could not be analyzed: ${String(error)}`,
        );
      }
    }

    const currentValues = await this.loadCurrentValues(componentId);

    const aggregates = aggregateSpecifications({
      definitions,
      candidates,
      units,
      currentValues,
      expectedAttributeCodes: context.expectedAttributeCodes,
    }).slice(0, MAX_COMPONENT_SPECIFICATIONS);

    const persisted = await this.persistAggregateFindings(
      componentId,
      aggregates,
    );
    const findings = await this.loadAttributeFindings(componentId);
    const specifications = aggregates.map((aggregate) =>
      this.toSpecificationDto(aggregate, findings),
    );

    return {
      summary: await this.buildSummary({
        componentId,
        specifications,
        unmapped,
        documentsAnalyzed: analyzedDocumentIds.length,
        documentsNotAnalyzed: documents
          .filter((document) => !analyzedDocumentIds.includes(document.id))
          .map((document) => document.id),
        documentsSkipped: skipped,
        actor,
        durationMs: Date.now() - startedAt,
      }),
      specifications,
      unmapped,
      createdFindingCount: persisted.createdCount,
      staledFindingCount: persisted.staledCount,
    };
  }

  // -------------------------------------------------------------------------
  // Findings
  // -------------------------------------------------------------------------

  /**
   * Persists the aggregated findings and retires anything they supersede.
   *
   * One finding per specification, whatever the number of documents that state
   * it — and it is the *only* actionable attribute finding a component-level run
   * creates, because the analyses it consumed were run as aggregation sources.
   *
   * Reconciliation therefore has one job: retiring rows that an earlier version of
   * this pipeline (or a standalone per-document analysis) left pending. It only
   * touches PENDING rows, so a reviewer's decision is history and is never
   * rewritten, and it never revives a STALE row — which is what makes repeated
   * component analysis idempotent instead of cumulative.
   *
   * The evidence list is deliberately *not* part of the fingerprint (it lives in
   * `evidence` and `metadata`, neither of which the queue hashes), so discovering
   * a third corroborating document refreshes this finding instead of creating a
   * second one.
   */
  private async persistAggregateFindings(
    componentId: string,
    aggregates: readonly AggregatedSpecification[],
  ): Promise<{ createdCount: number; staledCount: number }> {
    const findings: Parameters<
      ComponentReviewQueueService['persistFindings']
    >[0] = [];

    for (const aggregate of aggregates) {
      if (aggregate.state === 'AGREED') {
        findings.push(this.buildSuggestionFinding(componentId, aggregate));
        continue;
      }
      if (aggregate.state === 'CONFLICT') {
        findings.push(this.buildConflictFinding(componentId, aggregate));
      }
      // ALREADY_CURRENT and NOT_ACTIONABLE deliberately create no finding. The
      // reconciliation below stales any pending suggestion they supersede, so the
      // queue never offers a value that is no longer worth applying.
    }

    // Which of these fingerprints already exist, read before persisting: the
    // queue refreshes an existing row rather than duplicating it, so "created"
    // means "this run introduced it".
    const existing = await this.loadExistingFingerprints(
      findings.map((finding) =>
        buildFindingFingerprint({
          componentId: finding.componentId,
          relatedComponentId: finding.relatedComponentId ?? null,
          issueType: finding.issueType,
          field: finding.field ?? null,
          currentValue: finding.currentValue ?? null,
          suggestedValue: finding.suggestedValue ?? null,
          intelligenceVersion: finding.intelligenceVersion ?? null,
        }),
      ),
    );

    const persisted =
      findings.length > 0
        ? await this.reviewQueue.persistFindings(findings)
        : { persistedCount: 0, findings: [] };

    const activeFingerprints = new Set(
      persisted.findings.map((finding) => finding.fingerprint),
    );

    let staledCount = 0;
    try {
      const reconciled = await this.reviewQueue.reconcileFindings({
        componentIds: [componentId],
        activeFingerprints,
        sources: [DOCUMENT_ATTRIBUTE_SOURCE],
        reason:
          'A component-level documentation analysis replaced this suggestion with the aggregated result of every analyzed document.',
      });
      staledCount = reconciled.staledCount;
    } catch (error) {
      // Reconciliation is bookkeeping: a failure leaves extra pending rows, which
      // are still refused at apply time by the existing staleness guard.
      this.logger.warn(
        `Failed to reconcile documentation findings for component ${componentId}: ${String(error)}`,
      );
    }

    return {
      // A fingerprint that was already present was refreshed in place, so it is
      // not a finding this run created.
      createdCount: persisted.findings.filter(
        (finding) => !existing.has(finding.fingerprint),
      ).length,
      staledCount,
    };
  }

  /**
   * Fingerprints that already exist, for the created/refreshed distinction.
   *
   * One bounded `IN` query over the batch, never one lookup per finding.
   */
  private async loadExistingFingerprints(
    fingerprints: readonly string[],
  ): Promise<Set<string>> {
    const values = fingerprints.filter((value) => value.length > 0);
    if (values.length === 0) return new Set();

    const rows = await db
      .select({ fingerprint: componentIntelligenceFindings.fingerprint })
      .from(componentIntelligenceFindings)
      .where(inArray(componentIntelligenceFindings.fingerprint, values));

    return new Set(rows.map((row) => row.fingerprint));
  }

  /**
   * The finding for a value every analyzed document agrees on.
   *
   * Its fingerprint is the queue's own function over the component, the attribute,
   * the recorded value and the proposed value — and deliberately **not** over the
   * sourcing document. Evidence is not identity: discovering a third document that
   * states the same value must refresh this finding rather than create a second
   * one, which is exactly what the pass requires. The documents live in `evidence`
   * and `metadata`, neither of which the queue hashes, and the primary source is
   * recorded in `metadata.document` for provenance on apply.
   */
  private buildSuggestionFinding(
    componentId: string,
    aggregate: AggregatedSpecification,
  ): Parameters<ComponentReviewQueueService['persistFindings']>[0][number] {
    const primary = aggregate.sources[0]!;
    const evidence = this.limitedEvidence(aggregate);

    return {
      componentId,
      issueType: SUGGESTION_ISSUE_TYPE,
      issueCategory: ATTRIBUTE_VALUE_ISSUE_CATEGORY,
      field: `attributes.${aggregate.attributeCode}`,
      title: aggregate.currentValue
        ? `${aggregate.attributeName} differs from the documentation`
        : `${aggregate.attributeName} specified in the documentation`,
      description: this.describeAgreement(aggregate),
      currentValue: {
        attributeDefinitionId: aggregate.attributeDefinitionId,
        attributeCode: aggregate.attributeCode,
        value: aggregate.currentValue,
      },
      suggestedValue: {
        attributeDefinitionId: aggregate.attributeDefinitionId,
        attributeCode: aggregate.attributeCode,
        attributeName: aggregate.attributeName,
        dataType: aggregate.dataType,
        display: aggregate.display,
        unit: aggregate.defaultUnit,
        optionCode: aggregate.optionCode,
        value: aggregate.value,
      },
      confidence: aggregate.confidence,
      confidenceLevel: confidenceLevelOf(aggregate.confidence),
      evidence,
      source: DOCUMENT_ATTRIBUTE_SOURCE,
      intelligenceVersion: DATASHEET_INTELLIGENCE_VERSION,
      metadata: {
        rule: SUGGESTION_ISSUE_TYPE,
        origin: 'DOCUMENT_AGGREGATE',
        field: `attributes.${aggregate.attributeCode}`,
        attributeDefinitionId: aggregate.attributeDefinitionId,
        attributeCode: aggregate.attributeCode,
        dataType: aggregate.dataType,
        actionable: true,
        conflict: aggregate.erpAgreement === 'CONFLICTS',
        confidenceReasons: aggregate.confidenceReasons,
        documentCount: aggregate.documentCount,
        sources: this.sourceMetadata(aggregate),
        document: {
          documentId: primary.documentId,
          documentVersion: primary.documentVersion,
          documentFileName: primary.documentFileName,
          documentContentHash: primary.documentContentHash,
          extractionSource: DOCUMENT_ATTRIBUTE_SOURCE,
        },
      },
    };
  }

  /**
   * The finding for documents that disagree.
   *
   * Its suggested value is the distinct values in conflict — **not** which
   * document said what, and not the document ids. The disagreement is the
   * finding's subject, so a further document corroborating one side refreshes
   * this row instead of creating another conflict. It is deliberately not an
   * applicable finding type, so the review queue cannot write it: the system never
   * chooses between sources.
   */
  private buildConflictFinding(
    componentId: string,
    aggregate: AggregatedSpecification,
  ): Parameters<ComponentReviewQueueService['persistFindings']>[0][number] {
    const evidence = this.limitedEvidence(aggregate);
    const statements = aggregate.groups.map((group) => ({
      value: group.display,
      normalized: group.normalized,
      documentIds: group.sources.map((source) => source.documentId).sort(),
    }));
    // The conflicting values in a deterministic order: this is what the
    // fingerprint is taken over.
    const conflictingValues = aggregate.groups
      .map((group) => group.normalized ?? group.display)
      .sort();

    return {
      componentId,
      issueType: CONFLICT_ISSUE_TYPE,
      issueCategory: ATTRIBUTE_VALUE_ISSUE_CATEGORY,
      field: `attributes.${aggregate.attributeCode}`,
      title: `${aggregate.attributeName} conflicts between documents`,
      description: `The component's documents disagree about ${aggregate.attributeName}. ${aggregate.groups
        .map(
          (group) =>
            `${group.sources.map((source) => source.documentFileName ?? source.documentId).join(', ')} state ${group.display}`,
        )
        .join(
          '; ',
        )}. No value is offered for application until a reviewer decides.`,
      currentValue: {
        attributeDefinitionId: aggregate.attributeDefinitionId,
        attributeCode: aggregate.attributeCode,
        value: aggregate.currentValue,
      },
      // A conflict has nothing to apply, so no value is suggested.
      suggestedValue: {
        attributeDefinitionId: aggregate.attributeDefinitionId,
        attributeCode: aggregate.attributeCode,
        attributeName: aggregate.attributeName,
        dataType: aggregate.dataType,
        conflictingValues,
        documentCount: aggregate.documentCount,
      },
      confidence: aggregate.confidence,
      confidenceLevel: confidenceLevelOf(aggregate.confidence),
      evidence,
      source: DOCUMENT_ATTRIBUTE_SOURCE,
      intelligenceVersion: DATASHEET_INTELLIGENCE_VERSION,
      metadata: {
        rule: CONFLICT_ISSUE_TYPE,
        origin: 'DOCUMENT_AGGREGATE',
        field: `attributes.${aggregate.attributeCode}`,
        attributeDefinitionId: aggregate.attributeDefinitionId,
        attributeCode: aggregate.attributeCode,
        dataType: aggregate.dataType,
        // Explicitly not actionable: the queue's list filter and the apply path
        // both read this, and no document may be chosen automatically.
        actionable: false,
        conflict: true,
        confidenceReasons: aggregate.confidenceReasons,
        documentCount: aggregate.documentCount,
        sources: this.sourceMetadata(aggregate),
        // What each side of the disagreement is, for the review UI.
        statements,
      },
    };
  }

  private limitedEvidence(
    aggregate: AggregatedSpecification,
  ): Array<Record<string, unknown>> {
    return aggregate.evidence
      .slice(0, MAX_EVIDENCE_ITEMS_PER_SPECIFICATION)
      .map((item) => ({
        type: 'datasheet_param',
        description: item.description,
        weight: item.weight,
        ...(item.source ? { source: item.source } : {}),
        extractionMethod: item.extractionMethod,
        documentId: item.documentId,
        documentVersion: item.documentVersion,
        documentContentHash: item.documentContentHash,
        documentFileName: item.documentFileName,
        page: item.page,
        text: item.text,
        role: item.role,
        section: item.section,
      }));
  }

  /** Deterministic, fingerprinted per source: no volatile ordering. */
  private sourceMetadata(
    aggregate: AggregatedSpecification,
  ): Array<Record<string, unknown>> {
    return aggregate.sources.map((source) => ({
      documentId: source.documentId,
      documentVersion: source.documentVersion,
      documentContentHash: source.documentContentHash,
      documentFileName: source.documentFileName,
      documentType: source.documentType,
      display: source.display,
      normalized: source.normalized,
      agreement: source.agreement,
      erpAgreement: source.erp,
    }));
  }

  private describeAgreement(aggregate: AggregatedSpecification): string {
    const files = aggregate.sources
      .map((source) => source.documentFileName ?? source.documentId)
      .join(', ');
    const value = aggregate.display ?? '';
    const agreed =
      aggregate.documentCount > 1
        ? `${aggregate.documentCount} documents state ${value} for ${aggregate.attributeName} (${files}).`
        : `"${files}" states ${value} for ${aggregate.attributeName}.`;

    if (aggregate.erpAgreement === 'CONFLICTS') {
      return `${agreed} This component records "${aggregate.currentValue ?? 'nothing'}".`;
    }
    if (aggregate.erpAgreement === 'ABSENT') {
      return `${agreed} This component does not record the attribute.`;
    }
    return agreed;
  }

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------

  private async assertComponentExists(componentId: string): Promise<void> {
    const [row] = await db
      .select({ id: components.id })
      .from(components)
      .where(eq(components.id, componentId))
      .limit(1);
    if (!row) {
      throw new NotFoundException(`Component #${componentId} not found`);
    }
  }

  /**
   * The component's own documents, resolved server-side.
   *
   * The component is the only input, so a caller cannot point the analysis at
   * another component's documentation by supplying an id: the documents are read
   * from the persisted `(entityType, entityId)` relationship. Only supported,
   * uploaded document types are considered, and the list is ordered
   * deterministically. The whole eligible list is returned so the caller can
   * report which documents the analysis bound left out, rather than hiding them.
   */
  private async discoverDocuments(componentId: string) {
    const records = await this.documents.getEntityDocuments(
      'Component',
      componentId,
    );

    return records
      .filter(
        (record) =>
          record.sourceType === 'UPLOADED_FILE' &&
          (SPECIFICATION_DOCUMENT_TYPES as readonly string[]).includes(
            record.documentType,
          ),
      )
      .sort((first, second) => {
        const byType =
          SPECIFICATION_DOCUMENT_TYPES.indexOf(first.documentType) -
          SPECIFICATION_DOCUMENT_TYPES.indexOf(second.documentType);
        if (byType !== 0) return byType;
        return first.id.localeCompare(second.id);
      });
  }

  /** The documents an analysis run will actually read. */
  private boundedDocuments(
    documents: readonly DocumentationRecord[],
  ): DocumentationRecord[] {
    return documents.slice(0, MAX_COMPONENT_DOCUMENTS_ANALYZED);
  }

  /** The attribute catalog, with everything the aggregation compares against. */
  private async loadDefinitions(): Promise<AggregatedAttributeDefinition[]> {
    const rows = await db
      .select({
        id: attributeDefinitions.id,
        code: attributeDefinitions.code,
        name: attributeDefinitions.name,
        dataType: attributeDefinitions.dataType,
        unitCategory: attributeDefinitions.unitCategory,
        defaultUnit: attributeDefinitions.defaultUnit,
        validationRules: attributeDefinitions.validationRules,
        isActive: attributeDefinitions.isActive,
      })
      .from(attributeDefinitions);

    return rows
      .filter((row) => row.isActive)
      .map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        dataType: row.dataType,
        unitCategory: row.unitCategory,
        defaultUnit: row.defaultUnit,
        validationRules:
          row.validationRules &&
          typeof row.validationRules === 'object' &&
          !Array.isArray(row.validationRules)
            ? (row.validationRules as Record<string, unknown>)
            : null,
      }));
  }

  /**
   * Corroborating context for the mapping: what the part type expects, what the
   * component's category binds, and the Data Pack's alias vocabulary.
   */
  private async loadResolutionContext(componentId: string): Promise<{
    expectedAttributeCodes: string[];
    categoryAttributeCodes: string[];
    packAttributeAliases: Record<string, string[]>;
  }> {
    const [component] = await db
      .select({ categoryId: components.categoryId })
      .from(components)
      .where(eq(components.id, componentId))
      .limit(1);

    const [bindings, hints] = await Promise.all([
      component?.categoryId
        ? db
            .select({
              attributeDefinitionId: categoryAttributes.attributeDefinitionId,
            })
            .from(categoryAttributes)
            .where(eq(categoryAttributes.categoryId, component.categoryId))
        : Promise.resolve([]),
      this.loadIntelligenceHints(),
    ]);

    const boundIds = bindings.map((binding) => binding.attributeDefinitionId);
    const boundCodes =
      boundIds.length > 0
        ? (
            await db
              .select({
                id: attributeDefinitions.id,
                code: attributeDefinitions.code,
              })
              .from(attributeDefinitions)
              .where(inArray(attributeDefinitions.id, boundIds))
          ).map((row) => row.code)
        : [];

    const expectedAttributeCodes = new Set<string>();
    const packAttributeAliases: Record<string, string[]> = {};
    for (const hint of hints) {
      for (const code of hint.expectedAttributes ?? []) {
        expectedAttributeCodes.add(code);
      }
      for (const [code, aliases] of Object.entries(
        hint.attributeAliases ?? {},
      )) {
        if (!aliases) continue;
        packAttributeAliases[code] = [
          ...(packAttributeAliases[code] ?? []),
          ...aliases,
        ];
      }
    }

    return {
      expectedAttributeCodes: [...expectedAttributeCodes],
      categoryAttributeCodes: boundCodes,
      packAttributeAliases,
    };
  }

  private async loadIntelligenceHints() {
    if (!this.dataPacks) return [];
    try {
      return await this.dataPacks.getActiveIntelligenceHints();
    } catch {
      // Corroboration is optional: without it resolution still works, it just
      // reports less evidence.
      return [];
    }
  }

  /** The component's recorded values, for the ERP comparison. */
  private async loadCurrentValues(
    componentId: string,
  ): Promise<Map<string, { display: string }>> {
    // One bounded read (three queries for any number of attributes), shared by
    // every specification in the run.
    const displays = await loadComponentAttributeDisplays(componentId);
    return new Map(
      [...displays].map(([attributeDefinitionId, display]) => [
        attributeDefinitionId,
        { display },
      ]),
    );
  }

  /**
   * Rebuilds source candidates from stored analyses.
   *
   * Used by the read path so opening the panel does not re-run extraction: the
   * stored candidates already carry the resolution, evidence and confidence the
   * reviewer saw.
   */
  private async collectStoredCandidates(
    componentId: string,
    documents: readonly DocumentationRecord[],
  ): Promise<{
    candidates: SpecificationSourceCandidate[];
    unmapped: UnmappedSpecificationDto[];
    analyzedDocumentIds: string[];
    skipped: ComponentDocumentSkipDto[];
  }> {
    const candidates: SpecificationSourceCandidate[] = [];
    const unmapped: UnmappedSpecificationDto[] = [];
    const analyzedDocumentIds: string[] = [];
    const skipped: ComponentDocumentSkipDto[] = [];

    for (const document of documents) {
      const state = await this.analysis.getAnalysisState(document.id);
      if (!state.analysis) {
        if (!state.eligibility.available) {
          skipped.push({
            reason: state.eligibility.reason,
            message: state.eligibility.message,
            documentIds: [document.id],
          });
        }
        continue;
      }
      analyzedDocumentIds.push(document.id);
      for (const candidate of state.analysis.attributes) {
        if (!isMapped(candidate)) {
          unmapped.push(this.toUnmappedDto(candidate, document.id));
          continue;
        }
        // Mapped candidates are collected even when they are not applicable, so
        // a value the component already records is reported as ALREADY_CURRENT
        // rather than silently disappearing from the panel.
        candidates.push(
          this.toSourceCandidate(candidate, {
            documentId: document.id,
            documentVersion: state.analysis.document.documentVersion,
            documentContentHash: state.analysis.document.contentHash,
            documentFileName: document.fileName,
            documentType: document.documentType,
          }),
        );
      }
    }

    void componentId;
    return { candidates, unmapped, analyzedDocumentIds, skipped };
  }
  /** Projects a stored candidate into the aggregation's source shape. */
  private toSourceCandidate(
    candidate: AttributeCandidateDto,
    source: {
      documentId: string;
      documentVersion: number;
      documentContentHash: string;
      documentFileName: string | null;
      documentType: string | null;
    },
  ): SpecificationSourceCandidate {
    return {
      ...source,
      attributeDefinitionId: candidate.attributeDefinitionId,
      attributeCode: candidate.attributeCode,
      extractedCode: candidate.extractedCode,
      formatted: candidate.formatted,
      unit: candidate.unit,
      normalizedValue: candidate.normalizedValue,
      optionCode: candidate.optionCode,
      applicable: candidate.applicable,
      inapplicableReason: candidate.inapplicableReason,
      resolutionConfidence: candidate.resolutionConfidence,
      resolutionReasons: candidate.resolutionReasons,
      extractionConfidence: candidate.confidence,
      evidence: toEvidenceItems(candidate.evidence),
    };
  }

  /** Attribute findings for the component, for attaching review state. */
  private async loadAttributeFindings(
    componentId: string,
  ): Promise<Map<string, ComponentIntelligenceFinding>> {
    const rows = await db
      .select()
      .from(componentIntelligenceFindings)
      .where(
        and(
          eq(componentIntelligenceFindings.componentId, componentId),
          eq(componentIntelligenceFindings.source, DOCUMENT_ATTRIBUTE_SOURCE),
        ),
      );

    const byAttribute = new Map<string, ComponentIntelligenceFinding>();
    for (const row of rows) {
      const attributeDefinitionId =
        typeof row.metadata?.attributeDefinitionId === 'string'
          ? row.metadata.attributeDefinitionId
          : null;
      if (!attributeDefinitionId) continue;

      const existing = byAttribute.get(attributeDefinitionId);
      // Prefer a PENDING row, then the most recently updated: the row a reviewer
      // would act on is the one the panel should describe.
      if (
        !existing ||
        (row.status === 'PENDING' && existing.status !== 'PENDING') ||
        (row.status === existing.status &&
          row.updatedAt.getTime() > existing.updatedAt.getTime())
      ) {
        byAttribute.set(attributeDefinitionId, row);
      }
    }
    return byAttribute;
  }

  // -------------------------------------------------------------------------
  // Shaping
  // -------------------------------------------------------------------------

  private toSpecificationDto(
    aggregate: AggregatedSpecification,
    findings: Map<string, ComponentIntelligenceFinding>,
  ): SpecificationAggregateDto {
    const finding = findings.get(aggregate.attributeDefinitionId) ?? null;

    return {
      attributeDefinitionId: aggregate.attributeDefinitionId,
      attributeCode: aggregate.attributeCode,
      attributeName: aggregate.attributeName,
      dataType: aggregate.dataType,
      extractedCode: aggregate.extractedCode,
      unitCategory: aggregate.unitCategory,
      defaultUnit: aggregate.defaultUnit,
      state: aggregate.state,
      value: aggregate.value,
      optionCode: aggregate.optionCode,
      display: aggregate.display,
      sources: aggregate.sources.map((source): SpecificationSourceDto => ({
        documentId: source.documentId,
        documentVersion: source.documentVersion,
        documentContentHash: source.documentContentHash,
        documentFileName: source.documentFileName,
        documentType: source.documentType,
        display: source.display,
        normalized: source.normalized,
        agreement: source.agreement,
        erp: source.erp,
        detail: source.detail,
      })),
      groups: aggregate.groups.map((group): SpecificationValueGroupDto => ({
        display: group.display,
        normalized: group.normalized,
        agreement: group.agreement,
        sources: group.sources.map((source) => ({
          documentId: source.documentId,
          documentVersion: source.documentVersion,
          documentContentHash: source.documentContentHash,
          documentFileName: source.documentFileName,
          documentType: source.documentType,
          display: source.display,
          normalized: source.normalized,
          agreement: source.agreement,
          erp: source.erp,
          detail: source.detail,
        })),
      })),
      evidence: aggregate.evidence
        .slice(0, MAX_EVIDENCE_ITEMS_PER_SPECIFICATION)
        .map(toEvidenceDto),
      documentCount: aggregate.documentCount,
      agreeingDocumentCount: aggregate.agreeingDocumentCount,
      currentValue: aggregate.currentValue,
      erpComparison: aggregate.erpComparison,
      erpAgreement: aggregate.erpAgreement,
      confidence: aggregate.confidence,
      confidenceReasons: aggregate.confidenceReasons,
      notApplicableReason: aggregate.notApplicableReason,
      review: finding ? toReviewDto(finding) : null,
    };
  }

  private toUnmappedDto(
    candidate: AttributeCandidateDto,
    documentId: string,
  ): UnmappedSpecificationDto {
    return {
      extractedCode: candidate.extractedCode,
      formatted: candidate.formatted,
      resolutionState: candidate.resolutionState,
      inapplicableReason: candidate.inapplicableReason,
      candidates: candidate.resolutionCandidates,
      documentIds: [documentId],
    };
  }

  /**
   * The server-derived summary.
   *
   * Counts come from the persisted findings — the rows the review queue will
   * actually show — rather than from the run's in-memory state, so the panel and
   * the queue can never disagree.
   */
  private async buildSummary(input: {
    componentId: string;
    specifications: readonly SpecificationAggregateDto[];
    unmapped: readonly UnmappedSpecificationDto[];
    documentsAnalyzed: number;
    documentsNotAnalyzed: string[];
    documentsSkipped: ComponentDocumentSkipDto[];
    actor: DocumentAnalysisActor | null;
    durationMs: number;
  }): Promise<ComponentDocumentationSummaryDto> {
    const findings = await db
      .select({
        id: componentIntelligenceFindings.id,
        issueType: componentIntelligenceFindings.issueType,
        status: componentIntelligenceFindings.status,
        metadata: componentIntelligenceFindings.metadata,
      })
      .from(componentIntelligenceFindings)
      .where(
        and(
          eq(componentIntelligenceFindings.componentId, input.componentId),
          eq(componentIntelligenceFindings.source, DOCUMENT_ATTRIBUTE_SOURCE),
        ),
      );

    const applied = findings.filter(
      (finding) => finding.metadata?.applicationResult === 'APPLIED',
    ).length;
    const needsReview = findings.filter(
      (finding) => finding.status === 'PENDING',
    ).length;
    const conflicts = findings.filter(
      (finding) => finding.issueType === CONFLICT_ISSUE_TYPE,
    ).length;

    const [component] = await db
      .select({ updatedAt: components.updatedAt })
      .from(components)
      .where(eq(components.id, input.componentId))
      .limit(1);

    return {
      componentId: input.componentId,
      documentsAnalyzed: input.documentsAnalyzed,
      documentsNotAnalyzed: input.documentsNotAnalyzed,
      documentsSkipped: input.documentsSkipped,
      specificationsFound: input.specifications.length,
      needsReview,
      applied,
      conflicts,
      ambiguous: input.unmapped.filter(
        (entry) => entry.resolutionState === 'AMBIGUOUS',
      ).length,
      unresolved: input.unmapped.filter(
        (entry) => entry.resolutionState === 'UNRESOLVED',
      ).length,
      notActionable: input.specifications.filter(
        (specification) => specification.state === 'NOT_ACTIONABLE',
      ).length,
      alreadyCurrent: input.specifications.filter(
        (specification) => specification.state === 'ALREADY_CURRENT',
      ).length,
      analyzedAt: (component?.updatedAt ?? new Date()).toISOString(),
      analyzedByEmail: input.actor?.email ?? null,
      durationMs: input.durationMs,
    };
  }
}

/** Whether a candidate was mapped onto an attribute at all. */
function isMapped(candidate: AttributeCandidateDto): boolean {
  return candidate.attributeDefinitionId !== null;
}

/** Projects stored evidence into the aggregation's evidence shape. */
function toEvidenceItems(
  evidence: readonly DocumentEvidenceDto[],
): SpecificationSourceCandidate['evidence'] {
  return evidence.map((item) => ({
    role: item.role ?? 'CONTEXTUAL',
    documentId: item.documentId,
    documentVersion: item.documentVersion,
    documentContentHash: item.documentContentHash,
    documentFileName: item.documentFileName,
    documentType: null,
    page: item.page,
    text: item.text,
    extractionMethod: item.extractionMethod,
    source: item.source ?? null,
    weight: item.weight,
    description: item.description,
    section: item.section ?? null,
  }));
}

function toEvidenceDto(
  item: SpecificationSourceCandidate['evidence'][number],
): DocumentEvidenceDto {
  return {
    type: 'datasheet_param',
    description: item.description,
    weight: item.weight,
    ...(item.source ? { source: item.source } : {}),
    extractionMethod: item.extractionMethod,
    documentId: item.documentId,
    documentVersion: item.documentVersion,
    documentFileName: item.documentFileName,
    documentContentHash: item.documentContentHash,
    page: item.page,
    text: item.text,
    role: item.role,
    section: item.section,
  };
}

function toReviewDto(
  finding: ComponentIntelligenceFinding,
): AttributeCandidateReviewDto {
  return {
    findingId: finding.id,
    status: finding.status,
    fingerprint: finding.fingerprint,
    isNew: false,
    applied: finding.metadata?.applicationResult === 'APPLIED',
  };
}

function confidenceLevelOf(confidence: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (confidence >= 0.8) return 'HIGH';
  if (confidence >= 0.6) return 'MEDIUM';
  return 'LOW';
}
