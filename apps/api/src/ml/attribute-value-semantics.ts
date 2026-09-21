import { Unit } from '@ananya/inventory';

/**
 * Semantic attribute-value comparison.
 *
 * Pass 3 compared values as display text (`normalizeName('1000 ohm')` vs
 * `normalizeName('1 kohm')` are different strings), which meant an equivalent
 * value re-expressed in a different unit read as a conflict. This module is the
 * single place that decides whether two attribute values describe the same
 * thing.
 *
 * Three deliberate boundaries:
 *
 *  1. **Conversions come from the authoritative unit model.** A unit is a row in
 *     `units` with a `category` and a `conversionFactor`, and the conversion is
 *     performed by the `Unit` aggregate's own `convertToBase`. This module
 *     invents no factors and no symbol table of its own.
 *  2. **Compatible dimensions only.** Two units convert only when they share a
 *     `category`; `mV` and `mm` are never reconciled, and a value whose unit is
 *     unknown or dimensionally incompatible is `INCOMPATIBLE_UNIT` rather than
 *     guessed.
 *  3. **Tolerance is opt-in.** Numbers compare exactly unless the attribute
 *     definition itself declares a tolerance, so `4.7 kΩ` and `4.8 kΩ` stay
 *     different while `1.000 V` and `1 V` are simply equal.
 */

// ---------------------------------------------------------------------------
// Result vocabulary
// ---------------------------------------------------------------------------

/**
 * Outcome of comparing two attribute values.
 *
 *  - EXACT_EQUAL              identical after numeric/option canonicalisation
 *  - UNIT_NORMALIZED_EQUAL    equivalent once converted into a common unit
 *  - WITHIN_TOLERANCE         different, but inside the definition's tolerance
 *  - DIFFERENT                genuinely different values
 *  - INCOMPARABLE             the values cannot be compared at all
 */
export const VALUE_COMPARISON_RESULTS = [
  'EXACT_EQUAL',
  'UNIT_NORMALIZED_EQUAL',
  'WITHIN_TOLERANCE',
  'DIFFERENT',
  'INCOMPARABLE',
] as const;

export type ValueComparisonResult = (typeof VALUE_COMPARISON_RESULTS)[number];

/** Why two values could not be compared. Machine-readable. */
export const VALUE_INCOMPARABLE_REASONS = [
  /** A unit is unknown to the authoritative unit model. */
  'UNKNOWN_UNIT',
  /** Both units exist but describe different dimensions. */
  'INCOMPATIBLE_UNIT',
  /** The unit belongs to a different dimension than the attribute declares. */
  'UNIT_CATEGORY_MISMATCH',
  /** A value is missing, or not representable for its data type. */
  'MISSING_VALUE',
  /** The data type has no defined equality (e.g. free text is not comparable). */
  'UNSUPPORTED_DATA_TYPE',
] as const;

export type ValueIncomparableReason =
  (typeof VALUE_INCOMPARABLE_REASONS)[number];

export interface ValueComparison {
  result: ValueComparisonResult;
  /** Set only for INCOMPARABLE. */
  reason: ValueIncomparableReason | null;
  /** Human-readable explanation, safe to show a reviewer. */
  detail: string | null;
  /**
   * Both values expressed in the definition's unit dimension base unit, when a
   * conversion was possible. `null` when the values are not quantities.
   */
  firstBase: number | null;
  secondBase: number | null;
  /** True when the two values are treated as the same recorded value. */
  equivalent: boolean;
}

// ---------------------------------------------------------------------------
// Unit model access
// ---------------------------------------------------------------------------

/**
 * The unit-model row this module needs.
 *
 * Structural rather than the domain `Unit` class so callers can pass plain rows
 * read from the `units` table, while conversion still runs through the domain
 * aggregate.
 */
export interface UnitRef {
  name: string;
  category: string;
  isBaseUnit: boolean;
  conversionFactor: number | null;
  precision: number;
}

/**
 * Canonical lookup key for a unit string.
 *
 * Extraction and hand entry both produce unit spellings that differ only in
 * case or in a symbol (`KV`, `kV`, `Ω`, `ohm`, `µF`, `uF`). Mapping the symbol
 * to the word and folding case is what lets an extracted `KV` find the
 * authoritative `kV` row; it is not a unit table, it is a spelling normaliser.
 */
