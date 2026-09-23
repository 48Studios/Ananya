"""
Category Classifier Candidate Trainer.

Trains candidate statistical models:
1. Character n-grams (3 to 5)
2. Word n-grams (1 to 2)
3. Hybrid Union (Char + Word)
Selects champion based on validation accuracy and packages into model registry.
"""

import os
import time
import pickle
from typing import Dict, Any, List, Optional, Tuple
from pathlib import Path
from datetime import datetime, timezone
import numpy as np

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline, FeatureUnion
from sklearn.metrics import accuracy_score, classification_report

from .base import BaseTrainer
from ..config import settings


class CategoryClassifierTrainer(BaseTrainer):
    """Trains scikit-learn classification pipelines across ERP product categories."""

    model_type = "category_classifier"

    def __init__(self, c_param: float = 5.0, max_iter: int = 300, random_seed: int = 42):
        self.c_param = c_param
        self.max_iter = max_iter
        self.random_seed = random_seed
        self.champion_pipeline: Optional[Pipeline] = None
        self.champion_name: str = ""
        self.candidate_results: Dict[str, Any] = {}

    def build_candidates(self) -> Dict[str, Pipeline]:
        """Builds candidate feature architectures."""
        candidates = {}

        # Candidate 1: Character n-grams
        candidates["char_ngram_model"] = Pipeline([
            ("tfidf", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True)),
            ("clf", LogisticRegression(C=self.c_param, max_iter=self.max_iter, random_state=self.random_seed)),
        ])

        # Candidate 2: Word n-grams
        candidates["word_ngram_model"] = Pipeline([
            ("tfidf", TfidfVectorizer(analyzer="word", ngram_range=(1, 2), sublinear_tf=True)),
            ("clf", LogisticRegression(C=self.c_param, max_iter=self.max_iter, random_state=self.random_seed)),
        ])

        # Candidate 3: Hybrid Union (Char + Word)
        union_features = FeatureUnion([
            ("char", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True)),
            ("word", TfidfVectorizer(analyzer="word", ngram_range=(1, 2), sublinear_tf=True)),
        ])
        candidates["hybrid_union_model"] = Pipeline([
            ("features", union_features),
            ("clf", LogisticRegression(C=self.c_param, max_iter=self.max_iter, random_state=self.random_seed)),
        ])

        return candidates

    def compute_top_k_accuracy(self, pipeline: Pipeline, X: List[str], y: List[str], k: int = 3) -> float:
        if not hasattr(pipeline.named_steps.get("clf"), "predict_proba") or len(y) == 0:
            return 0.0
        probs = pipeline.predict_proba(X)
        classes = list(pipeline.classes_)
        correct = 0
        for i, true_label in enumerate(y):
            top_k_indices = np.argsort(probs[i])[::-1][:k]
            top_k_labels = [classes[idx] for idx in top_k_indices]
            if true_label in top_k_labels:
                correct += 1
        return correct / len(y)

    def train(
        self,
        train_samples: List[Dict[str, Any]],
        val_samples: Optional[List[Dict[str, Any]]] = None,
        version: str = "1.0.0",
        output_dir: Optional[str] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        X_train = [d["text"].lower() for d in train_samples]
        y_train = [d["category"] for d in train_samples]

        val_data = val_samples or []
        X_val = [d["text"].lower() for d in val_data]
        y_val = [d["category"] for d in val_data]

        candidates = self.build_candidates()
        best_acc = -1.0
        best_name = ""
        best_pipe = None

        for name, pipe in candidates.items():
            t0 = time.perf_counter()
            pipe.fit(X_train, y_train)
            fit_time_ms = (time.perf_counter() - t0) * 1000

            train_acc = accuracy_score(y_train, pipe.predict(X_train))
            val_acc = (
                accuracy_score(y_val, pipe.predict(X_val))
                if len(X_val) > 0
                else train_acc
            )
            top3_acc = (
                self.compute_top_k_accuracy(pipe, X_val, y_val, k=3)
                if len(X_val) > 0
                else 1.0
            )

            self.candidate_results[name] = {
                "train_accuracy": round(float(train_acc), 4),
                "val_accuracy": round(float(val_acc), 4),
                "top3_accuracy": round(float(top3_acc), 4),
                "training_time_ms": round(fit_time_ms, 2),
            }

            if val_acc > best_acc:
                best_acc = val_acc
                best_name = name
                best_pipe = pipe

        self.champion_pipeline = best_pipe
        self.champion_name = best_name

        report: Dict[str, Any] = {}
        if best_pipe and len(X_val) > 0:
            target_names = sorted(list(set(y_val)))
            report = classification_report(
                y_val,
                best_pipe.predict(X_val),
                target_names=target_names,
                output_dict=True,
                zero_division=0,
            )

        metadata = {
            "version": version,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "champion_model": best_name,
            "all_candidates": self.candidate_results,
            "sample_counts": {"train": len(X_train), "val": len(X_val)},
            "categories": sorted(list(set(y_train))),
            "metrics": {
                "train_accuracy": self.candidate_results[best_name]["train_accuracy"],
                "val_accuracy": self.candidate_results[best_name]["val_accuracy"],
                "val_top3_accuracy": self.candidate_results[best_name]["top3_accuracy"],
            },
            "per_category_report": report,
        }

        if output_dir:
            out_p = Path(output_dir)
            out_p.mkdir(parents=True, exist_ok=True)
            self.save(str(out_p / "category_classifier.pkl"))
            with open(out_p / "metadata.json", "w", encoding="utf-8") as f:
                import json
                json.dump(metadata, f, indent=2)

        return metadata

    def save(self, output_path: str) -> str:
        if not self.champion_pipeline:
            raise RuntimeError("No trained champion model to save")
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as f:
            pickle.dump(self.champion_pipeline, f)
        return str(path)

    def load(self, model_path: str) -> Pipeline:
        with open(model_path, "rb") as f:
            self.champion_pipeline = pickle.load(f)
        return self.champion_pipeline
