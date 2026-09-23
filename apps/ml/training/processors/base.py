"""
Data Quality Pipeline Processor Interfaces.

Every processor categorizes records into:
- ACCEPTED
- QUARANTINED
- REJECTED
with explicit reasons.
"""

from abc import ABC, abstractmethod
from enum import Enum
from typing import Dict, Any, List, Optional, Tuple
from pydantic import BaseModel, Field

from ..schemas.product import ProductRecord


class ProcessingDisposition(str, Enum):
    ACCEPTED = "ACCEPTED"
    QUARANTINED = "QUARANTINED"
    REJECTED = "REJECTED"


class ProcessingAudit(BaseModel):
    record_id: Optional[str] = None
    disposition: ProcessingDisposition = ProcessingDisposition.ACCEPTED
    reasons: List[str] = Field(default_factory=list)
    processor_name: str = "processor"
    modified_fields: List[str] = Field(default_factory=list)


class BaseProcessor(ABC):
    """Abstract base class for all data quality & normalization processors."""

    name: str = "base_processor"

    @abstractmethod
    def process(
        self, record: ProductRecord
    ) -> Tuple[ProductRecord, ProcessingAudit]:
        """Processes a single record, applying cleaning, validation, or normalization."""
        pass

    def process_batch(
        self, records: List[ProductRecord]
    ) -> Tuple[List[ProductRecord], List[Tuple[ProductRecord, ProcessingAudit]]]:
        """
        Batch processing helper.
        Returns:
            passed_records: List of successfully accepted/normalized records
            quarantined_or_rejected: List of (record, audit) pairs that failed
        """
        passed: List[ProductRecord] = []
        flagged: List[Tuple[ProductRecord, ProcessingAudit]] = []

        for r in records:
            processed_r, audit = self.process(r)
            if audit.disposition == ProcessingDisposition.ACCEPTED:
                passed.append(processed_r)
            else:
                flagged.append((processed_r, audit))

        return passed, flagged
