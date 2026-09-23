"""
Classification Task Dataset Generator.

Transforms ProductRecords into (text, category) training examples with:
- Non-semantic text variations (e.g. unit casing, symbol variants, delimiter variations)
- Preserved series/product family for zero-leakage grouped splitting
- Domain and hierarchy metadata
"""

import re
from typing import List, Dict, Any, Optional
from ..schemas.product import ProductRecord
from ..schemas.tasks import ClassificationExample


def generate_text_variations(record: ProductRecord) -> List[str]:
    """Generates synthetic non-semantic textual representations (symbol & delimiter variants)."""
    base_text = record.to_training_text()
    variations = [base_text]

    # Variation 1: micro symbol (uF <-> µF)
    if "uf" in base_text.lower():
        v1 = re.sub(r"\b(\d+(?:\.\d+)?)\s*uf\b", r"\1µF", base_text, flags=re.IGNORECASE)
        variations.append(v1)

    # Variation 2: ohm symbol (kohm / ohm <-> kΩ / Ω)
    if "ohm" in base_text.lower():
        v2 = re.sub(r"\b(\d+(?:\.\d+)?)\s*kohm\b", r"\1kΩ", base_text, flags=re.IGNORECASE)
        v2 = re.sub(r"\b(\d+(?:\.\d+)?)\s*ohm\b", r"\1Ω", v2, flags=re.IGNORECASE)
        variations.append(v2)

    # Variation 3: stripped MPN delimiters
    if record.mpn:
        stripped_mpn = re.sub(r"[-_/]", "", record.mpn)
        if stripped_mpn != record.mpn:
            v3 = base_text.replace(record.mpn, stripped_mpn)
            variations.append(v3)

    # Variation 4: lowercased vs titlecased
    variations.append(base_text.lower())

    return list(dict.fromkeys(variations))


class ClassificationDatasetGenerator:
    """Generates training examples for text-to-category classification."""

    def __init__(self, include_variations: bool = True):
        self.include_variations = include_variations

    def generate(self, records: List[ProductRecord]) -> List[ClassificationExample]:
        examples: List[ClassificationExample] = []

        for record in records:
            texts = (
                generate_text_variations(record)
                if self.include_variations
                else [record.to_training_text()]
            )

            group_id = record.series_family or record.base_mpn or record.mpn or record.sku

            for t in texts:
                examples.append(
                    ClassificationExample(
                        text=t,
                        category=record.category,
                        domain=record.domain.value if hasattr(record.domain, "value") else str(record.domain),
                        base_family=group_id,
                        mpn=record.mpn,
                        sku=record.sku,
                        provenance=record.provenance,
                    )
                )

        return examples
