/**
 * Deterministic state snapshots and staleness evaluation for Attribute
 * Intelligence findings.
 *
 * Pure and database-free: every function here takes plain data and returns plain
 * data, so the rules that decide "is this finding still about the current world?"
 * are testable without a database and identical wherever they are used.
 *
 * The snapshot the audit writes into `currentValue` IS the expected state
 * (`metadata.expectedState`): the machine-comparable description of the ERP state
 * the finding was generated against. That is what the fingerprint hashes, and it is
 * what staleness re-evaluates against live rows later. Keeping one object rather
 * than two means a finding cannot disagree with itself about what it expected.
 */

/** The attribute columns that define a finding's applicability. */
export interface AttributeIdentitySnapshot {
  id: string;
  code: string;
  name: string;
  dataType: string;
  unitCategory: string | null;
  defaultUnit: string | null;
  /** Sorted, lower-cased: alias order is not meaningful, so it must not churn. */
  aliases: string[];
  groupName: string | null;
  isActive: boolean;
}

export interface CategorySnapshot {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

/** Raw attribute row shape this module needs (a subset of the table). */
export interface AttributeIdentityRow {
  id: string;
  code: string;
  name: string;
  dataType: string;
  unitCategory?: string | null;
  defaultUnit?: string | null;
  aliases?: unknown;
  groupName?: string | null;
  isActive: boolean;
}

export interface CategoryRow {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

/** Normalizes an identifier for comparison, matching the fingerprint's rule. */
export function normalizeAttributeCode(value: string): string {
  return value.toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * Loose comparison key: strips everything that is not alphanumeric.
 *
 * The audit producers compare codes and names through this reduction
 * (`normalized` codes), so subject resolution uses the same rule — a resolution
 * that disagreed with the producer's own matching would attach a finding to an
 * attribute the producer was not talking about.
 */
export function normalizeAttributeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function readAliases(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)
    .sort();
}

export function toAttributeIdentitySnapshot(
  row: AttributeIdentityRow,
): AttributeIdentitySnapshot {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    dataType: row.dataType,
    unitCategory: row.unitCategory ?? null,
    defaultUnit: row.defaultUnit ?? null,
    aliases: readAliases(row.aliases),
    groupName: row.groupName ?? null,
    isActive: row.isActive,
  };
}

export function toCategorySnapshot(row: CategoryRow): CategorySnapshot {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: row.isActive,
  };
}

/**
 * Usage band for an attribute.
 *
 * Deliberately coarse. The producers' only usage threshold is zero ("unused"
 * means zero values and zero bindings; a suspicious binding reports its count but
 * does not threshold it), so the band records exactly that distinction plus which
 * kind of reference exists. Exact counters stay in the snapshot as evidence; a
 * band is what the fingerprint may depend on.
 */
export type AttributeUsageBand =
  | 'NO_VALUES_NO_BINDINGS'
  | 'NO_VALUES_WITH_BINDINGS'
  | 'VALUES_NO_BINDINGS'
  | 'VALUES_WITH_BINDINGS';

export function attributeUsageBand(input: {
  componentValueCount: number;
  bindingCount: number;
}): AttributeUsageBand {
  const hasValues = input.componentValueCount > 0;
  const hasBindings = input.bindingCount > 0;
  if (hasValues && hasBindings) return 'VALUES_WITH_BINDINGS';
  if (hasValues) return 'VALUES_NO_BINDINGS';
  if (hasBindings) return 'NO_VALUES_WITH_BINDINGS';
  return 'NO_VALUES_NO_BINDINGS';
}

/** Usage band for a single binding, on the same zero-threshold basis. */
export type BindingUsageBand = 'ZERO' | 'NON_ZERO';

export function bindingUsageBand(
  componentValueCount: number,
): BindingUsageBand {
  return componentValueCount > 0 ? 'NON_ZERO' : 'ZERO';
}

// ---------------------------------------------------------------------------
// Expected state
// ---------------------------------------------------------------------------

