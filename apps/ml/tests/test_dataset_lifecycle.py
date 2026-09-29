"""Regression coverage for production retraining source selection and isolation."""

import hashlib
import json
from pathlib import Path

import pytest

from apps.ml.pipeline.dataset_lifecycle import (
    BASELINE_MANIFEST_PATH,
    DatasetLifecycleError,
    _load_baseline,
    _validate_partition_leakage,
    build_candidate_dataset,
)


ROOT = Path.cwd()
BASELINE_DIR = Path(
    "apps/ml/training/datasets/training/dataset-crawl-1790343594-reprocessed"
)
EXPECTED_TRAIN_HASH = "fdbb86f81a3ff8e275d8f025efd2c6985e6ce1fd2dd11657f0ec806765ba680d"
EXPECTED_TEST_HASH = "0804a284ad6a01c7cb32c0950a0e5740a4e46bed1892af2e2ebbb01123125498"


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _feedback(
    *,
    feedback_id="fb-1",
    action="EDITED",
    reviewer="user-1",
    final_value="Resistors",
    predicted="Sensors",
    sku="UNIQUE-RESISTOR-9001",
):
    return {
        "id": feedback_id,
        "suggestionType": "CATEGORY",
        "field": "category",
        "creationContext": {
            "sku": sku,
            "name": "Precision resistor",
            "description": "10k ohm 1 percent surface mount component",
            "manufacturer": "Example Devices",
        },
        "predictedValue": predicted,
        "userAction": action,
        "finalValue": final_value,
        "reviewerId": reviewer,
        "reviewerEmail": "reviewer@example.test" if reviewer else None,
        "modelVersion": "1.8.1",
        "createdAt": "2026-09-29T00:00:00Z",
    }


def _build(tmp_path, feedback=None, run_id="test-run"):
    return build_candidate_dataset(
        run_id=run_id,
        feedback_records=feedback or [],
        output_root=tmp_path,
        project_root=ROOT,
    )


def test_canonical_baseline_is_pinned_and_default_without_feedback(tmp_path):
    active_model = ROOT / "apps/ml/models/category_classifier.pkl"
    active_hash_before = _sha(active_model)
    result = _build(tmp_path)
    manifest = result["manifest"]
    assert manifest["historical_record_count"] == 11319
    assert manifest["combined_record_count"] == 11319
    assert manifest["feedback_training_records"] == 0
    assert manifest["benchmark_records"] == 25
    assert manifest["train_count"] + manifest["validation_count"] == 11319
    assert manifest["historical_dataset_hash"] == EXPECTED_TRAIN_HASH
    assert manifest["test_hash"] == EXPECTED_TEST_HASH
    assert _sha(ROOT / BASELINE_DIR / "train.json") == EXPECTED_TRAIN_HASH
    assert _sha(ROOT / BASELINE_DIR / "test.json") == EXPECTED_TEST_HASH
    assert _sha(active_model) == active_hash_before


def test_benchmark_corpus_never_becomes_the_only_training_data(tmp_path):
    manifest = _build(tmp_path)["manifest"]
    assert manifest["benchmark_records"] == 25
    assert manifest["historical_record_count"] == 11319
    assert manifest["combined_record_count"] >= manifest["historical_record_count"]


def test_frozen_test_text_and_identity_are_rejected_from_feedback(tmp_path):
    frozen = json.loads((ROOT / BASELINE_DIR / "test.json").read_text())[0]
    feedback = _feedback(
        sku=frozen.get("sku") or frozen.get("mpn"),
        final_value=frozen["category"],
    )
    result = _build(tmp_path, [feedback])
    assert result["manifest"]["feedback_training_records"] == 0
    assert result["manifest"]["feedback_rejection_reasons"][
        "matches_frozen_test_text_or_identity"
    ] == 1


def test_known_test_derived_hard_negative_is_rejected(tmp_path):
    hard_path = next((ROOT / "apps/ml/training/evaluation").glob("hard_negative_*.json"))
    hard = json.loads(hard_path.read_text())["records"][0]
    feedback = _feedback(
        sku=hard["sku"],
        final_value=hard["expected"],
    )
    feedback["creationContext"]["text"] = hard["text"]
    result = _build(tmp_path, [feedback])
    assert result["manifest"]["feedback_training_records"] == 0
    assert result["manifest"]["feedback_rejection_reasons"][
        "matches_frozen_test_text_or_identity"
    ] == 1
    assert result["manifest"]["excluded_test_derived_count"] == 66


def test_predicted_value_alone_never_becomes_a_supervised_label(tmp_path):
    feedback = _feedback(final_value=None)
    result = _build(tmp_path, [feedback])
    assert result["manifest"]["feedback_training_records"] == 0
    assert result["manifest"]["feedback_rejection_reasons"][
        "missing_explicit_final_value"
    ] == 1


