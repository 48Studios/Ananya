import {
  VALID_ATTRIBUTE_DATA_TYPES,
  type AttributeDataType,
} from '@ananya/inventory';
import { findUnit, type UnitRef } from '../attribute-value-semantics';
import {
  normalizeAttributeCode,
  normalizeAttributeKey,
} from './attribute-finding-expected-state';
import type { AttributeApplyConflictReason } from './attribute-review-apply.dtos';

/**
 * The attribute-definition proposal carried by a `MISSING_EXPECTED_ATTRIBUTE`
 * finding, and the validation that decides whether it may be created.
 *
 * Pass 7. Creating a definition is the first mutation in this pipeline that
 * *adds* to the library rather than editing an existing row, so the proposal has
 * to be read from the persisted finding and validated before it reaches the
 * aggregate. Two consequences shape this module:
 *
 *  1. **The finding is the only source of truth.** The apply request cannot carry
 *     a code, name, data type, unit or option — see `ApplyAttributeFindingDto`,
 *     which has no such fields — so the reviewer's confirmation is a decision
 *     about what the producer proposed, never a free-form edit. Everything here
 *     reads persisted state.
 *  2. **Nothing is invented.** The data-type vocabulary comes from the domain
 *     (`VALID_ATTRIBUTE_DATA_TYPES`), the unit dimension check goes through the
 *     same `findUnit` used by the component apply path, and the collision check
 *     uses the same reduced key (`normalizeAttributeKey`) the audit uses to decide
 *     whether an expected attribute already exists. A validation rule that
 *     disagreed with the producer would create findings the queue cannot apply, or
 *     apply definitions the audit then reports as duplicates.
 *
 * Pure and database-free: the caller supplies the unit catalogue and the current
 * definitions, so every rule is unit-testable and the module runs inside the apply
 * transaction without touching a client of its own.
 */

/** One option the proposal asks to create, in canonical form. */
export interface ProposedAttributeOption {
  code: string;
  label: string;
  sortOrder: number;
}

export interface AttributeDefinitionProposal {
  /** Canonical code (`lower_snake`), the form the domain stores. */
  code: string;
  name: string;
  description: string | null;
  /**
   * `null` when the producer declared no data type. Kept distinguishable from a
   * declared type so validation can refuse rather than default: guessing a type
   * would change the meaning of the attribute silently.
   */
  dataType: AttributeDataType | null;
  unitCategory: string | null;
  defaultUnit: string | null;
  groupName: string | null;
  aliases: string[];
  /** Whether the expected binding should be required for its category. */
  isRequired: boolean;
  options: ProposedAttributeOption[];
}

/** A refusal, in the apply route's existing conflict vocabulary. */
export interface ProposalRefusal {
  reason: AttributeApplyConflictReason;
  message: string;
}

/**
 * Data types that may declare a unit category.
 *
 * Taken from the live library rather than invented: `QUANTITY` definitions carry
 * one and convert through it (`SaveComponentAttributes` resolves the unit and
 * stores a base-unit amount), `NUMBER` definitions carry one for display
 * (`operating_temp_min` is `NUMBER`/`Temperature`/`°C`), and no `SELECT`, `TEXT`,
 * `BOOLEAN`, `INTEGER`, `DATE` or `MULTI_SELECT` definition in the library has
 * one — matching the domain, whose other branches never read `unitCategory`.
 */
const UNIT_BEARING_DATA_TYPES: readonly AttributeDataType[] = [
  'QUANTITY',
  'NUMBER',
];

/** Data types whose values come from a closed option set. */
const OPTION_BEARING_DATA_TYPES: readonly AttributeDataType[] = [
  'SELECT',
  'MULTI_SELECT',
];

/**
 * The canonical code shape.
 *
 * The aggregate normalizes case and separators but accepts any non-empty string,
 * so a code like `2n2222` would be stored as-is. Every code in the library — and
 * every canonical code the knowledge base declares — is a lower_snake identifier
 * beginning with a letter, which is also the form the resolution layer reduces
 * when it matches a finding to a definition. This is the smallest additional
 * shape rule the creation path needs; it is a *validation layer*, documented
 * rather than assumed, and it cannot refuse a proposal any producer can emit.
 */
