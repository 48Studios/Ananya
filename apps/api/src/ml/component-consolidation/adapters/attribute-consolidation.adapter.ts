import {
  ComponentAttributeValue,
  type ComponentAttributeRepository,
} from '@ananya/inventory';
import {
  compareComponentAttributes,
  loadAllAttributeValues,
} from '../../component-attribute-values.loader';
import { ConsolidationAdapterBlockedError } from '../component-consolidation.errors';
import type {
  AttributeResolution,
  ConsolidationAdapter,
  ConsolidationAdapterOutcome,
  ConsolidationContext,
} from '../component-consolidation.types';

/**
 * Structured attribute consolidation adapter.
 *
 * Classification comes from the SAME function the preview uses
 * (`compareComponentAttributes` over `loadAllAttributeValues`), reading the same
 * all-attribute loader. That is deliberate: if preview and executor classified
 * attributes independently they could disagree, and the preview would either
 * demand a decision for a value that is already identical, or fail to warn about
 * one that is not.
 *
 * | classification  | requirement                                          |
 * |-----------------|------------------------------------------------------|
 * | IDENTICAL       | automatic, nothing to do                             |
 * | CANONICAL_ONLY  | automatic, canonical already has the value           |
 * | SOURCE_ONLY     | explicit: KEEP_SOURCE_VALUE, DISCARD_SOURCE_VALUE or |
 * |                 | EXPLICIT_VALUE                                       |
 * | CONFLICTING     | explicit: KEEP_CANONICAL_VALUE, KEEP_SOURCE_VALUE or |
 * |                 | EXPLICIT_VALUE                                       |
 *
 * There is no "latest wins" and no silent preference for the canonical value. An
 * attribute that needs a decision and has no matching resolution BLOCKS the whole
 * operation.
 *
 * Every source value is removed once the resolutions are applied: the source
 * component is being retired, so leaving its values behind would let the two
 * records drift apart again.
 */
export class AttributeConsolidationAdapter implements ConsolidationAdapter {
  readonly id = 'attributes';
  readonly label = 'Structured attribute values';
  readonly order = 15;

  constructor(private readonly attributes: ComponentAttributeRepository) {}

  async apply(
    context: ConsolidationContext,
  ): Promise<ConsolidationAdapterOutcome> {
    const { canonical, sources, plan, executor } = context;

    const applied: Array<{
      attributeDefinitionId: string;
      code: string;
      classification: string;
      strategy: string;
      writtenToCanonical: boolean;
    }> = [];
    let removedSourceValues = 0;
    const warnings: string[] = [];

    for (const source of sources) {
      const identityValues = await loadAllAttributeValues(
        [canonical.id, source.id],
        executor,
      );

      // Raw payloads, so KEEP_SOURCE_VALUE can copy the source's exact value
      // rather than a re-rendered approximation of it.
      const rawSourceValues = await this.attributes.findByComponentId(
        source.id,
      );
      if (rawSourceValues.length === 0) continue;

      const rawByDefinition = new Map(
        rawSourceValues.map((value) => [value.attributeDefinitionId, value]),
      );

      const entries = compareComponentAttributes({
        canonicalAttributes: identityValues.get(canonical.id),
        sourceAttributes: identityValues.get(source.id),
      });

      for (const entry of entries) {
        // Identical values and canonical-only values need no decision: the
        // surviving record already holds the right value.
        if (
          entry.classification === 'IDENTICAL' ||
          entry.classification === 'CANONICAL_ONLY'
        ) {
          continue;
        }

        const sourceValue = rawByDefinition.get(entry.attributeDefinitionId);
        if (!sourceValue) {
          // The value exists in the display index but has no stored payload,
          // which cannot happen for a real row. Refuse rather than guess.
          throw new ConsolidationAdapterBlockedError(
            this.id,
            `Attribute ${entry.attributeDefinitionId} was reported as ${entry.classification} but has no stored value on the retired component. Consolidation was rolled back rather than reconciling a value it cannot read.`,
            { attributeDefinitionId: entry.attributeDefinitionId },
          );
        }

        const resolution = this.findResolution(
          plan.attributeResolutions,
          entry.attributeDefinitionId,
        );

        if (!resolution) {
          throw new ConsolidationAdapterBlockedError(
            this.id,
            `Attribute ${entry.label || entry.code} is ${
              entry.classification === 'CONFLICTING'
                ? 'set to different values'
                : 'set on the retired component only'
            } (surviving record "${entry.canonicalValue ?? '—'}", retired record "${entry.sourceValue ?? '—'}"). Provide an explicit resolution before consolidating.`,
            {
              attributeDefinitionId: entry.attributeDefinitionId,
              classification: entry.classification,
              sourceComponentId: source.id,
              canonicalComponentId: canonical.id,
            },
          );
        }

        this.assertStrategyApplies(
          resolution,
          entry.classification,
          entry.attributeDefinitionId,
          entry.label || entry.code,
        );

        switch (resolution.strategy) {
          case 'KEEP_CANONICAL_VALUE':
          case 'DISCARD_SOURCE_VALUE':
            applied.push({
              attributeDefinitionId: entry.attributeDefinitionId,
              code: entry.code,
              classification: entry.classification,
              strategy: resolution.strategy,
              writtenToCanonical: false,
            });
            if (resolution.strategy === 'DISCARD_SOURCE_VALUE') {
              warnings.push(
                `Attribute ${entry.label || entry.code} was set on the retired component only and was discarded as requested.`,
              );
            }
            break;

          case 'KEEP_SOURCE_VALUE':
            await this.writeValue(canonical.id, entry.attributeDefinitionId, {
              textValue: sourceValue.textValue,
              numberValue: sourceValue.numberValue,
              normalizedNumberValue: sourceValue.normalizedNumberValue,
              booleanValue: sourceValue.booleanValue,
              dateValue: sourceValue.dateValue,
              unit: sourceValue.unit,
              optionId: sourceValue.optionId,
              selectedOptionIds: sourceValue.selectedOptionIds,
              jsonValue: sourceValue.jsonValue,
            });
            applied.push({
              attributeDefinitionId: entry.attributeDefinitionId,
              code: entry.code,
              classification: entry.classification,
              strategy: resolution.strategy,
              writtenToCanonical: true,
            });
            break;

          case 'EXPLICIT_VALUE': {
            const value = resolution.value;
            if (value === undefined) {
              throw new ConsolidationAdapterBlockedError(
                this.id,
                `An EXPLICIT_VALUE resolution for attribute ${entry.label || entry.code} must include the value to write.`,
                { attributeDefinitionId: entry.attributeDefinitionId },
              );
            }
            await this.writeValue(canonical.id, entry.attributeDefinitionId, {
              textValue: typeof value === 'string' ? value : null,
              numberValue: typeof value === 'number' ? value : null,
              booleanValue: typeof value === 'boolean' ? value : null,
            });
            applied.push({
              attributeDefinitionId: entry.attributeDefinitionId,
              code: entry.code,
              classification: entry.classification,
              strategy: resolution.strategy,
              writtenToCanonical: true,
            });
            break;
          }

          default:
            throw new ConsolidationAdapterBlockedError(
              this.id,
              `Unsupported attribute resolution strategy "${String(resolution.strategy)}" for attribute ${entry.label || entry.code}.`,
              { attributeDefinitionId: entry.attributeDefinitionId },
            );
        }
      }

      // The retired component keeps no attribute values.
      await this.attributes.deleteByComponentId(source.id);
      removedSourceValues += rawSourceValues.length;
    }

    return {
      entity: 'component_attribute_values',
      action: applied.length > 0 ? 'RECONCILE' : 'NONE',
      migratedCount: applied.length,
      details: {
        resolutions: applied,
        removedSourceValueCount: removedSourceValues,
      },
      warnings,
    };
  }

