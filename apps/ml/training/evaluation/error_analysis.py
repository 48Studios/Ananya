"""
Category Classifier Error Analysis.

Evidence-first error analysis for the category classifier improvement program
(v1.8.0). Loads an immutable model artifact (by default the v1.7.0 production
baseline from the registry), runs it against the FROZEN held-out test set of a
dataset snapshot, and writes a complete, reproducible inventory of its mistakes:

1. Per-category support / precision / recall / F1 / top-1 / top-3 accuracy,
   ranked by actual weakness (lowest F1 first), with false-positive and
   false-negative counts.
2. The full confusion matrix over the model's classes.
3. Directed and symmetric confusion pairs, ranked by observed error count.
4. Representative misclassified examples for every confusion pair (input,
   expected, predicted, top-k predictions with probabilities, confidence).
5. Special cases: top-1 wrong but recovered in top-3, high-confidence errors,
   low-confidence correct predictions, and hard misses outside the top-k.
6. Confidence reliability evidence (correct vs wrong confidence, binned
   accuracy vs confidence) feeding the later calibration phase.
7. Error breakdown by provenance source / source type / base family, so error
   counts can be traced back to the products and crawl sources that produced
   them.

The analysis is strictly read-only: it never writes to the model registry, the
dataset snapshot, or the production artifact, and it does not retrain anything.
It produces two self-describing artifacts (defaults shown for the v1.8.0
program baseline):

  apps/ml/training/evaluation/v1.8.0-error-analysis.json  (machine-readable)
  apps/ml/training/evaluation/v1.8.0-error-analysis.md    (human-readable)

Conventions mirrored from the existing evaluation pipeline
(``pipeline/evaluate.py`` / ``training/evaluation/metrics.py``) so the numbers
below are directly comparable with the published v1.7.0 report:

- Input text is lowercased before prediction (same as training and evaluation).
- Top-1 is the argmax of ``predict_proba``; top-k membership decides top-k
  accuracy.
- Ranking ties are broken deterministically by class name.

Usage (from repository root):

  apps/ml/.venv/bin/python -m apps.ml.training.evaluation.error_analysis

Depends only on the standard library, numpy and scikit-learn, like the rest of
the evaluation package.
"""

import argparse
import hashlib
import json
import os
import pickle
import platform
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import sklearn
from sklearn.metrics import f1_score

# Immutable v1.8.0-program baseline: the deployed v1.7.0 registry artifact and
# the frozen test split of the dataset snapshot it was evaluated on.
DEFAULT_MODEL_PATH = "apps/ml/models/registry/v1.7.0/category_classifier.pkl"
DEFAULT_TEST_PATH = (
    "apps/ml/training/datasets/training/"
    "dataset-crawl-1790343594-reprocessed/test.json"
)
DEFAULT_PUBLISHED_PATH = "apps/ml/models/registry/v1.7.0/evaluation_report.json"
DEFAULT_OUTPUT_JSON = "apps/ml/training/evaluation/v1.8.0-error-analysis.json"
DEFAULT_OUTPUT_MD = "apps/ml/training/evaluation/v1.8.0-error-analysis.md"

TOP_K = 3
LOW_SUPPORT_THRESHOLD = 10
HIGH_CONFIDENCE_THRESHOLD = 0.90
LOW_CONFIDENCE_THRESHOLD = 0.60
MIN_PAIR_COUNT_FOR_MD_SECTION = 3
MAX_EXAMPLES = 15
# Reliability bins for the confidence-vs-accuracy evidence table.
CONFIDENCE_BINS: List[Tuple[float, float]] = [
    (0.0, 0.3),
    (0.3, 0.5),
    (0.5, 0.6),
    (0.6, 0.7),
    (0.7, 0.8),
    (0.8, 0.9),
    (0.9, 1.0),
]


def sha256_file(path: str) -> Optional[str]:
    try:
        digest = hashlib.sha256()
        with open(path, "rb") as handle:
            for chunk in iter(lambda: handle.read(1 << 20), b""):
                digest.update(chunk)
        return digest.hexdigest()
    except OSError:
        return None


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def load_model(model_path: str) -> Any:
    with open(model_path, "rb") as handle:
        return pickle.load(handle)


def _rank_row(row: Any, classes: List[str]) -> List[int]:
    """Deterministic class ranking: probability desc, then class name asc."""
    return sorted(range(len(classes)), key=lambda j: (-row[j], classes[j]))


def _example(record: Dict[str, Any], sample: Dict[str, Any]) -> Dict[str, Any]:
    """Full-detail misclassification example, traceable to its test record."""
    provenance = sample.get("provenance") or {}
    top = record["top"]
    return {
        "test_index": record["index"],
        "input": record["text"],
        "expected": record["expected"],
        "predicted": record["predicted"],
        "confidence": round(record["confidence"], 6),
        "top3": [
            {"category": category, "probability": round(probability, 6)}
            for category, probability in top
        ],
        "true_probability": round(record["true_prob"], 6),
        "true_rank": record["true_rank"],
        "margin": round(record["confidence"] - record["true_prob"], 6),
        "base_family": sample.get("base_family"),
        "source": provenance.get("source"),
        "source_type": provenance.get("source_type"),
        "verification_method": provenance.get("verification_method"),
    }


