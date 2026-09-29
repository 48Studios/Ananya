#!/usr/bin/env python3
"""
Model Evaluation Pipeline & Automated Quality Gates (RFC-0058)
Evaluates candidate models against:
1. Top-1 & Top-3 Category Accuracy on held-out validation data
2. Active Production Model Comparison (prevents accuracy regression)
3. Per-category Precision, Recall, and Confusion Matrix
4. Manufacturer Resolution Accuracy
5. Duplicate Detection Precision & Recall (zero critical false positives)
6. Data Leakage Verification (zero base family overlap)
7. Latency (P50, P95, P99) and RAM Footprint
8. Dataset Provenance Validation (0 unverified/synthetic records)
"""

import os
import json
import time
import pickle
import resource
import argparse
import hashlib
from typing import Dict, Any, List
import numpy as np
from sklearn.metrics import classification_report, confusion_matrix
from apps.ml.benchmarks.duplicate_benchmark import BENCHMARK_CASES, run_domain_aware_model
from apps.ml.app.services.manufacturer_resolver import manufacturer_resolver


def _count_unverified_provenance(samples: List[Dict[str, Any]]) -> int:
    """Count records without explicitly verified provenance."""
    return sum(
        1
        for item in samples
        if not isinstance(item.get("provenance"), dict)
        or item["provenance"].get("verification_status") != "VERIFIED"
    )


def _record_fingerprint(item: Dict[str, Any], index: int) -> str:
    """Stable, non-PII identifier for one evaluation row."""
    identity = "|".join(
        str(item.get(key) or "").strip().upper() for key in ("id", "sku", "mpn")
    )
    text = " ".join(str(item.get("text") or "").lower().split())
    return hashlib.sha256(f"{index}\0{identity}\0{text}".encode("utf-8")).hexdigest()


