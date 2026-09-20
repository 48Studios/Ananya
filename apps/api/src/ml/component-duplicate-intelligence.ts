import { sql } from '@ananya/database/query';
import { extractManufacturerPartNumber } from './ml.service';
import {
  MAX_SEMANTIC_CANDIDATES_PER_COMPONENT,
  MAX_SEMANTIC_FINDINGS_PER_AUDIT,
  MAX_SEMANTIC_TOKEN_FANOUT,
  buildSemanticNameProfile,
  compareValueTokens,
  scoreSemanticCandidate,
  semanticBlockingTokens,
  type SemanticNameProfile,
  type SemanticRejectionReason,
  type SemanticScoreResult,
  type SemanticTokenVocabulary,
} from './component-semantic-similarity';
import type { PersistComponentFindingInput } from './component-review-queue.service';

/**
 * Deterministic Component Duplicate Intelligence (Pass 5A) plus the bounded
 * semantic/lexical candidate layer (Pass 5B).
 *
 * Everything in this module is deterministic, explainable and read-only. It
 * answers exactly one question: "do these two persisted component records
 * describe the same physical part?" using authoritative identity data only:
 *
 *  1. `EXACT_MPN`               — same manufacturer identity + same normalized MPN
 *  2. `PACKAGING_VARIANT`       — same manufacturer identity + same MPN modulo an
 *                                 explicit packaging/reel suffix
 *  3. `MPN_MANUFACTURER_CONFLICT` — identical normalized MPN, conflicting
 *                                 manufacturer identities
 *  4. `NAME_ATTRIBUTE_IDENTITY` — same manufacturer identity + same normalized
 *                                 name + compatible categories + no conflicting
 *                                 structured attributes
 *  5. `SEMANTIC_NAME_SIMILARITY` — blocking-retrieved pair with strong
 *                                 identity-token agreement and no contradicting
 *                                 manufacturer, category, package or physical
 *                                 value (Pass 5B)
 *
 * Deliberately NOT implemented (Pass 5B / Pass 6): fuzzy/lexical similarity,
 * embeddings, ML scoring, merge/consolidation. Nothing here writes component
 * data — findings only.
 *
 * The module is framework-free (no Nest, no repositories) so every rule is unit
 * testable without a database. Database access stays in the analyzer.
 */

/** Shortest normalized part number considered a real identifier. */
export const MIN_MPN_LENGTH = 4;

/**
 * Shortest normalized component name considered identity-bearing. Combined with
 * {@link isIdentityBearingName} this keeps names like "IC" or "SMD" out of the
 * name-identity tier.
 */
export const MIN_NAME_IDENTITY_LENGTH = 4;

/**
 * Values that are recorded in the MPN column but are not identifiers.
 * Comparing placeholders would flag every placeholder-bearing component as a
 * duplicate of every other.
 */
export const PLACEHOLDER_MPNS: readonly string[] = [
  'NA',
  'NONE',
  'NULL',
  'TBD',
  'TBA',
  'UNKNOWN',
  'TOBEDETERMINED',
  'MISSING',
  'GENERIC',
  'VARIOUS',
  'SEEABOVE',
  'NOTAPPLICABLE',
];

/**
 * Packaging / reel suffixes that do not change the engineering part.
 * Mirrors `strip_packaging_suffix()` in
 * `apps/ml/app/services/duplicate_detector.py` so the review queue reaches the
 * same conclusion as the creation-time duplicate detector.
 */
export const PACKAGING_SUFFIXES: readonly string[] = [
  'TR',
  'REEL',
  'TAPE',
  '7R',
  '07',
  '13',
  'CTU',
  'TU',
];

/**
 * POSIX pattern matching any packaging suffix at the end of a normalized part
 * number. Used as a *superset* prefilter for candidate retrieval; the exact
 * (length-guarded) rule is still applied in {@link stripPackagingSuffix}.
 */
export const PACKAGING_SUFFIX_PATTERN = `(${PACKAGING_SUFFIXES.join('|')})$`;

/**
 * Upper bound on duplicate findings produced by a single audit. Duplicate
 * detection reconciles the whole catalog, so a pathologically duplicated
 * catalog could otherwise generate an unbounded write. Ordering is
 * deterministic, so re-running an audit continues from a stable point.
 */
export const MAX_DUPLICATE_FINDINGS_PER_AUDIT = 500;

/**
 * Upper bound on name-identity candidate rows retrieved by one audit. MPN
 * candidates are bounded by the duplicates that actually exist; name groups can
 * in principle be larger, so this bound keeps retrieval (and memory) finite. It
 * is applied in deterministic order and reported by the analyzer when reached.
 */
export const MAX_NAME_CANDIDATE_ROWS = 2000;

/**
 * Caps the duplicate findings written by a single audit.
 *
 * Input order is deterministic, so a capped audit always produces the same
 * subset and re-running it continues from a stable point instead of thrashing.
 */
export function capDuplicateFindings(
  findings: PersistComponentFindingInput[],
  max: number = MAX_DUPLICATE_FINDINGS_PER_AUDIT,
): { findings: PersistComponentFindingInput[]; truncated: boolean } {
  if (findings.length <= max) return { findings, truncated: false };
  return { findings: findings.slice(0, max), truncated: true };
}

/**
 * Catalog row used for duplicate comparison. `manufacturerPartNumber` is
 * nullable because the name-identity tier also considers records that have no
 * recorded MPN.
 */
