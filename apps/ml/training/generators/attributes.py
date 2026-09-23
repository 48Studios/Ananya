"""
Attribute Extraction & Relevance Task Dataset Generators.

Includes:
1. AttributeExtractionDatasetGenerator: text/document snippet -> structured attribute key-values
2. AttributeRelevanceDatasetGenerator: product description + available Ananya attribute definitions universe -> relevant attributes
   (Strictly avoids restricting candidate attributes to category bindings alone)
"""

from typing import List, Dict, Any, Optional, Set
from ..schemas.product import ProductRecord
from ..schemas.tasks import AttributeExtractionExample, AttributeRelevanceExample


class AttributeExtractionDatasetGenerator:
    """Generates examples for parameter/attribute extraction."""

    def generate(self, records: List[ProductRecord]) -> List[AttributeExtractionExample]:
        examples: List[AttributeExtractionExample] = []

        for r in records:
            if not r.attributes:
                continue

            extracted_dict: Dict[str, Any] = {}
            for code, attr in r.attributes.items():
                extracted_dict[code] = {
                    "value": attr.value,
                    "unit": attr.unit,
                    "normalized_si": attr.normalized_si,
                }

            text = r.to_training_text()
            examples.append(
                AttributeExtractionExample(
                    text=text,
                    target_attributes=extracted_dict,
                    provenance=r.provenance,
                )
            )

        return examples


class AttributeRelevanceDatasetGenerator:
    """
    Generates training examples for attribute relevance determination.
    The candidate universe is composed of ALL available attribute definitions,
    allowing ML to identify relevant attributes even if unbound to the current category.
    """

    def __init__(self, attribute_universe: Optional[List[str]] = None):
        # Default representative universe of Ananya attribute codes
        self.attribute_universe = attribute_universe or [
            "resistance",
            "capacitance",
            "voltage",
            "current",
            "inductance",
            "tolerance",
            "power",
            "package",
            "dielectric",
            "thread_size",
            "thread_pitch",
            "diameter",
            "length",
            "head_type",
            "drive_type",
            "material",
            "finish",
            "color",
            "temperature_range",
            "weight",
            "filament_diameter",
            "bed_temperature",
            "nozzle_temperature",
            "flow_rate",
            "contact_form",
            "pin_count",
            "mounting_type",
        ]

    def generate(self, records: List[ProductRecord]) -> List[AttributeRelevanceExample]:
        examples: List[AttributeRelevanceExample] = []

        for r in records:
            relevant_codes = list(r.attributes.keys())
            if not relevant_codes:
                # Infer based on common keywords if attributes not populated
                text_low = r.to_training_text().lower()
                for cand in self.attribute_universe:
                    if cand in text_low:
                        relevant_codes.append(cand)

            examples.append(
                AttributeRelevanceExample(
                    product_text=r.to_training_text(),
                    category=r.category,
                    candidate_attribute_codes=list(self.attribute_universe),
                    relevant_attribute_codes=relevant_codes,
                    provenance=r.provenance,
                )
            )

        return examples
