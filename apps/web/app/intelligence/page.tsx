"use client";

import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import {
  MlActiveRunPanel,
  MlDatasetsPanel,
  MlModelsPanel,
  MlOpsConfirmations,
  MlOverviewPanel,
  MlRunDetailPanel,
  MlRunsPanel,
  MlUsagePanel,
} from "@/components/ml-ops/ml-ops-panels";
import { PermissionGuard, useAuth } from "@/lib/auth/auth-context";
import { ApiError } from "@/lib/api-client";
import {
  mlOpsApi,
  type MlDatasetDto,
  type MlDeploymentRecordDto,
  type MlModelsDto,
  type MlOverviewDto,
  type MlTrainingRunDetailDto,
  type MlTrainingRunPageDto,
  type MlUsageDto,
  type TrainingRunStatus,
} from "@/lib/api/ml-ops-api";
import {
  ML_OPS_HISTORY_PAGE_SIZE,
  ML_OPS_PERMISSION,
  ML_OPS_POLL_INTERVAL_MS,
  ML_OPS_TABS,
  type MlTabId,
  shouldPoll,
} from "@/lib/ml-ops";

/**
 * ML & Intelligence (`/intelligence`).
 *
 * The operator control plane for the ML service: is it healthy, what model is
 * running, what data trained it, how much feedback exists, what happened in the last
 * run, is there a candidate, did it pass its gates, and can it be deployed.
 *
 * Reached from the Administration module in the sidebar. Administrator-only: the
 * page requires `Administration.Roles`, and so does every `/ml/ops/*` route it calls.
 *
 * ### What this page deliberately does not do
 *
 *  - It never estimates progress. An active run shows the pipeline's real phases.
 *  - It never says "production model updated" from a file copy: the deployed
 *    artifact version and the RUNNING model version are shown side by side, and a
 *    deployment whose reload has not happened is labelled as pending.
 *  - It never renders a missing metric as zero. Anything the pipeline did not
 *    produce reads "Not available".
 *  - It offers no cancel control, because a running training job cannot be
 *    interrupted safely. The run detail says so instead of showing a dead button.
 *  - It polls only while a run is active, and stops as soon as the run is terminal.
 */
