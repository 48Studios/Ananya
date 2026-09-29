"""Pinned historical baseline and production-feedback dataset lifecycle."""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from apps.ml.training.datasets.splitter import DeterministicDatasetSplitter
from apps.ml.training.processors.normalization import normalize_text, strip_packaging_suffix
from apps.ml.pipeline.collect import AUTHORITATIVE_RECORDS


BASELINE_MANIFEST_PATH = Path("apps/ml/data/canonical_training_baseline.json")
DEFAULT_OUTPUT_ROOT = Path("apps/ml/data/datasets/retraining")
SPLIT_SEED = 42
TRAIN_RATIO = 0.9
VALIDATION_RATIO = 0.1
GROUP_KEY = "base_family"
HARDCODED_BENCHMARK_RECORDS = len(AUTHORITATIVE_RECORDS)


class DatasetLifecycleError(ValueError):
    """Raised when the candidate dataset cannot be built safely."""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as source:
        return json.load(source)


def _normalized_text(value: Any) -> str:
    return normalize_text(str(value or "")).lower()


def _canonical_identity(value: Any) -> str:
    # Matches DeduplicationProcessor's existing exact MPN/SKU identity rule.
    return re.sub(r"[\s\-_/]", "", str(value or "").upper())


def _record_identities(record: Dict[str, Any]) -> set[str]:
    return {
        identity
        for identity in (
            _canonical_identity(record.get("mpn")),
            _canonical_identity(record.get("sku")),
        )
        if identity
    }


def _load_baseline(root: Path) -> Tuple[Dict[str, Any], List[Dict[str, Any]], List[Dict[str, Any]]]:
    manifest = _load_json(root / BASELINE_MANIFEST_PATH)
    training_meta = manifest["training_source"]
    test_meta = manifest["frozen_test_source"]
    training_path = root / training_meta["path"]
    test_path = root / test_meta["path"]

    for label, path, expected in (
        ("historical training", training_path, training_meta),
        ("frozen test", test_path, test_meta),
    ):
        if not path.is_file():
            raise DatasetLifecycleError(f"Missing {label} source: {path}")
        actual_hash = _sha256(path)
        if actual_hash != expected["sha256"]:
            raise DatasetLifecycleError(
                f"{label} hash mismatch: expected {expected['sha256']}, got {actual_hash}"
            )

    training = _load_json(training_path)
    frozen_test = _load_json(test_path)
    if not isinstance(training, list) or len(training) != training_meta["record_count"]:
        raise DatasetLifecycleError("Historical training record count mismatch")
    if not isinstance(frozen_test, list) or len(frozen_test) != test_meta["record_count"]:
        raise DatasetLifecycleError("Frozen test record count mismatch")
    return manifest, training, frozen_test


def _feedback_category(value: Any) -> Optional[str]:
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, dict):
        category = value.get("category") or value.get("categoryName")
        return str(category).strip() if category else None
    return None


def _feedback_example(item: Dict[str, Any], category: str) -> Optional[Dict[str, Any]]:
    context = item.get("creationContext")
    if not isinstance(context, dict):
        return None
    sku = str(context.get("sku") or context.get("mpn") or "").strip()
    mpn = str(context.get("mpn") or context.get("sku") or "").strip()
    pieces = [
        context.get("text"),
        context.get("sku"),
        context.get("mpn"),
        context.get("name"),
        context.get("description"),
        context.get("manufacturer"),
    ]
    text = " ".join(str(piece).strip() for piece in pieces if piece and str(piece).strip())
    if not text or not (sku or mpn):
        return None

    clean_mpn, base_family = strip_packaging_suffix(mpn or sku)
    label_origin = (
        "human_confirmed_final_value"
        if item.get("userAction") == "ACCEPTED"
        else "human_correction_final_value"
    )
    return {
        "text": text,
        "category": category,
        "domain": "ELECTRONICS",
        "hierarchy": [],
        "base_family": base_family,
        "mpn": clean_mpn,
        "sku": sku or clean_mpn,
        "source": "production_feedback",
        "feedback_id": str(item.get("id") or ""),
        "source_timestamp": item.get("createdAt"),
        "model_version": item.get("modelVersion"),
        "action": item.get("userAction"),
        "label_origin": label_origin,
        "label_confidence": item.get("confidence"),
        "label_confidence_level": item.get("confidenceLevel"),
        "reviewer_id": item.get("reviewerId"),
        "reviewer_email": item.get("reviewerEmail"),
        "provenance": {
            "sourceType": "human_reviewed_feedback",
            "sourceIdentifier": str(item.get("id") or ""),
            "retrievalTimestamp": item.get("createdAt"),
            "verificationStatus": "VERIFIED",
            "verificationMethod": "explicit_final_value_with_reviewer_identity",
            "source": "production_feedback",
            "feedback_id": str(item.get("id") or ""),
            "source_timestamp": item.get("createdAt"),
            "model_version": item.get("modelVersion"),
            "action": item.get("userAction"),
            "label_origin": label_origin,
            "label_confidence": item.get("confidence"),
            "label_confidence_level": item.get("confidenceLevel"),
            "reviewer_id": item.get("reviewerId"),
            "reviewer_email": item.get("reviewerEmail"),
        },
    }


