import { db } from '@ananya/database';
import {
  projects,
  projectMilestones,
  projectMaterials,
  projectActivities,
} from '@ananya/database/schema';
import { eq, desc, count, ilike, or, and } from '@ananya/database/query';
import type {
  ProjectRecord,
  ProjectMilestoneRecord,
  ProjectMaterialRecord,
  ProjectActivityRecord,
} from '@ananya/database/schema';
import {
  Project,
  type ProjectRepository,
  type ProjectStatus,
  type ProjectType,
  type ProjectPriority,
  type MilestoneStatus,
  type ProjectActivityType,
  type FindManyProjectsOptions,
} from '@ananya/projects';

function toDomain(
  row: ProjectRecord,
  milestones: ProjectMilestoneRecord[] = [],
  materials: ProjectMaterialRecord[] = [],
  activities: ProjectActivityRecord[] = [],
): Project {
  return Project.rehydrate({
    id: row.id,
    projectNumber: row.projectNumber,
    name: row.name,
    projectType: (row.projectType as ProjectType) || 'INTERNAL',
    description: row.description,
    owner: row.owner || row.projectManager || 'Project Lead',
    projectManager: row.projectManager,
    customerId: row.customerId,
    salesOrderId: row.salesOrderId,
    startDate: row.startDate,
    targetCompletionDate: row.targetCompletionDate,
    priority: row.priority as ProjectPriority,
    status: row.status as ProjectStatus,
    materials: materials.map((m) => ({
      id: m.id,
      projectId: m.projectId,
      componentId: m.componentId,
      locationId: m.locationId,
      allocatedQuantity: parseFloat(m.allocatedQuantity),
      issuedQuantity: parseFloat(m.issuedQuantity),
      returnedQuantity: parseFloat(m.returnedQuantity),
      unitOfMeasure: m.unitOfMeasure,
      notes: m.notes,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    })),
    activities: activities.map((a) => ({
      id: a.id,
      projectId: a.projectId,
      activityType: a.activityType as ProjectActivityType,
      description: a.description,
      performedBy: a.performedBy,
      metadata: a.metadata,
      createdAt: a.createdAt,
    })),
    milestones: milestones.map((m) => ({
      id: m.id,
      projectId: m.projectId,
      name: m.name,
      dueDate: m.dueDate,
      status: m.status as MilestoneStatus,
      completionPercentage: parseFloat(m.completionPercentage),
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleProjectRepository implements ProjectRepository {
  async findById(id: string): Promise<Project | null> {
    const [row] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    if (!row) return null;

    const [ms, mats, acts] = await Promise.all([
      db
        .select()
        .from(projectMilestones)
        .where(eq(projectMilestones.projectId, id)),
      db
        .select()
        .from(projectMaterials)
        .where(eq(projectMaterials.projectId, id)),
      db
        .select()
        .from(projectActivities)
        .where(eq(projectActivities.projectId, id))
        .orderBy(desc(projectActivities.createdAt)),
    ]);

    return toDomain(row, ms, mats, acts);
  }

  async findByNumber(projectNumber: string): Promise<Project | null> {
    const [row] = await db
      .select()
      .from(projects)
      .where(eq(projects.projectNumber, projectNumber.toUpperCase()))
      .limit(1);
    if (!row) return null;

    const [ms, mats, acts] = await Promise.all([
      db
        .select()
        .from(projectMilestones)
        .where(eq(projectMilestones.projectId, row.id)),
      db
        .select()
        .from(projectMaterials)
        .where(eq(projectMaterials.projectId, row.id)),
      db
        .select()
        .from(projectActivities)
        .where(eq(projectActivities.projectId, row.id))
        .orderBy(desc(projectActivities.createdAt)),
    ]);

    return toDomain(row, ms, mats, acts);
  }

  async findMany(options?: FindManyProjectsOptions): Promise<Project[]> {
    const conditions = [];

    if (options?.status) {
      conditions.push(eq(projects.status, options.status));
    }
    if (options?.projectType) {
      conditions.push(eq(projects.projectType, options.projectType));
    }
    if (options?.priority) {
      conditions.push(eq(projects.priority, options.priority));
    }
    if (options?.owner) {
      conditions.push(eq(projects.owner, options.owner));
    }
    if (options?.customerId) {
      conditions.push(eq(projects.customerId, options.customerId));
    }
    if (options?.salesOrderId) {
      conditions.push(eq(projects.salesOrderId, options.salesOrderId));
    }
    if (options?.projectManager) {
      conditions.push(eq(projects.projectManager, options.projectManager));
    }
    if (options?.search) {
      const pattern = `%${options.search}%`;
      conditions.push(
        or(
          ilike(projects.name, pattern),
          ilike(projects.projectNumber, pattern),
          ilike(projects.owner, pattern),
          ilike(projects.projectManager, pattern),
          ilike(projects.description, pattern),
        ),
      );
    }

    const query = db.select().from(projects);
    if (conditions.length > 0) {
      query.where(and(...conditions));
    }

    const rows = await query.orderBy(desc(projects.createdAt));

    return Promise.all(
      rows.map(async (row) => {
        const [ms, mats, acts] = await Promise.all([
          db
            .select()
            .from(projectMilestones)
            .where(eq(projectMilestones.projectId, row.id)),
          db
            .select()
            .from(projectMaterials)
            .where(eq(projectMaterials.projectId, row.id)),
          db
            .select()
            .from(projectActivities)
            .where(eq(projectActivities.projectId, row.id))
            .orderBy(desc(projectActivities.createdAt)),
        ]);
        return toDomain(row, ms, mats, acts);
      }),
    );
  }

  async save(project: Project): Promise<void> {
    await db
      .insert(projects)
      .values({
        id: project.id,
        projectNumber: project.projectNumber,
        name: project.name,
        projectType: project.projectType,
        description: project.description,
        owner: project.owner,
        projectManager: project.projectManager,
        customerId: project.customerId || null,
        salesOrderId: project.salesOrderId || null,
        startDate: project.startDate,
        targetCompletionDate: project.targetCompletionDate,
        priority: project.priority,
        status: project.status,
      })
      .onConflictDoUpdate({
        target: projects.id,
        set: {
          name: project.name,
          projectType: project.projectType,
          description: project.description,
          owner: project.owner,
          projectManager: project.projectManager,
          customerId: project.customerId || null,
          salesOrderId: project.salesOrderId || null,
          startDate: project.startDate,
          targetCompletionDate: project.targetCompletionDate,
          priority: project.priority,
          status: project.status,
          updatedAt: new Date(),
        },
      });

    // Save Milestones
    for (const m of project.milestones) {
      await db
        .insert(projectMilestones)
        .values({
          id: m.id,
          projectId: project.id,
          name: m.name,
          dueDate: m.dueDate,
          status: m.status,
          completionPercentage: m.completionPercentage.toString(),
        })
        .onConflictDoUpdate({
          target: projectMilestones.id,
          set: {
            name: m.name,
            dueDate: m.dueDate,
            status: m.status,
            completionPercentage: m.completionPercentage.toString(),
            updatedAt: new Date(),
          },
        });
    }

    // Save Materials
    for (const mat of project.materials) {
      await db
        .insert(projectMaterials)
        .values({
          id: mat.id,
          projectId: project.id,
          componentId: mat.componentId,
          locationId: mat.locationId,
          allocatedQuantity: mat.allocatedQuantity.toString(),
          issuedQuantity: mat.issuedQuantity.toString(),
          returnedQuantity: mat.returnedQuantity.toString(),
          unitOfMeasure: mat.unitOfMeasure,
          notes: mat.notes,
        })
        .onConflictDoUpdate({
          target: projectMaterials.id,
          set: {
            allocatedQuantity: mat.allocatedQuantity.toString(),
            issuedQuantity: mat.issuedQuantity.toString(),
            returnedQuantity: mat.returnedQuantity.toString(),
            unitOfMeasure: mat.unitOfMeasure,
            notes: mat.notes,
            updatedAt: new Date(),
          },
        });
    }

    // Save Activities
    for (const act of project.activities) {
      await db
        .insert(projectActivities)
        .values({
          id: act.id,
          projectId: project.id,
          activityType: act.activityType,
          description: act.description,
          performedBy: act.performedBy,
          metadata: act.metadata,
        })
        .onConflictDoNothing();
    }
  }

  async delete(id: string): Promise<void> {
    await db.delete(projects).where(eq(projects.id, id));
  }

  async generateNextProjectNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db.select({ count: count() }).from(projects);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `PRJ-${year}-${num}`;
  }
}