export function canonicalUnitKey(unit: string): string {
  return (
    unit
      .trim()
      // Micro sign (U+00B5) and Greek small mu (U+03BC) are both typed as `u`.
      .replace(/[\u00B5\u03BC]/g, 'u')
      // Greek capital omega (U+03A9), the ohm sign (U+2126) and Greek small omega
      // (U+03C9) are the same unit; they are folded before lowercasing, because
      // lowercasing U+03A9 produces U+03C9 and would otherwise slip through.
      .replace(/[\u03A9\u2126\u03C9]/g, 'ohm')
      .replace(/°/g, 'deg')
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/\.$/, '')
  );
}

/** The unit row a unit string denotes, or null when the model has no such row. */
export function findUnit(
  units: readonly UnitRef[],
  unit: string | null | undefined,
): UnitRef | null {
  if (!unit) return null;
  const key = canonicalUnitKey(unit);
  if (!key) return null;
  return units.find((row) => canonicalUnitKey(row.name) === key) ?? null;
}

/**
 * Converts an amount into its unit's base unit.
 *
 * Delegates to the `Unit` aggregate's `convertToBase`, so the arithmetic and the
 * "cannot convert without a factor" rule stay owned by the domain.
 */
export function toBaseUnit(
  unit: UnitRef,
  amount: number,
): { ok: true; value: number } | { ok: false; detail: string } {
  if (!Number.isFinite(amount)) {
    return { ok: false, detail: 'The amount is not a finite number.' };
  }
  try {
    const entity = Unit.rehydrate({
      id: unit.name,
      name: unit.name,
      category: unit.category,
      isBaseUnit: unit.isBaseUnit,
      conversionFactor: unit.conversionFactor,
      precision: unit.precision,
      isActive: true,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    return { ok: true, value: entity.convertToBase(amount) };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Convenience: the amount expressed in the definition's declared unit. */
export function describeUnitCategory(
  unitCategory: string | null | undefined,
): string {
  return unitCategory?.trim() ?? '';
}

// ---------------------------------------------------------------------------
// Value shapes
// ---------------------------------------------------------------------------

/**
 * One side of a comparison.
 *
 * Deliberately the same information a reviewer sees on a row: the amount, the
 * unit it was recorded in, and (for options) the code and label.
 */
export interface ComparableValue {
  /** Amount for QUANTITY / NUMBER / INTEGER. */
  amount?: number | null;
  unit?: string | null;
  /** Option code for SELECT / MULTI_SELECT. */
  optionCode?: string | null;
  /** Option codes for MULTI_SELECT, in recorded order. */
  optionCodes?: readonly string[] | null;
  /** Option label(s), used only as a fallback when no code is known. */
  optionLabels?: readonly string[] | null;
  booleanValue?: boolean | null;
  dateValue?: string | null;
  textValue?: string | null;
}

export interface CompareValueInput {
  /** Authoritative data type of the attribute definition. */
  dataType: string;
  /** The definition's declared dimension, e.g. `Resistance`. */
  unitCategory?: string | null;
  first: ComparableValue;
  second: ComparableValue;
  /** Every unit the authoritative model knows. */
  units: readonly UnitRef[];
  /**
   * Relative tolerance the definition itself declares (e.g. a `±1%` resistor).
   * Absent means exact comparison: nothing is guessed on the domain's behalf.
   */
  relativeTolerance?: number | null;
  /**
   * Absolute tolerance the definition declares, in the attribute's own unit. Also
   * opt-in, and also never inferred from the magnitude of the values.
   */
  absoluteTolerance?: number | null;
}

const EQUAL: Pick<ValueComparison, 'result' | 'reason' | 'equivalent'> = {
  result: 'EXACT_EQUAL',
  reason: null,
  equivalent: true,
};

function incomparable(
  reason: ValueIncomparableReason,
  detail: string,
): ValueComparison {
  return {
    result: 'INCOMPARABLE',
    reason,
    detail,
    firstBase: null,
    secondBase: null,
    equivalent: false,
  };
}

function different(detail: string): ValueComparison {
  return {
    result: 'DIFFERENT',
    reason: null,
    detail,
    firstBase: null,
    secondBase: null,
    equivalent: false,
  };
}

/**
 * Numeric canonicalisation used for the EXACT_EQUAL test.
 *
 * `"1.000"`, `"1"` and `"1e0"` are the same number, so a value that is merely
 * re-formatted is exactly equal — this needs no tolerance and no unit model.
 */
function canonicalAmount(amount: number | null | undefined): string | null {
  if (amount === null || amount === undefined) return null;
  if (!Number.isFinite(amount)) return null;
  return String(Number(amount));
}

/**
 * Reads an explicit comparison tolerance from a definition's validation rules.
 *
 * Attribute-aware by construction: only a tolerance the definition itself
 * declares is honoured, either as a relative fraction/percent (`{ tolerance:
 * 0.01 }`, `{ tolerance: '1%' }`) or as an absolute amount (`{ tolerance:
 * 0.5 }` with `toleranceKind: 'ABSOLUTE'`). Anything unrecognised yields null,
 * so no tolerance is invented.
 */
export function readRelativeTolerance(
  validationRules: Record<string, unknown> | null | undefined,
): number | null {
  if (!validationRules || typeof validationRules !== 'object') return null;
  const raw = validationRules.tolerance;
  if (raw === null || raw === undefined) return null;

  const kind = validationRules.toleranceKind;
  if (typeof kind === 'string' && kind.toUpperCase() === 'ABSOLUTE') {
    return null;
  }

  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  if (typeof raw === 'string') {
    const match = raw.trim().match(/^(\d+(?:\.\d+)?)\s*%$/);
    if (match) {
      const percent = Number(match[1]);
      if (Number.isFinite(percent) && percent > 0) return percent / 100;
    }
    const plain = Number(raw);
    if (Number.isFinite(plain) && plain > 0) return plain;
  }
  return null;
}

/** Reads an absolute tolerance amount from a definition's validation rules. */
export function readAbsoluteTolerance(
  validationRules: Record<string, unknown> | null | undefined,
): number | null {
  if (!validationRules || typeof validationRules !== 'object') return null;
  if (validationRules.toleranceKind !== 'ABSOLUTE') return null;
  const raw = validationRules.tolerance;
  const amount = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

/**
 * Compares two values of one attribute definition.
 *
 * Only the dimensions the authoritative unit model defines are reconciled, and
 * the function never falls back to "close enough": an unsupported comparison is
 * reported as INCOMPARABLE with the reason, so a caller can refuse to act on it
 * rather than treating it as agreement.
 */
export function compareAttributeValues(
  input: CompareValueInput,
): ValueComparison {
  const dataType = input.dataType?.toUpperCase?.() ?? '';

  switch (dataType) {
    case 'QUANTITY':
      return compareQuantity(input);
    case 'NUMBER':
    case 'INTEGER':
      return comparePlainNumber(input);
    case 'BOOLEAN':
      return compareBoolean(input);
    case 'DATE':
      return compareDate(input);
    case 'SELECT':
      return compareOption(input, false);
    case 'MULTI_SELECT':
      return compareOption(input, true);
    case 'TEXT':
      return compareText(input);
    default:
      return incomparable(
        'UNSUPPORTED_DATA_TYPE',
        `Values of type ${dataType || 'unknown'} have no deterministic equality, so they are never treated as equivalent.`,
      );
  }
}

/**
 * Free text comparison.
 *
 * Trimmed, case-insensitive equality — the same normalisation the attribute
 * domain applies when it stores text (`String(value).trim()`). Not fuzzy
 * matching: two different strings stay different.
 */
function compareText(input: CompareValueInput): ValueComparison {
  const first = normalizeText(input.first.textValue);
  const second = normalizeText(input.second.textValue);
  if (first === null || second === null) {
    return incomparable(
      'MISSING_VALUE',
      'One of the values has no text value.',
    );
  }
  if (first === second) {
    return { ...EQUAL, detail: null, firstBase: null, secondBase: null };
  }
  return different('The recorded text and the suggested text differ.');
}

function normalizeText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.replace(/\s+/g, ' ').trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function compareQuantity(input: CompareValueInput): ValueComparison {
  const { first, second } = input;
  const firstAmount = first.amount ?? null;
  const secondAmount = second.amount ?? null;

  if (firstAmount === null || secondAmount === null) {
    return incomparable(
      'MISSING_VALUE',
      'One of the values has no numeric amount, so the quantities cannot be compared.',
    );
  }

  // Same spelling of units (including both absent): compare the amounts alone.
  const firstKey = first.unit ? canonicalUnitKey(first.unit) : '';
  const secondKey = second.unit ? canonicalUnitKey(second.unit) : '';
  if (firstKey === secondKey) {
    // The two sides share a unit, so the base amounts are reported for
    // consistency with the converted branch. When that unit is not in the
    // catalog there is no base to report and the raw amounts are used, which is
    // still meaningful because both sides were recorded in the same unit.
    const sharedUnit = findUnit(input.units, first.unit ?? second.unit);
    const toSharedBase = (amount: number): number => {
      if (!sharedUnit) return amount;
      const converted = toBaseUnit(sharedUnit, amount);
      return converted.ok ? converted.value : amount;
    };
    const firstBase = toSharedBase(firstAmount);
    const secondBase = toSharedBase(secondAmount);

    if (canonicalAmount(firstAmount) === canonicalAmount(secondAmount)) {
      return {
        ...EQUAL,
        detail: null,
        firstBase,
        secondBase,
      };
    }
    const withinTolerance = toleranceDecision(firstAmount, secondAmount, input);
    if (withinTolerance) {
      return {
        result: 'WITHIN_TOLERANCE',
        reason: null,
        detail: withinTolerance,
        firstBase,
        secondBase,
        equivalent: true,
      };
    }
    return {
      result: 'DIFFERENT',
      reason: null,
      detail: `${firstAmount} and ${secondAmount} are different amounts of the same unit.`,
      firstBase,
      secondBase,
      equivalent: false,
    };
  }

  const firstUnit = findUnit(input.units, first.unit);
  const secondUnit = findUnit(input.units, second.unit);

  // No unit on one side: the extraction may rely on the definition's default
  // unit. Only accept that when the other side is the default unit too, which is
  // exactly the same-key case above; otherwise this is not a known conversion.
  if (!firstUnit || !secondUnit) {
    const unknown = !firstUnit ? first.unit : second.unit;
    return incomparable(
      'UNKNOWN_UNIT',
      `The unit "${unknown ?? '(none)'}" is not defined in the unit catalog, so its values are never converted or assumed equal.`,
    );
  }

  const declaredCategory = describeUnitCategory(input.unitCategory);
  if (
    declaredCategory &&
    (firstUnit.category !== declaredCategory ||
      secondUnit.category !== declaredCategory)
  ) {
    const offending =
      firstUnit.category !== declaredCategory ? firstUnit : secondUnit;
    return incomparable(
      'UNIT_CATEGORY_MISMATCH',
      `The unit "${offending.name}" measures ${offending.category}, which is not the dimension this attribute declares (${declaredCategory}).`,
    );
  }

  if (firstUnit.category !== secondUnit.category) {
    return incomparable(
      'INCOMPATIBLE_UNIT',
      `${firstUnit.name} (${firstUnit.category}) and ${secondUnit.name} (${secondUnit.category}) measure different dimensions and cannot be converted into one another.`,
    );
  }

  const firstConverted = toBaseUnit(firstUnit, firstAmount);
  const secondConverted = toBaseUnit(secondUnit, secondAmount);
  if (!firstConverted.ok) {
    return incomparable('INCOMPATIBLE_UNIT', firstConverted.detail);
  }
  if (!secondConverted.ok) {
    return incomparable('INCOMPATIBLE_UNIT', secondConverted.detail);
  }

  const firstBase = firstConverted.value;
  const secondBase = secondConverted.value;

  // Exact after conversion: `1000 Ω` and `1 kΩ` land on the same base amount.
  if (canonicalAmount(firstBase) === canonicalAmount(secondBase)) {
    return {
      result: 'UNIT_NORMALIZED_EQUAL',
      reason: null,
      detail: null,
      firstBase,
      secondBase,
      equivalent: true,
    };
  }

  const tolerance = toleranceDecision(firstBase, secondBase, input);
  if (tolerance) {
    return {
      result: 'WITHIN_TOLERANCE',
      reason: null,
      detail: tolerance,
      firstBase,
      secondBase,
      equivalent: true,
    };
  }

  return {
    result: 'DIFFERENT',
    reason: null,
    detail: `${firstAmount} ${firstUnit.name} and ${secondAmount} ${secondUnit.name} describe different amounts (${firstBase} and ${secondBase} ${firstUnit.isBaseUnit ? firstUnit.name : firstUnit.category.toLowerCase()}).`,
    firstBase,
    secondBase,
    equivalent: false,
  };
}

/** Explains an in-tolerance difference, or returns null when there is none. */
function toleranceDecision(
  first: number,
  second: number,
  input: CompareValueInput,
): string | null {
  const relative = input.relativeTolerance;
  const absolute = input.absoluteTolerance;
  const difference = Math.abs(first - second);

  if (
    absolute !== null &&
    absolute !== undefined &&
    absolute > 0 &&
    difference <= absolute
  ) {
    return `The values differ by ${difference}, inside the ±${absolute} this attribute allows.`;
  }

  if (relative !== null && relative !== undefined && relative > 0) {
    const scale = Math.max(Math.abs(first), Math.abs(second));
    if (scale === 0) return null;
    const ratio = difference / scale;
    if (ratio <= relative) {
      return `The values differ by ${(ratio * 100).toFixed(3)}%, inside the ±${(relative * 100).toFixed(3)}% this attribute allows.`;
    }
  }

  return null;
}

function comparePlainNumber(input: CompareValueInput): ValueComparison {
  const firstAmount = input.first.amount ?? null;
  const secondAmount = input.second.amount ?? null;
  if (firstAmount === null || secondAmount === null) {
    return incomparable(
      'MISSING_VALUE',
      'One of the values has no numeric amount.',
    );
  }
  // A unit on a NUMBER/INTEGER attribute is not part of its representation.
  if (canonicalAmount(firstAmount) === canonicalAmount(secondAmount)) {
    return {
      ...EQUAL,
      detail: null,
      firstBase: firstAmount,
      secondBase: secondAmount,
    };
  }
  const tolerance = toleranceDecision(firstAmount, secondAmount, input);
  if (tolerance) {
    return {
      result: 'WITHIN_TOLERANCE',
      reason: null,
      detail: tolerance,
      firstBase: firstAmount,
      secondBase: secondAmount,
      equivalent: true,
    };
  }
  return different(`${firstAmount} and ${secondAmount} are different numbers.`);
}

function compareBoolean(input: CompareValueInput): ValueComparison {
  const first = input.first.booleanValue ?? null;
  const second = input.second.booleanValue ?? null;
  if (first === null || second === null) {
    return incomparable(
      'MISSING_VALUE',
      'One of the values has no yes/no value.',
    );
  }
  if (first === second) {
    return { ...EQUAL, detail: null, firstBase: null, secondBase: null };
  }
  return different(
    `${first ? 'Yes' : 'No'} and ${second ? 'Yes' : 'No'} differ.`,
  );
}

function compareDate(input: CompareValueInput): ValueComparison {
  const first = input.first.dateValue ?? null;
  const second = input.second.dateValue ?? null;
  if (!first || !second) {
    return incomparable('MISSING_VALUE', 'One of the values has no date.');
  }
  const firstDay = first.slice(0, 10);
  const secondDay = second.slice(0, 10);
  if (firstDay === secondDay) {
    return { ...EQUAL, detail: null, firstBase: null, secondBase: null };
  }
  return different(`${firstDay} and ${secondDay} are different dates.`);
}

/**
 * SELECT / MULTI_SELECT comparison.
 *
 * Options are compared by their authoritative code, falling back to the label
 * only when no code is known. For MULTI_SELECT the comparison is set-based, so
 * ordering differences are not conflicts, but a different membership is.
 */
function compareOption(
  input: CompareValueInput,
  multi: boolean,
): ValueComparison {
  const first = optionKeys(input.first, multi);
  const second = optionKeys(input.second, multi);

  if (first === null || second === null) {
    return incomparable(
      'MISSING_VALUE',
      'One of the values has no option, so the choices cannot be compared.',
    );
  }

  if (!multi) {
    if (first[0] === second[0]) {
      return { ...EQUAL, detail: null, firstBase: null, secondBase: null };
    }
    return different(
      `The recorded option and the suggested option are different choices.`,
    );
  }

  const firstSet = new Set(first);
  const secondSet = new Set(second);
  const same =
    firstSet.size === secondSet.size &&
    [...firstSet].every((key) => secondSet.has(key));
  if (same) {
    return { ...EQUAL, detail: null, firstBase: null, secondBase: null };
  }
  return different(
    `The recorded selection and the suggested selection contain different options.`,
  );
}

function optionKeys(value: ComparableValue, multi: boolean): string[] | null {
  if (multi) {
    const codes = (value.optionCodes ?? []).map((code) => code.trim());
    const fromCodes = codes.filter((code) => code.length > 0);
    if (fromCodes.length > 0) return fromCodes.map(normalizeOption);
    const labels = (value.optionLabels ?? [])
      .map((label) => label.trim())
      .filter((label) => label.length > 0);
    if (labels.length > 0) return labels.map(normalizeOption);
    return null;
  }

  const code = value.optionCode?.trim();
  if (code) return [normalizeOption(code)];
  const label = value.optionLabels?.[0]?.trim();
  if (label) return [normalizeOption(label)];
  return null;
}

function normalizeOption(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ---------------------------------------------------------------------------
// Definition-level helper
// ---------------------------------------------------------------------------

/**
 * Whether two display strings denote the same recorded value for an attribute.
 *
 * Replaces the display-string equality Pass 3 used for staleness and
 * "already current" checks, so an equivalent value written in a different unit
 * is recognised instead of being reported as a change or a conflict.
 */
export function areValuesEquivalent(input: {
  dataType: string;
  unitCategory?: string | null;
  units: readonly UnitRef[];
  first: ComparableValue;
  second: ComparableValue;
  validationRules?: Record<string, unknown> | null;
}): ValueComparison {
  return compareAttributeValues({
    dataType: input.dataType,
    unitCategory: input.unitCategory,
    units: input.units,
    first: input.first,
    second: input.second,
    relativeTolerance: readRelativeTolerance(input.validationRules),
    absoluteTolerance: readAbsoluteTolerance(input.validationRules),
  });
}

/**
 * Parses an amount and unit out of a display string such as `330Ω`, `1 kohm` or
 * `0.125 W`.
 *
 * Used where only the display form survives (a stored finding's recorded value,
 * a component column) so those can still take part in semantic comparison. A
 * string the parser cannot read yields a null amount, which the comparison layer
 * reports as MISSING_VALUE rather than treating as equal.
 */
export function parseAmountAndUnit(display: string | null | undefined): {
  amount: number | null;
  unit: string | null;
} {
  if (!display) return { amount: null, unit: null };
  const text = display.trim();
  const match = text.match(
    /^(-?\d+(?:\.\d+)?(?:\s*[eE][+-]?\d+)?)\s*([A-Za-zµμΩ%°/]+|°C)?\s*$/,
  );
  if (!match) return { amount: null, unit: null };
  const amount = Number(match[1]);
  return {
    amount: Number.isFinite(amount) ? amount : null,
    unit: match[2]?.trim() || null,
  };
}

/** The coerced payload the attribute domain produces for a value. */
export interface CoercedValueShape {
  value?: unknown;
  unit?: string | null;
  optionCode?: string | null;
  selectedOptionCodes?: readonly string[] | null;
}

/**
 * Builds the comparable form of a value from whatever representation is on hand.
 *
 * THE single mapping from "how a value is stored" to "how a value is compared".
 * Three callers need it — the analysis layer comparing an extraction with the
 * recorded value, the apply path re-checking before it writes, and the
 * cross-document aggregation comparing sources — and three copies would drift.
 *
 * The coerced payload is authoritative when present (it is what the attribute
 * domain will store); the display string is the fallback for values that were
 * never coerced, such as a component column read back from the database.
 */
export function toComparableValue(input: {
  dataType: string;
  coerced?: CoercedValueShape | null;
  display?: string | null;
  unit?: string | null;
}): ComparableValue {
  const type = input.dataType.toUpperCase();
  const coerced = input.coerced ?? null;

  if (type === 'SELECT') {
    return {
      optionCode:
        coerced?.optionCode ??
        (typeof coerced?.value === 'string' ? coerced.value : null),
    };
  }

  if (type === 'MULTI_SELECT') {
    const codes = Array.isArray(coerced?.selectedOptionCodes)
      ? coerced.selectedOptionCodes.filter(
          (code): code is string => typeof code === 'string',
        )
      : Array.isArray(coerced?.value)
        ? coerced.value.filter(
            (code): code is string => typeof code === 'string',
          )
        : [];
    return { optionCodes: codes };
  }

  if (type === 'BOOLEAN') {
    return {
      booleanValue: typeof coerced?.value === 'boolean' ? coerced.value : null,
    };
  }

  if (type === 'DATE') {
    return {
      dateValue: typeof coerced?.value === 'string' ? coerced.value : null,
    };
  }

  if (type === 'TEXT') {
    return {
      textValue:
        typeof coerced?.value === 'string'
          ? coerced.value
          : (input.display ?? null),
    };
  }

  // QUANTITY / NUMBER / INTEGER: prefer the coerced amount and unit, and fall
  // back to reading the display form.
  if (typeof coerced?.value === 'number') {
    return {
      amount: coerced.value,
      unit:
        typeof coerced.unit === 'string' ? coerced.unit : (input.unit ?? null),
    };
  }

  const parsed = parseAmountAndUnit(input.display);
  return { amount: parsed.amount, unit: input.unit ?? parsed.unit };
}
