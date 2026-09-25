"""
Tests for category recovery, product-signal classification, provenance, and CLI registration.
"""

import pytest
import argparse
from unittest.mock import patch, MagicMock
from apps.ml.training.schemas.product import ProductRecord, ProvenanceRecord
from apps.ml.training.processors.normalization import (
    NormalizationProcessor,
    classify_product_signals,
)
from apps.ml.training.cli import (
    build_parser,
    cmd_audit_category_recovery,
    cmd_reprocess_category,
)


def make_record(
    name: str,
    raw_category: str = "Electronics",
    category: str = "Uncategorized",
    description: str = "",
    collection_target: str = None,
) -> ProductRecord:
    return ProductRecord(
        sku=f"SKU-{abs(hash(name)) % 100000}",
        name=name,
        raw_category=raw_category,
        category=category,
        description=description,
        collection_target_category=collection_target,
        provenance=ProvenanceRecord(
            source="test_source",
            source_type="generic_web",
        ),
    )


def test_classify_transistors():
    norm = NormalizationProcessor()

    # MOSFETs
    rec1 = make_record("ON Semiconductor NTD360N80S3Z SUPERFET III MOSFET", raw_category="Special Categories")
    out1, audit1 = norm.process(rec1)
    assert out1.category == "Transistors"
    assert out1.category_source == "product_signal"
    assert "category" in audit1.modified_fields

    rec2 = make_record("P-Channel MOSFET 55V 31A", raw_category="Special Categories")
    out2, _ = norm.process(rec2)
    assert out2.category == "Transistors"

    rec3 = make_record("N-Channel MOSFET 55V 30A", raw_category="Special Categories")
    out3, _ = norm.process(rec3)
    assert out3.category == "Transistors"

    rec4 = make_record("STMicroelectronics STGWA20IH65DF 650V 20A Soft-Switching IGBT")
    out4, _ = norm.process(rec4)
    assert out4.category == "Transistors"


def test_classify_relays():
    norm = NormalizationProcessor()

    rec1 = make_record("Adafruit STEMMA Non-Latching Mini Relay", raw_category="Electronics")
    out1, audit1 = norm.process(rec1)
    assert out1.category == "Relays"
    assert out1.category_source == "product_signal"

    rec2 = make_record("Adafruit Power Relay FeatherWing", raw_category="Electronics")
    out2, _ = norm.process(rec2)
    assert out2.category == "Relays"

    rec3 = make_record("SparkFun Qwiic Dual Solid State Relay", raw_category="Power")
    out3, _ = norm.process(rec3)
    assert out3.category == "Relays"

    rec4 = make_record("Solid State Relay - 40A (3-32V DC Input)", raw_category="Power")
    out4, _ = norm.process(rec4)
    assert out4.category == "Relays"

    rec5 = make_record("Solid State Relays - PCB Mount MOSFET Relay SOP4 60V 1400mA 1 Form A", raw_category="Special Categories")
    out5, _ = norm.process(rec5)
    assert out5.category == "Relays"


def test_classify_ics_and_semiconductors():
    norm = NormalizationProcessor()

    rec1 = make_record("Propeller 1 Multicore Microcontroller", raw_category="Electronics")
    out1, audit1 = norm.process(rec1)
    assert out1.category == "ICs & Semiconductors"
    assert out1.category_source == "product_signal"

    rec2 = make_record("MAXIII - 24-bit Stereo Audio DAC", raw_category="Electronics")
    out2, _ = norm.process(rec2)
    assert out2.category == "ICs & Semiconductors"

    rec3 = make_record("Adafruit MCP4728 Quad DAC with EEPROM", raw_category="Electronics")
    out3, _ = norm.process(rec3)
    assert out3.category == "ICs & Semiconductors"

    rec4 = make_record("ADS1015 12-Bit ADC - 4 Channel with Programmable Gain Amplifier", raw_category="Electronics")
    out4, _ = norm.process(rec4)
    assert out4.category == "ICs & Semiconductors"

    rec5 = make_record("ADS1115 16-Bit ADC - 4 Channel with Programmable Gain Amplifier", raw_category="Electronics")
    out5, _ = norm.process(rec5)
    assert out5.category == "ICs & Semiconductors"


def test_fasteners_vs_tools():
    norm = NormalizationProcessor()

    # Screwdrivers / Tools must NEVER be classified as fasteners
    tool1 = make_record("7 Piece Precision Slotted and Phillips Screwdriver Set", raw_category="Tools")
    out_tool1, _ = norm.process(tool1)
    assert out_tool1.category == "Tools"

    tool2 = make_record("Wiha 10 Piece Insulated SoftFinish Cushion Grip Screwdriver", raw_category="Uncategorized")
    out_tool2, _ = norm.process(tool2)
    assert out_tool2.category == "Tools"
    assert out_tool2.category_source == "product_signal"

    tool3 = make_record("13 Piece MagicRing Ball End Hex L-Key Set", raw_category="Uncategorized")
    out_tool3, _ = norm.process(tool3)
    assert out_tool3.category == "Tools"

    # Genuine fasteners
    fast1 = make_record("MINI+ Fasteners (spare bag)", raw_category="Uncategorized")
    out_fast1, _ = norm.process(fast1)
    assert out_fast1.category == "Fasteners"
    assert out_fast1.category_source == "product_signal"

    fast2 = make_record("Brass M2.5 Standoffs for Pi HATs - Black Plated - Pack of 2", raw_category="Electronics")
    out_fast2, _ = norm.process(fast2)
    assert out_fast2.category == "Fasteners"

    fast3 = make_record("Trapezoid nut (MINI/+)", raw_category="Uncategorized")
    out_fast3, _ = norm.process(fast3)
    assert out_fast3.category == "Fasteners"


