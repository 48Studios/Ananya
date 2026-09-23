import type {
  AttributeSuggestedValueDto,
  AttributeSuggestionDto,
} from "./api/ml-api";
import type { UnitDto } from "./api/units-api";

/**
 * Does the form already hold the value a suggestion proposes?
 *
 * The Component Add/Edit form's own attribute state is authoritative, and the
 * AI suggestions are a reading of it. Deciding whether a suggestion has already
 * been applied therefore cannot be a flag remembered when the reviewer clicked
 * Apply: a re-run of the analysis, a category change, an edit in the attribute
 * editor or a reopened component all produce a fresh suggestion list, and the
 * only durable statement of "this value is in the form" is the form value
 * itself.
 *
 * The comparison is semantic, not textual, and it mirrors the API's own
 * `attribute-value-semantics.ts`, which is the module that decides equivalence
 * server-side:
 *
 *  - a quantity is compared as a quantity, through the authoritative unit
 *    catalog, so `100 kΩ` and `100000 Ω` are the same value and `10 °C` is not
 *    confused with `10 °F`;
 *  - option values compare by option code, exactly (codes are case-sensitive:
 *    `X7R` is not `x7r`);
 *  - free text is trimmed and case-folded, the same normalisation the domain
 *    applies when it stores text.
 *
 * What it deliberately does NOT do is claim equivalence it cannot establish: an
 * unknown unit, a unit of another dimension, or a value that is not
 * representable for its data type all compare as *not equal* rather than as
 * agreement. A false "Applied" would hide a value the reviewer still has to
 * look at, which is exactly the failure this module exists to prevent.
 */

/**
 * The attribute state one form row holds.
 *
 * Structurally the editor's own entry, so the form can hand its state over
 * without translation — and so a value applied from a suggestion (which is
 * written through the same editor state) compares identically to a typed one.
 */
export interface FormAttributeValue {
  value?: unknown;
  unit?: string | null;
  optionCode?: string;
  selectedOptionCodes?: string[];
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/**
 * Canonical lookup key for a unit spelling.
 *
 * `kΩ`, `kohm`, `KOHM` and `kiloohm` all name one unit, and a reviewer typing
 * into the editor produces the same variation an extraction does. Folding the
 * symbol to its word, the case and the two spelled-out prefixes is a spelling
 * normaliser, not a unit table: a key is only meaningful when the authoritative
 * catalog holds the matching row. Mirrors `canonicalUnitKey` on the API, so both
 * sides fold a spelling the same way.
 *
 * `milliohm` deliberately does NOT fold onto `mohm`: this catalog reads `Mohm`
 * as megaohm, and a wrong prefix is a wrong quantity.
 */
export function canonicalUnitKey(unit: string): string {
  return (
    unit
      .trim()
      // Micro sign (U+00B5) and Greek small mu (U+03BC) are both typed as `u`.
      .replace(/[\u00B5\u03BC]/g, "u")
      // Greek capital omega (U+03A9), the ohm sign (U+2126) and Greek small
      // omega (U+03C9) are one unit, folded before lowercasing (which would
      // otherwise turn U+03A9 into U+03C9 and slip past the pattern).
      .replace(/[\u03A9\u2126\u03C9]/g, "ohm")
      .replace(/°/g, "deg")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/\.$/, "")
      .replace(/^(kilo|mega)(?=ohm$)/, (prefix) =>
        prefix === "kilo" ? "k" : "M".toLowerCase(),
      )
      .replace(/^(celsius|centigrade)$/, "degc")
      .replace(/^fahrenheit$/, "degf")
      .replace(/^kelvin$/, "k")
  );
}

/** The catalog row a unit spelling denotes, or null when the catalog has none. */
export function findCatalogUnit(
  units: readonly UnitDto[],
  unit: string | null | undefined,
): UnitDto | null {
  if (!unit) return null;
  const key = canonicalUnitKey(unit);
  if (!key) return null;
  return units.find((row) => canonicalUnitKey(row.name) === key) ?? null;
}

