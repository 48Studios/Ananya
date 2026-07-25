import { db } from '@ananya/database';
import {
  productionOrders,
  productionOrderOperations,
} from '@ananya/database/schema';
import { eq, desc, count } from '@ananya/database/query';
import type {
  ProductionOrderRecord,
  ProductionOrderOperationRecord,
} from '@ananya/database/schema';
import {
  ProductionOrder,
  type ProductionOrderRepository,
  type ProductionOrderStatus,
  type FindManyProductionOrdersOptions,
} from '@ananya/manufacturing';

function toDomain(
  row: ProductionOrderRecord,
  operations: ProductionOrderOperationRecord[] = [],
): ProductionOrder {
  return ProductionOrder.rehydrate({
    id: row.id,
    productionNumber: row.productionNumber,
    bomId: row.bomId,
    componentId: row.componentId,
    status: row.status as ProductionOrderStatus,
    quantityPlanned: row.quantityPlanned,
    quantityCompleted: row.quantityCompleted,
    quantityScrapped: row.quantityScrapped,
    startDate: row.startDate,
    endDate: row.endDate,
    operations: operations.map((o) => ({
      id: o.id,
      productionOrderId: o.productionOrderId,
      operationName: o.operationName,
      sequence: o.sequence,
      status: o.status,
      completedAt: o.completedAt,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleProductionOrderRepository implements ProductionOrderRepository {
  async findById(id: string): Promise<ProductionOrder | null> {
    const [row] = await db
      .select()
      .from(productionOrders)
      .where(eq(productionOrders.id, id))
      .limit(1);
    if (!row) return null;
    const ops = await db
      .select()
      .from(productionOrderOperations)
      .where(eq(productionOrderOperations.productionOrderId, id));
    return toDomain(row, ops);
  }

  async findByProductionNumber(
    productionNumber: string,
  ): Promise<ProductionOrder | null> {
    const [row] = await db
      .select()
      .from(productionOrders)
      .where(
        eq(productionOrders.productionNumber, productionNumber.toUpperCase()),
      )
      .limit(1);
    if (!row) return null;
    const ops = await db
      .select()
      .from(productionOrderOperations)
      .where(eq(productionOrderOperations.productionOrderId, row.id));
    return toDomain(row, ops);
  }

  async findMany(
    options?: FindManyProductionOrdersOptions,
  ): Promise<ProductionOrder[]> {
    const query = db.select().from(productionOrders);
    if (options?.componentId) {
      query.where(eq(productionOrders.componentId, options.componentId));
    }
    if (options?.bomId) {
      query.where(eq(productionOrders.bomId, options.bomId));
    }
    if (options?.status) {
      query.where(eq(productionOrders.status, options.status));
    }
    const rows = await query.orderBy(desc(productionOrders.createdAt));
    return Promise.all(
      rows.map(async (row) => {
        const ops = await db
          .select()
          .from(productionOrderOperations)
          .where(eq(productionOrderOperations.productionOrderId, row.id));
        return toDomain(row, ops);
      }),
    );
  }

  async save(order: ProductionOrder): Promise<void> {
    await db
      .insert(productionOrders)
      .values({
        id: order.id,
        productionNumber: order.productionNumber,
        bomId: order.bomId,
        componentId: order.componentId,
        status: order.status,
        quantityPlanned: order.quantityPlanned,
        quantityCompleted: order.quantityCompleted,
        quantityScrapped: order.quantityScrapped,
        startDate: order.startDate ?? null,
        endDate: order.endDate ?? null,
      })
      .onConflictDoUpdate({
        target: productionOrders.id,
        set: {
          status: order.status,
          quantityCompleted: order.quantityCompleted,
          quantityScrapped: order.quantityScrapped,
          startDate: order.startDate ?? null,
          endDate: order.endDate ?? null,
          updatedAt: new Date(),
        },
      });

    for (const op of order.operations) {
      await db
        .insert(productionOrderOperations)
        .values({
          id: op.id,
          productionOrderId: order.id,
          operationName: op.operationName,
          sequence: op.sequence,
          status: op.status,
          completedAt: op.completedAt ?? null,
        })
        .onConflictDoUpdate({
          target: productionOrderOperations.id,
          set: {
            status: op.status,
            completedAt: op.completedAt ?? null,
            updatedAt: new Date(),
          },
        });
    }
  }

  async generateNextProductionNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db.select({ count: count() }).from(productionOrders);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `MO-${year}-${num}`;
  }
}