const CANONICAL_CODE_PATTERN = /^[a-z][a-z0-9_]*$/;

/** Narrows an unknown to a trimmed, non-empty string. */
function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => readString(entry))
    .filter((entry): entry is string => entry !== null);
}

/**
 * Reads the proposed options.
 *
 * Accepts either `{ code, label, sortOrder? }` objects or bare strings (an option
 * whose label is its code), because a producer that emits a code list — the
 * knowledge base stores option strings — should not need a second shape to be
 * representable.
 *
 * A declared label is passed through as written, including when it is blank: a
 * malformed entry must be *reported* by validation rather than quietly relabelled
 * with its own code, which would turn a producer defect into a library with a
 * misleading option. Only a bare string takes the code as its label, and only an
 * entry with no usable code at all is dropped (validation reports that too, through
 * the option count it can no longer see).
 */
function readOptions(value: unknown): ProposedAttributeOption[] {
  if (!Array.isArray(value)) return [];

  const options: ProposedAttributeOption[] = [];
  value.forEach((entry, index) => {
    if (typeof entry === 'string') {
      const code = entry.trim();
      if (code) options.push({ code, label: code, sortOrder: index + 1 });
      return;
    }
    const record = readRecord(entry);
    if (!record) return;
    const code = readString(record.code);
    if (!code) return;
    const sortOrder =
      typeof record.sortOrder === 'number' && Number.isFinite(record.sortOrder)
        ? record.sortOrder
        : index + 1;
    options.push({
      code,
      label: typeof record.label === 'string' ? record.label.trim() : '',
      sortOrder,
    });
  });
  return options;
}

/**
 * Builds the proposal from a persisted finding.
 *
 * The canonical code and name are the producer's canonical vocabulary: the
 * persisted `suggestedValue` is authoritative, and both the normalizer and the
 * expected-state snapshot carry the same values by construction, so the snapshot
 * is the fallback rather than a second source.
 *
 * Returns a refusal when the finding does not carry enough to create anything —
 * a code or name it cannot read. That is a 409 (the reviewer can act on it), not a
 * 500: the producer is allowed to emit a finding the creation path refuses, and
 * the message says what is missing.
 */
export function readAttributeDefinitionProposal(finding: {
  suggestedValue: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  issueType: string;
}): { proposal: AttributeDefinitionProposal } | { refusal: ProposalRefusal } {
  const suggested = finding.suggestedValue ?? {};
  const expectedState = readRecord(finding.metadata?.expectedState);

  const rawCode =
    readString(suggested.canonicalCode) ??
    readString(finding.metadata?.attributeCode) ??
    readString(expectedState?.expectedAttributeCode);
  const rawName =
    readString(suggested.canonicalName) ??
    readString(expectedState?.expectedAttributeName);

  if (!rawCode) {
    return {
      refusal: {
        reason: 'INVALID_PROPOSAL',
        message:
          'This finding does not carry the canonical code of the attribute it expects, so there is nothing to create. Create the attribute manually, then re-run the library audit.',
      },
    };
  }
  if (!rawName) {
    return {
      refusal: {
        reason: 'INVALID_PROPOSAL',
        message: `This finding expects attribute '${rawCode}' but does not carry a name for it, so there is nothing to create. Create the attribute manually, then re-run the library audit.`,
      },
    };
  }

  const rawDataType = readString(suggested.dataType);

  return {
    proposal: {
      code: normalizeAttributeCode(rawCode),
      name: rawName,
      description: readString(suggested.description),
      // Left unchecked against the vocabulary here so validation can report an
      // unknown type as a validation refusal rather than as a missing value.
      dataType: (rawDataType as AttributeDataType | null) ?? null,
      unitCategory: readString(suggested.unitCategory),
      defaultUnit: readString(suggested.defaultUnit),
      groupName: readString(suggested.groupName),
      aliases: readStringArray(suggested.aliases),
      isRequired: suggested.isRequired === true,
      options: readOptions(suggested.options),
    },
  };
}

