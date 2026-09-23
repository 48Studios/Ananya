"""
Reusable Metrics Engine for Model Evaluation.

Supports:
- Classification (Top-1, Top-k, Precision, Recall, F1, Per-domain/category slices)
- Duplicate Detection (Precision, Recall, Critical False Positive Merges)
- Attribute Relevance & Extraction (Precision, Recall, F1)
- Entity Resolution (Top-1 Accuracy, MRR)
- Unit Normalization (Tolerance deviation, exact match accuracy)
- System Benchmarks (Latency P50, P95, P99, Peak RAM)
"""

import time
import resource
from typing import Dict, Any, List, Optional, Tuple, Callable
import numpy as np
from sklearn.metrics import classification_report, accuracy_score, precision_recall_fscore_support


def compute_classification_metrics(
    y_true: List[str],
    y_pred: List[str],
    probs: Optional[np.ndarray] = None,
    classes: Optional[List[str]] = None,
    k: int = 3,
) -> Dict[str, Any]:
    """Computes Top-1, Top-k, weighted Precision/Recall/F1, and per-class reports."""
    top1 = accuracy_score(y_true, y_pred) if y_true else 0.0

    topk = 0.0
    if probs is not None and classes is not None and len(y_true) > 0:
        correct = 0
        for i, true_l in enumerate(y_true):
            indices = np.argsort(probs[i])[::-1][:k]
            top_classes = [classes[idx] for idx in indices]
            if true_l in top_classes:
                correct += 1
        topk = correct / len(y_true)

    p, r, f1, _ = precision_recall_fscore_support(
        y_true, y_pred, average="weighted", zero_division=0
    )

    per_class = classification_report(
        y_true, y_pred, output_dict=True, zero_division=0
    )

    return {
        "top1_accuracy": round(float(top1), 4),
        "top3_accuracy": round(float(topk), 4),
        "weighted_precision": round(float(p), 4),
        "weighted_recall": round(float(r), 4),
        "weighted_f1": round(float(f1), 4),
        "sample_count": len(y_true),
        "per_class": per_class,
    }


def compute_duplicate_metrics(
    predictions: List[bool],
    ground_truth: List[bool],
    is_critical_mismatch: Optional[List[bool]] = None,
) -> Dict[str, Any]:
    """Computes precision, recall, and critical false-positive merge counts."""
    tp = fp = tn = fn = 0
    critical_false_merges = 0

    for idx, (pred, true_val) in enumerate(zip(predictions, ground_truth)):
        if true_val and pred:
            tp += 1
        elif not true_val and not pred:
            tn += 1
        elif not true_val and pred:
            fp += 1
            if is_critical_mismatch and is_critical_mismatch[idx]:
                critical_false_merges += 1
        else:
            fn += 1

    precision = tp / (tp + fp) if (tp + fp) > 0 else 1.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    return {
        "precision": round(float(precision), 4),
        "recall": round(float(recall), 4),
        "f1": round(float(f1), 4),
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "critical_false_merges": critical_false_merges,
    }


def compute_set_relevance_metrics(
    predicted_sets: List[List[str]], true_sets: List[List[str]]
) -> Dict[str, Any]:
    """Evaluates attribute relevance sets (multi-label precision/recall)."""
    precisions = []
    recalls = []

    for pred, true_s in zip(predicted_sets, true_sets):
        p_set = set(pred)
        t_set = set(true_s)
        if not p_set and not t_set:
            precisions.append(1.0)
            recalls.append(1.0)
            continue
        inter = len(p_set.intersection(t_set))
        p = inter / len(p_set) if len(p_set) > 0 else 1.0
        r = inter / len(t_set) if len(t_set) > 0 else 1.0
        precisions.append(p)
        recalls.append(r)

    mean_p = float(np.mean(precisions)) if precisions else 0.0
    mean_r = float(np.mean(recalls)) if recalls else 0.0
    f1 = 2 * mean_p * mean_r / (mean_p + mean_r) if (mean_p + mean_r) > 0 else 0.0

    return {
        "mean_precision": round(mean_p, 4),
        "mean_recall": round(mean_r, 4),
        "mean_f1": round(f1, 4),
    }


def compute_latency_and_memory(
    predict_fn: Callable[[str], Any], sample_queries: List[str]
) -> Dict[str, Any]:
    """Measures latency (P50, P95, P99) and resident memory usage."""
    latencies = []
    for q in sample_queries:
        t0 = time.perf_counter()
        _ = predict_fn(q)
        latencies.append((time.perf_counter() - t0) * 1000)

    p50 = float(np.percentile(latencies, 50)) if latencies else 0.0
    p95 = float(np.percentile(latencies, 95)) if latencies else 0.0
    p99 = float(np.percentile(latencies, 99)) if latencies else 0.0

    max_rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    ram_mb = max_rss / (1024 * 1024) if max_rss > 1000000 else max_rss / 1024

    return {
        "latency_ms": {
            "p50": round(p50, 3),
            "p95": round(p95, 3),
            "p99": round(p99, 3),
        },
        "peak_ram_mb": round(ram_mb, 2),
    }
