import { ObjectId } from "@ananya/core";
import type {
  InventoryTransactionProps,
  CreateInventoryTransactionProps,
} from "./inventory-transaction.types";
import type { TransactionType } from "./transaction-types";
import {
  TRANSACTION_TYPES,
  TransactionType as TransactionTypeEnum,
} from "./transaction-types";
import {
  InvalidQuantityError,
  InvalidTransactionTypeError,
  InvalidLocationError,
} from "./inventory-transaction.errors";

// Helper function to ensure exhaustive switch statements
function assertNever(value: never): never {
  throw new Error(`Unhandled transaction type: ${value}`);
}

export class InventoryTransaction {
  public readonly id: string;
  public readonly componentId: string;
  public readonly quantity: number;
  public readonly unitOfMeasure: string;
  public readonly sourceLocationId?: string;
  public readonly destinationLocationId?: string;
  public readonly transactionType: TransactionType;
  public readonly reference?: string;
  public readonly reason?: string;
  public readonly createdBy: string;
  public readonly createdAt: Date;

  private constructor(props: InventoryTransactionProps) {
    this.id = props.id;
    this.componentId = props.componentId;
    this.quantity = props.quantity;
    this.unitOfMeasure = props.unitOfMeasure;
    this.sourceLocationId = props.sourceLocationId;
    this.destinationLocationId = props.destinationLocationId;
    this.transactionType = props.transactionType;
    this.reference = props.reference;
    this.reason = props.reason;
    this.createdBy = props.createdBy;
    this.createdAt = props.createdAt;
  }

  /**
   * Creates a new InventoryTransaction aggregate.
   * Owns identity generation, timestamps, defaults, normalization, and invariants.
   */
  public static create(
    input: CreateInventoryTransactionProps,
  ): InventoryTransaction {
    // Validate quantity
    if (input.quantity <= 0) {
      throw new InvalidQuantityError("Quantity must be greater than zero");
    }

    // Validate transaction type using single source of truth
    if (!TRANSACTION_TYPES.includes(input.transactionType)) {
      throw new InvalidTransactionTypeError("Invalid transaction type");
    }

    // Validate component
    if (!input.componentId || input.componentId.trim() === "") {
      throw new InvalidLocationError("Component ID is required");
    }

    // Validate locations based on transaction type using exhaustive switch
    switch (input.transactionType) {
      case TransactionTypeEnum.Receipt:
        if (input.sourceLocationId) {
          throw new InvalidLocationError(
            "Receipt transactions may not have a source location",
          );
        }
        break;

      case TransactionTypeEnum.Issue:
        if (input.destinationLocationId) {
          throw new InvalidLocationError(
            "Issue transactions may not have a destination location",
          );
        }
        break;

      case TransactionTypeEnum.Transfer:
        if (!input.sourceLocationId) {
          throw new InvalidLocationError(
            "Transfer transactions require a source location",
          );
        }
        if (!input.destinationLocationId) {
          throw new InvalidLocationError(
            "Transfer transactions require a destination location",
          );
        }
        if (input.sourceLocationId === input.destinationLocationId) {
          throw new InvalidLocationError(
            "Source and destination locations cannot be identical for transfer",
          );
        }
        break;

      case TransactionTypeEnum.Adjustment:
        if (!input.sourceLocationId && !input.destinationLocationId) {
          throw new InvalidLocationError(
            "Adjustment transactions require at least one location",
          );
        }
        break;

      case TransactionTypeEnum.Return:
        // Return transactions can have either source or destination location
        break;

      case TransactionTypeEnum.Consumption:
        // Consumption transactions can have either source or destination location
        break;

      case TransactionTypeEnum.Production:
        // Production transactions can have either source or destination location
        break;

      case TransactionTypeEnum.ManualCorrection:
        // Manual correction can have either source or destination location
        break;

      case TransactionTypeEnum.InitialStock:
        // Initial stock transactions have destination location
        break;

      default:
        assertNever(input.transactionType);
    }

    // Generate identity and timestamps - factory owns these
    const id = ObjectId.generate().value;
    const createdAt = new Date();

    return new InventoryTransaction({
      id,
      componentId: input.componentId,
      quantity: input.quantity,
      unitOfMeasure: input.unitOfMeasure,
      sourceLocationId: input.sourceLocationId,
      destinationLocationId: input.destinationLocationId,
      transactionType: input.transactionType,
      reference: input.reference,
      reason: input.reason,
      createdBy: input.createdBy,
      createdAt,
    });
  }

  /**
   * Rehydrates an existing InventoryTransaction from persistence.
   * Reconstructs state exactly as stored without validation or normalization.
   * Used only by repositories when loading from the database.
   */
  public static rehydrate(
    props: InventoryTransactionProps,
  ): InventoryTransaction {
    return new InventoryTransaction(props);
  }
}
