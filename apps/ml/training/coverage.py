"""
Category Coverage and Autonomous Collection Planner for Ananya ML.

Provides:
- Reusable category coverage and deficit calculation
- Dynamic category prioritization based on deficits
- Category-aware budget allocation using weighted deficit distribution
- Configurable category-specific query generation
- Collection plan generation and human-readable formatting
- Coverage comparison reporting (before vs after collection)
"""

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import yaml

logger = logging.getLogger(__name__)

DEFAULT_COVERAGE_TARGETS: Dict[str, int] = {
    "Capacitors": 200,
    "Relays": 150,
    "Resistors": 200,
    "Transistors": 150,
    "Fasteners": 200,
    "Passive Components": 200,
    "ICs & Semiconductors": 500,
    "Cables": 600,
}

DEFAULT_CATEGORY_QUERY_TEMPLATES: Dict[str, List[str]] = {
    "Cables": [
        "{category} manufacturer product",
        "electronic cable manufacturer product",
        "USB cable manufacturer product",
        "ribbon cable manufacturer",
    ],
    "ICs & Semiconductors": [
        "{category} manufacturer product",
        "IC semiconductor manufacturer product",
        "microcontroller manufacturer product",
        "integrated circuit datasheet",
    ],
    "Resistors": [
        "{category} manufacturer product",
        "SMD resistor manufacturer",
        "through hole resistor manufacturer",
        "SMD resistor 0805 manufacturer",
    ],
    "Capacitors": [
        "{category} manufacturer product",
        "ceramic capacitor manufacturer",
        "electrolytic capacitor manufacturer",
        "tantalum capacitor manufacturer",
    ],
    "Passive Components": [
        "{category} manufacturer product",
        "passive electronic components manufacturer",
        "inductor ferrite manufacturer",
    ],
    "Fasteners": [
        "{category} manufacturer product",
        "metric machine screws manufacturer",
        "hex standoff hardware manufacturer",
        "nylon lock nut fastener",
    ],
    "Transistors": [
        "{category} manufacturer product",
        "MOSFET transistor manufacturer",
        "bipolar junction transistor product",
        "power transistor datasheet",
    ],
    "Relays": [
        "{category} manufacturer product",
        "electromechanical relay manufacturer",
        "solid state relay manufacturer",
        "DIN rail relay product",
    ],
}


@dataclass
class CategoryCoverage:
    """Coverage metrics for an individual category."""

    category: str
    current: int
    target: int
    deficit: int
    coverage_ratio: float

    def __getitem__(self, item: str) -> Any:
        if hasattr(self, item):
            return getattr(self, item)
        raise KeyError(item)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "category": self.category,
            "current": self.current,
            "target": self.target,
            "deficit": self.deficit,
            "coverage_ratio": round(self.coverage_ratio, 4),
        }


@dataclass
class CategoryPlanItem:
    """A prioritized category in a collection plan with allocated budget and queries."""

    category: str
    current: int
    target: int
    deficit: int
    coverage_ratio: float
    priority: Optional[int]
    budget: int
    queries: List[str] = field(default_factory=list)

    def __getitem__(self, item: str) -> Any:
        if hasattr(self, item):
            return getattr(self, item)
        raise KeyError(item)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "category": self.category,
            "current": self.current,
            "target": self.target,
            "deficit": self.deficit,
            "coverage_ratio": round(self.coverage_ratio, 4),
            "priority": self.priority,
            "budget": self.budget,
            "queries": list(self.queries),
        }


@dataclass
class CollectionPlan:
    """Full structured collection plan across all categories."""

    dataset_version: Optional[str]
    dataset_path: Optional[str]
    total_products: int
    total_budget: int
    allocated_budget: int
    total_deficit: int
    categories: List[CategoryPlanItem] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "dataset_version": self.dataset_version,
            "dataset_path": self.dataset_path,
            "total_products": self.total_products,
            "total_budget": self.total_budget,
            "allocated_budget": self.allocated_budget,
            "total_deficit": self.total_deficit,
            "categories": [c.to_dict() for c in self.categories],
        }


