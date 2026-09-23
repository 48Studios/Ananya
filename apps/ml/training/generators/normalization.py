"""
Value & Unit Normalization Task Dataset Generator.

Generates examples for learning canonical unit conversion and parameter parsing:
e.g.
  '10K' -> 10.0 kΩ (10000.0 Ω)
  '10 kΩ' -> 10.0 kΩ (10000.0 Ω)
  '0.1 uF' -> 0.1 µF (1e-7 F)
  'M3 x 8mm' -> 8.0 mm (0.008 m)
"""

from typing import List, Dict, Any
from ..schemas.product import ProductRecord
from ..schemas.tasks import NormalizationExample
from ..processors.normalization import normalize_unit_value


class NormalizationDatasetGenerator:
    """Generates unit & value normalization training pairs."""

    def generate(self, records: List[ProductRecord]) -> List[NormalizationExample]:
        examples: List[NormalizationExample] = []

        for r in records:
            for code, attr in r.attributes.items():
                if attr.raw_value and attr.normalized_si is not None:
                    val, unit, norm_si = normalize_unit_value(attr.raw_value, code)
                    if norm_si is not None:
                        examples.append(
                            NormalizationExample(
                                raw_input=attr.raw_value,
                                property_type=code,
                                canonical_value=val or 0.0,
                                canonical_unit=unit or attr.unit or "",
                                normalized_si=norm_si,
                            )
                        )

        return examples
