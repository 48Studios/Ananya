import type {
  BillOfMaterials,
  BillOfMaterialsRepository,
} from '@ananya/manufacturing';
import { ConsolidationAdapterBlockedError } from '../component-consolidation.errors';
import type {
  BomLineResolution,
  ConsolidationAdapter,
  ConsolidationAdapterOutcome,
  ConsolidationContext,
} from '../component-consolidation.types';

/** BOM statuses whose lines may be edited. Only drafts are mutable. */
const EDITABLE_BOM_STATUS = 'DRAFT';

/**
 * Bill-of-materials consolidation adapter.
 *
 * The manufacturing domain forbids two lines for the same component in one BOM
 * (`DuplicateBomComponentLineError`), so consolidation has exactly three cases:
 *
 * **CASE A — only the retired component appears in the BOM.**
 * The line is repointed onto the canonical component. The line keeps its id,
 * quantity and scrap factor; only the consumed component changes.
 *
 * **CASE B — only the canonical component appears.**
 * Nothing to do.
 *
 * **CASE C — both components appear in the same BOM.**
 * This is a semantic collision and requires an explicit reviewer decision. The
 * only supported resolution is `COMBINE`:
 *
 *   - the combined `quantity_per_unit` is `source + canonical` (never inferred),
 *   - the scrap factor must be chosen explicitly when the two differ; when they
 *     are identical the reviewer may still be explicit but the value is
 *     unambiguous,
 *   - the absorbed line is removed and the retained line carries the result.
 *
 * Nothing is merged without a matching entry in `plan.bomResolutions`, so an
 * unresolved collision blocks the whole operation.
 *
 * Only DRAFT BOMs can be modified. A released or obsolete BOM containing a
 * collision BLOCKS: the domain has no way to amend an issued BOM, and
 * repointing a line inside one would change an approved manufacturing
 * instruction after the fact.
 */
export class BomConsolidationAdapter implements ConsolidationAdapter {
  readonly id = 'bom';
  readonly label = 'Bill of materials';
  readonly order = 20;

  constructor(private readonly boms: BillOfMaterialsRepository) {}

  async apply(
    context: ConsolidationContext,
  ): Promise<ConsolidationAdapterOutcome> {
    const { canonical, sources, plan } = context;

    // Every BOM that mentions either side of a pair, keyed by BOM id so a shared
    // BOM is loaded once even when several sources are consolidated together.
    const bomIds = new Set<string>();
    const touched: Array<{ bomId: string; sourceComponentId: string }> = [];

    for (const source of sources) {
      const sourceBoms = await this.findBomsForComponent(source.id);
      for (const bomId of sourceBoms) bomIds.add(bomId);
      for (const bomId of sourceBoms) {
        touched.push({ bomId, sourceComponentId: source.id });
      }
    }

    const canonicalLineOwners = await this.findBomsForComponent(canonical.id);
    for (const bomId of canonicalLineOwners) bomIds.add(bomId);

    const repointed: Array<{
      bomId: string;
      bomRevision: string;
      lineId: string;
      sourceComponentId: string;
    }> = [];
    const combined: Array<{
      bomId: string;
      bomRevision: string;
      retainedLineId: string;
      absorbedLineId: string;
      quantityPerUnit: number;
      scrapFactorPercent: number;
      scrapFactorStrategy: string;
    }> = [];
    const warnings: string[] = [];

    const orderedBomIds = [...bomIds].sort();

    for (const bomId of orderedBomIds) {
      const bom = await this.boms.findById(bomId);
      if (!bom) continue;

      if (bom.status !== EDITABLE_BOM_STATUS) {
        const affected = this.linesFor(bom, [
          canonical.id,
          ...sources.map((s) => s.id),
        ]);
        if (affected.length > 0) {
          throw new ConsolidationAdapterBlockedError(
            this.id,
            `BOM ${bom.revision} for ${bom.componentId} is ${bom.status} and references a component in this consolidation. Only DRAFT BOMs can be amended; a released or obsolete BOM must be revised through the normal engineering process first.`,
            { bomId, revision: bom.revision, status: bom.status },
          );
        }
        continue;
      }

      // A BOM that *produces* one of these components may not consume another:
      // the domain forbids a circular BOM, and repointing would create one.
      if (sources.some((source) => source.id === bom.componentId)) {
        throw new ConsolidationAdapterBlockedError(
          this.id,
          `BOM ${bom.revision} produces ${bom.componentId}, which is a component being retired. A BOM cannot be moved onto the component it produces.`,
          {
            bomId,
            revision: bom.revision,
            productComponentId: bom.componentId,
          },
        );
      }

      let mutated = false;

      for (const source of sources) {
        const sourceLine = bom.lines.find(
          (line) => line.componentId === source.id,
        );
        if (!sourceLine) continue;

        const canonicalLine = bom.lines.find(
          (line) => line.componentId === canonical.id,
        );

        if (!canonicalLine) {
          // CASE A: repoint in place.
          bom.repointLine(sourceLine.id, canonical.id);
          repointed.push({
            bomId,
            bomRevision: bom.revision,
            lineId: sourceLine.id,
            sourceComponentId: source.id,
          });
          mutated = true;
          continue;
        }

        // CASE C: collision. An explicit resolution is mandatory.
        const resolution = this.findResolution(plan.bomResolutions, bomId);
        if (!resolution) {
          throw new ConsolidationAdapterBlockedError(
            this.id,
            `BOM ${bom.revision} contains a line for both ${source.sku} and ${canonical.sku}. Provide an explicit COMBINE resolution with a scrap-factor decision before consolidating.`,
            {
              bomId,
              revision: bom.revision,
              sourceComponentId: source.id,
              canonicalComponentId: canonical.id,
              sourceQuantityPerUnit: sourceLine.quantityPerUnit,
              canonicalQuantityPerUnit: canonicalLine.quantityPerUnit,
              sourceScrapFactorPercent: sourceLine.scrapFactorPercent,
              canonicalScrapFactorPercent: canonicalLine.scrapFactorPercent,
            },
          );
        }

        const scrap = this.resolveScrapFactor(resolution, {
          canonical: canonicalLine.scrapFactorPercent,
          source: sourceLine.scrapFactorPercent,
          bomId,
          revision: bom.revision,
          sourceSku: source.sku,
          canonicalSku: canonical.sku,
        });

        const combinedQuantity =
          sourceLine.quantityPerUnit + canonicalLine.quantityPerUnit;

        bom.combineConsolidatedLine({
          retainedLineId: canonicalLine.id,
          absorbedLineId: sourceLine.id,
          quantityPerUnit: combinedQuantity,
          scrapFactorPercent: scrap,
          notes: this.mergeNotes(sourceLine.notes, canonicalLine.notes),
        });

        combined.push({
          bomId,
          bomRevision: bom.revision,
          retainedLineId: canonicalLine.id,
          absorbedLineId: sourceLine.id,
          quantityPerUnit: combinedQuantity,
          scrapFactorPercent: scrap,
          scrapFactorStrategy: resolution.scrapFactorResolution.strategy,
        });
        mutated = true;
      }

      if (mutated) {
        await this.boms.save(bom);
      }
    }

    if (repointed.length === 0 && combined.length === 0) {
      warnings.push(
        'No BOM referenced either component, so no BOM was changed.',
      );
    }

    return {
      entity: 'bill_of_material_lines',
      action:
        combined.length > 0
          ? 'RECONCILE'
          : repointed.length > 0
            ? 'REPOINT'
            : 'NONE',
      migratedCount: repointed.length + combined.length,
      details: {
        repointedLines: repointed,
        combinedLines: combined,
        untouchedBomIds: orderedBomIds.filter(
          (bomId) => !touched.some((entry) => entry.bomId === bomId),
        ),
      },
      warnings,
    };
  }

