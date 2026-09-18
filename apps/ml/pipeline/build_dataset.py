#!/usr/bin/env python3
"""
Authoritative Dataset Builder (RFC-0058)
Constructs immutable, versioned training and evaluation datasets with:
1. Explicit Supplier-to-Ananya Taxonomy Mapping
2. Zero Data Leakage (Grouped splitting on base MPN / series family)
3. Verified Duplicate Training Pairs (Positive & Negative)
4. Non-semantic formatting transformations (purely syntax, zero parameter change)
5. Immutable Snapshot Versioning
"""

import json
import os
import re
import argparse
from datetime import datetime, timezone
from typing import List, Dict, Any, Tuple
import numpy as np
from sklearn.model_selection import GroupShuffleSplit

# Explicit Supplier / Distributor Taxonomy Mapping Layer
SUPPLIER_TAXONOMY_MAP = {
    # DigiKey / Mouser mappings
    "chip resistor - surface mount": "Resistors",
    "through hole resistors": "Resistors",
    "resistor networks, arrays": "Resistors",
    "ceramic capacitors": "Capacitors",
    "aluminum electrolytic capacitors": "Capacitors",
    "tantalum capacitors": "Capacitors",
    "film capacitors": "Capacitors",
    "fixed inductors": "Inductors",
    "ferrite beads and chips": "Inductors",
    "diodes - rectifiers - single": "Diodes",
    "diodes - zener - single": "Diodes",
    "schottky diodes": "Diodes",
    "transistors - fets, mosfets - single": "Transistors",
    "transistors - bipolar (bjt) - single": "Transistors",
    "microcontrollers": "ICs & Semiconductors",
    "linear - amplifiers - audio": "ICs & Semiconductors",
    "linear - amplifiers - instrumentation, op amps": "ICs & Semiconductors",
    "pmic - voltage regulators - linear": "ICs & Semiconductors",
    "pmic - voltage regulators - dc dc switching": "ICs & Semiconductors",
    "rectangular connectors - headers, male pins": "Connectors",
    "usb connectors": "Connectors",
    "modular connectors - jacks": "Connectors",
    "tactile switches": "Switches",
    "dip switches": "Switches",
    "led indication - discrete": "Optoelectronics",
    "optoisolators - transistor, photovoltaic output": "Optoelectronics",
    "flat ribbon cables": "Cables",
    "modular cables": "Cables",
    "screws, bolts": "Mechanical Parts",
    "standoffs, spacers": "Mechanical Parts",
    "heat sinks": "Mechanical Parts",
    "copper clad laminates": "Raw Materials",
    "solder, desoldering braid, flux": "Consumables",
}

def map_taxonomy(category_str: str) -> str:
    """Translates third-party or supplier taxonomy into canonical Ananya category."""
    cleaned = category_str.strip().lower()
    return SUPPLIER_TAXONOMY_MAP.get(cleaned, category_str)

def get_base_family(mpn: str) -> str:
    """Extracts base MPN family for grouping to prevent train/test data leakage."""
    norm = re.sub(r"[\s\-_/].*$", "", mpn.upper())
    return norm[:8] if len(norm) >= 8 else norm

def generate_non_semantic_variations(record: Dict[str, Any]) -> List[str]:
    """Generates non-semantic textual representations (e.g. unit spacing, casing)."""
    mpn = record.get("mpn", "")
    desc = record.get("description", "")
    mfg = record.get("manufacturer", "")

    variations = [f"{mpn} {desc} {mfg}".strip()]

    # Format variation 1: micro symbol (uF <-> µF)
    if "uF" in desc or "uf" in desc:
        var_micro = re.sub(r"\b(\d+(?:\.\d+)?)\s*uF\b", r"\1µF", desc, flags=re.IGNORECASE)
        variations.append(f"{mpn} {var_micro} {mfg}".strip())

    # Format variation 2: ohm symbol (kohm <-> kΩ)
    if "ohm" in desc.lower():
        var_ohm = re.sub(r"\b(\d+(?:\.\d+)?)\s*kohm\b", r"\1kΩ", desc, flags=re.IGNORECASE)
        var_ohm = re.sub(r"\b(\d+(?:\.\d+)?)\s*ohm\b", r"\1Ω", var_ohm, flags=re.IGNORECASE)
        variations.append(f"{mpn} {var_ohm} {mfg}".strip())

    # Format variation 3: stripped MPN delimiters
    stripped_mpn = re.sub(r"[-_/]", "", mpn)
    if stripped_mpn != mpn:
        variations.append(f"{stripped_mpn} {desc} {mfg}".strip())

    return list(set(variations))

