"""Run-scoped index and allowlisted retrieval for candidate forensic artifacts."""

import hashlib
import json
import re
from pathlib import Path
from typing import Any, Dict, Optional, Tuple


VERSION_PATTERN = re.compile(r"^\d+\.\d+\.\d+$")
SAFE_DATASET_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{1,180}$")
SAFE_RUN_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{1,128}$")
RUN_MANIFEST_NAME = "run_manifest.json"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _artifact_paths(
    root: Path, candidate_version: str, dataset_version: str
) -> Dict[str, Path]:
    if not VERSION_PATTERN.fullmatch(candidate_version):
        raise ValueError("Invalid candidate version")
    if not SAFE_DATASET_PATTERN.fullmatch(dataset_version) or ".." in dataset_version:
        raise ValueError("Invalid dataset version")
    registry = root / "apps/ml/models/registry" / f"v{candidate_version}"
    dataset = root / "apps/ml/data/datasets/retraining" / dataset_version
    return {
        "candidate_model": registry / "category_classifier.pkl",
        "test_predictions": registry / "forensics/test_predictions.json",
        "confusion_matrix": registry / "forensics/confusion_matrix.json",
        "per_class_metrics": registry / "forensics/per_class_metrics.json",
        "evaluation_summary": registry / "forensics/evaluation_summary.json",
        "dataset_manifest": dataset / "manifest.json",
        "feedback_audit": dataset / "feedback_audit.json",
    }


def register_run_artifacts(
    run_id: str,
    candidate_version: str,
    dataset_version: str,
    base_model_version: Optional[str] = None,
    root: Optional[Path] = None,
) -> Dict[str, Any]:
    """Write a manifest binding retained artifacts to their run and dataset."""
    if not SAFE_RUN_PATTERN.fullmatch(run_id):
        raise ValueError("Invalid training run id")
    project_root = root or Path.cwd()
    files: Dict[str, Dict[str, Any]] = {}
    for key, path in _artifact_paths(
        project_root, candidate_version, dataset_version
    ).items():
        if not path.is_file():
            continue
        files[key] = {
            "path": path.relative_to(project_root).as_posix(),
            "sha256": _sha256(path),
            "size_bytes": path.stat().st_size,
        }

    required = {"candidate_model", "evaluation_summary", "dataset_manifest"}
    missing = required - files.keys()
    if missing:
        raise FileNotFoundError(f"Required candidate run artifacts missing: {sorted(missing)}")

    manifest = {
        "run_id": run_id,
        "candidate_version": candidate_version,
        "dataset_version": dataset_version,
        "base_model_version": base_model_version,
        "artifacts": files,
    }
    manifest_path = (
        project_root
        / "apps/ml/models/registry"
        / f"v{candidate_version}"
        / "forensics"
        / RUN_MANIFEST_NAME
    )
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = manifest_path.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    temporary.replace(manifest_path)
    return manifest


def run_artifact_manifest(
    run_id: str, candidate_version: str, root: Optional[Path] = None
) -> Optional[Dict[str, Any]]:
    if not SAFE_RUN_PATTERN.fullmatch(run_id) or not VERSION_PATTERN.fullmatch(
        candidate_version
    ):
        return None
    project_root = root or Path.cwd()
    path = (
        project_root
        / "apps/ml/models/registry"
        / f"v{candidate_version}"
        / "forensics"
        / RUN_MANIFEST_NAME
    )
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if (
        manifest.get("run_id") != run_id
        or manifest.get("candidate_version") != candidate_version
    ):
        return None
    return manifest


def public_artifact_metadata(manifest: Dict[str, Any]) -> list[Dict[str, Any]]:
    """Return safe metadata without filesystem paths."""
    return [
        {
            "key": key,
            "available": True,
            "sha256": metadata["sha256"],
            "sizeBytes": metadata["size_bytes"],
        }
        for key, metadata in sorted(manifest.get("artifacts", {}).items())
    ]


def read_run_artifact(
    run_id: str,
    candidate_version: str,
    artifact_key: str,
    root: Optional[Path] = None,
) -> Optional[Tuple[bytes, str, str]]:
    """Read one fixed artifact only after its run binding and hash are verified."""
    manifest = run_artifact_manifest(run_id, candidate_version, root)
    if not manifest:
        return None
    dataset_version = manifest.get("dataset_version")
    try:
        paths = _artifact_paths(root or Path.cwd(), candidate_version, dataset_version)
    except (TypeError, ValueError):
        return None
    path = paths.get(artifact_key)
    metadata = manifest.get("artifacts", {}).get(artifact_key)
    if path is None or not isinstance(metadata, dict) or not path.is_file():
        return None
    if _sha256(path) != metadata.get("sha256"):
        return None
    media_type = "application/octet-stream" if artifact_key == "candidate_model" else "application/json"
    suffix = ".pkl" if artifact_key == "candidate_model" else ".json"
    return path.read_bytes(), f"{artifact_key}{suffix}", media_type
