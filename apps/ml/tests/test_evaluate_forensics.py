import json
from pathlib import Path
from types import SimpleNamespace

from apps.ml.pipeline import evaluate


class FixedProbabilityModel:
    classes_ = ["A", "B", "C"]

    def predict_proba(self, rows):
        text = rows[0]
        if text == "row a":
            return [[0.8, 0.15, 0.05]]
        if text == "row b":
            return [[0.6, 0.3, 0.1]]
        return [[0.1, 0.2, 0.7]]


def test_evaluation_persists_predictions_confusion_metrics_and_gate_details(
    tmp_path, monkeypatch
):
    version = "9.9.2"
    version_dir = tmp_path / "registry" / f"v{version}"
    version_dir.mkdir(parents=True)
    (version_dir / "category_classifier.pkl").write_bytes(b"synthetic-model")
    test_path = tmp_path / "frozen-test.json"
    rows = [
        {"text": "row a", "category": "A", "provenance": {"verification_status": "VERIFIED"}},
        {"text": "row b", "category": "B", "provenance": {"verification_status": "VERIFIED"}},
        {"text": "row c", "category": "C", "provenance": {"verification_status": "VERIFIED"}},
    ]
    test_path.write_text(json.dumps(rows), encoding="utf-8")
    active_path = tmp_path / "active.pkl"
    active_path.write_bytes(b"active-model-fixture")
    monkeypatch.setattr(evaluate.pickle, "load", lambda _handle: FixedProbabilityModel())
    monkeypatch.setattr(
        evaluate.manufacturer_resolver,
        "resolve",
        lambda _part_number: SimpleNamespace(manufacturer=None),
    )

    report = evaluate.evaluate_model(
        version=version,
        registry_dir=str(tmp_path / "registry"),
        active_model_path=str(active_path),
        test_data_path=str(test_path),
        run_id="run-eval-forensics",
        dataset_version="dataset-fixture",
        active_model_version="1.8.1",
    )

    forensic_dir = version_dir / "forensics"
    predictions = json.loads((forensic_dir / "test_predictions.json").read_text())
    confusion = json.loads((forensic_dir / "confusion_matrix.json").read_text())
    per_class = json.loads((forensic_dir / "per_class_metrics.json").read_text())
    summary = json.loads((forensic_dir / "evaluation_summary.json").read_text())

    assert len(predictions["predictions"]) == len(rows)
    assert all("text" not in prediction and "sku" not in prediction for prediction in predictions["predictions"])
    assert predictions["run_id"] == "run-eval-forensics"
    assert predictions["active_model_version"] == "1.8.1"
    assert all("active_model" in prediction for prediction in predictions["predictions"])
    assert [p["record_index"] for p in predictions["predictions"]] == [0, 1, 2]
    assert confusion["class_labels"] == ["A", "B", "C"]
    assert len(confusion["counts"]) == len(confusion["class_labels"])
    assert all(len(row) == len(confusion["class_labels"]) for row in confusion["counts"])
    assert sum(map(sum, confusion["counts"])) == len(rows)
    assert set(per_class["classes"]) == {"A", "B", "C"}
    assert all(set(metrics) == {"support", "precision", "recall", "f1"} for metrics in per_class["classes"].values())
    assert set(summary["gate_details"]) == set(report["qualityGates"])
    assert all({"actual_value", "threshold", "passed", "failure_reason"} <= set(detail) for detail in summary["gate_details"].values())
    assert report["metrics"]["accuracyDelta"] is not None
    assert report["promotionEligible"] is False
    assert (version_dir / "evaluation_report.json").is_file()
