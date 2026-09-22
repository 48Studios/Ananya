"""
Model registry & dataset snapshot reader (RFC-0058 artefacts).

Read-only view over what the EXISTING training pipeline wrote:

  apps/ml/models/registry/v{version}/category_classifier.pkl
  apps/ml/models/registry/v{version}/metadata.json            (train.py)
  apps/ml/models/registry/v{version}/evaluation_report.json   (evaluate.py)
  apps/ml/models/registry/v{version}/pipeline_summary.json    (run_training.py)
  apps/ml/models/registry/active_deployment.json              (deploy.py)
  apps/ml/models/model_metadata.json                          (deploy.py)
  apps/ml/data/datasets/{datasetVersion}/metadata.json        (build_dataset.py)

Nothing in this module writes, trains, promotes or deletes. Its only job is to
report what exists, so the operator dashboard can answer "which model is
deployed, which candidate is ready, which dataset produced it" without the API
ever touching the filesystem.

**Paths never leave this module.** Every public function returns version names,
counts and checksums; the `path` fields used internally are never serialised into
a response (asserted by the `test_model_registry` suite).
"""

import hashlib
import json
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from ..config import settings

# Repo-root-relative locations, matching the constants used by the pipeline
# modules themselves. They are resolved against the process CWD, which is the
# repository root in dev (`pnpm ml:dev`) and `/app` in the container.
REGISTRY_DIR = os.path.join(settings.model_dir, "registry")
PRODUCTION_MODEL_PATH = settings.category_model_path
ACTIVE_METADATA_PATH = os.path.join(settings.model_dir, "model_metadata.json")
DATASETS_DIR = "apps/ml/data/datasets"
QUARANTINE_PATH = "apps/ml/data/quarantine.json"

VERSION_DIR_PATTERN = re.compile(r"^v(\d+\.\d+\.\d+)$")

# Bounds. The dashboard shows distributions and counts, never raw records.
MAX_VERSIONS = 200
MAX_DATASET_RECORDS_SCANNED = 50_000
MAX_QUARANTINE_RECORDS_SCANNED = 5_000
MAX_DISTRIBUTION_ENTRIES = 50


def repo_root() -> str:
    """
    Absolute repository root.

    The pipeline modules build their paths from the CWD, so every path here is
    relative for exactly the same reason: the training runner changes nothing
    about how the pipeline resolves files.
    """
    return os.getcwd()


