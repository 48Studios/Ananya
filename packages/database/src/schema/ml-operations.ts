import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";

/**
 * ML Operations — training runs and model deployments.
 *
 * The training pipeline's own state lives in files under `apps/ml/` (the dataset
 * snapshot, the model registry, the active-deployment pointer). Those files are
 * authoritative for *what a model is*, but they cannot answer *who triggered it,
 * who promoted it, what the previous production model was, or what the last
 * deployment did* — a single `model_metadata.json` is overwritten on every
 * promotion and keeps no history.
 *
 * These two tables add exactly that missing history, and nothing else. They do not
 * duplicate the pipeline's artefacts, and no binary ever lands in PostgreSQL: a
 * row stores the registry REFERENCE (`registry/v1.5.1`), a checksum and counts.
 *
 * Deliberately NOT modelled here:
 *  - a generic job/queue table (there is one training job type and one runner);
 *  - raw pipeline logs (only a bounded excerpt is kept, see `logExcerpt`);
 *  - secrets, filesystem paths, environment values (none of these columns can
 *    hold one: versions are strings, counts are integers, checksums are hashes).
 */
export const mlTrainingRuns = pgTable(
  "ml_training_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // QUEUED | RUNNING | EVALUATING | PASSED | REJECTED | FAILED | CANCELLED.
    // A varchar rather than a pg enum, matching every other status column in this
    // schema (see component_intelligence_findings.status).
    status: varchar("status", { length: 32 }).notNull().default("QUEUED"),

    // Actor identity is recorded from the authenticated session by the API. The
    // email is denormalised on purpose: `users` is deletable and a training run
    // must still say who triggered it afterwards (the FK is SET NULL).
    triggeredByUserId: uuid("triggered_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    triggeredByEmail: varchar("triggered_by_email", { length: 255 }),
    triggeredAt: timestamp("triggered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    // Production model at the moment the run was triggered, and the candidate the
    // run produced. Both are registry version strings, never paths.
    baseModelVersion: varchar("base_model_version", { length: 64 }),
    candidateModelVersion: varchar("candidate_model_version", { length: 64 }),

    // Identity of the training code that produced the candidate (the pipeline's
    // own version constant), so a result can be attributed to a code revision.
    trainingCodeVersion: varchar("training_code_version", { length: 64 }),

    // Dataset snapshot: the pipeline's datasetVersion plus a checksum over the
    // snapshot's own files, so "which data trained this model" is reproducible
    // rather than merely dated.
    datasetVersion: varchar("dataset_version", { length: 160 }),
    datasetFingerprint: varchar("dataset_fingerprint", { length: 128 }),

    datasetRecordCount: integer("dataset_record_count"),
    feedbackRecordCount: integer("feedback_record_count"),
    trainingRecordCount: integer("training_record_count"),
    validationRecordCount: integer("validation_record_count"),
    quarantineRecordCount: integer("quarantine_record_count"),

    // Evaluation metrics and gate verdicts exactly as `evaluate.py` produced them.
    // jsonb because the evaluator owns the shape; the dashboard renders whatever
    // exists and never invents a metric.
    evaluationSummary: jsonb("evaluation_summary").$type<
      Record<string, unknown>
    >(),
    gateSummary: jsonb("gate_summary").$type<Record<string, unknown>>(),

    // A stable machine-readable failure code plus a safe human message. The code is
    // what the UI switches on, so wording can change without breaking a client.
    errorCode: varchar("error_code", { length: 64 }),
    errorMessage: text("error_message"),

    // Bounded excerpt of the runner's own step log (capped by the runner). Never
    // the raw pipeline stdout, and never unbounded.
    logExcerpt: text("log_excerpt"),

    // e.g. "registry/v1.5.1" — a registry reference, not a filesystem path.
    artifactReference: varchar("artifact_reference", { length: 160 }),

    // NOT_DEPLOYED | DEPLOYED | DEPLOYED_PENDING_RELOAD | DEPLOYMENT_FAILED.
    deploymentStatus: varchar("deployment_status", { length: 32 })
      .notNull()
      .default("NOT_DEPLOYED"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // At most ONE run may be in flight, enforced by the database rather than by a
    // service-side check that two API replicas could both pass. The partial unique
    // index is on a constant expression, so it permits a single row while the
    // predicate holds and any number of terminal rows. A concurrent trigger
    // therefore fails with a unique violation, which the API translates into a 409
    // instead of starting a second pipeline that would overwrite the same registry
    // version and the same dataset snapshot.
    uniqueIndex("ml_training_runs_active_unique")
      .on(sql`(true)`)
      .where(sql`status in ('QUEUED', 'RUNNING', 'EVALUATING')`),
    index("ml_training_runs_triggered_at_idx").on(table.triggeredAt),
    index("ml_training_runs_status_idx").on(table.status),
    index("ml_training_runs_candidate_version_idx").on(
      table.candidateModelVersion,
    ),
    index("ml_training_runs_triggered_by_idx").on(table.triggeredByUserId),
  ],
);

export const mlModelDeployments = pgTable(
  "ml_model_deployments",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Nullable and SET NULL: a deployment is a historical fact and must survive
    // retention of the run that produced the candidate (a rollback has no run at
    // all, which is the other reason this is not NOT NULL).
    trainingRunId: uuid("training_run_id").references(() => mlTrainingRuns.id, {
      onDelete: "set null",
    }),

    modelVersion: varchar("model_version", { length: 64 }).notNull(),
    previousModelVersion: varchar("previous_model_version", { length: 64 }),

    // CANDIDATE | ROLLBACK.
    deploymentType: varchar("deployment_type", { length: 32 }).notNull(),
    // DEPLOYED | DEPLOYED_PENDING_RELOAD | FAILED.
    status: varchar("status", { length: 32 }).notNull(),

    artifactFingerprint: varchar("artifact_fingerprint", { length: 128 }),
    // The version the ML process was actually SERVING after this deployment.
    // Deployment copies a file; whether the running process picked it up is a
    // separate fact, and this column is where the difference is recorded.
    runningModelVersion: varchar("running_model_version", { length: 64 }),
    reloadPending: boolean("reload_pending").notNull().default(false),

    deployedByUserId: uuid("deployed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    deployedByEmail: varchar("deployed_by_email", { length: 255 }),
    deployedAt: timestamp("deployed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    // Safe deployment detail: reload error text, whether the deployment tool's
    // metadata is stale after a rollback, and the gate verdict that allowed it.
    details: jsonb("details").$type<Record<string, unknown>>().default({}),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ml_model_deployments_deployed_at_idx").on(table.deployedAt),
    index("ml_model_deployments_model_version_idx").on(table.modelVersion),
    index("ml_model_deployments_training_run_idx").on(table.trainingRunId),
  ],
);

export type MlTrainingRun = typeof mlTrainingRuns.$inferSelect;
export type NewMlTrainingRun = typeof mlTrainingRuns.$inferInsert;
export type MlModelDeployment = typeof mlModelDeployments.$inferSelect;
export type NewMlModelDeployment = typeof mlModelDeployments.$inferInsert;
