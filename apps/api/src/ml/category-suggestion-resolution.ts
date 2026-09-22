/**
 * Resolving an ML category prediction to an ERP category row.
 *
 * The ML service reports a category the way a datasheet talks about a part: it
 * names the specific family ("Capacitors") and the group it belongs to
 * ("Electronic Components"), and it resolves both against the ERP list it was
 * sent. Re-deriving that answer locally is where this pair went wrong before:
 *
 *  - the group name was matched at the SAME priority as the specific name, so a
 *    prediction of "Electronic Components / Capacitors" resolved to Electronic
 *    Components whenever the parent row happened to be inspected first — every
 *    capacitor, inductor and diode suggestion landed on the parent;
 *  - among rows sharing a name, `Array.find` returned whichever row the query
 *    happened to order first, so two categories both called "Resistors" resolved
 *    unpredictably.
 *
 * The rules below are ordered by how authoritative each signal is:
 *
 *  1. A category an ACTIVE Data Pack declares, when its name is the name the ML
 *     reported. Packs are the installed taxonomy for their part families, and a
 *     pack's declaration is deliberate; the ML's own id among same-named rows is
 *     an artifact of the order it received those rows in.
 *  2. The ERP row the ML itself resolved (`category_code`), which is unique.
 *  3. The specific name the ML reported, as a code and then as a name.
 *  4. The group name it reported, as a code and then as a name.
 *
 * Within a single signal, ties are broken deterministically (ML id, then the ML's
 * recorded parent, then code and id order), so the same payload always resolves
 * to the same row.
 */

/** The category fields this module needs. */
export interface CategoryCandidate {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
}

/** A category an active Data Pack declares as the home of a part family. */
export interface PackCategoryDeclaration {
  categoryCode: string;
  categoryName: string;
}

/** What the ML reported about the category. */
export interface CategoryPredictionInput {
  /** The specific family, when the ML named one ("Capacitors"). */
  subcategoryName?: string | null;
  /** The group, or the family itself when there is no separate group. */
  categoryName?: string | null;
  /** The ERP row the ML resolved. */
  categoryId?: string | null;
  /** That row's code. */
  categoryCode?: string | null;
  /** The parent the ML recorded for the specific family. */
  parentCategoryId?: string | null;
}

/** Which signal produced the match, for evidence and tests. */
export type CategoryMatchSignal =
  | 'PACK_DECLARED'
  | 'ML_CATEGORY_CODE'
  | 'SUBCATEGORY_CODE'
  | 'SUBCATEGORY_NAME'
  | 'CATEGORY_CODE'
  | 'CATEGORY_NAME';

export interface ResolvedCategorySuggestion {
  category: CategoryCandidate;
  matchedBy: CategoryMatchSignal;
}

/** Case- and whitespace-insensitive comparison for names typed by humans. */
function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function matchesCode(category: CategoryCandidate, code: string): boolean {
  return normalize(category.code) === normalize(code);
}

function matchesName(category: CategoryCandidate, name: string): boolean {
  return normalize(category.name) === normalize(name);
}

/**
 * Picks one row out of the rows a single signal matched.
 *
 * Only a name signal can match more than one row (codes are unique), so this is
 * the same-name tie-break: the ML's own choice first, then the parent it
 * recorded, then a stable order so the outcome cannot depend on row order.
 */
function pickAmong(
  rows: CategoryCandidate[],
  input: CategoryPredictionInput,
): CategoryCandidate | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0] ?? null;

  if (input.categoryId) {
    const named = rows.find((row) => row.id === input.categoryId);
    if (named) return named;
  }

  if (input.parentCategoryId) {
    const underParent = rows.find(
      (row) => row.parentId === input.parentCategoryId,
    );
    if (underParent) return underParent;
  }

  return (
    [...rows].sort(
      (left, right) =>
        left.code.localeCompare(right.code) || left.id.localeCompare(right.id),
    )[0] ?? null
  );
}

/**
 * Resolves an ML category prediction to one active ERP category row.
 *
 * Returns null when nothing matches, which is the caller's signal that the
 * prediction names a category the ERP does not hold (a new-category candidate).
 */
export function resolveCategorySuggestion(
  input: CategoryPredictionInput,
  categories: readonly CategoryCandidate[],
  packDeclarations: readonly PackCategoryDeclaration[] = [],
): ResolvedCategorySuggestion | null {
  const active = categories.filter((category) => category.isActive);
  if (active.length === 0) return null;

  // What the ML named, most specific first. A prediction with no subcategory
  // names the family directly in `categoryName` (a root family, for example).
  const specificName = input.subcategoryName?.trim() || null;
  const groupName = input.categoryName?.trim() || null;
  const namedNames = [specificName, groupName].filter((name): name is string =>
    Boolean(name),
  );

  // 1. An installed Data Pack's own category, when the pack names the family the
  //    ML named. This is what keeps a same-named duplicate from winning: the
  //    pack declares the canonical row for the family it describes.
  for (const declaration of packDeclarations) {
    const declarationName = normalize(declaration.categoryName);
    if (!declarationName) continue;
    const agreesWithMl = namedNames.some(
      (name) => normalize(name) === declarationName,
    );
    if (!agreesWithMl) continue;

    const declared = active.find((category) =>
      matchesCode(category, declaration.categoryCode),
    );
    if (declared) {
      return { category: declared, matchedBy: 'PACK_DECLARED' };
    }
  }

  // 2-4. The ML's own resolution, then the specific name, then the group name.
  const signals: Array<{
    signal: CategoryMatchSignal;
    value: string | null | undefined;
    match: (category: CategoryCandidate, value: string) => boolean;
  }> = [
    {
      signal: 'ML_CATEGORY_CODE',
      value: input.categoryCode,
      match: matchesCode,
    },
    { signal: 'SUBCATEGORY_CODE', value: specificName, match: matchesCode },
    { signal: 'SUBCATEGORY_NAME', value: specificName, match: matchesName },
    { signal: 'CATEGORY_CODE', value: groupName, match: matchesCode },
    { signal: 'CATEGORY_NAME', value: groupName, match: matchesName },
  ];

  for (const { signal, value, match } of signals) {
    if (!value) continue;
    const rows = active.filter((category) => match(category, value));
    const picked = pickAmong(rows, input);
    if (picked) return { category: picked, matchedBy: signal };
  }

  return null;
}
