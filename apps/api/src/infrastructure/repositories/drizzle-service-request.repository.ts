import { db } from '@ananya/database';
import { serviceRequests } from '@ananya/database/schema';
import { eq, desc, count, ilike } from '@ananya/database/query';
import type { ServiceRequestRecord } from '@ananya/database/schema';
import {
  ServiceRequest,
  type ServiceRequestRepository,
  type ServiceRequestStatus,
  type ServicePriority,
  type ServiceCategory,
  type FindManyServiceRequestsOptions,
} from '@ananya/service';

function toDomain(row: ServiceRequestRecord): ServiceRequest {
  return ServiceRequest.rehydrate({
    id: row.id,
    serviceNumber: row.serviceNumber,
    customerId: row.customerId,
    salesOrderId: row.salesOrderId ?? undefined,
    projectId: row.projectId ?? undefined,
    componentId: row.componentId ?? undefined,
    serialNumber: row.serialNumber ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    priority: row.priority as ServicePriority,
    category: row.category as ServiceCategory,
    status: row.status as ServiceRequestStatus,
    assignedTechnician: row.assignedTechnician ?? undefined,
    diagnosticNotes: row.diagnosticNotes ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleServiceRequestRepository implements ServiceRequestRepository {
  async findById(id: string): Promise<ServiceRequest | null> {
    const [row] = await db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByNumber(serviceNumber: string): Promise<ServiceRequest | null> {
    const [row] = await db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.serviceNumber, serviceNumber.toUpperCase()))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findMany(
    options?: FindManyServiceRequestsOptions,
  ): Promise<ServiceRequest[]> {
    const query = db.select().from(serviceRequests);
    if (options?.status) {
      query.where(eq(serviceRequests.status, options.status));
    }
    if (options?.priority) {
      query.where(eq(serviceRequests.priority, options.priority));
    }
    if (options?.category) {
      query.where(eq(serviceRequests.category, options.category));
    }
    if (options?.customerId) {
      query.where(eq(serviceRequests.customerId, options.customerId));
    }
    if (options?.assignedTechnician) {
      query.where(
        eq(serviceRequests.assignedTechnician, options.assignedTechnician),
      );
    }
    if (options?.search) {
      query.where(ilike(serviceRequests.title, `%${options.search}%`));
    }

    const rows = await query.orderBy(desc(serviceRequests.createdAt));
    return rows.map(toDomain);
  }

  async save(request: ServiceRequest): Promise<void> {
    await db
      .insert(serviceRequests)
      .values({
        id: request.id,
        serviceNumber: request.serviceNumber,
        customerId: request.customerId,
        salesOrderId: request.salesOrderId ?? null,
        projectId: request.projectId ?? null,
        componentId: request.componentId ?? null,
        serialNumber: request.serialNumber ?? null,
        title: request.title,
        description: request.description ?? null,
        priority: request.priority,
        category: request.category,
        status: request.status,
        assignedTechnician: request.assignedTechnician ?? null,
        diagnosticNotes: request.diagnosticNotes ?? null,
      })
      .onConflictDoUpdate({
        target: serviceRequests.id,
        set: {
          title: request.title,
          description: request.description ?? null,
          priority: request.priority,
          category: request.category,
          status: request.status,
          assignedTechnician: request.assignedTechnician ?? null,
          diagnosticNotes: request.diagnosticNotes ?? null,
          updatedAt: new Date(),
        },
      });
  }

  async generateNextServiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db.select({ count: count() }).from(serviceRequests);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `SRV-${year}-${num}`;
  }
}