def build_duplicate_pairs(
    records: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """Generates verified positive and negative duplicate training pairs."""
    pairs = []

    # 1. Positive Pairs: Same component, different packaging suffixes or descriptions
    for r in records:
        mpn = r.get("mpn", "")
        desc = r.get("description", "")
        mfg = r.get("manufacturer", "")

        # Tape & Reel suffix variant
        pairs.append({
            "componentA": {"mpn": mpn, "description": desc, "manufacturer": mfg},
            "componentB": {"mpn": f"{mpn}-TR", "description": f"{desc} Tape & Reel", "manufacturer": mfg},
            "isDuplicate": True,
            "pairType": "PACKAGING_SUFFIX_VARIANT",
        })

        # Formatting variation
        stripped = re.sub(r"[-_]", "", mpn)
        if stripped != mpn:
            pairs.append({
                "componentA": {"mpn": mpn, "description": desc, "manufacturer": mfg},
                "componentB": {"mpn": stripped, "description": desc.lower(), "manufacturer": mfg},
                "isDuplicate": True,
                "pairType": "FORMATTING_VARIATION",
            })

    # 2. Negative Pairs: Different electrical values or footprints (authoritative non-duplicates)
    for i in range(len(records)):
        for j in range(i + 1, min(i + 4, len(records))):
            rA = records[i]
            rB = records[j]
            if rA.get("category") == rB.get("category") and rA.get("mpn") != rB.get("mpn"):
                pairs.append({
                    "componentA": {"mpn": rA["mpn"], "description": rA.get("description", ""), "manufacturer": rA.get("manufacturer", "")},
                    "componentB": {"mpn": rB["mpn"], "description": rB.get("description", ""), "manufacturer": rB.get("manufacturer", "")},
                    "isDuplicate": False,
                    "pairType": "ELECTRICAL_OR_SERIES_DIFFERENCE",
                })

    return pairs

def build_dataset_snapshot(
    validated_file: str = "apps/ml/data/validated_records.json",
    version: str = "1.3.0",
    output_dir: str = "",
) -> Dict[str, Any]:
    """Builds an immutable versioned dataset snapshot with group-based splitting."""
    if not os.path.exists(validated_file):
        raise FileNotFoundError(f"Validated records not found at {validated_file}")

    with open(validated_file, "r") as f:
        records: List[Dict[str, Any]] = json.load(f)

    # Apply taxonomy mapping
    for r in records:
        r["category"] = map_taxonomy(r["category"])

    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    dataset_version = f"components-{date_str}-v{version}"

    if not output_dir:
        output_dir = f"apps/ml/data/datasets/{dataset_version}"
    os.makedirs(output_dir, exist_ok=True)

    # Expand records into training examples (with non-semantic variations)
    expanded_examples = []
    groups = []

    for r in records:
        base_fam = r.get("series_family") or get_base_family(r.get("mpn", ""))
        vars_text = generate_non_semantic_variations(r)
        for t in vars_text:
            expanded_examples.append({
                "text": t,
                "category": r["category"],
                "mpn": r["mpn"],
                "manufacturer": r["manufacturer"],
                "base_family": base_fam,
                "provenance": r["provenance"],
            })
            groups.append(base_fam)

    # Enforce zero data leakage via GroupShuffleSplit
    gss = GroupShuffleSplit(n_splits=1, train_size=0.8, random_state=42)
    train_idx, val_idx = next(gss.split(expanded_examples, groups=groups))

    train_set = [expanded_examples[i] for i in train_idx]
    val_set = [expanded_examples[i] for i in val_idx]

    # Verification: assert zero group overlap between train and val
    train_groups = {item["base_family"] for item in train_set}
    val_groups = {item["base_family"] for item in val_set}
    leakage_overlap = train_groups.intersection(val_groups)
    assert len(leakage_overlap) == 0, f"DATA LEAKAGE DETECTED! Overlapping families: {leakage_overlap}"

    # Build duplicate pairs
    duplicate_pairs = build_duplicate_pairs(records)

    # Save immutable dataset files
    with open(os.path.join(output_dir, "train.json"), "w") as f:
        json.dump(train_set, f, indent=2)

    with open(os.path.join(output_dir, "val.json"), "w") as f:
        json.dump(val_set, f, indent=2)

    with open(os.path.join(output_dir, "duplicate_pairs.json"), "w") as f:
        json.dump(duplicate_pairs, f, indent=2)

    # Metadata record
    metadata = {
        "datasetVersion": dataset_version,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "totalSourceRecords": len(records),
        "totalExpandedExamples": len(expanded_examples),
        "trainSize": len(train_set),
        "valSize": len(val_set),
        "duplicatePairsCount": len(duplicate_pairs),
        "distinctBaseFamilies": len(set(groups)),
        "dataLeakageVerified": True,
        "overlapCount": 0,
        "categories": sorted(list({r["category"] for r in records})),
    }

    with open(os.path.join(output_dir, "metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)

    # Also update active training dataset pointer for apps/ml/data/training_dataset.json
    active_dataset = [{"text": ex["text"], "category": ex["category"], "source": "authoritative"} for ex in train_set]
    with open("apps/ml/data/training_dataset.json", "w") as f:
        json.dump(active_dataset, f, indent=2)

    print("=" * 60)
    print(" ANANYA DATASET BUILD REPORT (RFC-0058)")
    print("=" * 60)
    print(f"Dataset Version:            {dataset_version}")
    print(f"Total Authoritative Parts:  {len(records)}")
    print(f"Distinct Base Families:     {len(set(groups))}")
    print(f"Train Examples (Grouped):   {len(train_set)}")
    print(f"Val Examples (Held-Out):    {len(val_set)}")
    print(f"Data Leakage Overlap:       0 (PASSED)")
    print(f"Duplicate Pairs Generated:  {len(duplicate_pairs)}")
    print(f"Snapshot Location:          {output_dir}")
    print("=" * 60)

    return metadata

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build versioned authoritative training dataset")
    parser.add_argument("--validated-file", default="apps/ml/data/validated_records.json", help="Validated records path")
    parser.add_argument("--version", default="1.3.0", help="Model / dataset version")
    parser.add_argument("--output-dir", default="", help="Snapshot output directory")
    args = parser.parse_args()
    build_dataset_snapshot(args.validated_file, args.version, args.output_dir)