def count_unique_product_records(
    records: List[Dict[str, Any]],
) -> Tuple[int, Dict[str, int]]:
    """
    Counts unique PRODUCT records per category.

    Strict rules:
    - Only entity_type == 'PRODUCT' records are counted.
    - entity_type == 'DOCUMENT' and any non-PRODUCT entities are excluded.
    - Exact duplicate records (identified by SKU/MPN/name/id and manufacturer) are counted once.
    """
    category_counts: Dict[str, int] = {}
    seen_keys: set = set()
    total_unique_products = 0

    for rec in records:
        if not isinstance(rec, dict):
            continue
        # PRODUCT-only counting; exclude DOCUMENT and non-PRODUCT entities
        if rec.get("entity_type") != "PRODUCT":
            continue
        key = (
            (rec.get("sku") or rec.get("mpn") or rec.get("name") or str(rec.get("id") or ""))
            + "|"
            + (rec.get("manufacturer") or "")
        )
        if key in seen_keys:
            continue
        seen_keys.add(key)
        total_unique_products += 1
        cat = rec.get("category", "Uncategorized")
        category_counts[cat] = category_counts.get(cat, 0) + 1

    return total_unique_products, category_counts


def calculate_category_coverage(
    records: List[Dict[str, Any]],
    targets: Optional[Dict[str, int]] = None,
) -> List[CategoryCoverage]:
    """
    Calculates category coverage and deficits for product records against targets.

    Deficit is calculated as max(0, target - current), ensuring no negative deficits.
    Deterministic ordering: deficit descending, then category name ascending.
    """
    if targets is None:
        targets = DEFAULT_COVERAGE_TARGETS

    _, category_counts = count_unique_product_records(records)

    report: List[CategoryCoverage] = []
    for cat, target in targets.items():
        current = category_counts.get(cat, 0)
        deficit = max(0, target - current)
        coverage_ratio = current / target if target > 0 else (1.0 if current >= target else 0.0)
        report.append(
            CategoryCoverage(
                category=cat,
                current=current,
                target=target,
                deficit=deficit,
                coverage_ratio=coverage_ratio,
            )
        )

    # Deterministic ordering: highest deficit first, then category name ascending
    report.sort(key=lambda x: (-x.deficit, x.category))
    return report


def prioritize_categories(
    coverages: List[CategoryCoverage],
) -> List[CategoryCoverage]:
    """Ranks categories by deficit descending, category name ascending."""
    return sorted(coverages, key=lambda x: (-x.deficit, x.category))


def allocate_collection_budget(
    coverages: List[CategoryCoverage],
    total_budget: int,
) -> Dict[str, int]:
    """
    Allocates integer collection budget proportionally based on category deficits.

    Enforces:
    - sum(budgets.values()) <= total_budget (total budget never exceeded)
    - Categories with deficit == 0 receive budget == 0
    - Larger deficits receive proportionally larger budgets
    - No category receives more budget than its deficit (budget <= deficit)
    - Deterministic tie-breaking using largest remainder method
    """
    if total_budget <= 0:
        return {c.category: 0 for c in coverages}

    deficit_cats = [c for c in coverages if c.deficit > 0]
    total_deficit = sum(c.deficit for c in deficit_cats)

    if total_deficit <= 0:
        return {c.category: 0 for c in coverages}

    effective_budget = min(total_budget, total_deficit)
    budgets: Dict[str, int] = {c.category: 0 for c in coverages}
    remainders: List[Tuple[float, str, int]] = []

    allocated_sum = 0
    for c in deficit_cats:
        exact_share = effective_budget * (c.deficit / total_deficit)
        int_share = min(c.deficit, int(exact_share))
        budgets[c.category] = int_share
        allocated_sum += int_share
        rem = exact_share - int_share
        remainders.append((rem, c.category, c.deficit))

    # Largest remainder distribution for unallocated surplus
    remainders.sort(key=lambda x: (-x[0], -x[2], x[1]))
    surplus = effective_budget - allocated_sum
    for _, cat, deficit in remainders:
        if surplus <= 0:
            break
        if budgets[cat] < deficit:
            budgets[cat] += 1
            surplus -= 1

    return budgets


