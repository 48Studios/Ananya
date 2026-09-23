import type { UnitDto } from "./api/units-api";

/**
 * The units the attribute editor offers for a QUANTITY attribute.
 *
 * Sourced from the authoritative unit catalog (`GET /units`) rather than a
 * hard-coded per-dimension list, because the catalog is what the backend
 * converts and validates against. A unit the editor offers but the catalog does
 * not know is a unit the reviewer can pick and the backend then cannot convert,
 * and a unit the catalog knows but the editor hides (an affine `°F`, or a unit
 * added by an administrator) is one the reviewer cannot choose at all.
 *
 * Two units are always present even when the catalog does not list them for the
 * dimension:
 *
 *  - the **definition's own unit** — the live `mm` attributes declare a
 *    dimension whose catalog rows do not exist yet, and the value is still
 *    recorded in `mm`;
 *  - the **current unit** — the unit the backend resolved for the value already
 *    in the editor (a preserved source unit, or the attribute's own after a
 *    conversion). Hiding it would leave the row showing a unit the reviewer
 *    cannot see, and a later edit would silently re-label the number.
 */
export function quantityUnitOptions(
  definition: {
    unitCategory?: string | null;
    defaultUnit?: string | null;
  },
  units: readonly UnitDto[],
  currentUnit?: string | null,
): string[] {
  const options: string[] = [];
  const add = (unit?: string | null) => {
    const trimmed = unit?.trim();
    if (trimmed && !options.includes(trimmed)) options.push(trimmed);
  };

  // The attribute's own unit leads: it is what the value is recorded in by
  // default, and what a conversion targets.
  add(definition.defaultUnit);

  const category = definition.unitCategory?.trim();
  for (const unit of units) {
    if (!unit.isActive) continue;
    if (category && unit.category !== category) continue;
    add(unit.name);
  }

  add(currentUnit);

  return options.length > 0 ? options : ["pcs"];
}

/**
 * The unit a QUANTITY row starts with when nothing has been chosen yet.
 *
 * The definition's own unit wins; failing that the first unit the catalog
 * offers for the dimension. Never a unit from outside the list the editor shows,
 * so the select can always render the value it holds.
 */
export function defaultQuantityUnit(
  definition: {
    unitCategory?: string | null;
    defaultUnit?: string | null;
  },
  units: readonly UnitDto[],
): string {
  return quantityUnitOptions(definition, units)[0] ?? "";
}
