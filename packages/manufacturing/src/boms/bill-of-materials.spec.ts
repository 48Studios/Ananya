import { describe, it, expect } from "vitest";
import { BillOfMaterials } from "./bill-of-materials";
import {
  CircularBomDependencyError,
  DuplicateBomComponentLineError,
  EmptyBomError,
  ImmutableBomError,
  InvalidBomLineQuantityError,
} from "./bill-of-materials.errors";

/**
 * Bill of materials domain tests.
 *
 * These cover the two methods component consolidation relies on
 * (`repointLine` and `combineConsolidatedLine`) plus the invariants they must
 * not break. They exist because the manufacturing package previously had no
 * tests at all, while consolidation mutated BOM lines through this aggregate.
 */

function draftBom(productComponentId = "product") {
  return BillOfMaterials.create({ componentId: productComponentId });
}

function releasedBomWithLine(productComponentId = "product") {
  const bom = draftBom(productComponentId);
  bom.addLine({ componentId: "part", quantityPerUnit: 1 });
  bom.release();
  return bom;
}

describe("BillOfMaterials — existing invariants", () => {
  it("forbids two lines for the same component", () => {
    const bom = draftBom();
    bom.addLine({ componentId: "part", quantityPerUnit: 1 });

    expect(() =>
      bom.addLine({ componentId: "part", quantityPerUnit: 2 }),
    ).toThrow(DuplicateBomComponentLineError);
  });

  it("forbids a line for the product it builds", () => {
    const bom = draftBom("product");

    expect(() =>
      bom.addLine({ componentId: "product", quantityPerUnit: 1 }),
    ).toThrow(CircularBomDependencyError);
  });

  it("refuses to release an empty BOM", () => {
    expect(() => draftBom().release()).toThrow(EmptyBomError);
  });

  it("refuses to amend a released BOM", () => {
    const bom = releasedBomWithLine();

    expect(() =>
      bom.addLine({ componentId: "other", quantityPerUnit: 1 }),
    ).toThrow(ImmutableBomError);
    expect(() => bom.removeLine(bom.lines[0]!.id)).toThrow(ImmutableBomError);
    expect(() => bom.clearLines()).toThrow(ImmutableBomError);
  });
});

describe("BillOfMaterials.repointLine (consolidation case A)", () => {
  it("moves a line onto another component, preserving everything else", () => {
    const bom = draftBom();
    bom.addLine({
      componentId: "retired",
      quantityPerUnit: 4,
      unitOfMeasure: "pcs",
      scrapFactorPercent: 5,
      notes: "engineering note",
    });
    const original = bom.lines[0]!;

    bom.repointLine(original.id, "survivor");

    expect(bom.lines).toHaveLength(1);
    const line = bom.lines[0]!;
    // Identity, quantity, unit, scrap factor and notes are all preserved.
    expect(line.id).toBe(original.id);
    expect(line.componentId).toBe("survivor");
    expect(line.quantityPerUnit).toBe(4);
    expect(line.unitOfMeasure).toBe("pcs");
    expect(line.scrapFactorPercent).toBe(5);
    expect(line.notes).toBe("engineering note");
  });

  it("refuses to create a second line for a component already present", () => {
    const bom = draftBom();
    bom.addLine({ componentId: "retired", quantityPerUnit: 1 });
    bom.addLine({ componentId: "survivor", quantityPerUnit: 2 });
    const retiredLine = bom.lines.find((l) => l.componentId === "retired")!;

    expect(() => bom.repointLine(retiredLine.id, "survivor")).toThrow(
      DuplicateBomComponentLineError,
    );
  });

  it("refuses to repoint a line onto the product the BOM builds", () => {
    const bom = draftBom("product");
    bom.addLine({ componentId: "retired", quantityPerUnit: 1 });

    expect(() => bom.repointLine(bom.lines[0]!.id, "product")).toThrow(
      CircularBomDependencyError,
    );
  });

  it("refuses an unknown line id", () => {
    const bom = draftBom();
    bom.addLine({ componentId: "retired", quantityPerUnit: 1 });

    expect(() => bom.repointLine("does-not-exist", "survivor")).toThrow(
      InvalidBomLineQuantityError,
    );
  });

  it("refuses to repoint inside a released BOM", () => {
    const bom = releasedBomWithLine();

    expect(() => bom.repointLine(bom.lines[0]!.id, "survivor")).toThrow(
      ImmutableBomError,
    );
  });
});

