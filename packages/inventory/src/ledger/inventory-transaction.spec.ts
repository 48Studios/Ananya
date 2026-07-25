import { describe, it, expect } from "vitest";
import { InventoryTransaction } from "./inventory-transaction";
import { TransactionType } from "./transaction-types";
import {
  InvalidQuantityError,
  InvalidLocationError,
} from "./inventory-transaction.errors";

describe("InventoryTransaction aggregate", () => {
  it("should create a valid Receipt transaction", () => {
    const tx = InventoryTransaction.create({
      componentId: "comp-1",
      quantity: 100,
      unitOfMeasure: "piece",
      destinationLocationId: "loc-1",
      transactionType: TransactionType.Receipt,
      createdBy: "user-1",
    });

    expect(tx.id).toBeDefined();
    expect(tx.componentId).toBe("comp-1");
    expect(tx.quantity).toBe(100);
    expect(tx.unitOfMeasure).toBe("piece");
    expect(tx.destinationLocationId).toBe("loc-1");
    expect(tx.sourceLocationId).toBeUndefined();
    expect(tx.transactionType).toBe(TransactionType.Receipt);
  });

  it("should throw InvalidQuantityError when quantity is zero or negative", () => {
    expect(() =>
      InventoryTransaction.create({
        componentId: "comp-1",
        quantity: 0,
        unitOfMeasure: "piece",
        destinationLocationId: "loc-1",
        transactionType: TransactionType.Receipt,
        createdBy: "user-1",
      }),
    ).toThrow("Quantity must be greater than zero");
  });

  it("should enforce Transfer transaction location invariants", () => {
    expect(() =>
      InventoryTransaction.create({
        componentId: "comp-1",
        quantity: 10,
        unitOfMeasure: "piece",
        sourceLocationId: "loc-1",
        destinationLocationId: "loc-1",
        transactionType: TransactionType.Transfer,
        createdBy: "user-1",
      }),
    ).toThrow("Source and destination locations cannot be identical for transfer");
  });
});
