import type { InventoryTransactionRepository } from "../ledger/inventory-transaction.repository";
import type { InventoryProjectionRepository } from "./inventory-projection.repository";
import type { InventoryTransaction } from "../ledger/inventory-transaction";
import { CalculateInventoryProjection } from "./calculate-inventory-projection";

export interface RebuildInventoryProjectionsProps {
  transactionRepository: InventoryTransactionRepository;
  projectionRepository: InventoryProjectionRepository;
}

export class RebuildInventoryProjections {
  constructor(
    private readonly transactionRepository: InventoryTransactionRepository,
    private readonly projectionRepository: InventoryProjectionRepository,
  ) {}

  async execute(): Promise<void> {
    // Get all transactions
    const transactions = await this.transactionRepository.findMany();

    // Group transactions by component and collect all unique location pairs
    const transactionsByComponent = new Map<string, InventoryTransaction[]>();
    const componentLocationPairs = new Set<string>();

    for (const transaction of transactions) {
      if (!transactionsByComponent.has(transaction.componentId)) {
        transactionsByComponent.set(transaction.componentId, []);
      }
      transactionsByComponent.get(transaction.componentId)?.push(transaction);

      if (transaction.sourceLocationId) {
        componentLocationPairs.add(
          `${transaction.componentId}:::${transaction.sourceLocationId}`,
        );
      }
      if (transaction.destinationLocationId) {
        componentLocationPairs.add(
          `${transaction.componentId}:::${transaction.destinationLocationId}`,
        );
      }
    }

    // For each unique component/location pair, calculate the projection
    for (const pair of componentLocationPairs) {
      const [componentId, locationId] = pair.split(":::");
      if (!componentId || !locationId) continue;

      const compTransactions = transactionsByComponent.get(componentId) || [];

      try {
        const projection = CalculateInventoryProjection.execute({
          componentId,
          locationId,
          transactions: compTransactions,
        });

        // Save the projection
        await this.projectionRepository.save(projection);
      } catch (error) {
        console.error(
          `Failed to calculate projection for component ${componentId} at location ${locationId}:`,
          error,
        );
      }
    }
  }
}
