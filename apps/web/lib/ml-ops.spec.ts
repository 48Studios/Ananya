import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type {
  MlDatasetDto,
  MlHealthDto,
  MlModelsDto,
  MlTrainingRunDetailDto,
  MlTrainingRunSummaryDto,
  MlUsageDto,
} from "./api/ml-ops-api";
import {
  ML_OPS_PERMISSION,
  ML_OPS_TABS,
  TRAINING_PHASE_SEQUENCE,
  TRAINING_SCOPE_NOTICE,
  canDeployCandidate,
  canRollback,
  datasetFreshnessNote,
  datasetQualityRows,
  datasetUnavailableReason,
  deployConfirmation,
  deployUnavailableReason,
  deploymentStatusDetail,
  emptyStateFor,
  evaluationMetricRows,
  formatAgeHours,
  formatChecksum,
  formatCount,
  formatDateTime,
  formatDuration,
  formatMetric,
  formatVersion,
  gateLabel,
  gateSummaryNote,
  healthExplanation,
  healthLabel,
  healthTone,
  isActiveRunStatus,
  metricScopeLabel,
  phaseStepState,
  retrainConfirmation,
  retrainUnavailableReason,
  rollbackConfirmation,
  rollbackUnavailableReason,
  runningModelMatchesArtifact,
  shouldPoll,
  trainingErrorExplanation,
  trainingPhaseLabel,
  trainingStatusLabel,
  usageHeadlineCounts,
} from "./ml-ops";

/**
 * ML & Intelligence presentation logic.
 *
 * The claims worth pinning are the honest ones: a metric the pipeline never produced
 * must not render as zero, a deployment whose reload has not happened must not read
 * as success, a failed candidate must not be deployable, and no control may be
 * offered that the server would refuse.
 */

const PAGE_SOURCE = readFileSync(
  fileURLToPath(new URL("../app/intelligence/page.tsx", import.meta.url)),
  "utf8",
);

const PANELS_SOURCE = readFileSync(
  fileURLToPath(new URL("../components/ml-ops/ml-ops-panels.tsx", import.meta.url)),
  "utf8",
);

function runSummary(
  overrides: Partial<MlTrainingRunSummaryDto> = {},
): MlTrainingRunSummaryDto {
  return {
    id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    status: "PASSED",
    phase: "COMPLETED",
    triggeredAt: "2026-09-22T09:00:00Z",
    startedAt: "2026-09-22T09:00:00Z",
    completedAt: "2026-09-22T09:00:02Z",
    durationMs: 2000,
    triggeredByEmail: "admin@48studios.in",
    baseModelVersion: "1.5.0",
    candidateModelVersion: "1.5.1",
    datasetVersion: "components-2026-09-22-v1.5.1",
    datasetFingerprint: "f".repeat(64),
    trainingRecordCount: 30,
    validationRecordCount: 7,
    promotionEligible: true,
    deploymentStatus: "NOT_DEPLOYED",
    ...overrides,
  };
}

function health(overrides: Partial<MlHealthDto> = {}): MlHealthDto {
  return {
    serviceReachable: true,
    serviceEnabled: true,
    ready: true,
    modelsLoaded: { category_classifier: true, manufacturer_resolver: true },
    categoryModelLoaded: true,
    manufacturerResolverLoaded: true,
    runningModelVersion: "1.5.0",
    recordedModelVersion: "1.5.0",
    reloadPending: false,
    activeTrainingRunId: null,
    lastSuccessfulTraining: runSummary(),
    ...overrides,
  };
}

