import { db, type DbExecutor } from '@ananya/database';
import {
  attributeDefinitions,
  attributeOptions,
  componentAttributeValues,
} from '@ananya/database/schema';
import { eq, inArray } from '@ananya/database/query';
import {
  buildIdentityAttributeIndex,
  normalizeName,
  type AttributeOptionRef,
  type ComponentAttributeValueRow,
  type ComponentIdentityAttributes,
  type IdentityAttributeValue,
} from './component-duplicate-intelligence';

/**
 * Structured attribute value loader shared by component analysis.
 *
 * Extracted so the duplicate analyzer and the consolidation preview read
 * attribute state through exactly the same path: a preview that disagreed with
 * the analyzer about an attribute would be actively misleading.
 *
 * Read-only: two bounded `SELECT`s (values, then the options they reference).
 */

/** Batch size for `IN (...)` lookups. */
const LOAD_CHUNK_SIZE = 200;

/**
 * Loads comparable structured attribute values for the given components.
 *
 * Only identity-bearing data types are returned (see
 * `IDENTITY_ATTRIBUTE_DATA_TYPES`); free text is deliberately excluded because it
 * is not reliable identity data.
 */
export async function loadIdentityAttributeValues(
  componentIds: readonly string[],
  executor: DbExecutor = db,
): Promise<Map<string, ComponentIdentityAttributes>> {
  const unique = [...new Set(componentIds.filter((id) => Boolean(id)))];
  if (unique.length === 0) return new Map();

  const rows: ComponentAttributeValueRow[] = [];
  const optionIds = new Set<string>();

  for (let index = 0; index < unique.length; index += LOAD_CHUNK_SIZE) {
    const chunk = unique.slice(index, index + LOAD_CHUNK_SIZE);
    const values = await executor
      .select({
        componentId: componentAttributeValues.componentId,
        attributeDefinitionId: componentAttributeValues.attributeDefinitionId,
        code: attributeDefinitions.code,
        label: attributeDefinitions.name,
        dataType: attributeDefinitions.dataType,
        numberValue: componentAttributeValues.numberValue,
        normalizedNumberValue: componentAttributeValues.normalizedNumberValue,
        booleanValue: componentAttributeValues.booleanValue,
        optionId: componentAttributeValues.optionId,
        unit: componentAttributeValues.unit,
      })
      .from(componentAttributeValues)
      .innerJoin(
        attributeDefinitions,
        eq(
          attributeDefinitions.id,
          componentAttributeValues.attributeDefinitionId,
        ),
      )
      .where(inArray(componentAttributeValues.componentId, chunk));

    for (const value of values) {
      if (value.optionId) optionIds.add(value.optionId);
      rows.push(value);
    }
  }

  const options = await loadAttributeOptions([...optionIds], executor);
  return buildIdentityAttributeIndex(rows, options);
}

/**
 * Loads EVERY structured attribute value for the given components.
 *
 * Duplicate detection uses {@link loadIdentityAttributeValues}, which covers only
 * identity-bearing data types because free text is not reliable evidence that two
 * records are the same part. Consolidation is a different question: it must
 * reconcile every stored value, because the retired component's values disappear
 * with it. If the preview used the identity subset it would report "nothing to
 * decide" while execution correctly demanded a decision — so the preview would be
 * unable to ever produce an executable request.
 *
 * The two loaders share their query shape and the same classification vocabulary;
 * only the data-type filter differs.
 */
export async function loadAllAttributeValues(
  componentIds: readonly string[],
  executor: DbExecutor = db,
): Promise<Map<string, ComponentIdentityAttributes>> {
  const unique = [...new Set(componentIds.filter((id) => Boolean(id)))];
  if (unique.length === 0) return new Map();

  const rows: ComponentAttributeValueRow[] = [];
  const optionIds = new Set<string>();

  for (let index = 0; index < unique.length; index += LOAD_CHUNK_SIZE) {
    const chunk = unique.slice(index, index + LOAD_CHUNK_SIZE);
    const values = await executor
      .select({
        componentId: componentAttributeValues.componentId,
        attributeDefinitionId: componentAttributeValues.attributeDefinitionId,
        code: attributeDefinitions.code,
        label: attributeDefinitions.name,
        dataType: attributeDefinitions.dataType,
        numberValue: componentAttributeValues.numberValue,
        normalizedNumberValue: componentAttributeValues.normalizedNumberValue,
        booleanValue: componentAttributeValues.booleanValue,
        optionId: componentAttributeValues.optionId,
        unit: componentAttributeValues.unit,
        textValue: componentAttributeValues.textValue,
      })
      .from(componentAttributeValues)
      .innerJoin(
        attributeDefinitions,
        eq(
          attributeDefinitions.id,
          componentAttributeValues.attributeDefinitionId,
        ),
      )
      .where(inArray(componentAttributeValues.componentId, chunk));

    for (const value of values) {
      if (value.optionId) optionIds.add(value.optionId);
      rows.push(value);
    }
  }

  const options = await loadAttributeOptions([...optionIds], executor);
  return buildAllAttributeIndex(rows, options);
}

