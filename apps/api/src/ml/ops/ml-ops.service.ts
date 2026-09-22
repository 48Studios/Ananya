import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MlClientService } from '../ml-client.service';
import type {
  MlDatasetOverview,
  MlModelDeploymentPayload,
  MlModelRegistryResponse,
  MlOpsCallOutcome,
  MlTrainingRunPayload,
} from '../ml-client.service';
import { SecurityAuditService } from '../../security-audit/security-audit.service';
import {
  ActiveTrainingRunExistsError,
  MlOpsRepository,
} from './ml-ops.repository';
import type { MlModelDeployment, MlTrainingRun } from '@ananya/database/schema';
import {
  DEFAULT_TRAINING_RUN_PAGE_SIZE,
  MAX_TRAINING_RUN_PAGE_SIZE,
  isActiveTrainingRunStatus,
  type DeploymentStatus,
  type ListTrainingRunsQueryDto,
  type MlDatasetDto,
  type MlDeploymentRecordDto,
  type MlEvaluationMetricsDto,
  type MlGateResultDto,
  type MlGateSummaryDto,
  type MlHealthDto,
  type MlModelsDto,
  type MlModelVersionDto,
  type MlOpsRefusalReason,
  type MlOverviewDto,
  type MlTrainingRunDetailDto,
  type MlTrainingRunPageDto,
  type MlTrainingRunSummaryDto,
  type MlUsageDto,
  type TrainingPhase,
  type TrainingRunStatus,
} from './ml-ops.dtos';

/** Actor identity, always taken from the authenticated session by a guard. */
export interface MlOpsActor {
  id: string | null;
  email: string | null;
}

/** Security-audit action names for this control plane. */
export const ML_OPS_AUDIT_ACTIONS = {
  TRAINING_TRIGGERED: 'ML_TRAINING_TRIGGERED',
  CANDIDATE_DEPLOYED: 'ML_CANDIDATE_DEPLOYED',
  MODEL_ROLLED_BACK: 'ML_MODEL_ROLLED_BACK',
  MODEL_RELOADED: 'ML_MODEL_RELOADED',
} as const;

/** Audit category, matching the ML apply services' existing convention. */
const AUDIT_CATEGORY = 'Inventory';

const DEFAULT_DEPLOYMENT_LIMIT = 25;

/**
 * Raised when a privileged ML operation is refused for a state reason.
 *
 * The body carries a machine-readable `reason` so the dashboard can explain the
 * refusal without parsing prose — the same contract the attribute review-queue's
 * apply path uses. `retryable` marks the failures that are worth retrying as-is.
 */
export class MlOpsConflictError extends ConflictException {
  constructor(
    public readonly reason: MlOpsRefusalReason,
    message: string,
    public readonly retryable = false,
  ) {
    super({ statusCode: 409, reason, message, retryable });
  }
}

@Injectable()
export class MlOpsService {
  private readonly logger = new Logger(MlOpsService.name);

  constructor(
    private readonly repository: MlOpsRepository,
    private readonly mlClient: MlClientService,
    private readonly securityAudit: SecurityAuditService,
  ) {}

  // ------------------------------------------------------------------ health

  async getHealth(): Promise<MlHealthDto> {
    const [readyOutcome, activeRun, lastPassed] = await Promise.all([
      this.mlClient.mlOpsReady(),
      this.repository.findActiveTrainingRun(),
      this.repository.findLatestRunByStatuses(['PASSED']),
    ]);

    if (!readyOutcome.ok) {
      return {
        serviceReachable: false,
        serviceEnabled: readyOutcome.kind !== 'DISABLED',
        ready: false,
        modelsLoaded: {},
        categoryModelLoaded: false,
        manufacturerResolverLoaded: false,
        runningModelVersion: null,
        recordedModelVersion: null,
        reloadPending: false,
        activeTrainingRunId: activeRun?.id ?? null,
        lastSuccessfulTraining: lastPassed ? this.toSummary(lastPassed) : null,
      };
    }

    const ready = readyOutcome.data;
    const modelsLoaded = ready.models_loaded ?? {};
    const running = ready.running_model ?? null;
    const recorded = running?.recordedActiveVersion ?? null;
    const runningVersion = running?.activeVersion ?? null;

    return {
      serviceReachable: true,
      serviceEnabled: true,
      ready: Boolean(ready.ready),
      modelsLoaded,
      categoryModelLoaded: Boolean(modelsLoaded.category_classifier),
      manufacturerResolverLoaded: Boolean(modelsLoaded.manufacturer_resolver),
      runningModelVersion: runningVersion,
      recordedModelVersion: recorded,
      // The sidecar the deployment tool writes and the checksum-resolved version
      // can disagree (a rollback restores the artifact without rewriting the
      // sidecar). Reporting the divergence is the honest reading.
      reloadPending: Boolean(
        recorded && runningVersion && recorded !== runningVersion,
      ),
      activeTrainingRunId: activeRun?.id ?? null,
      lastSuccessfulTraining: lastPassed ? this.toSummary(lastPassed) : null,
    };
  }

  // ------------------------------------------------------------------ models