function dataset(overrides: Partial<MlDatasetDto> = {}): MlDatasetDto {
  return {
    available: true,
    current: {
      version: "components-2026-09-22-v1.5.1",
      generatedAt: "2026-09-22T09:00:00Z",
      fingerprint: "f".repeat(64),
      totalRecords: 25,
      validatedRecords: 25,
      quarantinedRecords: 0,
      trainingRecords: 30,
      evaluationRecords: 7,
      expandedExamples: 37,
      duplicatePairs: 57,
      distinctBaseFamilies: 23,
      dataLeakageVerified: true,
      categories: ["Resistors"],
    },
    freshness: { ageHours: 2, lastTrainingRunAt: "2026-09-22T09:00:02Z", recordsSinceLastTraining: 4 },
    quality: {
      duplicatePairs: 57,
      conflictingLabels: 2,
      missingFields: 1,
      quarantineTotal: 3,
      quarantineByReason: [{ reason: "CONFLICT", count: 2 }],
      categoryDistribution: [{ name: "Resistors", count: 10 }],
      manufacturerDistribution: [{ name: "Yageo", count: 6 }],
      distinctBaseFamilies: 23,
      validatedRecordCount: 25,
    },
    history: [
      {
        version: "components-2026-09-22-v1.5.1",
        generatedAt: "2026-09-22T09:00:00Z",
        totalRecords: 25,
        trainingRecords: 30,
        evaluationRecords: 7,
      },
    ],
    ...overrides,
  };
}

function models(overrides: Partial<MlModelsDto> = {}): MlModelsDto {
  return {
    production: {
      artifactVersion: "1.5.0",
      recordedVersion: "1.5.0",
      deployedAt: "2026-09-18T18:28:01Z",
      checksum: "a".repeat(64),
      sizeBytes: 226628,
      rollbackAvailable: true,
    },
    running: {
      version: "1.5.0",
      loaded: true,
      loadedAt: "2026-09-18T18:28:02Z",
      checksum: "a".repeat(64),
      reloadPending: false,
    },
    versions: [],
    deployments: [],
    available: true,
    ...overrides,
  };
}

function usage(): MlUsageDto {
  return {
    feedback: {
      total: 1240,
      accepted: 900,
      rejected: 200,
      edited: 140,
      sinceLastTraining: 12,
      usedInLastTraining: 8,
      bySuggestionType: [{ suggestionType: "CATEGORY", count: 800 }],
    },
    findings: {
      total: 382,
      pending: 120,
      accepted: 200,
      rejected: 40,
      dismissed: 10,
      stale: 12,
      applied: 180,
      byIssueCategory: [{ issueCategory: "IDENTITY", count: 300 }],
    },
    training: {
      totalRuns: 8,
      passed: 5,
      rejected: 2,
      failed: 1,
      active: 0,
      deployments: 4,
      rollbacks: 1,
    },
    available: { feedback: true, findings: true, training: true },
  };
}

describe("ML & Intelligence — formatting honesty", () => {
  it('renders a missing metric as "Not available", never as zero', () => {
    expect(formatMetric(undefined, "ratio")).toBe("Not available");
    expect(formatMetric(null, "ratio")).toBe("Not available");
    expect(formatMetric(undefined)).toBe("Not available");
    expect(formatCount(undefined)).toBe("Not available");
    expect(formatCount(null)).toBe("Not available");
    expect(formatDuration(null)).toBe("Not available");
    expect(formatDateTime(null)).toBe("Not available");
    expect(formatChecksum(null)).toBe("Not available");
    expect(formatVersion(null)).toBe("Not available");
    expect(formatAgeHours(null)).toBe("Not available");
  });

  it("renders a real zero as a zero, because a measured zero is information", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatMetric(0, "ratio")).toBe("0.0%");
  });

  it("formats metrics with the units the pipeline reports", () => {
    expect(formatMetric(0.7143, "ratio")).toBe("71.4%");
    expect(formatMetric(0.248, "milliseconds")).toBe("0.25 ms");
    expect(formatMetric(143.19, "megabytes")).toBe("143.2 MB");
    expect(formatMetric(226628, "bytes")).toBe("221.3 KB");
  });

  it("formats durations across the ranges a run produces", () => {
    expect(formatDuration(993)).toBe("993 ms");
    expect(formatDuration(2000)).toBe("2.0 s");
    expect(formatDuration(125_000)).toBe("2 min 5 s");
  });

  it("truncates checksums so two can be compared at a glance", () => {
    expect(formatChecksum("abcdef0123456789")).toBe("abcdef012345");
  });

  it("names all three metric scopes so they cannot be conflated", () => {
    expect(metricScopeLabel("PRODUCTION")).toBe("Current production model");
    expect(metricScopeLabel("LAST_RUN")).toBe("Last training run");
    expect(metricScopeLabel("CANDIDATE")).toBe("Candidate model");
  });
});

