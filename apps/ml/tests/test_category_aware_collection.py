"""
Tests for Category-Aware Autonomous Data Collection System in Ananya ML.

Covers:
1. Coverage Planning:
   - Deficit calculation
   - Zero deficit when target reached
   - No negative deficits
   - Category priority ordering
   - Deterministic tie-breaking
2. Budget Allocation:
   - Total budget never exceeded
   - Proportional allocation based on deficits
   - Zero-deficit categories receive zero budget
   - Deficit cap enforcement (no over-allocation)
   - Rounding safety
3. Query Planning:
   - Category-specific queries generated
   - Configurable templates via YAML / dictionary
   - Unknown categories handled gracefully
   - Generic fallback query generation
4. Collection Safety & Provenance:
   - Category objective does not become ground truth
   - Provenance requirements remain enforced
   - Non-product and invalid records excluded from coverage
5. Integration:
   - data-plan CLI command with --version and --output-json
   - Dynamic priority adjustment
   - Coverage change comparison formatting
   - DiscoveryEngine category queue prioritization
"""

import json
import argparse
from pathlib import Path
import pytest

from apps.ml.training.config import settings
from apps.ml.training.coverage import (
    DEFAULT_COVERAGE_TARGETS,
    DEFAULT_CATEGORY_QUERY_TEMPLATES,
    CategoryCoverage,
    CategoryPlanItem,
    CollectionPlan,
    calculate_category_coverage,
    prioritize_categories,
    allocate_collection_budget,
    CategoryQueryStrategy,
    generate_collection_plan,
    format_plan_table,
    format_coverage_comparison,
)
from apps.ml.training.cli import cmd_data_plan, build_parser
from apps.ml.training.collectors.web.discovery import DiscoveryEngine
from apps.ml.training.collectors.web.registry import SourceConfig, SourceType, SourceQuality


# ==============================================================================
# 1. Coverage Planning Tests
# ==============================================================================

def test_coverage_deficit_calculation():
    """Verify accurate deficit calculation across varied current counts."""
    records = [
        {"entity_type": "PRODUCT", "sku": f"CBL-{i}", "category": "Cables"}
        for i in range(150)
    ] + [
        {"entity_type": "PRODUCT", "sku": f"CAP-{i}", "category": "Capacitors"}
        for i in range(50)
    ]
    targets = {"Cables": 600, "Capacitors": 200, "Resistors": 200}
    coverages = calculate_category_coverage(records, targets=targets)
    cov_map = {c.category: c for c in coverages}

    assert cov_map["Cables"].deficit == 450
    assert cov_map["Cables"].current == 150
    assert cov_map["Capacitors"].deficit == 150
    assert cov_map["Capacitors"].current == 50
    assert cov_map["Resistors"].deficit == 200
    assert cov_map["Resistors"].current == 0


def test_coverage_zero_deficit_when_target_reached():
    """Verify deficit is zero when current count reaches or exceeds target."""
    records = [
        {"entity_type": "PRODUCT", "sku": f"RES-{i}", "category": "Resistors"}
        for i in range(200)
    ]
    targets = {"Resistors": 200}
    coverages = calculate_category_coverage(records, targets=targets)
    assert coverages[0].deficit == 0
    assert coverages[0].coverage_ratio == 1.0


def test_coverage_no_negative_deficits():
    """Verify deficit is clamped at zero and never negative when surplus exists."""
    records = [
        {"entity_type": "PRODUCT", "sku": f"IC-{i}", "category": "ICs & Semiconductors"}
        for i in range(650)
    ]
    targets = {"ICs & Semiconductors": 500}
    coverages = calculate_category_coverage(records, targets=targets)
    assert coverages[0].current == 650
    assert coverages[0].deficit == 0
    assert coverages[0].coverage_ratio == 1.3


def test_category_priority_ordering():
    """Verify categories are prioritized dynamically by deficit descending."""
    coverages = [
        CategoryCoverage("Relays", current=10, target=150, deficit=140, coverage_ratio=0.067),
        CategoryCoverage("Cables", current=100, target=600, deficit=500, coverage_ratio=0.167),
        CategoryCoverage("Resistors", current=50, target=200, deficit=150, coverage_ratio=0.25),
        CategoryCoverage("Capacitors", current=200, target=200, deficit=0, coverage_ratio=1.0),
    ]
    prioritized = prioritize_categories(coverages)
    assert [c.category for c in prioritized] == ["Cables", "Resistors", "Relays", "Capacitors"]
    assert [c.deficit for c in prioritized] == [500, 150, 140, 0]


def test_coverage_deterministic_tie_breaking():
    """Verify deterministic alphabetical tie-breaking when deficits are equal."""
    coverages = [
        CategoryCoverage("Zeta", current=0, target=100, deficit=100, coverage_ratio=0.0),
        CategoryCoverage("Alpha", current=0, target=100, deficit=100, coverage_ratio=0.0),
        CategoryCoverage("Beta", current=0, target=100, deficit=100, coverage_ratio=0.0),
        CategoryCoverage("Omega", current=0, target=150, deficit=150, coverage_ratio=0.0),
    ]
    prioritized = prioritize_categories(coverages)
    assert [c.category for c in prioritized] == ["Omega", "Alpha", "Beta", "Zeta"]


