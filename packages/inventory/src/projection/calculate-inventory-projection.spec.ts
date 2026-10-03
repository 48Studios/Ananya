import { describe, it, expect } from "vitest";
import { InventoryTransaction } from "../ledger/inventory-transaction";
import { CalculateInventoryProjection } from "./calculate-inventory-projection";
import { TransactionType } from "../ledger/transaction-types";

describe("CalculateInventoryProjection", () => {
  it("should accurately calculate on-hand inventory from receipt and issue transactions", () => {
    const tx1 = InventoryTransaction.create({
      componentId: "comp-100",
      quantity: 50,
      unitOfMeasure: "pcs",
      destinationLocationId: "loc-1",
      transactionType: TransactionType.Receipt,
      createdBy: "admin",
    });

    const tx2 = InventoryTransaction.create({
      componentId: "comp-100",
      quantity: 15,
      unitOfMeasure: "pcs",
      sourceLocationId: "loc-1",
      transactionType: TransactionType.Issue,
      createdBy: "admin",
    });

    const projection = CalculateInventoryProjection.execute({
      componentId: "comp-100",
      locationId: "loc-1",
      transactions: [tx1, tx2],
    });

    expect(projection.componentId).toBe("comp-100");
    expect(projection.locationId).toBe("loc-1");
    expect(projection.quantity).toBe(35);
    expect(projection.unitOfMeasure).toBe("pcs");
  });

  it("should count initial stock as an increase so imported opening balances become stock", () => {
    const openingBalance = InventoryTransaction.create({
      componentId: "comp-200",
      quantity: 120,
      unitOfMeasure: "pcs",
      destinationLocationId: "loc-2",
      transactionType: TransactionType.InitialStock,
      createdBy: "SYSTEM_IMPORT",
    });

    const projection = CalculateInventoryProjection.execute({
      componentId: "comp-200",
      locationId: "loc-2",
      transactions: [openingBalance],
    });

    expect(projection.quantity).toBe(120);
  });

  it("should apply manual corrections like adjustments", () => {
    const receipt = InventoryTransaction.create({
      componentId: "comp-300",
      quantity: 40,
      unitOfMeasure: "pcs",
      destinationLocationId: "loc-3",
      transactionType: TransactionType.Receipt,
      createdBy: "admin",
    });

    const correction = InventoryTransaction.create({
      componentId: "comp-300",
      quantity: 5,
      unitOfMeasure: "pcs",
      destinationLocationId: "loc-3",
      transactionType: TransactionType.ManualCorrection,
      createdBy: "admin",
    });

    const projection = CalculateInventoryProjection.execute({
      componentId: "comp-300",
      locationId: "loc-3",
      transactions: [receipt, correction],
    });

    expect(projection.quantity).toBe(45);
  });
});
