#!/usr/bin/env python3
"""
Ananya ML Training & Dataset Management CLI (`ananya-ml`).

Composable CLI for local development ML operations:
- ananya-ml collect
- ananya-ml data inspect
- ananya-ml data export
- ananya-ml data normalize
- ananya-ml data validate
- ananya-ml data dedupe
- ananya-ml dataset build
- ananya-ml dataset split
- ananya-ml train
- ananya-ml evaluate
- ananya-ml experiment
"""

import sys
import os
import json
import argparse
from pathlib import Path
from typing import List, Dict, Any, Optional

from .config import settings
from .schemas.product import ProductRecord
from .collectors.ananya_db import AnanyaDbCollector
from .collectors.catalog import ManufacturerCatalogCollector
from .processors.validation import DataValidationProcessor
from .processors.normalization import NormalizationProcessor
from .processors.deduplication import DeduplicationProcessor
from .generators.classification import ClassificationDatasetGenerator
from .datasets.splitter import DeterministicDatasetSplitter
from .trainers.classifier import CategoryClassifierTrainer
from .evaluation.evaluator import ModelEvaluator
from .utils.progress import LiveProgress


def cmd_data_inspect(args: argparse.Namespace) -> None:
    """Inspects a dataset JSON file or directory and reports counts, domains, and provenance."""
    path = Path(args.path)
    if not path.exists():
        print(f"Error: Path '{args.path}' does not exist.")
        sys.exit(1)

    files_to_check = [path] if path.is_file() else list(path.glob("*.json"))
    print("=" * 65)
    print(" ANANYA ML DATASET INSPECTION")
    print("=" * 65)

    for f in files_to_check:
        if f.name.endswith(".manifest.json"):
            continue
        try:
            with open(f, "r", encoding="utf-8") as fp:
                data = json.load(fp)
            items = data if isinstance(data, list) else data.get("records", data.get("dataset", []))
            print(f"\nFile: {f.name} ({len(items)} records)")

            domains: Dict[str, int] = {}
            categories: Dict[str, int] = {}
            verified = 0

            for item in items:
                if isinstance(item, dict):
                    dom = str(item.get("domain", "UNKNOWN"))
                    domains[dom] = domains.get(dom, 0) + 1
                    cat = str(item.get("category", "Unknown"))
                    categories[cat] = categories.get(cat, 0) + 1
                    prov = item.get("provenance", {})
                    if isinstance(prov, dict) and prov.get("verification_status") in ("VERIFIED", None):
                        verified += 1

            print(f"  Verified Provenance: {verified}/{len(items)}")
            print(f"  Domains: {domains}")
            print(f"  Top Categories: {dict(list(categories.items())[:5])}")

        except Exception as e:
            print(f"  Error reading {f.name}: {e}")

    print("=" * 65)


def cmd_data_export(args: argparse.Namespace) -> None:
    """Creates a training snapshot from Ananya DB or an export file."""
    collector = AnanyaDbCollector(database_url=args.database_url or settings.database_url)
    records = collector.collect(snapshot_file=args.snapshot_file, feedback_file=args.feedback_file)

    out_path = args.output or str(settings.raw_data_dir / "ananya_db_snapshot.json")
    manifest = collector.persist_raw(records, output_path=out_path, dataset_name="ananya_db_export")
    print(f"Exported {len(records)} records to {out_path}")
    print(f"Manifest written to {Path(out_path).with_suffix('.manifest.json')}")


