"""
Dataset Manifest Schema.

Every generated dataset snapshot carries an immutable manifest with checksum,
source breakdown, split counts, and provenance integrity guarantees.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field


class DatasetSplitCounts(BaseModel):
    train: int = 0
    validation: int = 0
    test: int = 0
    total: int = 0


class DatasetManifest(BaseModel):
    """Manifest for tracking dataset lineage and reproducibility."""

    dataset_name: str
    dataset_version: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    processing_version: str = "1.0.0"
    checksum_sha256: str = ""

    # Source & record counts
    total_raw_records: int = 0
    total_processed_records: int = 0
    source_counts: Dict[str, int] = Field(default_factory=dict)
    domain_counts: Dict[str, int] = Field(default_factory=dict)
    category_counts: Dict[str, int] = Field(default_factory=dict)

    # Train / Val / Test split breakdown
    split_counts: DatasetSplitCounts = Field(default_factory=DatasetSplitCounts)

    # Quality & Leakage verification
    zero_leakage_verified: bool = False
    group_key: Optional[str] = None
    distinct_groups_count: int = 0
    unverified_provenance_count: int = 0

    # Custom task metadata
    metadata: Dict[str, Any] = Field(default_factory=dict)
