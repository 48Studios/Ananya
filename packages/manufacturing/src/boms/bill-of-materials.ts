import { ObjectId } from "@ananya/core";
import {
  EmptyBomError,
  ImmutableBomError,
  InvalidBomLineQuantityError,
  InvalidBomStatusTransitionError,
  DuplicateBomComponentLineError,
  CircularBomDependencyError,
} from "./bill-of-materials.errors";

export type BomStatus = "DRAFT" | "RELEASED" | "OBSOLETE";

export interface BomLineProps {
  id: string;
  bomId: string;
  componentId: string;
  quantityPerUnit: number;
  unitOfMeasure: string;
  scrapFactorPercent: number;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillOfMaterialsProps {
  id: string;
  componentId: string;
  revision: string;
  status: BomStatus;
  notes?: string | null;
  releasedAt?: Date | null;
  lines?: BomLineProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBomInput {
  componentId: string;
  revision?: string;
  notes?: string | null;
}

export interface AddBomLineInput {
  componentId: string;
  quantityPerUnit: number;
  unitOfMeasure?: string;
  scrapFactorPercent?: number;
  notes?: string | null;
}

export class BillOfMaterials {
  public readonly id: string;
  public readonly componentId: string;
  public readonly revision: string;
  public status: BomStatus;
  public notes?: string | null;
  public releasedAt?: Date | null;
  public readonly lines: BomLineProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: BillOfMaterialsProps) {
    this.id = props.id;
    this.componentId = props.componentId;
    this.revision = props.revision;
    this.status = props.status;
    this.notes = props.notes;
    this.releasedAt = props.releasedAt;
    this.lines = props.lines ?? [];
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(input: CreateBomInput): BillOfMaterials {
    const id = ObjectId.generate().value;
    const createdAt = new Date();

    return new BillOfMaterials({
      id,
      componentId: input.componentId,
      revision: input.revision?.trim() || "v1.0",
      status: "DRAFT",
      notes: input.notes?.trim() ?? null,
      releasedAt: null,
      lines: [],
      createdAt,
      updatedAt: createdAt,
    });
  }

  public updateHeader(notes?: string | null): void {
    if (this.status !== "DRAFT") {
      throw new ImmutableBomError();
    }
    this.notes = notes?.trim() ?? null;
    this.updatedAt = new Date();
  }

  public addLine(input: AddBomLineInput): void {
    if (this.status !== "DRAFT") {
      throw new ImmutableBomError();
    }
    if (input.componentId === this.componentId) {
      throw new CircularBomDependencyError(this.componentId);
    }
    if (this.lines.some((l) => l.componentId === input.componentId)) {
      throw new DuplicateBomComponentLineError(input.componentId);
    }
    if (input.quantityPerUnit <= 0) {
      throw new InvalidBomLineQuantityError(
        "Quantity per unit must be greater than zero.",
      );
    }
    if ((input.scrapFactorPercent ?? 0) < 0) {
      throw new InvalidBomLineQuantityError(
        "Scrap factor percent must be non-negative.",
      );
    }

    const lineId = ObjectId.generate().value;
    const now = new Date();

    this.lines.push({
      id: lineId,
      bomId: this.id,
      componentId: input.componentId,
      quantityPerUnit: input.quantityPerUnit,
      unitOfMeasure: input.unitOfMeasure?.trim() || "pcs",
      scrapFactorPercent: input.scrapFactorPercent ?? 0,
      notes: input.notes?.trim() ?? null,
      createdAt: now,
      updatedAt: now,
    });

    this.updatedAt = now;
  }

  public clearLines(): void {
    if (this.status !== "DRAFT") {
      throw new ImmutableBomError();
    }
    this.lines.length = 0;
    this.updatedAt = new Date();
  }

  /**
   * Moves an existing line onto a different component, preserving the line id
   * and every other attribute.
   *
   * Used by component consolidation when only the retired component appears in
   * this BOM: the line keeps its identity, quantity and scrap factor, and now
   * consumes the canonical component instead.
   *
   * The two invariants that make a BOM meaningful are re-checked here rather
   * than assumed by the caller:
   *
   *  - a BOM may not consume the product it builds (circular dependency),
   *  - a BOM may not contain two lines for the same component.
   */
  public repointLine(lineId: string, newComponentId: string): void {
    if (this.status !== "DRAFT") {
      throw new ImmutableBomError();
    }

    const line = this.lines.find((l) => l.id === lineId);
    if (!line) {
      throw new InvalidBomLineQuantityError(
        `BOM line '${lineId}' does not exist on this BOM.`,
      );
    }

    if (newComponentId === this.componentId) {
      throw new CircularBomDependencyError(this.componentId);
    }

    if (
      this.lines.some(
        (l) => l.id !== lineId && l.componentId === newComponentId,
      )
    ) {
      throw new DuplicateBomComponentLineError(newComponentId);
    }

    line.componentId = newComponentId;
    line.updatedAt = new Date();
    this.updatedAt = line.updatedAt;
  }

  /**
   * Collapses two lines that describe components being consolidated into one.
   *
   * This is the case where a BOM contains both the component being retired and
   * the component surviving. The domain forbids two lines for the same
   * component, so once the retirement completes the two lines would be illegal;
   * one must absorb the other. The absorbed line is removed and the retained line
   * takes the combined quantity and the resolved scrap factor.
   *
   * Quantities are never inferred: consolidation computes `source + canonical`
   * and passes the result, and the scrap factor comes from the reviewer because
   * there is no defensible automatic choice between two different values.
   *
   * Invariants enforced here: the BOM must still be editable (DRAFT), both lines
   * must exist on this BOM, they must be DIFFERENT lines for DIFFERENT components
   * (the merge only makes sense when two components become one — the
   * "same component twice" state is already impossible because `addLine` forbids
   * it), the resulting quantity must be positive, and the resulting scrap factor
   * must be non-negative.
   */
  public combineConsolidatedLine(input: {
    retainedLineId: string;
    absorbedLineId: string;
    quantityPerUnit: number;
    scrapFactorPercent: number;
    notes?: string | null;
  }): void {
    if (this.status !== "DRAFT") {
      throw new ImmutableBomError();
    }

    if (input.retainedLineId === input.absorbedLineId) {
      throw new InvalidBomLineQuantityError(
        "A BOM line cannot absorb itself.",
      );
    }

    const retained = this.lines.find((l) => l.id === input.retainedLineId);
    if (!retained) {
      throw new InvalidBomLineQuantityError(
        `BOM line '${input.retainedLineId}' does not exist on this BOM.`,
      );
    }

    const absorbed = this.lines.find((l) => l.id === input.absorbedLineId);
    if (!absorbed) {
      throw new InvalidBomLineQuantityError(
        `BOM line '${input.absorbedLineId}' does not exist on this BOM.`,
      );
    }

    if (retained.componentId === absorbed.componentId) {
      throw new DuplicateBomComponentLineError(retained.componentId);
    }

    if (!Number.isFinite(input.quantityPerUnit) || input.quantityPerUnit <= 0) {
      throw new InvalidBomLineQuantityError(
        "Combined quantity per unit must be greater than zero.",
      );
    }

    if (
      !Number.isFinite(input.scrapFactorPercent) ||
      input.scrapFactorPercent < 0
    ) {
      throw new InvalidBomLineQuantityError(
        "Scrap factor percent must be non-negative.",
      );
    }

    const absorbedIndex = this.lines.findIndex(
      (l) => l.id === input.absorbedLineId,
    );
    this.lines.splice(absorbedIndex, 1);

    retained.quantityPerUnit = input.quantityPerUnit;
    retained.scrapFactorPercent = input.scrapFactorPercent;
    if (input.notes !== undefined) {
      retained.notes = input.notes;
    }
    retained.updatedAt = new Date();
    this.updatedAt = retained.updatedAt;
  }

  public removeLine(lineId: string): void {
    if (this.status !== "DRAFT") {
      throw new ImmutableBomError();
    }
    const idx = this.lines.findIndex((l) => l.id === lineId);
    if (idx >= 0) {
      this.lines.splice(idx, 1);
      this.updatedAt = new Date();
    }
  }

  public duplicate(newRevision?: string): BillOfMaterials {
    const nextRev = newRevision?.trim() || this.getNextRevisionNumber();
    const newBom = BillOfMaterials.create({
      componentId: this.componentId,
      revision: nextRev,
      notes: `Duplicated from ${this.revision}. ${this.notes || ""}`.trim(),
    });

    for (const l of this.lines) {
      newBom.addLine({
        componentId: l.componentId,
        quantityPerUnit: l.quantityPerUnit,
        unitOfMeasure: l.unitOfMeasure,
        scrapFactorPercent: l.scrapFactorPercent,
        notes: l.notes,
      });
    }

    return newBom;
  }

  private getNextRevisionNumber(): string {
    const match = /^v?(\d+)\.(\d+)$/i.exec(this.revision);
    if (match && match[1] && match[2]) {
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10) + 1;
      return `v${major}.${minor}`;
    }
    return `${this.revision}-rev`;
  }

  public release(): void {
    if (this.status !== "DRAFT") {
      throw new InvalidBomStatusTransitionError(this.status, "RELEASED");
    }
    if (this.lines.length === 0) {
      throw new EmptyBomError();
    }
    this.status = "RELEASED";
    this.releasedAt = new Date();
    this.updatedAt = new Date();
  }

  public obsolete(): void {
    if (this.status !== "RELEASED") {
      throw new InvalidBomStatusTransitionError(this.status, "OBSOLETE");
    }
    this.status = "OBSOLETE";
    this.updatedAt = new Date();
  }

  public static rehydrate(props: BillOfMaterialsProps): BillOfMaterials {
    return new BillOfMaterials(props);
  }
}