export default function MlOperationsPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission(ML_OPS_PERMISSION);

  const [activeTab, setActiveTab] = React.useState<MlTabId>("overview");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const [overview, setOverview] = React.useState<MlOverviewDto | null>(null);
  const [models, setModels] = React.useState<MlModelsDto | null>(null);
  const [dataset, setDataset] = React.useState<MlDatasetDto | null>(null);
  const [usage, setUsage] = React.useState<MlUsageDto | null>(null);

  const [runs, setRuns] = React.useState<MlTrainingRunPageDto | null>(null);
  const [runStatusFilter, setRunStatusFilter] = React.useState<
    TrainingRunStatus | "ALL"
  >("ALL");
  const [runPage, setRunPage] = React.useState(1);
  const [runsLoading, setRunsLoading] = React.useState(false);

  const [detail, setDetail] = React.useState<MlTrainingRunDetailDto | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  const [pendingRetrain, setPendingRetrain] = React.useState<{
    currentModelVersion: string | null | undefined;
    datasetVersion: string | null | undefined;
    feedbackRecordCount: number | null | undefined;
    lastTrainedAt: string | null | undefined;
  } | null>(null);
  const [pendingDeploy, setPendingDeploy] = React.useState<{
    runId: string;
    currentVersion: string | null;
    candidateVersion: string | null;
  } | null>(null);
  const [pendingRollback, setPendingRollback] = React.useState<string | null>(null);

  const loadOverview = React.useCallback(async () => {
    const [overviewData, datasetData, usageData] = await Promise.all([
      mlOpsApi.getOverview(),
      mlOpsApi.getDataset(),
      mlOpsApi.getUsage(),
    ]);
    setOverview(overviewData);
    setDataset(datasetData);
    setUsage(usageData);
  }, []);

  const loadModels = React.useCallback(async () => {
    setModels(await mlOpsApi.getModels());
  }, []);

  const loadRuns = React.useCallback(
    async (page: number, status: TrainingRunStatus | "ALL") => {
      setRunsLoading(true);
      try {
        const pageData = await mlOpsApi.listTrainingRuns({
          page,
          pageSize: ML_OPS_HISTORY_PAGE_SIZE,
          status: status === "ALL" ? undefined : status,
        });
        setRuns(pageData);
      } finally {
        setRunsLoading(false);
      }
    },
    [],
  );

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadOverview(), loadModels(), loadRuns(runPage, runStatusFilter)]);
    } catch (err: unknown) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to load ML operations data.",
      );
    } finally {
      setLoading(false);
    }
  }, [loadOverview, loadModels, loadRuns, runPage, runStatusFilter]);

  React.useEffect(() => {
    void loadAll();
    // Only on mount: every other refresh is an explicit action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll only while a run is active; the moment it is terminal the timer is gone.
  const activeRun = React.useMemo(() => {
    if (!overview) return null;
    const latest = overview.latestRun;
    return shouldPoll(latest) ? latest : null;
  }, [overview]);

  React.useEffect(() => {
    if (!activeRun) return undefined;
    const timer = window.setInterval(() => {
      void loadOverview();
      void loadRuns(runPage, runStatusFilter);
    }, ML_OPS_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [activeRun, loadOverview, loadRuns, runPage, runStatusFilter]);

  const runAction = React.useCallback(
    async (action: () => Promise<string>) => {
      setBusy(true);
      setActionError(null);
      setNotice(null);
      try {
        const message = await action();
        setNotice(message);
        await Promise.all([loadOverview(), loadModels(), loadRuns(runPage, runStatusFilter)]);
      } catch (err: unknown) {
        setActionError(
          err instanceof ApiError
            ? err.message
            : "The operation did not complete.",
        );
      } finally {
        setBusy(false);
      }
    },
    [loadOverview, loadModels, loadRuns, runPage, runStatusFilter],
  );

  const openRun = React.useCallback(async (runId: string) => {
    setDetailLoading(true);
    setActionError(null);
    try {
      setDetail(await mlOpsApi.getTrainingRun(runId));
    } catch (err: unknown) {
      setActionError(
        err instanceof ApiError ? err.message : "Failed to load the training run.",
      );
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const confirmRetrain = React.useCallback(() => {
    setPendingRetrain(null);
    void runAction(async () => {
      const run = await mlOpsApi.triggerTrainingRun();
      return `Training started. Run ${run.id.slice(0, 8)} is ${run.status.toLowerCase()}. ${run.candidateModelVersion ? `Candidate v${run.candidateModelVersion} is being produced.` : ""}`.trim();
    });
  }, [runAction]);

  const confirmDeploy = React.useCallback(() => {
    const target = pendingDeploy;
    setPendingDeploy(null);
    if (!target) return;
    void runAction(async () => {
      const run = await mlOpsApi.deployCandidate(
        target.runId,
        target.candidateVersion ?? undefined,
      );
      const running = run.deployment.runningModelVersion;
      return run.deployment.reloadPending
        ? `Deployed ${target.candidateVersion ?? "the candidate"}, but the ML service is still serving ${running ? `v${running}` : "the previous model"}. Reload the running model to finish.`
        : `Deployed ${target.candidateVersion ?? "the candidate"}. The running model is now ${running ? `v${running}` : "updated"}.`;
    });
  }, [pendingDeploy, runAction]);

  const confirmRollback = React.useCallback(() => {
    setPendingRollback(null);
    void runAction(async () => {
      const deployment: MlDeploymentRecordDto = await mlOpsApi.rollback();
      return `Rolled back to ${deployment.modelVersion ? `v${deployment.modelVersion}` : "the previous artifact"}.`;
    });
  }, [runAction]);

  const changeStatusFilter = React.useCallback(
    (status: TrainingRunStatus | "ALL") => {
      setRunStatusFilter(status);
      setRunPage(1);
      void loadRuns(1, status);
    },
    [loadRuns],
  );

  const changePage = React.useCallback(
    (page: number) => {
      setRunPage(page);
      void loadRuns(page, runStatusFilter);
    },
    [loadRuns, runStatusFilter],
  );

  return (
    <PermissionGuard
      permission={ML_OPS_PERMISSION}
      fallback={
        <div className="space-y-6">
          <PageHeader
            title="ML & Intelligence"
            description="Model health, training runs, datasets and deployment."
          />
          <EmptyState
            icon={Sparkles}
            title="ML operations are restricted"
            description={`Managing model training and deployment requires ${ML_OPS_PERMISSION}.`}
          />
        </div>
      }
    >
      <div className="space-y-6">
        <PageHeader
          title="ML & Intelligence"
          description="Service health, the running model, training history, datasets and feedback — for the intelligence behind component suggestions."
        />

        {/* Tab strip, mirroring the Administration & Settings page. */}
        <div className="flex items-center gap-2 overflow-x-auto border-b border-border pb-2">
          {ML_OPS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {notice ? (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
            {notice}
          </div>
        ) : null}
        {actionError ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {actionError}
          </div>
        ) : null}

        {loading ? (
          <LoadingState message="Loading ML operations..." />
        ) : error ? (
          <ErrorState
            title="Error Loading ML Operations"
            message={error}
            onRetry={loadAll}
          />
        ) : (
          <>
            {activeRun ? (
              <MlActiveRunPanel run={activeRun} onViewRun={openRun} />
            ) : null}

            {activeTab === "overview" && overview ? (
              <MlOverviewPanel
                overview={overview}
                canWrite={canWrite}
                busy={busy}
                onRetrain={() =>
                  setPendingRetrain({
                    currentModelVersion: overview.productionModel?.artifactVersion,
                    datasetVersion: overview.dataset?.version,
                    feedbackRecordCount: overview.counts.feedback,
                    lastTrainedAt: overview.health.lastSuccessfulTraining?.completedAt,
                  })
                }
                onViewRun={openRun}
                onDeployCandidate={(runId) =>
                  setPendingDeploy({
                    runId,
                    currentVersion:
                      overview.productionModel?.artifactVersion ?? null,
                    candidateVersion: overview.candidate?.modelVersion ?? null,
                  })
                }
              />
            ) : null}

            {activeTab === "models" && models ? (
              <MlModelsPanel
                models={models}
                busy={busy}
                canWrite={canWrite}
                onRollback={() =>
                  setPendingRollback(models.production.artifactVersion)
                }
                onReload={() =>
                  void runAction(async () => {
                    const reloaded = await mlOpsApi.reloadModel();
                    return reloaded.running.reloadPending
                      ? "The reload did not complete. The ML service is still serving the previous model."
                      : `The running model is now ${reloaded.running.version ? `v${reloaded.running.version}` : "up to date"}.`;
                  })
                }
                onDeployRun={(runId, candidateVersion) =>
                  setPendingDeploy({
                    runId,
                    currentVersion: models.production.artifactVersion,
                    candidateVersion,
                  })
                }
              />
            ) : null}

            {activeTab === "runs" ? (
              <div className="space-y-6">
                <MlRunsPanel
                  runs={runs?.items ?? []}
                  page={runs?.page ?? 1}
                  totalPages={runs?.totalPages ?? 1}
                  total={runs?.total ?? 0}
                  statusFilter={runStatusFilter}
                  loading={runsLoading}
                  busy={busy}
                  canWrite={canWrite}
                  onStatusFilter={changeStatusFilter}
                  onPage={changePage}
                  onViewRun={openRun}
                  onDeployRun={(runId, candidateVersion) =>
                    setPendingDeploy({
                      runId,
                      currentVersion: models?.production.artifactVersion ?? null,
                      candidateVersion,
                    })
                  }
                />
                {detailLoading ? (
                  <LoadingState message="Loading run detail..." />
                ) : detail ? (
                  <MlRunDetailPanel
                    run={detail}
                    canWrite={canWrite}
                    busy={busy}
                    currentRunningVersion={models?.running.version ?? null}
                    onDeploy={() =>
                      setPendingDeploy({
                        runId: detail.id,
                        currentVersion:
                          models?.production.artifactVersion ??
                          detail.deployment.previousModelVersion,
                        candidateVersion: detail.candidateModelVersion,
                      })
                    }
                  />
                ) : null}
              </div>
            ) : null}

            {activeTab === "datasets" && dataset ? (
              <MlDatasetsPanel dataset={dataset} />
            ) : null}

            {activeTab === "usage" && usage ? (
              <MlUsagePanel usage={usage} />
            ) : null}
          </>
        )}

        <MlOpsConfirmations
          retrain={pendingRetrain}
          deploy={
            pendingDeploy
              ? {
                  currentVersion: pendingDeploy.currentVersion,
                  candidateVersion: pendingDeploy.candidateVersion,
                }
              : null
          }
          rollback={pendingRollback}
          busy={busy}
          onConfirmRetrain={confirmRetrain}
          onConfirmDeploy={confirmDeploy}
          onConfirmRollback={confirmRollback}
          onCancel={() => {
            setPendingRetrain(null);
            setPendingDeploy(null);
            setPendingRollback(null);
          }}
        />

        {busy ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Working…
          </div>
        ) : null}
      </div>
    </PermissionGuard>
  );
}