  async getModels(): Promise<MlModelsDto> {
    const [modelsOutcome, runVersions, deployments] = await Promise.all([
      this.mlClient.mlOpsModels(),
      this.repository.listRunVersions(),
      this.repository.listDeployments(DEFAULT_DEPLOYMENT_LIMIT),
    ]);

    if (!modelsOutcome.ok) {
      return {
        production: {
          artifactVersion: null,
          recordedVersion: null,
          deployedAt: null,
          checksum: null,
          sizeBytes: null,
          rollbackAvailable: false,
        },
        running: {
          version: null,
          loaded: false,
          loadedAt: null,
          checksum: null,
          reloadPending: false,
        },
        versions: [],
        deployments: deployments.map((row) => this.toDeploymentRecord(row)),
        available: false,
      };
    }

    const registry: MlModelRegistryResponse = modelsOutcome.data;
    const runByVersion = new Map<
      string,
      { id: string; datasetVersion: string | null; runDeployable: boolean }
    >();
    for (const run of runVersions) {
      if (run.candidateModelVersion) {
        runByVersion.set(run.candidateModelVersion, {
          id: run.id,
          datasetVersion: run.datasetVersion,
          runDeployable:
            run.status === 'PASSED' && run.deploymentStatus === 'NOT_DEPLOYED',
        });
      }
    }

    const production =
      registry.active ?? ({} as MlModelRegistryResponse['active']);
    const running =
      registry.running ?? ({} as MlModelRegistryResponse['running']);
    const runningVersion = running.activeVersion ?? null;

    return {
      production: {
        artifactVersion: production.artifactVersion ?? null,
        recordedVersion: production.deployedVersion ?? null,
        deployedAt: production.deployedAt ?? null,
        checksum: production.artifactSha256 ?? null,
        sizeBytes: production.artifactSizeBytes ?? null,
        rollbackAvailable: Boolean(production.rollbackAvailable),
      },
      running: {
        version: runningVersion,
        loaded: Boolean(running.loaded),
        loadedAt: running.loadedAt ?? null,
        checksum: running.artifactSha256 ?? null,
        // The running process holds a different artifact than production. This is
        // the distinction between "artifact deployed" and "running model version".
        reloadPending: Boolean(
          running.loaded &&
          production.artifactSha256 !== running.artifactSha256,
        ),
      },
      versions: (registry.versions ?? []).map((version) =>
        this.toModelVersion(version, runByVersion.get(version.version) ?? null),
      ),
      deployments: deployments.map((row) => this.toDeploymentRecord(row)),
      available: true,
    };
  }

  // ----------------------------------------------------------------- dataset

  async getDataset(): Promise<MlDatasetDto> {
    const [datasetOutcome, lastRun] = await Promise.all([
      this.mlClient.mlOpsDataset(),
      this.repository.findLatestRunByStatuses(['PASSED']),
    ]);

    const lastTrainingRunAt =
      lastRun?.completedAt ?? lastRun?.triggeredAt ?? null;
    const recordsSince = lastTrainingRunAt
      ? await this.repository.countFeedbackSince(new Date(lastTrainingRunAt))
      : null;

    if (!datasetOutcome.ok) {
      return {
        available: false,
        current: null,
        freshness: {
          ageHours: null,
          lastTrainingRunAt: lastTrainingRunAt?.toISOString() ?? null,
          recordsSinceLastTraining: recordsSince,
        },
        quality: {
          duplicatePairs: null,
          conflictingLabels: null,
          missingFields: null,
          quarantineTotal: null,
          quarantineByReason: [],
          categoryDistribution: [],
          manufacturerDistribution: [],
          distinctBaseFamilies: null,
          validatedRecordCount: null,
        },
        history: [],
      };
    }

    const overview: MlDatasetOverview = datasetOutcome.data;
    const current = overview.current ?? null;
    const quarantine = overview.quarantine ?? {};
    const distribution = overview.distribution ?? {};
    const quarantineAvailable = quarantine.available !== false;
    const byReason = readReasons(quarantine.byReason);

    return {
      available: true,
      current: current
        ? {
            version: current.datasetVersion,
            generatedAt: current.createdAt ?? null,
            fingerprint: current.fingerprint ?? null,
            totalRecords: current.totalSourceRecords ?? null,
            validatedRecords: current.totalSourceRecords ?? null,
            quarantinedRecords: readNumber(quarantine.total),
            trainingRecords: current.trainSize ?? null,
            evaluationRecords: current.valSize ?? null,
            expandedExamples: current.totalExpandedExamples ?? null,
            duplicatePairs: current.duplicatePairsCount ?? null,
            distinctBaseFamilies: current.distinctBaseFamilies ?? null,
            dataLeakageVerified: current.dataLeakageVerified ?? null,
            categories: current.categories ?? [],
          }
        : null,
      freshness: {
        ageHours: current?.createdAt ? ageInHours(current.createdAt) : null,
        lastTrainingRunAt: lastTrainingRunAt?.toISOString() ?? null,
        recordsSinceLastTraining: recordsSince,
      },
      quality: {
        duplicatePairs: current?.duplicatePairsCount ?? null,
        // Conflicting labels and missing fields are the two reason families the
        // validator emits; both are counted from the quarantine file rather than
        // re-derived, so the dashboard shows the pipeline's own verdict. A missing
        // quarantine file reports `null` ("Not available") rather than a zero that
        // would read as "nothing was quarantined".
        conflictingLabels: quarantineAvailable
          ? countReasons(byReason, ['CONFLICT', 'CROSS_SOURCE_CONFLICT'])
          : null,
        missingFields: quarantineAvailable
          ? countReasons(byReason, [
              'MISSING_CRITICAL_IDENTIFIER',
              'MISSING_PROVENANCE',
              'MISSING_PROVENANCE_SOURCE',
            ])
          : null,
        quarantineTotal: quarantineAvailable
          ? readNumber(quarantine.total)
          : null,
        quarantineByReason: quarantineAvailable ? byReason : [],
        categoryDistribution: readArray(
          distribution.categories,
          'name',
          'count',
        ),
        manufacturerDistribution: readArray(
          distribution.manufacturers,
          'name',
          'count',
        ),
        distinctBaseFamilies:
          readNumber(distribution.distinctBaseFamilies) ??
          current?.distinctBaseFamilies ??
          null,
        validatedRecordCount: readNumber(distribution.recordCount),
      },
      history: (overview.snapshots ?? [])
        .slice(0, DEFAULT_DEPLOYMENT_LIMIT)
        .map((snapshot) => ({
          version: snapshot.datasetVersion,
          generatedAt: snapshot.createdAt ?? null,
          totalRecords: snapshot.totalSourceRecords ?? null,
          trainingRecords: snapshot.trainSize ?? null,
          evaluationRecords: snapshot.valSize ?? null,
        })),
    };
  }