describe("ML & Intelligence — status vocabulary", () => {
  it("labels every training status", () => {
    expect(trainingStatusLabel("QUEUED")).toBe("Queued");
    expect(trainingStatusLabel("RUNNING")).toBe("Running");
    expect(trainingStatusLabel("EVALUATING")).toBe("Evaluating");
    expect(trainingStatusLabel("PASSED")).toBe("Passed gates");
    expect(trainingStatusLabel("REJECTED")).toBe("Rejected by gates");
    expect(trainingStatusLabel("FAILED")).toBe("Failed");
    expect(trainingStatusLabel("CANCELLED")).toBe("Cancelled");
  });

  it("labels every pipeline phase with the pipeline's own wording", () => {
    expect(trainingPhaseLabel("PREPARING_DATASET")).toBe("Preparing dataset");
    expect(trainingPhaseLabel("TRAINING")).toBe("Training");
    expect(trainingPhaseLabel("EVALUATING")).toBe("Evaluating");
    expect(trainingPhaseLabel("PACKAGING")).toBe("Packaging candidate");
    expect(trainingPhaseLabel("COMPLETED")).toBe("Completed");
    expect(trainingPhaseLabel(null)).toBeNull();
  });

  it("identifies the active statuses", () => {
    expect(isActiveRunStatus("QUEUED")).toBe(true);
    expect(isActiveRunStatus("RUNNING")).toBe(true);
    expect(isActiveRunStatus("EVALUATING")).toBe(true);
    expect(isActiveRunStatus("PASSED")).toBe(false);
    expect(isActiveRunStatus("REJECTED")).toBe(false);
    expect(isActiveRunStatus("FAILED")).toBe(false);
    expect(isActiveRunStatus("CANCELLED")).toBe(false);
  });

  it("polls only while a run is active", () => {
    expect(shouldPoll(runSummary({ status: "RUNNING" }))).toBe(true);
    expect(shouldPoll(runSummary({ status: "QUEUED" }))).toBe(true);
    expect(shouldPoll(runSummary({ status: "EVALUATING" }))).toBe(true);
    expect(shouldPoll(runSummary({ status: "PASSED" }))).toBe(false);
    expect(shouldPoll(runSummary({ status: "FAILED" }))).toBe(false);
    expect(shouldPoll(null)).toBe(false);
    expect(shouldPoll(undefined)).toBe(false);
  });

  it("reports a real phase sequence, with no percentage anywhere", () => {
    expect(TRAINING_PHASE_SEQUENCE).toEqual([
      "PREPARING_DATASET",
      "TRAINING",
      "EVALUATING",
      "PACKAGING",
    ]);
    expect(phaseStepState("TRAINING", "PREPARING_DATASET")).toBe("done");
    expect(phaseStepState("TRAINING", "TRAINING")).toBe("current");
    expect(phaseStepState("TRAINING", "EVALUATING")).toBe("pending");
    expect(phaseStepState("COMPLETED", "PACKAGING")).toBe("done");
    expect(phaseStepState(null, "TRAINING")).toBe("pending");
  });
});

describe("ML & Intelligence — health", () => {
  it("distinguishes healthy, degraded and unavailable", () => {
    expect(healthTone(health())).toBe("healthy");
    expect(healthTone(health({ ready: false }))).toBe("degraded");
    expect(healthTone(health({ serviceReachable: false }))).toBe("unavailable");
    expect(healthTone(null)).toBe("unavailable");
    expect(healthLabel("healthy")).toBe("Healthy");
    expect(healthLabel("degraded")).toBe("Degraded");
    expect(healthLabel("unavailable")).toBe("Unavailable");
  });

  it("explains a disabled deployment differently from an unreachable one", () => {
    expect(
      healthExplanation(health({ serviceReachable: false, serviceEnabled: false })),
    ).toContain("disabled");
    expect(healthExplanation(health({ serviceReachable: false }))).toContain(
      "did not answer",
    );
    expect(healthExplanation(health({ ready: false }))).toContain("not every model");
    expect(healthExplanation(health())).toContain("every model loaded");
  });
});