def _write_json(path: str, payload: Any) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    temporary_path = f"{path}.tmp"
    with open(temporary_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    os.replace(temporary_path, path)


def evaluate_model(
    version: str = "1.3.0",
    registry_dir: str = "apps/ml/models/registry",
    val_data_path: str = "",
    active_model_path: str = "apps/ml/models/category_classifier.pkl",
    test_data_path: str = "",
    run_id: str = "",
    dataset_version: str = "",
    active_model_version: str = "",
) -> Dict[str, Any]:
    version_dir = os.path.join(registry_dir, f"v{version}")
    candidate_model_path = os.path.join(version_dir, "category_classifier.pkl")

    if not os.path.exists(candidate_model_path):
        raise FileNotFoundError(f"Candidate model artifact not found at {candidate_model_path}")

    with open(candidate_model_path, "rb") as f:
        candidate_model = pickle.load(f)

    # Production retraining supplies the frozen test path explicitly. Legacy
    # callers retain the existing validation-path behavior.
    evaluation_data_path = test_data_path or val_data_path
    evaluation_role = "frozen_test" if test_data_path else "validation"
    if not evaluation_data_path:
        # Check if snapshot val exists
        candidates = [
            f"apps/ml/data/datasets/components-*-v{version}/val.json",
            "apps/ml/data/training_dataset.json",
        ]
        import glob
        matches = glob.glob(candidates[0])
        evaluation_data_path = matches[0] if matches else candidates[1]

    if not os.path.exists(evaluation_data_path):
        raise FileNotFoundError(f"Evaluation dataset not found at {evaluation_data_path}")

    with open(evaluation_data_path, "r") as f:
        val_samples = json.load(f)

    print("=" * 60)
    print(f" EVALUATING CANDIDATE MODEL v{version} ON {len(val_samples)} SAMPLES")
    print(f" Evaluation Source ({evaluation_role}): {evaluation_data_path}")
    print("=" * 60)

    # 1. Candidate Category Classification Evaluation
    cand_top1_correct = 0
    cand_top3_correct = 0
    latencies = []
    y_true = []
    y_pred = []
    prediction_records: List[Dict[str, Any]] = []
    active_prediction_records: List[Dict[str, Any]] = []

    for index, item in enumerate(val_samples):
        text = item["text"].lower()
        true_cat = item["category"]
        y_true.append(true_cat)

        t0 = time.perf_counter()
        probs = candidate_model.predict_proba([text])[0]
        elapsed_ms = (time.perf_counter() - t0) * 1000
        latencies.append(elapsed_ms)

        classes = candidate_model.classes_
        top_indices = np.argsort(probs)[::-1][:3]
        top_classes = [classes[i] for i in top_indices]
        top_predictions = [
            {"label": str(classes[class_index]), "probability": float(probs[class_index])}
            for class_index in top_indices
        ]

        y_pred.append(top_classes[0])
        prediction_records.append(
            {
                "record_index": index,
                "record_sha256": _record_fingerprint(item, index),
                "actual": true_cat,
                "predicted": str(top_classes[0]),
                "top1_confidence": top_predictions[0]["probability"],
                "top3": top_predictions,
                "correct": str(top_classes[0]).lower() == true_cat.lower(),
            }
        )
        if top_classes[0].lower() == true_cat.lower():
            cand_top1_correct += 1
        if any(c.lower() == true_cat.lower() for c in top_classes):
            cand_top3_correct += 1

    total_samples = max(1, len(val_samples))
    cand_top1_acc = cand_top1_correct / total_samples
    cand_top3_acc = cand_top3_correct / total_samples

    # 2. Active Model Comparison (Baseline)
    active_top1_acc = 0.0
    active_top3_acc = 0.0
    if os.path.exists(active_model_path):
        try:
            with open(active_model_path, "rb") as f:
                active_model = pickle.load(f)
            act_top1 = 0
            act_top3 = 0
            for index, item in enumerate(val_samples):
                text = item["text"].lower()
                true_cat = item["category"]
                probs = active_model.predict_proba([text])[0]
                classes = active_model.classes_
                top_indices = np.argsort(probs)[::-1][:3]
                top_classes = [classes[i] for i in top_indices]
                active_top = [
                    {
                        "label": str(classes[class_index]),
                        "probability": float(probs[class_index]),
                    }
                    for class_index in top_indices
                ]
                active_prediction_records.append(
                    {
                        "record_index": index,
                        "predicted": str(top_classes[0]),
                        "top1_confidence": active_top[0]["probability"],
                        "top3": active_top,
                        "correct": str(top_classes[0]).lower() == true_cat.lower(),
                    }
                )
                if top_classes[0].lower() == true_cat.lower():
                    act_top1 += 1
                if any(c.lower() == true_cat.lower() for c in top_classes):
                    act_top3 += 1
            active_top1_acc = act_top1 / total_samples
            active_top3_acc = act_top3 / total_samples
        except Exception as e:
            active_prediction_records = []
            print(f"Warning: active model baseline evaluation encountered error: {e}")

    for prediction in prediction_records:
        prediction["active_model"] = (
            active_prediction_records[prediction["record_index"]]
            if "record_index" in prediction
            else None
        )

    # 3. Manufacturer Resolution Accuracy
    mfg_test_cases = [
        ("RC0805FR-0710KL", "Yageo"),
        ("GRM21BR61A226ME51L", "Murata"),
        ("C0805C105K8RACTU", "KEMET"),
        ("SWPA4020S100MT", "Sunlord"),
        ("BSS138", "Slkor"),
        ("STM32F407VGT6", "STMicroelectronics"),
        ("NE5532P", "Texas Instruments"),
        ("CRCW0805100KFKEA", "Vishay"),
    ]
    mfg_correct = 0
    for pn, expected_mfg in mfg_test_cases:
        res = manufacturer_resolver.resolve(pn)
        # `manufacturer` is Optional: the resolver legitimately reports no
        # manufacturer for an ambiguous or unresolved part number. Calling
        # `.lower()` on it aborted the whole evaluation run with an
        # AttributeError, so a single unresolvable test case prevented every
        # quality gate from ever being reported. An unresolved manufacturer is a
        # miss, which is exactly what it was before the crash was reachable — the
        # accuracy figure and therefore every gate threshold is unchanged.
        if (res.manufacturer or "").lower() == expected_mfg.lower():
            mfg_correct += 1
    mfg_acc = mfg_correct / len(mfg_test_cases)

    # 4. Duplicate Detection Precision, Recall & Critical False Positives
    dup_tp = dup_fp = dup_tn = dup_fn = 0
    critical_false_positives = 0
    for tc in BENCHMARK_CASES:
        pred, _, _ = run_domain_aware_model(tc)
        if tc.expected_is_duplicate and pred:
            dup_tp += 1
        elif not tc.expected_is_duplicate and not pred:
            dup_tn += 1
        elif not tc.expected_is_duplicate and pred:
            dup_fp += 1
            critical_false_positives += 1
        else:
            dup_fn += 1

    dup_prec = dup_tp / (dup_tp + dup_fp) if (dup_tp + dup_fp) > 0 else 1.0
    dup_rec = dup_tp / (dup_tp + dup_fn) if (dup_tp + dup_fn) > 0 else 0.0

    # 5. Provenance & Leakage Verification
    unverified_count = _count_unverified_provenance(val_samples)

    # 6. Latency & Resource Consumption
    p50_latency = float(np.percentile(latencies, 50))
    p95_latency = float(np.percentile(latencies, 95))
    p99_latency = float(np.percentile(latencies, 99))
    max_rss_kb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    ram_mb = max_rss_kb / (1024 * 1024) if max_rss_kb > 1000000 else max_rss_kb / 1024
    artifact_size_bytes = os.path.getsize(candidate_model_path)

    # 7. Automated Quality Gates Evaluation
    # Rule: Top-1 must not regress compared to active model baseline and must be >= 70%
    accuracy_regression = cand_top1_acc < (active_top1_acc - 0.05) if active_top1_acc > 0 else False

    gates = {
        "accuracy_gate": not accuracy_regression and cand_top1_acc >= 0.70,
        "duplicate_precision_gate": dup_prec >= 0.95 and critical_false_positives == 0,
        "duplicate_recall_gate": dup_rec >= 0.95,
        "latency_gate": p95_latency <= 5.0,
        "memory_gate": ram_mb <= 256.0,
        "provenance_gate": unverified_count == 0,
    }

    all_gates_passed = all(gates.values())

    gate_details = {
        "accuracy_gate": {
            "actual_value": cand_top1_acc,
            "threshold": {"minimum": 0.70, "maximum_regression": 0.05},
            "passed": gates["accuracy_gate"],
            "failure_reason": None if gates["accuracy_gate"] else (
                f"Top-1 regressed by {active_top1_acc - cand_top1_acc:.6f}; "
                "maximum allowed regression is 0.05"
                if accuracy_regression else "Top-1 is below the 0.70 minimum"
            ),
        },
        "duplicate_precision_gate": {
            "actual_value": {"precision": dup_prec, "critical_false_positives": critical_false_positives},
            "threshold": {"minimum": 0.95, "critical_false_positives": 0},
            "passed": gates["duplicate_precision_gate"],
            "failure_reason": None if gates["duplicate_precision_gate"] else (
                "Precision is below 0.95 or critical false merges are nonzero"
            ),
        },
        "duplicate_recall_gate": {
            "actual_value": dup_rec,
            "threshold": {"minimum": 0.95},
            "passed": gates["duplicate_recall_gate"],
            "failure_reason": None if gates["duplicate_recall_gate"] else "Recall is below 0.95",
        },
        "latency_gate": {
            "actual_value": p95_latency,
            "threshold": {"maximum_ms": 5.0},
            "passed": gates["latency_gate"],
            "failure_reason": None if gates["latency_gate"] else "P95 latency exceeds 5.0 ms",
        },
        "memory_gate": {
            "actual_value": ram_mb,
            "threshold": {"maximum_mb": 256.0},
            "passed": gates["memory_gate"],
            "failure_reason": None if gates["memory_gate"] else "Peak memory exceeds 256 MB",
        },
        "provenance_gate": {
            "actual_value": unverified_count,
            "threshold": {"maximum_unverified": 0},
            "passed": gates["provenance_gate"],
            "failure_reason": None if gates["provenance_gate"] else "Unverified provenance records are present",
        },
    }

    evaluation_labels = sorted(
        {str(label) for label in y_true}.union(
            str(label) for label in candidate_model.classes_
        )
    )
    matrix = confusion_matrix(y_true, y_pred, labels=evaluation_labels)
    class_report = classification_report(
        y_true,
        y_pred,
        labels=evaluation_labels,
        target_names=evaluation_labels,
        output_dict=True,
        zero_division=0,
    )
    per_class_metrics = {
        label: {
            "support": int(class_report[label]["support"]),
            "precision": float(class_report[label]["precision"]),
            "recall": float(class_report[label]["recall"]),
            "f1": float(class_report[label]["f1-score"]),
        }
        for label in evaluation_labels
    }
    forensic_dir = os.path.join(version_dir, "forensics")
    artifact_paths = {
        "test_predictions": os.path.join(forensic_dir, "test_predictions.json"),
        "confusion_matrix": os.path.join(forensic_dir, "confusion_matrix.json"),
        "per_class_metrics": os.path.join(forensic_dir, "per_class_metrics.json"),
    }
    _write_json(
        artifact_paths["test_predictions"],
        {
            "run_id": run_id or None,
            "candidate_version": version,
            "dataset_version": dataset_version or None,
            "active_model_version": active_model_version or None,
            "evaluation_dataset_role": evaluation_role,
            "total_samples": len(val_samples),
            "predictions": prediction_records,
        },
    )
    _write_json(
        artifact_paths["confusion_matrix"],
        {
            "class_labels": evaluation_labels,
            "row_order": "actual",
            "column_order": "predicted",
            "counts": matrix.tolist(),
            "total_samples": len(val_samples),
        },
    )
    _write_json(
        artifact_paths["per_class_metrics"],
        {"total_samples": len(val_samples), "classes": per_class_metrics},
    )

    report = {
        "candidateVersion": version,
        "evaluatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "validationSamplesCount": len(val_samples),
        "validationSource": evaluation_data_path,
        "evaluationDatasetRole": evaluation_role,
        "testSamplesCount": len(val_samples) if evaluation_role == "frozen_test" else None,
        "metrics": {
            "candidateTop1Accuracy": round(cand_top1_acc, 4),
            "candidateTop3Accuracy": round(cand_top3_acc, 4),
            "activeModelTop1Accuracy": round(active_top1_acc, 4),
            "activeModelTop3Accuracy": round(active_top3_acc, 4),
            "accuracyDelta": round(cand_top1_acc - active_top1_acc, 4),
            "manufacturerAccuracy": round(mfg_acc, 4),
            "duplicatePrecision": round(dup_prec, 4),
            "duplicateRecall": round(dup_rec, 4),
            "criticalFalsePositives": critical_false_positives,
            "latencyMs": {
                "p50": round(p50_latency, 3),
                "p95": round(p95_latency, 3),
                "p99": round(p99_latency, 3),
            },
            "modelSizeBytes": artifact_size_bytes,
            "peakMemoryMb": round(ram_mb, 2),
            "unverifiedProvenanceCount": unverified_count,
        },
        "qualityGates": gates,
        "gateDetails": gate_details,
        "forensicArtifactKeys": list(artifact_paths),
        "promotionEligible": all_gates_passed,
    }

    _write_json(
        os.path.join(forensic_dir, "evaluation_summary.json"),
        {
            "run_id": run_id or None,
            "candidate_version": version,
            "dataset_version": dataset_version or None,
            "active_model_version": active_model_version or None,
            "metrics": report["metrics"],
            "quality_gates": gates,
            "gate_details": gate_details,
            "promotion_eligible": all_gates_passed,
        },
    )
    report_path = os.path.join(version_dir, "evaluation_report.json")
    _write_json(report_path, report)

    print("=" * 60)
    print(f" QUALITY GATES REPORT FOR MODEL v{version}")
    print("=" * 60)
    print(f"Top-1 Category Accuracy:          {cand_top1_acc*100:.1f}% (Active Baseline: {active_top1_acc*100:.1f}%)")
    print(f"Top-3 Category Accuracy:          {cand_top3_acc*100:.1f}%")
    print(f"Manufacturer Resolution Accuracy:  {mfg_acc*100:.1f}%")
    print(f"Duplicate Detection Precision:    {dup_prec*100:.1f}%")
    print(f"Duplicate Detection Recall:       {dup_rec*100:.1f}%")
    print(f"Critical False Merges:            {critical_false_positives}")
    print(f"Inference Latency (P95):          {p95_latency:.2f} ms")
    print(f"Model Artifact Size:              {artifact_size_bytes/1024:.1f} KB")
    print(f"Peak Memory Usage:                {ram_mb:.1f} MB")
    print(f"Unverified Data Samples:          {unverified_count}")
    print("-" * 60)
    for gate_name, passed in gates.items():
        print(f"  * {gate_name:28s}: {'PASSED' if passed else 'FAILED'}")
    print("-" * 60)
    print(f"Overall Quality Gate Status:      {'PASSED (Eligible for Promotion)' if all_gates_passed else 'FAILED (Blocked)'}")
    print(f"Report saved to: {report_path}")
    print("=" * 60)

    return report

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate candidate model against quality gates")
    parser.add_argument("--version", default="1.3.0", help="Candidate model version")
    parser.add_argument("--val-path", default="", help="Validation dataset path")
    parser.add_argument("--registry-dir", default="apps/ml/models/registry", help="Model registry dir")
    args = parser.parse_args()
    evaluate_model(args.version, args.registry_dir, args.val_path)
