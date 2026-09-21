import { Injectable, Logger } from '@nestjs/common';
import { db } from '@ananya/database';
import {
  attributeDefinitions,
  categories,
  categoryAttributes,
  componentAttributeValues,
} from '@ananya/database/schema';
import { count } from '@ananya/database/query';
import { MlService } from '../ml.service';
import type { AttributeAuditIssueDto } from '../dtos';
import { AttributeIntelligenceFindingsService } from './attribute-finding.service';
import {
  buildDefinitionKeyIndex,
  normalizeAttributeAudit,
  type AttributeAuditSubjectIndex,
} from './attribute-audit-normalizer';
import {
  toAttributeIdentitySnapshot,
  toCategorySnapshot,
  type AttributeIdentitySnapshot,
} from './attribute-finding-expected-state';
import {
  ATTRIBUTE_AUDIT_INTELLIGENCE_VERSION,
  ATTRIBUTE_AUDIT_MODEL_VERSION,
  ATTRIBUTE_AUDIT_SCOPE,
  ATTRIBUTE_AUDIT_SOURCES,
  type AttributeAuditPersistenceResult,
} from './attribute-audit.dtos';
import type { AttributeReviewIssueType } from './attribute-finding.dtos';

/**
 * Persists the *existing* Attribute Intelligence audit.
 *
 * Orchestration only. It runs the Audit-as-it-is, normalizes what came back, hands
 * the findings to the Pass 1 persistence service, reconciles the scope, and reports
 * what happened.
 *
 * It deliberately does **not**:
 *
 *  - implement any detection rule. The producer decides what is worth reviewing;
 *    this service has no opinion about similarity, bindings or usage;
 *  - run both producers. `MlService.auditAttributeLibrary()` already selects one —
 *    the Python model when it answers, the deterministic in-process implementation
 *    otherwise — and this service consumes that single result. Running both and
 *    merging would produce duplicate findings for the same condition;
 *  - mutate attribute data. Persisting a finding never creates a definition, a
 *    binding or an option, which is what keeps the intelligence advisory.
 */
@Injectable()
export class AttributeIntelligenceAuditService {
  private readonly logger = new Logger(AttributeIntelligenceAuditService.name);

  constructor(
    private readonly mlService: MlService,
    private readonly findingsService: AttributeIntelligenceFindingsService,
  ) {}

  /**
   * Runs the audit and persists its findings.
   *
   * Order of operations, and why:
   *
   *  1. **Produce.** One producer runs, exactly as it does today.
   *  2. **Snapshot.** Authoritative library rows are read AFTER the producer so the
   *     expected state is never older than the analysis it describes.
   *  3. **Normalize.** Pure transformation; unresolvable subjects become warnings.
   *  4. **Persist.** Idempotent by fingerprint; terminal decisions are preserved and
   *     STALE findings are revived by re-detection.
   *  5. **Reconcile.** PENDING findings this producer owned, in this scope, at this
   *     intelligence version, that were not re-detected, are retired as STALE.
   *
   * A concurrent edit between steps 2 and 4 lands in the next audit run, which
   * derives a new fingerprint; it cannot corrupt this run's snapshot.
   */
  async runAudit(): Promise<AttributeAuditPersistenceResult> {
    const startedAt = Date.now();

    const audit = await this.mlService.auditAttributeLibrary();
    const issues: AttributeAuditIssueDto[] = audit.issues ?? [];

    const snapshot = await this.loadLibrarySnapshot();
    const index = this.buildSubjectIndex(snapshot);

    const source = audit.isMlActive
      ? ATTRIBUTE_AUDIT_SOURCES.ML
      : ATTRIBUTE_AUDIT_SOURCES.DETERMINISTIC;

    const { findings, warnings } = normalizeAttributeAudit({
      issues,
      index,
      source,
      intelligenceVersion: ATTRIBUTE_AUDIT_INTELLIGENCE_VERSION,
      modelVersion: ATTRIBUTE_AUDIT_MODEL_VERSION,
    });

    const persisted = await this.findingsService.persistFindings(findings);

    // The scope of a whole-library audit is every definition and every category it
    // read. Passing both lets a category-first finding — which has no attribute
    // subject — be reconciled like any other.
    const { staledCount } = await this.findingsService.reconcileFindings({
      attributeDefinitionIds: snapshot.definitions.map((row) => row.id),
      categoryIds: snapshot.categories.map((row) => row.id),
      activeFingerprints: new Set(
        persisted.findings.map((finding) => finding.fingerprint),
      ),
      sources: [source],
      intelligenceVersions: [ATTRIBUTE_AUDIT_INTELLIGENCE_VERSION],
      issueTypes: findings.map((finding) => finding.issueType),
      reason: `Not detected by the latest ${source} audit (${ATTRIBUTE_AUDIT_INTELLIGENCE_VERSION})`,
    });

    const byIssueType = countByIssueType(findings);
    const executionTimeMs = Number((Date.now() - startedAt).toFixed(2));

    this.logger.log(
      `Attribute audit persisted ${persisted.persistedCount} finding(s) from ${issues.length} producer issue(s): ${persisted.createdCount} created, ${persisted.refreshedCount} refreshed, ${persisted.revivedCount} revived, ${staledCount} staled, ${warnings.length} warning(s).`,
    );

    return {
      source,
      intelligenceVersion: ATTRIBUTE_AUDIT_INTELLIGENCE_VERSION,
      scope: ATTRIBUTE_AUDIT_SCOPE,
      scannedCount: snapshot.definitions.length,
      scannedCategoryCount: snapshot.categories.length,
      rawFindingCount: issues.length,
      persistedCount: persisted.persistedCount,
      createdCount: persisted.createdCount,
      refreshedCount: persisted.refreshedCount,
      revivedCount: persisted.revivedCount,
      staleCount: staledCount,
      skippedCount: warnings.filter(
        (warning) => warning.code !== 'DUPLICATE_FINDING_COLLAPSED',
      ).length,
      warningCount: warnings.length,
      warnings,
      byIssueType,
      isMlActive: audit.isMlActive,
      executionTimeMs,
    };
  }

