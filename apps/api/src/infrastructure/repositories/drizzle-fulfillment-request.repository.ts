import { db } from '@ananya/database';
import {
  fulfillmentRequests,
  fulfillmentRequestLines,
} from '@ananya/database/schema';
import { eq, desc, count } from '@ananya/database/query';
import type {
  FulfillmentRequestRecord,
  FulfillmentRequestLineRecord,
} from '@ananya/database/schema';
import {
  FulfillmentRequest,
  type FulfillmentRequestRepository,
  type FulfillmentStatus,
  type FindManyFulfillmentRequestsOptions,
} from '@ananya/sales';

function toDomain(
  row: FulfillmentRequestRecord,
  lines: FulfillmentRequestLineRecord[] = [],
): FulfillmentRequest {
  return FulfillmentRequest.rehydrate({
    id: row.id,
    requestNumber: row.requestNumber,
    salesOrderId: row.salesOrderId,
    warehouseId: row.warehouseId,
    status: row.status as FulfillmentStatus,
    carrierName: row.carrierName,
    trackingNumber: row.trackingNumber,
    shippedAt: row.shippedAt,
    deliveredAt: row.deliveredAt,
    lines: lines.map((l) => ({
      id: l.id,
      fulfillmentRequestId: l.fulfillmentRequestId,
      salesOrderLineId: l.salesOrderLineId,
      componentId: l.componentId,
      requestedQuantity: parseFloat(l.requestedQuantity),
      fulfilledQuantity: parseFloat(l.fulfilledQuantity),
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleFulfillmentRequestRepository implements FulfillmentRequestRepository {
  async findById(id: string): Promise<FulfillmentRequest | null> {
    const [row] = await db
      .select()
      .from(fulfillmentRequests)
      .where(eq(fulfillmentRequests.id, id))
      .limit(1);
    if (!row) return null;
    const lines = await db
      .select()
      .from(fulfillmentRequestLines)
      .where(eq(fulfillmentRequestLines.fulfillmentRequestId, id));
    return toDomain(row, lines);
  }

  async findByRequestNumber(
    requestNumber: string,
  ): Promise<FulfillmentRequest | null> {
    const [row] = await db
      .select()
      .from(fulfillmentRequests)
      .where(eq(fulfillmentRequests.requestNumber, requestNumber.toUpperCase()))
      .limit(1);
    if (!row) return null;
    const lines = await db
      .select()
      .from(fulfillmentRequestLines)
      .where(eq(fulfillmentRequestLines.fulfillmentRequestId, row.id));
    return toDomain(row, lines);
  }

  async findMany(
    options?: FindManyFulfillmentRequestsOptions,
  ): Promise<FulfillmentRequest[]> {
    const query = db.select().from(fulfillmentRequests);
    if (options?.salesOrderId) {
      query.where(eq(fulfillmentRequests.salesOrderId, options.salesOrderId));
    }
    if (options?.warehouseId) {
      query.where(eq(fulfillmentRequests.warehouseId, options.warehouseId));
    }
    if (options?.status) {
      query.where(eq(fulfillmentRequests.status, options.status));
    }
    const rows = await query.orderBy(desc(fulfillmentRequests.createdAt));
    return Promise.all(
      rows.map(async (row) => {
        const lines = await db
          .select()
          .from(fulfillmentRequestLines)
          .where(eq(fulfillmentRequestLines.fulfillmentRequestId, row.id));
        return toDomain(row, lines);
      }),
    );
  }

  async save(request: FulfillmentRequest): Promise<void> {
    await db
      .insert(fulfillmentRequests)
      .values({
        id: request.id,
        requestNumber: request.requestNumber,
        salesOrderId: request.salesOrderId,
        warehouseId: request.warehouseId,
        status: request.status,
        carrierName: request.carrierName ?? null,
        trackingNumber: request.trackingNumber ?? null,
        shippedAt: request.shippedAt ?? null,
        deliveredAt: request.deliveredAt ?? null,
      })
      .onConflictDoUpdate({
        target: fulfillmentRequests.id,
        set: {
          status: request.status,
          carrierName: request.carrierName ?? null,
          trackingNumber: request.trackingNumber ?? null,
          shippedAt: request.shippedAt ?? null,
          deliveredAt: request.deliveredAt ?? null,
          updatedAt: new Date(),
        },
      });

    for (const line of request.lines) {
      await db
        .insert(fulfillmentRequestLines)
        .values({
          id: line.id,
          fulfillmentRequestId: request.id,
          salesOrderLineId: line.salesOrderLineId,
          componentId: line.componentId,
          requestedQuantity: line.requestedQuantity.toString(),
          fulfilledQuantity: line.fulfilledQuantity.toString(),
        })
        .onConflictDoUpdate({
          target: fulfillmentRequestLines.id,
          set: {
            requestedQuantity: line.requestedQuantity.toString(),
            fulfilledQuantity: line.fulfilledQuantity.toString(),
            updatedAt: new Date(),
          },
        });
    }
  }

  async generateNextRequestNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db
      .select({ count: count() })
      .from(fulfillmentRequests);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `FUL-${year}-${num}`;
  }
}
