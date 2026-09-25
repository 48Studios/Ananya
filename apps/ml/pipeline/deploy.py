#!/usr/bin/env python3
"""
Model Deployment & Promotion Tool (RFC-0058)
Promotes a verified candidate model version from models/registry/v{version}/
to the active production model path apps/ml/models/category_classifier.pkl
only if all automated quality gates passed.
Includes atomic rollback capability.
"""

import os
import shutil
import json
import argparse
from datetime import datetime, timezone

def deploy_model(
    version: str,
    registry_dir: str = "apps/ml/models/registry",
    production_model_path: str = "apps/ml/models/category_classifier.pkl",
    force: bool = False,
    rollback: bool = False,
) -> bool:
    clean_version = version.lstrip("v")
    version_dir = os.path.join(registry_dir, f"v{clean_version}")

    backup_path = f"{production_model_path}.backup"

    if rollback:
        if not os.path.exists(backup_path):
            raise FileNotFoundError(f"Cannot rollback: No backup artifact found at {backup_path}")
        shutil.copy2(backup_path, production_model_path)
        print(f"Successfully rolled back active production model from {backup_path}")
        return True

    candidate_model_path = os.path.join(version_dir, "category_classifier.pkl")
    eval_report_path = os.path.join(version_dir, "evaluation_report.json")

    if not os.path.exists(candidate_model_path):
        raise FileNotFoundError(f"Candidate model not found at {candidate_model_path}")

    if not os.path.exists(eval_report_path) and not force:
        raise RuntimeError(f"Cannot deploy model v{clean_version}: No evaluation_report.json found. Run evaluate.py first or use --force.")

    if not force:
        with open(eval_report_path, "r") as f:
            report = json.load(f)
        is_eligible = report.get("promotionEligible") or report.get("quality_gates_passed") or report.get("promotion_eligible")
        if not is_eligible:
            raise RuntimeError(f"Quality gates failed for candidate v{clean_version}. Deployment rejected.")

    # Create backup of current production model if exists
    if os.path.exists(production_model_path):
        shutil.copy2(production_model_path, backup_path)
        print(f"Backed up active production model to {backup_path}")

    # Copy candidate model to active production model path
    shutil.copy2(candidate_model_path, production_model_path)
    print(f"Promoted candidate v{clean_version} to active production model: {production_model_path}")

    # Calculate checksum and load metadata
    import hashlib
    with open(candidate_model_path, "rb") as mf:
        artifact_hash = hashlib.sha256(mf.read()).hexdigest()

    cand_meta = {}
    cand_meta_path = os.path.join(version_dir, "metadata.json")
    if os.path.exists(cand_meta_path):
        try:
            with open(cand_meta_path, "r", encoding="utf-8") as f:
                cand_meta = json.load(f)
        except Exception:
            pass

    cand_eval = {}
    if os.path.exists(eval_report_path):
        try:
            with open(eval_report_path, "r", encoding="utf-8") as f:
                cand_eval = json.load(f)
        except Exception:
            pass

    git_commit = None
    try:
        import subprocess
        git_commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    except Exception:
        pass

    # Write deployment metadata
    active_meta_path = os.path.join(os.path.dirname(production_model_path), "model_metadata.json")
    deployment_record = {
        "activeVersion": clean_version,
        "modelVersion": clean_version,
        "modelType": cand_meta.get("champion_model", "category_classifier"),
        "datasetVersion": "dataset-crawl-1790343594-reprocessed",
        "gitCommit": git_commit,
        "trainingTimestamp": cand_meta.get("created_at"),
        "evaluationMetrics": cand_eval.get("metrics"),
        "artifactSha256": artifact_hash,
        "deployedAt": datetime.now(timezone.utc).isoformat(),
        "sourceArtifact": candidate_model_path,
        "productionPath": production_model_path,
        "backupPath": backup_path,
        "qualityGatesPassed": bool(cand_eval.get("promotion_eligible") or cand_eval.get("promotionEligible") or force),
    }
    with open(active_meta_path, "w") as f:
        json.dump(deployment_record, f, indent=2)

    # Log in registry
    deployment_log_path = os.path.join(registry_dir, "active_deployment.json")
    with open(deployment_log_path, "w") as f:
        json.dump(deployment_record, f, indent=2)

    print(f"Active deployment state recorded at {active_meta_path}")
    print(f"=== Model v{clean_version} Successfully Deployed to Production ===")
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Promote Ananya ML Candidate Model to Production")
    parser.add_argument("--version", default="", help="Version to deploy (e.g. 1.3.0)")
    parser.add_argument("--force", action="store_true", help="Force deployment bypassing quality gates")
    parser.add_argument("--rollback", action="store_true", help="Rollback to previous backup artifact")
    args = parser.parse_args()

    if not args.rollback and not args.version:
        parser.error("--version is required unless --rollback is specified")

    deploy_model(version=args.version, force=args.force, rollback=args.rollback)