def cmd_data_validate(args: argparse.Namespace) -> None:
    """Validates records, detects cross-source conflicts, and segregates quarantine."""
    with open(args.input, "r", encoding="utf-8") as f:
        raw = json.load(f)

    records = [ProductRecord(**r) if isinstance(r, dict) and "sku" in r else r for r in raw]
    # Filter to only ProductRecord instances
    prod_records = [r for r in records if isinstance(r, ProductRecord)]

    quiet = getattr(args, "quiet", False)
    verbose = getattr(args, "verbose", False)
    progress = LiveProgress(quiet=quiet, verbose=verbose)
    progress.start_stage("Validating", total=len(prod_records))

    passed, flagged = DataValidationProcessor.detect_cross_source_conflicts(prod_records)
    progress.finish_stage(f"Validating       {len(passed):,}/{len(prod_records):,}")

    out_valid = args.output_valid or str(settings.cleaned_data_dir / "validated_records.json")
    out_quar = args.output_quarantine or str(settings.cleaned_data_dir / "quarantine.json")

    Path(out_valid).parent.mkdir(parents=True, exist_ok=True)
    with open(out_valid, "w", encoding="utf-8") as f:
        json.dump([r.model_dump() for r in passed], f, indent=2, default=str)

    with open(out_quar, "w", encoding="utf-8") as f:
        json.dump(
            [{"record": r.model_dump(), "reasons": a.reasons, "disposition": a.disposition} for r, a in flagged],
            f,
            indent=2,
            default=str,
        )

    if not quiet:
        print(f"Validation complete: {len(passed):,} passed, {len(flagged):,} quarantined.")


def cmd_data_normalize(args: argparse.Namespace) -> None:
    """Normalizes categories, manufacturers, text, and units."""
    with open(args.input, "r", encoding="utf-8") as f:
        raw = json.load(f)

    records = [ProductRecord(**r) for r in raw if isinstance(r, dict) and "sku" in r]
    quiet = getattr(args, "quiet", False)
    verbose = getattr(args, "verbose", False)
    progress = LiveProgress(quiet=quiet, verbose=verbose)
    progress.start_stage("Normalizing", total=len(records))

    processor = NormalizationProcessor()
    normalized, _ = processor.process_batch(records)
    progress.finish_stage(f"Normalizing      {len(normalized):,}/{len(records):,}")

    out_path = args.output or str(settings.normalized_data_dir / "normalized_records.json")
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump([r.model_dump() for r in normalized], f, indent=2, default=str)

    if not quiet:
        print(f"Normalized {len(normalized):,} records saved to {out_path}")


def cmd_data_dedupe(args: argparse.Namespace) -> None:
    """Runs deduplication with physical value guards."""
    with open(args.input, "r", encoding="utf-8") as f:
        raw = json.load(f)

    records = [ProductRecord(**r) for r in raw if isinstance(r, dict) and "sku" in r]
    quiet = getattr(args, "quiet", False)
    verbose = getattr(args, "verbose", False)
    progress = LiveProgress(quiet=quiet, verbose=verbose)
    progress.start_stage("Deduplicating", total=len(records))

    deduper = DeduplicationProcessor()
    unique, conflicts = deduper.deduplicate(records)
    progress.finish_stage(f"Deduplicating    {len(unique):,}/{len(records):,}")

    out_path = args.output or str(settings.cleaned_data_dir / "deduped_records.json")
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump([r.model_dump() for r in unique], f, indent=2, default=str)

    if not quiet:
        print(f"Deduplication complete: {len(unique):,} unique records, {len(conflicts):,} value guard conflicts preserved.")


def cmd_dataset_build(args: argparse.Namespace) -> None:
    """Builds a task-specific dataset (e.g. classification) from normalized records."""
    with open(args.input, "r", encoding="utf-8") as f:
        raw = json.load(f)

    records = [ProductRecord(**r) for r in raw if isinstance(r, dict) and "sku" in r]
    quiet = getattr(args, "quiet", False)
    verbose = getattr(args, "verbose", False)
    progress = LiveProgress(quiet=quiet, verbose=verbose)
    progress.start_stage("Generating tasks", total=len(records))
    generator = ClassificationDatasetGenerator()
    examples = generator.generate(records)
    progress.finish_stage(f"Generating tasks  {len(examples):,} examples")

    out_path = args.output or str(settings.training_data_dir / "classification_dataset.json")
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump([e.model_dump() for e in examples], f, indent=2, default=str)

    if not quiet:
        print(f"Built task dataset with {len(examples):,} examples at {out_path}")