export interface CatalogMpnEntry {
  id: string;
  sku: string;
  name: string;
  manufacturerPartNumber: string | null;
  manufacturerId: string | null;
  categoryId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ComponentCategoryRef {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
}

export interface ComponentManufacturerRef {
  id: string;
  code: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Canonical normalization for part numbers: keep alphanumerics, uppercase.
 * Mirrors the normalization used by the creation-time duplicate detector and
 * the ML microservice.
 */
export function normalizeMpn(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Normalization used for manufacturer name/code comparison. Deliberately plain
 * (case + punctuation only) because manufacturer identity is resolved through
 * the ERP reference model, not through text similarity.
 */
export function normalizeName(value?: string | null): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Deterministic component-name normalization.
 *
 * Handles formatting-only differences that never change what the part *is*:
 *  - case and whitespace,
 *  - punctuation and repeated separators,
 *  - `Ω` / `ohm` and `µF` / `uF` style unit spellings,
 *  - `°C` / `degC` style temperature spellings.
 *
 * It never removes technical values: `10KΩ Resistor 0805` and
 * `100KΩ Resistor 0805` stay different because the value digits are kept.
 *
 * The SQL expression in {@link normalizedNameSql} mirrors this function
 * exactly; `component-duplicate-intelligence.integration-spec.ts` asserts the
 * two agree on real rows.
 */
export function normalizeComponentName(value?: string | null): string {
  return (value ?? '')
    .replace(/[Ωω]/g, 'ohm')
    .replace(/[µμ]/g, 'u')
    .toLowerCase()
    .replace(/°c/g, 'degc')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * A column or SQL fragment passed to the normalization helpers. Typed loosely
 * because `sql` accepts any interpolation value; the helpers exist so the SQL
 * mirror of each JS normalization lives in exactly one place.
 */
export type SqlExpressionInput = unknown;

/**
 * Drizzle `sql` fragment type, derived from the query helpers so this module
 * needs no direct `drizzle-orm` dependency. Annotating with it (instead of
 * relying on inference) keeps the emitted declarations portable.
 */
export type SqlFragment<T = string> = ReturnType<typeof sql<T>>;

/** A Drizzle `sql` fragment usable as a `where` condition. */
export type SqlCondition = SqlFragment<unknown>;

/**
 * SQL mirror of {@link normalizeMpn}: `RC0805FR-0727RL` -> `RC0805FR0727RL`.
 * `regexp_replace` and `upper` are both IMMUTABLE, so this expression can back
 * an index.
 */
export function normalizedMpnSql(column: SqlExpressionInput): SqlFragment {
  return sql<string>`upper(regexp_replace(${column}, '[^A-Za-z0-9]', '', 'g'))`;
}

/**
 * SQL mirror of {@link normalizeComponentName}. `lower` and `replace` are
 * IMMUTABLE, so this expression can back an index.
 */
export function normalizedNameSql(column: SqlExpressionInput): SqlFragment {
  return sql<string>`regexp_replace(replace(replace(replace(lower(replace(replace(${column}, 'Ω', 'ohm'), 'ω', 'ohm')), 'µ', 'u'), 'μ', 'u'), '°c', 'degc'), '[^a-z0-9]', '', 'g')`;
}

export function isPlaceholderMpn(normalizedMpn: string): boolean {
  return PLACEHOLDER_MPNS.includes(normalizedMpn);
}

/**
 * True when two normalized part numbers identify the same engineering part and
 * must therefore never be reported as an MPN conflict:
 *
 *  - identical values,
 *  - values differing only by a packaging/reel suffix (`...0710KL` vs
 *    `...0710KLTR`),
 *  - one being a separator-split fragment of the other. Free text such as
 *    `RC0805FR 0710KL` is tokenized into `RC0805FR` and `0710KL`, so a fragment
 *    is extraction noise rather than a different identifier.
 *
 * This governs *conflict* reporting only. Duplicate identity never uses the
 * fragment rule: a shared prefix is not an identity.
 */
export function areEquivalentMpns(first: string, second: string): boolean {
  if (first === second) return true;
  if (stripPackagingSuffix(first) === stripPackagingSuffix(second)) return true;
  return first.includes(second) || second.includes(first);
}

/**
 * Candidate identifier tokens inside free text. Matches the token shape used by
 * the creation-time extractor: an alphanumeric run of at least five characters
 * with no whitespace.
 */
const MPN_TOKEN_PATTERN = /\b[A-Z0-9][A-Z0-9._/-]{4,}\b/gi;

/**
 * Finds the first token in free text that plausibly is a manufacturer part
 * number, skipping words, footprint codes, engineering measurements,
 * placeholders, and internal values.
 *
 * `extractManufacturerPartNumber()` is reused per candidate so trailing
 * manufacturer/product suffixes (`-YAGEO-SMD`) are stripped identically to the
 * creation-time flow. Unlike that helper it keeps scanning instead of giving up
 * on the first regex match, which is required when the text is a component name
 * such as "Chip Resistor RC0805FR-0727RL".
 */
export function extractCandidateMpnFromText(
  text: string,
  manufacturers: Array<{ name: string; code: string }> = [],
  packagePatterns: readonly string[] = [],
): string | undefined {
  const tokens = text.match(MPN_TOKEN_PATTERN) ?? [];

  for (const token of tokens) {
    const candidate = extractManufacturerPartNumber(token, manufacturers);
    if (!candidate) continue;

    const normalized = normalizeMpn(candidate);
    if (!normalized || normalized.length < MIN_MPN_LENGTH) continue;
    if (!/[A-Z]/.test(normalized) || !/\d/.test(normalized)) continue;
    if (isPlaceholderMpn(normalized)) continue;
    if (isPackageCode(normalized, packagePatterns)) continue;
    // Descriptions are full of ratings ("27Ω ±1% 125mW 0805"); those are
    // specifications, never manufacturer part numbers.
    if (isEngineeringMeasurement(normalized, packagePatterns)) continue;

    return candidate;
  }

  return undefined;
}

/**
 * Removes a trailing packaging/reel code when what remains is still a
 * substantial identifier (mirrors the Python guard `len(norm) > len(suffix)+4`).
 *
 * Only the explicit {@link PACKAGING_SUFFIXES} list is stripped, in list order,
 * and never when the remainder would be too short to be a real identifier. A
 * meaningful manufacturer variant therefore stays distinct.
 */
export function stripPackagingSuffix(normalizedMpn: string): string {
  for (const suffix of PACKAGING_SUFFIXES) {
    if (
      normalizedMpn.endsWith(suffix) &&
      normalizedMpn.length > suffix.length + 4
    ) {
      return normalizedMpn.slice(0, normalizedMpn.length - suffix.length);
    }
  }
  return normalizedMpn;
}

/**
 * True when the token is actually a footprint/package code rather than a
 * manufacturer part number (e.g. `0805`, `SOT23`). Package codes legitimately
 * appear in component names, so they must not be suggested as MPNs.
 */
export function isPackageCode(
  normalizedToken: string,
  packagePatterns: readonly string[],
): boolean {
  if (/^(0[2468]0[1235]|1[0-9]{3}|2[0-9]{3})$/.test(normalizedToken)) {
    return true;
  }
  return packagePatterns.some((pattern) => {
    const normalized = normalizeMpn(pattern);
    return Boolean(normalized) && normalized === normalizedToken;
  });
}

/**
 * Units and unit-like qualifiers that mark a token as an engineering
 * measurement rather than an identifier.
 *
 * Matched against the UPPERCASED token suffix, so case never matters: `125mW`
 * and `125MW` are the same measurement. Deliberately excludes ambiguous
 * single-letter abbreviations that appear inside legitimate part numbers as
 * ordinary characters (for example `R` in `RC0805FR`, or `C` in
 * `C0805C104K5RACTU`), and excludes `C` for temperature because `°C` separates
 * on the degree sign and never forms a single token.
 */
export const MEASUREMENT_UNITS: readonly string[] = [
  // Power
  'W',
  'MW',
  'KW',
  // Voltage
  'V',
  'MV',
  'KV',
  'VAC',
  'VDC',
  // Current
  'A',
  'MA',
  'UA',
  // Charge / capacity
  'AH',
  'MAH',
  // Resistance (`Ω` and `kΩ` separate on the symbol and never form a token)
  'OHM',
  'KOHM',
  'MOHM',
  // Frequency
  'HZ',
  'KHZ',
  'MHZ',
  'GHZ',
  // Capacitance
  'F',
  'UF',
  'NF',
  'PF',
  'MF',
  // Inductance
  'H',
  'UH',
  'MH',
  'NH',
  // Temperature (`DEG` / `DEGC` cover "25degC"; `°C` is split by the symbol)
  'DEG',
  'DEGC',
  // Ratio and percentage notations
  'DB',
  'PCT',
];

/**
 * Amount + unit shape: a leading numeric amount immediately followed by an
 * alphabetical unit run, plus whatever trails it.
 */
const MEASUREMENT_PATTERN = /^(\d+(?:\.\d+)?)([A-Z]+)(.*)$/;

/**
 * True when the candidate is an engineering measurement rather than a part
 * number (for example `125MW`, `100MA`, `10KHZ`, `27OHM`, `1000V`).
 *
 * A measurement requires the numeric amount to be at the very START of the
 * token, followed immediately by a known unit. That constraint is what keeps
 * legitimate identifiers safe: the `N4148`/`N2222` in `1N4148`/`2N2222` is not
 * a unit, and identifiers that merely contain unit-like letters after a letter
 * prefix (`RC0805FR-0727RL`, `LM358DR`, `SSM3K35AMFV`, `C0805C104K5RACTU`)
 * never reach the unit check because they do not begin with a number.
 *
 * A trailing remainder is only tolerated when it is itself a footprint code, so
 * compound descriptor tokens such as `125MW0805` are still rejected.
 */
export function isEngineeringMeasurement(
  normalizedToken: string,
  packagePatterns: readonly string[] = [],
): boolean {
  const match = normalizedToken.match(MEASUREMENT_PATTERN);
  if (!match) return false;

  const unit = match[2];
  const remainder = match[3];
  if (!unit || !MEASUREMENT_UNITS.includes(unit)) return false;

  if (!remainder) return true;
  return isPackageCode(remainder, packagePatterns);
}

export function buildMpnIndex(
  catalog: CatalogMpnEntry[],
): Map<string, CatalogMpnEntry[]> {
  const index = new Map<string, CatalogMpnEntry[]>();
  for (const entry of catalog) {
    const normalized = normalizeMpn(entry.manufacturerPartNumber);
    if (!normalized) continue;
    const bucket = index.get(normalized);
    if (bucket) {
      bucket.push(entry);
    } else {
      index.set(normalized, [entry]);
    }
  }
  return index;
}

/** Stable ordering: oldest record first, ties broken by id. */
export function compareCatalogOrder(
  a: CatalogMpnEntry,
  b: CatalogMpnEntry,
): number {
  const delta = a.createdAt.getTime() - b.createdAt.getTime();
  return delta !== 0 ? delta : a.id.localeCompare(b.id);
}

/**
 * True when the two categories are the same node or one is an ancestor of the
 * other. Re-categorising `Resistors` to `Electronic Components` is a hierarchy
 * refinement, not a conflict worth reviewing.
 */
export function areCategoriesRelated(
  firstId: string,
  secondId: string,
  categoryById: Map<string, ComponentCategoryRef>,
): boolean {
  if (firstId === secondId) return true;
  return (
    collectAncestorIds(firstId, categoryById).has(secondId) ||
    collectAncestorIds(secondId, categoryById).has(firstId)
  );
}

function collectAncestorIds(
  categoryId: string,
  categoryById: Map<string, ComponentCategoryRef>,
): Set<string> {
  const ids = new Set<string>();
  let current: string | null = categoryId;
  while (current && !ids.has(current)) {
    ids.add(current);
    current = categoryById.get(current)?.parentId ?? null;
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Manufacturer identity
// ---------------------------------------------------------------------------

/** Manufacturer hint term as published by an installed Data Pack. */
export interface ManufacturerHintTerm {
  name?: string;
  code?: string;
  aliases?: string[];
}

export interface ManufacturerIdentityIndex {
  /** Manufacturer id -> canonical identity key. */
  identityByManufacturerId: Map<string, string>;
  /** Canonical identity key -> preferred display name. */
  nameByIdentity: Map<string, string>;
  /** Normalized term (name / code / alias) -> identity key. */
  identityByTerm: Map<string, string>;
  /** Identities that were formed by merging more than one ERP record. */
  aliasMergedIdentities: Set<string>;
}

export function createEmptyManufacturerIdentityIndex(): ManufacturerIdentityIndex {
  return {
    identityByManufacturerId: new Map(),
    nameByIdentity: new Map(),
    identityByTerm: new Map(),
    aliasMergedIdentities: new Set(),
  };
}

/**
 * Builds the authoritative manufacturer identity model.
 *
 * The ERP manufacturer table is the authority: its unique `code` is the
 * canonical identity key. Aliases come *only* from the existing manufacturer
 * intelligence reference data (Data Pack manufacturer hints, which is where
 * `yageo` / `phycomp` style relationships are declared) — duplicate detection
 * never invents its own alias table.
 *
 * Two ERP records are merged only when a hint unambiguously ties them together:
 * the alias term must resolve to exactly one claiming manufacturer. A term that
 * is claimed by several manufacturers, or that is itself ambiguous, never
 * merges records, so genuinely different manufacturers stay distinct.
 */
export function buildManufacturerIdentityIndex(input: {
  manufacturers: Iterable<ComponentManufacturerRef>;
  hints?: readonly ManufacturerHintTerm[];
}): ManufacturerIdentityIndex {
  const index = createEmptyManufacturerIdentityIndex();
  const rowIdByTerm = new Map<string, string>();
  const ambiguousTerms = new Set<string>();

  const manufacturerRows = Array.from(input.manufacturers);

  for (const row of manufacturerRows) {
    const key = normalizeName(row.code) || normalizeName(row.name);
    if (!key) continue;
    index.identityByManufacturerId.set(row.id, key);
    if (!index.nameByIdentity.has(key)) index.nameByIdentity.set(key, row.name);
    for (const term of [normalizeName(row.name), normalizeName(row.code)]) {
      if (!term) continue;
      const owner = rowIdByTerm.get(term);
      if (owner && owner !== row.id) {
        ambiguousTerms.add(term);
        continue;
      }
      rowIdByTerm.set(term, row.id);
    }
  }

  // Parent pointer per identity key, used for deterministic union-find.
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    let current = key;
    while (parent.has(current) && parent.get(current) !== current) {
      current = parent.get(current) as string;
    }
    return current;
  };
  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    // Deterministic root: the lexicographically smallest identity key wins.
    const [root, child] =
      leftRoot <= rightRoot ? [leftRoot, rightRoot] : [rightRoot, leftRoot];
    parent.set(child, root);
    index.aliasMergedIdentities.add(root);
  };

  const claims = new Map<string, Set<string>>();
  const hintNameByIdentity = new Map<string, string>();
  for (const hint of input.hints ?? []) {
    const hintRowId =
      rowIdByTerm.get(normalizeName(hint.code)) ??
      rowIdByTerm.get(normalizeName(hint.name));
    if (!hintRowId) continue;
    const hintIdentity = index.identityByManufacturerId.get(hintRowId);
    if (!hintIdentity) continue;
    // The hint declares the canonical manufacturer name, so it wins as the
    // display name when its aliases merge several ERP records.
    if (hint.name?.trim()) {
      hintNameByIdentity.set(hintIdentity, hint.name.trim());
    }

    for (const term of [normalizeName(hint.name), normalizeName(hint.code)]) {
      if (!term || ambiguousTerms.has(term)) continue;
      const bucket = claims.get(term) ?? new Set<string>();
      bucket.add(hintIdentity);
      claims.set(term, bucket);
    }

    for (const rawAlias of hint.aliases ?? []) {
      // Mirrors the ML resolver's guard: never treat a generic or one-letter
      // term as an identity-bearing alias.
      if (!rawAlias || rawAlias.trim().length < 2) continue;
      const term = normalizeName(rawAlias);
      if (!term || term === 'generic' || ambiguousTerms.has(term)) continue;
      const bucket = claims.get(term) ?? new Set<string>();
      bucket.add(hintIdentity);
      claims.set(term, bucket);
    }
  }

  for (const [term, claimedIdentities] of claims) {
    if (claimedIdentities.size !== 1) continue; // ambiguous claim: never merge
    const [identity] = claimedIdentities;
    if (!identity) continue;
    index.identityByTerm.set(term, identity);

    const aliasOwnerId = rowIdByTerm.get(term);
    if (!aliasOwnerId) continue;
    const aliasOwnerIdentity = index.identityByManufacturerId.get(aliasOwnerId);
    if (aliasOwnerIdentity && aliasOwnerIdentity !== identity) {
      union(identity, aliasOwnerIdentity);
    }
  }

  // Resolve unions into final identity keys.
  for (const [manufacturerId, key] of index.identityByManufacturerId) {
    const root = find(key);
    if (root === key) continue;
    index.identityByManufacturerId.set(manufacturerId, root);
  }
  const mergedNames = new Map<string, string>();
  const hintNameByRoot = new Map<string, string>();
  for (const [identity, name] of hintNameByIdentity) {
    const root = find(identity);
    if (!hintNameByRoot.has(root)) hintNameByRoot.set(root, name);
  }
  for (const [key, name] of index.nameByIdentity) {
    const root = find(key);
    const preferred = hintNameByRoot.get(root);
    if (preferred) {
      mergedNames.set(root, preferred);
      continue;
    }
    const existing = mergedNames.get(root);
    if (!existing || name.localeCompare(existing) < 0) {
      mergedNames.set(root, name);
    }
  }
  index.nameByIdentity = mergedNames;
  index.identityByTerm = new Map(
    Array.from(index.identityByTerm, ([term, key]) => [term, find(key)]),
  );

  // A merged identity must not be reported as merged when its root is alone.
  for (const identity of index.aliasMergedIdentities) {
    if (!mergedNames.has(identity))
      index.aliasMergedIdentities.delete(identity);
  }

  return index;
}

/**
 * Canonical identity key for a component's manufacturer reference, or null when
 * the component has no manufacturer. An id that is not present in the index
 * still receives a distinct key, so two unknown ids can never be treated as the
 * same manufacturer.
 */
export function resolveManufacturerIdentity(
  manufacturerId: string | null | undefined,
  index: ManufacturerIdentityIndex,
): string | null {
  if (!manufacturerId) return null;
  return (
    index.identityByManufacturerId.get(manufacturerId) ?? `id:${manufacturerId}`
  );
}

export function manufacturerIdentityName(
  identity: string | null,
  index: ManufacturerIdentityIndex,
): string | null {
  if (!identity) return null;
  return index.nameByIdentity.get(identity) ?? null;
}

export type ManufacturerIdentityRelation =
  'SAME' | 'CONFLICT' | 'INDETERMINATE';

/**
 * Compares two manufacturer references.
 *
 * `INDETERMINATE` means at least one side has no resolved manufacturer, which
 * is *not* evidence of a conflict — the deterministic rules never turn missing
 * data into a difference.
 */
export function compareManufacturerIdentity(
  firstId: string | null | undefined,
  secondId: string | null | undefined,
  index: ManufacturerIdentityIndex,
): ManufacturerIdentityRelation {
  const first = resolveManufacturerIdentity(firstId, index);
  const second = resolveManufacturerIdentity(secondId, index);
  if (!first || !second) return 'INDETERMINATE';
  return first === second ? 'SAME' : 'CONFLICT';
}

// ---------------------------------------------------------------------------
// Name identity terms
// ---------------------------------------------------------------------------

/**
 * Descriptor words that carry no identity on their own. Kept deliberately
 * small: category names/codes, package patterns and engineering units already
 * supply the bulk of the generic vocabulary from the existing data model.
 */
export const GENERIC_NAME_TOKENS: readonly string[] = [
  'and',
  'with',
  'for',
  'the',
  'type',
  'series',
  'generic',
  'standard',
  'general',
  'purpose',
  'high',
  'low',
  'new',
  'smd',
  'smt',
  'tht',
  'chip',
  'surface',
  'mount',
  'mounting',
  'through',
  'hole',
  'axial',
  'radial',
  'ceramic',
  'electrolytic',
  'tantalum',
  'film',
  'thick',
  'thin',
  'metal',
  'carbon',
  'precision',
  'power',
  'resistor',
  'resistors',
  'capacitor',
  'capacitors',
  'inductor',
  'inductors',
  'connector',
  'connectors',
  'diode',
  'diodes',
  'transistor',
  'transistors',
  'component',
  'components',
  'electronic',
  'electronics',
  'part',
  'parts',
  'device',
  'devices',
  'ic',
  'ics',
];

/** `resistors` -> `resistor`; short tokens are returned unchanged. */
export function singularizeToken(token: string): string {
  return token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token;
}

/** Splits free text into lowercase alphanumeric tokens. */
export function tokenizeName(value?: string | null): string[] {
  return (value ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

/**
 * Spells out the unit symbols that would otherwise be lost when text is
 * tokenized, so `27Ω` stays a single meaningful token instead of splitting into
 * a bare number.
 */
export function spellOutUnitSymbols(value: string): string {
  return value.replace(/[Ωω]/g, 'ohm').replace(/[µμ]/g, 'u');
}

/**
 * Tokens used for identity-name analysis. Differs from {@link tokenizeName} by
 * spelling out unit symbols first, so a technical value such as `27Ω` remains
 * one token and is never mistaken for a bare number.
 */
export function tokenizeIdentityName(value?: string | null): string[] {
  return tokenizeName(spellOutUnitSymbols(value ?? ''));
}

export interface GenericNameTermOptions {
  /** Category names and codes from the existing taxonomy. */
  categoryTerms?: Iterable<string>;
  /** Package/footprint patterns from the existing intelligence hints. */
  packagePatterns?: readonly string[];
}

/**
 * Builds the vocabulary of non-identity name tokens from the existing data
 * model: category taxonomy, package patterns, engineering units, plus a short
 * descriptor list. A name made only of these tokens is not identity-bearing.
 */
export function buildGenericNameTerms(
  options: GenericNameTermOptions = {},
): Set<string> {
  const terms = new Set<string>();
  const add = (raw: string | null | undefined) => {
    for (const token of tokenizeIdentityName(raw)) {
      terms.add(token);
      terms.add(singularizeToken(token));
    }
  };

  for (const token of GENERIC_NAME_TOKENS) {
    terms.add(token);
    terms.add(singularizeToken(token));
  }
  for (const unit of MEASUREMENT_UNITS) {
    add(unit);
  }
  for (const term of options.categoryTerms ?? []) {
    add(term);
  }
  for (const pattern of options.packagePatterns ?? []) {
    add(pattern);
  }

  return terms;
}

/**
 * True when a component name carries identity of its own.
 *
 * A name qualifies when it contains at least one token that is not a generic
 * descriptor, not a category/package term and not a bare unit. So `Resistor`,
 * `Capacitor` and `SMD Connector` never qualify, while `10KΩ SMD Resistor 0805`
 * and `LM358DR` do: a technical value or a part-like identifier is identity
 * information, a category word or a footprint code is not.
 */
export function isIdentityBearingName(
  name: string | null | undefined,
  options: { genericTerms: Set<string>; packagePatterns?: readonly string[] },
): boolean {
  const packagePatterns = options.packagePatterns ?? [];
  for (const token of tokenizeIdentityName(name)) {
    // A bare number carries no identity on its own (`Resistor 0805`).
    if (!/[a-z]/.test(token)) continue;
    if (options.genericTerms.has(token)) continue;
    if (options.genericTerms.has(singularizeToken(token))) continue;
    const normalized = normalizeMpn(token);
    if (!normalized) continue;
    if (isPackageCode(normalized, packagePatterns)) continue;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Physical-value guards
// ---------------------------------------------------------------------------

/**
 * Attribute data types whose values are structured enough to guard identity.
 *
 * Derived from the existing attribute model rather than a hard-coded attribute
 * list: every QUANTITY / NUMBER / INTEGER / SELECT / BOOLEAN value is
 * identity-bearing, while free text, dates and multi-selects are not reliable
 * identity data. `mfr_part_number` is TEXT and is therefore excluded — the
 * `components.manufacturer_part_number` column is the authority for MPNs.
 */
export const IDENTITY_ATTRIBUTE_DATA_TYPES: readonly string[] = [
  'QUANTITY',
  'NUMBER',
  'INTEGER',
  'BOOLEAN',
  'SELECT',
];

export function isIdentityBearingAttribute(dataType: string): boolean {
  return IDENTITY_ATTRIBUTE_DATA_TYPES.includes(dataType);
}

/** Canonical comparison value for one attribute on one component. */
export interface IdentityAttributeValue {
  code: string;
  label: string;
  dataType: string;
  /** The attribute definition this value belongs to. */
  attributeDefinitionId: string;
  /** Canonical comparison value, or null when the value is not comparable. */
  comparable: string | null;
  /** Human-readable value used in evidence text. */
  display: string;
}

export type ComponentIdentityAttributes = Map<string, IdentityAttributeValue>;

export interface ComponentAttributeValueRow {
  componentId: string;
  attributeDefinitionId: string;
  code: string;
  label: string;
  dataType: string;
  numberValue: string | null;
  normalizedNumberValue: string | null;
  booleanValue: boolean | null;
  optionId: string | null;
  unit: string | null;
  /** Present when the reader needs free-text values (consolidation). */
  textValue?: string | null;
}

export interface AttributeOptionRef {
  id: string;
  code: string;
  label: string;
}

function canonicalNumber(value: string | null): string | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : null;
}

/**
 * Indexes structured attribute values by component for identity comparison.
 *
 * QUANTITY values compare on the persisted base-unit value
 * (`normalized_number_value`); when it is absent the value is treated as *not
 * comparable* rather than compared in an unknown unit.
 */
export function buildIdentityAttributeIndex(
  rows: readonly ComponentAttributeValueRow[],
  options: ReadonlyMap<string, AttributeOptionRef> = new Map(),
): Map<string, ComponentIdentityAttributes> {
  const byComponentId = new Map<string, ComponentIdentityAttributes>();

  for (const row of rows) {
    if (!isIdentityBearingAttribute(row.dataType)) continue;

    let comparable: string | null = null;
    let display = '';

    switch (row.dataType) {
      case 'QUANTITY': {
        comparable = canonicalNumber(row.normalizedNumberValue);
        const amount = row.numberValue ?? row.normalizedNumberValue;
        display = amount
          ? `${canonicalNumber(amount) ?? amount}${row.unit ? ` ${row.unit}` : ''}`
          : '';
        break;
      }
      case 'NUMBER':
      case 'INTEGER': {
        comparable = canonicalNumber(row.numberValue);
        display = comparable ?? '';
        break;
      }
      case 'BOOLEAN': {
        comparable =
          row.booleanValue === null ? null : String(row.booleanValue);
        display =
          row.booleanValue === null ? '' : row.booleanValue ? 'Yes' : 'No';
        break;
      }
      case 'SELECT': {
        const option = row.optionId ? options.get(row.optionId) : undefined;
        comparable = option
          ? normalizeName(option.code) || null
          : (row.optionId ?? null);
        display = option?.label ?? option?.code ?? '';
        break;
      }
      default:
        continue;
    }

    const bucket =
      byComponentId.get(row.componentId) ??
      new Map<string, IdentityAttributeValue>();
    bucket.set(row.code, {
      code: row.code,
      label: row.label,
      dataType: row.dataType,
      attributeDefinitionId: row.attributeDefinitionId,
      comparable,
      display,
    });
    byComponentId.set(row.componentId, bucket);
  }

  return byComponentId;
}

export interface IdentityAttributeConflict {
  code: string;
  label: string;
  first: string;
  second: string;
}

/**
 * Reports structured attributes that both records record differently.
 *
 * Only attributes present on *both* records with comparable values can
 * conflict; a missing value is never treated as a difference. This is the
 * physical-value guard that keeps `10 kΩ` from matching `100 kΩ`.
 */
export function findIdentityAttributeConflicts(
  first: ComponentIdentityAttributes | undefined,
  second: ComponentIdentityAttributes | undefined,
): IdentityAttributeConflict[] {
  if (!first || !second) return [];
  const conflicts: IdentityAttributeConflict[] = [];

  for (const [code, left] of first) {
    const right = second.get(code);
    if (!right) continue;
    if (left.comparable === null || right.comparable === null) continue;
    if (left.comparable === right.comparable) continue;
    conflicts.push({
      code,
      label: left.label || code,
      first: left.display || left.comparable,
      second: right.display || right.comparable,
    });
  }

  return conflicts.sort((a, b) => a.code.localeCompare(b.code));
}

/** Structured attributes both records record identically. */
export function collectMatchingIdentityAttributes(
  first: ComponentIdentityAttributes | undefined,
  second: ComponentIdentityAttributes | undefined,
): IdentityAttributeValue[] {
  if (!first || !second) return [];
  const matches: IdentityAttributeValue[] = [];

  for (const [code, left] of first) {
    const right = second.get(code);
    if (!right) continue;
    if (left.comparable === null || right.comparable === null) continue;
    if (left.comparable !== right.comparable) continue;
    matches.push(left);
  }

  return matches.sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * One structured attribute recorded on both sides of a duplicate pair.
 *
 * This is the review-facing comparison the duplicate detail renders: it answers
 * "what is identical and what differs" for the specifications the analyzer
 * actually used, without re-deriving anything at read time.
 */
export interface DuplicateAttributeComparisonEntry {
  code: string;
  label: string;
  /** Value recorded on the analyzed (newer) component. */
  current: string;
  /** Value recorded on the related (canonical) component. */
  related: string;
  result: 'MATCH' | 'DIFFERENT';
}

/**
 * Builds the structured attribute comparison for a duplicate pair.
 *
 * Only attributes recorded on *both* records with comparable values appear: a
 * missing value is not a difference, so it must not be presented as one. The
 * result is sorted by attribute code, so the comparison is deterministic.
 */
export function buildAttributeComparison(
  memberAttributes: ComponentIdentityAttributes | undefined,
  canonicalAttributes: ComponentIdentityAttributes | undefined,
): DuplicateAttributeComparisonEntry[] {
  if (!memberAttributes || !canonicalAttributes) return [];

  const entries: DuplicateAttributeComparisonEntry[] = [];
  for (const [code, member] of memberAttributes) {
    const canonical = canonicalAttributes.get(code);
    if (!canonical) continue;
    if (member.comparable === null || canonical.comparable === null) continue;

    entries.push({
      code,
      label: member.label || canonical.label || code,
      current: member.display || member.comparable,
      related: canonical.display || canonical.comparable,
      result:
        member.comparable === canonical.comparable ? 'MATCH' : 'DIFFERENT',
    });
  }

  return entries.sort((left, right) => left.code.localeCompare(right.code));
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** Deterministic duplicate rules, strongest first. */
export type DuplicateMatchType =
  | 'EXACT_MPN'
  | 'PACKAGING_VARIANT'
  | 'MPN_MANUFACTURER_CONFLICT'
  | 'NAME_ATTRIBUTE_IDENTITY'
  | 'SEMANTIC_NAME_SIMILARITY';

const DUPLICATE_RULE_PRIORITY: Record<DuplicateMatchType, number> = {
  EXACT_MPN: 0,
  MPN_MANUFACTURER_CONFLICT: 1,
  PACKAGING_VARIANT: 2,
  NAME_ATTRIBUTE_IDENTITY: 3,
  SEMANTIC_NAME_SIMILARITY: 4,
};

export interface DetectDuplicateFindingsInput {
  catalog: CatalogMpnEntry[];
  scopeComponentIds: Set<string>;
  includeInactive: boolean;
  intelligenceVersion: string;
  /**
   * Manufacturer identity model. Optional: without it every manufacturer id is
   * its own identity, which is exactly the pre-Pass-5A behaviour (no aliases).
   */
  manufacturerIdentity?: ManufacturerIdentityIndex;
  /** Category hierarchy, required to enable the name-identity tier. */
  categoryById?: Map<string, ComponentCategoryRef>;
  /** Structured attribute values per component id. */
  identityAttributesByComponentId?: Map<string, ComponentIdentityAttributes>;
  /** Generic name vocabulary; without it the name-identity tier stays off. */
  genericTerms?: Set<string>;
  packagePatterns?: readonly string[];
  /**
   * Bounded blocking-derived pairs for the Pass 5B semantic tier. Retrieval
   * happens outside this function (indexed database queries); this module only
   * scores the pairs it is given, so the semantic layer can never degrade into an
   * N x N catalog comparison.
   */
  semanticCandidatePairs?: SemanticCandidatePair[];
}

interface DuplicatePairCandidate {
  /** Canonical pair key: the two component ids in sorted order. */
  pairKey: string;
  /** Rule priority; the lowest priority wins when tiers overlap. */
  priority: number;
  /** Deterministic ordering key (group key). */
  groupKey: string;
  matchType: DuplicateMatchType;
  /** Catalog entries behind the pair, so the semantic tier can score them too. */
  member: CatalogMpnEntry;
  canonical: CatalogMpnEntry;
  finding: PersistComponentFindingInput;
}

interface DetectionContext {
  scopeComponentIds: Set<string>;
  includeInactive: boolean;
  intelligenceVersion: string;
  manufacturerIdentity: ManufacturerIdentityIndex;
  categoryById?: Map<string, ComponentCategoryRef>;
  identityAttributesByComponentId?: Map<string, ComponentIdentityAttributes>;
  genericTerms?: Set<string>;
  packagePatterns: readonly string[];
}

/** How two categories relate for duplicate purposes. */
export type CategoryRelation = 'SAME' | 'RELATED' | 'INCOMPATIBLE' | 'UNKNOWN';

/**
 * Compares two categories using the existing hierarchy model. Missing
 * classifications yield `UNKNOWN` (missing evidence, never a conflict), and
 * unrelated categories yield `INCOMPATIBLE`, which suppresses semantic
 * candidates outright.
 */
export function compareCategoryRelation(
  firstId: string | null | undefined,
  secondId: string | null | undefined,
  categoryById?: Map<string, ComponentCategoryRef>,
): CategoryRelation {
  if (!firstId || !secondId) return 'UNKNOWN';
  if (firstId === secondId) return 'SAME';
  if (!categoryById || categoryById.size === 0) return 'UNKNOWN';
  if (!categoryById.has(firstId) || !categoryById.has(secondId)) {
    return 'UNKNOWN';
  }
  return areCategoriesRelated(firstId, secondId, categoryById)
    ? 'RELATED'
    : 'INCOMPATIBLE';
}

/**
 * Detects duplicate findings across the authoritative catalog.
 *
 * Candidate retrieval happens before this function (indexed/grouped database
 * queries); everything here is pure comparison of the retrieved candidates.
 *
 * Guarantees:
 *  - a component is never reported as a duplicate of itself,
 *  - a pair is reported exactly once, in a canonical direction (oldest record
 *    is the canonical record, ties broken by id),
 *  - a group of N duplicates produces N-1 star findings (B -> A, C -> A),
 *  - the strongest matching rule wins when several tiers match the same pair,
 *    and the other matching rules are recorded as supporting match types,
 *  - output order is deterministic, so a capped audit is stable across runs.
 *
 * This wrapper keeps the Pass 5A signature and behaviour. Callers that also want
 * semantic instrumentation should use {@link runDuplicateDetection}.
 */
export function detectDuplicateFindings(
  input: DetectDuplicateFindingsInput,
): PersistComponentFindingInput[] {
  return runDuplicateDetection(input).findings;
}

/** Instrumentation for the semantic layer (never used for scoring decisions). */
export interface SemanticDetectionStats {
  /** Pairs handed to the semantic scorer. */
  candidatesConsidered: number;
  /** Pairs rejected by a guard or by the score threshold. */
  candidatesRejected: number;
  /** Pairs the scorer accepted (including support-only matches). */
  candidatesAccepted: number;
  /** Semantic-only findings produced before the per-audit cap. */
  findingsProduced: number;
  /** Semantic findings dropped by {@link MAX_SEMANTIC_FINDINGS_PER_AUDIT}. */
  findingsTruncated: number;
  /** True when the per-audit semantic finding cap was reached. */
  truncated: boolean;
  /** Rejection counts per canonical reason code. */
  rejectionReasons: Partial<Record<SemanticRejectionReason, number>>;
}

export interface DuplicateDetectionOutcome {
  findings: PersistComponentFindingInput[];
  semantic: SemanticDetectionStats;
}

/**
 * Full duplicate detection: deterministic tiers plus the bounded semantic tier.
 *
 * Returns findings in deterministic order along with semantic instrumentation.
 */
export function runDuplicateDetection(
  input: DetectDuplicateFindingsInput,
): DuplicateDetectionOutcome {
  const context: DetectionContext = {
    scopeComponentIds: input.scopeComponentIds,
    includeInactive: input.includeInactive,
    intelligenceVersion: input.intelligenceVersion,
    manufacturerIdentity:
      input.manufacturerIdentity ?? createEmptyManufacturerIdentityIndex(),
    categoryById: input.categoryById,
    identityAttributesByComponentId: input.identityAttributesByComponentId,
    genericTerms: input.genericTerms,
    packagePatterns: input.packagePatterns ?? [],
  };

  const candidates: DuplicatePairCandidate[] = [
    ...detectMpnDuplicates(input.catalog, context),
    ...detectNameIdentityDuplicates(input.catalog, context),
  ];

  const semantic = scoreSemanticPairs(
    input.semanticCandidatePairs ?? [],
    candidates,
    context,
  );
  candidates.push(...semantic.candidates);

  // Pair deduplication: one finding per pair, strongest rule first. Every rule
  // that matched the pair is recorded so a reviewer sees all supporting signals.
  const bestByPair = new Map<
    string,
    { candidate: DuplicatePairCandidate; matchTypes: Set<DuplicateMatchType> }
  >();
  for (const candidate of candidates) {
    const existing = bestByPair.get(candidate.pairKey);
    if (!existing) {
      bestByPair.set(candidate.pairKey, {
        candidate,
        matchTypes: new Set([candidate.matchType]),
      });
      continue;
    }
    existing.matchTypes.add(candidate.matchType);
    if (candidate.priority < existing.candidate.priority) {
      existing.candidate = candidate;
    }
  }

  // A pair already matched deterministically produces no second finding, but the
  // semantic agreement is still recorded as supporting evidence for it.
  for (const pairKey of semantic.acceptedPairKeys) {
    bestByPair.get(pairKey)?.matchTypes.add('SEMANTIC_NAME_SIMILARITY');
  }

  const findings = Array.from(bestByPair.values())
    .sort(
      (left, right) =>
        left.candidate.priority - right.candidate.priority ||
        left.candidate.groupKey.localeCompare(right.candidate.groupKey) ||
        left.candidate.finding.componentId.localeCompare(
          right.candidate.finding.componentId,
        ),
    )
    .map(({ candidate, matchTypes }) =>
      applyMatchTypeSummary(candidate, matchTypes),
    );

  return { findings, semantic: semantic.stats };
}

/**
 * Records the primary and supporting rules on a finding.
 *
 * The primary rule is the strongest rule that matched; the rest are supporting
 * evidence. Both are exposed in `suggestedValue` (for the review UI) and in
 * `metadata` (for audits), and both are deterministic.
 */
function applyMatchTypeSummary(
  candidate: DuplicatePairCandidate,
  matchTypes: Set<DuplicateMatchType>,
): PersistComponentFindingInput {
  const supporting = [...matchTypes]
    .filter((matchType) => matchType !== candidate.matchType)
    .sort(
      (left, right) =>
        DUPLICATE_RULE_PRIORITY[left] - DUPLICATE_RULE_PRIORITY[right],
    );

  if (supporting.length === 0) return candidate.finding;

  return {
    ...candidate.finding,
    suggestedValue: {
      ...(candidate.finding.suggestedValue ?? {}),
      primaryMatchType: candidate.matchType,
      supportingMatchTypes: supporting,
    },
    metadata: {
      ...(candidate.finding.metadata ?? {}),
      primaryMatchType: candidate.matchType,
      supportingMatchTypes: supporting,
    },
  };
}

interface SemanticPairScoringResult {
  candidates: DuplicatePairCandidate[];
  stats: SemanticDetectionStats;
  /** Pair keys the scorer accepted, including deterministic pairs. */
  acceptedPairKeys: Set<string>;
}

/**
 * Scores the bounded set of blocking-derived pairs.
 *
 * Pairs that a deterministic rule already matched are scored as well, purely so
 * their supporting match types can be recorded; they never produce a second
 * finding. Accepted semantic-only pairs become POTENTIAL_DUPLICATE findings,
 * capped deterministically per audit.
 */
function scoreSemanticPairs(
  pairs: SemanticCandidatePair[],
  deterministic: DuplicatePairCandidate[],
  context: DetectionContext,
): SemanticPairScoringResult {
  const rejectionReasons: Partial<Record<SemanticRejectionReason, number>> = {};
  const stats: SemanticDetectionStats = {
    candidatesConsidered: 0,
    candidatesRejected: 0,
    candidatesAccepted: 0,
    findingsProduced: 0,
    findingsTruncated: 0,
    truncated: false,
    rejectionReasons,
  };

  if (pairs.length === 0 && deterministic.length === 0) {
    return { candidates: [], stats, acceptedPairKeys: new Set<string>() };
  }

  const deterministicPairKeys = new Set(
    deterministic.map((candidate) => candidate.pairKey),
  );
  const vocabulary: SemanticTokenVocabulary = {
    genericTerms: context.genericTerms ?? new Set<string>(),
    packagePatterns: context.packagePatterns,
  };
  const profileCache = new Map<string, SemanticNameProfile>();
  const profileOf = (entry: CatalogMpnEntry): SemanticNameProfile => {
    const cached = profileCache.get(entry.id);
    if (cached) return cached;
    const profile = buildSemanticNameProfile(entry.name, vocabulary);
    profileCache.set(entry.id, profile);
    return profile;
  };

  // Pairs to score: the blocking candidates plus the deterministic pairs (the
  // latter only contribute supporting match types).
  const scoringPairs: Array<{
    member: CatalogMpnEntry;
    canonical: CatalogMpnEntry;
    groupKey: string;
    pairKey: string;
  }> = [];
  const seenPairKeys = new Set<string>();

  for (const candidate of deterministic) {
    seenPairKeys.add(candidate.pairKey);
    scoringPairs.push({
      member: candidate.member,
      canonical: candidate.canonical,
      groupKey: candidate.groupKey,
      pairKey: candidate.pairKey,
    });
  }
  for (const pair of pairs) {
    const pairKey = pairKeyOf(pair.member.id, pair.canonical.id);
    if (seenPairKeys.has(pairKey)) continue;
    seenPairKeys.add(pairKey);
    scoringPairs.push({
      member: pair.member,
      canonical: pair.canonical,
      groupKey: pair.sharedBlockingTokens.join('|'),
      pairKey,
    });
  }

  const accepted: DuplicatePairCandidate[] = [];
  const acceptedPairKeys = new Set<string>();

  for (const pair of scoringPairs) {
    const { member, canonical } = pair;
    stats.candidatesConsidered += 1;

    const result = scoreSemanticCandidate({
      memberName: member.name,
      canonicalName: canonical.name,
      manufacturerRelation: compareManufacturerIdentity(
        member.manufacturerId,
        canonical.manufacturerId,
        context.manufacturerIdentity,
      ),
      memberManufacturerName: manufacturerIdentityName(
        resolveManufacturerIdentity(
          member.manufacturerId,
          context.manufacturerIdentity,
        ),
        context.manufacturerIdentity,
      ),
      canonicalManufacturerName: manufacturerIdentityName(
        resolveManufacturerIdentity(
          canonical.manufacturerId,
          context.manufacturerIdentity,
        ),
        context.manufacturerIdentity,
      ),
      categoryRelation: compareCategoryRelation(
        member.categoryId,
        canonical.categoryId,
        context.categoryById,
      ),
      memberCategoryName: member.categoryId
        ? (context.categoryById?.get(member.categoryId)?.name ?? null)
        : null,
      canonicalCategoryName: canonical.categoryId
        ? (context.categoryById?.get(canonical.categoryId)?.name ?? null)
        : null,
      memberProfile: profileOf(member),
      canonicalProfile: profileOf(canonical),
      memberAttributes: context.identityAttributesByComponentId?.get(member.id),
      canonicalAttributes: context.identityAttributesByComponentId?.get(
        canonical.id,
      ),
      memberMpn: normalizeMpn(member.manufacturerPartNumber),
      canonicalMpn: normalizeMpn(canonical.manufacturerPartNumber),
      matchingAttributes: collectMatchingIdentityAttributes(
        context.identityAttributesByComponentId?.get(member.id),
        context.identityAttributesByComponentId?.get(canonical.id),
      ).map((attribute) => ({
        code: attribute.code,
        label: attribute.label,
        display: attribute.display || (attribute.comparable ?? ''),
      })),
    });

    if (!result.accepted) {
      stats.candidatesRejected += 1;
      const reason = result.rejectionReason ?? 'BELOW_THRESHOLD';
      rejectionReasons[reason] = (rejectionReasons[reason] ?? 0) + 1;
      continue;
    }

    stats.candidatesAccepted += 1;
    acceptedPairKeys.add(pair.pairKey);

    // Deterministic pairs already have a finding; they only gain a supporting
    // match type, so no second finding is created for the same pair.
    if (deterministicPairKeys.has(pair.pairKey)) continue;

    accepted.push({
      pairKey: pair.pairKey,
      priority: DUPLICATE_RULE_PRIORITY.SEMANTIC_NAME_SIMILARITY,
      groupKey: pair.groupKey,
      matchType: 'SEMANTIC_NAME_SIMILARITY',
      member,
      canonical,
      finding: buildSemanticDuplicateFinding({
        member,
        canonical,
        score: result,
        context,
      }),
    });
  }

  accepted.sort(
    (left, right) =>
      left.groupKey.localeCompare(right.groupKey) ||
      left.finding.componentId.localeCompare(right.finding.componentId) ||
      (left.finding.relatedComponentId ?? '').localeCompare(
        right.finding.relatedComponentId ?? '',
      ),
  );

  stats.findingsProduced = accepted.length;
  const capped = accepted.slice(0, MAX_SEMANTIC_FINDINGS_PER_AUDIT);
  stats.findingsTruncated = accepted.length - capped.length;
  stats.truncated = stats.findingsTruncated > 0;

  return { candidates: capped, stats, acceptedPairKeys };
}

/** Deterministic ranking for a component's blocking candidates. */
function compareSemanticPartnerRank(
  left: SemanticCandidatePair,
  right: SemanticCandidatePair,
): number {
  const sharedDelta =
    right.sharedBlockingTokens.length - left.sharedBlockingTokens.length;
  if (sharedDelta !== 0) return sharedDelta;
  const order = compareCatalogOrder(left.canonical, right.canonical);
  if (order !== 0) return order;
  return left.member.id.localeCompare(right.member.id);
}

/** One blocking-derived pair, already oriented canonically. */
export interface SemanticCandidatePair {
  /** The newer record; the finding is attached to this component. */
  member: CatalogMpnEntry;
  /** The older record; the canonical duplicate target. */
  canonical: CatalogMpnEntry;
  /** Blocking tokens the two records share (deterministic, sorted). */
  sharedBlockingTokens: string[];
}

export interface BuildSemanticCandidatePairsInput {
  /** Rows retrieved by the blocking query (plus the in-scope components). */
  rows: CatalogMpnEntry[];
  /** Component ids in the audit scope; only pairs touching them are returned. */
  scopeComponentIds: Set<string>;
  includeInactive: boolean;
  vocabulary: SemanticTokenVocabulary;
  /** Retrieval fan-out per blocking token; over-common tokens are dropped. */
  tokenFanout?: ReadonlyMap<string, number>;
  maxCandidatesPerComponent?: number;
}

export interface SemanticBlockingStats {
  /** Distinct blocking tokens used by the in-scope components. */
  blockingTokensUsed: number;
  /**
   * Tokens above the fan-out threshold. They are reported for observability and
   * used to rank partners; they are never dropped, because dropping a common
   * block would lose recall on a large catalog.
   */
  nonSelectiveTokens: string[];
  /** Components whose ranked candidate list was truncated by the cap. */
  cappedComponents: number;
  /** Pairs produced after ranking and capping. */
  pairs: number;
}

/**
 * Builds the bounded semantic candidate pairs from blocking-retrieved rows.
 *
 * Bounding happens in three independent layers:
 *  1. the caller retrieves rows by blocking key only (never the whole catalog),
 *  2. partners are ranked so that selective blocks win the available slots,
 *  3. each component keeps only its top {@link MAX_SEMANTIC_CANDIDATES_PER_COMPONENT}
 *     partners in deterministic rank order.
 *
 * Pairs are canonically oriented (older record is the canonical target) and
 * deduplicated, so a pair can never be scored twice or reported in both
 * directions.
 */
export function buildSemanticCandidatePairs(
  input: BuildSemanticCandidatePairsInput,
): { pairs: SemanticCandidatePair[]; stats: SemanticBlockingStats } {
  const maxPerComponent =
    input.maxCandidatesPerComponent ?? MAX_SEMANTIC_CANDIDATES_PER_COMPONENT;
  const maxFanout = MAX_SEMANTIC_TOKEN_FANOUT;

  const byId = new Map(input.rows.map((row) => [row.id, row]));
  const scopedRows = [...input.scopeComponentIds]
    .map((id) => byId.get(id))
    .filter((row): row is CatalogMpnEntry => Boolean(row));

  const tokensByComponentId = new Map<string, string[]>();
  for (const row of input.rows) {
    tokensByComponentId.set(
      row.id,
      semanticBlockingTokens(row.name, input.vocabulary),
    );
  }

  // Rows per token, used only to classify blocks as selective/non-selective.
  const rowsPerToken = new Map<string, number>();
  if (input.tokenFanout) {
    for (const [token, count] of input.tokenFanout) {
      rowsPerToken.set(token, count);
    }
  } else {
    for (const tokens of tokensByComponentId.values()) {
      for (const token of tokens) {
        rowsPerToken.set(token, (rowsPerToken.get(token) ?? 0) + 1);
      }
    }
  }

  const blockingTokensUsed = new Set<string>();
  for (const row of scopedRows) {
    for (const token of tokensByComponentId.get(row.id) ?? []) {
      blockingTokensUsed.add(token);
    }
  }

  const nonSelectiveTokens = new Set(
    [...blockingTokensUsed].filter(
      (token) => (rowsPerToken.get(token) ?? 0) > maxFanout,
    ),
  );

  // Token -> rows index. Every token blocks: a component whose only block is
  // common must still be compared, otherwise the semantic layer would silently
  // switch itself off on a large catalog.
  const rowsByToken = new Map<string, CatalogMpnEntry[]>();
  for (const row of input.rows) {
    for (const token of tokensByComponentId.get(row.id) ?? []) {
      const bucket = rowsByToken.get(token);
      if (bucket) {
        bucket.push(row);
      } else {
        rowsByToken.set(token, [row]);
      }
    }
  }

  // Ranking prefers partners reached through at least one selective block, so a
  // common token cannot crowd out a precise one when the cap applies.
  const rankPartners = (
    left: SemanticCandidatePair,
    right: SemanticCandidatePair,
  ): number => {
    const leftSelective = left.sharedBlockingTokens.some(
      (token) => !nonSelectiveTokens.has(token),
    );
    const rightSelective = right.sharedBlockingTokens.some(
      (token) => !nonSelectiveTokens.has(token),
    );
    if (leftSelective !== rightSelective) return leftSelective ? -1 : 1;
    return compareSemanticPartnerRank(left, right);
  };

  const pairKeys = new Set<string>();
  const pairs: SemanticCandidatePair[] = [];
  let cappedComponents = 0;

  const scopedIds = [...input.scopeComponentIds].sort();
  for (const scopedId of scopedIds) {
    const self = byId.get(scopedId);
    if (!self) continue;

    const partners = new Map<
      string,
      { row: CatalogMpnEntry; shared: string[] }
    >();
    for (const token of tokensByComponentId.get(self.id) ?? []) {
      for (const candidate of rowsByToken.get(token) ?? []) {
        if (candidate.id === self.id) continue;
        const bucket = partners.get(candidate.id) ?? {
          row: candidate,
          shared: [],
        };
        if (!bucket.shared.includes(token)) bucket.shared.push(token);
        partners.set(candidate.id, bucket);
      }
    }

    const ranked: SemanticCandidatePair[] = [];
    for (const partner of partners.values()) {
      const [canonical, member] =
        compareCatalogOrder(partner.row, self) <= 0
          ? [partner.row, self]
          : [self, partner.row];
      if (!input.includeInactive && !member.isActive) continue;
      ranked.push({
        member,
        canonical,
        sharedBlockingTokens: [...partner.shared].sort(),
      });
    }

    ranked.sort(rankPartners);
    if (ranked.length > maxPerComponent) cappedComponents += 1;

    for (const pair of ranked.slice(0, maxPerComponent)) {
      const key = pairKeyOf(pair.member.id, pair.canonical.id);
      if (pairKeys.has(key)) continue;
      pairKeys.add(key);
      pairs.push(pair);
    }
  }

  pairs.sort(
    (left, right) =>
      left.member.id.localeCompare(right.member.id) ||
      left.canonical.id.localeCompare(right.canonical.id),
  );

  return {
    pairs,
    stats: {
      blockingTokensUsed: blockingTokensUsed.size,
      nonSelectiveTokens: [...nonSelectiveTokens].sort(),
      cappedComponents,
      pairs: pairs.length,
    },
  };
}

function pairKeyOf(firstId: string, secondId: string): string {
  return firstId < secondId
    ? `${firstId}|${secondId}`
    : `${secondId}|${firstId}`;
}

/** Shared per-pair gate: self-match, inactive, and audit scope. */
function isReviewablePair(
  member: CatalogMpnEntry,
  canonical: CatalogMpnEntry,
  context: DetectionContext,
): boolean {
  if (member.id === canonical.id) return false;
  if (!context.includeInactive && !member.isActive) return false;
  return (
    context.scopeComponentIds.has(member.id) ||
    context.scopeComponentIds.has(canonical.id)
  );
}

/**
 * MPN identity tiers: `EXACT_MPN`, `MPN_MANUFACTURER_CONFLICT` and
 * `PACKAGING_VARIANT`.
 *
 * Grouping is by packaging-stripped normalized MPN, so identical values and
 * explicit packaging/reel variants land in the same group. Manufacturer
 * identity then decides how strong the match is:
 *  - same (or unresolved) manufacturer + identical MPN -> EXACT_DUPLICATE,
 *  - conflicting manufacturers + identical MPN -> POTENTIAL_DUPLICATE, because
 *    an identical MPN under two manufacturer identities is a data conflict, not
 *    an authoritative identity match,
 *  - conflicting manufacturers + packaging-variant MPN -> no finding at all
 *    (too weak to be deterministic).
 */
function detectMpnDuplicates(
  catalog: CatalogMpnEntry[],
  context: DetectionContext,
): DuplicatePairCandidate[] {
  const groups = new Map<string, CatalogMpnEntry[]>();
  for (const entry of catalog) {
    const normalized = normalizeMpn(entry.manufacturerPartNumber);
    if (
      !normalized ||
      normalized.length < MIN_MPN_LENGTH ||
      isPlaceholderMpn(normalized)
    ) {
      continue;
    }
    const base = stripPackagingSuffix(normalized);
    if (base.length < MIN_MPN_LENGTH) continue;
    const bucket = groups.get(base);
    if (bucket) {
      bucket.push(entry);
    } else {
      groups.set(base, [entry]);
    }
  }

  const candidates: DuplicatePairCandidate[] = [];

  for (const [base, members] of groups) {
    if (members.length < 2) continue;

    const sorted = [...members].sort(compareCatalogOrder);
    const canonical = sorted[0];
    if (!canonical) continue;
    const canonicalNormalized = normalizeMpn(canonical.manufacturerPartNumber);
    if (!canonicalNormalized) continue;

    for (const member of sorted.slice(1)) {
      if (!isReviewablePair(member, canonical, context)) continue;

      const memberNormalized = normalizeMpn(member.manufacturerPartNumber);
      if (!memberNormalized) continue;

      const identical = memberNormalized === canonicalNormalized;
      const relation = compareManufacturerIdentity(
        member.manufacturerId,
        canonical.manufacturerId,
        context.manufacturerIdentity,
      );
      if (relation === 'CONFLICT' && !identical) continue;

      const matchType: DuplicateMatchType = identical
        ? relation === 'CONFLICT'
          ? 'MPN_MANUFACTURER_CONFLICT'
          : 'EXACT_MPN'
        : 'PACKAGING_VARIANT';

      candidates.push({
        pairKey: pairKeyOf(member.id, canonical.id),
        priority: DUPLICATE_RULE_PRIORITY[matchType],
        groupKey: base,
        matchType,
        member,
        canonical,
        finding: buildMpnDuplicateFinding({
          member,
          canonical,
          base,
          matchType,
          manufacturerRelation: relation,
          context,
        }),
      });
    }
  }

  return candidates;
}

/**
 * Groups catalog rows by deterministic name identity: resolved manufacturer
 * identity + normalized, identity-bearing component name.
 *
 * Shared by the analyzer (to know which components need their structured
 * attributes loaded) and by {@link detectDuplicateFindings}, so both use exactly
 * the same grouping rule.
 */
export function groupNameIdentityCandidates(
  catalog: CatalogMpnEntry[],
  options: {
    manufacturerIdentity: ManufacturerIdentityIndex;
    genericTerms: Set<string>;
    packagePatterns?: readonly string[];
  },
): Array<{
  key: string;
  identity: string;
  normalizedName: string;
  members: CatalogMpnEntry[];
}> {
  const groups = new Map<
    string,
    {
      key: string;
      identity: string;
      normalizedName: string;
      members: CatalogMpnEntry[];
    }
  >();

  for (const entry of catalog) {
    const identity = resolveManufacturerIdentity(
      entry.manufacturerId,
      options.manufacturerIdentity,
    );
    if (!identity) continue;
    const normalizedName = normalizeComponentName(entry.name);
    if (normalizedName.length < MIN_NAME_IDENTITY_LENGTH) continue;
    if (
      !isIdentityBearingName(entry.name, {
        genericTerms: options.genericTerms,
        packagePatterns: options.packagePatterns,
      })
    ) {
      continue;
    }
    const key = `${identity}|${normalizedName}`;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.members.push(entry);
    } else {
      groups.set(key, { key, identity, normalizedName, members: [entry] });
    }
  }

  return Array.from(groups.values()).sort((left, right) =>
    left.key.localeCompare(right.key),
  );
}

/**
 * Component ids that belong to a name-identity group of two or more members -
 * i.e. the only components whose structured attributes the rules need.
 */
export function collectNameIdentityCandidateIds(
  catalog: CatalogMpnEntry[],
  options: {
    manufacturerIdentity: ManufacturerIdentityIndex;
    genericTerms: Set<string>;
    packagePatterns?: readonly string[];
  },
): string[] {
  const ids: string[] = [];
  for (const group of groupNameIdentityCandidates(catalog, options)) {
    if (group.members.length < 2) continue;
    for (const member of group.members) ids.push(member.id);
  }
  return ids;
}

/**
 * Name + attribute identity tier.
 *
 * Requires every supporting signal to agree: the same *resolved* manufacturer
 * identity, the same identity-bearing normalized name, related categories, and
 * no conflicting structured attribute values. Any weaker combination is not
 * deterministic enough for Pass 5A and produces no finding.
 */
function detectNameIdentityDuplicates(
  catalog: CatalogMpnEntry[],
  context: DetectionContext,
): DuplicatePairCandidate[] {
  const { categoryById, genericTerms } = context;
  if (!categoryById || !genericTerms || categoryById.size === 0) return [];

  const groups = groupNameIdentityCandidates(catalog, {
    manufacturerIdentity: context.manufacturerIdentity,
    genericTerms,
    packagePatterns: context.packagePatterns,
  });

  const candidates: DuplicatePairCandidate[] = [];

  for (const group of groups) {
    const { identity, normalizedName, members } = group;
    if (members.length < 2) continue;

    const sorted = [...members].sort(compareCatalogOrder);
    const canonical = sorted[0];
    if (!canonical) continue;

    for (const member of sorted.slice(1)) {
      if (!isReviewablePair(member, canonical, context)) continue;
      // Category compatibility: both records must be classified and the two
      // categories must be the same node or in an ancestor/descendant relation.
      if (!member.categoryId || !canonical.categoryId) continue;
      if (
        !areCategoriesRelated(
          member.categoryId,
          canonical.categoryId,
          categoryById,
        )
      ) {
        continue;
      }

      const memberAttributes = context.identityAttributesByComponentId?.get(
        member.id,
      );
      const canonicalAttributes = context.identityAttributesByComponentId?.get(
        canonical.id,
      );
      // Physical-value guard: a conflicting structured attribute disproves the
      // identity, so no finding is produced.
      if (
        findIdentityAttributeConflicts(memberAttributes, canonicalAttributes)
          .length > 0
      ) {
        continue;
      }

      candidates.push({
        pairKey: pairKeyOf(member.id, canonical.id),
        priority: DUPLICATE_RULE_PRIORITY.NAME_ATTRIBUTE_IDENTITY,
        groupKey: group.key,
        matchType: 'NAME_ATTRIBUTE_IDENTITY',
        member,
        canonical,
        finding: buildNameIdentityFinding({
          member,
          canonical,
          manufacturerIdentity: identity,
          normalizedName,
          memberAttributes,
          canonicalAttributes,
          context,
        }),
      });
    }
  }

  return candidates;
}

function formatMpn(mpn: string | null): string {
  return mpn?.trim() || '(none)';
}

function baseDuplicateFinding(input: {
  member: CatalogMpnEntry;
  canonical: CatalogMpnEntry;
  issueType: 'EXACT_DUPLICATE' | 'POTENTIAL_DUPLICATE';
  title: string;
  description: string;
  confidence: number;
  confidenceLevel: 'HIGH' | 'MEDIUM';
  suggestedValue: Record<string, unknown>;
  metadata: Record<string, unknown>;
  evidence: Array<Record<string, unknown>>;
  intelligenceVersion: string;
}): PersistComponentFindingInput {
  return {
    componentId: input.member.id,
    relatedComponentId: input.canonical.id,
    issueType: input.issueType,
    issueCategory: 'DUPLICATE',
    field: 'duplicate',
    title: input.title,
    description: input.description,
    currentValue: {
      sku: input.member.sku,
      manufacturerPartNumber: input.member.manufacturerPartNumber,
      manufacturerId: input.member.manufacturerId,
      categoryId: input.member.categoryId,
    },
    suggestedValue: input.suggestedValue,
    confidence: input.confidence,
    confidenceLevel: input.confidenceLevel,
    evidence: input.evidence,
    source: 'analyzer:duplicate',
    intelligenceVersion: input.intelligenceVersion,
    componentUpdatedAt: input.member.updatedAt,
    metadata: input.metadata,
  };
}

function buildMpnDuplicateFinding(input: {
  member: CatalogMpnEntry;
  canonical: CatalogMpnEntry;
  base: string;
  matchType: DuplicateMatchType;
  manufacturerRelation: ManufacturerIdentityRelation;
  context: DetectionContext;
}): PersistComponentFindingInput {
  const { member, canonical, base, matchType, manufacturerRelation, context } =
    input;

  const evidence: Array<Record<string, unknown>> = [
    {
      type: 'mpn_pattern',
      description:
        matchType === 'EXACT_MPN'
          ? `Normalized part number "${base}" is identical to component ${canonical.sku} ("${formatMpn(canonical.manufacturerPartNumber)}")`
          : matchType === 'MPN_MANUFACTURER_CONFLICT'
            ? `Normalized part number "${base}" is identical to component ${canonical.sku} ("${formatMpn(canonical.manufacturerPartNumber)}") but the two records claim different manufacturers`
            : `Normalized part number "${base}" matches component ${canonical.sku} ("${formatMpn(canonical.manufacturerPartNumber)}") after removing the packaging suffix`,
      weight: matchType === 'EXACT_MPN' ? 1 : 0.9,
      source: 'database:components.manufacturer_part_number',
    },
  ];

  if (manufacturerRelation === 'CONFLICT') {
    const memberName = manufacturerIdentityName(
      resolveManufacturerIdentity(
        member.manufacturerId,
        context.manufacturerIdentity,
      ),
      context.manufacturerIdentity,
    );
    const canonicalName = manufacturerIdentityName(
      resolveManufacturerIdentity(
        canonical.manufacturerId,
        context.manufacturerIdentity,
      ),
      context.manufacturerIdentity,
    );
    evidence.push({
      type: 'anomaly',
      description: `The two records reference different manufacturers (${
        memberName ?? member.sku
      } vs ${
        canonicalName ?? canonical.sku
      }); verify which record is authoritative`,
      weight: 0.8,
      source: 'analyzer:duplicate_conflict',
    });
  } else if (manufacturerRelation === 'INDETERMINATE') {
    evidence.push({
      type: 'existing_data',
      description:
        'Manufacturer identity could not be compared because at least one record has no manufacturer assigned',
      weight: 0.5,
      source: 'analyzer:duplicate_manufacturer',
    });
  }

  if (
    member.categoryId &&
    canonical.categoryId &&
    member.categoryId !== canonical.categoryId
  ) {
    evidence.push({
      type: 'anomaly',
      description:
        'The two records are classified under different categories; verify the correct classification',
      weight: 0.75,
      source: 'analyzer:duplicate_conflict',
    });
  }

  const attributeConflicts = findIdentityAttributeConflicts(
    context.identityAttributesByComponentId?.get(member.id),
    context.identityAttributesByComponentId?.get(canonical.id),
  );
  if (attributeConflicts.length > 0) {
    evidence.push({
      type: 'anomaly',
      description: `Structured attributes disagree: ${attributeConflicts
        .map(
          (conflict) =>
            `${conflict.label} (${conflict.first} vs ${conflict.second})`,
        )
        .join(', ')}`,
      weight: 0.8,
      source: 'analyzer:duplicate_conflict',
    });
  }

  const issueType: 'EXACT_DUPLICATE' | 'POTENTIAL_DUPLICATE' =
    matchType === 'EXACT_MPN' ? 'EXACT_DUPLICATE' : 'POTENTIAL_DUPLICATE';

  const confidence =
    matchType === 'EXACT_MPN'
      ? 1
      : matchType === 'PACKAGING_VARIANT'
        ? 0.9
        : 0.8;
  const confidenceLevel: 'HIGH' | 'MEDIUM' =
    matchType === 'EXACT_MPN' || matchType === 'PACKAGING_VARIANT'
      ? 'HIGH'
      : 'MEDIUM';

  const title =
    matchType === 'EXACT_MPN'
      ? `Duplicate manufacturer part number "${formatMpn(member.manufacturerPartNumber)}"`
      : matchType === 'MPN_MANUFACTURER_CONFLICT'
        ? `Manufacturer part number "${formatMpn(member.manufacturerPartNumber)}" is also used by ${canonical.sku} under a different manufacturer`
        : `Manufacturer part number variant of "${formatMpn(canonical.manufacturerPartNumber)}"`;

  const description =
    matchType === 'EXACT_MPN'
      ? `Manufacturer part number is identical to component ${canonical.sku} ("${canonical.name}") after normalization.`
      : matchType === 'MPN_MANUFACTURER_CONFLICT'
        ? `Manufacturer part number "${formatMpn(member.manufacturerPartNumber)}" is identical to component ${canonical.sku} ("${canonical.name}"), but the two records claim different manufacturers.`
        : `Manufacturer part number "${formatMpn(member.manufacturerPartNumber)}" matches component ${canonical.sku} ("${formatMpn(canonical.manufacturerPartNumber)}") once the packaging suffix is removed.`;

  return baseDuplicateFinding({
    member,
    canonical,
    issueType,
    title,
    description,
    confidence,
    confidenceLevel,
    suggestedValue: {
      duplicateOfComponentId: canonical.id,
      duplicateOfSku: canonical.sku,
      duplicateOfManufacturerPartNumber: canonical.manufacturerPartNumber,
      matchType,
      primaryMatchType: matchType,
      normalizedMpn: base,
    },
    metadata: {
      rule: issueType,
      matchType,
      primaryMatchType: matchType,
      canonicalComponentId: canonical.id,
      attributeComparison: buildAttributeComparison(
        context.identityAttributesByComponentId?.get(member.id),
        context.identityAttributesByComponentId?.get(canonical.id),
      ),
    },
    evidence,
    intelligenceVersion: context.intelligenceVersion,
  });
}

function buildNameIdentityFinding(input: {
  member: CatalogMpnEntry;
  canonical: CatalogMpnEntry;
  manufacturerIdentity: string;
  normalizedName: string;
  memberAttributes?: ComponentIdentityAttributes;
  canonicalAttributes?: ComponentIdentityAttributes;
  context: DetectionContext;
}): PersistComponentFindingInput {
  const {
    member,
    canonical,
    manufacturerIdentity,
    normalizedName,
    memberAttributes,
    canonicalAttributes,
    context,
  } = input;

  const identityName =
    manufacturerIdentityName(
      manufacturerIdentity,
      context.manufacturerIdentity,
    ) ?? manufacturerIdentity;
  const aliasResolved =
    context.manufacturerIdentity.aliasMergedIdentities.has(
      manufacturerIdentity,
    );

  const evidence: Array<Record<string, unknown>> = [
    {
      type: 'exact_match',
      description: `Component name "${member.name}" matches "${canonical.name}" after deterministic normalization ("${normalizedName}")`,
      weight: 0.85,
      source: 'analyzer:duplicate_name',
    },
    {
      type: aliasResolved ? 'alias_match' : 'exact_erp_match',
      description: aliasResolved
        ? `Both records resolve to the same manufacturer identity "${identityName}" through the ERP manufacturer alias model`
        : `Both records reference manufacturer "${identityName}"`,
      weight: 0.8,
      source: 'analyzer:duplicate_manufacturer',
    },
  ];

  if (member.categoryId && canonical.categoryId) {
    const category = context.categoryById?.get(member.categoryId);
    evidence.push({
      type: 'hierarchy',
      description:
        member.categoryId === canonical.categoryId
          ? `Both records are classified under "${
              category?.name ?? 'the same category'
            }"`
          : `Both records are classified under compatible categories (${member.categoryId} / ${canonical.categoryId})`,
      weight: 0.7,
      source: 'analyzer:duplicate_category',
    });
  }

  const matchingAttributes = collectMatchingIdentityAttributes(
    memberAttributes,
    canonicalAttributes,
  ).slice(0, 5);
  for (const attribute of matchingAttributes) {
    evidence.push({
      type: 'datasheet_param',
      description: `${attribute.label || attribute.code} matches (${attribute.display || attribute.comparable})`,
      weight: 0.75,
      source: 'analyzer:duplicate_attributes',
    });
  }

  return baseDuplicateFinding({
    member,
    canonical,
    issueType: 'POTENTIAL_DUPLICATE',
    title: `Potential duplicate of ${canonical.sku} ("${canonical.name}")`,
    description: `Component name, manufacturer${
      matchingAttributes.length > 0 ? ' and recorded specifications' : ''
    } match component ${canonical.sku} ("${canonical.name}"), and no recorded attribute contradicts the match.`,
    confidence: 0.8,
    confidenceLevel: 'MEDIUM',
    suggestedValue: {
      duplicateOfComponentId: canonical.id,
      duplicateOfSku: canonical.sku,
      duplicateOfManufacturerPartNumber: canonical.manufacturerPartNumber,
      matchType: 'NAME_ATTRIBUTE_IDENTITY',
      primaryMatchType: 'NAME_ATTRIBUTE_IDENTITY',
      normalizedName,
      manufacturerIdentity,
      ...(matchingAttributes.length > 0
        ? { matchingAttributes: matchingAttributes.map((item) => item.code) }
        : {}),
    },
    metadata: {
      rule: 'POTENTIAL_DUPLICATE',
      matchType: 'NAME_ATTRIBUTE_IDENTITY',
      primaryMatchType: 'NAME_ATTRIBUTE_IDENTITY',
      canonicalComponentId: canonical.id,
      manufacturerIdentity,
      matchingAttributes: matchingAttributes.map((item) => item.code),
      attributeComparison: buildAttributeComparison(
        memberAttributes,
        canonicalAttributes,
      ),
    },
    evidence,
    intelligenceVersion: context.intelligenceVersion,
  });
}

/**
 * Builds the Pass 5B semantic duplicate finding.
 *
 * The finding is always POTENTIAL_DUPLICATE - only the Pass 5A authoritative
 * deterministic rules can produce EXACT_DUPLICATE. Every scoring signal and
 * penalty that was applied is carried as evidence, so the reviewer can see
 * exactly why the pair was surfaced rather than being told "these look similar".
 */
function buildSemanticDuplicateFinding(input: {
  member: CatalogMpnEntry;
  canonical: CatalogMpnEntry;
  score: SemanticScoreResult;
  context: DetectionContext;
}): PersistComponentFindingInput {
  const { member, canonical, score, context } = input;

  const evidence: Array<Record<string, unknown>> = [];
  for (const signal of score.signals) {
    evidence.push({
      type: signal.evidenceType,
      description: `${signal.label}: ${signal.detail} (+${signal.weight.toFixed(2)})`,
      weight: Math.round(signal.weight * 1000) / 1000,
      source: signal.evidenceSource,
    });
  }
  for (const penalty of score.penalties) {
    evidence.push({
      type: penalty.evidenceType,
      description: `${penalty.label}: ${penalty.detail} (${penalty.weight.toFixed(2)})`,
      weight: Math.round(penalty.weight * 1000) / 1000,
      source: penalty.evidenceSource,
    });
  }

  const valueComparison = compareValueTokens(
    buildSemanticNameProfile(member.name, {
      genericTerms: context.genericTerms ?? new Set<string>(),
      packagePatterns: context.packagePatterns,
    }),
    buildSemanticNameProfile(canonical.name, {
      genericTerms: context.genericTerms ?? new Set<string>(),
      packagePatterns: context.packagePatterns,
    }),
  );
  for (const agreement of valueComparison.agreements) {
    evidence.push({
      type: 'datasheet_param',
      description: `${agreement.unit} matches (${agreement.value})`,
      weight: 0.75,
      source: 'analyzer:duplicate_attributes',
    });
  }

  const confidenceLevel = score.confidenceLevel ?? 'MEDIUM';
  const matchedSignals = score.signals.map((signal) => signal.code);
  const penalizedSignals = score.penalties.map((signal) => signal.code);

  return baseDuplicateFinding({
    member,
    canonical,
    issueType: 'POTENTIAL_DUPLICATE',
    title: `Similar to ${canonical.sku} ("${canonical.name}")`,
    description: `Name, manufacturer, category and recorded specifications resemble component ${canonical.sku} ("${canonical.name}") (similarity ${Math.round(
      score.score * 100,
    )}%), but the identity is not deterministic: no shared manufacturer part number was found. Review whether both records describe the same part.`,
    confidence: score.score,
    confidenceLevel,
    suggestedValue: {
      duplicateOfComponentId: canonical.id,
      duplicateOfSku: canonical.sku,
      duplicateOfManufacturerPartNumber: canonical.manufacturerPartNumber,
      matchType: 'SEMANTIC_NAME_SIMILARITY',
      primaryMatchType: 'SEMANTIC_NAME_SIMILARITY',
      similarityScore: score.score,
      nameSimilarity: Math.round(score.nameSimilarity * 1000) / 1000,
      sharedTokens: score.sharedTokens.slice(0, 12),
      matchedSignals,
      penalizedSignals,
    },
    metadata: {
      rule: 'POTENTIAL_DUPLICATE',
      matchType: 'SEMANTIC_NAME_SIMILARITY',
      primaryMatchType: 'SEMANTIC_NAME_SIMILARITY',
      canonicalComponentId: canonical.id,
      similarityScore: score.score,
      nameSimilarity: Math.round(score.nameSimilarity * 1000) / 1000,
      matchedSignals,
      penalizedSignals,
      strongSignalCount: score.strongSignalCount,
      attributeComparison: buildAttributeComparison(
        context.identityAttributesByComponentId?.get(member.id),
        context.identityAttributesByComponentId?.get(canonical.id),
      ),
    },
    evidence,
    intelligenceVersion: context.intelligenceVersion,
  });
}
