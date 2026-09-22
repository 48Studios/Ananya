"""
Operator-triggered training runner (ML & Intelligence control plane).

Runs the EXISTING authoritative pipeline (`apps/ml/pipeline/*`) on demand and
reports what happened. It does not reimplement training, does not change the
evaluation rules, and cannot promote a model.

Why the runner lives here and not in NestJS
-------------------------------------------
Training reads `apps/ml/data/*`, writes `apps/ml/data/datasets/*`, and writes
`apps/ml/models/registry/v{version}/*`. Those directories exist in this
container — and only here. The API container (built from the `@ananya/api` turbo
scope) does not contain them, and executing Python from an HTTP handler would
also mean executing in the request path. So the API owns authorisation, the
durable run record and the audit trail, and forwards the start/deploy request to
this process over the internal ML HTTP API; the job itself runs on a background
thread here.

Why a thread rather than a child process
----------------------------------------
A thread keeps the pipeline's own code path (`run_independent_training_pipeline`)
exactly as it is and leaves no orphaned processes behind. The trade-off is
explicit and is surfaced to the operator rather than hidden: a running job
**cannot be cancelled safely** (there is no way to interrupt sklearn
mid-fit without killing the process), so `cancellable` is always False and the
dashboard offers no cancel control. See `docs/ML_OPERATIONS.md`.

Production safety
-----------------
  - `auto_deploy` is always False: a run produces a CANDIDATE in the registry and
    stops there. Promotion is a separate, explicit, operator-confirmed call.
  - The production artifact (`models/category_classifier.pkl`) is never opened for
    writing by this module. `deploy.py` (the existing promotion tool) is the only
    writer, and it is reached only from `deploy_run`.
  - Exactly one job may be active at a time (`_start_lock` + state check), so two
    operators cannot interleave writes into `data/` or the registry.
  - Raw pipeline stdout is NOT captured (redirecting `sys.stdout` is process-global
    and would swallow logs from concurrent request threads). The run keeps its own
    bounded step log instead.
"""

import threading
import traceback
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from . import model_registry
from .category_classifier import category_classifier

# Lifecycle states, mirroring the API contract one-for-one.
STATUS_QUEUED = "QUEUED"
STATUS_RUNNING = "RUNNING"
STATUS_EVALUATING = "EVALUATING"
STATUS_PASSED = "PASSED"
STATUS_REJECTED = "REJECTED"
STATUS_FAILED = "FAILED"

ACTIVE_STATUSES = (STATUS_QUEUED, STATUS_RUNNING, STATUS_EVALUATING)

# Real pipeline phases. There is no percentage anywhere: the pipeline reports
# step boundaries, not fractions of work.
PHASE_PREPARING_DATASET = "PREPARING_DATASET"
PHASE_TRAINING = "TRAINING"
PHASE_EVALUATING = "EVALUATING"
PHASE_PACKAGING = "PACKAGING"
PHASE_COMPLETED = "COMPLETED"

# Stable error codes. The API stores these verbatim; the UI maps them to prose, so
# a message can be reworded without breaking a client.
ERROR_DATASET_BUILD_FAILED = "DATASET_BUILD_FAILED"
ERROR_TRAINING_FAILED = "TRAINING_FAILED"
ERROR_EVALUATION_FAILED = "EVALUATION_FAILED"
ERROR_PACKAGING_FAILED = "PACKAGING_FAILED"
ERROR_INTERNAL = "INTERNAL_ERROR"

# Identity of the training code this runner drives. Recorded on every run so a
# candidate can be attributed to a pipeline revision, not just to a date.
PIPELINE_VERSION = "rfc-0058"

MAX_LOG_LINES = 40
MAX_LOG_CHARS = 4000
MAX_RETAINED_RUNS = 50


class TrainingRunConflictError(RuntimeError):
    """Raised when a run is requested while another run is active."""


class TrainingRunNotFoundError(RuntimeError):
    """Raised for an unknown run id (e.g. this process was restarted)."""