def predict_records(
    model: Any, samples: List[Dict[str, Any]], top_k: int = TOP_K
) -> List[Dict[str, Any]]:
    """Runs the model over every sample once; returns per-record predictions."""
    classes = list(model.classes_)
    class_index = {name: position for position, name in enumerate(classes)}
    texts = [sample["text"].lower() for sample in samples]
    probabilities = model.predict_proba(texts)

    records: List[Dict[str, Any]] = []
    for position, sample in enumerate(samples):
        row = probabilities[position]
        order = _rank_row(row, classes)
        top = [(classes[j], float(row[j])) for j in order[:top_k]]
        expected = sample["category"]
        if expected in class_index:
            true_prob = float(row[class_index[expected]])
            true_rank = order.index(class_index[expected]) + 1
        else:
            # Category exists in the test set but not in the model's classes:
            # the model can never predict it. Recorded honestly.
            true_prob = 0.0
            true_rank = None
        predicted = top[0][0]
        records.append(
            {
                "index": position,
                "text": sample["text"],
                "expected": expected,
                "predicted": predicted,
                "confidence": top[0][1],
                "top": top,
                "true_prob": true_prob,
                "true_rank": true_rank,
                "correct_top1": predicted == expected,
                "correct_topk": true_rank is not None and true_rank <= top_k,
            }
        )
    return records


def _measure_latency(model: Any, texts: List[str]) -> Dict[str, float]:
    """Per-item predict_proba latency, mirroring ``pipeline/evaluate.py``."""
    latencies = []
    for text in texts:
        start = time.perf_counter()
        model.predict_proba([text])
        latencies.append((time.perf_counter() - start) * 1000.0)
    return {
        "p50": round(float(np.percentile(latencies, 50)), 3),
        "p95": round(float(np.percentile(latencies, 95)), 3),
        "p99": round(float(np.percentile(latencies, 99)), 3),
    }


def _headline_metrics(
    records: List[Dict[str, Any]],
) -> Dict[str, Any]:
    y_true = [record["expected"] for record in records]
    y_pred = [record["predicted"] for record in records]
    top1_correct = sum(1 for record in records if record["correct_top1"])
    topk_correct = sum(1 for record in records if record["correct_topk"])
    total = max(1, len(records))
    return {
        "sample_count": len(records),
        "top1_accuracy": round(top1_correct / total, 4),
        "top3_accuracy": round(topk_correct / total, 4),
        "macro_f1": round(
            float(f1_score(y_true, y_pred, average="macro", zero_division=0)), 4
        ),
        "weighted_f1": round(
            float(f1_score(y_true, y_pred, average="weighted", zero_division=0)), 4
        ),
        "top1_errors": total - top1_correct,
        "top3_hard_misses": total - topk_correct,
    }


def _reproduction_check(
    measured: Dict[str, Any], published_path: str
) -> Dict[str, Any]:
    """Compares measured metrics against a registry evaluation report."""
    check: Dict[str, Any] = {
        "published_report_path": published_path,
        "published_metrics": None,
        "matches_published": None,
        "field_matches": {},
    }
    if not (published_path and os.path.exists(published_path)):
        return check
    published = load_json(published_path)
    per_class = (published.get("metrics") or {}).get("per_class") or {}
    expected = {
        "top1_accuracy": (published.get("metrics") or {}).get(
            "candidate_top1_accuracy"
        ),
        "top3_accuracy": (published.get("metrics") or {}).get(
            "candidate_top3_accuracy"
        ),
        "macro_f1": (per_class.get("macro avg") or {}).get("f1-score"),
        "weighted_f1": (per_class.get("weighted avg") or {}).get("f1-score"),
    }
    expected = {key: value for key, value in expected.items() if value is not None}
    check["published_metrics"] = expected
    if not expected:
        return check
    field_matches = {
        key: measured[key] == round(float(value), 4)
        for key, value in expected.items()
    }
    check["field_matches"] = field_matches
    check["matches_published"] = all(field_matches.values())
    return check


def _build_confusion(
    records: List[Dict[str, Any]], model_classes: List[str]
) -> Dict[str, Any]:
    """Confusion matrix over model classes plus any test-only categories."""
    extra_labels = sorted(
        {record["expected"] for record in records} - set(model_classes)
    )
    labels = list(model_classes) + extra_labels
    label_index = {name: position for position, name in enumerate(labels)}
    matrix = [[0] * len(labels) for _ in labels]
    for record in records:
        row = label_index[record["expected"]]
        column = label_index[record["predicted"]]
        matrix[row][column] += 1
    return {"labels": labels, "matrix": matrix}


