"""
Deterministic Grouped Dataset Splitter.

Enforces:
1. Zero Data Leakage (Group-based splitting on series/product family or base MPN)
2. Reproducible Train / Validation / Test partitions with fixed seed and version
3. Manifest generation with SHA-256 checksums
"""

import os
import json
import hashlib
from typing import List, Dict, Any, Tuple, Optional
from pathlib import Path
from datetime import datetime, timezone
import numpy as np

from ..schemas.tasks import ClassificationExample
from ..schemas.manifest import DatasetManifest, DatasetSplitCounts


class DeterministicDatasetSplitter:
    """Splits dataset examples into train/val/test partitions with zero group leakage."""

    def __init__(
        self,
        train_ratio: float = 0.80,
        val_ratio: float = 0.10,
        test_ratio: float = 0.10,
        random_seed: int = 42,
    ):
        total = train_ratio + val_ratio + test_ratio
        if abs(total - 1.0) > 1e-4:
            raise ValueError(f"Ratios must sum to 1.0, got {total}")

        self.train_ratio = train_ratio
        self.val_ratio = val_ratio
        self.test_ratio = test_ratio
        self.random_seed = random_seed

    def split(
        self,
        examples: List[Dict[str, Any]],
        group_key: str = "base_family",
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Splits examples based on groups associated with group_key.
        Ensures NO group appears in more than one partition.
        """
        # Map examples to their group
        group_to_indices: Dict[str, List[int]] = {}
        for idx, ex in enumerate(examples):
            raw_group = ex.get(group_key)
            if raw_group is None or not str(raw_group).strip():
                raise ValueError(
                    f"Missing populated group key '{group_key}' at example index {idx}"
                )
            grp = str(raw_group).strip()
            group_to_indices.setdefault(grp, []).append(idx)

        unique_groups = sorted(list(group_to_indices.keys()))

        # Shuffle groups deterministically
        rng = np.random.default_rng(self.random_seed)
        shuffled_groups = list(unique_groups)
        rng.shuffle(shuffled_groups)

        n_groups = len(shuffled_groups)
        train_end = int(n_groups * self.train_ratio)
        val_end = train_end + int(n_groups * self.val_ratio)
        if self.test_ratio == 0:
            val_end = n_groups

        train_groups = set(shuffled_groups[:train_end])
        val_groups = set(shuffled_groups[train_end:val_end])
        test_groups = set(shuffled_groups[val_end:])

        # Guard: assert zero overlap between partitions
        assert len(train_groups.intersection(val_groups)) == 0, "Leakage between train and val!"
        assert len(train_groups.intersection(test_groups)) == 0, "Leakage between train and test!"
        assert len(val_groups.intersection(test_groups)) == 0, "Leakage between val and test!"

        # Preserve source ordering so identical inputs and seed produce identical
        # serialized split hashes across Python processes.
        train_examples = [
            ex for ex in examples if str(ex[group_key]).strip() in train_groups
        ]
        val_examples = [
            ex for ex in examples if str(ex[group_key]).strip() in val_groups
        ]
        test_examples = [
            ex for ex in examples if str(ex[group_key]).strip() in test_groups
        ]

        return train_examples, val_examples, test_examples

    def persist_splits(
        self,
        examples: List[Dict[str, Any]],
        output_dir: str,
        dataset_name: str,
        version: str = "1.0.0",
        group_key: str = "base_family",
    ) -> DatasetManifest:
        """Splits and saves train.json, val.json, test.json with a manifest."""
        out_path = Path(output_dir)
        out_path.mkdir(parents=True, exist_ok=True)

        train_set, val_set, test_set = self.split(examples, group_key=group_key)

        for name, data in [("train.json", train_set), ("val.json", val_set), ("test.json", test_set)]:
            with open(out_path / name, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, default=str)

        # Compute combined hash
        combined = json.dumps([train_set, val_set, test_set], default=str)
        checksum = hashlib.sha256(combined.encode("utf-8")).hexdigest()

        # Count categories
        cat_counts: Dict[str, int] = {}
        for ex in examples:
            cat = ex.get("category", "Unknown")
            cat_counts[cat] = cat_counts.get(cat, 0) + 1

        train_groups = {str(ex[group_key]).strip() for ex in train_set}
        val_groups = {str(ex[group_key]).strip() for ex in val_set}
        test_groups = {str(ex[group_key]).strip() for ex in test_set}
        zero_group_leakage = not (
            train_groups.intersection(val_groups)
            or train_groups.intersection(test_groups)
            or val_groups.intersection(test_groups)
        )
        if not zero_group_leakage:
            raise ValueError("Group leakage detected after dataset split")

        manifest = DatasetManifest(
            dataset_name=dataset_name,
            dataset_version=version,
            created_at=datetime.now(timezone.utc).isoformat(),
            processing_version="split_v1",
            checksum_sha256=checksum,
            total_raw_records=len(examples),
            total_processed_records=len(examples),
            split_counts=DatasetSplitCounts(
                train=len(train_set),
                validation=len(val_set),
                test=len(test_set),
                total=len(examples),
            ),
            category_counts=cat_counts,
            zero_leakage_verified=zero_group_leakage,
            group_key=group_key,
            distinct_groups_count=len({str(ex[group_key]).strip() for ex in examples}),
            metadata={
                "seed": self.random_seed,
                "train_ratio": self.train_ratio,
                "val_ratio": self.val_ratio,
                "test_ratio": self.test_ratio,
                "output_dir": str(out_path),
            },
        )

        with open(out_path / "manifest.json", "w", encoding="utf-8") as f:
            json.dump(manifest.model_dump(), f, indent=2)

        return manifest
