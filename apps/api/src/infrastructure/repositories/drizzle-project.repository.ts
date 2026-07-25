import { db } from '@ananya/database';
import { projects, projectMilestones } from '@ananya/database/schema';
import { eq, desc, count, ilike } from '@ananya/database/query';
import type {
  ProjectRecord,
  ProjectMilestoneRecord,
} from '@ananya/database/schema';
import {
  Project,
  type ProjectRepository,
  type ProjectStatus,
  type ProjectPriority,
  type MilestoneStatus,
  type FindManyProjectsOptions,
} from '@ananya/projects';

function toDomain(
  row: ProjectRecord,
  milestones: ProjectMilestoneRecord[] = [],
): Project {
  return Project.rehydrate({
    id: row.id,
    projectNumber: row.projectNumber,
    name: row.name,
    customerId: row.customerId,
    salesOrderId: row.salesOrderId,
    projectManager: row.projectManager,
    startDate: row.startDate,
    targetCompletionDate: row.targetCompletionDate,
    priority: row.priority as ProjectPriority,
    status: row.status as ProjectStatus,
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
    const ms = await db
      .select()
      .from(projectMilestones)
      .where(eq(projectMilestones.projectId, id));
    return toDomain(row, ms);
  }

  async findByNumber(projectNumber: string): Promise<Project | null> {
    const [row] = await db
      .select()
      .from(projects)
      .where(eq(projects.projectNumber, projectNumber.toUpperCase()))
      .limit(1);
    if (!row) return null;
    const ms = await db
      .select()
      .from(projectMilestones)
      .where(eq(projectMilestones.projectId, row.id));
    return toDomain(row, ms);
  }

  async findMany(options?: FindManyProjectsOptions): Promise<Project[]> {
    const query = db.select().from(projects);
    if (options?.status) {
      query.where(eq(projects.status, options.status));
    }
    if (options?.priority) {
      query.where(eq(projects.priority, options.priority));
    }
    if (options?.customerId) {
      query.where(eq(projects.customerId, options.customerId));
    }
    if (options?.salesOrderId) {
      query.where(eq(projects.salesOrderId, options.salesOrderId));
    }
    if (options?.projectManager) {
      query.where(eq(projects.projectManager, options.projectManager));
    }
    if (options?.search) {
      query.where(ilike(projects.name, `%${options.search}%`));
    }
    const rows = await query.orderBy(desc(projects.createdAt));
    return Promise.all(
      rows.map(async (row) => {
        const ms = await db
          .select()
          .from(projectMilestones)
          .where(eq(projectMilestones.projectId, row.id));
        return toDomain(row, ms);
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
        customerId: project.customerId,
        salesOrderId: project.salesOrderId,
        projectManager: project.projectManager,
        startDate: project.startDate,
        targetCompletionDate: project.targetCompletionDate,
        priority: project.priority,
        status: project.status,
      })
      .onConflictDoUpdate({
        target: projects.id,
        set: {
          name: project.name,
          projectManager: project.projectManager,
          startDate: project.startDate,
          targetCompletionDate: project.targetCompletionDate,
          priority: project.priority,
          status: project.status,
          updatedAt: new Date(),
        },
      });

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
  }

  async generateNextProjectNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db.select({ count: count() }).from(projects);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `PRJ-${year}-${num}`;
  }
}