describe("ML & Intelligence — running model vs artifact", () => {
  it("reports a match only when the checksums agree", () => {
    expect(runningModelMatchesArtifact(models())).toBe(true);
    expect(
      runningModelMatchesArtifact(
        models({
          running: { ...models().running, checksum: "b".repeat(64) },
        }),
      ),
    ).toBe(false);
    expect(
      runningModelMatchesArtifact(
        models({ running: { ...models().running, loaded: false } }),
      ),
    ).toBe(false);
  });

  it("reports no verdict rather than a guess when ML is unavailable", () => {
    expect(runningModelMatchesArtifact(null)).toBeNull();
    expect(
      runningModelMatchesArtifact(models({ available: false, running: { ...models().running, checksum: null } })),
    ).toBeNull();
  });

  it("never claims success for a deployment whose reload is pending", () => {
    const detail = {
      deployment: {
        status: "DEPLOYED_PENDING_RELOAD" as const,
        modelVersion: "1.5.1",
        deployedAt: "2026-09-22T09:10:00Z",
        deployedByEmail: "admin@48studios.in",
        previousModelVersion: "1.5.0",
        runningModelVersion: "1.5.0",
        reloadPending: true,
        reloadError: "Production model artifact is missing",
      },
    };
    const copy = deploymentStatusDetail(detail as MlTrainingRunDetailDto);
    expect(copy).toContain("still serving v1.5.0");
    expect(copy).toContain("Production model artifact is missing");
    expect(copy).not.toContain("now v1.5.1");
  });

  it("does not read a stored deployment as the present running model", () => {
    const detail = {
      deployment: {
        status: "DEPLOYED" as const,
        modelVersion: "1.5.1",
        deployedAt: "2026-09-22T09:10:00Z",
        deployedByEmail: "admin@48studios.in",
        previousModelVersion: "1.5.0",
        runningModelVersion: "1.5.1",
        reloadPending: false,
        reloadError: null,
      },
    } as MlTrainingRunDetailDto;

    // Production has since rolled back: the record must say so rather than claim
    // the running model is still v1.5.1.
    const drifted = deploymentStatusDetail(detail, "1.5.0");
    expect(drifted).toContain("became v1.5.1 when this deployment completed");
    expect(drifted).toContain("now serving v1.5.0");

    // Unchanged production: no drift note.
    const unchanged = deploymentStatusDetail(detail, "1.5.1");
    expect(unchanged).toContain("became v1.5.1");
    expect(unchanged).not.toContain("has since moved");
  });

  it("states plainly that a failed deployment left production alone", () => {
    const copy = deploymentStatusDetail({
      deployment: {
        status: "DEPLOYMENT_FAILED",
        modelVersion: null,
        deployedAt: null,
        deployedByEmail: null,
        previousModelVersion: null,
        runningModelVersion: null,
        reloadPending: false,
        reloadError: null,
      },
    } as MlTrainingRunDetailDto);
    expect(copy).toContain("production model is unchanged");
  });

  it("only offers rollback when a backup artifact exists", () => {
    expect(canRollback(models())).toBe(true);
    expect(
      canRollback(
        models({ production: { ...models().production, rollbackAvailable: false } }),
      ),
    ).toBe(false);
    expect(canRollback(null)).toBe(false);
    expect(
      rollbackUnavailableReason(
        models({ production: { ...models().production, rollbackAvailable: false } }),
      ),
    ).toContain("No previous production artifact");
    expect(rollbackUnavailableReason(null)).toContain("unavailable");
  });
});

