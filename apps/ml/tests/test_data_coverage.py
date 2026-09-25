"""
Tests for Data Coverage and Category Deficit Reporting.

Requirements:
- PRODUCT-only counting
- DOCUMENT exclusion
- Duplicate handling
- Target deficit calculation
- No negative deficit
- Deterministic ordering
- Configurable targets
- --version path resolution
"""

import os
import json
import argparse
from pathlib import Path
import pytest

from apps.ml.training.config import settings
from apps.ml.training.cli import (
    DEFAULT_COVERAGE_TARGETS,
    calculate_data_coverage,
    resolve_coverage_dataset_path,
    cmd_data_coverage,
)


def test_product_only_counting():
    """Verify that only entity_type == 'PRODUCT' records are counted."""
    records = [
        {"entity_type": "PRODUCT", "sku": "CAP-001", "manufacturer": "Murata", "category": "Capacitors"},
        {"entity_type": "PRODUCT", "sku": "CAP-002", "manufacturer": "Murata", "category": "Capacitors"},
        {"entity_type": "OTHER", "sku": "CAP-003", "manufacturer": "Murata", "category": "Capacitors"},
        {"sku": "CAP-004", "manufacturer": "Murata", "category": "Capacitors"},  # missing entity_type
    ]
    targets = {"Capacitors": 10}
    report = calculate_data_coverage(records, targets=targets)
    assert len(report) == 1
    assert report[0]["category"] == "Capacitors"
    assert report[0]["current"] == 2
    assert report[0]["deficit"] == 8


def test_document_exclusion():
    """Verify that entity_type == 'DOCUMENT' records are strictly excluded."""
    records = [
        {"entity_type": "PRODUCT", "sku": "RES-001", "manufacturer": "Yageo", "category": "Resistors"},
        {"entity_type": "DOCUMENT", "sku": "DOC-001", "manufacturer": "Yageo", "category": "Resistors"},
        {"entity_type": "DOCUMENT", "sku": "DOC-002", "manufacturer": "Murata", "category": "Capacitors"},
    ]
    targets = {"Resistors": 10, "Capacitors": 10}
    report = calculate_data_coverage(records, targets=targets)
    by_cat = {r["category"]: r for r in report}
    assert by_cat["Resistors"]["current"] == 1
    assert by_cat["Resistors"]["deficit"] == 9
    assert by_cat["Capacitors"]["current"] == 0
    assert by_cat["Capacitors"]["deficit"] == 10


def test_duplicate_handling():
    """Verify deduplication by SKU/MPN/name and manufacturer."""
    records = [
        {"entity_type": "PRODUCT", "sku": "REL-001", "manufacturer": "Omron", "category": "Relays"},
        # Exact duplicate
        {"entity_type": "PRODUCT", "sku": "REL-001", "manufacturer": "Omron", "category": "Relays"},
        # Same SKU but different manufacturer -> distinct product
        {"entity_type": "PRODUCT", "sku": "REL-001", "manufacturer": "TE", "category": "Relays"},
        # Duplicate by MPN
        {"entity_type": "PRODUCT", "mpn": "G5Q-14", "manufacturer": "Omron", "category": "Relays"},
        {"entity_type": "PRODUCT", "mpn": "G5Q-14", "manufacturer": "Omron", "category": "Relays"},
    ]
    targets = {"Relays": 10}
    report = calculate_data_coverage(records, targets=targets)
    assert report[0]["current"] == 3
    assert report[0]["deficit"] == 7


def test_target_deficit_calculation():
    """Verify target deficit = max(0, target - current)."""
    records = [
        {"entity_type": "PRODUCT", "sku": f"FAS-{i}", "category": "Fasteners"}
        for i in range(45)
    ]
    targets = {"Fasteners": 200}
    report = calculate_data_coverage(records, targets=targets)
    assert report[0]["target"] == 200
    assert report[0]["current"] == 45
    assert report[0]["deficit"] == 155