class CategoryQueryStrategy:
    """Generates category-specific web discovery queries from configurable templates."""

    def __init__(
        self,
        templates: Optional[Dict[str, List[str]]] = None,
        config_path: Optional[str] = None,
    ):
        self.templates: Dict[str, List[str]] = dict(DEFAULT_CATEGORY_QUERY_TEMPLATES)
        if config_path:
            p = Path(config_path)
            if p.exists():
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        cfg = yaml.safe_load(f) or {}
                        if isinstance(cfg, dict) and "category_queries" in cfg:
                            self.templates.update(cfg["category_queries"])
                except Exception as e:
                    logger.debug(f"Could not load category queries from {config_path}: {e}")
        if templates:
            self.templates.update(templates)

    def generate_queries(self, category: str, limit: Optional[int] = None) -> List[str]:
        """
        Generates multiple query variants for a given category.
        Gracefully handles unknown categories with generic templates.
        """
        raw_templates = self.templates.get(category)
        if not raw_templates:
            raw_templates = [
                f"{category} manufacturer product",
                f"{category} electronic component",
                f"{category} product catalog",
            ]

        queries: List[str] = []
        for tmpl in raw_templates:
            q = tmpl.format(category=category) if "{category}" in tmpl else tmpl
            if q not in queries:
                queries.append(q)

        if limit is not None and limit > 0:
            return queries[:limit]
        return queries


def generate_collection_plan(
    records: List[Dict[str, Any]],
    targets: Optional[Dict[str, int]] = None,
    total_budget: int = 1000,
    dataset_version: Optional[str] = None,
    dataset_path: Optional[str] = None,
    query_strategy: Optional[CategoryQueryStrategy] = None,
) -> CollectionPlan:
    """
    Generates a structured, prioritized, and budgeted collection plan.
    """
    if query_strategy is None:
        query_strategy = CategoryQueryStrategy()

    total_products, _ = count_unique_product_records(records)
    coverages = calculate_category_coverage(records, targets=targets)
    coverages = prioritize_categories(coverages)
    budgets = allocate_collection_budget(coverages, total_budget=total_budget)

    items: List[CategoryPlanItem] = []
    priority_counter = 1
    total_deficit = 0

    for c in coverages:
        total_deficit += c.deficit
        budget = budgets.get(c.category, 0)
        priority = priority_counter if c.deficit > 0 else None
        if c.deficit > 0:
            priority_counter += 1

        queries = query_strategy.generate_queries(c.category)
        items.append(
            CategoryPlanItem(
                category=c.category,
                current=c.current,
                target=c.target,
                deficit=c.deficit,
                coverage_ratio=c.coverage_ratio,
                priority=priority,
                budget=budget,
                queries=queries,
            )
        )

    allocated_budget = sum(item.budget for item in items)

    return CollectionPlan(
        dataset_version=dataset_version,
        dataset_path=dataset_path,
        total_products=total_products,
        total_budget=total_budget,
        allocated_budget=allocated_budget,
        total_deficit=total_deficit,
        categories=items,
    )


def format_plan_table(plan: CollectionPlan) -> str:
    """Formats human-readable collection plan table matching CLI requirements."""
    dataset_label = plan.dataset_version or plan.dataset_path or "unknown"
    lines = [
        "ANANYA ML DATA COLLECTION PLAN",
        "",
        f"Current dataset: {dataset_label}",
        f"Total products: {plan.total_products:,}",
        "",
        f"{'Category':<32} {'Current':>7} {'Target':>7} {'Deficit':>8} {'Priority':>9} {'Budget':>7}",
        "-" * 75,
    ]
    for c in plan.categories:
        p_str = str(c.priority) if c.priority is not None else "-"
        lines.append(
            f"{c.category:<32} {c.current:>7} {c.target:>7} {c.deficit:>8} {p_str:>9} {c.budget:>7}"
        )
    return "\n".join(lines)


def format_coverage_comparison(
    before: List[CategoryCoverage],
    after: List[CategoryCoverage],
) -> str:
    """Formats human-readable coverage change comparison table."""
    after_map = {c.category: c for c in after}
    lines = [
        "CATEGORY COVERAGE CHANGE",
        "",
        f"{'Category':<28} {'Before':>7} {'After':>7} {'Target':>7} {'Change':>8}",
        "-" * 61,
    ]
    for b in before:
        a = after_map.get(b.category)
        a_current = a.current if a else b.current
        diff = a_current - b.current
        diff_str = f"+{diff}" if diff > 0 else str(diff)
        lines.append(
            f"{b.category:<28} {b.current:>7} {a_current:>7} {b.target:>7} {diff_str:>8}"
        )
    return "\n".join(lines)
