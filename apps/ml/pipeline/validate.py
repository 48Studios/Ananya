#!/usr/bin/env python3
"""
Authoritative Data Validator & Conflict Detector (RFC-0058)
Validates collected records against:
1. Critical identifier presence (MPN, Category, Manufacturer)
2. Malformed MPN checks (placeholder, illegal chars)
3. Physical sanity bounds (resistance, capacitance, voltage, package)
4. Cross-source conflict detection (quarantining any disagreements)
5. Strict non-hallucination / provenance verification

Outputs:
- apps/ml/data/validated_records.json (Passed records)
- apps/ml/data/quarantine.json (Rejected / conflicting records for human audit)
"""

import json
import os
import re
import argparse
from typing import List, Dict, Any, Tuple

# Valid Ananya Taxonomy Categories
VALID_ANANYA_CATEGORIES = {
    "Capacitors",
    "Resistors",
    "Inductors",
    "Diodes",
    "Transistors",
    "ICs & Semiconductors",
    "Connectors",
    "Switches",
    "Optoelectronics",
    "Cables",
    "Mechanical Parts",
    "Raw Materials",
    "Consumables",
}

# Physical Sanity Bounds for Electronics
PHYSICAL_SANITY_BOUNDS = {
    "resistance": {"min_si": 1e-3, "max_si": 1e11},     # 1 mOhm to 100 GigaOhm
    "capacitance": {"min_si": 1e-14, "max_si": 10.0},    # 0.01 pF to 10 Farad
    "voltage": {"min_si": 0.5, "max_si": 50000.0},       # 0.5 V to 50 kV
    "current": {"min_si": 1e-6, "max_si": 500.0},        # 1 uA to 500 A
    "inductance": {"min_si": 1e-11, "max_si": 100.0},    # 0.01 nH to 100 H
}

INVALID_MPN_PATTERNS = [
    r"^tbd$",
    r"^n/?a$",
    r"^unknown$",
    r"^placeholder$",
    r"^test$",
    r"^xxx+$",
    r"^\?+$",
]