  /**
   * Reads the authoritative library state the producer's identifiers resolve
   * against.
   *
   * The same reads the producer performs, taken as a snapshot so normalization and
   * expected-state construction see one consistent view. Usage counters are
   * aggregated rather than read per attribute, so the audit costs a fixed number of
   * queries as the library grows.
   */
  private async loadLibrarySnapshot(): Promise<{
    definitions: AttributeIdentitySnapshot[];
    categories: ReturnType<typeof toCategorySnapshot>[];
    componentValueCounts: Map<string, number>;
    bindingCounts: Map<string, number>;
  }> {
    const [definitionRows, categoryRows, valueCountRows, bindingCountRows] =
      await Promise.all([
        db
          .select({
            id: attributeDefinitions.id,
            code: attributeDefinitions.code,
            name: attributeDefinitions.name,
            dataType: attributeDefinitions.dataType,
            unitCategory: attributeDefinitions.unitCategory,
            defaultUnit: attributeDefinitions.defaultUnit,
            aliases: attributeDefinitions.aliases,
            groupName: attributeDefinitions.groupName,
            isActive: attributeDefinitions.isActive,
          })
          .from(attributeDefinitions),
        db
          .select({
            id: categories.id,
            code: categories.code,
            name: categories.name,
            isActive: categories.isActive,
          })
          .from(categories),
        db
          .select({
            attributeDefinitionId:
              componentAttributeValues.attributeDefinitionId,
            value: count(),
          })
          .from(componentAttributeValues)
          .groupBy(componentAttributeValues.attributeDefinitionId),
        db
          .select({
            attributeDefinitionId: categoryAttributes.attributeDefinitionId,
            value: count(),
          })
          .from(categoryAttributes)
          .groupBy(categoryAttributes.attributeDefinitionId),
      ]);

    return {
      definitions: definitionRows.map(toAttributeIdentitySnapshot),
      categories: categoryRows.map(toCategorySnapshot),
      componentValueCounts: new Map(
        valueCountRows.map((row) => [
          row.attributeDefinitionId,
          Number(row.value),
        ]),
      ),
      bindingCounts: new Map(
        bindingCountRows.map((row) => [
          row.attributeDefinitionId,
          Number(row.value),
        ]),
      ),
    };
  }

  private buildSubjectIndex(snapshot: {
    definitions: AttributeIdentitySnapshot[];
    categories: ReturnType<typeof toCategorySnapshot>[];
    componentValueCounts: Map<string, number>;
    bindingCounts: Map<string, number>;
  }): AttributeAuditSubjectIndex {
    return {
      definitionsById: new Map(
        snapshot.definitions.map((definition) => [definition.id, definition]),
      ),
      definitionsByKey: buildDefinitionKeyIndex(snapshot.definitions),
      categoriesById: new Map(
        snapshot.categories.map((category) => [category.id, category]),
      ),
      componentValueCounts: snapshot.componentValueCounts,
      bindingCounts: snapshot.bindingCounts,
    };
  }
}

/**
 * Counts persisted findings per issue family.
 *
 * Read from the normalized findings rather than the raw issues, so the numbers
 * describe what actually reached the queue.
 */
function countByIssueType(
  findings: Array<{ issueType: string }>,
): Partial<Record<AttributeReviewIssueType, number>> {
  const counts: Partial<Record<AttributeReviewIssueType, number>> = {};
  for (const finding of findings) {
    const key = finding.issueType as AttributeReviewIssueType;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