describe("ML & Intelligence — candidate deployment rules", () => {
  it("allows deployment only for a passed, eligible, undeployed candidate", () => {
    expect(canDeployCandidate(runSummary())).toBe(true);
  });

  it("refuses every state the server would refuse", () => {
    expect(canDeployCandidate(runSummary({ status: "RUNNING" }))).toBe(false);
    expect(canDeployCandidate(runSummary({ status: "EVALUATING" }))).toBe(false);
    expect(canDeployCandidate(runSummary({ status: "FAILED" }))).toBe(false);
    expect(canDeployCandidate(runSummary({ status: "REJECTED" }))).toBe(false);
    expect(canDeployCandidate(runSummary({ promotionEligible: null }))).toBe(false);
    expect(canDeployCandidate(runSummary({ promotionEligible: false }))).toBe(false);
    expect(canDeployCandidate(runSummary({ deploymentStatus: "DEPLOYED" }))).toBe(
      false,
    );
    expect(canDeployCandidate(null)).toBe(false);
  });

  it("explains each refusal in the operator's terms", () => {
    expect(deployUnavailableReason(runSummary({ status: "REJECTED" }))).toContain(
      "did not pass every quality gate",
    );
    expect(deployUnavailableReason(runSummary({ status: "FAILED" }))).toContain(
      "no deployable candidate",
    );
    expect(deployUnavailableReason(runSummary({ status: "RUNNING" }))).toContain(
      "still running",
    );
    expect(deployUnavailableReason(runSummary({ promotionEligible: null }))).toContain(
      "No passing gate record",
    );
    expect(deployUnavailableReason(runSummary({ deploymentStatus: "DEPLOYED" }))).toContain(
      "already been deployed",
    );
    expect(deployUnavailableReason(runSummary())).toBeNull();
  });

  it("names both versions in the deployment confirmation", () => {
    const copy = deployConfirmation("1.5.0", "1.5.1");
    expect(copy.title).toBe("Deploy v1.5.1?");
    expect(copy.description).toContain("Current: v1.5.0");
    expect(copy.description).toContain("Candidate: v1.5.1");
    expect(copy.description).toContain("will make v1.5.1 the production model");
  });

  it("states that retraining does not deploy", () => {
    const copy = retrainConfirmation({
      currentModelVersion: "1.5.0",
      datasetVersion: "components-2026-09-22-v1.5.1",
      feedbackRecordCount: 1240,
      lastTrainedAt: "2026-09-22T09:00:02Z",
    });
    expect(copy.description).toContain("Current production model: v1.5.0");
    expect(copy.description).toContain("Dataset: components-2026-09-22-v1.5.1");
    expect(copy.description).toContain("Feedback records on file: 1,240");
    expect(copy.description).toContain(TRAINING_SCOPE_NOTICE);
    expect(TRAINING_SCOPE_NOTICE).toContain("does not automatically replace");
    // It must not claim the records will be used: the collector does not ingest
    // the feedback ledger today.
    expect(copy.description).not.toMatch(/eligible records/i);
  });

  it("explains a rollback before it happens", () => {
    const copy = rollbackConfirmation("1.5.1");
    expect(copy.description).toContain("v1.5.1");
    expect(copy.description).toContain("previous artifact");
  });

  it("blocks retraining without permission, during a run, or when ML is down", () => {
    expect(
      retrainUnavailableReason({ health: health(), activeRunId: null, canWrite: false }),
    ).toContain(ML_OPS_PERMISSION);
    expect(
      retrainUnavailableReason({ health: health(), activeRunId: "run-1", canWrite: true }),
    ).toContain("already active");
    expect(
      retrainUnavailableReason({
        health: health({ serviceReachable: false }),
        activeRunId: null,
        canWrite: true,
      }),
    ).toContain("unavailable");
    expect(
      retrainUnavailableReason({ health: health(), activeRunId: null, canWrite: true }),
    ).toBeNull();
  });
});