from .coverage import (
    DEFAULT_COVERAGE_TARGETS,
    calculate_category_coverage,
    generate_collection_plan,
    format_plan_table,
    CategoryQueryStrategy,
    CollectionPlan,
)


def resolve_coverage_dataset_path(
    version: Optional[str] = None,
    path: Optional[str] = None,
) -> Path:
    """Resolves the path to unique_records.json using settings.training_data_dir or explicit path."""
    if path:
        dataset_path = Path(path)
        if dataset_path.is_dir():
            dataset_path = dataset_path / "unique_records.json"
        return dataset_path
    elif version:
        return Path(settings.training_data_dir) / version / "unique_records.json"
    else:
        raise ValueError("Either --version or --path must be supplied.")


def calculate_data_coverage(
    records: List[Dict[str, Any]],
    targets: Optional[Dict[str, int]] = None,
) -> List[Dict[str, Any]]:
    """Calculates category coverage and deficits for PRODUCT records with deduplication."""
    coverages = calculate_category_coverage(records, targets=targets)
    return [c.to_dict() for c in coverages]


def cmd_data_coverage(args: argparse.Namespace) -> List[Dict[str, Any]]:
    """Report category coverage and deficits.

    Either --version (dataset name) or --path (explicit path to unique_records.json) must be supplied.
    Optional --targets JSON maps canonical category names to desired target counts.
    Optional --output-json writes a machine‑readable JSON report.
    """
    try:
        dataset_path = resolve_coverage_dataset_path(
            version=getattr(args, "version", None),
            path=getattr(args, "path", None),
        )
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)

    if not dataset_path.exists():
        print(f"Error: unique_records.json not found at {dataset_path}")
        sys.exit(1)

    # Load records
    with open(dataset_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    records = data if isinstance(data, list) else data.get("records", data.get("dataset", []))

    # Default target mapping (canonical categories -> target count)
    targets = dict(DEFAULT_COVERAGE_TARGETS)
    if getattr(args, "targets", None):
        if isinstance(args.targets, dict):
            custom_targets = args.targets
        else:
            with open(args.targets, "r", encoding="utf-8") as tf:
                custom_targets = json.load(tf)
        targets.update(custom_targets)

    report = calculate_data_coverage(records, targets=targets)

    # Human‑readable table
    print("Category Coverage Report")
    print("=" * 30)
    header = f"{'Category':<30} {'Current':>8} {'Target':>8} {'Deficit':>8}"
    print(header)
    print("-" * len(header))
    for r in report:
        print(f"{r['category']:<30} {r['current']:>8} {r['target']:>8} {r['deficit']:>8}")
    print("=" * 30)

    # Optional JSON output
    if getattr(args, "output_json", None):
        out_path = Path(args.output_json)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as jf:
            json.dump({"report": report}, jf, indent=2)
        print(f"JSON report written to {out_path}")

    return report


def cmd_data_plan(args: argparse.Namespace) -> CollectionPlan:
    """Report category coverage and generate prioritized collection plan."""
    version = getattr(args, "version", None)
    path = getattr(args, "path", None)

    try:
        dataset_path = resolve_coverage_dataset_path(version=version, path=path)
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)

    if not dataset_path.exists():
        print(f"Error: unique_records.json not found at {dataset_path}")
        sys.exit(1)

    # Load records
    with open(dataset_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    records = data if isinstance(data, list) else data.get("records", data.get("dataset", []))

    # Optional custom targets
    targets = dict(DEFAULT_COVERAGE_TARGETS)
    if getattr(args, "targets", None):
        if isinstance(args.targets, dict):
            custom_targets = args.targets
        else:
            with open(args.targets, "r", encoding="utf-8") as tf:
                custom_targets = json.load(tf)
        targets.update(custom_targets)

    budget = getattr(args, "budget", 1000) or 1000
    config_path = getattr(args, "config", None) or str(Path(settings.base_dir) / "config" / "sources.yaml")
    query_strategy = CategoryQueryStrategy(config_path=config_path)

    plan = generate_collection_plan(
        records=records,
        targets=targets,
        total_budget=budget,
        dataset_version=version,
        dataset_path=str(dataset_path),
        query_strategy=query_strategy,
    )

    print(format_plan_table(plan))

    if getattr(args, "output_json", None):
        out_path = Path(args.output_json)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as jf:
            json.dump(plan.to_dict(), jf, indent=2)
        print(f"\nCollection plan JSON written to {out_path}")

    return plan


def cmd_dataset_split(args: argparse.Namespace) -> None:
    """Splits a dataset deterministically into train/val/test with zero group leakage."""
    with open(args.input, "r", encoding="utf-8") as f:
        data = json.load(f)

    quiet = getattr(args, "quiet", False)
    verbose = getattr(args, "verbose", False)
    progress = LiveProgress(quiet=quiet, verbose=verbose)
    progress.start_stage("Splitting", total=None)

    splitter = DeterministicDatasetSplitter(
        train_ratio=args.train_ratio,
        val_ratio=args.val_ratio,
        test_ratio=args.test_ratio,
        random_seed=args.seed,
    )
    out_dir = args.output_dir or str(settings.training_data_dir / f"snapshot-{args.version}")
    manifest = splitter.persist_splits(
        data,
        output_dir=out_dir,
        dataset_name=args.name or "training_snapshot",
        version=args.version,
    )
    progress.finish_stage(f"Splitting        train {int(args.train_ratio*100)}% | val {int(args.val_ratio*100)}% | test {int(args.test_ratio*100)}%")

    if not quiet:
        print(f"Dataset split complete into {out_dir}:")
        print(f"  Train: {manifest.split_counts.train:,}")
        print(f"  Val:   {manifest.split_counts.validation:,}")
        print(f"  Test:  {manifest.split_counts.test:,}")
        print(f"  Zero Leakage Verified: {manifest.zero_leakage_verified}")


def cmd_train(args: argparse.Namespace) -> None:
    """Trains candidate models, selects champion, and writes to model registry."""
    if args.legacy:
        from apps.ml.pipeline.run_training import run_independent_training_pipeline
        run_independent_training_pipeline(version=args.version, auto_deploy=not args.no_deploy)
        return

    try:
        from .tui import emit_event, JobStartedEvent
        emit_event(JobStartedEvent(job_type="TRAINING", model_name=f"category-v{args.version}"))
    except Exception:
        pass

    with open(args.train_path, "r", encoding="utf-8") as f:
        train_samples = json.load(f)

    val_samples = []
    if args.val_path and os.path.exists(args.val_path):
        with open(args.val_path, "r", encoding="utf-8") as f:
            val_samples = json.load(f)

    quiet = getattr(args, "quiet", False)
    verbose = getattr(args, "verbose", False)
    progress = LiveProgress(quiet=quiet, verbose=verbose)

    trainer = CategoryClassifierTrainer(random_seed=args.seed)
    out_dir = args.output_dir or f"{settings.registry_dir}/v{args.version}"
    meta = trainer.train(train_samples, val_samples=val_samples, version=args.version, output_dir=out_dir, progress=progress)

    if not quiet:
        print(f"Champion model trained: {meta['champion_model']}")
        print(f"Validation Accuracy: {meta['metrics']['val_accuracy']*100:.1f}%")
        print(f"Artifacts saved to {out_dir}")


def cmd_evaluate(args: argparse.Namespace) -> None:
    """Evaluates candidate model performance against quality gates and active baseline."""
    import pickle
    model_path = args.model_path or f"{settings.registry_dir}/v{args.version}/category_classifier.pkl"
    if not os.path.exists(model_path):
        print(f"Error: Candidate model not found at {model_path}")
        sys.exit(1)

    try:
        from .tui import emit_event, JobStartedEvent
        emit_event(JobStartedEvent(job_type="EVALUATION", model_name=f"category-v{args.version}"))
    except Exception:
        pass

    with open(model_path, "rb") as f:
        model = pickle.load(f)

    with open(args.val_path, "r", encoding="utf-8") as f:
        val_samples = json.load(f)

    quiet = getattr(args, "quiet", False)
    verbose = getattr(args, "verbose", False)
    progress = LiveProgress(quiet=quiet, verbose=verbose)

    evaluator = ModelEvaluator(active_model_path=args.active_model)
    out_dir = args.output_dir or f"{settings.registry_dir}/v{args.version}"
    report = evaluator.evaluate(model, val_samples, candidate_version=args.version, output_dir=out_dir, progress=progress)

    if not quiet:
        print(evaluator.render_markdown(report))


def cmd_experiment(args: argparse.Namespace) -> None:
    """Lists registered model versions and experiment metadata."""
    reg_path = Path(settings.registry_dir)
    print("=" * 65)
    print(f" ANANYA ML MODEL REGISTRY & EXPERIMENTS ({reg_path})")
    print("=" * 65)
    if not reg_path.exists():
        print("No registry directory found.")
        return

    versions = sorted([d.name for d in reg_path.iterdir() if d.is_dir() and d.name.startswith("v")])
    for v in versions:
        meta_file = reg_path / v / "metadata.json"
        eval_file = reg_path / v / "evaluation_report.json"
        has_artifact = (reg_path / v / "category_classifier.pkl").exists()

        status_str = f"[{v}] Artifact: {'YES' if has_artifact else 'NO'}"
        if eval_file.exists():
            with open(eval_file, "r") as f:
                ev = json.load(f)
            acc = ev.get("metrics", {}).get("candidate_top1_accuracy") or ev.get("metrics", {}).get("candidateTop1Accuracy")
            status_str += f" | Val Acc: {acc*100:.1f}%" if acc else ""
            status_str += f" | Eligible: {ev.get('promotion_eligible', ev.get('promotionEligible'))}"

        print(status_str)
    print("=" * 65)


def cmd_collect(args: argparse.Namespace) -> None:
    """Runs autonomous data collection across registered sources."""
    import time
    from datetime import datetime, timezone
    from .collectors.web_collector import AutonomousWebCollector
    from .collectors.web.policy import CrawlPolicyManager

    policy = CrawlPolicyManager(custom_rate_limit=args.rate_limit)
    collector = AutonomousWebCollector(
        registry_path=args.config,
        policy_manager=policy,
    )

    resume_flag = getattr(args, "resume", True)
    from_raw_flag = getattr(args, "from_raw", False)
    document_workers = args.document_workers if args.document_workers is not None else args.workers

    def run_once():
        if from_raw_flag:
            return collector.rebuild_from_raw(
                source_id=args.source,
                quiet=getattr(args, "quiet", False),
                verbose=getattr(args, "verbose", False),
            )
        records = collector.collect(
            source_id=args.source,
            domain=args.domain,
            max_pages=args.max_pages,
            max_files=args.max_files,
            dry_run=args.dry_run,
            resume=resume_flag,
            quiet=getattr(args, "quiet", False),
            verbose=getattr(args, "verbose", False),
            document_workers=document_workers,
            category_aware=getattr(args, "category_aware", False),
            plan_version=getattr(args, "plan_version", None),
            budget=getattr(args, "budget", None),
        )
        return records

    if getattr(args, "continuous", False):
        interval = getattr(args, "interval", 3600)
        print(f"Starting continuous collection mode (polling every {interval}s). Press Ctrl+C to stop.")
        cycle_num = 1
        try:
            while True:
                ts = datetime.now(timezone.utc).isoformat()
                print(f"\n[Cycle Started: {ts}]")
                try:
                    from .tui import emit_event, ContinuousCycleEvent
                    emit_event(
                        ContinuousCycleEvent(
                            cycle_number=cycle_num,
                            interval_seconds=interval,
                            next_run_ts=time.time() + interval,
                            last_run_status="running",
                        )
                    )
                except Exception:
                    pass

                run_once()

                try:
                    from .tui import emit_event, ContinuousCycleEvent
                    emit_event(
                        ContinuousCycleEvent(
                            cycle_number=cycle_num,
                            interval_seconds=interval,
                            next_run_ts=time.time() + interval,
                            last_run_status="completed",
                        )
                    )
                except Exception:
                    pass

                print(f"Cycle finished. Sleeping for {interval}s...")
                cycle_num += 1
                time.sleep(interval)
        except KeyboardInterrupt:
            print("\nContinuous collection stopped by user.")
    else:
        run_once()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ananya-ml",
        description="Ananya ERP ML Training & Data Workspace CLI",
    )
    parser.add_argument("-q", "--quiet", action="store_true", default=False, help="Suppress live progress output")
    parser.add_argument("-v", "--verbose", action="store_true", default=False, help="Verbose output mode")
    parser.add_argument("--tui", dest="tui", action="store_true", default=None, help="Enable Rich live TUI dashboard")
    parser.add_argument("--no-tui", dest="tui", action="store_false", help="Disable Rich TUI dashboard (use standard logging)")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    def add_common_flags(p: argparse.ArgumentParser) -> None:
        p.add_argument("-q", "--quiet", action="store_true", default=argparse.SUPPRESS, help="Suppress live progress output")
        p.add_argument("-v", "--verbose", action="store_true", default=argparse.SUPPRESS, help="Verbose output mode")
        p.add_argument("--tui", dest="tui", action="store_true", default=argparse.SUPPRESS, help="Enable Rich live TUI dashboard")
        p.add_argument("--no-tui", dest="tui", action="store_false", default=argparse.SUPPRESS, help="Disable Rich TUI dashboard")

    # collect
    def setup_collect_args(p: argparse.ArgumentParser) -> None:
        p.add_argument("--source", help="Collect only from specified source ID")
        p.add_argument("--domain", help="Filter by specific domain")
        p.add_argument("--all", action="store_true", help="Collect from all enabled sources")
        p.add_argument("--resume", action="store_true", default=True, help="Resume previous collection state (default: True)")
        p.add_argument("--no-resume", dest="resume", action="store_false", help="Do not resume; recrawl from scratch")
        p.add_argument("--dry-run", action="store_true", help="Discover URLs without downloading or modifying state")
        p.add_argument("--from-raw", action="store_true", default=False, help="Rebuild training dataset purely from already-downloaded local raw files without network recrawling")
        p.add_argument("--max-pages", type=int, help="Maximum HTML pages to crawl per source")
        p.add_argument("--max-files", type=int, help="Maximum total files/documents to download per source")
        p.add_argument("--workers", type=int, default=1, help="Number of worker threads (default: 1 conservative)")
        p.add_argument(
            "--document-workers",
            type=int,
            default=None,
            help="Concurrent document download/parse workers (default: falls back to --workers; per-domain rate limits are always enforced)",
        )
        p.add_argument("--rate-limit", type=float, help="Override requests per second rate limit")
        p.add_argument("--continuous", action="store_true", help="Run continuous periodic collection loop")
        p.add_argument("--interval", type=int, default=3600, help="Continuous collection cycle interval in seconds (default: 3600)")
        p.add_argument("--config", help="Path to custom sources.yaml configuration")
        p.add_argument("--category-aware", action="store_true", default=False, help="Enable category-aware collection prioritizing deficit categories")
        p.add_argument("--plan-version", help="Baseline dataset version to compute coverage deficits from (defaults to latest)")
        p.add_argument("--budget", type=int, default=1000, help="Total collection budget across categories (default: 1000)")
        add_common_flags(p)
        p.set_defaults(func=cmd_collect)

    p_collect = subparsers.add_parser("collect", help="Autonomous data collection from approved public sources")
    setup_collect_args(p_collect)

    p_data_collect = subparsers.add_parser("data-collect", help="Alias for collect")
    setup_collect_args(p_data_collect)

    # data inspect
    p_inspect = subparsers.add_parser("data-inspect", help="Inspect dataset files or directories")
    p_inspect.add_argument("path", help="Path to JSON dataset file or directory")
    add_common_flags(p_inspect)
    p_inspect.set_defaults(func=cmd_data_inspect)

    # data export
    p_export = subparsers.add_parser("data-export", help="Export dataset from Ananya DB or files")
    p_export.add_argument("--snapshot-file", help="Path to DB snapshot JSON file")
    p_export.add_argument("--feedback-file", help="Path to human feedback export JSON")
    p_export.add_argument("--database-url", help="Database connection URL")
    p_export.add_argument("--output", help="Output raw dataset path")
    add_common_flags(p_export)
    p_export.set_defaults(func=cmd_data_export)

    # data validate
    p_val = subparsers.add_parser("data-validate", help="Validate records and isolate quarantine")
    p_val.add_argument("--input", required=True, help="Input JSON records file")
    p_val.add_argument("--output-valid", help="Output validated records path")
    p_val.add_argument("--output-quarantine", help="Output quarantine records path")
    add_common_flags(p_val)
    p_val.set_defaults(func=cmd_data_validate)

    # data normalize
    p_norm = subparsers.add_parser("data-normalize", help="Normalize categories, manufacturers, text, units")
    p_norm.add_argument("--input", required=True, help="Input JSON records file")
    p_norm.add_argument("--output", help="Output normalized dataset path")
    add_common_flags(p_norm)
    p_norm.set_defaults(func=cmd_data_normalize)

    # data dedupe
    p_dedupe = subparsers.add_parser("data-dedupe", help="Deduplicate records with value guards")
    p_dedupe.add_argument("--input", required=True, help="Input JSON records file")
    p_dedupe.add_argument("--output", help="Output deduped dataset path")
    add_common_flags(p_dedupe)
    p_dedupe.set_defaults(func=cmd_data_dedupe)
    # data coverage
    p_coverage = subparsers.add_parser("data-coverage", help="Report category coverage and deficits")
    version_group = p_coverage.add_mutually_exclusive_group(required=False)
    version_group.add_argument("--version", help="Dataset version name (e.g., dataset-crawl-1790258177)")
    version_group.add_argument("--path", help="Path to unique_records.json file or its containing directory")
    p_coverage.add_argument("--targets", help="JSON file mapping category -> target count")
    p_coverage.add_argument("--output-json", help="Path to write machine‑readable JSON report")
    add_common_flags(p_coverage)
    p_coverage.set_defaults(func=cmd_data_coverage)

    # data plan
    p_plan = subparsers.add_parser("data-plan", help="Generate category-aware collection plan based on deficits")
    plan_version_group = p_plan.add_mutually_exclusive_group(required=False)
    plan_version_group.add_argument("--version", help="Dataset version name (e.g., dataset-crawl-1790258177)")
    plan_version_group.add_argument("--path", help="Path to unique_records.json file or its containing directory")
    p_plan.add_argument("--budget", type=int, default=1000, help="Total collection budget (default: 1000)")
    p_plan.add_argument("--targets", help="JSON file mapping category -> target count")
    p_plan.add_argument("--output-json", help="Path to write machine-readable JSON plan")
    p_plan.add_argument("--config", help="Path to custom sources.yaml configuration")
    add_common_flags(p_plan)
    p_plan.set_defaults(func=cmd_data_plan)

    # dataset build
    p_build = subparsers.add_parser("dataset-build", help="Build task dataset (e.g. classification)")
    p_build.add_argument("--input", required=True, help="Input normalized records file")
    p_build.add_argument("--output", help="Output task dataset path")
    add_common_flags(p_build)
    p_build.set_defaults(func=cmd_dataset_build)

    # dataset split
    p_split = subparsers.add_parser("dataset-split", help="Split dataset with zero group leakage")
    p_split.add_argument("--input", required=True, help="Input dataset JSON")
    p_split.add_argument("--output-dir", help="Output directory for train/val/test splits")
    p_split.add_argument("--name", default="components", help="Dataset name")
    p_split.add_argument("--version", default="1.4.0", help="Dataset version")
    p_split.add_argument("--train-ratio", type=float, default=0.8, help="Train ratio (default 0.8)")
    p_split.add_argument("--val-ratio", type=float, default=0.1, help="Val ratio (default 0.1)")
    p_split.add_argument("--test-ratio", type=float, default=0.1, help="Test ratio (default 0.1)")
    p_split.add_argument("--seed", type=int, default=42, help="Random seed")
    add_common_flags(p_split)
    p_split.set_defaults(func=cmd_dataset_split)

    # train
    p_train = subparsers.add_parser("train", help="Train candidate models and select champion")
    p_train.add_argument("--train-path", default="apps/ml/data/training_dataset.json", help="Train dataset JSON")
    p_train.add_argument("--val-path", default="", help="Validation dataset JSON")
    p_train.add_argument("--version", default="1.4.0", help="Model version")
    p_train.add_argument("--output-dir", help="Output model registry directory")
    p_train.add_argument("--seed", type=int, default=42, help="Random seed")
    p_train.add_argument("--legacy", action="store_true", help="Run existing RFC-0058 training pipeline")
    p_train.add_argument("--no-deploy", action="store_true", help="Skip deployment (legacy mode)")
    add_common_flags(p_train)
    p_train.set_defaults(func=cmd_train)

    # evaluate
    p_eval = subparsers.add_parser("evaluate", help="Evaluate model against quality gates")
    p_eval.add_argument("--version", default="1.4.0", help="Model version")
    p_eval.add_argument("--model-path", help="Path to model .pkl artifact")
    p_eval.add_argument("--val-path", required=True, help="Path to validation dataset JSON")
    p_eval.add_argument("--active-model", default="apps/ml/models/category_classifier.pkl", help="Active model path")
    p_eval.add_argument("--output-dir", help="Output report directory")
    add_common_flags(p_eval)
    p_eval.set_defaults(func=cmd_evaluate)

    # experiment
    p_exp = subparsers.add_parser("experiment", help="List registered versions and experiments")
    add_common_flags(p_exp)
    p_exp.set_defaults(func=cmd_experiment)

    return parser