def _feedback_audit_record(
    item: Dict[str, Any], eligible: bool, rejection_reason: Optional[str]
) -> Dict[str, Any]:
    """Retain only the feedback fields permitted for the training audit."""
    action = item.get("userAction")
    final_value = item.get("finalValue")
    label_origin = None
    if eligible:
        label_origin = (
            "human_confirmed_final_value"
            if action == "ACCEPTED"
            else "human_correction_final_value"
        )
    return {
        "feedback_id": item.get("id"),
        "action": action,
        "label_origin": label_origin,
        "finalValue": final_value,
        "eligibility": "TRAINING_ELIGIBLE" if eligible else "REJECTED",
        "rejection_reason": rejection_reason,
        "reviewer_id": item.get("reviewerId"),
        "reviewer_email": item.get("reviewerEmail"),
        "model_version": item.get("modelVersion"),
        "timestamp": item.get("createdAt"),
    }


def _validate_partition_leakage(
    train: List[Dict[str, Any]],
    validation: List[Dict[str, Any]],
    frozen_test: List[Dict[str, Any]],
) -> Dict[str, int]:
    partitions = {"train": train, "validation": validation, "test": frozen_test}
    collisions: Dict[str, int] = {}
    names = list(partitions)
    for left_index, left_name in enumerate(names):
        for right_name in names[left_index + 1 :]:
            left = partitions[left_name]
            right = partitions[right_name]
            for field, key_fn in (
                ("normalized_text", lambda row: _normalized_text(row.get("text"))),
                ("base_family", lambda row: str(row.get(GROUP_KEY) or "").strip().upper()),
            ):
                left_keys = {key_fn(row) for row in left}
                right_keys = {key_fn(row) for row in right}
                left_keys.discard("")
                right_keys.discard("")
                left_keys.discard(())
                right_keys.discard(())
                overlap = left_keys.intersection(right_keys)
                if overlap:
                    key = f"{left_name}_{right_name}_{field}"
                    collisions[key] = len(overlap)
            left_identities = set().union(*(_record_identities(row) for row in left))
            right_identities = set().union(*(_record_identities(row) for row in right))
            identity_overlap = left_identities.intersection(right_identities)
            if identity_overlap:
                collisions[f"{left_name}_{right_name}_canonical_identity"] = len(
                    identity_overlap
                )
    if collisions:
        raise DatasetLifecycleError(f"Dataset leakage detected: {collisions}")
    return collisions