export const LEXICAL_SIMILARITY_RULE = 'LEXICAL_SIMILARITY';
export const DOMAIN_ANOMALY_RULE = 'DOMAIN_ANOMALY';
export const DOMAIN_EXPECTATION_RULE = 'DOMAIN_EXPECTATION';

/**
 * Expected state for an attribute relationship (duplicate / near-duplicate).
 *
 * Both sides are snapshotted so a later edit to either attribute — a rename, a
 * data-type change, a deliberate deactivation — is detectable, and so the
 * fingerprint changes when the pair's identity changes. The pair is stored in the
 * caller's canonical order so the finding does not depend on which side the
 * producer listed first.
 */
export interface AttributeRelationshipExpectedState {
  attributeA: AttributeIdentitySnapshot;
  attributeB: AttributeIdentitySnapshot;
  rule: typeof LEXICAL_SIMILARITY_RULE;
}

export function buildRelationshipExpectedState(input: {
  first: AttributeIdentitySnapshot;
  second: AttributeIdentitySnapshot;
}): AttributeRelationshipExpectedState {
  const [attributeA, attributeB] =
    input.first.id <= input.second.id
      ? [input.first, input.second]
      : [input.second, input.first];
  return { attributeA, attributeB, rule: LEXICAL_SIMILARITY_RULE };
}

/** Expected state for an existing, suspect attribute/category binding. */
export interface BindingExpectedState {
  attribute: AttributeIdentitySnapshot;
  category: CategorySnapshot;
  bindingExists: boolean;
  /** The attributed components' usage of this attribute, banded. */
  usageBand: BindingUsageBand;
  rule: typeof DOMAIN_ANOMALY_RULE;
}

export function buildBindingExpectedState(input: {
  attribute: AttributeIdentitySnapshot;
  category: CategorySnapshot;
  componentValueCount: number;
}): BindingExpectedState {
  return {
    attribute: input.attribute,
    category: input.category,
    // The producer only ever flags a binding that exists, so the expected state
    // records that fact and later checks it rather than assuming it.
    bindingExists: true,
    usageBand: bindingUsageBand(input.componentValueCount),
    rule: DOMAIN_ANOMALY_RULE,
  };
}

/**
 * Expected state for a category that should carry an attribute it does not.
 *
 * `attributeExists` is the *analysis-time* answer to "is there a definition this
 * expectation can point at?". It is part of the expected state because it decides
 * whether the finding has an attribute subject or is category-first only: creating
 * the definition changes the finding's subject, and therefore its identity.
 */
export interface ExpectedAttributeState {
  category: CategorySnapshot;
  expectedAttributeCode: string;
  expectedAttributeName: string;
  existingAttribute: AttributeIdentitySnapshot | null;
  attributeExists: boolean;
  rule: typeof DOMAIN_EXPECTATION_RULE;
}

export function buildExpectedAttributeState(input: {
  category: CategorySnapshot;
  expectedAttributeCode: string;
  expectedAttributeName: string;
  existingAttribute: AttributeIdentitySnapshot | null;
}): ExpectedAttributeState {
  const normalizedCode = normalizeAttributeCode(input.expectedAttributeCode);
  return {
    category: input.category,
    expectedAttributeCode: normalizedCode,
    expectedAttributeName: input.expectedAttributeName,
    existingAttribute: input.existingAttribute,
    attributeExists: input.existingAttribute !== null,
    rule: DOMAIN_EXPECTATION_RULE,
  };
}

/** Expected state for an attribute nothing references. */
export interface UnusedAttributeState {
  attribute: AttributeIdentitySnapshot;
  componentValueCount: number;
  directBindingCount: number;
  usageBand: AttributeUsageBand;
}

export function buildUnusedAttributeState(input: {
  attribute: AttributeIdentitySnapshot;
  componentValueCount: number;
  directBindingCount: number;
}): UnusedAttributeState {
  return {
    attribute: input.attribute,
    componentValueCount: input.componentValueCount,
    directBindingCount: input.directBindingCount,
    usageBand: attributeUsageBand({
      componentValueCount: input.componentValueCount,
      bindingCount: input.directBindingCount,
    }),
  };
}