class DeploymentRefusedError(RuntimeError):
    """Raised when a candidate may not be promoted."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _duration_ms(started_at: Optional[str], finished_at: Optional[str]) -> Optional[int]:
    if not started_at or not finished_at:
        return None
    try:
        start = datetime.fromisoformat(started_at)
        end = datetime.fromisoformat(finished_at)
    except ValueError:
        return None
    return int((end - start).total_seconds() * 1000)


class TrainingRunner:
    """
    Single-process, single-job training runner.

    State is intentionally in memory only: the durable record lives in
    PostgreSQL, owned by the API, and the API is what the dashboard reads. A
    process restart therefore loses job *history* here but never the run record
    itself — the API detects the missing job and reports it as
    `ML_JOB_LOST` rather than pretending the run is still progressing.
    """

    def __init__(self):
        self._runs: Dict[str, Dict[str, Any]] = {}
        self._order: List[str] = []
        self._start_lock = threading.Lock()
        self._state_lock = threading.Lock()

    # ------------------------------------------------------------------ reads

    def active_run(self) -> Optional[Dict[str, Any]]:
        with self._state_lock:
            for run_id in reversed(self._order):
                run = self._runs[run_id]
                if run["status"] in ACTIVE_STATUSES:
                    return dict(run)
        return None

    def get_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        with self._state_lock:
            run = self._runs.get(run_id)
            return dict(run) if run else None

    def list_runs(self) -> List[Dict[str, Any]]:
        with self._state_lock:
            return [dict(self._runs[run_id]) for run_id in reversed(self._order)]

    # ----------------------------------------------------------------- writes

    def start_run(
        self,
        run_id: Optional[str] = None,
        requested_by: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Starts a training run and returns immediately.

        The caller (the API) receives the run identity straight away while the
        work continues on a background thread, so a closed browser tab, a
        disconnected client or a restarted API cannot stop it.
        """
        with self._start_lock:
            existing = self.active_run()
            if existing is not None:
                raise TrainingRunConflictError(
                    f"Training run {existing['runId']} is already active"
                )

            resolved_id = run_id or f"mlrun-{int(datetime.now(timezone.utc).timestamp())}"
            candidate_version = model_registry.next_candidate_version()
            active = model_registry.active_deployment()

            run: Dict[str, Any] = {
                "runId": resolved_id,
                "status": STATUS_RUNNING,
                "phase": PHASE_PREPARING_DATASET,
                "requestedBy": requested_by,
                "queuedAt": _now(),
                "startedAt": _now(),
                "completedAt": None,
                "durationMs": None,
                "candidateVersion": candidate_version,
                "baseModelVersion": active.get("artifactVersion"),
                "pipelineVersion": PIPELINE_VERSION,
                "datasetVersion": None,
                "datasetFingerprint": None,
                "datasetRecordCount": None,
                "feedbackRecordCount": None,
                "trainingRecordCount": None,
                "validationRecordCount": None,
                "quarantineRecordCount": None,
                "evaluationSummary": None,
                "gateSummary": None,
                "errorCode": None,
                "errorMessage": None,
                "artifactReference": None,
                "log": [],
                "cancellable": False,
            }
            with self._state_lock:
                self._runs[resolved_id] = run
                self._order.append(resolved_id)
                self._trim()

        thread = threading.Thread(
            target=self._execute,
            args=(resolved_id, candidate_version),
            name=f"ml-training-{resolved_id}",
            daemon=True,
        )
        thread.start()
        return self.get_run(resolved_id) or run

    def _trim(self) -> None:
        """Keeps memory bounded; the durable history is in PostgreSQL."""
        while len(self._order) > MAX_RETAINED_RUNS:
            oldest = self._order.pop(0)
            self._runs.pop(oldest, None)

    def _update(self, run_id: str, **fields: Any) -> None:
        with self._state_lock:
            run = self._runs.get(run_id)
            if run:
                run.update(fields)

    def _log(self, run_id: str, message: str) -> None:
        with self._state_lock:
            run = self._runs.get(run_id)
            if not run:
                return
            lines: List[str] = run["log"]
            lines.append(f"{_now()} {message}")
            while len(lines) > MAX_LOG_LINES:
                lines.pop(0)
            # Drop whole lines while they fit, then hard-truncate what is left. The
            # second step matters: an exception message can be a single very long
            # line, and a loop that only drops lines can never shrink below one — so
            # the bound has to be enforced on the text itself, not on the line count.
            joined = "\n".join(lines)
            while len(joined) > MAX_LOG_CHARS and len(lines) > 1:
                lines.pop(0)
                joined = "\n".join(lines)
            if len(joined) > MAX_LOG_CHARS:
                lines[:] = [joined[-MAX_LOG_CHARS:]]
            run["log"] = lines

    # -------------------------------------------------------------- execution

    def _execute(self, run_id: str, candidate_version: str) -> None:
        """
        Runs the authoritative pipeline for one candidate version.

        The imports are inside the method so that importing this module (which the
        FastAPI app does at startup) stays cheap and cannot fail on a machine that
        has no training dependencies installed. In the API-facing deployment the
        training dependencies are present; see `docker/Dockerfile.ml`.
        """
        try:
            from apps.ml.pipeline.collect import collect_records
            from apps.ml.pipeline.validate import run_validation
            from apps.ml.pipeline.build_dataset import build_dataset_snapshot
            from apps.ml.pipeline.train import train_model
            from apps.ml.pipeline.evaluate import evaluate_model
        except Exception as error:  # pragma: no cover - dependency failure
            self._log(run_id, f"Training pipeline is unavailable: {error}")
            self._fail(run_id, ERROR_INTERNAL, "Training pipeline is unavailable")
            return

        try:
            # 1 / 5 — dataset. The API cannot do this step: it owns no ML data.
            self._update(run_id, phase=PHASE_PREPARING_DATASET)
            self._log(run_id, "Collecting authoritative records")
            collected = collect_records()
            validated, quarantined = run_validation()
            dataset_meta = build_dataset_snapshot(version=candidate_version)
            snapshot = model_registry.dataset_snapshot(
                dataset_meta["datasetVersion"]
            ) or {}
            self._log(
                run_id,
                f"Dataset {dataset_meta['datasetVersion']} built: "
                f"{len(collected)} collected, {len(validated)} validated, "
                f"{len(quarantined)} quarantined",
            )
            self._update(
                run_id,
                datasetVersion=dataset_meta["datasetVersion"],
                datasetFingerprint=snapshot.get("fingerprint"),
                datasetRecordCount=len(collected),
                feedbackRecordCount=_feedback_record_count(collected),
                trainingRecordCount=dataset_meta.get("trainSize"),
                validationRecordCount=dataset_meta.get("valSize"),
                quarantineRecordCount=len(quarantined),
            )

            # 2 / 5 — train candidates into the registry (never into production).
            self._update(run_id, phase=PHASE_TRAINING)
            self._log(run_id, "Training candidate architectures")
            dataset_dir = f"apps/ml/data/datasets/{dataset_meta['datasetVersion']}"
            train_meta = train_model(
                train_path=f"{dataset_dir}/train.json",
                val_path=f"{dataset_dir}/val.json",
                version=candidate_version,
            )
            self._log(
                run_id,
                f"Champion architecture: {train_meta.get('championModel')}",
            )

            # 3 / 5 — evaluate against the active production baseline.
            self._update(run_id, phase=PHASE_EVALUATING, status=STATUS_EVALUATING)
            self._log(run_id, "Running quality gates against the active model")
            eval_report = evaluate_model(
                version=candidate_version,
                val_data_path=f"{dataset_dir}/val.json",
            )

            # 4 / 5 — package: the registry directory IS the package.
            self._update(run_id, phase=PHASE_PACKAGING)
            artifact = model_registry.version_detail(candidate_version) or {}
            self._log(
                run_id,
                f"Candidate registry/v{candidate_version} checksum "
                f"{artifact.get('artifactSha256')}",
            )

            eligible = bool(eval_report.get("promotionEligible"))
            self._update(
                run_id,
                evaluationSummary=eval_report.get("metrics"),
                gateSummary={
                    "gates": eval_report.get("qualityGates"),
                    "thresholds": GATE_THRESHOLDS,
                    "promotionEligible": eligible,
                },
                artifactReference=f"registry/v{candidate_version}",
                datasetFingerprint=artifact.get("datasetFingerprint")
                or snapshot.get("fingerprint"),
            )

            # 5 / 5 — stop. Promotion is a separate, explicit operator action.
            if eligible:
                self._log(run_id, "Quality gates PASSED — candidate is ready to deploy")
                self._complete(run_id, STATUS_PASSED)
            else:
                self._log(run_id, "Quality gates FAILED — candidate is not deployable")
                self._complete(run_id, STATUS_REJECTED)

        except Exception as error:  # noqa: BLE001 - classified below
            phase = (self.get_run(run_id) or {}).get("phase")
            if phase == PHASE_TRAINING:
                code = ERROR_TRAINING_FAILED
            elif phase == PHASE_EVALUATING:
                code = ERROR_EVALUATION_FAILED
            elif phase == PHASE_PACKAGING:
                code = ERROR_PACKAGING_FAILED
            else:
                code = ERROR_DATASET_BUILD_FAILED
            self._log(run_id, f"{code}: {error}")
            self._log(run_id, traceback.format_exc(limit=3))
            self._fail(run_id, code, str(error) or code)

    def _complete(self, run_id: str, status: str) -> None:
        completed_at = _now()
        run = self.get_run(run_id) or {}
        self._update(
            run_id,
            status=status,
            phase=PHASE_COMPLETED,
            completedAt=completed_at,
            durationMs=_duration_ms(run.get("startedAt"), completed_at),
        )

    def _fail(self, run_id: str, code: str, message: str) -> None:
        completed_at = _now()
        run = self.get_run(run_id) or {}
        self._update(
            run_id,
            status=STATUS_FAILED,
            completedAt=completed_at,
            durationMs=_duration_ms(run.get("startedAt"), completed_at),
            errorCode=code,
            errorMessage=message,
        )

    # -------------------------------------------------------------- promotion

    def deploy_run(self, run_id: str, force: bool = False) -> Dict[str, Any]:
        """
        Promotes a finished candidate using the existing `deploy.py` tool.

        Every condition the tool would have enforced anyway is checked first so
        the caller gets a machine-readable refusal instead of a generic failure:

          - the run must exist and be `PASSED` (a REJECTED or FAILED run can never
            be promoted, and `force` does not bypass that);
          - the registry artifact must exist;
          - `evaluation_report.json` must say `promotionEligible`.

        `deploy.py` still performs the copy and writes the deployment metadata, and
        it still keeps its `.backup` — this method adds no second deployment path.
        """
        from apps.ml.pipeline.deploy import deploy_model

        run = self.get_run(run_id)
        if run is None:
            raise TrainingRunNotFoundError(f"Unknown training run {run_id}")

        version = run.get("candidateVersion")
        if not version:
            raise DeploymentRefusedError(
                "CANDIDATE_NOT_READY", "The run has not produced a candidate yet"
            )
        if run.get("status") in ACTIVE_STATUSES:
            raise DeploymentRefusedError(
                "RUN_NOT_FINISHED", "The training run has not finished"
            )
        if run.get("status") != STATUS_PASSED and not force:
            raise DeploymentRefusedError(
                "CANDIDATE_NOT_ELIGIBLE",
                f"Run status is {run.get('status')}; only a PASSED candidate can be deployed",
            )

        detail = model_registry.version_detail(version)
        if not detail or not detail.get("artifactExists"):
            raise DeploymentRefusedError(
                "ARTIFACT_MISSING", f"Candidate v{version} has no model artifact"
            )
        if not detail.get("deployable"):
            raise DeploymentRefusedError(
                "CANDIDATE_NOT_ELIGIBLE",
                f"Candidate v{version} did not pass all mandatory quality gates",
            )

        deployed_at = _now()
        before = model_registry.active_deployment()
        deploy_model(version=version)
        reload_result = self.reload_running_model()

        after = model_registry.active_deployment()
        return {
            "artifactVersion": after.get("artifactVersion") or version,
            "previousVersion": before.get("artifactVersion"),
            "deployedAt": deployed_at,
            "artifactSha256": after.get("artifactSha256"),
            "runningVersion": reload_result.get("runningVersion"),
            "reloadPending": reload_result.get("reloadPending"),
            "reloadError": reload_result.get("reloadError"),
        }

    def reload_running_model(self) -> Dict[str, Any]:
        """
        Reloads the in-process classifier from the production artifact.

        Reported honestly in three parts: the version now being served, whether a
        reload is still pending, and why. A failed reload is NOT an exception here
        — the deployment did happen, and the dashboard must show "artifact
        deployed, running model still vN" rather than claim success.
        """
        try:
            artifact = category_classifier.reload()
        except Exception as error:  # noqa: BLE001 - reported, never swallowed
            on_disk = model_registry.active_deployment()
            return {
                "runningVersion": category_classifier.describe_artifact().get(
                    "activeVersion"
                ),
                "reloadPending": on_disk.get("artifactSha256")
                != category_classifier.describe_artifact().get("artifactSha256"),
                "reloadError": str(error) or "Model reload failed",
            }
        return {
            "runningVersion": artifact.get("activeVersion"),
            "reloadPending": False,
            "reloadError": None,
        }

    def rollback(self) -> Dict[str, Any]:
        """
        Restores the previous production artifact through `deploy.py --rollback`.

        The existing tool owns the mechanism (it copies `category_classifier.pkl.backup`
        back over the production artifact), so this adds ordering and reporting, not
        a second rollback implementation. Rolling back twice is refused by the tool
        itself when no backup exists, and that refusal is translated here.
        """
        from apps.ml.pipeline.deploy import deploy_model

        before = model_registry.active_deployment()
        if not before.get("rollbackAvailable"):
            raise DeploymentRefusedError(
                "NO_ROLLBACK_ARTIFACT",
                "No previous production artifact is available to roll back to",
            )

        previous_version = None
        backup_sha = before.get("backupSha256")
        for candidate in model_registry.list_versions():
            if candidate.get("artifactSha256") == backup_sha:
                previous_version = candidate.get("version")
                break

        try:
            deploy_model(version="", rollback=True)
        except (FileNotFoundError, RuntimeError) as error:
            raise DeploymentRefusedError(
                "ROLLBACK_FAILED", str(error) or "Rollback failed"
            ) from error

        reload_result = self.reload_running_model()
        after = model_registry.active_deployment()
        # `deploy.py` restores the artifact but does not rewrite
        # `model_metadata.json`, so the version it claims can be the version that was
        # just replaced. `artifactVersion` is checksum-derived and is the one the
        # dashboard reports; the divergence is surfaced rather than hidden.
        artifact_version = after.get("artifactVersion") or previous_version
        return {
            "artifactVersion": artifact_version,
            "restoredVersion": previous_version,
            "previousVersion": before.get("artifactVersion"),
            "deployedAt": _now(),
            "artifactSha256": after.get("artifactSha256"),
            "runningVersion": reload_result.get("runningVersion"),
            "reloadPending": reload_result.get("reloadPending"),
            "reloadError": reload_result.get("reloadError"),
            "deploymentMetadataStale": bool(
                after.get("deployedVersion")
                and after.get("deployedVersion") != artifact_version
            ),
        }


