"""
Configuration and Hardware Awareness for Ananya ML Training Workspace.

Supports:
- MacBook Apple Silicon (M4 Pro / Metal / MPS)
- Workstation (32GB RAM / 16GB VRAM / CUDA)
- CPU fallback for low-overhead local development
"""

import os
import sys
import platform
from pathlib import Path
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


def detect_device() -> str:
    """
    Detects hardware acceleration device without hardcoding CUDA or MPS.
    Prioritizes:
    1. Explicit ANANYA_ML_DEVICE environment variable override ('cpu', 'mps', 'cuda')
    2. Apple Silicon Metal Performance Shaders ('mps')
    3. NVIDIA CUDA ('cuda')
    4. Fallback to CPU ('cpu')
    """
    env_device = os.environ.get("ANANYA_ML_DEVICE", "").strip().lower()
    if env_device in ("cpu", "mps", "cuda"):
        return env_device

    # Check for PyTorch MPS / CUDA if torch is present
    try:
        import torch  # type: ignore
        if torch.cuda.is_available():
            return "cuda"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
    except ImportError:
        pass

    # Platform-level Apple Silicon detection
    if platform.system() == "Darwin" and platform.machine() in ("arm64", "aarch64"):
        return "mps"

    return "cpu"


class WorkspaceSettings(BaseModel):
    """Centralized configuration for ML training workspace."""

    # Workspace Paths (relative to repository root or absolute)
    base_dir: str = Field(
        default_factory=lambda: str(
            Path(__file__).resolve().parent.parent
        )
    )
    dataset_base_dir: str = Field(
        default_factory=lambda: os.environ.get(
            "ANANYA_ML_DATA_DIR",
            str(Path(__file__).resolve().parent.parent / "datasets"),
        )
    )
    models_dir: str = Field(
        default_factory=lambda: os.environ.get(
            "ANANYA_ML_MODELS_DIR", "apps/ml/models"
        )
    )
    registry_dir: str = Field(
        default_factory=lambda: os.environ.get(
            "ANANYA_ML_REGISTRY_DIR", "apps/ml/models/registry"
        )
    )
    experiments_dir: str = Field(
        default_factory=lambda: os.environ.get(
            "ANANYA_ML_EXPERIMENTS_DIR", "apps/ml/training/experiments"
        )
    )

    # Subdirectories within dataset_base_dir
    @property
    def raw_data_dir(self) -> Path:
        return Path(self.dataset_base_dir) / "raw"

    @property
    def cleaned_data_dir(self) -> Path:
        return Path(self.dataset_base_dir) / "cleaned"

    @property
    def normalized_data_dir(self) -> Path:
        return Path(self.dataset_base_dir) / "normalized"

    @property
    def training_data_dir(self) -> Path:
        return Path(self.dataset_base_dir) / "training"

    @property
    def evaluation_data_dir(self) -> Path:
        return Path(self.dataset_base_dir) / "evaluation"

    # Database Configuration (read-only snapshot creation)
    database_url: Optional[str] = Field(
        default_factory=lambda: os.environ.get("DATABASE_URL")
    )

    # General Training & Splitting Parameters
    default_seed: int = 42
    default_dataset_version: str = "1.4.0"
    train_ratio: float = 0.80
    val_ratio: float = 0.10
    test_ratio: float = 0.10

    # Hardware & Resource Constraints
    device: str = Field(default_factory=detect_device)
    max_memory_mb: float = 256.0
    num_workers: int = Field(
        default_factory=lambda: min(os.cpu_count() or 4, 8)
    )

    def hardware_info(self) -> Dict[str, Any]:
        """Returns human and machine-readable hardware acceleration profile."""
        return {
            "device": self.device,
            "platform": platform.platform(),
            "python_version": sys.version.split()[0],
            "cpu_count": os.cpu_count(),
            "is_apple_silicon": platform.system() == "Darwin"
            and platform.machine() in ("arm64", "aarch64"),
            "num_workers": self.num_workers,
            "memory_limit_mb": self.max_memory_mb,
        }

    def ensure_directories(self) -> None:
        """Ensures all lifecycle dataset and experiment directories exist."""
        for path in (
            self.raw_data_dir,
            self.cleaned_data_dir,
            self.normalized_data_dir,
            self.training_data_dir,
            self.evaluation_data_dir,
            Path(self.experiments_dir),
            Path(self.registry_dir),
        ):
            path.mkdir(parents=True, exist_ok=True)


# Default singleton settings instance
settings = WorkspaceSettings()