def _per_category(
    records: List[Dict[str, Any]], confusion: Dict[str, Any]
) -> Dict[str, Any]:
    """Per-category metrics ranked by weakness (lowest F1 first)."""
    labels = confusion["labels"]
    matrix = confusion["matrix"]
    model_classes = set(_model_classes_from_labels(labels, records))

    topk_by_category: Dict[str, int] = defaultdict(int)
    for record in records:
        if record["correct_topk"]:
            topk_by_category[record["expected"]] += 1

    rows: List[Dict[str, Any]] = []
    for position, label in enumerate(labels):
        support = sum(matrix[position])
        true_positive = matrix[position][position]
        false_positive = sum(matrix[row][position] for row in range(len(labels))) - true_positive
        false_negative = support - true_positive
        precision = true_positive / (true_positive + false_positive) if (true_positive + false_positive) else 0.0
        recall = true_positive / support if support else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
        topk_correct = topk_by_category.get(label, 0)
        rows.append(
            {
                "category": label,
                "support": support,
                "true_positive": true_positive,
                "false_positive": false_positive,
                "false_negative": false_negative,
                "precision": round(precision, 4),
                "recall": round(recall, 4),
                "f1": round(f1, 4),
                # For single-label classification the per-category top-1
                # accuracy IS the recall; kept as an explicit field because the
                # improvement program tracks both names.
                "top1_accuracy": round(recall, 4),
                "top3_accuracy": round(topk_correct / support, 4) if support else 0.0,
                "top3_recovered": topk_correct - true_positive if support else 0,
                "hard_misses": support - topk_correct if support else 0,
                "in_model_classes": label in model_classes,
                "low_support": 0 < support < LOW_SUPPORT_THRESHOLD,
            }
        )

    tested = [row for row in rows if row["support"] > 0]
    untested = [row for row in rows if row["support"] == 0]
    tested.sort(key=lambda row: (row["f1"], -row["false_negative"], row["support"]))
    untested.sort(key=lambda row: row["category"])
    return {"ranked_by_weakness": tested, "not_in_test_set": untested}


def _model_classes_from_labels(
    labels: List[str], records: List[Dict[str, Any]]
) -> List[str]:
    """Model classes are every label the model actually predicted, plus the
    classes it was trained on. Predictions only cover trained classes, and any
    test-only label sits at the tail of ``labels`` (see ``_build_confusion``)."""
    del records  # labels already carry the ordering contract
    return labels


