import { Injectable } from '@nestjs/common';
import { db } from '@ananya/database';
import {
  aiSuggestionFeedback,
  attributeIntelligenceFindings,
  componentIntelligenceFindings,
  mlModelDeployments,
  mlTrainingRuns,
} from '@ananya/database/schema';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  sql,
} from '@ananya/database/query';
import {
  getPostgresErrorCode,
  POSTGRES_UNIQUE_VIOLATION,
} from '../../common/utils/postgres-error';
import {
  ACTIVE_TRAINING_RUN_STATUSES,
  type TrainingRunStatus,
} from './ml-ops.dtos';

/** Raised when a second training run is started while one is already active. */
export class ActiveTrainingRunExistsError extends Error {
  constructor() {
    super('A training run is already active');
    this.name = 'ActiveTrainingRunExistsError';
  }
}

export interface InsertTrainingRunInput {
  status: TrainingRunStatus;
  triggeredByUserId: string | null;
  triggeredByEmail: string | null;
  baseModelVersion: string | null;
  trainingCodeVersion: string | null;
}

export interface TrainingRunUpdate {
  status?: TrainingRunStatus;
  startedAt?: Date | null;
  completedAt?: Date | null;
  candidateModelVersion?: string | null;
  baseModelVersion?: string | null;
  datasetVersion?: string | null;
  datasetFingerprint?: string | null;
  datasetRecordCount?: number | null;
  feedbackRecordCount?: number | null;
  trainingRecordCount?: number | null;
  validationRecordCount?: number | null;
  quarantineRecordCount?: number | null;
  evaluationSummary?: Record<string, unknown> | null;
  gateSummary?: Record<string, unknown> | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  logExcerpt?: string | null;
  artifactReference?: string | null;
  deploymentStatus?: string;
}

export interface InsertDeploymentInput {
  trainingRunId: string | null;
  modelVersion: string;
  previousModelVersion: string | null;
  deploymentType: 'CANDIDATE' | 'ROLLBACK';
  status: 'DEPLOYED' | 'DEPLOYED_PENDING_RELOAD' | 'FAILED';
  artifactFingerprint: string | null;
  runningModelVersion: string | null;
  reloadPending: boolean;
  deployedByUserId: string | null;
  deployedByEmail: string | null;
  details: Record<string, unknown>;
}

export interface TrainingRunListFilters {
  status?: TrainingRunStatus;
  candidateModelVersion?: string;
  limit: number;
  offset: number;
}

/**
 * Persistence for ML operations.
 *
 * Deliberately persistence-only: no dispatch, no HTTP, no orchestration. The
 * service decides what a transition means; this class only writes rows and reads
 * aggregates, matching the repository conventions used elsewhere in the API.
 */
@Injectable()
export class MlOpsRepository {
  /**
   * Inserts a queued run.
   *
   * The single-active-run guarantee is the database's, not this method's: a
   * partial unique index rejects a second active row, and that rejection is
   * translated here. Two API replicas racing on a service-side check could both
   * pass it, which would start two pipelines writing the same registry version and
   * the same dataset snapshot.
   */
  async insertTrainingRun(input: InsertTrainingRunInput) {
    try {
      const [row] = await db
        .insert(mlTrainingRuns)
        .values({
          status: input.status,
          triggeredByUserId: input.triggeredByUserId,
          triggeredByEmail: input.triggeredByEmail,
          baseModelVersion: input.baseModelVersion,
          trainingCodeVersion: input.trainingCodeVersion,
        })
        .returning();
      return row;
    } catch (error) {
      if (getPostgresErrorCode(error) === POSTGRES_UNIQUE_VIOLATION) {
        throw new ActiveTrainingRunExistsError();
      }
      throw error;
    }
  }

  async findTrainingRun(id: string) {
    const [row] = await db
      .select()
      .from(mlTrainingRuns)
      .where(eq(mlTrainingRuns.id, id))
      .limit(1);
    return row ?? null;
  }

  async findActiveTrainingRun() {
    const [row] = await db
      .select()
      .from(mlTrainingRuns)
      .where(inArray(mlTrainingRuns.status, [...ACTIVE_TRAINING_RUN_STATUSES]))
      .orderBy(desc(mlTrainingRuns.triggeredAt))
      .limit(1);
    return row ?? null;
  }

