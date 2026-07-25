import { db } from '@ananya/database';
import { rmaRequests } from '@ananya/database/schema';
import { eq, desc, count, ilike } from '@ananya/database/query';
import type { RmaRequestRecord } from '@ananya/database/schema';
import {
  RmaRequest,
  type RmaRequestRepository,
  type RmaStatus,
  type RmaDisposition,
  type FindManyRmaRequestsOptions,
} from '@ananya/service';

function toDomain(row: RmaRequestRecord): RmaRequest {
  return RmaRequest.rehydrate({
    id: row.id,
    rmaNumber: row.rmaNumber,
    customerId: row.customerId,
    salesOrderId: row.salesOrderId ?? undefined,
    itemDescription: row.itemDescription,
    serialNumber: row.serialNumber ?? undefined,
    reason: row.reason,
    status: row.status as RmaStatus,
    disposition: (row.disposition as RmaDisposition) ?? undefined,
    inspectionNotes: row.inspectionNotes ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleRmaRequestRepository implements RmaRequestRepository {
  async findById(id: string): Promise<RmaRequest | null> {
    const [row] = await db
      .select()
      .from(rmaRequests)
      .where(eq(rmaRequests.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByNumber(rmaNumber: string): Promise<RmaRequest | null> {
    const [row] = await db
      .select()
      .from(rmaRequests)
      .where(eq(rmaRequests.rmaNumber, rmaNumber.toUpperCase()))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findMany(options?: FindManyRmaRequestsOptions): Promise<RmaRequest[]> {
    const query = db.select().from(rmaRequests);
    if (options?.customerId) {
      query.where(eq(rmaRequests.customerId, options.customerId));
    }
    if (options?.salesOrderId) {
      query.where(eq(rmaRequests.salesOrderId, options.salesOrderId));
    }
    if (options?.status) {
      query.where(eq(rmaRequests.status, options.status));
    }
    if (options?.disposition) {
      query.where(eq(rmaRequests.disposition, options.disposition));
    }
    if (options?.search) {
      query.where(ilike(rmaRequests.itemDescription, `%${options.search}%`));
    }

    const rows = await query.orderBy(desc(rmaRequests.createdAt));
    return rows.map(toDomain);
  }

  async save(rma: RmaRequest): Promise<void> {
    await db
      .insert(rmaRequests)
      .values({
        id: rma.id,
        rmaNumber: rma.rmaNumber,
        customerId: rma.customerId,
        salesOrderId: rma.salesOrderId ?? null,
        itemDescription: rma.itemDescription,
        serialNumber: rma.serialNumber ?? null,
        reason: rma.reason,
        status: rma.status,
        disposition: rma.disposition ?? null,
        inspectionNotes: rma.inspectionNotes ?? null,
      })
      .onConflictDoUpdate({
        target: rmaRequests.id,
        set: {
          status: rma.status,
          disposition: rma.disposition ?? null,
          inspectionNotes: rma.inspectionNotes ?? null,
          updatedAt: new Date(),
        },
      });
  }

  async generateNextRmaNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db.select({ count: count() }).from(rmaRequests);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `RMA-${year}-${num}`;
  }
}