/** The definition key index the audit builds, limited to what a collision needs. */
export interface DefinitionKeySubject {
  id: string;
  code: string;
  name: string;
  aliases?: unknown;
}

export interface ProposalCollision {
  /** The definition already claiming this identity, when it is unambiguous. */
  definition: DefinitionKeySubject | null;
  /** Which of the proposed identifiers collided, for the message. */
  matchedOn: 'code' | 'name' | 'alias';
  /** True when more than one definition claims the key. */
  ambiguous: boolean;
}

/**
 * Whether the proposal already exists in the library.
 *
 * Uses the audit's own resolution rule rather than a fresh one: a key is built
 * from each definition's **code, name and aliases** through
 * `normalizeAttributeKey`, and a key claimed by two definitions is ambiguous. The
 * audit resolves an expectation through exactly this index, so a proposal that
 * this check calls "already exists" is one the audit would also have resolved to a
 * definition — which is why the result is a refusal to create, not a second
 * definition.
 *
 * Ambiguity is treated as "exists": when two definitions already claim the
 * proposed code or name, creating a third cannot be justified, and the finding
 * needs a re-audit rather than a mutation.
 */
export function findProposalCollision(input: {
  proposal: Pick<AttributeDefinitionProposal, 'code' | 'name'>;
  definitions: readonly DefinitionKeySubject[];
}): ProposalCollision | null {
  const candidates: Array<{ key: string; matchedOn: 'code' | 'name' }> = (
    [
      { key: normalizeAttributeKey(input.proposal.code), matchedOn: 'code' },
      { key: normalizeAttributeKey(input.proposal.name), matchedOn: 'name' },
    ] as const
  ).filter((candidate) => candidate.key.length > 0);

  const claims = new Map<
    string,
    {
      definitions: DefinitionKeySubject[];
      matchedOn: 'code' | 'name' | 'alias';
    }
  >();

  const claim = (
    key: string,
    definition: DefinitionKeySubject,
    matchedOn: 'code' | 'name' | 'alias',
  ): void => {
    if (!key) return;
    const existing = claims.get(key);
    if (!existing) {
      claims.set(key, { definitions: [definition], matchedOn });
      return;
    }
    if (!existing.definitions.some((entry) => entry.id === definition.id)) {
      existing.definitions.push(definition);
    }
  };

  for (const definition of input.definitions) {
    claim(normalizeAttributeKey(definition.code), definition, 'code');
    claim(normalizeAttributeKey(definition.name), definition, 'name');
    for (const alias of readStringArray(definition.aliases)) {
      claim(normalizeAttributeKey(alias), definition, 'alias');
    }
  }

  for (const candidate of candidates) {
    const claimEntry = claims.get(candidate.key);
    if (!claimEntry) continue;
    return {
      definition:
        claimEntry.definitions.length === 1
          ? (claimEntry.definitions[0] ?? null)
          : null,
      matchedOn: candidate.matchedOn,
      ambiguous: claimEntry.definitions.length > 1,
    };
  }

  return null;
}

/**
 * Validates a proposal against the domain's own vocabulary and the live unit
 * catalogue.
 *
 * Returns `null` when the proposal may be created. Every refusal is one the
 * reviewer can understand and act on, and none of them has mutated anything.
 */
export function validateAttributeDefinitionProposal(input: {
  proposal: AttributeDefinitionProposal;
  units: readonly UnitRef[];
}): ProposalRefusal | null {
  const { proposal, units } = input;

  if (!CANONICAL_CODE_PATTERN.test(proposal.code)) {
    return {
      reason: 'INVALID_PROPOSAL',
      message: `The proposed code '${proposal.code}' is not a valid attribute code. Attribute codes are lowercase identifiers using letters, digits and underscores, starting with a letter.`,
    };
  }

  if (proposal.name.length === 0 || proposal.name.length > 200) {
    return {
      reason: 'INVALID_PROPOSAL',
      message: `The proposed name '${proposal.name}' is not usable: an attribute name must be between 1 and 200 characters.`,
    };
  }

  if (proposal.dataType === null) {
    return {
      reason: 'INVALID_PROPOSAL',
      message: `This finding expects attribute '${proposal.code}' but does not declare its data type, so the definition cannot be created from it. Create the attribute manually, then re-run the library audit.`,
    };
  }

  if (!VALID_ATTRIBUTE_DATA_TYPES.includes(proposal.dataType)) {
    return {
      reason: 'INVALID_PROPOSAL',
      message: `The proposed data type '${proposal.dataType}' is not one of the library's types (${VALID_ATTRIBUTE_DATA_TYPES.join(', ')}).`,
    };
  }

  const unitRefusal = validateUnitConfiguration(proposal, units);
  if (unitRefusal) return unitRefusal;

  return validateOptions(proposal);
}