def build_candidate_dataset(
    run_id: str,
    feedback_records: Optional[List[Dict[str, Any]]] = None,
    output_root: Optional[Path] = None,
    project_root: Optional[Path] = None,
) -> Dict[str, Any]:
    """Builds a versioned train/validation snapshot; frozen test remains read-only."""
    root = project_root or Path.cwd()
    baseline_manifest, historical, frozen_test = _load_baseline(root)
    feedback_records = feedback_records or []
    categories = {str(row.get("category", "")).strip() for row in historical}
    historical_category_counts = Counter(row["category"] for row in historical)
    historical_texts = {_normalized_text(row.get("text")) for row in historical}
    historical_identities = set().union(*(_record_identities(row) for row in historical))
    test_texts = {_normalized_text(row.get("text")) for row in frozen_test}
    test_identities = set().union(*(_record_identities(row) for row in frozen_test))
    test_families = {
        str(row.get(GROUP_KEY) or "").strip().upper()
        for row in frozen_test
        if row.get(GROUP_KEY)
    }
    seen_feedback_ids: set[str] = set()
    seen_feedback_text: set[str] = set()
    seen_feedback_identities: set[str] = set()
    rejection_reasons: Counter[str] = Counter()
    feedback_rejections: List[Dict[str, Any]] = []
    feedback_audit: List[Dict[str, Any]] = []
    accepted_feedback: List[Dict[str, Any]] = []
    corrected_historical_count = 0
    feedback_category_counts: Counter[str] = Counter()

    for item in feedback_records:
        reason: Optional[str] = None
        action = item.get("userAction")
        if item.get("suggestionType") != "CATEGORY" or item.get("field") != "category":
            reason = "not_category_feedback"
        elif action not in ("ACCEPTED", "EDITED"):
            reason = "action_not_accepted_or_edited"
        elif not item.get("reviewerId"):
            reason = "missing_reviewer_identity"
        elif not item.get("id"):
            reason = "missing_feedback_id"
        elif not item.get("finalValue"):
            reason = "missing_explicit_final_value"
        else:
            category = _feedback_category(item.get("finalValue"))
            if not category or category not in categories:
                reason = "missing_or_unknown_final_category"
            else:
                example = _feedback_example(item, category)
                if example is None:
                    reason = "missing_text_or_product_identity"
                else:
                    text_key = _normalized_text(example["text"])
                    identities = _record_identities(example)
                    family_key = str(example.get(GROUP_KEY) or "").strip().upper()
                    feedback_id = example["feedback_id"]
                    if text_key in test_texts or identities.intersection(test_identities):
                        reason = "matches_frozen_test_text_or_identity"
                    elif family_key in test_families:
                        reason = "matches_frozen_test_base_family"
                    elif feedback_id in seen_feedback_ids:
                        reason = "repeated_feedback_event"
                    elif identities.intersection(seen_feedback_identities):
                        reason = "duplicate_feedback_product_or_text"
                    elif identities.intersection(historical_identities):
                        historical_matches = [
                            row
                            for row in historical
                            if identities.intersection(_record_identities(row))
                        ]
                        historical_labels = {
                            row.get("category") for row in historical_matches
                        }
                        if (
                            action == "EDITED"
                            and len(historical_matches) > 0
                            and len(historical_labels) == 1
                            and category not in historical_labels
                        ):
                            for target in historical_matches:
                                target["historical_category"] = target.get("category")
                                target["category"] = category
                                target["source"] = "production_feedback"
                                target["feedback_id"] = feedback_id
                                target["source_timestamp"] = example["source_timestamp"]
                                target["model_version"] = example["model_version"]
                                target["action"] = action
                                target["label_origin"] = example["label_origin"]
                                target["label_confidence"] = example["label_confidence"]
                                target["label_confidence_level"] = example[
                                    "label_confidence_level"
                                ]
                                target["reviewer_id"] = example["reviewer_id"]
                                target["reviewer_email"] = example["reviewer_email"]
                                target["historical_provenance"] = target.get("provenance")
                                target["provenance"] = example["provenance"]
                            corrected_historical_count += 1
                            feedback_category_counts[category] += 1
                            seen_feedback_ids.add(feedback_id)
                            seen_feedback_text.add(text_key)
                            seen_feedback_identities.update(identities)
                        elif category in historical_labels and len(historical_labels) == 1:
                            reason = "duplicate_of_historical_training_record"
                        else:
                            reason = "duplicate_or_ambiguous_historical_identity"
                    elif text_key in historical_texts:
                        reason = "duplicate_historical_text"
                    else:
                        accepted_feedback.append(example)
                        feedback_category_counts[category] += 1
                        seen_feedback_ids.add(feedback_id)
                        seen_feedback_text.add(text_key)
                        seen_feedback_identities.update(identities)
        if reason:
            rejection_reasons[reason] += 1
            feedback_rejections.append(
                {"feedback_id": item.get("id"), "reason": reason}
            )
            feedback_audit.append(_feedback_audit_record(item, False, reason))
        else:
            feedback_audit.append(_feedback_audit_record(item, True, None))

    examples = historical + accepted_feedback
    for row in examples:
        if not row.get("text") or not row.get("category"):
            raise DatasetLifecycleError("Training example is missing text or category")
        if row.get("category") not in categories:
            raise DatasetLifecycleError(f"Invalid category in candidate data: {row.get('category')}")
        if (
            row.get("source") == "production_feedback"
            and row.get("provenance", {}).get("verificationStatus") != "VERIFIED"
        ):
            raise DatasetLifecycleError("Feedback training example has unverified provenance")
        if not row.get(GROUP_KEY):
            raise DatasetLifecycleError("Training example is missing populated base_family")

    splitter = DeterministicDatasetSplitter(
        train_ratio=TRAIN_RATIO,
        val_ratio=VALIDATION_RATIO,
        test_ratio=0.0,
        random_seed=SPLIT_SEED,
    )
    train, validation, unexpected_test = splitter.split(examples, group_key=GROUP_KEY)
    if unexpected_test:
        raise DatasetLifecycleError("Unexpected generated test partition; frozen test is fixed")
    missing_train_categories = categories - {row["category"] for row in train}
    if missing_train_categories:
        required_groups = {
            row[GROUP_KEY]
            for row in validation
            if row["category"] in missing_train_categories
        }
        moved = [row for row in validation if row[GROUP_KEY] in required_groups]
        train.extend(moved)
        validation = [row for row in validation if row[GROUP_KEY] not in required_groups]
        missing_train_categories = categories - {row["category"] for row in train}
    if missing_train_categories:
        raise DatasetLifecycleError(
            f"Historical categories absent from candidate training: {sorted(missing_train_categories)}"
        )
    _validate_partition_leakage(train, validation, frozen_test)

    version = f"production-retraining-{re.sub(r'[^A-Za-z0-9_.-]', '-', run_id)}"
    destination = (output_root or DEFAULT_OUTPUT_ROOT) / version
    destination = destination if destination.is_absolute() else root / destination
    destination.mkdir(parents=True, exist_ok=True)
    train_path = destination / "train.json"
    validation_path = destination / "val.json"
    train_path.write_text(json.dumps(train, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    validation_path.write_text(json.dumps(validation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    category_counts = Counter(row["category"] for row in examples)
    train_category_counts = Counter(row["category"] for row in train)
    validation_category_counts = Counter(row["category"] for row in validation)
    category_coverage = {
        category: {
            "historical_count": historical_category_counts[category],
            "feedback_count": feedback_category_counts[category],
            "candidate_count": category_counts[category],
            "train_count": train_category_counts[category],
            "validation_count": validation_category_counts[category],
        }
        for category in sorted(categories)
    }
    manifest = {
        "run_id": run_id,
        "dataset_version": version,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "historical_dataset_hash": baseline_manifest["training_source"]["sha256"],
        "historical_record_count": len(historical),
        "historical_training_records": len(historical),
        "feedback_record_count": len(feedback_records),
        "feedback_snapshot_hash": hashlib.sha256(
            json.dumps(
                feedback_records,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
                default=str,
            ).encode("utf-8")
        ).hexdigest(),
        "feedback_training_records": len(accepted_feedback) + corrected_historical_count,
        "feedback_eligible_count": len(accepted_feedback) + corrected_historical_count,
        "feedback_deduplicated_count": sum(
            count
            for reason, count in rejection_reasons.items()
            if reason.startswith("duplicate_") or reason == "repeated_feedback_event"
        ),
        "feedback_corrected_historical_records": corrected_historical_count,
        "feedback_appended_records": len(accepted_feedback),
        "feedback_rejected_count": sum(rejection_reasons.values()),
        "feedback_rejection_reasons": dict(sorted(rejection_reasons.items())),
        "feedback_rejections": feedback_rejections,
        "feedback_audit_file": "feedback_audit.json",
        "excluded_test_derived_count": baseline_manifest["excluded_test_derived_count"],
        "excluded_data_sources": [
            {
                "path": baseline_manifest["excluded_hard_negative_source"],
                "record_count": baseline_manifest["excluded_test_derived_count"],
                "reason": "test_derived_excluded",
            }
        ],
        "benchmark_records": HARDCODED_BENCHMARK_RECORDS,
        "combined_record_count": len(examples),
        "candidate_record_count": len(examples),
        "category_counts": dict(sorted(category_counts.items())),
        "category_coverage": category_coverage,
        "train_count": len(train),
        "validation_count": len(validation),
        "frozen_test_count": len(frozen_test),
        "split_seed": SPLIT_SEED,
        "split_strategy": "deterministic_group_shuffle_split",
        "group_key": GROUP_KEY,
        "historical_training_source": baseline_manifest["training_source"],
        "frozen_test_source": baseline_manifest["frozen_test_source"],
        "test_policy": "frozen_never_train",
        "train_hash": _sha256(train_path),
        "validation_hash": _sha256(validation_path),
        "test_hash": baseline_manifest["frozen_test_source"]["sha256"],
        "frozen_test_hash": baseline_manifest["frozen_test_source"]["sha256"],
        "checksums": {
            "train": _sha256(train_path),
            "validation": _sha256(validation_path),
            "frozen_test": baseline_manifest["frozen_test_source"]["sha256"],
        },
        "leakage_verified": True,
        "leakage_collisions": {},
    }
    feedback_audit_json = json.dumps(feedback_audit, ensure_ascii=False, indent=2) + "\n"
    manifest["feedback_audit_hash"] = hashlib.sha256(
        feedback_audit_json.encode("utf-8")
    ).hexdigest()
    (destination / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (destination / "feedback_audit.json").write_text(
        feedback_audit_json,
        encoding="utf-8",
    )
    return {
        "datasetVersion": version,
        "datasetDir": str(destination),
        "trainPath": str(train_path),
        "validationPath": str(validation_path),
        "frozenTestPath": str(root / baseline_manifest["frozen_test_source"]["path"]),
        "manifestPath": str(destination / "manifest.json"),
        "manifest": manifest,
        "trainSize": len(train),
        "valSize": len(validation),
        "historicalTrainingRecords": len(historical),
        "feedbackTrainingRecords": len(accepted_feedback) + corrected_historical_count,
        "feedbackRejectedRecords": sum(rejection_reasons.values()),
        "benchmarkRecords": HARDCODED_BENCHMARK_RECORDS,
        "quarantineRecords": sum(rejection_reasons.values()),
    }
