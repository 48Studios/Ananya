"""
Test suite for the operator-triggered training runner and the registry reader.

Covers the properties the ML operations dashboard's safety argument depends on:

  - exactly one training run may be active, so two operators cannot interleave
    writes into the dataset snapshot and the model registry;
  - a run never promotes a model, whatever it evaluates to;
  - a candidate that did not pass every gate can never be deployed, and a run that
    did not finish can never be deployed;
  - a rollback is refused when the existing promotion tool has no backup;
  - a failed reload is reported as `reloadPending`, never as a successful
    deployment, because a copied artifact is not a running model;
  - a failure is classified with a stable code and leaves the production artifact
    byte-identical;
  - nothing the registry reader returns contains a filesystem path.

The pipeline itself is stubbed: these tests are about the control plane, not about
training accuracy (which `test_authoritative_pipeline.py` already covers).
"""

import hashlib
import os
import time

import pytest

from apps.ml.app.services import model_registry, training_runner
from apps.ml.app.services.category_classifier import category_classifier
from apps.ml.app.services.training_runner import (
    DeploymentRefusedError,
    TrainingRunConflictError,
    TrainingRunNotFoundError,
    TrainingRunner,
)

PRODUCTION_MODEL = "apps/ml/models/category_classifier.pkl"


def sha256_of(path: str) -> str:
    with open(path, "rb") as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def wait_for_terminal(runner: TrainingRunner, run_id: str, timeout: float = 10.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        run = runner.get_run(run_id)
        if run and run["status"] not in training_runner.ACTIVE_STATUSES:
            return run
        time.sleep(0.05)
    raise AssertionError(f"Run {run_id} did not finish within {timeout}s")


@pytest.fixture
def stub_pipeline(monkeypatch):
    """
    Replaces every pipeline step with a deterministic stub.

    The runner imports the pipeline lazily inside `_execute`, so patching the module
    attributes is enough — and it means the stub records exactly what the runner
    passed to each step.
    """
    calls = {}

    def fake_collect():
        calls["collect"] = True
        return [
            {
                "mpn": "RC0805FR-0710KL",
                "category": "Resistors",
                "manufacturer": "Yageo",
                "provenance": {"sourceType": "human_reviewed_feedback"},
            },
            {
                "mpn": "GRM188R71C104KA01D",
                "category": "Capacitors",
                "manufacturer": "Murata",
                "provenance": {"sourceType": "manufacturer_datasheet"},
            },
        ]

    def fake_validate():
        calls["validate"] = True
        return ([{"mpn": "RC0805FR-0710KL"}], [{"mpn": "BAD", "status": "PENDING"}])

    def fake_build_dataset(version: str = "1.3.0", **kwargs):
        calls["build"] = version
        return {
            "datasetVersion": f"components-2099-01-01-v{version}",
            "trainSize": 30,
            "valSize": 7,
        }

    def fake_train(train_path: str = "", val_path: str = "", version: str = "", **kwargs):
        calls["train"] = {"version": version, "train_path": train_path}
        return {"championModel": "char_ngram_model"}

    def fake_evaluate(version: str = "", val_data_path: str = "", **kwargs):
        calls["evaluate"] = {"version": version, "val_data_path": val_data_path}
        return {
            "metrics": {"candidateTop1Accuracy": 0.71},
            "qualityGates": {"accuracy_gate": True},
            "promotionEligible": True,
        }

    monkeypatch.setattr("apps.ml.pipeline.collect.collect_records", fake_collect)
    monkeypatch.setattr("apps.ml.pipeline.validate.run_validation", fake_validate)
    monkeypatch.setattr(
        "apps.ml.pipeline.build_dataset.build_dataset_snapshot", fake_build_dataset
    )
    monkeypatch.setattr("apps.ml.pipeline.train.train_model", fake_train)
    monkeypatch.setattr("apps.ml.pipeline.evaluate.evaluate_model", fake_evaluate)
    return calls


@pytest.fixture
def runner():
    return TrainingRunner()


@pytest.fixture
def production_checksum():
    """The production artifact's checksum before a test, so it can be compared after."""
    return sha256_of(PRODUCTION_MODEL)


# --------------------------------------------------------------------------- lifecycle


def test_run_reaches_passed_and_never_deploys(runner, stub_pipeline, production_checksum):
    run = runner.start_run("run-passed", "operator@ananya.local")
    # The run is driven on a background thread, so asserting one exact status
    # here is a race: by the time the assertion is evaluated the thread may
    # legitimately have advanced to a later active phase (EVALUATING). What the
    # test is entitled to state is that the run started and has not finished.
    assert run["status"] in training_runner.ACTIVE_STATUSES

    finished = wait_for_terminal(runner, "run-passed")
    assert finished["status"] == training_runner.STATUS_PASSED
    assert finished["phase"] == training_runner.PHASE_COMPLETED
    assert finished["artifactReference"].startswith("registry/v")
    assert finished["evaluationSummary"] == {"candidateTop1Accuracy": 0.71}
    assert finished["gateSummary"]["promotionEligible"] is True
    assert finished["datasetVersion"].startswith("components-2099-01-01-v")
    assert finished["trainingRecordCount"] == 30
    assert finished["validationRecordCount"] == 7
    assert finished["quarantineRecordCount"] == 1
    assert finished["feedbackRecordCount"] == 1
    assert finished["durationMs"] is not None

    # The whole point: a passing candidate is NOT promoted by the run.
    assert sha256_of(PRODUCTION_MODEL) == production_checksum


def test_run_reports_rejected_when_gates_fail(
    runner, stub_pipeline, monkeypatch, production_checksum
):
    monkeypatch.setattr(
        "apps.ml.pipeline.evaluate.evaluate_model",
        lambda **kwargs: {
            "metrics": {"candidateTop1Accuracy": 0.4},
            "qualityGates": {"accuracy_gate": False},
            "promotionEligible": False,
        },
    )
    runner.start_run("run-rejected")
    finished = wait_for_terminal(runner, "run-rejected")

    assert finished["status"] == training_runner.STATUS_REJECTED
    assert finished["errorCode"] is None
    assert sha256_of(PRODUCTION_MODEL) == production_checksum


def test_only_one_run_may_be_active(runner, stub_pipeline):
    runner.start_run("run-first")
    with pytest.raises(TrainingRunConflictError):
        runner.start_run("run-second")

    # The first run is still there and still the active one.
    active = runner.active_run()
    assert active is not None
    assert active["runId"] == "run-first"
    wait_for_terminal(runner, "run-first")


def test_a_finished_run_frees_the_runner(runner, stub_pipeline):
    runner.start_run("run-one")
    wait_for_terminal(runner, "run-one")
    assert runner.active_run() is None

    runner.start_run("run-two")
    wait_for_terminal(runner, "run-two")


def test_cancellation_is_not_claimed(runner, stub_pipeline):
    run = runner.start_run("run-cancel")
    # A background thread cannot be interrupted safely, so the runner says so
    # instead of exposing a cancel control that cannot work.
    assert run["cancellable"] is False
    wait_for_terminal(runner, "run-cancel")


# ---------------------------------------------------------------------------- failures


@pytest.mark.parametrize(
    "stage,expected_code",
    [
        ("collect", training_runner.ERROR_DATASET_BUILD_FAILED),
        ("validate", training_runner.ERROR_DATASET_BUILD_FAILED),
        ("build", training_runner.ERROR_DATASET_BUILD_FAILED),
        ("train", training_runner.ERROR_TRAINING_FAILED),
        ("evaluate", training_runner.ERROR_EVALUATION_FAILED),
    ],
)
def test_failure_is_classified_and_leaves_production_untouched(
    runner, stub_pipeline, monkeypatch, production_checksum, stage, expected_code
):
    def boom(**kwargs):
        raise RuntimeError(f"{stage} exploded")

    targets = {
        "collect": "apps.ml.pipeline.collect.collect_records",
        "validate": "apps.ml.pipeline.validate.run_validation",
        "build": "apps.ml.pipeline.build_dataset.build_dataset_snapshot",
        "train": "apps.ml.pipeline.train.train_model",
        "evaluate": "apps.ml.pipeline.evaluate.evaluate_model",
    }
    monkeypatch.setattr(targets[stage], boom)

    runner.start_run(f"run-{stage}")
    finished = wait_for_terminal(runner, f"run-{stage}")

    assert finished["status"] == training_runner.STATUS_FAILED
    assert finished["errorCode"] == expected_code
    assert "exploded" in finished["errorMessage"]
    assert finished["artifactReference"] is None
    # A failed run must not have touched the production artifact.
    assert sha256_of(PRODUCTION_MODEL) == production_checksum


def test_log_excerpt_is_bounded(runner, stub_pipeline, monkeypatch):
    def chatty(**kwargs):
        raise RuntimeError("x" * 5000)

    monkeypatch.setattr("apps.ml.pipeline.train.train_model", chatty)
    runner.start_run("run-chatty")
    finished = wait_for_terminal(runner, "run-chatty")

    assert len(finished["log"]) <= training_runner.MAX_LOG_LINES
    assert len("\n".join(finished["log"])) <= training_runner.MAX_LOG_CHARS + 200


def test_unknown_run_is_not_found(runner):
    assert runner.get_run("does-not-exist") is None
    with pytest.raises(TrainingRunNotFoundError):
        runner.deploy_run("does-not-exist")


# -------------------------------------------------------------------------- deployment


def test_deploy_refuses_a_run_that_is_still_active(runner, stub_pipeline):
    runner.start_run("run-active")
    with pytest.raises(DeploymentRefusedError) as error:
        runner.deploy_run("run-active")
    assert error.value.code in {"RUN_NOT_FINISHED", "CANDIDATE_NOT_ELIGIBLE"}
    wait_for_terminal(runner, "run-active")


def test_deploy_refuses_a_rejected_candidate(
    runner, stub_pipeline, monkeypatch, production_checksum
):
    monkeypatch.setattr(
        "apps.ml.pipeline.evaluate.evaluate_model",
        lambda **kwargs: {
            "metrics": {},
            "qualityGates": {"accuracy_gate": False},
            "promotionEligible": False,
        },
    )
    runner.start_run("run-rejected-deploy")
    wait_for_terminal(runner, "run-rejected-deploy")

    with pytest.raises(DeploymentRefusedError) as error:
        runner.deploy_run("run-rejected-deploy")
    assert error.value.code == "CANDIDATE_NOT_ELIGIBLE"
    assert sha256_of(PRODUCTION_MODEL) == production_checksum


def test_deploy_refuses_when_the_artifact_is_missing(runner, stub_pipeline):
    runner.start_run("run-no-artifact")
    wait_for_terminal(runner, "run-no-artifact")
    with pytest.raises(DeploymentRefusedError) as error:
        runner.deploy_run("run-no-artifact")
    assert error.value.code == "ARTIFACT_MISSING"


def test_rollback_is_refused_without_a_backup(runner, monkeypatch):
    monkeypatch.setattr(
        model_registry,
        "active_deployment",
        lambda: {"rollbackAvailable": False, "artifactVersion": "1.5.0"},
    )
    with pytest.raises(DeploymentRefusedError) as error:
        runner.rollback()
    assert error.value.code == "NO_ROLLBACK_ARTIFACT"


# ----------------------------------------------------------------------------- reload


def test_reload_reports_pending_rather_than_success(runner, monkeypatch):
    def failing_reload():
        raise RuntimeError("Production model artifact is missing")

    monkeypatch.setattr(category_classifier, "reload", failing_reload)
    # The running process still holds the previous artifact while a new one is on
    # disk — the exact state a failed reload leaves behind.
    monkeypatch.setattr(
        category_classifier,
        "describe_artifact",
        lambda: {"artifactSha256": "old-checksum", "activeVersion": "1.5.0"},
    )
    monkeypatch.setattr(
        model_registry,
        "active_deployment",
        lambda: {"artifactSha256": "new-checksum", "artifactVersion": "1.5.1"},
    )

    result = runner.reload_running_model()

    assert result["reloadPending"] is True
    assert result["reloadError"] == "Production model artifact is missing"
    assert result["runningVersion"] == "1.5.0"


def test_a_failed_reload_of_an_unchanged_artifact_is_not_pending(runner, monkeypatch):
    """Re-deploying the same bytes must not be reported as a pending reload."""

    def failing_reload():
        raise RuntimeError("transient read failure")

    monkeypatch.setattr(category_classifier, "reload", failing_reload)
    monkeypatch.setattr(
        category_classifier,
        "describe_artifact",
        lambda: {"artifactSha256": "same", "activeVersion": "1.5.0"},
    )
    monkeypatch.setattr(
        model_registry,
        "active_deployment",
        lambda: {"artifactSha256": "same", "artifactVersion": "1.5.0"},
    )

    result = runner.reload_running_model()

    assert result["reloadPending"] is False
    assert result["reloadError"] == "transient read failure"


def test_reload_of_a_valid_artifact_succeeds(monkeypatch):
    monkeypatch.setattr(
        category_classifier,
        "reload",
        lambda: {"activeVersion": "9.9.9", "artifactSha256": "abc"},
    )
    monkeypatch.setattr(
        model_registry,
        "active_deployment",
        lambda: {"artifactSha256": "abc", "artifactVersion": "9.9.9"},
    )
    result = TrainingRunner().reload_running_model()
    assert result == {
        "runningVersion": "9.9.9",
        "reloadPending": False,
        "reloadError": None,
    }


# ----------------------------------------------------------------------- registry view


def test_registry_lists_versions_with_checksums_and_no_paths():
    versions = model_registry.list_versions()
    assert len(versions) > 0

    for version in versions:
        assert version["version"].count(".") == 2
        if version["artifactExists"]:
            assert version["artifactSha256"]
            assert version["artifactSizeBytes"] > 0
        # A path must never reach a response: only version names and hashes.
        serialised = repr(version)
        assert "apps/ml" not in serialised
        assert "/Users" not in serialised
        assert os.sep + "models" not in serialised

    # Newest first.
    assert versions[0]["version"] >= versions[-1]["version"]


def test_evaluation_report_drops_the_validation_path():
    report = {
        "candidateVersion": "1.5.0",
        "validationSource": "apps/ml/data/datasets/components-x-v1.5.0/val.json",
        "metrics": {"candidateTop1Accuracy": 0.7},
    }
    public = model_registry._public_evaluation(report)
    assert "validationSource" not in public
    assert public["metrics"] == {"candidateTop1Accuracy": 0.7}
    assert model_registry._public_evaluation(None) is None


def test_active_deployment_resolves_the_version_by_checksum():
    active = model_registry.active_deployment()
    assert active["artifactVersionSource"] in {"CHECKSUM", "DEPLOYMENT_METADATA", None}
    if active["artifactSha256"]:
        assert (
            model_registry.resolve_version_for_checksum(active["artifactSha256"])
            is not None
        )
    assert model_registry.resolve_version_for_checksum(None) is None
    assert model_registry.resolve_version_for_checksum("0" * 64) is None


def test_next_candidate_version_is_above_every_existing_one():
    next_version = model_registry.next_candidate_version()
    existing = [item["version"] for item in model_registry.list_versions()]
    assert next_version not in existing
    if existing:
        assert model_registry._version_sort_key(next_version) > max(
            model_registry._version_sort_key(version) for version in existing
        )


def test_dataset_snapshot_rejects_traversal_and_reports_a_fingerprint():
    assert model_registry.dataset_snapshot("../etc") is None
    assert model_registry.dataset_snapshot("nope/../..") is None
    assert model_registry.dataset_snapshot("") is None
    assert model_registry.dataset_snapshot("no-such-snapshot") is None

    snapshot = model_registry.current_dataset()
    if snapshot is not None:
        assert len(snapshot["fingerprint"]) == 64
        assert snapshot["datasetVersion"]


def test_quarantine_summary_reports_availability_and_counts_only():
    summary = model_registry.quarantine_summary()
    assert "available" in summary
    assert summary["total"] >= 0
    assert isinstance(summary["byReason"], list)
    for reason in summary["byReason"]:
        assert set(reason.keys()) == {"reason", "count"}
    # Never a quarantined payload.
    assert "records" not in summary
    assert "items" not in summary


def test_validated_distribution_is_counts_only():
    distribution = model_registry.validated_record_distribution()
    assert distribution["recordCount"] >= 0
    assert isinstance(distribution["categories"], list)
    for entry in distribution["categories"]:
        assert set(entry.keys()) == {"name", "count"}
    assert "records" not in distribution