/**
 * Converts an amount into its unit's base unit.
 *
 * `base = (value + offset) × factor`, the same arithmetic the domain's `Unit`
 * aggregate performs, so a value compared here is compared on the same base the
 * backend uses. A base unit passes its amount through unchanged; a unit the
 * catalog cannot convert (no factor) yields null rather than a guess.
 */
export function convertToBaseUnit(
  unit: UnitDto,
  amount: number,
): number | null {
  if (!Number.isFinite(amount)) return null;
  if (unit.isBaseUnit) return amount;
  const factor = readNumber(unit.conversionFactor);
  if (factor === null || factor === 0) return null;
  return (amount + (readNumber(unit.conversionOffset) ?? 0)) * factor;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Numeric canonicalisation used for equality.
 *
 * `"1.000"`, `1` and `"1e0"` are one number, so a value that is merely
 * re-formatted — which is what the editor produces, since its inputs hold
 * strings — is exactly equal without any tolerance being invented.
 */
function canonicalAmount(amount: number | null): string | null {
  if (amount === null || !Number.isFinite(amount)) return null;
  return String(Number(amount));
}

// ---------------------------------------------------------------------------
// Reading the form's side
// ---------------------------------------------------------------------------

function readAmount(value: unknown): number | null {
  return readNumber(value);
}

function readSelectedCodes(
  entry: FormAttributeValue | null | undefined,
): string[] {
  if (!entry) return [];
  if (entry.selectedOptionCodes && entry.selectedOptionCodes.length > 0) {
    return entry.selectedOptionCodes.map(String);
  }
  if (Array.isArray(entry.value)) return entry.value.map(String);
  return [];
}

function readOptionCode(
  entry: FormAttributeValue | null | undefined,
): string | null {
  if (!entry) return null;
  const code = entry.optionCode?.trim();
  if (code) return code;
  if (typeof entry.value === "string" && entry.value.trim()) {
    return entry.value.trim();
  }
  return null;
}

/**
 * Whether the form actually holds a value for this attribute.
 *
 * Distinct from "an entry exists": the category effect writes a QUANTITY row's
 * starting unit before the reviewer enters anything, and an empty row must not
 * be mistaken for a value that disagrees with the suggestion.
 */
export function hasFormAttributeValue(
  entry: FormAttributeValue | null | undefined,
  dataType: string,
): boolean {
  if (!entry) return false;
  switch (dataType?.toUpperCase?.() ?? "") {
    case "SELECT":
      return readOptionCode(entry) !== null;
    case "MULTI_SELECT":
      return readSelectedCodes(entry).length > 0;
    case "QUANTITY":
    case "NUMBER":
    case "INTEGER":
      return readAmount(entry.value) !== null;
    case "BOOLEAN":
      return typeof entry.value === "boolean";
    default:
      return (
        entry.value !== undefined && entry.value !== null && entry.value !== ""
      );
  }
}

/**
 * The form's value as the reviewer should read it.
 *
 * Used where the row has to state what the *form* holds — a conflict against a
 * value the reviewer has already typed, for instance — so it renders the value
 * in the same shape the editor shows: an option code, the chosen codes of a
 * multi-select, or `"<amount> <unit>"`.
 */
export function formValueDisplay(
  entry: FormAttributeValue | null | undefined,
  suggestion: Pick<AttributeSuggestionDto, "dataType" | "defaultUnit">,
): string | null {
  if (!hasFormAttributeValue(entry, suggestion.dataType) || !entry) return null;
  switch (suggestion.dataType?.toUpperCase?.() ?? "") {
    case "SELECT":
      return readOptionCode(entry);
    case "MULTI_SELECT":
      return readSelectedCodes(entry).join(", ") || null;
    case "QUANTITY": {
      const amount = readAmount(entry.value);
      if (amount === null) return null;
      const unit = entry.unit?.trim() || suggestion.defaultUnit?.trim() || "";
      return unit ? `${canonicalAmount(amount)} ${unit}` : canonicalAmount(amount);
    }
    case "NUMBER":
    case "INTEGER":
      return canonicalAmount(readAmount(entry.value));
    default:
      return String(entry.value);
  }
}

// ---------------------------------------------------------------------------
// The comparison
// ---------------------------------------------------------------------------

/**
 * Whether the form's current value is the value this suggestion proposes.
 *
 * True means there is nothing left to apply for that attribute, which is what
 * makes the row's "Applied" state survive an intelligence refresh: the value is
 * still in the form, so the verdict is recomputed rather than remembered.
 */
export function formValueMatchesSuggestion(
  entry: FormAttributeValue | null | undefined,
  suggestion: AttributeSuggestionDto,
  units: readonly UnitDto[] = [],
): boolean {
  const suggested = suggestion.suggestedValue;
  if (!entry || !suggested) return false;
  if (!hasFormAttributeValue(entry, suggestion.dataType)) return false;

  switch (suggestion.dataType?.toUpperCase?.() ?? "") {
    case "SELECT":
      return matchOption(entry, suggested);
    case "MULTI_SELECT":
      return matchOptionList(entry, suggested);
    case "QUANTITY":
      return matchQuantity(entry, suggested, units);
    case "NUMBER":
    case "INTEGER":
      return (
        canonicalAmount(readAmount(entry.value)) ===
        canonicalAmount(readAmount(suggested.value))
      );
    case "BOOLEAN":
      return entry.value === suggested.value;
    default:
      return matchText(entry, suggested);
  }
}

function matchOption(
  entry: FormAttributeValue,
  suggested: AttributeSuggestedValueDto,
): boolean {
  const current = readOptionCode(entry);
  const proposed =
    suggested.optionCode?.trim() ||
    (typeof suggested.value === "string" ? suggested.value.trim() : "");
  if (!current || !proposed) return false;
  // Option codes are identifiers, not labels: `X7R` and `x7r` are two codes.
  return current === proposed;
}

function matchOptionList(
  entry: FormAttributeValue,
  suggested: AttributeSuggestedValueDto,
): boolean {
  const current = readSelectedCodes(entry);
  const proposed =
    suggested.selectedOptionCodes && suggested.selectedOptionCodes.length > 0
      ? suggested.selectedOptionCodes.map(String)
      : Array.isArray(suggested.value)
        ? suggested.value.map(String)
        : [];
  if (current.length === 0 || proposed.length === 0) return false;
  if (current.length !== proposed.length) return false;
  const chosen = new Set(current);
  return proposed.every((code) => chosen.has(code));
}

function matchQuantity(
  entry: FormAttributeValue,
  suggested: AttributeSuggestedValueDto,
  units: readonly UnitDto[],
): boolean {
  const currentAmount = readAmount(entry.value);
  const proposedAmount = readAmount(suggested.value);
  if (currentAmount === null || proposedAmount === null) return false;

  const currentUnit = entry.unit?.trim() || null;
  const proposedUnit = suggested.unit?.trim() || null;
  const currentKey = currentUnit ? canonicalUnitKey(currentUnit) : "";
  const proposedKey = proposedUnit ? canonicalUnitKey(proposedUnit) : "";

  // Same unit (including both absent): the amounts alone decide, exactly as the
  // API does, so `100 kΩ` stays `100 kΩ` and is never rewritten as `100000 Ω`.
  if (currentKey === proposedKey) {
    return canonicalAmount(currentAmount) === canonicalAmount(proposedAmount);
  }

  // Different spellings of one dimension: convert both through the catalog.
  const currentRow = findCatalogUnit(units, currentUnit);
  const proposedRow = findCatalogUnit(units, proposedUnit);
  if (!currentRow || !proposedRow) return false;
  if (currentRow.category !== proposedRow.category) return false;

  const currentBase = convertToBaseUnit(currentRow, currentAmount);
  const proposedBase = convertToBaseUnit(proposedRow, proposedAmount);
  if (currentBase === null || proposedBase === null) return false;
  return canonicalAmount(currentBase) === canonicalAmount(proposedBase);
}

function matchText(
  entry: FormAttributeValue,
  suggested: AttributeSuggestedValueDto,
): boolean {
  const current = normalizeText(entry.value);
  const proposed = normalizeText(suggested.value);
  if (current === null || proposed === null) return false;
  return current === proposed;
}

/** Trimmed, whitespace-folded, case-insensitive — the domain's text storage. */
function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, " ").trim().toLowerCase();
  return text.length > 0 ? text : null;
}