describe("ML & Intelligence — gates and evaluation", () => {
  it("humanises gate names", () => {
    expect(gateLabel("accuracy_gate")).toBe("Accuracy");
    expect(gateLabel("duplicate_precision_gate")).toBe("Duplicate Precision");
    expect(gateLabel("provenance_gate")).toBe("Provenance");
  });

  it("says when no gates were recorded rather than showing an empty pass", () => {
    expect(
      gateSummaryNote({ gates: [], promotionEligible: false, unavailable: true }),
    ).toContain("No gate results were recorded");
  });

  it("summarises pass and fail outcomes", () => {
    expect(
      gateSummaryNote({
        gates: [{ gate: "accuracy_gate", passed: true }],
        promotionEligible: true,
        unavailable: false,
      }),
    ).toContain("Every mandatory quality gate passed");
    expect(
      gateSummaryNote({
        gates: [
          { gate: "accuracy_gate", passed: false },
          { gate: "latency_gate", passed: true },
        ],
        promotionEligible: false,
        unavailable: false,
      }),
    ).toContain("1 of 2 gates did not pass");
  });

  it("lists only the metrics that exist, and no overall score", () => {
    const rows = evaluationMetricRows({
      candidateTop1Accuracy: 0.7143,
      duplicatePrecision: 1,
      latencyMs: { p95: 0.248 },
    });
    expect(rows.map((row) => row.label)).toEqual([
      "Top-1 accuracy",
      "Top-3 accuracy",
      "Active model top-1",
      "Manufacturer accuracy",
      "Duplicate precision",
      "Duplicate recall",
      "Critical false merges",
      "Latency p95",
      "Peak memory",
      "Artifact size",
    ]);
    // Absent metrics are "Not available"; the produced ones carry their values.
    expect(rows[0]?.value).toBe("71.4%");
    expect(rows[1]?.value).toBe("Not available");
    expect(rows[7]?.value).toBe("0.25 ms");
    expect(rows.some((row) => /score/i.test(row.label))).toBe(false);
  });

  it("returns no metric rows at all when the run produced none", () => {
    expect(evaluationMetricRows(null)).toEqual([]);
    expect(evaluationMetricRows(undefined)).toEqual([]);
  });
});

describe("ML & Intelligence — failure explanations", () => {
  it("explains that a failure left production untouched", () => {
    expect(trainingErrorExplanation("TRAINING_FAILED", null)).toContain(
      "production model was not changed",
    );
    expect(trainingErrorExplanation("EVALUATION_FAILED", null)).toContain(
      "no gate verdict",
    );
    expect(trainingErrorExplanation("ML_JOB_LOST", null)).toContain("restarted");
    expect(trainingErrorExplanation("DISPATCH_FAILED", null)).toContain(
      "could not be started",
    );
  });

  it("keeps the raw message when the code is unknown", () => {
    expect(trainingErrorExplanation("SOMETHING_NEW", "boom")).toBe("boom");
    expect(trainingErrorExplanation(null, "boom")).toBe("boom");
    expect(trainingErrorExplanation(null, null)).toBeNull();
  });

  it("appends the raw message to a known explanation", () => {
    expect(trainingErrorExplanation("TRAINING_FAILED", "index error")).toContain(
      "index error",
    );
  });
});

describe("ML & Intelligence — datasets", () => {
  it("reports each quality measure with its availability", () => {
    const rows = datasetQualityRows(dataset());
    expect(rows.map((row) => row.label)).toEqual([
      "Duplicate pairs",
      "Conflicting labels",
      "Missing required fields",
      "Quarantined records",
      "Distinct MPN families",
      "Validated records",
    ]);
    expect(rows.every((row) => row.available)).toBe(true);
  });

  it('marks an unmeasured quality metric as "Not available"', () => {
    const rows = datasetQualityRows(
      dataset({
        quality: {
          ...dataset().quality,
          conflictingLabels: null,
          quarantineTotal: null,
        },
      }),
    );
    const conflicting = rows.find((row) => row.label === "Conflicting labels");
    expect(conflicting?.value).toBe("Not available");
    expect(conflicting?.available).toBe(false);
  });

  it("explains an unavailable dataset rather than showing an empty one", () => {
    expect(datasetUnavailableReason(dataset())).toBeNull();
    expect(datasetUnavailableReason(dataset({ available: false }))).toContain(
      "unavailable",
    );
  });

  it("describes freshness from the snapshot age and the feedback since training", () => {
    expect(datasetFreshnessNote(dataset())).toContain("2 hours ago");
    expect(datasetFreshnessNote(dataset())).toContain("4 feedback records");
    expect(
      datasetFreshnessNote(
        dataset({ current: null, freshness: { ageHours: null, lastTrainingRunAt: null, recordsSinceLastTraining: null } }),
      ),
    ).toContain("No dataset snapshot");
  });
});

describe("ML & Intelligence — usage", () => {
  it("labels the headline counts", () => {
    expect(usageHeadlineCounts(usage())).toEqual([
      { label: "Feedback", value: "1,240" },
      { label: "Findings", value: "382" },
      { label: "Training runs", value: "8" },
      { label: "Deployed models", value: "4" },
    ]);
  });
});

