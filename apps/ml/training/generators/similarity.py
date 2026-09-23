"""
Product Similarity Task Dataset Generator.

Generates (anchor, positive, negative) triplet datasets for contrastive learning
and vector embedding retrieval models.
"""

from typing import List, Dict, Any
from ..schemas.product import ProductRecord
from ..schemas.tasks import SimilarityTripletExample


class SimilarityDatasetGenerator:
    """Generates contrastive similarity triplets."""

    def generate(self, records: List[ProductRecord]) -> List[SimilarityTripletExample]:
        triplets: List[SimilarityTripletExample] = []

        by_cat: Dict[str, List[ProductRecord]] = {}
        for r in records:
            by_cat.setdefault(r.category, []).append(r)

        categories = list(by_cat.keys())
        if len(categories) < 2:
            return triplets

        for cat, group in by_cat.items():
            if len(group) < 2:
                continue

            # Pick another category for negative
            other_cat = next(c for c in categories if c != cat)
            neg_record = by_cat[other_cat][0]

            for i in range(len(group) - 1):
                anchor = group[i]
                pos = group[i + 1]
                triplets.append(
                    SimilarityTripletExample(
                        anchor_text=anchor.to_training_text(),
                        positive_text=pos.to_training_text(),
                        negative_text=neg_record.to_training_text(),
                        domain=anchor.domain.value if hasattr(anchor.domain, "value") else str(anchor.domain),
                    )
                )

        return triplets
