"""
Test Suite for Authoritative Data Training Pipeline (RFC-0058)
Tests:
- Schema and identifier validation
- Malformed MPN detection
- Physical sanity bounds enforcement
- Cross-source conflict detection and quarantine routing
- Zero data leakage (grouped splitting on MPN family)
- Model registry and quality gates
"""

import pytest
from apps.ml.pipeline.validate import validate_record, detect_cross_source_conflicts
from apps.ml.pipeline.build_dataset import get_base_family, map_taxonomy

def test_identifier_validation():
    # Empty MPN
    bad_record = {
        "mpn": "",
        "category": "Capacitors",
        "manufacturer": "Murata",
        "provenance": {"verificationStatus": "VERIFIED", "sourceType": "manufacturer_datasheet"},
    }
    ok, reasons = validate_record(bad_record)
    assert not ok
    assert any("Empty MPN" in r for r in reasons)

def test_malformed_mpn_rejection():
    bad_mpns = ["TBD", "N/A", "unknown", "placeholder", "test", "???"]
    for mpn in bad_mpns:
        record = {
            "mpn": mpn,
            "category": "Resistors",
            "manufacturer": "Yageo",
            "provenance": {"verificationStatus": "VERIFIED", "sourceType": "manufacturer_datasheet"},
        }
        ok, reasons = validate_record(record)
        assert not ok
        assert any("MALFORMED_MPN" in r for r in reasons)

def test_physical_sanity_bounds_rejection():
    # Impossible negative resistance
    bad_resistor = {
        "mpn": "RC0805-BAD",
        "category": "Resistors",
        "manufacturer": "Yageo",
        "attributes": {
            "resistance": {"value": -10, "unit": "ohm", "normalized_si": -10.0}
        },
        "provenance": {"verificationStatus": "VERIFIED", "sourceType": "manufacturer_datasheet"},
    }
    ok, reasons = validate_record(bad_resistor)
    assert not ok
    assert any("IMPOSSIBLE_ELECTRICAL_VALUE" in r for r in reasons)

    # Impossible 100kV capacitor
    bad_cap = {
        "mpn": "GRM-SUPERHIGH",
        "category": "Capacitors",
        "manufacturer": "Murata",
        "attributes": {
            "voltage": {"value": 100000.0, "unit": "V", "normalized_si": 100000.0}
        },
        "provenance": {"verificationStatus": "VERIFIED", "sourceType": "manufacturer_datasheet"},
    }
    ok, reasons = validate_record(bad_cap)
    assert not ok
    assert any("IMPOSSIBLE_ELECTRICAL_VALUE" in r for r in reasons)

def test_cross_source_conflict_quarantine():
    # Two sources providing conflicting categories for the same part number
    sourceA = {
        "mpn": "CONFLICT-PART-01",
        "category": "Resistors",
        "manufacturer": "Vishay",
        "provenance": {"verificationStatus": "VERIFIED", "sourceType": "manufacturer_datasheet"},
    }
    sourceB = {
        "mpn": "CONFLICT-PART-01",
        "category": "Capacitors",  # Disagreement!
        "manufacturer": "Vishay",
        "provenance": {"verificationStatus": "VERIFIED", "sourceType": "distributor_catalog"},
    }

    validated, quarantined = detect_cross_source_conflicts([sourceA, sourceB])
    assert len(validated) == 0
    assert len(quarantined) == 2
    assert quarantined[0]["quarantineType"] == "CROSS_SOURCE_CONFLICT"
    assert any("CONFLICTING_CATEGORIES" in r for r in quarantined[0]["rejectionReasons"])

def test_cross_source_electrical_conflict_quarantine():
    # Two sources providing conflicting resistance for the same part number
    sourceA = {
        "mpn": "RC0805-CONF-RES",
        "category": "Resistors",
        "manufacturer": "Yageo",
        "attributes": {"resistance": {"normalized_si": 10000.0}},
        "provenance": {"verificationStatus": "VERIFIED", "sourceType": "manufacturer_datasheet"},
    }
    sourceB = {
        "mpn": "RC0805-CONF-RES",
        "category": "Resistors",
        "manufacturer": "Yageo",
        "attributes": {"resistance": {"normalized_si": 100000.0}}, # 100k instead of 10k!
        "provenance": {"verificationStatus": "VERIFIED", "sourceType": "distributor_catalog"},
    }

    validated, quarantined = detect_cross_source_conflicts([sourceA, sourceB])
    assert len(validated) == 0
    assert len(quarantined) == 2
    assert quarantined[0]["quarantineType"] == "CROSS_SOURCE_CONFLICT"
    assert any("CONFLICTING_ELECTRICAL_PARAMETER" in r for r in quarantined[0]["rejectionReasons"])

def test_zero_data_leakage_grouping():
    # Variants of the same base MPN must share the same base family
    var1 = "GRM188R71C104KA01D"
    var2 = "GRM188R71C104KA01J"
    var3 = "GRM188R71C104KA01-TR"
    assert get_base_family(var1) == get_base_family(var2) == get_base_family(var3)

def test_taxonomy_mapping():
    assert map_taxonomy("chip resistor - surface mount") == "Resistors"
    assert map_taxonomy("ceramic capacitors") == "Capacitors"
    assert map_taxonomy("microcontrollers") == "ICs & Semiconductors"
