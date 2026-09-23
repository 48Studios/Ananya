"""
Comprehensive Test Suite for Ananya ML Training Workspace.

Validates:
1. Configuration and hardware detection
2. Product & Provenance schemas
3. Multi-source Collectors (Ananya DB, Manufacturer Catalog, Distributor Feed)
4. Data Quality Processors (Validation, Normalization, Deduplication, Value Guards)
5. Task Dataset Generators (Classification, Attribute Relevance, Matching, Normalization)
6. Deterministic Zero-Leakage Dataset Splitting
7. Model Candidate Training & Quality Gate Evaluation
8. CLI command execution
"""

import os
import json
import pytest
from pathlib import Path

from apps.ml.training.config import WorkspaceSettings, detect_device
from apps.ml.training.schemas import (
    ProductRecord,
    ProductDomain,
    ProvenanceRecord,
    VerificationStatus,
    AttributeValueRecord,
    DatasetManifest,
    DuplicateLabel,
)
from apps.ml.training.collectors import (
    AnanyaDbCollector,
    ManufacturerCatalogCollector,
    DistributorFeedCollector,
    infer_domain,
)
from apps.ml.training.processors import (
    DataValidationProcessor,
    NormalizationProcessor,
    DeduplicationProcessor,
    normalize_text,
    normalize_unit_value,
    normalize_manufacturer,
    normalize_category,
    strip_packaging_suffix,
    values_differ_critically,
    ProcessingDisposition,
)
from apps.ml.training.generators import (
    ClassificationDatasetGenerator,
    AttributeExtractionDatasetGenerator,
    AttributeRelevanceDatasetGenerator,
    EntityResolutionDatasetGenerator,
    NormalizationDatasetGenerator,
    DuplicateMatchingDatasetGenerator,
    SimilarityDatasetGenerator,
)
from apps.ml.training.datasets import DeterministicDatasetSplitter
from apps.ml.training.trainers import CategoryClassifierTrainer
from apps.ml.training.evaluation import ModelEvaluator, compute_classification_metrics


FIXTURES_PATH = "apps/ml/training/datasets/raw/fixtures.json"


