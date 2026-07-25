import { db } from '@ananya/database';
import { serviceWorkOrders } from '@ananya/database/schema';
import { eq, desc, count, ilike } from '@ananya/database/query';
import type { ServiceWorkOrderRecord } from '@ananya/database/schema';
import {
  WorkOrder,
  type WorkOrderRepository,
  type WorkOrderStatus,
  type WorkOrderPriority,
  type FindManyWorkOrdersOptions,
} from '@ananya/service';

function toDomain(row: ServiceWorkOrderRecord): WorkOrder {
  return WorkOrder.rehydrate({
    id: row.id,
    workOrderNumber: row.workOrderNumber,
    serviceRequestId: row.serviceRequestId,
    assignedTechnician: row.assignedTechnician ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    plannedHours: parseFloat(row.plannedHours),
    actualHours: parseFloat(row.actualHours),
    priority: row.priority as WorkOrderPriority,
    status: row.status as WorkOrderStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleWorkOrderRepository implements WorkOrderRepository {
  async findById(id: string): Promise<WorkOrder | null> {
    const [row] = await db
      .select()
      .from(serviceWorkOrders)
      .where(eq(serviceWorkOrders.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByNumber(workOrderNumber: string): Promise<WorkOrder | null> {
    const [row] = await db
      .select()
      .from(serviceWorkOrders)
      .where(
        eq(serviceWorkOrders.workOrderNumber, workOrderNumber.toUpperCase()),
      )
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findMany(options?: FindManyWorkOrdersOptions): Promise<WorkOrder[]> {
    const query = db.select().from(serviceWorkOrders);
    if (options?.serviceRequestId) {
      query.where(
        eq(serviceWorkOrders.serviceRequestId, options.serviceRequestId),
      );
    }
    if (options?.assignedTechnician) {
      query.where(
        eq(serviceWorkOrders.assignedTechnician, options.assignedTechnician),
      );
    }
    if (options?.status) {
      query.where(eq(serviceWorkOrders.status, options.status));
    }
    if (options?.priority) {
      query.where(eq(serviceWorkOrders.priority, options.priority));
    }
    if (options?.search) {
      query.where(ilike(serviceWorkOrders.title, `%${options.search}%`));
    }

    const rows = await query.orderBy(desc(serviceWorkOrders.createdAt));
    return rows.map(toDomain);
  }

  async save(workOrder: WorkOrder): Promise<void> {
    await db
      .insert(serviceWorkOrders)
      .values({
        id: workOrder.id,
        workOrderNumber: workOrder.workOrderNumber,
        serviceRequestId: workOrder.serviceRequestId,
        assignedTechnician: workOrder.assignedTechnician ?? null,
        title: workOrder.title,
        description: workOrder.description ?? null,
        plannedHours: workOrder.plannedHours.toString(),
        actualHours: workOrder.actualHours.toString(),
        priority: workOrder.priority,
        status: workOrder.status,
      })
      .onConflictDoUpdate({
        target: serviceWorkOrders.id,
        set: {
          assignedTechnician: workOrder.assignedTechnician ?? null,
          title: workOrder.title,
          description: workOrder.description ?? null,
          plannedHours: workOrder.plannedHours.toString(),
          actualHours: workOrder.actualHours.toString(),
          priority: workOrder.priority,
          status: workOrder.status,
          updatedAt: new Date(),
        },
      });
  }

  async generateNextWorkOrderNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db
      .select({ count: count() })
      .from(serviceWorkOrders);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `WO-${year}-${num}`;
  }
}
