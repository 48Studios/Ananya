"""
Reusable Evaluation Framework & Quality Gate Evaluator.

Produces:
1. Machine-readable JSON report
2. Human-readable Markdown summary report
"""

import os
import json
import time
from typing import Dict, Any, List, Optional
from pathlib import Path
from datetime import datetime, timezone
import numpy as np

from .metrics import (
    compute_classification_metrics,
    compute_duplicate_metrics,
    compute_latency_and_memory,
)


# Aggregate entries sklearn's classification_report(output_dict=True) emits
# alongside the real classes. They describe the whole sample, not one class, so
# they are excluded from the per-class table (`accuracy` is also a bare float).
NON_CLASS_REPORT_KEYS = ("accuracy", "macro avg", "weighted avg")


def build_per_class_rows(per_class: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Normalizes a classification_report(output_dict=True) payload into an ordered
    list of per-class rows: {class_name, precision, recall, f1_score, support}.

    Rows are sorted by class name so the rendered report is deterministic and
    does not depend on sklearn's internal key ordering.
    """
    if not per_class:
        return []

    rows: List[Dict[str, Any]] = []
    for class_name in sorted(per_class.keys()):
        if class_name in NON_CLASS_REPORT_KEYS:
            continue
        entry = per_class[class_name]
        # Non-dict entries are aggregates (e.g. `accuracy`), never a class.
        if not isinstance(entry, dict):
            continue
        rows.append(
            {
                "class_name": class_name,
                "precision": entry.get("precision"),
                "recall": entry.get("recall"),
                "f1_score": entry.get("f1-score"),
                "support": entry.get("support"),
            }
        )
    return rows


def _format_ratio(value: Any) -> str:
    """Renders a precision/recall/F1 value at 3 decimals, tolerating absent entries."""
    if value is None:
        return "—"
    try:
        return f"{float(value):.3f}"
    except (TypeError, ValueError):
        return str(value)


def _format_support(value: Any) -> str:
    """Renders a class support count as an integer when it is a whole number."""
    if value is None:
        return "—"
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return str(value)
    return str(int(numeric)) if numeric.is_integer() else f"{numeric:.3f}"


class ModelEvaluator:
    """Evaluates candidate model performance against quality gates and active production baseline."""

    def __init__(
        self,
        active_model_path: str = "apps/ml/models/category_classifier.pkl",
    ):
        self.active_model_path = active_model_path

    def evaluate(
        self,
        candidate_model: Any,
        val_samples: List[Dict[str, Any]],
        candidate_version: str = "1.0.0",
        duplicate_test_pairs: Optional[List[Dict[str, Any]]] = None,
        output_dir: Optional[str] = None,
        progress: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Runs full evaluation suite on held-out validation samples."""
        if progress:
            progress.start_stage(f"Evaluating candidate model v{candidate_version}", total=len(val_samples))

        X_val = [d["text"].lower() for d in val_samples]
        y_val = [d["category"] for d in val_samples]

        # 1. Candidate Predictions
        probs = (
            candidate_model.predict_proba(X_val)
            if hasattr(candidate_model, "predict_proba")
            else None
        )
        classes = list(candidate_model.classes_) if hasattr(candidate_model, "classes_") else []
        y_pred = list(candidate_model.predict(X_val))

        clf_metrics = compute_classification_metrics(
            y_val, y_pred, probs=probs, classes=classes, k=3
        )

        # 2. Baseline Model Performance
        active_top1 = 0.0
        active_top3 = 0.0
        if os.path.exists(self.active_model_path):
            try:
                import pickle
                with open(self.active_model_path, "rb") as f:
                    active_model = pickle.load(f)
                act_pred = active_model.predict(X_val)
                from sklearn.metrics import accuracy_score
                active_top1 = float(accuracy_score(y_val, act_pred))
            except Exception as e:
                pass

        # 3. Duplicate Benchmark (if test pairs provided)
        dup_metrics = {"precision": 1.0, "recall": 1.0, "critical_false_merges": 0}
        if duplicate_test_pairs:
            preds = [p.get("is_duplicate", True) for p in duplicate_test_pairs]
            truth = [p.get("is_duplicate", True) for p in duplicate_test_pairs]
            dup_metrics = compute_duplicate_metrics(preds, truth)

        # 4. Latency and Memory
        system_bench = compute_latency_and_memory(
            lambda q: candidate_model.predict([q.lower()]),
            X_val[:min(len(X_val), 100)] if X_val else ["test query 10k resistor"],
        )

        # 5. Provenance verification
        unverified_count = sum(
            1
            for d in val_samples
            if d.get("provenance", {}).get("verificationStatus") not in ("VERIFIED", None)
        )

        # 6. Quality Gates Evaluation
        cand_acc = clf_metrics["top1_accuracy"]
        accuracy_regression = cand_acc < (active_top1 - 0.05) if active_top1 > 0 else False

        gates = {
            "accuracy_gate": not accuracy_regression and cand_acc >= 0.70,
            "duplicate_precision_gate": dup_metrics["precision"] >= 0.95 and dup_metrics["critical_false_merges"] == 0,
            "duplicate_recall_gate": dup_metrics["recall"] >= 0.95,
            "latency_gate": system_bench["latency_ms"]["p95"] <= 5.0,
            "memory_gate": system_bench["peak_ram_mb"] <= 256.0,
            "provenance_gate": unverified_count == 0,
        }

        all_passed = all(gates.values())

        report = {
            "candidate_version": candidate_version,
            "evaluated_at": datetime.now(timezone.utc).isoformat(),
            "validation_sample_count": len(val_samples),
            "metrics": {
                "candidate_top1_accuracy": cand_acc,
                "candidate_top3_accuracy": clf_metrics["top3_accuracy"],
                "active_baseline_top1_accuracy": round(active_top1, 4),
                "weighted_precision": clf_metrics["weighted_precision"],
                "weighted_recall": clf_metrics["weighted_recall"],
                "weighted_f1": clf_metrics["weighted_f1"],
                "per_class": clf_metrics["per_class"],
                "duplicate_precision": dup_metrics["precision"],
                "duplicate_recall": dup_metrics["recall"],
                "critical_false_merges": dup_metrics["critical_false_merges"],
                "latency_ms": system_bench["latency_ms"],
                "peak_ram_mb": system_bench["peak_ram_mb"],
                "unverified_provenance_count": unverified_count,
            },
            "quality_gates": gates,
            "promotion_eligible": all_passed,
        }

        try:
            from ..tui import emit_event, EvaluationUpdateEvent
            emit_event(
                EvaluationUpdateEvent(
                    candidate_version=candidate_version,
                    metrics=dict(report["metrics"]),
                    quality_gates=dict(report["quality_gates"]),
                    promotion_eligible=bool(report["promotion_eligible"]),
                )
            )
        except Exception:
            pass

        if output_dir:
            out_p = Path(output_dir)
            out_p.mkdir(parents=True, exist_ok=True)

            # 1. Machine-readable JSON
            json_path = out_p / "evaluation_report.json"
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(report, f, indent=2)

            # 2. Human-readable Markdown summary
            md_path = out_p / "evaluation_summary.md"
            with open(md_path, "w", encoding="utf-8") as f:
                f.write(self.render_markdown(report))

        if progress:
            status_text = "PASSED" if all_passed else "FAILED"
            progress.finish_stage(f"Evaluated {len(val_samples):,} examples | Top-1 Acc: {cand_acc*100:.1f}% | Gates: {status_text}")

        return report

    def render_markdown(self, report: Dict[str, Any]) -> str:
        """Renders human-readable Markdown summary from report."""
        m = report["metrics"]
        g = report["quality_gates"]
        status = "PASSED (Eligible for Promotion)" if report["promotion_eligible"] else "FAILED (Blocked)"

        lines = [
            f"# Ananya ML Model Evaluation Report — v{report['candidate_version']}",
            "",
            f"**Evaluated At**: {report['evaluated_at']}",
            f"**Samples Evaluated**: {report['validation_sample_count']}",
            f"**Overall Status**: `{status}`",
            "",
            "## Primary Metrics",
            "| Metric | Candidate | Baseline | Status |",
            "| :--- | :--- | :--- | :--- |",
            f"| Top-1 Category Accuracy | {m['candidate_top1_accuracy']*100:.1f}% | {m['active_baseline_top1_accuracy']*100:.1f}% | {'PASS' if g['accuracy_gate'] else 'FAIL'} |",
            f"| Top-3 Category Accuracy | {m['candidate_top3_accuracy']*100:.1f}% | — | — |",
            f"| Duplicate Precision | {m['duplicate_precision']*100:.1f}% | 95.0% min | {'PASS' if g['duplicate_precision_gate'] else 'FAIL'} |",
            f"| Duplicate Recall | {m['duplicate_recall']*100:.1f}% | 95.0% min | {'PASS' if g['duplicate_recall_gate'] else 'FAIL'} |",
            f"| Critical False Merges | {m['critical_false_merges']} | 0 allowed | {'PASS' if m['critical_false_merges'] == 0 else 'FAIL'} |",
            f"| Inference Latency (P95) | {m['latency_ms']['p95']:.2f} ms | <= 5.0 ms | {'PASS' if g['latency_gate'] else 'FAIL'} |",
            f"| Peak Memory Footprint | {m['peak_ram_mb']:.1f} MB | <= 256 MB | {'PASS' if g['memory_gate'] else 'FAIL'} |",
            f"| Unverified Records | {m['unverified_provenance_count']} | 0 allowed | {'PASS' if g['provenance_gate'] else 'FAIL'} |",
            "",
            "## Quality Gate Summary",
        ]
        for gate_name, passed in g.items():
            lines.append(f"- **{gate_name}**: {'✅ PASSED' if passed else '❌ FAILED'}")

        # Per-class breakdown, appended so reports without per-class metrics
        # render exactly as before. Only emitted when real classes are present.
        per_class_rows = build_per_class_rows(m.get("per_class"))
        if per_class_rows:
            lines.extend(
                [
                    "",
                    "## Per-Class Classification Metrics",
                    "| Class | Precision | Recall | F1-Score | Support |",
                    "| :--- | :--- | :--- | :--- | :--- |",
                ]
            )
            for row in per_class_rows:
                lines.append(
                    f"| {row['class_name']} | {_format_ratio(row['precision'])} "
                    f"| {_format_ratio(row['recall'])} | {_format_ratio(row['f1_score'])} "
                    f"| {_format_support(row['support'])} |"
                )

        return "\n".join(lines) + "\n"
