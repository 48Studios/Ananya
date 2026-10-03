import { InventoryTransaction } from "../ledger/inventory-transaction";
import { InventoryProjection } from "./inventory-projection";
import { TransactionType } from "../ledger/transaction-types";

export interface CalculateInventoryProjectionProps {
  componentId: string;
  locationId: string;
  transactions: InventoryTransaction[];
}

export class CalculateInventoryProjection {
  static execute({
    componentId,
    locationId,
    transactions,
  }: CalculateInventoryProjectionProps): InventoryProjection {
    // Filter transactions for this component and location
    const relevantTransactions = transactions.filter(
      (transaction) =>
        transaction.componentId === componentId &&
        (transaction.sourceLocationId === locationId ||
          transaction.destinationLocationId === locationId),
    );

    // Sort transactions by timestamp
    relevantTransactions.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );

    // Calculate cumulative quantity
    let totalQuantity = 0;

    for (const transaction of relevantTransactions) {
      const quantity = transaction.quantity;
      const transactionType = transaction.transactionType;

      // Determine the effect of this transaction on inventory
      switch (transactionType) {
        case TransactionType.Receipt:
        case TransactionType.Return:
        case TransactionType.Production:
        case TransactionType.InitialStock:
          // These increase inventory
          totalQuantity += quantity;
          break;

        case TransactionType.Issue:
        case TransactionType.Consumption:
          // These decrease inventory
          totalQuantity -= quantity;
          break;

        case TransactionType.Transfer:
          // For transfers, we need to consider source and destination
          if (transaction.sourceLocationId === locationId) {
            // Transfer out decreases inventory
            totalQuantity -= quantity;
          } else if (transaction.destinationLocationId === locationId) {
            // Transfer in increases inventory
            totalQuantity += quantity;
          }
          // If neither source nor destination is our location, no change
          break;

        case TransactionType.Adjustment:
        case TransactionType.ManualCorrection:
          // Adjustments and manual corrections can be positive or negative
          totalQuantity += quantity;
          break;

        default:
          // Unknown transaction type - do nothing
          break;
      }
    }

    const unitOfMeasure =
      relevantTransactions[0]?.unitOfMeasure ??
      transactions[0]?.unitOfMeasure ??
      "";

    // Create a new projection with the calculated quantity
    const projection = InventoryProjection.createFromTransaction(
      componentId,
      locationId,
      totalQuantity,
      unitOfMeasure,
      "Calculated",
      new Date(),
    );

    return projection;
  }
}
