import { ObjectId } from "@ananya/core";
import {
  InvalidComponentSkuError,
  InvalidComponentNameError,
  InvalidUnitError,
  ComponentConsolidatedError,
  InvalidConsolidationTargetError,
  ComponentAlreadyConsolidatedError,
} from "./component.errors";

/**
 * The formal component lifecycle.
 *
 * This is derived from persisted state rather than stored as a second column, so
 * there is exactly one source of truth:
 *
 *  - ACTIVE:       `isActive = true`,  `consolidatedIntoComponentId = null`
 *  - CONSOLIDATED: `isActive = false`, `consolidatedIntoComponentId = <canonical>`
 *
 * `isActive` is retained because it already gates selection across the
 * application; consolidation formalizes the meaning of "inactive" for records
 * that were retired by a merge rather than manually deactivated.
 */
export type ComponentConsolidationState = "ACTIVE" | "CONSOLIDATED";

export interface ComponentProps {
  id: string;
  sku: string;
  manufacturerPartNumber?: string | null;
  name: string;
  description?: string | null;
  manufacturerId?: string | null;
  categoryId?: string | null;
  defaultLocationId?: string | null;
  unit: string;
  isActive: boolean;
  consolidatedIntoComponentId?: string | null;
  consolidationId?: string | null;
  consolidatedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateComponentInput {
  sku?: string;
  manufacturerPartNumber?: string | null;
  name: string;
  description?: string | null;
  manufacturerId?: string | null;
  categoryId?: string | null;
  defaultLocationId?: string | null;
  unit: string;
}

export interface UpdateComponentInput {
  name?: string;
  manufacturerPartNumber?: string | null;
  description?: string | null;
  manufacturerId?: string | null;
  categoryId?: string | null;
  defaultLocationId?: string | null;
  unit?: string;
  isActive?: boolean;
}

export interface RetireAsConsolidatedInput {
  /** The component that survives. Must be a different, active component. */
  canonicalComponentId: string;
  /** The consolidation operation that retires this component. */
  consolidationId: string;
  /** When the retirement happened. Defaults to now. */
  consolidatedAt?: Date;
}

export interface FindManyComponentsOptions {}

export class Component {
  public readonly id: string;
  public readonly sku: string;
  public readonly manufacturerPartNumber?: string | null;
  public readonly name: string;
  public readonly description?: string | null;
  public readonly manufacturerId?: string | null;
  public readonly categoryId?: string | null;
  public readonly defaultLocationId?: string | null;
  public readonly unit: string;
  public readonly isActive: boolean;
  public readonly consolidatedIntoComponentId: string | null;
  public readonly consolidationId: string | null;
  public readonly consolidatedAt: Date | null;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  private constructor(props: ComponentProps) {
    this.id = props.id;
    this.sku = props.sku;
    this.manufacturerPartNumber = props.manufacturerPartNumber;
    this.name = props.name;
    this.description = props.description;
    this.manufacturerId = props.manufacturerId;
    this.categoryId = props.categoryId;
    this.defaultLocationId = props.defaultLocationId;
    this.unit = props.unit;
    this.isActive = props.isActive;
    this.consolidatedIntoComponentId =
      props.consolidatedIntoComponentId ?? null;
    this.consolidationId = props.consolidationId ?? null;
    this.consolidatedAt = props.consolidatedAt ?? null;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /**
   * Creates a new Component aggregate.
   * Owns identity generation, timestamps, defaults, normalization, and invariants.
   */
  public static create(input: CreateComponentInput): Component {
    const sku = input.sku?.trim()?.toUpperCase() ?? "";
    const name = input.name.trim();
    const unit = input.unit.trim();

    if (!sku) {
      throw new InvalidComponentSkuError("SKU is required");
    }

    if (!name) {
      throw new InvalidComponentNameError("Name is required");
    }

    if (!unit) {
      throw new InvalidUnitError("Unit is required");
    }

    const id = ObjectId.generate().value;
    const createdAt = new Date();
    const updatedAt = createdAt;

    return new Component({
      id,
      sku,
      manufacturerPartNumber: input.manufacturerPartNumber?.trim() || null,
      name,
      description: input.description?.trim() ?? null,
      manufacturerId: input.manufacturerId ?? null,
      categoryId: input.categoryId ?? null,
      defaultLocationId: input.defaultLocationId ?? null,
      unit,
      isActive: true,
      consolidatedIntoComponentId: null,
      consolidationId: null,
      consolidatedAt: null,
      createdAt,
      updatedAt,
    });
  }

  /** The formal lifecycle state, derived from persisted fields. */
  public get consolidationState(): ComponentConsolidationState {
    return this.consolidatedIntoComponentId ? "CONSOLIDATED" : "ACTIVE";
  }

  /** True when this component was retired by a consolidation. */
  public get isConsolidated(): boolean {
    return this.consolidatedIntoComponentId !== null;
  }

  /**
   * Updates component properties maintaining invariants.
   *
   * A consolidated component may not be edited: its master data now belongs to
   * the canonical record, and allowing edits here would let the two records
   * drift apart again after the reviewer explicitly merged them.
   */
  public update(input: UpdateComponentInput): Component {
    this.assertCanModifyMasterData();

    const name = input.name !== undefined ? input.name.trim() : this.name;
    const unit = input.unit !== undefined ? input.unit.trim() : this.unit;

    if (!name) {
      throw new InvalidComponentNameError("Name is required");
    }

    if (!unit) {
      throw new InvalidUnitError("Unit is required");
    }

    return new Component({
      id: this.id,
      sku: this.sku,
      manufacturerPartNumber:
        input.manufacturerPartNumber !== undefined
          ? input.manufacturerPartNumber?.trim() || null
          : this.manufacturerPartNumber,
      name,
      description:
        input.description !== undefined
          ? (input.description?.trim() ?? null)
          : this.description,
      manufacturerId:
        input.manufacturerId !== undefined
          ? input.manufacturerId
          : this.manufacturerId,
      categoryId:
        input.categoryId !== undefined ? input.categoryId : this.categoryId,
      defaultLocationId:
        input.defaultLocationId !== undefined
          ? input.defaultLocationId
          : this.defaultLocationId,
      unit,
      isActive: input.isActive !== undefined ? input.isActive : this.isActive,
      consolidatedIntoComponentId: this.consolidatedIntoComponentId,
      consolidationId: this.consolidationId,
      consolidatedAt: this.consolidatedAt,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  /**
   * Retires this component as consolidated into a canonical component.
   *
   * The component is NOT deleted. It becomes CONSOLIDATED:
   * `isActive = false`, `consolidatedIntoComponentId = canonical`, and it keeps
   * its identity, SKU, history and every foreign key that points at it.
   *
   * Refuses self-consolidation and double consolidation. It cannot check whether
   * the canonical component exists or is active — that requires persistence — so
   * the consolidation domain service performs those checks inside the
   * transaction before calling this method.
   */
  public retireAsConsolidated(input: RetireAsConsolidatedInput): Component {
    if (input.canonicalComponentId === this.id) {
      throw new InvalidConsolidationTargetError(
        `Component '${this.sku}' cannot be consolidated into itself.`,
      );
    }

    if (this.consolidatedIntoComponentId) {
      throw new ComponentAlreadyConsolidatedError(
        this.id,
        this.consolidatedIntoComponentId,
      );
    }

    const consolidatedAt = input.consolidatedAt ?? new Date();

    return new Component({
      id: this.id,
      sku: this.sku,
      manufacturerPartNumber: this.manufacturerPartNumber,
      name: this.name,
      description: this.description,
      manufacturerId: this.manufacturerId,
      categoryId: this.categoryId,
      defaultLocationId: this.defaultLocationId,
      unit: this.unit,
      isActive: false,
      consolidatedIntoComponentId: input.canonicalComponentId,
      consolidationId: input.consolidationId,
      consolidatedAt,
      createdAt: this.createdAt,
      updatedAt: consolidatedAt,
    });
  }

  /**
   * Guards operations that move inventory for this component.
   *
   * A consolidated component must never receive new ledger entries: its
   * balances were moved to the canonical component, so a new transaction would
   * resurrect a retired record and make the two balances disagree with the
   * consolidation record.
   */
  public assertCanCreateTransaction(): void {
    if (this.consolidatedIntoComponentId) {
      throw new ComponentConsolidatedError(
        this.id,
        `Component '${this.sku}' was consolidated into another component and cannot receive new inventory transactions.`,
        this.consolidatedIntoComponentId,
      );
    }
  }

  /**
   * Guards operations that change component master data.
   *
   * A manually deactivated component may still be edited (it can be reactivated
   * or corrected), but a consolidated one may not: it is a historical pointer to
   * its canonical replacement.
   */
  public assertCanModifyMasterData(): void {
    if (this.consolidatedIntoComponentId) {
      throw new ComponentConsolidatedError(
        this.id,
        `Component '${this.sku}' was consolidated into another component and can no longer be edited.`,
        this.consolidatedIntoComponentId,
      );
    }
  }

  /**
   * Guards hard deletion. A consolidated component is the historical record of
   * where its activity went, so it may never be removed.
   */
  public assertCanBeDeleted(): void {
    if (this.consolidatedIntoComponentId) {
      throw new ComponentConsolidatedError(
        this.id,
        `Component '${this.sku}' was consolidated into another component and cannot be deleted.`,
        this.consolidatedIntoComponentId,
      );
    }
  }

  /**
   * Rehydrates an existing Component from persistence.
   */
  public static rehydrate(props: ComponentProps): Component {
    return new Component(props);
  }
}