  /**
   * A `CONFLICTING` attribute has a canonical value, so keeping the canonical
   * value is a real choice. A `SOURCE_ONLY` attribute has none, so
   * `KEEP_CANONICAL_VALUE` would silently mean "discard" and is refused.
   */
  private assertStrategyApplies(
    resolution: AttributeResolution,
    classification: string,
    attributeDefinitionId: string,
    label: string,
  ): void {
    if (
      classification === 'SOURCE_ONLY' &&
      resolution.strategy === 'KEEP_CANONICAL_VALUE'
    ) {
      throw new ConsolidationAdapterBlockedError(
        this.id,
        `Attribute ${label} exists only on the retired component, so there is no surviving value to keep. Use DISCARD_SOURCE_VALUE, KEEP_SOURCE_VALUE or EXPLICIT_VALUE.`,
        { attributeDefinitionId, classification },
      );
    }
  }

  private findResolution(
    resolutions: AttributeResolution[],
    attributeDefinitionId: string,
  ): AttributeResolution | undefined {
    return resolutions.find(
      (resolution) =>
        resolution.attributeDefinitionId === attributeDefinitionId,
    );
  }

  /** Upserts one attribute value on the surviving component. */
  private async writeValue(
    componentId: string,
    attributeDefinitionId: string,
    value: {
      textValue?: string | null;
      numberValue?: number | null;
      normalizedNumberValue?: number | null;
      booleanValue?: boolean | null;
      dateValue?: Date | null;
      unit?: string | null;
      optionId?: string | null;
      selectedOptionIds?: string[] | null;
      jsonValue?: Record<string, unknown> | null;
    },
  ): Promise<void> {
    await this.attributes.upsertMany([
      ComponentAttributeValue.create({
        componentId,
        attributeDefinitionId,
        textValue: value.textValue ?? null,
        numberValue: value.numberValue ?? null,
        normalizedNumberValue: value.normalizedNumberValue ?? null,
        booleanValue: value.booleanValue ?? null,
        dateValue: value.dateValue ?? null,
        unit: value.unit ?? null,
        optionId: value.optionId ?? null,
        selectedOptionIds: value.selectedOptionIds ?? null,
        jsonValue: value.jsonValue ?? null,
      }),
    ]);
  }
}
