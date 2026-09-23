from .base import BaseProcessor, ProcessingDisposition, ProcessingAudit
from .validation import DataValidationProcessor, PHYSICAL_SANITY_BOUNDS
from .normalization import (
    NormalizationProcessor,
    normalize_text,
    normalize_unit_value,
    normalize_manufacturer,
    normalize_category,
    strip_packaging_suffix,
)
from .deduplication import DeduplicationProcessor, values_differ_critically
from .cross_source import CrossSourceAnalyzer

__all__ = [
    "BaseProcessor",
    "ProcessingDisposition",
    "ProcessingAudit",
    "DataValidationProcessor",
    "PHYSICAL_SANITY_BOUNDS",
    "NormalizationProcessor",
    "normalize_text",
    "normalize_unit_value",
    "normalize_manufacturer",
    "normalize_category",
    "strip_packaging_suffix",
    "DeduplicationProcessor",
    "values_differ_critically",
    "CrossSourceAnalyzer",
]