  // ------------------------------------------------------------------- usage

  async getUsage(): Promise<MlUsageDto> {
    const [feedback, findings, runCounts, deploymentCounts, lastRun] =
      await Promise.all([
        this.repository.feedbackTotals(),
        this.repository.findingTotals(),
        this.repository.countTrainingRunsByStatus(),
        this.repository.countDeploymentsByType(),
        this.repository.findLatestRunByStatuses(['PASSED']),
      ]);

    const runCount = (status: TrainingRunStatus) =>
      runCounts.find((row) => row.status === status)?.count ?? 0;
    const activeRuns = runCounts
      .filter((row) => isActiveTrainingRunStatus(row.status))
      .reduce((sum, row) => sum + row.count, 0);

    const recordsSince = lastRun?.completedAt
      ? await this.repository.countFeedbackSince(lastRun.completedAt)
      : null;

    return {
      feedback: {
        total: feedback.total,
        accepted: feedback.accepted,
        rejected: feedback.rejected,
        edited: feedback.edited,
        sinceLastTraining: recordsSince,
        // How many feedback rows the LAST training run actually consumed, taken
        // from the run's own dataset counts rather than recomputed.
        usedInLastTraining: lastRun?.feedbackRecordCount ?? null,
        bySuggestionType: feedback.bySuggestionType,
      },
      findings: {
        total: findings.total,
        pending: findings.pending,
        accepted: findings.accepted,
        rejected: findings.rejected,
        dismissed: findings.dismissed,
        stale: findings.stale,
        applied: findings.applied,
        byIssueCategory: findings.byIssueCategory,
      },
      training: {
        totalRuns: runCounts.reduce((sum, row) => sum + row.count, 0),
        passed: runCount('PASSED'),
        rejected: runCount('REJECTED'),
        failed: runCount('FAILED'),
        active: activeRuns,
        deployments:
          deploymentCounts.find((row) => row.type === 'CANDIDATE')?.count ?? 0,
        rollbacks:
          deploymentCounts.find((row) => row.type === 'ROLLBACK')?.count ?? 0,
      },
      available: { feedback: true, findings: true, training: true },
    };
  }

  // ---------------------------------------------------------------- overview

  async getOverview(): Promise<MlOverviewDto> {
    const [health, models, dataset, usage, latestRun, candidate] =
      await Promise.all([
        this.getHealth(),
        this.getModels(),
        this.getDataset(),
        this.getUsage(),
        this.repository.listTrainingRuns({ limit: 1, offset: 0 }),
        this.findLatestDeployableCandidate(),
      ]);

    const productionStatus: 'RUNNING' | 'RELOAD_PENDING' | 'UNKNOWN' = models
      .running.reloadPending
      ? 'RELOAD_PENDING'
      : models.running.loaded
        ? 'RUNNING'
        : 'UNKNOWN';

    const productionModel = models.available
      ? {
          artifactVersion: models.production.artifactVersion,
          runningVersion: models.running.version,
          reloadPending: models.running.reloadPending,
          deployedAt: models.production.deployedAt,
          datasetVersion:
            models.versions.find(
              (version) =>
                version.version === models.production.artifactVersion,
            )?.datasetVersion ?? null,
          status: productionStatus,
        }
      : null;

    return {
      health,
      productionModel,
      latestRun: latestRun.rows[0] ? this.toSummary(latestRun.rows[0]) : null,
      candidate,
      dataset: dataset.current,
      counts: {
        feedback: usage.feedback.total,
        findings: usage.findings.total,
        trainingRuns: usage.training.totalRuns,
        deployedModels: usage.training.deployments,
      },
    };
  }

  private async findLatestDeployableCandidate(): Promise<
    MlOverviewDto['candidate']
  > {
    const passed = await this.repository.listTrainingRuns({
      status: 'PASSED',
      limit: 1,
      offset: 0,
    });
    const run = passed.rows[0];
    if (!run) return null;
    return {
      runId: run.id,
      modelVersion: run.candidateModelVersion,
      promotionEligible: readGateEligibility(run.gateSummary),
      deployable: run.deploymentStatus === 'NOT_DEPLOYED',
      deployed: run.deploymentStatus !== 'NOT_DEPLOYED',
    };
  }

  // ----------------------------------------------------------- training runs