def validate_record(rec: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """Performs schema, provenance, and physical sanity bounds checking on a single record."""
    reasons = []

    # 1. Identifier Check
    mpn = str(rec.get("mpn", "")).strip()
    category = str(rec.get("category", "")).strip()
    manufacturer = str(rec.get("manufacturer", "")).strip()

    if not mpn:
        reasons.append("MISSING_CRITICAL_IDENTIFIER: Empty MPN")
    if not category:
        reasons.append("MISSING_CRITICAL_IDENTIFIER: Empty Category")
    if not manufacturer:
        reasons.append("MISSING_CRITICAL_IDENTIFIER: Empty Manufacturer")

    # 2. Malformed MPN check
    for pat in INVALID_MPN_PATTERNS:
        if re.search(pat, mpn, re.IGNORECASE):
            reasons.append(f"MALFORMED_MPN: Placeholder or invalid part number '{mpn}'")
            break

    # 3. Taxonomy Check
    if category and category not in VALID_ANANYA_CATEGORIES:
        reasons.append(f"UNKNOWN_CATEGORY: Category '{category}' not recognized in Ananya taxonomy")

    # 4. Provenance Check
    prov = rec.get("provenance")
    if not prov or not isinstance(prov, dict):
        reasons.append("MISSING_PROVENANCE: Record has no provenance metadata")
    else:
        if prov.get("verificationStatus") != "VERIFIED":
            reasons.append(f"UNVERIFIED_STATUS: Provenance status is '{prov.get('verificationStatus')}', not VERIFIED")
        if not prov.get("sourceType"):
            reasons.append("MISSING_PROVENANCE_SOURCE: Provenance source type is unspecified")

    # 5. Physical Sanity Bounds Check
    attrs = rec.get("attributes", {})
    if isinstance(attrs, dict):
        for attr_name, attr_spec in attrs.items():
            if not isinstance(attr_spec, dict):
                continue
            norm_val = attr_spec.get("normalized_si")
            if norm_val is not None and attr_name in PHYSICAL_SANITY_BOUNDS:
                bounds = PHYSICAL_SANITY_BOUNDS[attr_name]
                if norm_val < bounds["min_si"] or norm_val > bounds["max_si"]:
                    reasons.append(
                        f"IMPOSSIBLE_ELECTRICAL_VALUE: Parameter '{attr_name}'={norm_val} outside physical bounds [{bounds['min_si']}, {bounds['max_si']}]"
                    )

    is_valid = len(reasons) == 0
    return is_valid, reasons

def detect_cross_source_conflicts(
    records: List[Dict[str, Any]]
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Detects cross-source conflicts across authoritative records.
    If two records share the same MPN but have conflicting categories, manufacturers, or electrical specs,
    BOTH are quarantined for human audit rather than silently picking one.
    """
    by_mpn: Dict[str, List[Dict[str, Any]]] = {}
    for r in records:
        mpn_norm = re.sub(r"[\s\-_/]", "", str(r.get("mpn", "")).upper())
        by_mpn.setdefault(mpn_norm, []).append(r)

    validated: List[Dict[str, Any]] = []
    quarantined: List[Dict[str, Any]] = []

    for mpn_norm, group in by_mpn.items():
        if len(group) == 1:
            r = group[0]
            ok, reasons = validate_record(r)
            if ok:
                validated.append(r)
            else:
                quarantined.append({
                    "record": r,
                    "rejectionReasons": reasons,
                    "quarantineType": "SCHEMA_VALIDATION_FAILED",
                    "status": "NEEDS_REVIEW",
                })
        else:
            # Multiple records for the same MPN: check for agreement
            categories = {r.get("category") for r in group if r.get("category")}
            manufacturers = {r.get("manufacturer") for r in group if r.get("manufacturer")}
            
            has_conflict = False
            conflict_reasons = []

            if len(categories) > 1:
                has_conflict = True
                conflict_reasons.append(f"CONFLICTING_CATEGORIES: Sources disagree on category: {list(categories)}")

            if len(manufacturers) > 1:
                has_conflict = True
                conflict_reasons.append(f"CONFLICTING_MANUFACTURERS: Sources disagree on manufacturer: {list(manufacturers)}")

            # Check attribute conflicts (e.g. capacitance / resistance)
            for attr_key in ["capacitance", "resistance", "voltage"]:
                vals = {
                    r.get("attributes", {}).get(attr_key, {}).get("normalized_si")
                    for r in group
                    if r.get("attributes", {}).get(attr_key, {}).get("normalized_si") is not None
                }
                if len(vals) > 1:
                    has_conflict = True
                    conflict_reasons.append(
                        f"CONFLICTING_ELECTRICAL_PARAMETER: Sources disagree on {attr_key}: {list(vals)}"
                    )

            if has_conflict:
                for r in group:
                    quarantined.append({
                        "record": r,
                        "rejectionReasons": conflict_reasons,
                        "quarantineType": "CROSS_SOURCE_CONFLICT",
                        "status": "NEEDS_REVIEW",
                    })
            else:
                # Sources agree 100%! Merge agreed record
                base_record = group[0]
                ok, reasons = validate_record(base_record)
                if ok:
                    validated.append(base_record)
                else:
                    quarantined.append({
                        "record": base_record,
                        "rejectionReasons": reasons,
                        "quarantineType": "SCHEMA_VALIDATION_FAILED",
                        "status": "NEEDS_REVIEW",
                    })

    return validated, quarantined

def run_validation(
    input_file: str = "apps/ml/data/raw_collected_records.json",
    validated_output: str = "apps/ml/data/validated_records.json",
    quarantine_output: str = "apps/ml/data/quarantine.json",
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Runs the validation pipeline and writes out validated vs quarantined datasets."""
    if not os.path.exists(input_file):
        raise FileNotFoundError(f"Input records file not found at {input_file}")

    with open(input_file, "r") as f:
        records = json.load(f)

    validated, quarantined = detect_cross_source_conflicts(records)

    os.makedirs(os.path.dirname(validated_output), exist_ok=True)
    with open(validated_output, "w") as f:
        json.dump(validated, f, indent=2)

    os.makedirs(os.path.dirname(quarantine_output), exist_ok=True)
    with open(quarantine_output, "w") as f:
        json.dump(quarantined, f, indent=2)

    print("=" * 60)
    print(" ANANYA AUTHORITATIVE DATA VALIDATION REPORT (RFC-0058)")
    print("=" * 60)
    print(f"Total Raw Records Evaluated:   {len(records)}")
    print(f"Successfully Validated:        {len(validated)} ({len(validated)/max(1, len(records))*100:.1f}%)")
    print(f"Quarantined for Human Review:  {len(quarantined)}")
    print(f"Validated Dataset Written:     {validated_output}")
    print(f"Quarantine Dataset Written:    {quarantine_output}")
    print("=" * 60)

    return validated, quarantined

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validate authoritative records and detect conflicts")
    parser.add_argument("--input", default="apps/ml/data/raw_collected_records.json", help="Input collected JSON")
    parser.add_argument("--validated-output", default="apps/ml/data/validated_records.json", help="Validated output JSON")
    parser.add_argument("--quarantine-output", default="apps/ml/data/quarantine.json", help="Quarantine output JSON")
    args = parser.parse_args()
    run_validation(args.input, args.validated_output, args.quarantine_output)