  private findResolution(
    resolutions: BomLineResolution[],
    bomId: string,
  ): BomLineResolution | undefined {
    return resolutions.find(
      (resolution) =>
        resolution.bomId === bomId && resolution.resolution === 'COMBINE',
    );
  }

  /**
   * Resolves the scrap factor for a combined line, always from an explicit
   * reviewer decision. Identical values still require the `USE_CANONICAL` /
   * `USE_SOURCE` strategy so the record shows which side was kept.
   */
  private resolveScrapFactor(
    resolution: BomLineResolution,
    input: {
      canonical: number;
      source: number;
      bomId: string;
      revision: string;
      sourceSku: string;
      canonicalSku: string;
    },
  ): number {
    const strategy = resolution.scrapFactorResolution?.strategy;

    switch (strategy) {
      case 'USE_CANONICAL':
        return input.canonical;
      case 'USE_SOURCE':
        return input.source;
      case 'EXPLICIT': {
        const value = resolution.scrapFactorResolution.value;
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
          throw new ConsolidationAdapterBlockedError(
            this.id,
            `The EXPLICIT scrap factor for BOM ${input.revision} must be a finite, non-negative number.`,
            { bomId: input.bomId, value: value ?? null },
          );
        }
        return value;
      }
      default:
        throw new ConsolidationAdapterBlockedError(
          this.id,
          `BOM ${input.revision} combines lines for ${input.sourceSku} and ${input.canonicalSku}, whose scrap factors are ${input.source} and ${input.canonical}. A scrap factor resolution (USE_CANONICAL, USE_SOURCE or EXPLICIT) is required; consolidation never chooses one silently.`,
          {
            bomId: input.bomId,
            sourceScrapFactorPercent: input.source,
            canonicalScrapFactorPercent: input.canonical,
          },
        );
    }
  }

  /** Preserves both lines' engineering notes rather than dropping one. */
  private mergeNotes(
    sourceNotes: string | null | undefined,
    canonicalNotes: string | null | undefined,
  ): string | null {
    const parts = [canonicalNotes?.trim(), sourceNotes?.trim()].filter(
      (part): part is string => Boolean(part),
    );
    if (parts.length === 0) return null;
    return [...new Set(parts)].join(' | ');
  }

  private linesFor(
    bom: BillOfMaterials,
    componentIds: string[],
  ): BillOfMaterials['lines'] {
    const ids = new Set(componentIds);
    return bom.lines.filter((line) => ids.has(line.componentId));
  }

  /** BOM ids that contain a line for this component (the consuming direction). */
  private async findBomsForComponent(componentId: string): Promise<string[]> {
    return this.boms.findBomIdsByLineComponent(componentId);
  }
}
