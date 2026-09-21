import { db, type DbExecutor } from '@ananya/database';
import {
  attributeDefinitions,
  attributeOptions,
  componentAttributeValues,
  units,
} from '@ananya/database/schema';
import { and, eq, inArray } from '@ananya/database/query';
import type { UnitRef } from './attribute-value-semantics';

/**
 * Reads one component attribute value in the form the reviewer sees.
 *
 * Shared by two callers that must agree exactly, because a disagreement would
 * let a stale suggestion be applied:
 *
 *  - `ComponentReviewQueueService.detectStaleness` decides whether an
 *    attribute-value finding is still reviewable;
 *  - `ComponentReviewApplyService` re-checks immediately before writing.
 *
 * Kept as one small module for the same reason the pass requires a single
 * attribute mutation path: two implementations of "what is the current value?"
 * would eventually answer differently. Both callers pass their transaction
 * executor, so the read sees the same snapshot as the write it guards.
 */
export interface CurrentAttributeValueSnapshot {
  attributeDefinitionId: string;
  /** Display form, matching analysis-time and queue presentation. */
  display: string;
  updatedAt: Date;
}

export async function readCurrentAttributeValue(
  componentId: string,
  attributeDefinitionId: string,
  client: DbExecutor = db,
): Promise<CurrentAttributeValueSnapshot | null> {
  const [row] = await client
    .select()
    .from(componentAttributeValues)
    .where(
      and(
        eq(componentAttributeValues.componentId, componentId),
        eq(
          componentAttributeValues.attributeDefinitionId,
          attributeDefinitionId,
        ),
      ),
    )
    .limit(1);

  if (!row) return null;

  const display = await formatAttributeValueDisplay(row, client);
  if (display === null) {
    // A row with no representable value is treated as absent rather than as an
    // empty string, so a comparison never accidentally matches "".
    return null;
  }

  return {
    attributeDefinitionId,
    display,
    updatedAt: row.updatedAt,
  };
}

interface AttributeValueRow {
  optionId: string | null;
  selectedOptionIds: unknown;
  booleanValue: boolean | null;
  numberValue: string | null;
  dateValue: Date | null;
  textValue: string | null;
  unit: string | null;
}

/**
 * Every recorded value of one component, in display form, by definition id.
 *
 * Three bounded queries — the component's values, the definition catalog and the
 * option catalog — never one query per attribute. Shared by the analysis reader
 * and the component-level specification intelligence so both compare the
 * component against documentation through exactly the same display forms.
 */
export async function loadComponentAttributeDisplays(
  componentId: string,
  client: DbExecutor = db,
): Promise<Map<string, string>> {
  const [values, definitions, options] = await Promise.all([
    client
      .select()
      .from(componentAttributeValues)
      .where(eq(componentAttributeValues.componentId, componentId)),
    client.select().from(attributeDefinitions),
    client.select().from(attributeOptions),
  ]);

  const knownDefinitions = new Set(definitions.map((row) => row.id));
  const optionCodeById = new Map(
    options.map((option) => [option.id, option.code]),
  );

  const result = new Map<string, string>();
  for (const value of values) {
    if (!knownDefinitions.has(value.attributeDefinitionId)) continue;
    const display = attributeValueDisplay(value, optionCodeById);
    if (display !== null && display.length > 0) {
      result.set(value.attributeDefinitionId, display);
    }
  }
  return result;
}

/** The stored columns a display form is built from. */
export type AttributeValueDisplayRow = AttributeValueRow;

/**
 * Builds the display string for a stored value.
 *
 * THE single definition of "what does the component currently record?".
 * Analysis records it on a finding, the queue compares it to decide staleness,
 * and apply re-checks it before writing; if those three ever formatted a value
 * differently, a stale suggestion could be applied or a fresh one refused.
 *
 * Option codes are supplied by the caller because the two callers resolve them
 * differently: this module batch-loads them for one value, while analysis has
 * every option of the run already in memory. `null` means the row holds no
 * representable value, which is different from an empty string.
 */
