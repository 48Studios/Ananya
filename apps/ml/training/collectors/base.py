"""
Extensible Base Collector Interface.

Every collector produces normalized ProductRecord objects with full provenance
and can persist raw records to the datasets/raw lifecycle directory.
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Tuple, Optional
import json
import hashlib
from pathlib import Path
from datetime import datetime, timezone

from ..schemas.product import ProductRecord, VerificationStatus
from ..schemas.manifest import DatasetManifest


class BaseCollector(ABC):
    """Abstract base class for all data collectors."""

    name: str = "base_collector"
    source_type: str = "generic"

    @abstractmethod
    def collect(self, **kwargs: Any) -> List[ProductRecord]:
        """Ingests raw records from external or local sources and wraps them in ProductRecord."""
        pass

    def validate(self, record: ProductRecord) -> Tuple[bool, List[str]]:
        """Basic validation before persistence."""
        errors = []
        if not record.sku and not record.mpn:
            errors.append("MISSING_IDENTIFIER: Record must have either SKU or MPN")
        if not record.name:
            errors.append("MISSING_NAME: Record must have a name")
        if not record.category:
            errors.append("MISSING_CATEGORY: Record must have a category")
        if not record.provenance:
            errors.append("MISSING_PROVENANCE: Record must include provenance")

        return len(errors) == 0, errors

    def persist_raw(
        self,
        records: List[ProductRecord],
        output_path: str,
        dataset_name: Optional[str] = None,
        version: str = "1.0.0",
    ) -> DatasetManifest:
        """
        Persists collected ProductRecords to JSON and generates an initial raw manifest.
        Calculates SHA-256 checksum for audit and reproducibility.
        """
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        data = [r.model_dump() for r in records]
        serialized = json.dumps(data, indent=2, default=str)
        checksum = hashlib.sha256(serialized.encode("utf-8")).hexdigest()

        with open(path, "w", encoding="utf-8") as f:
            f.write(serialized)

        source_counts: Dict[str, int] = {}
        domain_counts: Dict[str, int] = {}
        category_counts: Dict[str, int] = {}
        unverified_count = 0

        for r in records:
            src = r.provenance.source if r.provenance else "unknown"
            source_counts[src] = source_counts.get(src, 0) + 1

            dom = r.domain.value if hasattr(r.domain, "value") else str(r.domain)
            domain_counts[dom] = domain_counts.get(dom, 0) + 1

            cat = r.category
            category_counts[cat] = category_counts.get(cat, 0) + 1

            if r.provenance and r.provenance.verification_status != VerificationStatus.VERIFIED:
                unverified_count += 1

        manifest = DatasetManifest(
            dataset_name=dataset_name or f"raw_{self.name}",
            dataset_version=version,
            created_at=datetime.now(timezone.utc).isoformat(),
            processing_version="raw",
            checksum_sha256=checksum,
            total_raw_records=len(records),
            total_processed_records=len(records),
            source_counts=source_counts,
            domain_counts=domain_counts,
            category_counts=category_counts,
            unverified_provenance_count=unverified_count,
            metadata={"collector": self.name, "output_path": str(path)},
        )

        manifest_path = path.with_suffix(".manifest.json")
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest.model_dump(), f, indent=2)

        return manifest