def test_explicit_final_value_requires_reviewer_and_is_the_training_label(tmp_path):
    feedback = _feedback(final_value="Resistors", predicted="Sensors")
    result = _build(tmp_path, [feedback])
    train = json.loads(Path(result["trainPath"]).read_text())
    validation = json.loads(Path(result["validationPath"]).read_text())
    rows = train + validation
    accepted = [row for row in rows if row.get("feedback_id") == "fb-1"]
    assert len(accepted) == 1
    assert accepted[0]["category"] == "Resistors"
    assert accepted[0]["source"] == "production_feedback"
    assert accepted[0]["label_origin"] == "human_correction_final_value"
    assert accepted[0]["provenance"]["feedback_id"] == "fb-1"
    assert accepted[0]["provenance"]["reviewer_id"] == "user-1"
    assert accepted[0]["provenance"]["model_version"] == "1.8.1"
    assert accepted[0]["category"] != accepted[0].get("predictedValue")


def test_explicit_correction_updates_matching_historical_example_once(tmp_path):
    historical = json.loads((ROOT / BASELINE_DIR / "train.json").read_text())[0]
    feedback = _feedback(
        sku=historical.get("sku") or historical["mpn"],
        final_value="Resistors",
    )
    result = _build(tmp_path, [feedback])
    train = json.loads(Path(result["trainPath"]).read_text())
    validation = json.loads(Path(result["validationPath"]).read_text())
    match = next(
        row
        for row in train + validation
        if row.get("feedback_id") == "fb-1"
    )
    assert match["category"] == "Resistors"
    assert match["source"] == "production_feedback"
    assert match["historical_provenance"] == historical["provenance"]
    assert result["manifest"]["feedback_corrected_historical_records"] == 1
    assert result["manifest"]["combined_record_count"] == 11319


def test_missing_reviewer_keeps_feedback_out_of_training(tmp_path):
    result = _build(tmp_path, [_feedback(reviewer=None)])
    assert result["manifest"]["feedback_training_records"] == 0
    assert result["manifest"]["feedback_rejection_reasons"][
        "missing_reviewer_identity"
    ] == 1


@pytest.mark.parametrize(
    "train,validation,test",
    [
        ([{"text": "Same product", "category": "Tools", "base_family": "A", "mpn": "A"}],
         [{"text": "Other", "category": "Tools", "base_family": "B", "mpn": "B"}],
         [{"text": "Same product", "category": "Tools", "base_family": "C", "mpn": "C"}]),
        ([{"text": "One", "category": "Tools", "base_family": "A", "mpn": "A"}],
         [{"text": "Two", "category": "Tools", "base_family": "A", "mpn": "B"}],
         []),
        ([{"text": "One", "category": "Tools", "base_family": "A", "mpn": "SAME"}],
         [{"text": "Two", "category": "Tools", "base_family": "B", "mpn": "same"}],
         []),
    ],
)
def test_partition_text_identity_or_group_leakage_fails(train, validation, test):
    with pytest.raises(DatasetLifecycleError, match="leakage detected"):
        _validate_partition_leakage(train, validation, test)


def test_missing_group_key_fails_in_existing_splitter():
    from apps.ml.training.datasets.splitter import DeterministicDatasetSplitter

    splitter = DeterministicDatasetSplitter(
        train_ratio=0.9, val_ratio=0.1, test_ratio=0.0
    )
    with pytest.raises(ValueError, match="Missing populated group key"):
        splitter.split([{"text": "missing family", "category": "Tools"}])


def test_bad_pinned_hash_fails_before_dataset_construction(tmp_path):
    root = tmp_path
    manifest_path = root / BASELINE_MANIFEST_PATH
    manifest_path.parent.mkdir(parents=True)
    train_path = root / BASELINE_DIR / "train.json"
    test_path = root / BASELINE_DIR / "test.json"
    train_path.parent.mkdir(parents=True)
    train_path.write_text("[]")
    test_path.write_text("[]")
    manifest_path.write_text(
        json.dumps(
            {
                "training_source": {
                    "path": str(BASELINE_DIR / "train.json"),
                    "sha256": "bad-hash",
                    "record_count": 11319,
                },
                "frozen_test_source": {
                    "path": str(BASELINE_DIR / "test.json"),
                    "sha256": "bad-hash",
                    "record_count": 1342,
                },
            }
        )
    )
    with pytest.raises(DatasetLifecycleError, match="hash mismatch"):
        _load_baseline(root)


def test_identical_inputs_produce_identical_partition_hashes(tmp_path):
    first = _build(tmp_path / "first", run_id="repro")['manifest']
    second = _build(tmp_path / "second", run_id="repro")['manifest']
    assert first["train_hash"] == second["train_hash"]
    assert first["validation_hash"] == second["validation_hash"]
