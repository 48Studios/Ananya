import os
import pickle
import numpy as np
from typing import List
from ..schemas import CategoryPrediction
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

    def predict(self, text: str, top_k: int = 3) -> List[CategoryPrediction]:
        if not self._is_loaded or self._model is None:
            # Fallback if model not trained or not loaded
            return [CategoryPrediction(category="Electronic Components", confidence=0.5, parent_category="Electronic Components")]

        clean_text = text.strip().lower()
        if not clean_text:
            return [CategoryPrediction(category="Electronic Components", confidence=0.3, parent_category="Electronic Components")]

        probs = self._model.predict_proba([clean_text])[0]
        classes = self._model.classes_
        top_indices = np.argsort(probs)[::-1][:top_k]

        predictions = []
        for idx in top_indices:
            cat_name = classes[idx]
            conf = float(probs[idx])
            parent = PARENT_CATEGORY_MAP.get(cat_name, cat_name)
            predictions.append(
                CategoryPrediction(
                    category=parent,
                    subcategory=cat_name if parent != cat_name else None,
                    confidence=round(conf, 4),
                    parent_category=parent
                )
            )
        return predictions

    def predict_batch(self, texts: List[str], top_k: int = 3) -> List[List[CategoryPrediction]]:
        return [self.predict(t, top_k) for t in texts]

category_classifier = CategoryClassifierService()
