import os
import pickle
import re
import numpy as np
from typing import List, Optional, Dict, Tuple
from ..schemas import CategoryPrediction, EvidenceItem, DataPackIntelligenceHint
from ..config import settings

# Subcategory to Parent Category hierarchy mapping
PARENT_CATEGORY_MAP = {
    "Resistors": "Electronic Components",
    "Capacitors": "Electronic Components",
    "Inductors": "Electronic Components",
    "Diodes": "Electronic Components",
    "Transistors": "Electronic Components",
    "Connectors": "Electronic Components",
    "Cables": "Electronic Components",
    "Switches": "Electronic Components",
    "Optoelectronics": "Electronic Components",
    "ICs & Semiconductors": "Electronic Components",
    "Prototyping": "Electronic Components",
    "Mechanical Parts": "Mechanical Parts",
    "Raw Materials": "Raw Materials",
    "Assemblies": "Assemblies",
    "Consumables": "Consumables",
}

class CategoryClassifierService:
    def __init__(self):
        self._model = None
        self._is_loaded = False

    def load(self):
        if self._is_loaded:
            return
        if os.path.exists(settings.category_model_path):
            with open(settings.category_model_path, "rb") as f:
                self._model = pickle.load(f)
            self._is_loaded = True
        else:
            self._model = None
            self._is_loaded = False

    @property
    def is_loaded(self) -> bool:
        return self._is_loaded

    def predict(
        self,
        text: str,
        top_k: int = 3,
        datapack_hints: Optional[List[DataPackIntelligenceHint]] = None,
    ) -> List[CategoryPrediction]:
        clean_text = text.strip()
        lower_text = clean_text.lower()
        upper_text = clean_text.upper()

        if not clean_text:
            return [
                CategoryPrediction(
                    category="Electronic Components",
                    confidence=0.3,
                    confidence_level="LOW",
                    parent_category="Electronic Components",
                    evidence=[
                        EvidenceItem(
                            type="classifier",
                            description="Default category assigned for empty input",
                            weight=0.3,
                        )
                    ],
                )
            ]

        # 1. Evaluate Data Pack Hints (MPN patterns, aliases, keywords)
        dp_matches: Dict[str, List[EvidenceItem]] = {}
        if datapack_hints:
            for hint in datapack_hints:
                target_cat = hint.categoryName or hint.categoryCode or ""
                if not target_cat:
                    continue
                if target_cat not in dp_matches:
                    dp_matches[target_cat] = []

                # MPN patterns
                if hint.mpnPatterns:
                    for pat in hint.mpnPatterns:
                        try:
                            if re.search(pat, upper_text) or re.search(pat, clean_text):
                                dp_matches[target_cat].append(
                                    EvidenceItem(
                                        type="mpn_pattern",
                                        description=f"Matched Data Pack MPN pattern '{pat}'",
                                        weight=0.7,
                                        source=f"datapack:{hint.categoryCode or target_cat}",
                                    )
                                )
                                break
                        except re.error:
                            pass

                # Aliases (exact word boundaries)
                if hint.aliases:
                    for alias in hint.aliases:
                        if len(alias) >= 2:
                            alias_pat = r"\b" + re.escape(alias.lower()) + r"\b"
                            if re.search(alias_pat, lower_text):
                                dp_matches[target_cat].append(
                                    EvidenceItem(
                                        type="data_pack_rule",
                                        description=f"Matched category alias '{alias}'",
                                        weight=0.6,
                                        source=f"datapack:{hint.categoryCode or target_cat}",
                                    )
                                )
                                break

                # Keywords
                if hint.keywords:
                    for kw in hint.keywords:
                        if len(kw) >= 3:
                            kw_pat = r"\b" + re.escape(kw.lower()) + r"\b"
                            if re.search(kw_pat, lower_text):
                                dp_matches[target_cat].append(
                                    EvidenceItem(
                                        type="keyword",
                                        description=f"Matched domain keyword '{kw}'",
                                        weight=0.4,
                                        source=f"datapack:{hint.categoryCode or target_cat}",
                                    )
                                )
                                break

        # 2. Get Statistical Model Probabilities
        scores: Dict[str, float] = {}
        if self._is_loaded and self._model is not None:
            probs = self._model.predict_proba([lower_text])[0]
            classes = self._model.classes_
            for cls, p in zip(classes, probs):
                scores[cls] = float(p)
        else:
            # Fallback uniform score
            for c in PARENT_CATEGORY_MAP.keys():
                scores[c] = 0.05

        # 3. Combine Data Pack evidence into confidence
        # Data Pack MPN pattern strongly boosts category (+0.40)
        # Keyword / alias matches boost (+0.20)
        for cat, ev_list in dp_matches.items():
            if not ev_list:
                continue
            bonus = sum(ev.weight * 0.4 for ev in ev_list)
            scores[cat] = min(0.99, scores.get(cat, 0.1) + bonus)

        # 4. Rank and sort
        sorted_cats = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:top_k]

        predictions: List[CategoryPrediction] = []
        for cat_name, raw_conf in sorted_cats:
            parent = PARENT_CATEGORY_MAP.get(cat_name, "Electronic Components")
            cat_evidence: List[EvidenceItem] = list(dp_matches.get(cat_name, []))

            # Add statistical classifier evidence
            if self._is_loaded and self._model is not None:
                cat_evidence.append(
                    EvidenceItem(
                        type="classifier",
                        description=f"Statistical character n-gram model probability ({int(raw_conf * 100)}%)",
                        weight=0.5,
                        source="model:category_classifier_v1",
                    )
                )

            # Determine calibrated confidence and confidence level
            has_strong_evidence = any(e.type in ("mpn_pattern", "data_pack_rule") for e in cat_evidence)
            is_top = (cat_name == sorted_cats[0][0])
            if raw_conf >= 0.80 or (raw_conf >= 0.65 and has_strong_evidence):
                conf_level = "HIGH"
                calibrated_conf = min(0.99, max(0.85, raw_conf))
            elif raw_conf >= 0.40 or (is_top and raw_conf >= 0.25) or has_strong_evidence:
                conf_level = "MEDIUM"
                calibrated_conf = min(0.84, max(0.65, raw_conf))
            else:
                conf_level = "LOW"
                calibrated_conf = round(max(0.1, raw_conf), 4)

            predictions.append(
                CategoryPrediction(
                    category=parent,
                    subcategory=cat_name if parent != cat_name else None,
                    confidence=calibrated_conf,
                    confidence_level=conf_level,
                    parent_category=parent,
                    evidence=cat_evidence,
                )
            )

        return predictions

    def predict_batch(
        self,
        texts: List[str],
        top_k: int = 3,
        datapack_hints: Optional[List[DataPackIntelligenceHint]] = None,
    ) -> List[List[CategoryPrediction]]:
        return [self.predict(t, top_k, datapack_hints) for t in texts]

category_classifier = CategoryClassifierService()