/** Checks the declared unit category against the declared default unit. */
function validateUnitConfiguration(
  proposal: AttributeDefinitionProposal,
  units: readonly UnitRef[],
): ProposalRefusal | null {
  const dataType = proposal.dataType as AttributeDataType;

  if (proposal.unitCategory && !UNIT_BEARING_DATA_TYPES.includes(dataType)) {
    return {
      reason: 'INVALID_PROPOSAL',
      message: `A ${dataType} attribute cannot declare a unit category: only ${UNIT_BEARING_DATA_TYPES.join(' and ')} attributes measure a quantity.`,
    };
  }

  if (proposal.defaultUnit && !proposal.unitCategory) {
    return {
      reason: 'INVALID_PROPOSAL',
      message: `The proposal declares the default unit '${proposal.defaultUnit}' without a unit category, so the value could not be converted. A default unit needs the dimension it belongs to.`,
    };
  }

  if (!proposal.defaultUnit || !proposal.unitCategory) return null;

  // The unit catalogue is authoritative for unit *dimensions*, but it is not
  // exhaustive: `length` and `pitch` are recorded in `Length` with `mm`, and `mm`
  // is not in the catalogue. An unknown unit is therefore accepted — refusing it
  // would be stricter than the domain and would block configurations the library
  // already contains — while a *known* unit is held to its catalogue dimension.
  const unit = findUnit(units, proposal.defaultUnit);
  if (!unit) return null;

  if (
    canonicalDimension(unit.category) !==
    canonicalDimension(proposal.unitCategory)
  ) {
    return {
      reason: 'INVALID_PROPOSAL',
      message: `The default unit '${proposal.defaultUnit}' measures ${unit.category}, but the proposal declares the unit category '${proposal.unitCategory}'. Converting between dimensions is not supported, so the definition would be unusable.`,
    };
  }

  return null;
}

/** Category comparison, folded the way unit symbols are folded elsewhere. */
function canonicalDimension(value: string): string {
  return value.trim().toLowerCase();
}

/** Checks the proposed options against the option-bearing types and each other. */
function validateOptions(
  proposal: AttributeDefinitionProposal,
): ProposalRefusal | null {
  const dataType = proposal.dataType as AttributeDataType;

  if (
    proposal.options.length > 0 &&
    !OPTION_BEARING_DATA_TYPES.includes(dataType)
  ) {
    return {
      reason: 'INVALID_PROPOSAL',
      message: `A ${dataType} attribute cannot have a closed option set: only ${OPTION_BEARING_DATA_TYPES.join(' and ')} attributes are chosen from options.`,
    };
  }

  const seen = new Set<string>();
  for (const option of proposal.options) {
    const code = option.code.trim();
    const label = option.label.trim();
    if (!code || !label) {
      return {
        reason: 'INVALID_PROPOSAL',
        message:
          'The proposal contains an option with an empty code or label, which the library cannot store.',
      };
    }
    if (code.length > 100 || label.length > 200) {
      return {
        reason: 'INVALID_PROPOSAL',
        message: `The option '${code}' exceeds the library's limits (option codes are at most 100 characters and labels at most 200).`,
      };
    }
    // Exact codes, because that is what the unique index enforces and what
    // `findByDefinitionIdAndCode` matches a stored value against.
    if (seen.has(code)) {
      return {
        reason: 'INVALID_PROPOSAL',
        message: `The proposal contains the option code '${code}' twice. Option codes must be unique within an attribute.`,
      };
    }
    seen.add(code);
  }

  return null;
}
