"""
Entity Resolution Task Dataset Generator.

Generates examples for resolving dirty, aliased, or partial manufacturer and brand strings
to canonical entities.
"""

from typing import List, Dict, Any, Optional
from ..schemas.product import ProductRecord
from ..schemas.tasks import EntityResolutionExample
from ..processors.normalization import MANUFACTURER_ALIASES


class EntityResolutionDatasetGenerator:
    """Generates training datasets for manufacturer/vendor entity resolution."""

    def __init__(self, alias_dict: Optional[Dict[str, str]] = None):
        self.alias_dict = alias_dict or MANUFACTURER_ALIASES

    def generate(self, records: List[ProductRecord]) -> List[EntityResolutionExample]:
        examples: List[EntityResolutionExample] = []
        seen_entities = set()

        for r in records:
            mfg = r.manufacturer
            if not mfg or mfg.lower() in ("generic", "unknown"):
                continue

            if mfg not in seen_entities:
                seen_entities.add(mfg)
                # Find known aliases
                aliases = [k for k, v in self.alias_dict.items() if v.lower() == mfg.lower()]

                # Exact canonical
                examples.append(
                    EntityResolutionExample(
                        query_text=mfg,
                        entity_type="MANUFACTURER",
                        canonical_name=mfg,
                        aliases=aliases,
                    )
                )

                # Alias queries
                for alias in aliases:
                    examples.append(
                        EntityResolutionExample(
                            query_text=alias,
                            entity_type="MANUFACTURER",
                            canonical_name=mfg,
                            aliases=aliases,
                        )
                    )

        return examples