def should_use_tui(args: argparse.Namespace) -> bool:
    """Determines whether to present the Rich Live TUI based on flags and terminal state."""
    explicit_tui = getattr(args, "tui", None)
    if explicit_tui is False:
        return False
    if explicit_tui is True:
        return True
    quiet = getattr(args, "quiet", False)
    verbose = getattr(args, "verbose", False)
    return sys.stdout.isatty() and not quiet and not verbose


def main() -> None:
    # Handle composite commands like "data inspect" -> "data-inspect"
    args_list = sys.argv[1:]
    if len(args_list) >= 2 and args_list[0] in ("data", "dataset"):
        args_list = [f"{args_list[0]}-{args_list[1]}"] + args_list[2:]

    parser = build_parser()
    if not args_list:
        parser.print_help()
        sys.exit(0)

    parsed = parser.parse_args(args_list)
    if hasattr(parsed, "func"):
        tui_eligible_commands = (
            "collect",
            "data-collect",
            "train",
            "evaluate",
            "data-validate",
            "data-normalize",
            "data-dedupe",
            "dataset-build",
            "dataset-split",
        )
        if getattr(parsed, "command", "") in tui_eligible_commands and should_use_tui(parsed):
            from .tui import TrainerTUI
            tui = TrainerTUI()
            tui.run_job(parsed.func, parsed)
        else:
            parsed.func(parsed)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