# ==============================================================================
# 2. Budget Allocation Tests
# ==============================================================================

def test_budget_total_never_exceeded():
    """Verify total allocated budget never exceeds configured maximum."""
    coverages = [
        CategoryCoverage("Cables", 168, 600, 432, 0.28),
        CategoryCoverage("ICs", 86, 500, 414, 0.172),
        CategoryCoverage("Resistors", 2, 200, 198, 0.01),
        CategoryCoverage("Capacitors", 4, 200, 196, 0.02),
        CategoryCoverage("Passive", 7, 200, 193, 0.035),
    ]
    for budget in [10, 50, 100, 500, 1000, 2000]:
        budgets = allocate_collection_budget(coverages, total_budget=budget)
        assert sum(budgets.values()) <= budget


def test_budget_proportional_to_deficit():
    """Verify larger deficits receive proportionally larger budgets."""
    coverages = [
        CategoryCoverage("High Deficit", 0, 500, 500, 0.0),
        CategoryCoverage("Med Deficit", 0, 250, 250, 0.0),
        CategoryCoverage("Low Deficit", 0, 50, 50, 0.0),
    ]
    budgets = allocate_collection_budget(coverages, total_budget=800)
    assert budgets["High Deficit"] > budgets["Med Deficit"]
    assert budgets["Med Deficit"] > budgets["Low Deficit"]
    # Ratio of High to Med should be approx 2:1
    assert abs((budgets["High Deficit"] / budgets["Med Deficit"]) - 2.0) < 0.1


def test_budget_zero_deficit_categories_receive_zero():
    """Verify zero-deficit categories receive zero budget."""
    coverages = [
        CategoryCoverage("Needs Data", 10, 100, 90, 0.1),
        CategoryCoverage("Satisfied", 100, 100, 0, 1.0),
        CategoryCoverage("Surplus", 150, 100, 0, 1.5),
    ]
    budgets = allocate_collection_budget(coverages, total_budget=500)
    assert budgets["Satisfied"] == 0
    assert budgets["Surplus"] == 0
    assert budgets["Needs Data"] == 90  # capped by its deficit


def test_budget_deficit_cap():
    """Verify budget allocated never exceeds a category's individual deficit."""
    coverages = [
        CategoryCoverage("Small Deficit", 95, 100, 5, 0.95),
        CategoryCoverage("Large Deficit", 10, 100, 90, 0.1),
    ]
    # Total budget 1000 is much higher than total deficit 95
    budgets = allocate_collection_budget(coverages, total_budget=1000)
    assert budgets["Small Deficit"] <= 5
    assert budgets["Large Deficit"] <= 90
    assert sum(budgets.values()) == 95


def test_budget_rounding_safety():
    """Verify budget rounding distributes all units without off-by-one errors."""
    coverages = [
        CategoryCoverage("Cat A", 0, 100, 100, 0.0),
        CategoryCoverage("Cat B", 0, 100, 100, 0.0),
        CategoryCoverage("Cat C", 0, 100, 100, 0.0),
    ]
    # 100 / 3 = 33.33333333333
    budgets = allocate_collection_budget(coverages, total_budget=100)
    assert sum(budgets.values()) == 100
    assert set(budgets.values()) == {33, 34}


# ==============================================================================
# 3. Query Planning Tests
# ==============================================================================

def test_category_specific_queries_generated():
    """Verify query strategy generates varied, category-specific queries."""
    strategy = CategoryQueryStrategy()
    queries = strategy.generate_queries("Resistors")
    assert len(queries) >= 3
    assert any("resistor" in q.lower() for q in queries)
    assert any("smd" in q.lower() for q in queries)


def test_query_templates_configurable(tmp_path: Path):
    """Verify query templates can be configured via custom YAML."""
    custom_yaml = tmp_path / "custom_sources.yaml"
    custom_yaml.write_text(
        """
category_queries:
  Capacitors:
    - "custom ceramic capacitor query"
    - "high voltage capacitor supplier"
""",
        encoding="utf-8",
    )
    strategy = CategoryQueryStrategy(config_path=str(custom_yaml))
    queries = strategy.generate_queries("Capacitors")
    assert "custom ceramic capacitor query" in queries
    assert "high voltage capacitor supplier" in queries


def test_unknown_categories_dont_crash_planner():
    """Verify planner handles novel or unconfigured categories gracefully."""
    strategy = CategoryQueryStrategy()
    queries = strategy.generate_queries("Quantum Sensors")
    assert len(queries) >= 1
    assert any("Quantum Sensors" in q for q in queries)


# ==============================================================================
# 4. Collection Safety & Provenance Tests
# ==============================================================================