def test_merchandise_remains_uncategorized():
    norm = NormalizationProcessor()

    shirt = make_record("Transistor Man Shirt - Womens Medium", raw_category="Special Categories")
    out_shirt, _ = norm.process(shirt)
    assert out_shirt.category == "Uncategorized"

    cushion = make_record("Resistor cushion", raw_category="Uncategorized")
    out_cushion, _ = norm.process(cushion)
    assert out_cushion.category == "Uncategorized"

    plush = make_record("Cappy the Capacitor - Circuit Playground Plushie", raw_category="Uncategorized")
    out_plush, _ = norm.process(plush)
    assert out_plush.category == "Uncategorized"


def test_existing_strong_taxonomy_is_protected():
    norm = NormalizationProcessor()

    # Even if name contains 'ADC', strong taxonomy 'Development Boards' must NOT be overwritten
    rec = make_record(
        "ADS1115 16-Bit ADC Breakout",
        raw_category="Breakout Boards > ADC / DAC",
        category="Development Boards",
    )
    out, audit = norm.process(rec)
    assert out.category == "Development Boards"
    assert out.category_source == "taxonomy"


def test_collection_target_category_fallback():
    norm = NormalizationProcessor()

    # Product with uninformative name, but explicit collection target category
    rec = make_record(
        "Custom Component XYZ-9988",
        raw_category="Electronics",
        category="Uncategorized",
        collection_target="Transistors",
    )
    out, _ = norm.process(rec)
    assert out.category == "Transistors"
    assert out.category_source == "collection_target"


def test_cli_registration_audit_category_recovery():
    """Verify audit-category-recovery is properly registered and dispatches with args."""
    parser = build_parser()
    args = parser.parse_args(["audit-category-recovery", "--version", "dataset-crawl-1790343594"])
    assert args.command == "audit-category-recovery"
    assert args.version == "dataset-crawl-1790343594"
    assert args.func == cmd_audit_category_recovery


def test_cli_registration_reprocess_category():
    """Verify reprocess-category is properly registered and dispatches with args."""
    parser = build_parser()
    args = parser.parse_args([
        "reprocess-category",
        "--version", "dataset-crawl-1790343594",
        "--output-version", "dataset-crawl-1790343594-reprocessed"
    ])
    assert args.command == "reprocess-category"
    assert args.version == "dataset-crawl-1790343594"
    assert args.output_version == "dataset-crawl-1790343594-reprocessed"
    assert args.func == cmd_reprocess_category


def test_cli_existing_commands_unaffected():
    """Verify existing commands continue to parse cleanly."""
    parser = build_parser()

    args_cov = parser.parse_args(["data-coverage", "--version", "dataset-crawl-1790258177"])
    assert args_cov.command == "data-coverage"
    assert args_cov.version == "dataset-crawl-1790258177"

    args_plan = parser.parse_args(["data-plan", "--version", "dataset-crawl-1790258177", "--budget", "500"])
    assert args_plan.command == "data-plan"
    assert args_plan.budget == 500


def test_coverage_comparison_includes_non_targeted_recovered_categories():
    """Verify format_coverage_comparison and include_all_present display Sensors, Development Boards, Tools."""
    from apps.ml.training.coverage import (
        calculate_category_coverage,
        format_coverage_comparison,
        CategoryCoverage,
    )

    before_records = [
        {"entity_type": "PRODUCT", "sku": "S1", "category": "Sensors"},
        {"entity_type": "PRODUCT", "sku": "D1", "category": "Development Boards"},
        {"entity_type": "PRODUCT", "sku": "C1", "category": "Cables"},
    ]
    after_records = [
        {"entity_type": "PRODUCT", "sku": "S1", "category": "Sensors"},
        {"entity_type": "PRODUCT", "sku": "S2", "category": "Sensors"},
        {"entity_type": "PRODUCT", "sku": "D1", "category": "Development Boards"},
        {"entity_type": "PRODUCT", "sku": "D2", "category": "Development Boards"},
        {"entity_type": "PRODUCT", "sku": "T1", "category": "Tools"},
        {"entity_type": "PRODUCT", "sku": "C1", "category": "Cables"},
        {"entity_type": "PRODUCT", "sku": "C2", "category": "Cables"},
    ]

    before_cov = calculate_category_coverage(before_records, include_all_present=True)
    after_cov = calculate_category_coverage(after_records, include_all_present=True)

    table = format_coverage_comparison(before_cov, after_cov)
    assert "Sensors" in table
    assert "Development Boards" in table
    assert "Tools" in table
    assert "Cables" in table
    assert "+1" in table  # Sensors and Development Boards and Cables gained


def test_format_coverage_comparison_unions_extra_after_categories():
    """Verify format_coverage_comparison shows categories in after even if missing from before."""
    from apps.ml.training.coverage import CategoryCoverage, format_coverage_comparison

    before = [
        CategoryCoverage("Cables", 100, 600, 500, 0.16),
    ]
    after = [
        CategoryCoverage("Cables", 150, 600, 450, 0.25),
        CategoryCoverage("Sensors", 50, 0, 0, 1.0),
        CategoryCoverage("Tools", 20, 0, 0, 1.0),
    ]

    table = format_coverage_comparison(before, after)
    assert "Cables" in table
    assert "Sensors" in table
    assert "Tools" in table
    assert "+50" in table

