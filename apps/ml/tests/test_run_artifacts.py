import json
from pathlib import Path

from apps.ml.app.services.run_artifacts import (
    public_artifact_metadata,
    read_run_artifact,
    register_run_artifacts,
)


def test_rejected_candidate_artifacts_are_run_bound_and_retained(tmp_path):
    run_id = "run-forensic-test"
    candidate_version = "9.9.1"
    dataset_version = "production-retraining-run-forensic-test"
    registry = tmp_path / "apps/ml/models/registry" / f"v{candidate_version}"
    forensic = registry / "forensics"
    dataset = tmp_path / "apps/ml/data/datasets/retraining" / dataset_version
    forensic.mkdir(parents=True)
    dataset.mkdir(parents=True)

    candidate = registry / "category_classifier.pkl"
    candidate.write_bytes(b"candidate-model-fixture")
    (registry / "evaluation_report.json").write_text(
        json.dumps({"promotionEligible": False}), encoding="utf-8"
    )
    (dataset / "manifest.json").write_text(
        json.dumps({"run_id": run_id, "dataset_version": dataset_version}),
        encoding="utf-8",
    )
    for name in (
        "test_predictions",
        "confusion_matrix",
        "per_class_metrics",
        "evaluation_summary",
    ):
        (forensic / f"{name}.json").write_text("{}\n", encoding="utf-8")
    (dataset / "feedback_audit.json").write_text("[]\n", encoding="utf-8")

    active = tmp_path / "apps/ml/models/category_classifier.pkl"
    active.parent.mkdir(parents=True, exist_ok=True)
    active.write_bytes(b"active-model-fixture")
    active_before = active.read_bytes()

    manifest = register_run_artifacts(
        run_id, candidate_version, dataset_version, root=tmp_path
    )

    assert manifest["run_id"] == run_id
    assert manifest["candidate_version"] == candidate_version
    assert manifest["dataset_version"] == dataset_version
    metadata = public_artifact_metadata(manifest)
    assert {item["key"] for item in metadata} == {
        "candidate_model",
        "test_predictions",
        "confusion_matrix",
        "per_class_metrics",
        "evaluation_summary",
        "dataset_manifest",
        "feedback_audit",
    }

    retained = read_run_artifact(
        run_id, candidate_version, "candidate_model", root=tmp_path
    )
    assert retained is not None
    assert retained[0] == b"candidate-model-fixture"
    assert candidate.read_bytes() == b"candidate-model-fixture"
    assert active.read_bytes() == active_before
    assert read_run_artifact("another-run", candidate_version, "candidate_model", root=tmp_path) is None


def test_artifact_retrieval_rejects_unknown_keys_and_path_traversal(tmp_path):
    assert read_run_artifact("../other", "9.9.1", "candidate_model", root=tmp_path) is None
    assert read_run_artifact("run", "9.9.1", "../../active", root=tmp_path) is None
