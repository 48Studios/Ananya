import { db } from '@ananya/database';
import { projectTasks, taskAssignments } from '@ananya/database/schema';
import { eq, desc, count, ilike } from '@ananya/database/query';
import type {
  ProjectTaskRecord,
  TaskAssignmentRecord,
} from '@ananya/database/schema';
import {
  Task,
  type TaskRepository,
  type TaskStatus,
  type TaskPriority,
  type FindManyTasksOptions,
} from '@ananya/projects';

function toDomain(
  row: ProjectTaskRecord,
  assignments: TaskAssignmentRecord[] = [],
): Task {
  return Task.rehydrate({
    id: row.id,
    taskNumber: row.taskNumber,
    projectId: row.projectId,
    title: row.title,
    description: row.description ?? undefined,
    assignedUser: row.assignedUser ?? undefined,
    estimatedHours: parseFloat(row.estimatedHours),
    actualHours: parseFloat(row.actualHours),
    priority: row.priority as TaskPriority,
    status: row.status as TaskStatus,
    assignments: assignments.map((a) => ({
      id: a.id,
      taskId: a.taskId,
      userId: a.userId,
      assignedAt: a.assignedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleTaskRepository implements TaskRepository {
  async findById(id: string): Promise<Task | null> {
    const [row] = await db
      .select()
      .from(projectTasks)
      .where(eq(projectTasks.id, id))
      .limit(1);
    if (!row) return null;
    const assignments = await db
      .select()
      .from(taskAssignments)
      .where(eq(taskAssignments.taskId, id));
    return toDomain(row, assignments);
  }

  async findByNumber(taskNumber: string): Promise<Task | null> {
    const [row] = await db
      .select()
      .from(projectTasks)
      .where(eq(projectTasks.taskNumber, taskNumber.toUpperCase()))
      .limit(1);
    if (!row) return null;
    const assignments = await db
      .select()
      .from(taskAssignments)
      .where(eq(taskAssignments.taskId, row.id));
    return toDomain(row, assignments);
  }

  async findMany(options?: FindManyTasksOptions): Promise<Task[]> {
    const query = db.select().from(projectTasks);
    if (options?.projectId) {
      query.where(eq(projectTasks.projectId, options.projectId));
    }
    if (options?.assignedUser) {
      query.where(eq(projectTasks.assignedUser, options.assignedUser));
    }
    if (options?.status) {
      query.where(eq(projectTasks.status, options.status));
    }
    if (options?.priority) {
      query.where(eq(projectTasks.priority, options.priority));
    }
    if (options?.search) {
      query.where(ilike(projectTasks.title, `%${options.search}%`));
    }
    const rows = await query.orderBy(desc(projectTasks.createdAt));
    return Promise.all(
      rows.map(async (row) => {
        const assignments = await db
          .select()
          .from(taskAssignments)
          .where(eq(taskAssignments.taskId, row.id));
        return toDomain(row, assignments);
      }),
    );
  }

  async save(task: Task): Promise<void> {
    await db
      .insert(projectTasks)
      .values({
        id: task.id,
        taskNumber: task.taskNumber,
        projectId: task.projectId,
        title: task.title,
        description: task.description ?? null,
        assignedUser: task.assignedUser ?? null,
        estimatedHours: task.estimatedHours.toString(),
        actualHours: task.actualHours.toString(),
        priority: task.priority,
        status: task.status,
      })
      .onConflictDoUpdate({
        target: projectTasks.id,
        set: {
          title: task.title,
          description: task.description ?? null,
          assignedUser: task.assignedUser ?? null,
          estimatedHours: task.estimatedHours.toString(),
          actualHours: task.actualHours.toString(),
          priority: task.priority,
          status: task.status,
          updatedAt: new Date(),
        },
      });

    for (const a of task.assignments) {
      await db
        .insert(taskAssignments)
        .values({
          id: a.id,
          taskId: task.id,
          userId: a.userId,
          assignedAt: a.assignedAt,
        })
        .onConflictDoNothing();
    }
  }

  async generateNextTaskNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db.select({ count: count() }).from(projectTasks);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `TSK-${year}-${num}`;
  }
}