export function attributeValueDisplay(
  row: AttributeValueRow,
  optionCodeById: ReadonlyMap<string, string>,
): string | null {
  if (row.optionId) {
    return optionCodeById.get(row.optionId) ?? null;
  }

  if (
    Array.isArray(row.selectedOptionIds) &&
    row.selectedOptionIds.length > 0
  ) {
    const codes = row.selectedOptionIds
      .filter((id): id is string => typeof id === 'string')
      .map((id) => optionCodeById.get(id))
      .filter((code): code is string => Boolean(code));
    return codes.length > 0 ? codes.join(', ') : null;
  }

  if (row.booleanValue !== null && row.booleanValue !== undefined) {
    return row.booleanValue ? 'Yes' : 'No';
  }

  if (row.numberValue !== null && row.numberValue !== undefined) {
    // `numberValue` is a numeric column, so it reads back as a padded decimal
    // string ('470.000000'); the reviewer must never see that, and the unit is
    // part of what was recorded.
    const numeric = Number(row.numberValue);
    if (!Number.isFinite(numeric)) return null;
    return row.unit ? `${numeric} ${row.unit}` : String(numeric);
  }

  if (row.dateValue) {
    return new Date(row.dateValue).toISOString().slice(0, 10);
  }

  if (row.textValue) return row.textValue;

  return null;
}

/**
 * Resolves a stored value's option codes, then formats it.
 *
 * At most two queries: one for a single-select option, one batched query for a
 * multi-select value. Never one query per option.
 */
async function formatAttributeValueDisplay(
  row: AttributeValueRow,
  client: DbExecutor,
): Promise<string | null> {
  const optionIds: string[] = [];
  if (row.optionId) optionIds.push(row.optionId);
  if (Array.isArray(row.selectedOptionIds)) {
    for (const id of row.selectedOptionIds) {
      if (typeof id === 'string') optionIds.push(id);
    }
  }

  if (optionIds.length === 0) {
    return attributeValueDisplay(row, new Map());
  }

  const options = await client
    .select({ id: attributeOptions.id, code: attributeOptions.code })
    .from(attributeOptions)
    .where(inArray(attributeOptions.id, optionIds));

  return attributeValueDisplay(
    row,
    new Map(options.map((option) => [option.id, option.code])),
  );
}

/** Reads a definition's activation state and comparison metadata. */ export async function readAttributeDefinitionState(
  attributeDefinitionId: string,
  client: DbExecutor = db,
): Promise<{
  id: string;
  code: string;
  name: string;
  dataType: string;
  unitCategory: string | null;
  defaultUnit: string | null;
  validationRules: Record<string, unknown> | null;
  isActive: boolean;
} | null> {
  const [row] = await client
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
    .from(attributeDefinitions)
    .where(eq(attributeDefinitions.id, attributeDefinitionId))
    .limit(1);

  return row
    ? {
        ...row,
        // The column is jsonb typed as `unknown`; a non-object value would not
        // be a usable rule set, so it is normalised to null here.
        validationRules:
          row.validationRules &&
          typeof row.validationRules === 'object' &&
          !Array.isArray(row.validationRules)
            ? (row.validationRules as Record<string, unknown>)
            : null,
      }
    : null;
}

/**
 * Every unit the authoritative model knows, for semantic comparison.
 *
 * One bounded read of a small lookup table, used by the queue's staleness check
 * and by the apply path so both compare values the same way.
 */
export async function loadUnitCatalog(
  client: DbExecutor = db,
): Promise<UnitRef[]> {
  const rows = await client
    .select({
      name: units.name,
      category: units.category,
      isBaseUnit: units.isBaseUnit,
      conversionFactor: units.conversionFactor,
      precision: units.precision,
    })
    .from(units)
    .where(eq(units.isActive, true));

  return rows.map((row) => ({
    name: row.name,
    category: row.category,
    isBaseUnit: row.isBaseUnit,
    conversionFactor:
      row.conversionFactor === null ? null : Number(row.conversionFactor),
    precision: Number(row.precision),
  }));
}