def sha256_file(path: str) -> Optional[str]:
    """Checksum of a file, or None when it does not exist / cannot be read."""
    try:
        digest = hashlib.sha256()
        with open(path, "rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()
    except OSError:
        return None


def read_json(path: str) -> Optional[Any]:
    """Parsed JSON, or None when the file is missing or unparseable."""
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return None


def _version_sort_key(version: str) -> tuple:
    parts = version.split(".")
    numbers = []
    for part in parts[:3]:
        try:
            numbers.append(int(part))
        except ValueError:
            numbers.append(0)
    while len(numbers) < 3:
        numbers.append(0)
    return tuple(numbers)


def list_versions() -> List[Dict[str, Any]]:
    """
    Every candidate in the registry, newest first.

    A version directory is reported even when it is incomplete (no artifact, no
    evaluation report): "trained but never evaluated" is a state an operator needs
    to see, not one to hide. `deployable` is computed here rather than in the
    caller so the rule lives in one place.
    """
    if not os.path.isdir(REGISTRY_DIR):
        return []

    versions: List[Dict[str, Any]] = []
    for entry in os.listdir(REGISTRY_DIR):
        match = VERSION_DIR_PATTERN.match(entry)
        if not match:
            continue
        version = match.group(1)
        version_dir = os.path.join(REGISTRY_DIR, entry)
        if not os.path.isdir(version_dir):
            continue

        artifact_path = os.path.join(version_dir, "category_classifier.pkl")
        evaluation = read_json(os.path.join(version_dir, "evaluation_report.json"))
        training = read_json(os.path.join(version_dir, "metadata.json"))
        summary = read_json(os.path.join(version_dir, "pipeline_summary.json"))
        artifact_exists = os.path.exists(artifact_path)

        versions.append(
            {
                "version": version,
                "createdAt": _created_at(summary, training, evaluation),
                "artifactExists": artifact_exists,
                "artifactSha256": sha256_file(artifact_path)
                if artifact_exists
                else None,
                "artifactSizeBytes": _file_size(artifact_path),
                "championModel": (training or {}).get("championModel"),
                "evaluation": _public_evaluation(evaluation),
                "datasetVersion": (summary or {}).get("datasetVersion"),
                "deployable": bool(
                    artifact_exists
                    and evaluation
                    and evaluation.get("promotionEligible")
                ),
            }
        )

    versions.sort(key=lambda item: _version_sort_key(item["version"]), reverse=True)
    return versions[:MAX_VERSIONS]


def _created_at(*candidates: Any) -> Optional[str]:
    """
    The first timestamp the registry files recorded.

    Only timestamps are considered. An earlier version of this function accepted any
    non-empty string and was passed the version DIRECTORY, which put a filesystem
    path into a response field named `createdAt` — the exact class of leak the
    registry reader exists to avoid. Nothing but a timestamp is accepted now, and a
    version whose files carry none reports `null`.
    """
    for value in candidates:
        if not isinstance(value, dict):
            continue
        for key in ("createdAt", "evaluatedAt", "timestamp", "trainedAt"):
            found = value.get(key)
            if isinstance(found, str) and _looks_like_timestamp(found):
                return found
    return None


def _looks_like_timestamp(value: str) -> bool:
    """A timestamp, not a path, a version or a free-form label."""
    if len(value) < 10 or value.startswith("/") or os.sep in value:
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


def _file_size(path: str) -> Optional[int]:
    try:
        return os.path.getsize(path)
    except OSError:
        return None


def _public_evaluation(evaluation: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    The evaluation report as the pipeline wrote it, minus the validation path.

    `evaluation.py` records `validationSource`, which is a filesystem path. It is
    dropped here rather than filtered in the API, so a path cannot leak through a
    future caller that forgets to strip it.
    """
    if not evaluation:
        return None
    return {key: value for key, value in evaluation.items() if key != "validationSource"}


def active_deployment() -> Dict[str, Any]:
    """
    What the deployment tool recorded as production, plus what is actually there.

    `deployedVersion` is the tool's claim (from `model_metadata.json`).
    `artifactVersion` is the version whose registry artifact matches the checksum of
    the production file, which is what the process will load. The two disagree after
    a rollback, because `deploy.py` restores the artifact without rewriting the
    sidecar — reporting only the claim would state the wrong model, so both are
    returned and the dashboard shows the checksum-derived one.
    """
    record = read_json(ACTIVE_METADATA_PATH) or read_json(
        os.path.join(REGISTRY_DIR, "active_deployment.json")
    )
    backup_path = f"{PRODUCTION_MODEL_PATH}.backup"
    production_sha = sha256_file(PRODUCTION_MODEL_PATH)
    recorded_version = (record or {}).get("activeVersion")
    resolved_version = resolve_version_for_checksum(production_sha)
    return {
        "deployedVersion": recorded_version,
        "artifactVersion": resolved_version or recorded_version,
        "artifactVersionSource": "CHECKSUM"
        if resolved_version
        else ("DEPLOYMENT_METADATA" if recorded_version else None),
        "deployedAt": (record or {}).get("deployedAt"),
        "qualityGatesPassed": (record or {}).get("qualityGatesPassed"),
        "artifactSha256": production_sha,
        "artifactSizeBytes": _file_size(PRODUCTION_MODEL_PATH),
        "rollbackAvailable": os.path.exists(backup_path),
        "backupSha256": sha256_file(backup_path),
    }


def resolve_version_for_checksum(checksum: Optional[str]) -> Optional[str]:
    """
    Registry version whose artifact has this checksum.

    This is the single honest mapping from "the bytes being served" to "which
    model that is". Returns None when nothing matches (an artifact built outside the
    registry, or a checksum that could not be read).
    """
    if not checksum:
        return None
    for entry in list_versions():
        if entry.get("artifactSha256") == checksum:
            return entry.get("version")
    return None


def next_candidate_version() -> str:
    """
    Allocates the next registry version (patch increment of the highest one).

    Versions are allocated HERE, not by the API, because this is the process that
    owns the registry directory — and `train.py` refuses to run twice into the
    same version directory without overwriting it, so a collision would silently
    destroy a candidate.
    """
    highest = (0, 0, 0)
    for entry in os.listdir(REGISTRY_DIR) if os.path.isdir(REGISTRY_DIR) else []:
        match = VERSION_DIR_PATTERN.match(entry)
        if match and os.path.isdir(os.path.join(REGISTRY_DIR, entry)):
            highest = max(highest, _version_sort_key(match.group(1)))
    return f"{highest[0]}.{highest[1]}.{highest[2] + 1}"


def version_detail(version: str) -> Optional[Dict[str, Any]]:
    for candidate in list_versions():
        if candidate["version"] == version:
            return candidate
    return None


def version_dir(version: str) -> str:
    return os.path.join(REGISTRY_DIR, f"v{version}")


def dataset_snapshot(dataset_version: str) -> Optional[Dict[str, Any]]:
    """
    Metadata for one built snapshot, plus a fingerprint over its own files.

    The fingerprint is computed from the snapshot contents (`metadata.json`,
    `train.json`, `val.json`) in a fixed order, so two builds of the same data
    produce the same value and a changed corpus produces a different one. It is a
    content identity for "which dataset produced this model", and it never exposes
    the records themselves.
    """
    if not dataset_version or os.sep in dataset_version or ".." in dataset_version:
        return None
    snapshot_dir = os.path.join(DATASETS_DIR, dataset_version)
    if not os.path.isdir(snapshot_dir):
        return None

    metadata = read_json(os.path.join(snapshot_dir, "metadata.json"))
    if not isinstance(metadata, dict):
        return None

    fingerprint = hashlib.sha256()
    for name in ("metadata.json", "train.json", "val.json"):
        path = os.path.join(snapshot_dir, name)
        fingerprint.update(name.encode("utf-8"))
        digest = sha256_file(path)
        fingerprint.update((digest or "missing").encode("utf-8"))

    return {
        "datasetVersion": metadata.get("datasetVersion", dataset_version),
        "createdAt": metadata.get("createdAt"),
        "fingerprint": fingerprint.hexdigest(),
        "totalSourceRecords": metadata.get("totalSourceRecords"),
        "totalExpandedExamples": metadata.get("totalExpandedExamples"),
        "trainSize": metadata.get("trainSize"),
        "valSize": metadata.get("valSize"),
        "duplicatePairsCount": metadata.get("duplicatePairsCount"),
        "distinctBaseFamilies": metadata.get("distinctBaseFamilies"),
        "dataLeakageVerified": metadata.get("dataLeakageVerified"),
        "overlapCount": metadata.get("overlapCount"),
        "categories": metadata.get("categories") or [],
    }


def list_dataset_snapshots() -> List[Dict[str, Any]]:
    """
    Snapshots newest first, by the date embedded in the version string.

    The version is the pipeline's own identity (`components-YYYY-MM-DD-vX.Y.Z`),
    not a filesystem mtime, so the ordering survives a copy or a checkout.
    """
    if not os.path.isdir(DATASETS_DIR):
        return []
    names = [
        entry
        for entry in os.listdir(DATASETS_DIR)
        if os.path.isdir(os.path.join(DATASETS_DIR, entry))
    ]
    names.sort(reverse=True)
    snapshots = []
    for name in names[:MAX_VERSIONS]:
        snapshot = dataset_snapshot(name)
        if snapshot:
            snapshots.append(snapshot)
    return snapshots


def current_dataset() -> Optional[Dict[str, Any]]:
    """The most recent snapshot the pipeline built, or None when none exists."""
    snapshots = list_dataset_snapshots()
    return snapshots[0] if snapshots else None


def quarantine_summary() -> Dict[str, Any]:
    """
    Counts of quarantined records grouped by the rejection reason the validator
    recorded, plus the quarantine lifecycle status.

    Only counts and reason codes are returned — never a quarantined payload,
    which contains full component records.
    """
    records = read_json(QUARANTINE_PATH)
    if not isinstance(records, list):
        # `available: false` distinguishes "the quarantine file does not exist"
        # from "it exists and is empty". Without it the dashboard would show a
        # measured zero for a dataset nobody has validated yet.
        return {
            "available": False,
            "total": 0,
            "pending": 0,
            "verified": 0,
            "rejected": 0,
            "byReason": [],
            "truncated": False,
        }

    scanned = records[:MAX_QUARANTINE_RECORDS_SCANNED]
    by_reason: Dict[str, int] = {}
    statuses = {"PENDING": 0, "VERIFIED": 0, "REJECTED": 0}
    for record in scanned:
        if not isinstance(record, dict):
            continue
        status = str(record.get("status") or "PENDING").upper()
        if status in statuses:
            statuses[status] += 1
        reasons = record.get("rejectionReasons") or []
        if isinstance(reasons, str):
            reasons = [reasons]
        for reason in reasons:
            code = str(reason).split(":")[0].strip() or "UNKNOWN"
            by_reason[code] = by_reason.get(code, 0) + 1

    return {
        "available": True,
        "total": len(records),
        "pending": statuses["PENDING"],
        "verified": statuses["VERIFIED"],
        "rejected": statuses["REJECTED"],
        "byReason": sorted(
            ({"reason": key, "count": value} for key, value in by_reason.items()),
            key=lambda item: (-item["count"], item["reason"]),
        )[:MAX_DISTRIBUTION_ENTRIES],
        "truncated": len(records) > len(scanned),
    }


def validated_record_distribution() -> Dict[str, Any]:
    """
    Category / manufacturer / MPN-family distribution over the VALIDATED corpus.

    Computed from `validated_records.json` — the file `validate.py` writes and
    `build_dataset.py` consumes — so the numbers describe the corpus the next
    training run would actually see. Bounded to the first N records and reported as
    `truncated` when the bound bites, rather than silently under-counting.
    """
    records = read_json("apps/ml/data/validated_records.json")
    if not isinstance(records, list):
        return {
            "recordCount": 0,
            "distinctManufacturers": 0,
            "distinctBaseFamilies": 0,
            "categories": [],
            "manufacturers": [],
            "truncated": False,
        }

    scanned = records[:MAX_DATASET_RECORDS_SCANNED]
    categories: Dict[str, int] = {}
    manufacturers: Dict[str, int] = {}
    families = set()
    for record in scanned:
        if not isinstance(record, dict):
            continue
        category = str(record.get("category") or "UNKNOWN")
        manufacturer = str(record.get("manufacturer") or "UNKNOWN")
        categories[category] = categories.get(category, 0) + 1
        manufacturers[manufacturer] = manufacturers.get(manufacturer, 0) + 1
        family = record.get("series_family") or record.get("base_mpn")
        if family:
            families.add(str(family))

    def top(counts: Dict[str, int]) -> List[Dict[str, Any]]:
        return sorted(
            ({"name": key, "count": value} for key, value in counts.items()),
            key=lambda item: (-item["count"], item["name"]),
        )[:MAX_DISTRIBUTION_ENTRIES]

    return {
        "recordCount": len(records),
        "distinctManufacturers": len(manufacturers),
        "distinctBaseFamilies": len(families),
        "categories": top(categories),
        "manufacturers": top(manufacturers),
        "truncated": len(records) > len(scanned),
    }


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