@pytest.fixture
def sample_records():
    assert os.path.exists(FIXTURES_PATH), f"Fixtures not found at {FIXTURES_PATH}"
    with open(FIXTURES_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return [ProductRecord(**d) for d in data]


# -----------------------------------------------------------------------------
# 1. Configuration & Hardware Detection
# -----------------------------------------------------------------------------
def test_hardware_detection_and_settings():
    device = detect_device()
    assert device in ("mps", "cuda", "cpu")

    settings = WorkspaceSettings()
    info = settings.hardware_info()
    assert "device" in info
    assert "cpu_count" in info
    assert info["memory_limit_mb"] == 256.0


# -----------------------------------------------------------------------------
# 2. Schemas & Provenance
# -----------------------------------------------------------------------------
def test_product_record_and_provenance(sample_records):
    record = sample_records[0]
    assert record.sku == "RES-0805-10K"
    assert record.domain == ProductDomain.ELECTRONICS
    assert record.provenance.source_type == "manufacturer_datasheet"
    assert record.provenance.verification_status == VerificationStatus.VERIFIED

    # Check serialization
    dumped = record.model_dump()
    assert dumped["attributes"]["resistance"]["normalized_si"] == 10000.0


# -----------------------------------------------------------------------------
# 3. Collectors
# -----------------------------------------------------------------------------
def test_ananya_db_collector_from_snapshot(tmp_path):
    snapshot_data = {
        "components": [
            {
                "id": "comp-123",
                "sku": "FAST-001",
                "manufacturerPartNumber": "M4-16-HEX",
                "name": "M4 x 16mm Hex Bolt",
                "description": "Metric class 8.8 steel hex head bolt",
                "unit": "pcs",
                "isActive": True,
                "categoryName": "Fasteners",
                "manufacturerName": "Fastenal",
            }
        ]
    }
    dump_file = tmp_path / "snapshot.json"
    dump_file.write_text(json.dumps(snapshot_data))

    collector = AnanyaDbCollector()
    records = collector.collect(snapshot_file=str(dump_file))
    assert len(records) == 1
    rec = records[0]
    assert rec.sku == "FAST-001"
    assert rec.category == "Fasteners"
    assert rec.domain == ProductDomain.FASTENERS
    assert rec.provenance.source == "ananya_db"
    assert rec.provenance.original_record_id == "comp-123"


def test_manufacturer_catalog_collector(tmp_path):
    catalog_data = [
        {
            "part_number": "CW8100",
            "name": "No-Clean Flux Pen",
            "category": "Consumables",
            "manufacturer": "Chemtronics",
            "attributes": {"volume": {"value": 10.0, "unit": "ml"}},
            "provenance": {"verificationStatus": "VERIFIED", "sourceIdentifier": "CHEM-01"},
        }
    ]
    catalog_file = tmp_path / "catalog.json"
    catalog_file.write_text(json.dumps(catalog_data))

    collector = ManufacturerCatalogCollector()
    records = collector.collect(catalog_path=str(catalog_file))
    assert len(records) == 1
    assert records[0].mpn == "CW8100"
    assert records[0].domain == ProductDomain.CONSUMABLES


# -----------------------------------------------------------------------------
# 4. Data Quality Processors
# -----------------------------------------------------------------------------
def test_validation_malformed_mpn():
    processor = DataValidationProcessor()
    bad_record = ProductRecord(
        sku="TEST-SKU",
        mpn="TBD",
        name="Unknown Part",
        category="Resistors",
        provenance=ProvenanceRecord(source="test", source_type="test"),
    )
    _, audit = processor.process(bad_record)
    assert audit.disposition == ProcessingDisposition.REJECTED
    assert any("MALFORMED_MPN" in r for r in audit.reasons)


def test_validation_physical_sanity_bounds():
    processor = DataValidationProcessor()
    bad_record = ProductRecord(
        sku="CAP-IMPOSSIBLE",
        mpn="CAP-100F",
        name="100 Farad 0603 Capacitor",
        category="Capacitors",
        attributes={
            "capacitance": AttributeValueRecord(
                code="capacitance", value=100.0, normalized_si=100.0  # > 50F max bound
            )
        },
        provenance=ProvenanceRecord(source="test", source_type="test"),
    )
    _, audit = processor.process(bad_record)
    assert audit.disposition == ProcessingDisposition.QUARANTINED
    assert any("IMPOSSIBLE_PHYSICAL_VALUE" in r for r in audit.reasons)


def test_cross_source_conflict_detection():
    rec_a = ProductRecord(
        sku="CONF-01",
        mpn="PART-XYZ",
        name="Part XYZ",
        category="Resistors",
        manufacturer="Yageo",
        provenance=ProvenanceRecord(source="src_a", source_type="test"),
    )
    rec_b = ProductRecord(
        sku="CONF-02",
        mpn="PART-XYZ",
        name="Part XYZ",
        category="Capacitors",  # Conflicting category!
        manufacturer="Yageo",
        provenance=ProvenanceRecord(source="src_b", source_type="test"),
    )

    passed, flagged = DataValidationProcessor.detect_cross_source_conflicts([rec_a, rec_b])
    assert len(passed) == 0
    assert len(flagged) == 2
    assert any("CONFLICTING_CATEGORIES" in r for r in flagged[0][1].reasons)


def test_normalization_units_and_aliases():
    processor = NormalizationProcessor()

    # Test unit normalization function
    val, unit, norm_si = normalize_unit_value("10k ohm", "resistance")
    assert val == 10.0
    assert unit == "Ω" or unit == "kΩ"
    assert norm_si == 10000.0

    val, unit, norm_si = normalize_unit_value("0.1 uF", "capacitance")
    assert norm_si == 1e-7

    val, unit, norm_si = normalize_unit_value("8mm", "length")
    assert norm_si == 0.008

    # Test manufacturer normalization
    assert normalize_manufacturer("Murata Mfg") == "Murata Manufacturing"
    assert normalize_manufacturer("TI") == "Texas Instruments"
    assert normalize_manufacturer("McMaster") == "McMaster-Carr"

    # Test category normalization
    assert normalize_category("chip resistor - surface mount") == "Resistors"
    assert normalize_category("screws, bolts") == "Fasteners"


def test_deduplication_value_guard():
    rec_a = ProductRecord(
        sku="RES-10K",
        mpn="RC0805FR-0710KL",
        name="10k Resistor",
        category="Resistors",
        attributes={"resistance": AttributeValueRecord(code="resistance", value=10.0, normalized_si=10000.0)},
        provenance=ProvenanceRecord(source="test", source_type="test"),
    )
    rec_b = ProductRecord(
        sku="RES-100K",
        mpn="RC0805FR-0710KL",  # Accidental identical MPN entered in system
        name="100k Resistor",
        category="Resistors",
        attributes={"resistance": AttributeValueRecord(code="resistance", value=100.0, normalized_si=100000.0)},
        provenance=ProvenanceRecord(source="test", source_type="test"),
    )

    differs, reason = values_differ_critically(rec_a, rec_b)
    assert differs is True
    assert "Value guard breach" in reason

    deduper = DeduplicationProcessor()
    unique, conflicts = deduper.deduplicate([rec_a, rec_b])
    # Both records should be kept, not falsely merged!
    assert len(unique) == 2
    assert len(conflicts) == 1


# -----------------------------------------------------------------------------
# 5. Task Dataset Generators
# -----------------------------------------------------------------------------
def test_classification_generator(sample_records):
    generator = ClassificationDatasetGenerator()
    examples = generator.generate(sample_records)
    assert len(examples) >= len(sample_records)
    assert any(ex.category == "Resistors" for ex in examples)
    assert any(ex.category == "Fasteners" for ex in examples)
    assert any(ex.category == "Consumables" for ex in examples)


def test_attribute_relevance_generator(sample_records):
    # Candidate universe must not be limited to pre-bound categories
    generator = AttributeRelevanceDatasetGenerator(attribute_universe=["resistance", "capacitance", "thread_size", "length"])
    examples = generator.generate(sample_records)
    assert len(examples) == len(sample_records)
    # Check that candidate attributes are provided across all domains
    for ex in examples:
        assert len(ex.candidate_attribute_codes) == 4


def test_duplicate_matching_generator(sample_records):
    generator = DuplicateMatchingDatasetGenerator()
    pairs = generator.generate(sample_records)
    assert len(pairs) > 0
    # Positive pair (packaging variant)
    assert any(p.label == DuplicateLabel.VARIANT and p.is_duplicate is True for p in pairs)
    # Negative pair (different products in same category)
    assert any(p.label == DuplicateLabel.DIFFERENT and p.is_duplicate is False for p in pairs)


# -----------------------------------------------------------------------------
# 6. Deterministic Zero-Leakage Dataset Splitting
# -----------------------------------------------------------------------------
def test_dataset_splitter_zero_leakage():
    examples = [
        {"text": "RC0805 10k resistor", "category": "Resistors", "base_family": "RC0805"},
        {"text": "RC0805 100k resistor", "category": "Resistors", "base_family": "RC0805"},
        {"text": "GRM188 0.1uF capacitor", "category": "Capacitors", "base_family": "GRM188"},
        {"text": "GRM188 1uF capacitor", "category": "Capacitors", "base_family": "GRM188"},
        {"text": "C0805 10uF capacitor", "category": "Capacitors", "base_family": "C0805"},
        {"text": "M3x8 SHCS screw", "category": "Fasteners", "base_family": "M3_SHCS"},
        {"text": "M3x12 SHCS screw", "category": "Fasteners", "base_family": "M3_SHCS"},
        {"text": "M4x16 Hex bolt", "category": "Fasteners", "base_family": "M4_HEX"},
        {"text": "Fluke 117 Multimeter", "category": "Tools", "base_family": "FLUKE117"},
        {"text": "CW8100 Flux pen", "category": "Consumables", "base_family": "CW8100"},
    ]

    splitter = DeterministicDatasetSplitter(train_ratio=0.7, val_ratio=0.2, test_ratio=0.1, random_seed=42)
    train_set, val_set, test_set = splitter.split(examples, group_key="base_family")

    train_families = {e["base_family"] for e in train_set}
    val_families = {e["base_family"] for e in val_set}
    test_families = {e["base_family"] for e in test_set}

    # Verify zero leakage
    assert len(train_families.intersection(val_families)) == 0
    assert len(train_families.intersection(test_families)) == 0
    assert len(val_families.intersection(test_families)) == 0


# -----------------------------------------------------------------------------
# 7. Model Candidate Training & Evaluation
# -----------------------------------------------------------------------------
def test_candidate_trainer_and_evaluator(tmp_path):
    train_data = [
        {"text": "10k ohm 0805 smd resistor", "category": "Resistors"},
        {"text": "100k ohm thick film resistor", "category": "Resistors"},
        {"text": "1k ohm pullup resistor", "category": "Resistors"},
        {"text": "0.1uF 16V ceramic capacitor", "category": "Capacitors"},
        {"text": "10uF 50V electrolytic capacitor", "category": "Capacitors"},
        {"text": "1uF X7R ceramic chip capacitor", "category": "Capacitors"},
        {"text": "M3x8 stainless steel socket head screw", "category": "Fasteners"},
        {"text": "M4x16 hex head bolt class 8.8", "category": "Fasteners"},
        {"text": "M5 locknut nylon insert", "category": "Fasteners"},
    ]
    val_data = [
        {"text": "4.7k ohm precision resistor", "category": "Resistors"},
        {"text": "22uF tantalum capacitor", "category": "Capacitors"},
        {"text": "M3 washer metric stainless", "category": "Fasteners"},
    ]

    trainer = CategoryClassifierTrainer(random_seed=42)
    train_meta = trainer.train(train_data, val_samples=val_data, version="test-v1", output_dir=str(tmp_path / "models"))
    assert train_meta["champion_model"] in ("char_ngram_model", "word_ngram_model", "hybrid_union_model")
    assert (tmp_path / "models" / "category_classifier.pkl").exists()

    evaluator = ModelEvaluator()
    eval_report = evaluator.evaluate(
        trainer.champion_pipeline,
        val_samples=val_data,
        candidate_version="test-v1",
        output_dir=str(tmp_path / "eval"),
    )
    assert "metrics" in eval_report
    assert "quality_gates" in eval_report
    assert (tmp_path / "eval" / "evaluation_report.json").exists()
    assert (tmp_path / "eval" / "evaluation_summary.md").exists()


# -----------------------------------------------------------------------------
# 8. CLI Command Execution
# -----------------------------------------------------------------------------
def test_cli_pipeline(tmp_path):
    from apps.ml.training.cli import (
        cmd_data_validate,
        cmd_data_normalize,
        cmd_data_dedupe,
        cmd_dataset_build,
        cmd_dataset_split,
    )
    import argparse

    # 1. Validate
    val_out = str(tmp_path / "validated.json")
    quar_out = str(tmp_path / "quarantine.json")
    args_val = argparse.Namespace(
        input=FIXTURES_PATH,
        output_valid=val_out,
        output_quarantine=quar_out,
    )
    cmd_data_validate(args_val)
    assert os.path.exists(val_out)
    assert os.path.exists(quar_out)

    # 2. Normalize
    norm_out = str(tmp_path / "normalized.json")
    args_norm = argparse.Namespace(
        input=val_out,
        output=norm_out,
    )
    cmd_data_normalize(args_norm)
    assert os.path.exists(norm_out)

    # 3. Dedupe
    dedupe_out = str(tmp_path / "deduped.json")
    args_dedupe = argparse.Namespace(
        input=norm_out,
        output=dedupe_out,
    )
    cmd_data_dedupe(args_dedupe)
    assert os.path.exists(dedupe_out)

    # 4. Build Dataset
    task_out = str(tmp_path / "task.json")
    args_build = argparse.Namespace(
        input=dedupe_out,
        output=task_out,
    )
    cmd_dataset_build(args_build)
    assert os.path.exists(task_out)

    # 5. Split Dataset
    split_dir = str(tmp_path / "split")
    args_split = argparse.Namespace(
        input=task_out,
        output_dir=split_dir,
        name="test_dataset",
        version="1.0.0",
        train_ratio=0.8,
        val_ratio=0.1,
        test_ratio=0.1,
        seed=42,
    )
    cmd_dataset_split(args_split)
    assert (tmp_path / "split" / "train.json").exists()
    assert (tmp_path / "split" / "val.json").exists()
    assert (tmp_path / "split" / "manifest.json").exists()
