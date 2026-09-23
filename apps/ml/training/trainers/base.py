"""
Base Model Trainer Interface.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional, Tuple


class BaseTrainer(ABC):
    """Abstract base class for all model trainers."""

    model_type: str = "base_trainer"

    @abstractmethod
    def train(
        self,
        train_samples: List[Dict[str, Any]],
        val_samples: Optional[List[Dict[str, Any]]] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Trains candidate model(s) and returns execution metadata."""
        pass

    @abstractmethod
    def save(self, output_path: str) -> str:
        """Serializes champion artifact to disk."""
        pass

    @abstractmethod
    def load(self, model_path: str) -> Any:
        """Loads serialized model artifact."""
        pass