  async listTrainingRuns(
    query: ListTrainingRunsQueryDto,
  ): Promise<MlTrainingRunPageDto> {
    const page = query.page ?? 1;
    const pageSize = Math.min(
      query.pageSize ?? DEFAULT_TRAINING_RUN_PAGE_SIZE,
      MAX_TRAINING_RUN_PAGE_SIZE,
    );

    await this.reconcileActiveRun();

    const { rows, total } = await this.repository.listTrainingRuns({
      status: query.status,
      candidateModelVersion: query.candidateModelVersion,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    return {
      items: rows.map((row) => this.toSummary(row)),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getTrainingRun(id: string): Promise<MlTrainingRunDetailDto> {
    let run = await this.repository.findTrainingRun(id);
    if (!run) {
      throw new NotFoundException('Training run not found');
    }
    if (isActiveTrainingRunStatus(run.status)) {
      run = (await this.reconcileRun(run)) ?? run;
    }
    return this.toDetail(run);
  }

  /**
   * Triggers a training run.
   *
   * Order matters and is the whole safety argument:
   *
   *  1. the durable row is created FIRST, so a run can never execute without a
   *     record that the dashboard can show — even if the API dies immediately after
   *     dispatching it;
   *  2. the row is created as `QUEUED` and the database's partial unique index
   *     rejects a second active row, so two operators (or two API replicas) cannot
   *     start two pipelines that would overwrite each other's registry version;
   *  3. only then is the ML service asked to start the job, and a dispatch failure
   *     is recorded on the row (`DISPATCH_FAILED`) instead of being swallowed.
   *
   * Nothing here waits for training: the response returns the run id while the
   * pipeline keeps running, so a closed browser tab or a restarted API client
   * cannot stop it.
   */
  async triggerTrainingRun(actor: MlOpsActor): Promise<MlTrainingRunDetailDto> {
    const models = await this.mlClient.mlOpsModels();
    if (!models.ok) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        reason: models.kind === 'DISABLED' ? 'ML_DISABLED' : 'ML_UNAVAILABLE',
        message:
          models.kind === 'DISABLED'
            ? 'The ML service is disabled in this deployment, so training cannot be started.'
            : 'The ML service is unreachable, so training cannot be started.',
      });
    }

    let created: MlTrainingRun;
    try {
      const inserted = await this.repository.insertTrainingRun({
        status: 'QUEUED',
        triggeredByUserId: actor.id,
        triggeredByEmail: actor.email,
        baseModelVersion: models.data.active?.artifactVersion ?? null,
        trainingCodeVersion: null,
      });
      if (!inserted) {
        throw new ServiceUnavailableException({
          statusCode: 503,
          reason: 'DISPATCH_FAILED',
          message: 'The training run record could not be created.',
        });
      }
      created = inserted;
    } catch (error) {
      if (error instanceof ActiveTrainingRunExistsError) {
        throw new MlOpsConflictError(
          'TRAINING_ALREADY_ACTIVE',
          'A training run is already active. Wait for it to finish before starting another.',
        );
      }
      throw error;
    }

    const dispatched = await this.mlClient.mlOpsStartTrainingRun({
      runId: created.id,
      requestedBy: actor.email,
    });

    if (!dispatched.ok) {
      await this.repository.updateTrainingRun(created.id, {
        status: 'FAILED',
        completedAt: new Date(),
        errorCode:
          dispatched.kind === 'CONFLICT' ? 'ML_BUSY' : 'DISPATCH_FAILED',
        errorMessage: dispatched.message,
      });
      await this.recordAudit(ML_OPS_AUDIT_ACTIONS.TRAINING_TRIGGERED, actor, {
        runId: created.id,
        outcome: 'REFUSED',
        reason: dispatched.kind,
      });
      if (dispatched.kind === 'CONFLICT') {
        throw new MlOpsConflictError(
          'TRAINING_ALREADY_ACTIVE',
          'The ML service is already running a training job.',
        );
      }
      throw new ServiceUnavailableException({
        statusCode: 503,
        reason: 'DISPATCH_FAILED',
        message: `The training job could not be started: ${dispatched.message}`,
      });
    }

    await this.applyRunnerPayload(created.id, dispatched.data);
    await this.recordAudit(ML_OPS_AUDIT_ACTIONS.TRAINING_TRIGGERED, actor, {
      runId: created.id,
      candidateModelVersion: dispatched.data.candidateVersion ?? null,
      baseModelVersion: models.data.active?.artifactVersion ?? null,
    });

    // The state is read back WITHOUT reconciling: the trigger response reports what
    // the dispatch produced (`RUNNING`, with the allocated candidate version) and
    // does not wait for a poll. Waiting here would turn the asynchronous contract
    // into a synchronous one for slow runs.
    const dispatchedRun = await this.repository.findTrainingRun(created.id);
    return this.toDetail(dispatchedRun ?? created);
  }

  // -------------------------------------------------------------- deployment

  /**
   * Promotes the candidate produced by a run.
   *
   * Every gate is re-checked here even though the ML service checks them too. The
   * duplication is deliberate: the API must refuse a failed candidate on its own
   * evidence (the run row it stored), so a candidate can never be promoted by
   * calling the ML endpoint with a hand-made request — and a run whose status is
   * anything other than `PASSED` is refused before any HTTP call is made.
   */
  async deployCandidate(
    runId: string,
    actor: MlOpsActor,
    request: { expectedCandidateVersion?: string } = {},
  ): Promise<MlTrainingRunDetailDto> {
    const run = await this.repository.findTrainingRun(runId);
    if (!run) throw new NotFoundException('Training run not found');

    if (isActiveTrainingRunStatus(run.status)) {
      throw new MlOpsConflictError(
        'RUN_NOT_FINISHED',
        'The training run has not finished yet.',
      );
    }
    // Revision gate: the caller approved a specific candidate. If the run's
    // candidate changed since (which can only happen through a re-run of the same
    // id), the approval no longer describes what would be promoted.
    if (
      request.expectedCandidateVersion &&
      request.expectedCandidateVersion !== run.candidateModelVersion
    ) {
      throw new MlOpsConflictError(
        'CANDIDATE_NOT_READY',
        `This run now proposes ${run.candidateModelVersion ?? 'no candidate'}, not ${request.expectedCandidateVersion}. Re-read the run before deploying.`,
      );
    }
    if (run.status !== 'PASSED') {
      throw new MlOpsConflictError(
        'CANDIDATE_NOT_ELIGIBLE',
        `Only a candidate that passed every quality gate can be deployed. This run is ${run.status}.`,
      );
    }
    if (readGateEligibility(run.gateSummary) !== true) {
      throw new MlOpsConflictError(
        'CANDIDATE_NOT_ELIGIBLE',
        'This run has no passing gate record, so its candidate cannot be deployed.',
      );
    }
    if (run.deploymentStatus !== 'NOT_DEPLOYED') {
      throw new MlOpsConflictError(
        'CANDIDATE_NOT_READY',
        'This candidate has already been deployed.',
      );
    }

    const outcome = await this.mlClient.mlOpsDeployCandidate(runId);
    if (!outcome.ok) {
      await this.repository.updateTrainingRun(runId, {
        deploymentStatus: 'DEPLOYMENT_FAILED',
        errorCode: outcome.reason ?? 'DEPLOYMENT_FAILED',
        errorMessage: outcome.message,
      });
      await this.recordAudit(ML_OPS_AUDIT_ACTIONS.CANDIDATE_DEPLOYED, actor, {
        runId,
        candidateModelVersion: run.candidateModelVersion,
        outcome: 'FAILED',
        reason: outcome.reason ?? outcome.kind,
      });
      throw this.deploymentFailure(outcome);
    }

    return this.recordSuccessfulDeployment(runId, run, outcome.data, actor);
  }

  /**
   * Rolls production back to the previous artifact.
   *
   * Only reachable because the existing promotion tool keeps a `.backup` and
   * implements the restore; when no backup exists the request is refused rather
   * than faked. The resulting deployment is recorded as a `ROLLBACK` entry so the
   * history shows what was running before and after.
   */
  async rollback(actor: MlOpsActor): Promise<MlDeploymentRecordDto> {
    const models = await this.mlClient.mlOpsModels();
    if (!models.ok) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        reason: models.kind === 'DISABLED' ? 'ML_DISABLED' : 'ML_UNAVAILABLE',
        message:
          'The ML service is unreachable, so rollback cannot be performed.',
      });
    }
    if (!models.data.active?.rollbackAvailable) {
      throw new MlOpsConflictError(
        'NO_ROLLBACK_ARTIFACT',
        'No previous production artifact is available to roll back to.',
      );
    }

    const outcome = await this.mlClient.mlOpsRollback();
    if (!outcome.ok) {
      await this.recordAudit(ML_OPS_AUDIT_ACTIONS.MODEL_ROLLED_BACK, actor, {
        outcome: 'FAILED',
        reason: outcome.reason ?? outcome.kind,
        previousModelVersion: models.data.active.artifactVersion ?? null,
      });
      throw this.deploymentFailure(outcome);
    }

    const deployment = await this.repository.insertDeployment({
      trainingRunId: null,
      modelVersion: outcome.data.artifactVersion ?? 'UNIDENTIFIED',
      previousModelVersion: outcome.data.previousVersion ?? null,
      deploymentType: 'ROLLBACK',
      status: outcome.data.reloadPending
        ? 'DEPLOYED_PENDING_RELOAD'
        : 'DEPLOYED',
      artifactFingerprint: outcome.data.artifactSha256 ?? null,
      runningModelVersion: outcome.data.runningVersion ?? null,
      reloadPending: Boolean(outcome.data.reloadPending),
      deployedByUserId: actor.id,
      deployedByEmail: actor.email,
      details: {
        restoredVersion: outcome.data.restoredVersion ?? null,
        deploymentMetadataStale: Boolean(outcome.data.deploymentMetadataStale),
        reloadError: outcome.data.reloadError ?? null,
      },
    });
    if (!deployment) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        reason: 'ROLLBACK_FAILED',
        message:
          'The rollback was performed by the ML service but its record could not be stored.',
      });
    }

    await this.recordAudit(ML_OPS_AUDIT_ACTIONS.MODEL_ROLLED_BACK, actor, {
      modelVersion: deployment.modelVersion,
      previousModelVersion: deployment.previousModelVersion,
      runningModelVersion: deployment.runningModelVersion,
      reloadPending: deployment.reloadPending,
      deploymentId: deployment.id,
    });

    return this.toDeploymentRecord(deployment);
  }

  /**
   * Re-reads the production artifact into the running process.
   *
   * Writes nothing and changes no version: it exists so a `reloadPending` state can
   * be closed without restarting the ML container, and so the dashboard never has to
   * claim a deployment took effect when it did not.
   */
  async reloadModel(actor: MlOpsActor): Promise<MlModelsDto> {
    const outcome = await this.mlClient.mlOpsReloadModel();
    if (!outcome.ok) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        reason: outcome.kind === 'DISABLED' ? 'ML_DISABLED' : 'ML_UNAVAILABLE',
        message:
          'The ML service is unreachable, so the model cannot be reloaded.',
      });
    }
    await this.recordAudit(ML_OPS_AUDIT_ACTIONS.MODEL_RELOADED, actor, {
      runningModelVersion: outcome.data.runningVersion ?? null,
      reloadPending: Boolean(outcome.data.reloadPending),
      reloadError: outcome.data.reloadError ?? null,
    });
    return this.getModels();
  }

  private async recordSuccessfulDeployment(
    runId: string,
    run: MlTrainingRun,
    payload: MlModelDeploymentPayload,
    actor: MlOpsActor,
  ): Promise<MlTrainingRunDetailDto> {
    const reloadPending = Boolean(payload.reloadPending);
    const deploymentStatus: DeploymentStatus = reloadPending
      ? 'DEPLOYED_PENDING_RELOAD'
      : 'DEPLOYED';

    await this.repository.updateTrainingRun(runId, { deploymentStatus });
    const deployment = await this.repository.insertDeployment({
      trainingRunId: runId,
      modelVersion:
        payload.artifactVersion ?? run.candidateModelVersion ?? 'UNKNOWN',
      previousModelVersion:
        payload.previousVersion ?? run.baseModelVersion ?? null,
      deploymentType: 'CANDIDATE',
      status: reloadPending ? 'DEPLOYED_PENDING_RELOAD' : 'DEPLOYED',
      artifactFingerprint: payload.artifactSha256 ?? null,
      runningModelVersion: payload.runningVersion ?? null,
      reloadPending,
      deployedByUserId: actor.id,
      deployedByEmail: actor.email,
      details: { reloadError: payload.reloadError ?? null },
    });
    if (!deployment) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        reason: 'DEPLOYMENT_FAILED',
        message:
          'The candidate was promoted by the ML service but its deployment record could not be stored.',
      });
    }

    await this.recordAudit(ML_OPS_AUDIT_ACTIONS.CANDIDATE_DEPLOYED, actor, {
      runId,
      modelVersion: deployment.modelVersion,
      previousModelVersion: deployment.previousModelVersion,
      runningModelVersion: deployment.runningModelVersion,
      reloadPending,
      deploymentId: deployment.id,
    });

    return this.getTrainingRun(runId);
  }

  private deploymentFailure(
    outcome: Extract<MlOpsCallOutcome<unknown>, { ok: false }>,
  ): ConflictException | ServiceUnavailableException {
    if (outcome.kind === 'CONFLICT') {
      return new MlOpsConflictError(
        (outcome.reason as MlOpsRefusalReason) ?? 'DEPLOYMENT_FAILED',
        outcome.message,
      );
    }
    if (outcome.kind === 'NOT_FOUND') {
      return new MlOpsConflictError(
        'CANDIDATE_NOT_READY',
        'The ML service does not know this candidate any more.',
      );
    }
    return new ServiceUnavailableException({
      statusCode: 503,
      reason: outcome.kind === 'DISABLED' ? 'ML_DISABLED' : 'ML_UNAVAILABLE',
      message: outcome.message,
    });
  }

  // ----------------------------------------------------------- reconciliation

  /**
   * Polls the ML service once for the active run and stores what it reports.
   *
   * Called from reads only while a run is active, which is what keeps the dashboard
   * live without a background job and stops polling the moment a run is terminal.
   * A run the ML service no longer knows about (its process restarted) is closed as
   * `FAILED` / `ML_JOB_LOST` rather than left "running" forever — the candidate
   * artifact may exist, but nothing is progressing, and a candidate that cannot be
   * proven to have passed its gates must not look deployable.
   */
  private async reconcileActiveRun(): Promise<void> {
    const active = await this.repository.findActiveTrainingRun();
    if (!active) return;
    await this.reconcileRun(active);
  }

  private async reconcileRun(
    run: MlTrainingRun,
  ): Promise<MlTrainingRun | null> {
    const outcome = await this.mlClient.mlOpsTrainingRun(run.id);
    if (outcome.ok) {
      return this.applyRunnerPayload(run.id, outcome.data);
    }
    if (outcome.kind === 'NOT_FOUND') {
      return this.repository.finishTrainingRunIfActive(run.id, {
        status: 'FAILED',
        completedAt: new Date(),
        errorCode: 'ML_JOB_LOST',
        errorMessage:
          'The ML service no longer reports this run. It was most likely restarted while training; the current production model was not changed.',
      });
    }
    // Unreachable/disabled/error: the run may genuinely still be progressing, so
    // the row is left active and the next read tries again. Reporting a failure
    // here would be a guess.
    this.logger.warn(
      `Could not poll training run ${run.id}: ${outcome.kind} — ${outcome.message}`,
    );
    return null;
  }

  private async applyRunnerPayload(
    runId: string,
    payload: MlTrainingRunPayload,
  ): Promise<MlTrainingRun | null> {
    const status = isKnownStatus(payload.status) ? payload.status : 'RUNNING';
    const terminal = !isActiveTrainingRunStatus(status);
    const update = {
      status,
      candidateModelVersion: payload.candidateVersion ?? null,
      baseModelVersion: payload.baseModelVersion ?? null,
      trainingCodeVersion: payload.pipelineVersion ?? null,
      datasetVersion: payload.datasetVersion ?? null,
      datasetFingerprint: payload.datasetFingerprint ?? null,
      datasetRecordCount: payload.datasetRecordCount ?? null,
      feedbackRecordCount: payload.feedbackRecordCount ?? null,
      trainingRecordCount: payload.trainingRecordCount ?? null,
      validationRecordCount: payload.validationRecordCount ?? null,
      quarantineRecordCount: payload.quarantineRecordCount ?? null,
      evaluationSummary: payload.evaluationSummary ?? null,
      gateSummary: payload.gateSummary ?? null,
      errorCode: payload.errorCode ?? null,
      errorMessage: payload.errorMessage ?? null,
      logExcerpt: boundedLogExcerpt(payload.log),
      artifactReference: payload.artifactReference ?? null,
      startedAt: payload.startedAt ? new Date(payload.startedAt) : null,
      completedAt:
        terminal && payload.completedAt ? new Date(payload.completedAt) : null,
    };

    if (terminal) {
      return this.repository.finishTrainingRunIfActive(runId, update);
    }
    return this.repository.updateTrainingRun(runId, update);
  }

  // --------------------------------------------------------------- projections

  private toSummary(run: MlTrainingRun): MlTrainingRunSummaryDto {
    return {
      id: run.id,
      status: run.status as TrainingRunStatus,
      phase:
        run.status === 'PASSED' ||
        run.status === 'REJECTED' ||
        run.status === 'FAILED'
          ? 'COMPLETED'
          : inferPhase(run.status),
      triggeredAt: run.triggeredAt.toISOString(),
      startedAt: run.startedAt?.toISOString() ?? null,
      completedAt: run.completedAt?.toISOString() ?? null,
      durationMs:
        run.startedAt && run.completedAt
          ? run.completedAt.getTime() - run.startedAt.getTime()
          : null,
      triggeredByEmail: run.triggeredByEmail,
      baseModelVersion: run.baseModelVersion,
      candidateModelVersion: run.candidateModelVersion,
      datasetVersion: run.datasetVersion,
      datasetFingerprint: run.datasetFingerprint,
      trainingRecordCount: run.trainingRecordCount,
      validationRecordCount: run.validationRecordCount,
      promotionEligible: readGateEligibility(run.gateSummary),
      deploymentStatus: run.deploymentStatus as DeploymentStatus,
    };
  }

  private async toDetail(run: MlTrainingRun): Promise<MlTrainingRunDetailDto> {
    const models = await this.mlClient.mlOpsModels();
    const version = run.candidateModelVersion
      ? models.ok
        ? models.data.versions.find(
            (item) => item.version === run.candidateModelVersion,
          )
        : undefined
      : undefined;

    const deployments = await this.repository.listDeployments(
      DEFAULT_DEPLOYMENT_LIMIT,
    );
    const deployment =
      deployments.find((row) => row.trainingRunId === run.id) ?? null;

    return {
      ...this.toSummary(run),
      dataset: {
        version: run.datasetVersion,
        fingerprint: run.datasetFingerprint,
        recordCount: run.datasetRecordCount,
        feedbackRecordCount: run.feedbackRecordCount,
        trainingRecordCount: run.trainingRecordCount,
        validationRecordCount: run.validationRecordCount,
        quarantineRecordCount: run.quarantineRecordCount,
      },
      evaluation: readMetrics(run.evaluationSummary),
      gates: readGates(run.gateSummary),
      artifact: {
        reference: run.artifactReference,
        // The checksum comes from the registry listing, so it is the artifact's real
        // identity rather than a value the run remembered.
        checksum: version?.artifactSha256 ?? null,
        exists: Boolean(version?.artifactExists),
        deployable: Boolean(version?.deployable) && run.status === 'PASSED',
      },
      deployment: {
        status: run.deploymentStatus as DeploymentStatus,
        modelVersion: deployment?.modelVersion ?? run.candidateModelVersion,
        deployedAt: deployment?.deployedAt.toISOString() ?? null,
        deployedByEmail: deployment?.deployedByEmail ?? null,
        previousModelVersion:
          deployment?.previousModelVersion ?? run.baseModelVersion,
        runningModelVersion: deployment?.runningModelVersion ?? null,
        reloadPending: Boolean(deployment?.reloadPending),
        reloadError: readString(deployment?.details?.reloadError),
      },
      failure: {
        errorCode: run.errorCode,
        errorMessage: run.errorMessage,
        logExcerpt: run.logExcerpt,
      },
      cancellable: false,
    };
  }

  private toModelVersion(
    version: MlModelRegistryResponse['versions'][number],
    run: {
      id: string;
      datasetVersion: string | null;
      runDeployable: boolean;
    } | null,
  ): MlModelVersionDto {
    const evaluation = version.evaluation ?? null;
    return {
      version: version.version,
      createdAt: version.createdAt ?? null,
      artifactExists: version.artifactExists,
      artifactChecksum: version.artifactSha256 ?? null,
      artifactSizeBytes: version.artifactSizeBytes ?? null,
      championModel: version.championModel ?? null,
      // The registry only records the dataset when `run_training.py` wrote
      // `pipeline_summary.json`. A run driven by the control plane calls the pipeline
      // steps directly, so the dataset version it built lives in the run record — and
      // "which data trained this model" must still be answerable.
      datasetVersion: version.datasetVersion ?? run?.datasetVersion ?? null,
      deployable: version.deployable,
      runDeployable: Boolean(version.deployable && run?.runDeployable),
      metrics: readMetrics(evaluation?.metrics),
      gates: readGates(evaluation),
      trainingRunId: run?.id ?? null,
    };
  }

  private toDeploymentRecord(row: MlModelDeployment): MlDeploymentRecordDto {
    return {
      id: row.id,
      modelVersion: row.modelVersion,
      previousModelVersion: row.previousModelVersion,
      deploymentType:
        row.deploymentType as MlDeploymentRecordDto['deploymentType'],
      status: row.status as DeploymentStatus,
      runningModelVersion: row.runningModelVersion,
      reloadPending: row.reloadPending,
      deployedByEmail: row.deployedByEmail,
      deployedAt: row.deployedAt.toISOString(),
      trainingRunId: row.trainingRunId,
    };
  }

  /**
   * Best-effort security audit, matching the existing ML apply services.
   *
   * Post-commit and failure-tolerant: `SecurityAuditService` writes with the root
   * client and is not transaction-aware, so a failed audit write must not roll back
   * a completed operation. The failure is logged.
   */
  private async recordAudit(
    action: string,
    actor: MlOpsActor,
    details: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.securityAudit.record({
        action,
        category: AUDIT_CATEGORY,
        userId: actor.id,
        userEmail: actor.email,
        details,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record ${action} in the security audit log: ${String(error)}`,
      );
    }
  }
}

// -------------------------------------------------------------------- helpers

function isKnownStatus(status: string): status is TrainingRunStatus {
  return (
    status === 'QUEUED' ||
    status === 'RUNNING' ||
    status === 'EVALUATING' ||
    status === 'PASSED' ||
    status === 'REJECTED' ||
    status === 'FAILED' ||
    status === 'CANCELLED'
  );
}

/**
 * Derives the display phase from a stored status.
 *
 * Only used for rows whose phase was not stored (e.g. a run that failed before its
 * first successful poll). It is a function of the status, never a fabricated
 * progress fraction.
 */
function inferPhase(status: string): TrainingPhase | null {
  if (status === 'QUEUED') return 'PREPARING_DATASET';
  if (status === 'RUNNING') return 'TRAINING';
  if (status === 'EVALUATING') return 'EVALUATING';
  return null;
}

function readGateEligibility(
  gateSummary: Record<string, unknown> | null,
): boolean | null {
  if (!gateSummary) return null;
  const value = gateSummary.promotionEligible;
  return typeof value === 'boolean' ? value : null;
}

function readGates(summary: Record<string, unknown> | null): MlGateSummaryDto {
  if (!summary) {
    return { gates: [], promotionEligible: false, unavailable: true };
  }
  // Two shapes reach this reader, and both are the pipeline's own:
  //  - a training run stores `gateSummary` as `{gates, thresholds, promotionEligible}`
  //    (built by the runner from the evaluator's output);
  //  - the registry's `evaluation_report.json` stores the evaluator's raw shape,
  //    which names the verdicts `qualityGates` and has no threshold table.
  // Reading only the first shape made every registry version report "Not available"
  // for gates it had actually recorded.
  const gates = summary.gates ?? summary.qualityGates;
  if (!gates || typeof gates !== 'object') {
    return { gates: [], promotionEligible: false, unavailable: true };
  }
  const thresholds =
    summary?.thresholds && typeof summary.thresholds === 'object'
      ? (summary.thresholds as Record<string, unknown>)
      : {};
  const results: MlGateResultDto[] = Object.entries(
    gates as Record<string, unknown>,
  ).map(([gate, passed]) => {
    const threshold =
      thresholds[gate] && typeof thresholds[gate] === 'object'
        ? (thresholds[gate] as Record<string, unknown>)
        : null;
    const value =
      typeof threshold?.minimum === 'number'
        ? threshold.minimum
        : typeof threshold?.maximum === 'number'
          ? threshold.maximum
          : undefined;
    return {
      gate,
      passed: passed === true,
      description:
        typeof threshold?.description === 'string'
          ? threshold.description
          : undefined,
      threshold: value,
    };
  });
  return {
    gates: results,
    promotionEligible: readGateEligibility(summary) ?? false,
    unavailable: results.length === 0,
  };
}

/**
 * Reads the evaluation metrics that exist.
 *
 * Only fields the evaluator actually produces are copied; anything absent stays
 * absent so the dashboard renders "Not available" instead of a zero that would look
 * like a measured result.
 */
function readMetrics(value: unknown): MlEvaluationMetricsDto | null {
  if (!value || typeof value !== 'object') return null;
  const metrics = value as Record<string, unknown>;
  const latency =
    metrics.latencyMs && typeof metrics.latencyMs === 'object'
      ? (metrics.latencyMs as Record<string, unknown>)
      : null;
  const result: MlEvaluationMetricsDto = {
    candidateTop1Accuracy:
      readNumber(metrics.candidateTop1Accuracy) ?? undefined,
    candidateTop3Accuracy:
      readNumber(metrics.candidateTop3Accuracy) ?? undefined,
    activeModelTop1Accuracy:
      readNumber(metrics.activeModelTop1Accuracy) ?? undefined,
    activeModelTop3Accuracy:
      readNumber(metrics.activeModelTop3Accuracy) ?? undefined,
    manufacturerAccuracy: readNumber(metrics.manufacturerAccuracy) ?? undefined,
    duplicatePrecision: readNumber(metrics.duplicatePrecision) ?? undefined,
    duplicateRecall: readNumber(metrics.duplicateRecall) ?? undefined,
    criticalFalsePositives:
      readNumber(metrics.criticalFalsePositives) ?? undefined,
    modelSizeBytes: readNumber(metrics.modelSizeBytes) ?? undefined,
    peakMemoryMb: readNumber(metrics.peakMemoryMb) ?? undefined,
    unverifiedProvenanceCount:
      readNumber(metrics.unverifiedProvenanceCount) ?? undefined,
  };
  if (latency) {
    result.latencyMs = {
      p50: readNumber(latency.p50) ?? undefined,
      p95: readNumber(latency.p95) ?? undefined,
      p99: readNumber(latency.p99) ?? undefined,
    };
  }
  return result;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readArray(
  value: unknown,
  nameKey: string,
  countKey: string,
): Array<{ name: string; count: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const name = typeof record[nameKey] === 'string' ? record[nameKey] : null;
      const count = readNumber(record[countKey]);
      return name && count !== null ? { name, count } : null;
    })
    .filter(
      (entry): entry is { name: string; count: number } => entry !== null,
    );
}

/** Quarantine reason counts, keyed by the validator's own reason code. */
function readReasons(value: unknown): Array<{ reason: string; count: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const reason = readString(record.reason);
      const count = readNumber(record.count);
      return reason && count !== null ? { reason, count } : null;
    })
    .filter(
      (entry): entry is { reason: string; count: number } => entry !== null,
    );
}

/**
 * Sums the reason families that start with one of `prefixes`.
 *
 * The validator writes reasons as `CODE: detail` (e.g.
 * `MISSING_CRITICAL_IDENTIFIER: Empty MPN`), so a prefix match is what groups
 * them; the ML service already reduced each reason to its code, and the prefix
 * comparison keeps working if it ever stops doing so.
 */
function countReasons(
  reasons: Array<{ reason: string; count: number }>,
  prefixes: string[],
): number {
  return reasons
    .filter((entry) =>
      prefixes.some((prefix) =>
        entry.reason.toUpperCase().startsWith(prefix.toUpperCase()),
      ),
    )
    .reduce((sum, entry) => sum + entry.count, 0);
}

function ageInHours(isoTimestamp: string): number | null {
  const parsed = Date.parse(isoTimestamp);
  if (Number.isNaN(parsed)) return null;
  return Math.round(((Date.now() - parsed) / 3_600_000) * 10) / 10;
}

/**
 * Bounds the stored log excerpt.
 *
 * The runner already caps its own log, but this is the value that lands in a
 * `text` column, so the limit is enforced on the way in rather than trusted.
 */
function boundedLogExcerpt(log: string[] | undefined): string | null {
  if (!Array.isArray(log) || log.length === 0) return null;
  const joined = log.slice(-40).join('\n');
  return joined.length > 4000 ? joined.slice(joined.length - 4000) : joined;
}