describe("BillOfMaterials.combineConsolidatedLine (consolidation case C)", () => {
  function collisionBom() {
    const bom = draftBom();
    bom.addLine({
      componentId: "retired",
      quantityPerUnit: 1,
      scrapFactorPercent: 2,
      notes: "retired note",
    });
    bom.addLine({
      componentId: "survivor",
      quantityPerUnit: 2,
      scrapFactorPercent: 7,
      notes: "survivor note",
    });
    return bom;
  }

  it("collapses two lines into one with the caller-supplied quantity", () => {
    const bom = collisionBom();
    const retiredLine = bom.lines.find((l) => l.componentId === "retired")!;
    const survivorLine = bom.lines.find((l) => l.componentId === "survivor")!;

    bom.combineConsolidatedLine({
      retainedLineId: survivorLine.id,
      absorbedLineId: retiredLine.id,
      // Consolidation computes source + canonical; the aggregate never infers it.
      quantityPerUnit: 3,
      scrapFactorPercent: 7,
    });

    expect(bom.lines).toHaveLength(1);
    const line = bom.lines[0]!;
    expect(line.id).toBe(survivorLine.id);
    expect(line.componentId).toBe("survivor");
    expect(line.quantityPerUnit).toBe(3);
    expect(line.scrapFactorPercent).toBe(7);
  });

  it("keeps both lines' notes rather than dropping one", () => {
    const bom = collisionBom();
    const retiredLine = bom.lines.find((l) => l.componentId === "retired")!;
    const survivorLine = bom.lines.find((l) => l.componentId === "survivor")!;

    bom.combineConsolidatedLine({
      retainedLineId: survivorLine.id,
      absorbedLineId: retiredLine.id,
      quantityPerUnit: 3,
      scrapFactorPercent: 7,
      notes: "survivor note | retired note",
    });

    expect(bom.lines[0]!.notes).toBe("survivor note | retired note");
  });

  it("refuses to combine a line with itself", () => {
    const bom = collisionBom();
    const line = bom.lines[0]!;

    expect(() =>
      bom.combineConsolidatedLine({
        retainedLineId: line.id,
        absorbedLineId: line.id,
        quantityPerUnit: 3,
        scrapFactorPercent: 0,
      }),
    ).toThrow(InvalidBomLineQuantityError);
  });

  it("refuses to combine two lines that are already the same component", () => {
    const bom = draftBom();
    bom.addLine({ componentId: "retired", quantityPerUnit: 1 });
    // A second line for the same component cannot exist through `addLine`, so
    // the guard is exercised on the state the aggregate forbids.
    const line = bom.lines[0]!;
    const duplicate = { ...line, id: "copy" };
    bom.lines.push(duplicate);

    expect(() =>
      bom.combineConsolidatedLine({
        retainedLineId: line.id,
        absorbedLineId: duplicate.id,
        quantityPerUnit: 2,
        scrapFactorPercent: 0,
      }),
    ).toThrow(DuplicateBomComponentLineError);
  });

  it("refuses an unknown retained or absorbed line", () => {
    const bom = collisionBom();
    const line = bom.lines[0]!;

    expect(() =>
      bom.combineConsolidatedLine({
        retainedLineId: "nope",
        absorbedLineId: line.id,
        quantityPerUnit: 3,
        scrapFactorPercent: 0,
      }),
    ).toThrow(InvalidBomLineQuantityError);

    expect(() =>
      bom.combineConsolidatedLine({
        retainedLineId: line.id,
        absorbedLineId: "nope",
        quantityPerUnit: 3,
        scrapFactorPercent: 0,
      }),
    ).toThrow(InvalidBomLineQuantityError);
  });

  it("refuses a non-positive combined quantity", () => {
    const bom = collisionBom();
    const retiredLine = bom.lines.find((l) => l.componentId === "retired")!;
    const survivorLine = bom.lines.find((l) => l.componentId === "survivor")!;

    for (const quantity of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        bom.combineConsolidatedLine({
          retainedLineId: survivorLine.id,
          absorbedLineId: retiredLine.id,
          quantityPerUnit: quantity,
          scrapFactorPercent: 0,
        }),
      ).toThrow(InvalidBomLineQuantityError);
    }
  });

  it("refuses a negative or non-finite scrap factor", () => {
    const bom = collisionBom();
    const retiredLine = bom.lines.find((l) => l.componentId === "retired")!;
    const survivorLine = bom.lines.find((l) => l.componentId === "survivor")!;

    for (const scrap of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        bom.combineConsolidatedLine({
          retainedLineId: survivorLine.id,
          absorbedLineId: retiredLine.id,
          quantityPerUnit: 3,
          scrapFactorPercent: scrap,
        }),
      ).toThrow(InvalidBomLineQuantityError);
    }
  });

  it("refuses to combine inside a released BOM", () => {
    const bom = draftBom();
    bom.addLine({ componentId: "retired", quantityPerUnit: 1 });
    bom.addLine({ componentId: "survivor", quantityPerUnit: 2 });
    bom.release();
    const retiredLine = bom.lines.find((l) => l.componentId === "retired")!;
    const survivorLine = bom.lines.find((l) => l.componentId === "survivor")!;

    expect(() =>
      bom.combineConsolidatedLine({
        retainedLineId: survivorLine.id,
        absorbedLineId: retiredLine.id,
        quantityPerUnit: 3,
        scrapFactorPercent: 0,
      }),
    ).toThrow(ImmutableBomError);
  });

  it("leaves the aggregate releasable after a combine", () => {
    // The combine must not produce a state the BOM invariants reject.
    const bom = collisionBom();
    const retiredLine = bom.lines.find((l) => l.componentId === "retired")!;
    const survivorLine = bom.lines.find((l) => l.componentId === "survivor")!;

    bom.combineConsolidatedLine({
      retainedLineId: survivorLine.id,
      absorbedLineId: retiredLine.id,
      quantityPerUnit: 3,
      scrapFactorPercent: 7,
    });
    bom.release();

    expect(bom.status).toBe("RELEASED");
    expect(bom.lines).toHaveLength(1);
  });
});
