import { describe, it, expect } from "vitest";
import {
  findAssignableEntity,
  type AssignableEntity,
} from "./component-entity-assignment";

/**
 * The live taxonomy this was reported against: a root group and the part
 * families beneath it, plus the two "Resistors" rows that really exist.
 */
const ELEC: AssignableEntity = {
  id: "cat-elec",
  code: "ELEC",
  name: "Electronic Components",
  parentId: null,
};
const CAP: AssignableEntity = {
  id: "cat-cap",
  code: "CAP",
  name: "Capacitors",
  parentId: ELEC.id,
};
const IND: AssignableEntity = {
  id: "cat-ind",
  code: "IND",
  name: "Inductors",
  parentId: ELEC.id,
};
const RES_CHILD: AssignableEntity = {
  id: "cat-res",
  code: "RES",
  name: "Resistors",
  parentId: ELEC.id,
};
const RES_ROOT: AssignableEntity = {
  id: "cat-res-root",
  code: "RESISTORS",
  name: "Resistors",
  parentId: null,
};

const CATEGORIES = [ELEC, CAP, IND, RES_CHILD, RES_ROOT];

const YAGEO: AssignableEntity = {
  id: "mfg-yageo",
  code: "YAGEO",
  name: "Yageo",
};
const MURATA: AssignableEntity = {
  id: "mfg-murata",
  code: "MURATA",
  name: "Murata",
};
const MANUFACTURERS = [YAGEO, MURATA];

describe("findAssignableEntity", () => {
  it("resolves a typed name to the existing record", () => {
    // The reported bug: typing a name the ERP already holds showed the field as
    // NEW instead of selecting the record.
    expect(
      findAssignableEntity({ typedName: "Inductors", entities: CATEGORIES })?.id,
    ).toBe(IND.id);
    expect(
      findAssignableEntity({ typedName: "Yageo", entities: MANUFACTURERS })?.id,
    ).toBe(YAGEO.id);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(
      findAssignableEntity({ typedName: "  yAgEo  ", entities: MANUFACTURERS })
        ?.id,
    ).toBe(YAGEO.id);
    expect(
      findAssignableEntity({ typedName: "capacitors", entities: CATEGORIES })?.id,
    ).toBe(CAP.id);
  });

  it("prefers the suggested parent when a name is shared", () => {
    expect(
      findAssignableEntity({
        typedName: "Resistors",
        entities: CATEGORIES,
        preferredParentId: ELEC.id,
      })?.id,
    ).toBe(RES_CHILD.id);
    expect(
      findAssignableEntity({
        typedName: "Resistors",
        entities: CATEGORIES,
        preferredParentId: null,
      })?.id,
    ).toBe(RES_ROOT.id);
  });

  it("does not exclude a record whose parent differs from the suggestion", () => {
    // The reviewer named a record that exists; honouring it is correct, and the
    // form sends its id, so the server cannot re-resolve it into a duplicate.
    expect(
      findAssignableEntity({
        typedName: "Mechanical Parts",
        entities: [
          ...CATEGORIES,
          {
            id: "cat-mech",
            code: "MECH",
            name: "Mechanical Parts",
            parentId: null,
          },
        ],
        preferredParentId: ELEC.id,
      })?.id,
    ).toBe("cat-mech");
  });

  it("breaks an unresolvable tie deterministically, not by row order", () => {
    const first: AssignableEntity = {
      id: "cat-b",
      code: "BBB",
      name: "Ceramic Capacitors",
      parentId: null,
    };
    const second: AssignableEntity = {
      id: "cat-a",
      code: "AAA",
      name: "Ceramic Capacitors",
      parentId: null,
    };

    const forward = findAssignableEntity({
      typedName: "Ceramic Capacitors",
      entities: [first, second],
    });
    const reversed = findAssignableEntity({
      typedName: "Ceramic Capacitors",
      entities: [second, first],
    });

    expect(forward?.id).toBe(second.id);
    expect(reversed?.id).toBe(second.id);
  });

  it("returns null for a name the ERP does not hold", () => {
    expect(
      findAssignableEntity({
        typedName: "Precision Thin Film Resistors",
        entities: CATEGORIES,
      }),
    ).toBeNull();
    expect(
      findAssignableEntity({ typedName: "Acme Components Ltd", entities: MANUFACTURERS }),
    ).toBeNull();
  });

  it("never matches on a code alone", () => {
    // `PendingComponentEntityService` requires the name to match too, so a code
    // match here would show "existing" for a name the server would create. A
    // code that merely spells the name in another case is NOT a code-only case:
    // an uppercased name matches because the comparison folds case.
    const acme: AssignableEntity = {
      id: "mfg-acme",
      code: "ACM-9",
      name: "Acme Components",
    };

    expect(
      findAssignableEntity({ typedName: "ACM-9", entities: [...MANUFACTURERS, acme] }),
    ).toBeNull();
    expect(findAssignableEntity({ typedName: "IND", entities: CATEGORIES })).toBeNull();
    // …while the name itself still matches, whatever its case.
    expect(
      findAssignableEntity({ typedName: "acme components", entities: [acme] })?.id,
    ).toBe(acme.id);
  });

  it("returns null for blank input", () => {
    for (const typedName of ["", "   "]) {
      expect(findAssignableEntity({ typedName, entities: MANUFACTURERS })).toBeNull();
    }
  });

  it("returns null when there are no records to match", () => {
    expect(
      findAssignableEntity({ typedName: "Yageo", entities: [] }),
    ).toBeNull();
  });
});