describe("ML & Intelligence — empty states", () => {
  it("gives every tab an empty state that explains why it is empty", () => {
    for (const tab of ML_OPS_TABS) {
      const state = emptyStateFor(tab.id);
      expect(state.title.length).toBeGreaterThan(0);
      expect(state.description.length).toBeGreaterThan(0);
    }
    expect(emptyStateFor("runs").description).toContain("operator-triggered");
    expect(emptyStateFor("datasets").description).toContain("training run");
  });

  it("defines exactly the five documented tabs", () => {
    expect(ML_OPS_TABS.map((tab) => tab.id)).toEqual([
      "overview",
      "models",
      "runs",
      "datasets",
      "usage",
    ]);
    expect(ML_OPS_TABS.map((tab) => tab.label)).toEqual([
      "Overview",
      "Models",
      "Training Runs",
      "Datasets",
      "Usage",
    ]);
  });
});

describe("ML & Intelligence — detail field layout", () => {
  it("uses the shared detail-field vocabulary, never a bespoke label row", () => {
    expect(PANELS_SOURCE).toContain('from "@/components/ui/detail-field"');
    expect(PANELS_SOURCE).toContain("<DetailField ");
    expect(PANELS_SOURCE).toContain("<DetailFields");
    // No local re-implementation of the label/value pairing.
    expect(PANELS_SOURCE).not.toMatch(/function DetailRow\b/);
  });

  it("never reserves a fixed width for a label", () => {
    // The regression this pins: a `w-44` label column beside the value inside a
    // 4-column grid left ~51px for the value, so `v1.5.0` and `Loaded` wrapped one
    // character per line. A stacked label cannot squeeze the value.
    //
    // Scoped to labels: a fixed width on a control (the status filter's Select
    // wrapper) is a deliberate sizing decision and is not what broke.
    expect(PANELS_SOURCE).not.toMatch(/<dt[^>]*w-\d/);
    expect(PANELS_SOURCE).not.toMatch(/shrink-0 text-xs font-medium/);
    expect(PANELS_SOURCE).not.toMatch(/sm:flex-row sm:items-baseline/);
  });

  it("never lets a value shrink to nothing inside a flex row", () => {
    expect(PANELS_SOURCE).not.toContain("min-w-0 text-sm break-words");
  });

  it("keeps the responsive column rule in the shared grid", () => {
    // Only the shared primitive declares the 1/2/3/4 breakpoints; panels override
    // it per context instead of re-declaring a grid of their own.
    expect(PANELS_SOURCE).toContain('className="lg:grid-cols-2 xl:grid-cols-2"');
    expect(PANELS_SOURCE).not.toMatch(/<dl className="grid grid-cols-1 gap-x-8/);
  });

  it("renders identifiers and counts with the shared value treatments", () => {
    expect(PANELS_SOURCE).toContain("<DetailMono");
    expect(PANELS_SOURCE).toContain("<DetailText>");
  });

  it("marks the training scope note with an info icon, per the note convention", () => {
    // The note that says training does not deploy is the operator's guard against
    // the most dangerous misunderstanding here, so it is rendered as an icon note
    // rather than as loose muted text.
    expect(PANELS_SOURCE).toMatch(
      /<Info className="mt-0\.5 size-3 shrink-0" \/>\s*\{TRAINING_SCOPE_NOTICE\}/,
    );
    // Both branches of the slot carry it, so the icon cannot flicker with state.
    const infoNotes = PANELS_SOURCE.match(/<Info className="mt-0\.5 size-3 shrink-0" \/>/g);
    expect(infoNotes?.length).toBe(2);
  });
});

describe("ML & Intelligence — route", () => {
  const NAV_SOURCE = readFileSync(
    fileURLToPath(new URL("./navigation/navigation-config.tsx", import.meta.url)),
    "utf8",
  );

  it("lives at /intelligence, not under /settings", () => {
    expect(NAV_SOURCE).toContain('href: "/intelligence"');
    expect(NAV_SOURCE).not.toContain('"/settings/ml"');
    // The page itself must exist at that path for the nav entry to resolve.
    expect(PAGE_SOURCE.length).toBeGreaterThan(0);
  });

  it("stays reachable from the Administration module, administrator-only", () => {
    expect(NAV_SOURCE).toContain('title: "ML & Intelligence"');
    expect(NAV_SOURCE).toMatch(
      /href: "\/intelligence",[\s\S]{0,200}permissions: \["Administration\.Roles"\]/,
    );
  });
});

describe("ML & Intelligence — API surface", () => {
  it("keeps every route it calls under the guarded /ml/ops prefix", () => {
    const apiSource = readFileSync(
      fileURLToPath(new URL("./api/ml-ops-api.ts", import.meta.url)),
      "utf8",
    );
    const paths = apiSource.match(/["`]\/ml\/ops[^"`]*["`]/g) ?? [];
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((path) => path.includes("/ml/ops"))).toBe(true);
    // The training trigger sends an empty body: no version, path or argument.
    expect(apiSource).toContain('"/ml/ops/training-runs",\n      {},');
  });
});