  async listTrainingRuns(filters: TrainingRunListFilters) {
    const conditions = [];
    if (filters.status) {
      conditions.push(eq(mlTrainingRuns.status, filters.status));
    }
    if (filters.candidateModelVersion) {
      conditions.push(
        eq(mlTrainingRuns.candidateModelVersion, filters.candidateModelVersion),
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select()
      .from(mlTrainingRuns)
      .where(where)
      .orderBy(desc(mlTrainingRuns.triggeredAt))
      .limit(filters.limit)
      .offset(filters.offset);

    const [totals] = await db
      .select({ value: count() })
      .from(mlTrainingRuns)
      .where(where);

    return { rows, total: Number(totals?.value ?? 0) };
  }

  async updateTrainingRun(id: string, update: TrainingRunUpdate) {
    const [row] = await db
      .update(mlTrainingRuns)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(mlTrainingRuns.id, id))
      .returning();
    return row ?? null;
  }

  /**
   * Applies a status transition only while the run is still active.
   *
   * Used by the reconciliation path so two concurrent readers polling the same run
   * cannot both "finish" it, and so a terminal state is never overwritten by a
   * stale poll that arrives later.
   */
  async finishTrainingRunIfActive(
    id: string,
    update: TrainingRunUpdate & { status: TrainingRunStatus },
  ) {
    const [row] = await db
      .update(mlTrainingRuns)
      .set({ ...update, updatedAt: new Date() })
      .where(
        and(
          eq(mlTrainingRuns.id, id),
          inArray(mlTrainingRuns.status, [...ACTIVE_TRAINING_RUN_STATUSES]),
        ),
      )
      .returning();
    return row ?? null;
  }

  async countTrainingRunsByStatus() {
    const rows = await db
      .select({ status: mlTrainingRuns.status, value: count() })
      .from(mlTrainingRuns)
      .groupBy(mlTrainingRuns.status);
    return rows.map((row) => ({
      status: row.status as TrainingRunStatus,
      count: Number(row.value),
    }));
  }

  async findLatestRunByStatuses(statuses: TrainingRunStatus[]) {
    const [row] = await db
      .select()
      .from(mlTrainingRuns)
      .where(inArray(mlTrainingRuns.status, statuses))
      .orderBy(
        desc(mlTrainingRuns.completedAt),
        desc(mlTrainingRuns.triggeredAt),
      )
      .limit(1);
    return row ?? null;
  }

  /** Runs that produced a candidate version, keyed by version, for the Models tab. */
  async listRunVersions() {
    const rows = await db
      .select({
        id: mlTrainingRuns.id,
        candidateModelVersion: mlTrainingRuns.candidateModelVersion,
        status: mlTrainingRuns.status,
        deploymentStatus: mlTrainingRuns.deploymentStatus,
        datasetVersion: mlTrainingRuns.datasetVersion,
        triggeredAt: mlTrainingRuns.triggeredAt,
      })
      .from(mlTrainingRuns)
      .where(sql`${mlTrainingRuns.candidateModelVersion} is not null`)
      .orderBy(asc(mlTrainingRuns.triggeredAt));
    return rows;
  }

  // ------------------------------------------------------------- deployments

  async insertDeployment(input: InsertDeploymentInput) {
    const [row] = await db.insert(mlModelDeployments).values(input).returning();
    return row;
  }

  async listDeployments(limit: number) {
    return db
      .select()
      .from(mlModelDeployments)
      .orderBy(desc(mlModelDeployments.deployedAt))
      .limit(limit);
  }

  async countDeploymentsByType() {
    const rows = await db
      .select({ type: mlModelDeployments.deploymentType, value: count() })
      .from(mlModelDeployments)
      .groupBy(mlModelDeployments.deploymentType);
    return rows.map((row) => ({
      type: row.type,
      count: Number(row.value),
    }));
  }

  // ----------------------------------------------------------------- usage

  /**
   * Feedback totals, aggregated in SQL.
   *
   * The dashboard must not download the telemetry ledger to count it, and no
   * individual reviewer identity is returned — only totals and a type breakdown.
   */
  async feedbackTotals() {
    const actionRows = await db
      .select({ action: aiSuggestionFeedback.userAction, value: count() })
      .from(aiSuggestionFeedback)
      .groupBy(aiSuggestionFeedback.userAction);
    const typeRows = await db
      .select({
        suggestionType: aiSuggestionFeedback.suggestionType,
        value: count(),
      })
      .from(aiSuggestionFeedback)
      .groupBy(aiSuggestionFeedback.suggestionType)
      .orderBy(desc(count()));

    const totals = { ACCEPTED: 0, REJECTED: 0, EDITED: 0 };
    let total = 0;
    for (const row of actionRows) {
      const value = Number(row.value);
      total += value;
      if (row.action in totals) {
        totals[row.action as keyof typeof totals] = value;
      }
    }
    return {
      total,
      accepted: totals.ACCEPTED,
      rejected: totals.REJECTED,
      edited: totals.EDITED,
      bySuggestionType: typeRows.map((row) => ({
        suggestionType: row.suggestionType,
        count: Number(row.value),
      })),
    };
  }

  async countFeedbackSince(since: Date) {
    const [row] = await db
      .select({ value: count() })
      .from(aiSuggestionFeedback)
      .where(gte(aiSuggestionFeedback.createdAt, since));
    return Number(row?.value ?? 0);
  }

  /**
   * Intelligence finding totals across BOTH finding tables.
   *
   * The component queue and the attribute queue keep separate tables and separate
   * taxonomies by design, so the dashboard reports their sum for "findings
   * generated" and the merged issue-category breakdown for the detail. Applied
   * counts come from different columns in the two tables (`metadata.applicationResult`
   * for component findings, the real `application_result` column for attribute
   * findings) — that difference is the schema's, and it is why the two are counted
   * separately and then added.
   */
  async findingTotals() {
    const componentRows = await db
      .select({ status: componentIntelligenceFindings.status, value: count() })
      .from(componentIntelligenceFindings)
      .groupBy(componentIntelligenceFindings.status);
    const attributeRows = await db
      .select({ status: attributeIntelligenceFindings.status, value: count() })
      .from(attributeIntelligenceFindings)
      .groupBy(attributeIntelligenceFindings.status);

    const componentCategories = await db
      .select({
        issueCategory: componentIntelligenceFindings.issueCategory,
        value: count(),
      })
      .from(componentIntelligenceFindings)
      .groupBy(componentIntelligenceFindings.issueCategory);
    const attributeCategories = await db
      .select({
        issueCategory: attributeIntelligenceFindings.issueCategory,
        value: count(),
      })
      .from(attributeIntelligenceFindings)
      .groupBy(attributeIntelligenceFindings.issueCategory);

    const [componentApplied] = await db
      .select({ value: count() })
      .from(componentIntelligenceFindings)
      .where(
        sql`coalesce(${componentIntelligenceFindings.metadata} ->> 'applicationResult', '') = 'APPLIED'`,
      );
    const [attributeApplied] = await db
      .select({ value: count() })
      .from(attributeIntelligenceFindings)
      .where(eq(attributeIntelligenceFindings.applicationResult, 'APPLIED'));

    const statuses: Record<string, number> = {};
    for (const row of [...componentRows, ...attributeRows]) {
      statuses[row.status] = (statuses[row.status] ?? 0) + Number(row.value);
    }

    const categories = new Map<string, number>();
    for (const row of [...componentCategories, ...attributeCategories]) {
      categories.set(
        row.issueCategory,
        (categories.get(row.issueCategory) ?? 0) + Number(row.value),
      );
    }

    return {
      total: Object.values(statuses).reduce((sum, value) => sum + value, 0),
      pending: statuses.PENDING ?? 0,
      accepted: statuses.ACCEPTED ?? 0,
      rejected: statuses.REJECTED ?? 0,
      dismissed: statuses.DISMISSED ?? 0,
      stale: statuses.STALE ?? 0,
      applied:
        Number(componentApplied?.value ?? 0) +
        Number(attributeApplied?.value ?? 0),
      byIssueCategory: [...categories.entries()]
        .map(([issueCategory, value]) => ({ issueCategory, count: value }))
        .sort(
          (a, b) =>
            b.count - a.count || a.issueCategory.localeCompare(b.issueCategory),
        ),
    };
  }
}