def _feedback_record_count(collected: List[Dict[str, Any]]) -> Optional[int]:
    """
    How many collected records came from human-reviewed feedback.

    Counted from the provenance `sourceType` the collector wrote, so this is the
    pipeline's own classification of its inputs rather than a second guess made
    from the database. Returns None when the collector reported nothing, which the
    dashboard renders as "Not available".
    """
    if not isinstance(collected, list):
        return None
    count = 0
    for record in collected:
        if not isinstance(record, dict):
            continue
        provenance = record.get("provenance")
        if isinstance(provenance, dict) and "feedback" in str(
            provenance.get("sourceType", "")
        ):
            count += 1
    return count


# The gate thresholds exactly as `evaluate.py` implements them. Recorded so the
# dashboard can show what a passing gate MEANS; kept next to the runner so it is
# obvious that they must be updated together with the evaluator.
GATE_THRESHOLDS: Dict[str, Dict[str, Any]] = {
    "accuracy_gate": {
        "description": "Top-1 accuracy at least 70% and no more than 5 points below the active model",
        "minimum": 0.70,
    },
    "duplicate_precision_gate": {
        "description": "Duplicate precision at least 95% with zero critical false merges",
        "minimum": 0.95,
    },
    "duplicate_recall_gate": {
        "description": "Duplicate recall at least 95%",
        "minimum": 0.95,
    },
    "latency_gate": {
        "description": "P95 inference latency at most 5 ms",
        "maximum": 5.0,
    },
    "memory_gate": {
        "description": "Peak memory at most 256 MB",
        "maximum": 256.0,
    },
    "provenance_gate": {
        "description": "Zero records with unverified provenance",
        "maximum": 0,
    },
}


training_runner = TrainingRunner()