describe("ML & Intelligence — the page's own guarantees", () => {
  it("guards the page and names the permission it requires", () => {
    expect(PAGE_SOURCE).toContain("<PermissionGuard");
    expect(PAGE_SOURCE).toContain("permission={ML_OPS_PERMISSION}");
    expect(ML_OPS_PERMISSION).toBe("Administration.Roles");
  });

  it("polls only while a run is active and stops on a terminal run", () => {
    expect(PAGE_SOURCE).toContain("shouldPoll(latest)");
    expect(PAGE_SOURCE).toContain("window.setInterval");
    expect(PAGE_SOURCE).toContain("window.clearInterval");
    // The interval is created inside an effect gated on the active run.
    expect(PAGE_SOURCE).toMatch(/if \(!activeRun\) return undefined;/);
  });

  it("offers no cancel control, and says why", () => {
    expect(PANELS_SOURCE).toContain("cannot be cancelled safely");
    expect(PANELS_SOURCE).not.toMatch(/Cancel run/i);
    expect(PAGE_SOURCE).not.toMatch(/cancelRun/i);
  });

  it("requires confirmation for retrain, deploy and rollback", () => {
    expect(PAGE_SOURCE).toContain("<MlOpsConfirmations");
    expect(PANELS_SOURCE).toContain("<ConfirmDialog");
    expect(PANELS_SOURCE).toContain("retrainConfirmation");
    expect(PANELS_SOURCE).toContain("deployConfirmation");
    expect(PANELS_SOURCE).toContain("rollbackConfirmation");
  });

  it("sends the candidate version it displayed when deploying", () => {
    expect(PAGE_SOURCE).toContain("mlOpsApi.deployCandidate(");
    expect(PAGE_SOURCE).toContain("target.candidateVersion ?? undefined");
  });

  it("reports a pending reload instead of claiming the deployment finished", () => {
    expect(PAGE_SOURCE).toContain("run.deployment.reloadPending");
    expect(PAGE_SOURCE).toContain("still serving");
    expect(PANELS_SOURCE).toContain("deploymentStatusDetail");
  });

  it("shows the deployed artifact and the running model side by side", () => {
    expect(PANELS_SOURCE).toContain("Deployed artifact");
    expect(PANELS_SOURCE).toContain("Running model");
    expect(PANELS_SOURCE).toContain("Running model matches the deployed artifact");
    // A stored deployment names the version it produced, not the current one.
    expect(PANELS_SOURCE).toContain("Running model at deployment");
    expect(PANELS_SOURCE).toContain("Running model now");
  });

  it("renders every panel from server data, with no synthesised numbers", () => {
    // No arithmetic that could invent a value: the panels only format.
    expect(PANELS_SOURCE).not.toMatch(/Math\.random/);
    expect(PANELS_SOURCE).not.toMatch(/progress\s*[:=]\s*\d/);
    expect(PANELS_SOURCE).not.toMatch(/percent/i);
    expect(PANELS_SOURCE).toContain("Not available");
  });

  it("renders an error state when the API call fails", () => {
    expect(PAGE_SOURCE).toContain("<ErrorState");
    expect(PAGE_SOURCE).toContain("onRetry={loadAll}");
  });
});