def _confusion_pairs(
    records: List[Dict[str, Any]], samples: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Directed and symmetric confusion pairs with full example lists."""
    errors = [record for record in records if not record["correct_top1"]]
    directed_counts: Counter = Counter(
        (record["expected"], record["predicted"]) for record in errors
    )

    directed: List[Dict[str, Any]] = []
    for (expected, predicted), count in sorted(
        directed_counts.items(), key=lambda item: (-item[1], item[0])
    ):
        pair_errors = [
            record
            for record in errors
            if record["expected"] == expected and record["predicted"] == predicted
        ]
        pair_errors.sort(key=lambda record: -record["confidence"])
        directed.append(
            {
                "true": expected,
                "predicted": predicted,
                "count": count,
                "share_of_errors": round(count / max(1, len(errors)), 4),
                "examples": [
                    _example(record, samples[record["index"]])
                    for record in pair_errors[:MAX_EXAMPLES]
                ],
                "total_examples_available": len(pair_errors),
            }
        )

    symmetric_counts: Counter = Counter()
    for (expected, predicted), count in directed_counts.items():
        key = tuple(sorted((expected, predicted)))
        symmetric_counts[key] += count
    symmetric = [
        {"pair": list(key), "count": count}
        for key, count in sorted(
            symmetric_counts.items(), key=lambda item: (-item[1], item[0])
        )
    ]
    return {
        "total_errors": len(errors),
        "directed": directed,
        "symmetric": symmetric,
    }


def _special_cases(
    records: List[Dict[str, Any]], samples: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """The four case families the improvement program explicitly tracks."""

    def build(case_records: List[Dict[str, Any]], sort_key) -> Dict[str, Any]:
        case_records = sorted(case_records, key=sort_key)
        return {
            "count": len(case_records),
            "examples": [
                _example(record, samples[record["index"]])
                for record in case_records[:MAX_EXAMPLES]
            ],
            "total_examples_available": len(case_records),
        }

    wrong = [record for record in records if not record["correct_top1"]]
    return {
        "top1_wrong_but_top3_correct": build(
            [record for record in wrong if record["correct_topk"]],
            lambda record: -(record["confidence"] - record["true_prob"]),
        ),
        "high_confidence_wrong": {
            **build(
                [record for record in wrong if record["confidence"] >= HIGH_CONFIDENCE_THRESHOLD],
                lambda record: -record["confidence"],
            ),
            "threshold": HIGH_CONFIDENCE_THRESHOLD,
        },
        "low_confidence_correct": {
            **build(
                [
                    record
                    for record in records
                    if record["correct_top1"]
                    and record["confidence"] < LOW_CONFIDENCE_THRESHOLD
                ],
                lambda record: record["confidence"],
            ),
            "threshold": LOW_CONFIDENCE_THRESHOLD,
        },
        "hard_misses_not_in_top3": build(
            [record for record in wrong if not record["correct_topk"]],
            lambda record: -record["confidence"],
        ),
    }


def _confidence_analysis(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Confidence reliability evidence for the later calibration phase."""
    correct = [record["confidence"] for record in records if record["correct_top1"]]
    wrong = [record["confidence"] for record in records if not record["correct_top1"]]

    bins: List[Dict[str, Any]] = []
    for low, high in CONFIDENCE_BINS:
        in_bin = [
            record
            for record in records
            if low <= record["confidence"] < high or (high == 1.0 and record["confidence"] == 1.0)
        ]
        if not in_bin:
            continue
        accuracy = sum(1 for record in in_bin if record["correct_top1"]) / len(in_bin)
        bins.append(
            {
                "range": f"[{low:.1f}, {high:.1f}]",
                "count": len(in_bin),
                "mean_confidence": round(
                    sum(record["confidence"] for record in in_bin) / len(in_bin), 4
                ),
                "accuracy": round(accuracy, 4),
                "gap_accuracy_minus_confidence": round(accuracy - sum(record["confidence"] for record in in_bin) / len(in_bin), 4),
            }
        )

    return {
        "correct_predictions": {
            "count": len(correct),
            "mean_confidence": round(float(np.mean(correct)), 4) if correct else None,
            "median_confidence": round(float(np.median(correct)), 4) if correct else None,
        },
        "wrong_predictions": {
            "count": len(wrong),
            "mean_confidence": round(float(np.mean(wrong)), 4) if wrong else None,
            "median_confidence": round(float(np.median(wrong)), 4) if wrong else None,
        },
        "wrong_with_confidence_ge_090": sum(1 for value in wrong if value >= 0.90),
        "correct_with_confidence_lt_060": sum(1 for value in correct if value < 0.60),
        "reliability_bins": bins,
    }


def _error_breakdowns(
    records: List[Dict[str, Any]], samples: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Errors traced to provenance source, source type and base family."""
    errors = [record for record in records if not record["correct_top1"]]

    def grouping(key_function) -> List[Dict[str, Any]]:
        totals: Counter = Counter()
        error_by_key: Dict[Any, List[Dict[str, Any]]] = defaultdict(list)
        for record in records:
            key = key_function(record, samples[record["index"]])
            totals[key] += 1
            if not record["correct_top1"]:
                error_by_key[key].append(record)
        rows = []
        for key in sorted(totals, key=lambda k: (-len(error_by_key.get(k, [])), str(k))):
            key_errors = error_by_key.get(key, [])
            directions = Counter(
                (record["expected"], record["predicted"]) for record in key_errors
            )
            rows.append(
                {
                    "key": key,
                    "total": totals[key],
                    "errors": len(key_errors),
                    "error_rate": round(len(key_errors) / totals[key], 4),
                    "top_confusions": [
                        {"true": expected, "predicted": predicted, "count": count}
                        for (expected, predicted), count in directions.most_common(3)
                    ],
                }
            )
        return rows

    by_base_family_rows = []
    family_errors: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    family_category: Dict[str, str] = {}
    for record in errors:
        family = samples[record["index"]].get("base_family")
        family_errors[family].append(record)
        family_category[family] = record["expected"]
    for family, family_records in sorted(
        family_errors.items(), key=lambda item: (-len(item[1]), str(item[0]))
    ):
        if len(family_records) < 2:
            continue
        by_base_family_rows.append(
            {
                "base_family": family,
                "category": family_category[family],
                "errors": len(family_records),
                "predicted_categories": dict(
                    Counter(record["predicted"] for record in family_records)
                ),
            }
        )

    return {
        "by_source_type": grouping(
            lambda record, sample: (sample.get("provenance") or {}).get("source_type")
        ),
        "by_source": grouping(
            lambda record, sample: (sample.get("provenance") or {}).get("source")
        ),
        "multi_error_base_families": by_base_family_rows,
        "distinct_error_families": len(family_errors),
    }


def _key_observations(report: Dict[str, Any]) -> List[str]:
    """Computed, factual headlines derived from the measured sections above."""
    observations: List[str] = []
    metrics = report["headline_metrics"]
    reproduction = report["reproduction_check"]
    if reproduction.get("matches_published") is True:
        observations.append(
            f"Reproduction check: measured metrics match the published "
            f"{report['published_baseline_version']} registry report exactly "
            f"(Top-1 {metrics['top1_accuracy']:.4f}, Top-3 {metrics['top3_accuracy']:.4f}, "
            f"Macro F1 {metrics['macro_f1']:.4f}, Weighted F1 {metrics['weighted_f1']:.4f}); "
            f"the frozen test set and evaluation conventions are confirmed."
        )

    weakest = report["per_category"]["ranked_by_weakness"][:5]
    weakest_text = ", ".join(
        f"{row['category']} (F1 {row['f1']:.3f}, n={row['support']})" for row in weakest
    )
    observations.append(f"Weakest categories by F1: {weakest_text}.")

    pairs = report["confusion_pairs"]["directed"]
    if pairs:
        top_pair = pairs[0]
        observations.append(
            f"Largest directed confusion: {top_pair['true']} -> "
            f"{top_pair['predicted']} with {top_pair['count']} errors "
            f"({top_pair['share_of_errors'] * 100:.1f}% of all errors)."
        )
    predicted_sink: Counter = Counter()
    for pair in pairs:
        predicted_sink[pair["predicted"]] += pair["count"]
    if predicted_sink:
        sink, sink_count = predicted_sink.most_common(1)[0]
        observations.append(
            f"'{sink}' is the most common wrong prediction, absorbing "
            f"{sink_count} of {report['confusion_pairs']['total_errors']} errors "
            f"({sink_count / max(1, report['confusion_pairs']['total_errors']) * 100:.1f}%)."
        )

    special = report["special_cases"]
    observations.append(
        f"{special['top1_wrong_but_top3_correct']['count']} of "
        f"{report['confusion_pairs']['total_errors']} top-1 errors are recovered in the "
        f"top-3 ({special['top1_wrong_but_top3_correct']['count'] / max(1, report['confusion_pairs']['total_errors']) * 100:.1f}%); "
        f"{special['hard_misses_not_in_top3']['count']} errors are hard misses outside the top-3."
    )

    confidence = report["confidence_analysis"]
    observations.append(
        f"{confidence['wrong_with_confidence_ge_090']} wrong predictions carry >= 0.90 "
        f"confidence; {confidence['correct_with_confidence_lt_060']} correct predictions "
        f"carry < 0.60 confidence."
    )

    untested = report["per_category"]["not_in_test_set"]
    if untested:
        observations.append(
            "Model classes with ZERO support in the frozen test set (performance unknown): "
            + ", ".join(row["category"] for row in untested)
            + "."
        )
    low_support = [
        row for row in report["per_category"]["ranked_by_weakness"] if row["low_support"]
    ]
    if low_support:
        observations.append(
            "Low-support categories (support < "
            f"{LOW_SUPPORT_THRESHOLD}, metrics statistically fragile): "
            + ", ".join(f"{row['category']} (n={row['support']})" for row in low_support)
            + "."
        )

    families = report["error_breakdowns"]["multi_error_base_families"]
    if families:
        repeated = sum(row["errors"] for row in families)
        observations.append(
            f"{repeated} of {report['confusion_pairs']['total_errors']} errors come from just "
            f"{len(families)} base families with repeat errors "
            f"({report['error_breakdowns']['distinct_error_families']} distinct families fail in total); "
            f"error counts overstate distinct-product failures."
        )
    return observations


def build_analysis(
    model_path: str,
    test_path: str,
    published_path: str = DEFAULT_PUBLISHED_PATH,
    top_k: int = TOP_K,
) -> Dict[str, Any]:
    """Runs the full read-only error analysis and returns the report dict."""
    model = load_model(model_path)
    samples = load_json(test_path)
    classes = list(model.classes_)
    texts = [sample["text"].lower() for sample in samples]

    records = predict_records(model, samples, top_k=top_k)
    headline = _headline_metrics(records)
    confusion = _build_confusion(records, classes)

    report: Dict[str, Any] = {
        "analysis": {
            "name": "v1.8.0-category-classifier-error-analysis",
            "phase": "phase-1-error-analysis",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "read_only": True,
        },
        "model": {
            "path": model_path,
            "sha256": sha256_file(model_path),
            "size_bytes": os.path.getsize(model_path),
            "class_count": len(classes),
            "classes": classes,
        },
        "dataset": {
            "path": test_path,
            "sha256": sha256_file(test_path),
            "sample_count": len(samples),
            "frozen_test_set": True,
        },
        "environment": {
            "python": sys.version.split()[0],
            "platform": platform.platform(),
            "scikit_learn": sklearn.__version__,
            "numpy": np.__version__,
        },
        "conventions": {
            "text_preprocessing": "lowercase (mirrors training and pipeline/evaluate.py)",
            "ranking": "predict_proba descending, ties broken by class name ascending",
            "top_k": top_k,
        },
        "published_baseline_version": "v1.7.0",
        "headline_metrics": headline,
        "reproduction_check": _reproduction_check(headline, published_path),
        "latency_remeasured_ms": _measure_latency(model, texts),
        "confusion_matrix": confusion,
        "per_category": _per_category(records, confusion),
        "confusion_pairs": _confusion_pairs(records, samples),
        "special_cases": _special_cases(records, samples),
        "confidence_analysis": _confidence_analysis(records),
        "error_breakdowns": _error_breakdowns(records, samples),
    }
    report["key_observations"] = _key_observations(report)
    return report


# ---------------------------------------------------------------------------
# Markdown rendering
# ---------------------------------------------------------------------------


def _fmt_pct(value: Optional[float]) -> str:
    return "—" if value is None else f"{value * 100:.2f}%"


def _fmt_ratio(value: Optional[float]) -> str:
    return "—" if value is None else f"{value:.4f}"


def _render_example(example: Dict[str, Any]) -> str:
    top3 = "  ".join(
        f"{position}. {entry['category']} ({entry['probability']:.4f})"
        for position, entry in enumerate(example["top3"], start=1)
    )
    return "\n".join(
        [
            "```text",
            f"Input:       {example['input']}",
            f"Expected:    {example['expected']}",
            f"Predicted:   {example['predicted']}",
            f"Top-3:       {top3}",
            f"Confidence:  {example['confidence']:.4f}",
            f"Source:      {example['source']} ({example['source_type']}) "
            f"| base_family={example['base_family']} "
            f"| true_rank={example['true_rank']} "
            f"| test_index={example['test_index']}",
            "```",
        ]
    )


def _render_confusion_matrix(confusion: Dict[str, Any]) -> str:
    labels = confusion["labels"]
    matrix = confusion["matrix"]
    lines = ["```text", "Rows = true category, columns = predicted category."]
    header = " " * 26 + " ".join(f"{position + 1:02d}" for position in range(len(labels)))
    lines.append(header)
    for row_position, label in enumerate(labels):
        cells = []
        for column_position in range(len(labels)):
            value = matrix[row_position][column_position]
            if row_position == column_position:
                cells.append(f"{value:2d}*")
            elif value == 0:
                cells.append("  .")
            else:
                cells.append(f"{value:3d}")
        lines.append(f"{row_position + 1:02d} {label[:23]:<23} " + " ".join(cells))
    lines.append("```")
    lines.append("")
    lines.append("Legend (row/column number -> category):")
    lines.append("")
    lines.append("| # | Category |")
    lines.append("| :--- | :--- |")
    for position, label in enumerate(labels):
        lines.append(f"| {position + 1:02d} | {label} |")
    lines.append("")
    lines.append(
        "`*` marks the diagonal (correct predictions); `.` marks zero. "
        "The exact integer matrix is in the JSON artifact."
    )
    return "\n".join(lines)


def render_markdown(report: Dict[str, Any]) -> str:
    """Renders the human-readable error-analysis report."""
    metrics = report["headline_metrics"]
    reproduction = report["reproduction_check"]
    lines: List[str] = [
        "# v1.8.0 Improvement Program — Phase 1 Error Analysis",
        "",
        f"**Generated at**: {report['analysis']['generated_at']}  ",
        f"**Baseline model under analysis**: `{report['model']['path']}` "
        f"(sha256 `{report['model']['sha256'][:16]}…`, "
        f"{report['model']['size_bytes'] / (1024 * 1024):.1f} MB)  ",
        f"**Frozen test set**: `{report['dataset']['path']}` "
        f"(sha256 `{report['dataset']['sha256'][:16]}…`, "
        f"{report['dataset']['sample_count']} records, never modified)  ",
        f"**Environment**: Python {report['environment']['python']}, "
        f"scikit-learn {report['environment']['scikit_learn']}, "
        f"numpy {report['environment']['numpy']}, "
        f"{report['environment']['platform']}",
        "",
        "This report is a **read-only measurement** of the current production "
        "baseline. No model, dataset, or training code was changed to produce it.",
        "",
        "## 1. Reproduction check",
        "",
        "The baseline was re-run against the frozen test set with the same "
        "conventions as the published evaluation (lowercased input, "
        "`predict_proba` ranking, top-3 membership):",
        "",
        "| Metric | Measured | Published v1.7.0 | Match |",
        "| :--- | :--- | :--- | :--- |",
    ]
    published = reproduction.get("published_metrics") or {}
    for key, label in (
        ("top1_accuracy", "Top-1 Accuracy"),
        ("top3_accuracy", "Top-3 Accuracy"),
        ("macro_f1", "Macro F1"),
        ("weighted_f1", "Weighted F1"),
    ):
        measured_value = metrics[key]
        published_value = published.get(key)
        match = reproduction.get("field_matches", {}).get(key)
        match_text = "—" if match is None else ("**yes**" if match else "**NO**")
        lines.append(
            f"| {label} | {measured_value:.4f} | "
            + (f"{published_value:.4f}" if published_value is not None else "—")
            + f" | {match_text} |"
        )
    lines += [
        "",
        f"Top-1 errors: **{metrics['top1_errors']}** of {metrics['sample_count']} "
        f"records; hard misses outside the top-3: **{metrics['top3_hard_misses']}**.",
        "",
        f"Latency re-measured on this machine (per-item `predict_proba`, not "
        f"comparable across hardware): p50 {report['latency_remeasured_ms']['p50']:.3f} ms, "
        f"p95 {report['latency_remeasured_ms']['p95']:.3f} ms, "
        f"p99 {report['latency_remeasured_ms']['p99']:.3f} ms.",
        "",
        "## 2. Per-category results, ranked by weakness",
        "",
        "Ranked by F1 ascending (weakest first). `Top-1` equals recall for "
        "single-label classification and is shown for program tracking. "
        "`Low support` flags categories with fewer than "
        f"{LOW_SUPPORT_THRESHOLD} test records — their metrics are statistically "
        "fragile and must not be read as precise.",
        "",
        "| Rank | Category | Support | Precision | Recall | F1 | Top-1 | Top-3 | FP | FN | Hard misses | Flags |",
        "| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |",
    ]
    for rank, row in enumerate(report["per_category"]["ranked_by_weakness"], start=1):
        flags = []
        if row["low_support"]:
            flags.append("LOW SUPPORT")
        lines.append(
            f"| {rank} | {row['category']} | {row['support']} | "
            f"{_fmt_ratio(row['precision'])} | {_fmt_ratio(row['recall'])} | "
            f"{_fmt_ratio(row['f1'])} | {_fmt_pct(row['top1_accuracy'])} | "
            f"{_fmt_pct(row['top3_accuracy'])} | {row['false_positive']} | "
            f"{row['false_negative']} | {row['hard_misses']} | "
            f"{', '.join(flags) or '—'} |"
        )

    untested = report["per_category"]["not_in_test_set"]
    lines.append("")
    if untested:
        lines.append("### Categories with zero test support")
        lines.append("")
        lines.append(
            "The following model classes have **no records in the frozen test "
            "set**, so their real-world performance is unknown (any metric would "
            "be meaningless):"
        )
        lines.append("")
        lines.append("| Category | In model classes | Predicted (FP) on test |")
        lines.append("| :--- | :--- | ---: |")
        for row in untested:
            lines.append(
                f"| {row['category']} | {row['in_model_classes']} | "
                f"{row['false_positive']} |"
            )
        lines.append("")

    lines += [
        "## 3. Confusion matrix",
        "",
        _render_confusion_matrix(report["confusion_matrix"]),
        "",
        "## 4. Confusion pairs",
        "",
        "Directed pairs (true -> predicted), ranked by observed error count. "
        "This is the measured ranking, not an assumption.",
        "",
        "| Rank | True category | Predicted as | Errors | Share of all errors |",
        "| :--- | :--- | :--- | ---: | ---: |",
    ]
    for rank, pair in enumerate(report["confusion_pairs"]["directed"], start=1):
        lines.append(
            f"| {rank} | {pair['true']} | {pair['predicted']} | {pair['count']} | "
            f"{pair['share_of_errors'] * 100:.1f}% |"
        )
    lines += [
        "",
        "Symmetric view (A <-> B, both directions combined):",
        "",
        "| Rank | Pair | Combined errors |",
        "| :--- | :--- | ---: |",
    ]
    for rank, pair in enumerate(report["confusion_pairs"]["symmetric"], start=1):
        if pair["count"] < 2:
            continue
        lines.append(f"| {rank} | {pair['pair'][0]} <-> {pair['pair'][1]} | {pair['count']} |")

    lines += ["", "### 4.1 Misclassified examples per significant confusion pair", ""]
    lines.append(
        f"Full example lists for every directed pair with at least "
        f"{MIN_PAIR_COUNT_FOR_MD_SECTION} errors (all available examples shown, "
        f"most confident error first). Pairs with fewer errors are listed in the "
        f"appendix; the JSON artifact carries examples for every pair."
    )
    lines.append("")
    for pair in report["confusion_pairs"]["directed"]:
        if pair["count"] < MIN_PAIR_COUNT_FOR_MD_SECTION:
            continue
        lines.append(
            f"#### {pair['true']} -> {pair['predicted']} "
            f"({pair['count']} errors, {pair['share_of_errors'] * 100:.1f}% of all errors)"
        )
        lines.append("")
        for example in pair["examples"]:
            lines.append(_render_example(example))
            lines.append("")

    special = report["special_cases"]
    lines += [
        "## 5. Special cases",
        "",
        "### 5.1 Top-1 wrong but correct category recovered in top-3",
        "",
        f"**{special['top1_wrong_but_top3_correct']['count']}** records "
        f"({special['top1_wrong_but_top3_correct']['count'] / metrics['sample_count'] * 100:.2f}% "
        f"of the test set). Sorted by decision margin (predicted probability minus "
        f"true-category probability), most decisive near-miss first; up to "
        f"{MAX_EXAMPLES} shown.",
        "",
    ]
    for example in special["top1_wrong_but_top3_correct"]["examples"]:
        lines.append(_render_example(example))
        lines.append("")

    lines += [
        f"### 5.2 High-confidence wrong predictions (confidence >= {HIGH_CONFIDENCE_THRESHOLD:.2f})",
        "",
        f"**{special['high_confidence_wrong']['count']}** records. Most confident "
        f"error first; up to {MAX_EXAMPLES} shown.",
        "",
    ]
    for example in special["high_confidence_wrong"]["examples"]:
        lines.append(_render_example(example))
        lines.append("")

    lines += [
        f"### 5.3 Low-confidence correct predictions (confidence < {LOW_CONFIDENCE_THRESHOLD:.2f})",
        "",
        f"**{special['low_confidence_correct']['count']}** records. Lowest "
        f"confidence first; up to {MAX_EXAMPLES} shown.",
        "",
    ]
    for example in special["low_confidence_correct"]["examples"]:
        lines.append(_render_example(example))
        lines.append("")

    lines += [
        "### 5.4 Hard misses — correct category not even in top-3",
        "",
        f"**{special['hard_misses_not_in_top3']['count']}** records. These are "
        f"unrecoverable by any top-k consumer and are the highest-priority "
        f"evidence for dataset improvement.",
        "",
    ]
    for example in special["hard_misses_not_in_top3"]["examples"]:
        lines.append(_render_example(example))
        lines.append("")

    confidence = report["confidence_analysis"]
    lines += [
        "## 6. Confidence reliability evidence",
        "",
        "| Group | Count | Mean confidence | Median confidence |",
        "| :--- | ---: | ---: | ---: |",
        f"| Correct top-1 | {confidence['correct_predictions']['count']} | "
        f"{_fmt_ratio(confidence['correct_predictions']['mean_confidence'])} | "
        f"{_fmt_ratio(confidence['correct_predictions']['median_confidence'])} |",
        f"| Wrong top-1 | {confidence['wrong_predictions']['count']} | "
        f"{_fmt_ratio(confidence['wrong_predictions']['mean_confidence'])} | "
        f"{_fmt_ratio(confidence['wrong_predictions']['median_confidence'])} |",
        "",
        f"Wrong predictions with >= 0.90 confidence: "
        f"**{confidence['wrong_with_confidence_ge_090']}**. "
        f"Correct predictions with < 0.60 confidence: "
        f"**{confidence['correct_with_confidence_lt_060']}**.",
        "",
        "Reliability table (binned confidence vs actual accuracy) — input "
        "evidence for the calibration phase:",
        "",
        "| Confidence range | Count | Mean confidence | Actual accuracy | Accuracy − confidence |",
        "| :--- | ---: | ---: | ---: | ---: |",
    ]
    for bin_row in confidence["reliability_bins"]:
        lines.append(
            f"| {bin_row['range']} | {bin_row['count']} | "
            f"{_fmt_ratio(bin_row['mean_confidence'])} | "
            f"{_fmt_pct(bin_row['accuracy'])} | "
            f"{bin_row['gap_accuracy_minus_confidence']:+.4f} |"
        )

    breakdowns = report["error_breakdowns"]
    lines += [
        "",
        "## 7. Error breakdown by provenance",
        "",
        "### 7.1 By source type",
        "",
        "| Source type | Records | Errors | Error rate | Top confusions |",
        "| :--- | ---: | ---: | ---: | :--- |",
    ]
    for row in breakdowns["by_source_type"]:
        confusions = "; ".join(
            f"{entry['true']} -> {entry['predicted']} ({entry['count']})"
            for entry in row["top_confusions"]
        )
        lines.append(
            f"| {row['key']} | {row['total']} | {row['errors']} | "
            f"{_fmt_pct(row['error_rate'])} | {confusions} |"
        )
    lines += [
        "",
        "### 7.2 By source",
        "",
        "| Source | Records | Errors | Error rate | Top confusions |",
        "| :--- | ---: | ---: | ---: | :--- |",
    ]
    for row in breakdowns["by_source"]:
        confusions = "; ".join(
            f"{entry['true']} -> {entry['predicted']} ({entry['count']})"
            for entry in row["top_confusions"]
        )
        lines.append(
            f"| {row['key']} | {row['total']} | {row['errors']} | "
            f"{_fmt_pct(row['error_rate'])} | {confusions} |"
        )
    lines += [
        "",
        "### 7.3 Base families with repeat errors",
        "",
        "The same product family often fails multiple times (the dataset keeps "
        "several text variants per product), so raw error counts overstate the "
        f"number of distinct failing products. "
        f"{report['confusion_pairs']['total_errors']} errors come from "
        f"{breakdowns['distinct_error_families']} distinct base families.",
        "",
        "| Base family | Category | Errors | Predicted as |",
        "| :--- | :--- | ---: | :--- |",
    ]
    for row in breakdowns["multi_error_base_families"]:
        predicted_as = ", ".join(
            f"{category} ({count})" for category, count in row["predicted_categories"].items()
        )
        lines.append(
            f"| {row['base_family']} | {row['category']} | {row['errors']} | {predicted_as} |"
        )

    lines += [
        "",
        "## 8. Key observations (computed)",
        "",
    ]
    for observation in report["key_observations"]:
        lines.append(f"- {observation}")

    lines += [
        "",
        "## Appendix A. Complete error inventory",
        "",
        f"All {report['confusion_pairs']['total_errors']} top-1 errors, most "
        f"confident first. Full detail for every error is in the JSON artifact "
        f"under `confusion_pairs.directed[].examples`.",
        "",
        "| # | Test index | True | Predicted | Confidence | Input (truncated) |",
        "| ---: | ---: | :--- | :--- | ---: | :--- |",
    ]
    inventory: List[Dict[str, Any]] = []
    for pair in report["confusion_pairs"]["directed"]:
        for example in pair["examples"]:
            inventory.append(example)
    inventory.sort(key=lambda example: -example["confidence"])
    for position, example in enumerate(inventory, start=1):
        truncated = example["input"].replace("|", "\\|")
        if len(truncated) > 90:
            truncated = truncated[:87] + "…"
        lines.append(
            f"| {position} | {example['test_index']} | {example['expected']} | "
            f"{example['predicted']} | {example['confidence']:.4f} | {truncated} |"
        )
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Read-only error analysis of a category classifier against a frozen "
            "test set (v1.8.0 improvement program, Phase 1)."
        )
    )
    parser.add_argument(
        "--model-path",
        default=DEFAULT_MODEL_PATH,
        help="Model artifact to analyze (default: immutable v1.7.0 registry artifact)",
    )
    parser.add_argument(
        "--test-path",
        default=DEFAULT_TEST_PATH,
        help="Frozen test set JSON (default: dataset-crawl-1790343594-reprocessed test split)",
    )
    parser.add_argument(
        "--published-json",
        default=DEFAULT_PUBLISHED_PATH,
        help="Registry evaluation report to reproduce against (default: v1.7.0 report)",
    )
    parser.add_argument("--output-json", default=DEFAULT_OUTPUT_JSON)
    parser.add_argument("--output-md", default=DEFAULT_OUTPUT_MD)
    args = parser.parse_args()

    print("=" * 70)
    print(" CATEGORY CLASSIFIER ERROR ANALYSIS (v1.8.0 program, Phase 1)")
    print("=" * 70)
    print(f"Model:      {args.model_path}")
    print(f"Test set:   {args.test_path}")
    print(f"Published:  {args.published_json}")
    print("-" * 70)

    report = build_analysis(args.model_path, args.test_path, args.published_json)

    json_path = Path(args.output_json)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    with open(json_path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)

    md_path = Path(args.output_md)
    md_path.parent.mkdir(parents=True, exist_ok=True)
    with open(md_path, "w", encoding="utf-8") as handle:
        handle.write(render_markdown(report))

    metrics = report["headline_metrics"]
    print(f"Samples:    {metrics['sample_count']}")
    print(f"Top-1:      {metrics['top1_accuracy']:.4f} | Top-3: {metrics['top3_accuracy']:.4f}")
    print(f"Macro F1:   {metrics['macro_f1']:.4f} | Weighted F1: {metrics['weighted_f1']:.4f}")
    print(f"Top-1 errors: {metrics['top1_errors']} | Hard misses (outside top-3): {metrics['top3_hard_misses']}")
    match = report["reproduction_check"].get("matches_published")
    print(f"Reproduction vs published report: {'MATCH' if match else 'MISMATCH' if match is False else 'N/A'}")
    print("-" * 70)
    for observation in report["key_observations"]:
        print(f"  * {observation}")
    print("-" * 70)
    print(f"JSON report: {json_path}")
    print(f"MD report:   {md_path}")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