def test_category_objective_not_ground_truth():
    """
    Verify that targeting a category in collection does NOT fabricate ground truth.
    Extraction and normalization must establish the ground truth independently.
    """
    records = [
        # Discovered during a "Capacitors" crawl, but content actually is a Resistor
        {
            "entity_type": "PRODUCT",
            "sku": "RC0805",
            "manufacturer": "Yageo",
            "raw_category": "Thick Film Chip Resistors",
            "category": "Resistors",
        }
    ]
    coverages = calculate_category_coverage(records)
    cov_map = {c.category: c for c in coverages}
    # It must be counted under Resistors, NOT under Capacitors
    assert cov_map["Resistors"].current == 1
    assert cov_map["Capacitors"].current == 0


def test_provenance_enforced_non_products_excluded():
    """Verify DOCUMENT and non-PRODUCT records are strictly excluded from coverage."""
    records = [
        {"entity_type": "DOCUMENT", "sku": "DOC-1", "category": "Cables"},
        {"entity_type": "UNKNOWN", "sku": "UNK-1", "category": "Cables"},
        {"sku": "NO-TYPE-1", "category": "Cables"},
        {"entity_type": "PRODUCT", "sku": "CBL-1", "category": "Cables"},
    ]
    coverages = calculate_category_coverage(records, targets={"Cables": 10})
    assert coverages[0].current == 1
    assert coverages[0].deficit == 9


# ==============================================================================
# 5. Integration & CLI Tests
# ==============================================================================

def test_cli_data_plan_version_resolution():
    """Verify data-plan CLI command resolves baseline dataset and outputs structured table."""
    args = argparse.Namespace(
        version="dataset-crawl-1790258177",
        path=None,
        budget=1000,
        targets=None,
        output_json=None,
        config=None,
    )
    plan = cmd_data_plan(args)
    assert plan.total_products == 6812
    assert plan.total_budget == 1000
    assert plan.allocated_budget == 1000
    assert plan.categories[0].category == "Cables"
    assert plan.categories[0].priority == 1
    assert plan.categories[0].deficit == 432
    assert plan.categories[0].budget == 225


def test_cli_data_plan_output_json(tmp_path: Path):
    """Verify data-plan writes machine-readable JSON plan."""
    out_file = tmp_path / "plan.json"
    args = argparse.Namespace(
        version="dataset-crawl-1790258177",
        path=None,
        budget=500,
        targets=None,
        output_json=str(out_file),
        config=None,
    )
    plan = cmd_data_plan(args)
    assert out_file.exists()

    with open(out_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert data["total_products"] == 6812
    assert data["total_budget"] == 500
    assert data["allocated_budget"] == 500
    assert len(data["categories"]) == 8
    top_cat = data["categories"][0]
    assert top_cat["category"] == "Cables"
    assert top_cat["priority"] == 1
    assert len(top_cat["queries"]) > 0


def test_coverage_comparison_formatting():
    """Verify format_coverage_comparison outputs clean change summary."""
    before = [
        CategoryCoverage("Cables", 168, 600, 432, 0.28),
        CategoryCoverage("ICs & Semiconductors", 86, 500, 414, 0.172),
    ]
    after = [
        CategoryCoverage("Cables", 310, 600, 290, 0.517),
        CategoryCoverage("ICs & Semiconductors", 220, 500, 280, 0.44),
    ]
    table = format_coverage_comparison(before, after)
    assert "CATEGORY COVERAGE CHANGE" in table
    assert "Cables" in table
    assert "168" in table
    assert "310" in table
    assert "+142" in table
    assert "+134" in table


def test_discovery_engine_prioritization():
    """Verify DiscoveryEngine prioritizes crawl queues when category_plan is supplied."""
    cfg = SourceConfig(
        id="test-source",
        name="Test Source",
        domains=["example.com"],
        start_urls=[
            "https://example.com/products/generic-item",
            "https://example.com/products/smd-resistor-10k",
            "https://example.com/products/usb-cable-assembly",
        ],
    )
    engine = DiscoveryEngine(cfg)

    # Without plan: order preserved
    res_no_plan = engine.discover()
    assert res_no_plan.page_queue[0] == "https://example.com/products/generic-item"

    # With plan prioritizing Cables (Priority 1) then Resistors (Priority 2)
    plan = CollectionPlan(
        dataset_version="test",
        dataset_path=None,
        total_products=100,
        total_budget=500,
        allocated_budget=500,
        total_deficit=100,
        categories=[
            CategoryPlanItem("Cables", 0, 100, 100, 0.0, priority=1, budget=300, queries=["cable"]),
            CategoryPlanItem("Resistors", 0, 100, 100, 0.0, priority=2, budget=200, queries=["resistor"]),
        ],
    )
    res_with_plan = engine.discover(category_plan=plan)
    # Cable URL should be placed at the very front of the queue
    assert res_with_plan.page_queue[0] == "https://example.com/products/usb-cable-assembly"
    # Resistor URL should be second
    assert res_with_plan.page_queue[1] == "https://example.com/products/smd-resistor-10k"
    # Generic item should be last
    assert res_with_plan.page_queue[2] == "https://example.com/products/generic-item"