// ---------------------------------------------------------------------------
// Staleness
// ---------------------------------------------------------------------------

/** Live ERP state a stored expected state is checked against. */
export interface AttributeFindingLiveState {
  /** Definition snapshots by id; a missing key means the definition is gone. */
  attributes: Map<string, AttributeIdentitySnapshot>;
  /** Category snapshots by id; a missing key means the category is gone. */
  categories: Map<string, CategorySnapshot>;
  /** `${categoryId}::${attributeDefinitionId}` for every existing binding. */
  bindingKeys: Set<string>;
  /**
   * `${categoryId}::${normalizedAttributeKey(code)}` for every existing binding.
   * Lets an expectation be checked by the attribute's *code*, which is how a
   * category-first finding identifies what it wants bound.
   */
  bindingKeysByAttributeCode: Set<string>;
  /** Alphanumeric-reduced codes of every existing definition. */
  existingAttributeKeys: Set<string>;
  /** Component value counts by attribute definition id. */
  componentValueCounts: Map<string, number>;
  /** Direct binding counts by attribute definition id. */
  bindingCounts: Map<string, number>;
}

export function bindingKey(
  categoryId: string,
  attributeDefinitionId: string,
): string {
  return `${categoryId}::${attributeDefinitionId}`;
}

/** Reads a string field from an untyped jsonb snapshot. */
function readSnapshotString(
  source: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = source?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readSnapshotObject(
  source: Record<string, unknown> | null | undefined,
  key: string,
): Record<string, unknown> | null {
  const value = source?.[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Describes why a stored finding's expected state no longer holds, or `null` when
 * it still does.
 *
 * Compared field by field against the live snapshot rather than by a single
 * timestamp, because attribute state is spread across several rows (the
 * definition, the category, the binding, the value counts) and none of them
 * carries a timestamp that covers the others. A definition edit does not touch
 * `category_attributes`, and a binding removal touches nothing else at all.
 *
 * Returns `null` for a finding with no readable expected state: findings written
 * before this pass (or by a producer that did not snapshot state) have nothing to
 * compare, and inventing a verdict for them would be worse than skipping the
 * check. They are still reconciled by the next audit run.
 */
export function describeAttributeFindingStaleness(input: {
  /**
   * Finding family. Typed as a plain string because the rule table is keyed by the
   * persisted `issue_type` column, and an unknown value must fall through to
   * "no rule" rather than fail to compile.
   */
  issueType: string;
  expectedState: Record<string, unknown> | null | undefined;
  live: AttributeFindingLiveState;
}): string | null {
  const { expectedState, live } = input;
  if (!expectedState) return null;

  switch (input.issueType) {
    case 'POSSIBLE_DUPLICATE':
    case 'DUPLICATE_ATTRIBUTE':
      return describeRelationshipStaleness(expectedState, live);
    case 'SUSPICIOUS_BINDING':
      return describeBindingStaleness(expectedState, live);
    case 'MISSING_EXPECTED_ATTRIBUTE':
    case 'SUGGESTED_BINDING':
      return describeExpectedAttributeStaleness(expectedState, live);
    case 'UNUSED_ATTRIBUTE':
      return describeUnusedStaleness(expectedState, live);
    default:
      return null;
  }
}

function describeRelationshipStaleness(
  expectedState: Record<string, unknown>,
  live: AttributeFindingLiveState,
): string | null {
  const sideA = readSnapshotObject(expectedState, 'attributeA');
  const sideB = readSnapshotObject(expectedState, 'attributeB');

  for (const [label, side] of [
    ['first', sideA],
    ['related', sideB],
  ] as const) {
    const id = readSnapshotString(side, 'id');
    if (!id) continue;
    const current = live.attributes.get(id);
    if (!current) {
      return `the ${label} attribute no longer exists`;
    }
    if (identityChanged(side, current)) {
      return `the ${label} attribute's identity or configuration changed after this finding was generated`;
    }
  }

  return null;
}

/** True when a live snapshot differs from the stored one on any defining field. */
function identityChanged(
  stored: Record<string, unknown> | null,
  live: AttributeIdentitySnapshot,
): boolean {
  if (!stored) return false;
  const comparable: Array<[string, unknown]> = [
    ['code', live.code],
    ['name', live.name],
    ['dataType', live.dataType],
    ['unitCategory', live.unitCategory],
    ['defaultUnit', live.defaultUnit],
    ['groupName', live.groupName],
    ['isActive', live.isActive],
    ['aliases', live.aliases],
  ];

  for (const [key, value] of comparable) {
    if (!(key in stored)) continue;
    if (JSON.stringify(stored[key]) !== JSON.stringify(value)) return true;
  }
  return false;
}

function describeBindingStaleness(
  expectedState: Record<string, unknown>,
  live: AttributeFindingLiveState,
): string | null {
  const attributeId = readSnapshotString(
    readSnapshotObject(expectedState, 'attribute'),
    'id',
  );
  const categoryId = readSnapshotString(
    readSnapshotObject(expectedState, 'category'),
    'id',
  );

  if (attributeId && !live.attributes.has(attributeId)) {
    return 'the bound attribute no longer exists';
  }
  if (categoryId && !live.categories.has(categoryId)) {
    return 'the bound category no longer exists';
  }
  if (attributeId && categoryId) {
    const stillBound = live.bindingKeys.has(
      bindingKey(categoryId, attributeId),
    );
    if (!stillBound) {
      return 'the binding no longer exists';
    }
  }

  return null;
}

function describeExpectedAttributeStaleness(
  expectedState: Record<string, unknown>,
  live: AttributeFindingLiveState,
): string | null {
  const categoryId = readSnapshotString(
    readSnapshotObject(expectedState, 'category'),
    'id',
  );
  if (categoryId && !live.categories.has(categoryId)) {
    return 'the category no longer exists';
  }

  // The expectation was "this category does not carry this attribute". A binding
  // added for it — whether or not a definition existed at analysis time — closes
  // the gap this finding describes.
  const expectedCode = readSnapshotString(
    expectedState,
    'expectedAttributeCode',
  );
  if (
    categoryId &&
    expectedCode &&
    live.bindingKeysByAttributeCode.has(
      bindingKey(categoryId, normalizeAttributeKey(expectedCode)),
    )
  ) {
    return 'the expected attribute is now bound to this category';
  }

  const storedExists = expectedState.attributeExists === true;
  if (expectedCode && storedExists) {
    const nowExists = live.existingAttributeKeys.has(
      normalizeAttributeKey(expectedCode),
    );
    if (!nowExists) {
      return 'the attribute this expectation pointed at no longer exists';
    }
  }

  return null;
}

function describeUnusedStaleness(
  expectedState: Record<string, unknown>,
  live: AttributeFindingLiveState,
): string | null {
  const attributeId = readSnapshotString(
    readSnapshotObject(expectedState, 'attribute'),
    'id',
  );
  if (!attributeId) return null;

  if (!live.attributes.has(attributeId)) {
    return 'the attribute no longer exists';
  }

  const storedBand = readSnapshotString(expectedState, 'usageBand');
  if (!storedBand) return null;

  const liveBand = attributeUsageBand({
    componentValueCount: live.componentValueCounts.get(attributeId) ?? 0,
    bindingCount: live.bindingCounts.get(attributeId) ?? 0,
  });

  if (
    storedBand === 'NO_VALUES_NO_BINDINGS' &&
    liveBand !== 'NO_VALUES_NO_BINDINGS'
  ) {
    return 'the attribute is now referenced by at least one category or component';
  }
  if (
    storedBand !== 'NO_VALUES_NO_BINDINGS' &&
    liveBand === 'NO_VALUES_NO_BINDINGS'
  ) {
    return 'the attribute is no longer referenced';
  }

  return null;
}
