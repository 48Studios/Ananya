import { Inject, Injectable } from '@nestjs/common';
import {
  createInventoryTransaction,
  type CreateInventoryTransactionProps,
  type InventoryTransaction,
  type InventoryTransactionRepository,
  type FindManyInventoryTransactionsOptions,
} from '@ananya/inventory';
import { INVENTORY_TRANSACTION_REPOSITORY } from './inventory-transaction.tokens';
import { assertComponentUsableForNewActivity } from '../components/component-lifecycle.guard';

@Injectable()
export class InventoryTransactionsService {
  constructor(
    @Inject(INVENTORY_TRANSACTION_REPOSITORY)
    private readonly repository: InventoryTransactionRepository,
  ) {}

  async create(
    input: CreateInventoryTransactionProps,
  ): Promise<InventoryTransaction> {
    // A consolidated component must never receive new stock: its balance was
    // moved to the surviving component, so a new entry here would resurrect a
    // retired record and contradict the consolidation record.
    await assertComponentUsableForNewActivity(
      input.componentId,
      'new inventory transactions',
    );

    const tx = createInventoryTransaction(input);
    return this.repository.save(tx);
  }

  async getAll(
    options?: FindManyInventoryTransactionsOptions,
  ): Promise<InventoryTransaction[]> {
    return this.repository.findMany(options);
  }

  async getById(id: string): Promise<InventoryTransaction | null> {
    return this.repository.findById(id);
  }
}
