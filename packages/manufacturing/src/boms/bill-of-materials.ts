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
