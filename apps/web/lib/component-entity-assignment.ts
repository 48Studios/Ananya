/**
 * Matching a reviewer-typed name to an existing ERP record.
 *
 * The AI suggestion card lets a reviewer type the correct manufacturer or
 * category instead of the one the model proposed. The form then has to decide
 * whether that name IS a record the ERP already holds or a genuinely new one:
 * treating an existing record as new shows a "NEW" badge beside a value that is
 * about to be bound to an existing row, and it makes the field look unassigned
 * when it is not.
 *
 * The rule here mirrors `PendingComponentEntityService` on the API, which is
 * what actually resolves a pending entity on save: comparison is on the NAME,
 * trimmed and case-insensitive, and a name that is already taken resolves to the
 * existing record rather than creating a second one. A code is deliberately NOT
 * matched — the server's lookup requires the name to match as well, so matching
 * on a code here would show "existing" for a name the server would refuse and
 * then create.
 *
 * Resolution is parent-agnostic, preferring the suggested parent when several
 * records share the name: once a record is chosen the form sends its **id**, so
 * the server never re-resolves it and cannot disagree with what the reviewer
 * sees.
 */

/** A manufacturer or category that a suggestion can be assigned to. */
export interface AssignableEntity {
  id: string;
  name: string;
  code: string;
  /** Nesting, for categories. Manufacturers have none. */
  parentId?: string | null;
}

export interface AssignableEntityLookup {
  /** What the reviewer typed. */
  typedName: string;
  /** The records to match against — the reviewer's own ERP. */
  entities: readonly AssignableEntity[];
  /**
   * The parent the suggestion proposed. Only used to choose between several
   * records sharing the typed name; it never excludes a record.
   */
  preferredParentId?: string | null;
}

/** Trims and folds case, the same comparison the API's resolver uses. */
function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * The existing record the typed name already identifies, or null when the name
 * is genuinely new and has to be created on save.
 *
 * Deterministic: several records sharing a name are resolved by the suggested
 * parent first, then by code and id, so the same input never depends on the
 * order the records happened to load in.
 */
export function findAssignableEntity(
  input: AssignableEntityLookup,
): AssignableEntity | null {
  const normalized = normalizeName(input.typedName);
  if (!normalized) return null;

  const matches = input.entities.filter(
    (entity) => normalizeName(entity.name) === normalized,
  );
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0] ?? null;

  // Only a suggestion that actually proposed a parent may break the tie: an
  // absent parent is not a preference for top-level records.
  if (input.preferredParentId !== undefined) {
    const preferredParent = input.preferredParentId ?? null;
    const underPreferredParent = matches.find(
      (entity) => (entity.parentId ?? null) === preferredParent,
    );
    if (underPreferredParent) return underPreferredParent;
  }

  return (
    [...matches].sort(
      (left, right) =>
        left.code.localeCompare(right.code) || left.id.localeCompare(right.id),
    )[0] ?? null
  );
}