def test_no_negative_deficit():
    """Verify that deficit is never negative when current exceeds target."""
    records = [
        {"entity_type": "PRODUCT", "sku": f"TR-{i}", "category": "Transistors"}
        for i in range(150)
    ]
    targets = {"Transistors": 100}
    report = calculate_data_coverage(records, targets=targets)
    assert report[0]["target"] == 100
    assert report[0]["current"] == 150
    assert report[0]["deficit"] == 0


def test_deterministic_ordering():
    """Verify that categories are deterministically ordered by deficit descending, then category name ascending."""
    records = [
        {"entity_type": "PRODUCT", "sku": "A1", "category": "Category B"},
        {"entity_type": "PRODUCT", "sku": "A2", "category": "Category B"},
    ]
    targets = {
        "Category B": 10,  # deficit = 8
        "Category A": 10,  # deficit = 10
        "Category C": 10,  # deficit = 10
        "Category D": 20,  # deficit = 20
    }
    report = calculate_data_coverage(records, targets=targets)
    categories = [r["category"] for r in report]
    # Category D has deficit 20 (highest)
    # Category A and Category C both have deficit 10 -> alphabetically Category A then Category C
    # Category B has deficit 8
    assert categories == ["Category D", "Category A", "Category C", "Category B"]
    assert [r["deficit"] for r in report] == [20, 10, 10, 8]


def test_configurable_targets_via_file(tmp_path):
    """Verify loading custom targets from a JSON file and merging with defaults."""
    custom_targets_file = tmp_path / "custom_targets.json"
    custom_targets_file.write_text(json.dumps({
        "Resistors": 350,
        "Custom Sensors": 100,
    }))

    records_file = tmp_path / "unique_records.json"
    records_file.write_text(json.dumps([
        {"entity_type": "PRODUCT", "sku": "SENS-1", "category": "Custom Sensors"},
    ]))

    args = argparse.Namespace(
        path=str(records_file),
        version=None,
        targets=str(custom_targets_file),
        output_json=None,
    )
    report = cmd_data_coverage(args)
    by_cat = {r["category"]: r for r in report}
    # Custom category added
    assert "Custom Sensors" in by_cat
    assert by_cat["Custom Sensors"]["target"] == 100
    assert by_cat["Custom Sensors"]["current"] == 1
    assert by_cat["Custom Sensors"]["deficit"] == 99
    # Overridden default target
    assert by_cat["Resistors"]["target"] == 350
    # Preserved unmodified default target
    assert by_cat["Capacitors"]["target"] == DEFAULT_COVERAGE_TARGETS["Capacitors"]


def test_version_path_resolution(tmp_path, monkeypatch):
    """Verify that --version resolves to settings.training_data_dir / version / unique_records.json."""
    fake_training_dir = tmp_path / "datasets" / "training"
    monkeypatch.setattr(settings, "dataset_base_dir", str(tmp_path / "datasets"))

    version_name = "test-version-12345"
    version_dir = fake_training_dir / version_name
    version_dir.mkdir(parents=True)
    target_file = version_dir / "unique_records.json"
    target_file.write_text(json.dumps([
        {"entity_type": "PRODUCT", "sku": "P1", "category": "Capacitors"}
    ]))

    # Test path resolution helper
    resolved_path = resolve_coverage_dataset_path(version=version_name)
    assert resolved_path == target_file
    assert resolved_path.exists()

    # Test cmd_data_coverage with --version
    output_json = tmp_path / "report.json"
    args = argparse.Namespace(
        version=version_name,
        path=None,
        targets=None,
        output_json=str(output_json),
    )
    report = cmd_data_coverage(args)
    assert output_json.exists()

    with open(output_json, "r", encoding="utf-8") as f:
        saved_report = json.load(f)
    assert "report" in saved_report
    assert saved_report["report"][0]["category"] is not None


def test_missing_version_and_path_raises():
    """Verify that resolving with neither version nor path raises ValueError."""
    with pytest.raises(ValueError, match="Either --version or --path must be supplied"):
        resolve_coverage_dataset_path(version=None, path=None)
