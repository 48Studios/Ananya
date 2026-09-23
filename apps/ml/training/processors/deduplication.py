"""
Deduplication & Value Guard Processor.

Provides:
- Exact MPN / SKU deduplication
- Value Guard protection: blocks false-positive duplicate merges between differing ratings
  (e.g. 10kΩ vs 100kΩ, 16V vs 50V, M3 vs M4, 1.75mm vs 2.85mm)
"""

import re
from typing import List, Dict, Any, Tuple, Optional
from .base import BaseProcessor, ProcessingDisposition, ProcessingAudit
from ..schemas.product import ProductRecord


def values_differ_critically(
    record_a: ProductRecord, record_b: ProductRecord
) -> Tuple[bool, Optional[str]]:
    """
    Checks if two records have conflicting physical parameters.
    Returns (differ_critically, reason).
    """
    common_attrs = set(record_a.attributes.keys()).intersection(record_b.attributes.keys())
    for code in common_attrs:
        si_a = record_a.attributes[code].normalized_si
        si_b = record_b.attributes[code].normalized_si
        if si_a is not None and si_b is not None:
            # Check relative difference
            diff = abs(si_a - si_b)
            max_val = max(abs(si_a), abs(si_b))
            if max_val > 0 and (diff / max_val) > 0.01:  # More than 1% divergence
                return True, f"Value guard breach on '{code}': {si_a} vs {si_b}"

    return False, None


class DeduplicationProcessor(BaseProcessor):
    """Detects duplicates while strictly enforcing value guard bounds."""

    name = "deduplication"

    def process(self, record: ProductRecord) -> Tuple[ProductRecord, ProcessingAudit]:
        # Single record identity is trivial; batch process is primary
        return record, ProcessingAudit(record_id=record.id or record.sku, disposition=ProcessingDisposition.ACCEPTED)

    def deduplicate(
        self, records: List[ProductRecord]
    ) -> Tuple[List[ProductRecord], List[Tuple[ProductRecord, ProductRecord, str]]]:
        """
        Deduplicates a collection of records.
        Returns:
            unique_records: canonical unique records
            conflict_pairs: pairs that looked similar but were blocked by value guards
        """
        by_norm_mpn: Dict[str, List[ProductRecord]] = {}
        unique_records: List[ProductRecord] = []
        conflicts: List[Tuple[ProductRecord, ProductRecord, str]] = []

        for r in records:
            key = re.sub(r"[\s\-_/]", "", (r.mpn or r.sku or "").upper())
            by_norm_mpn.setdefault(key, []).append(r)

        for key, group in by_norm_mpn.items():
            if len(group) == 1:
                unique_records.append(group[0])
            else:
                primary = group[0]
                merged = True
                for other in group[1:]:
                    differs, reason = values_differ_critically(primary, other)
                    if differs:
                        conflicts.append((primary, other, reason or "Value difference"))
                        merged = False
                        # Keep both rather than false merging
                        unique_records.append(other)
                unique_records.append(primary)

        return unique_records, conflicts