/**
 * Builds the attribute index for every stored value, including free text.
 *
 * Mirrors `buildIdentityAttributeIndex` but additionally produces a comparable
 * value for TEXT, so a free-text difference is visible to the reviewer instead of
 * surfacing for the first time during execution.
 */
export function buildAllAttributeIndex(
  rows: readonly ComponentAttributeValueRow[],
  options: ReadonlyMap<string, AttributeOptionRef> = new Map(),
): Map<string, ComponentIdentityAttributes> {
  const byComponentId = buildIdentityAttributeIndex(rows, options);

  for (const row of rows) {
    const bucket =
      byComponentId.get(row.componentId) ??
      new Map<string, IdentityAttributeValue>();

    if (bucket.has(row.code)) continue;

    const comparable = (row.textValue ?? '').trim();
    bucket.set(row.code, {
      code: row.code,
      label: row.label,
      dataType: row.dataType,
      attributeDefinitionId: row.attributeDefinitionId,
      comparable: comparable.length > 0 ? normalizeName(comparable) : null,
      display: comparable,
    });
    byComponentId.set(row.componentId, bucket);
  }

  return byComponentId;
}

/** Loads option codes/labels for SELECT attribute values. */
export async function loadAttributeOptions(
  optionIds: readonly string[],
  executor: DbExecutor = db,
): Promise<Map<string, AttributeOptionRef>> {
  if (optionIds.length === 0) return new Map();

  const options = new Map<string, AttributeOptionRef>();
  for (let index = 0; index < optionIds.length; index += LOAD_CHUNK_SIZE) {
    const chunk = optionIds.slice(index, index + LOAD_CHUNK_SIZE);
    const rows = await executor
      .select({
        id: attributeOptions.id,
        code: attributeOptions.code,
        label: attributeOptions.label,
      })
      .from(attributeOptions)
      .where(inArray(attributeOptions.id, chunk));
    for (const row of rows) options.set(row.id, row);
  }

  return options;
}

/** How one attribute differs between two components. */
export type AttributePresence =
  'IDENTICAL' | 'CANONICAL_ONLY' | 'SOURCE_ONLY' | 'CONFLICTING';

export interface AttributeComparisonEntry {
  /** The attribute definition id, used to submit a resolution for it. */
  attributeDefinitionId: string;
  code: string;
  label: string;
  dataType: string;
  canonicalValue: string | null;
  sourceValue: string | null;
  classification: AttributePresence;
}

/**
 * Classifies every attribute recorded on either component.
 *
 * A missing value is never treated as a conflict (the same principle the
 * duplicate analyzers follow); it becomes `CANONICAL_ONLY` / `SOURCE_ONLY` and is
 * left for the reviewer to decide.
 */
export function compareComponentAttributes(input: {
  canonicalAttributes: ComponentIdentityAttributes | undefined;
  sourceAttributes: ComponentIdentityAttributes | undefined;
}): AttributeComparisonEntry[] {
  const { canonicalAttributes, sourceAttributes } = input;
  const codes = new Set<string>([
    ...(canonicalAttributes?.keys() ?? []),
    ...(sourceAttributes?.keys() ?? []),
  ]);

  const entries: AttributeComparisonEntry[] = [];
  for (const code of codes) {
    const canonical = canonicalAttributes?.get(code);
    const source = sourceAttributes?.get(code);
    const reference = canonical ?? source;
    if (!reference) continue;

    const canonicalValue = canonical
      ? canonical.display || canonical.comparable
      : null;
    const sourceValue = source ? source.display || source.comparable : null;

    let classification: AttributePresence;
    if (canonical && source) {
      classification =
        canonical.comparable !== null &&
        canonical.comparable === source.comparable
          ? 'IDENTICAL'
          : 'CONFLICTING';
    } else if (canonical) {
      classification = 'CANONICAL_ONLY';
    } else {
      classification = 'SOURCE_ONLY';
    }

    entries.push({
      attributeDefinitionId: reference.attributeDefinitionId,
      code,
      label: reference.label || code,
      dataType: reference.dataType,
      canonicalValue,
      sourceValue,
      classification,
    });
  }

  return entries.sort((left, right) => left.code.localeCompare(right.code));
}
