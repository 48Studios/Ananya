"""
Cross-Source Quality & Entity Resolution Analyzer.

Evaluates multi-source consistency and linkage across product records:
1. Same MPN across multiple sources / distributors
2. Manufacturer and brand aliases
3. Distributor naming differences
4. Packaging suffix differences across sources
5. Unit and physical parameter normalization reconciliation
6. Category hierarchy harmonization
7. Equivalent products and product-family variants
"""

import re
from typing import List, Dict, Any, Tuple, Optional
from collections import defaultdict
from ..schemas.product import ProductRecord
from .normalization import MANUFACTURER_ALIASES, strip_packaging_suffix


class CrossSourceAnalyzer:
    """Performs deep cross-source linkage and consistency analysis."""

    def __init__(self, records: List[ProductRecord]):
        self.records = records

    def analyze(self) -> Dict[str, Any]:
        """Runs comprehensive cross-source quality metrics."""
        # 1. Group records by normalized MPN
        mpn_to_records: Dict[str, List[ProductRecord]] = defaultdict(list)
        base_mpn_to_records: Dict[str, List[ProductRecord]] = defaultdict(list)
        source_records: Dict[str, List[ProductRecord]] = defaultdict(list)
        mfg_set: set = set()

        for r in self.records:
            source_id = r.provenance.source_id if r.provenance else "unknown"
            source_records[source_id].append(r)
            if r.manufacturer and r.manufacturer.lower() not in ("unknown", "generic"):
                mfg_set.add(r.manufacturer)

            if r.mpn:
                norm_mpn = re.sub(r"[\s\-_/]", "", r.mpn.upper())
                mpn_to_records[norm_mpn].append(r)
                _, base_mpn_str = strip_packaging_suffix(r.mpn)
                base_mpn = base_mpn_str.upper()
                norm_base = re.sub(r"[\s\-_/]", "", base_mpn)
                base_mpn_to_records[norm_base].append(r)

        # 2. Same MPN across multiple sources
        same_mpn_cross_source = []
        for norm_mpn, group in mpn_to_records.items():
            sources = {g.provenance.source_id for g in group if g.provenance}
            if len(sources) > 1:
                same_mpn_cross_source.append({
                    "mpn": group[0].mpn,
                    "normalized_mpn": norm_mpn,
                    "sources": list(sources),
                    "count": len(group),
                    "manufacturers": list({g.manufacturer for g in group if g.manufacturer}),
                })

        # 3. Packaging suffix differences across sources
        packaging_suffix_variants = []
        for norm_base, group in base_mpn_to_records.items():
            sources = {g.provenance.source_id for g in group if g.provenance}
            unique_mpns = {g.mpn for g in group if g.mpn}
            if len(sources) > 1 and len(unique_mpns) > 1:
                packaging_suffix_variants.append({
                    "base_mpn": norm_base,
                    "mpns": list(unique_mpns),
                    "sources": list(sources),
                })

        # 4. Distributor naming differences
        distributor_naming_diffs = []
        for item in same_mpn_cross_source:
            norm_mpn = item["normalized_mpn"]
            group = mpn_to_records[norm_mpn]
            names = {g.name for g in group if g.name}
            if len(names) > 1:
                distributor_naming_diffs.append({
                    "mpn": item["mpn"],
                    "sources": item["sources"],
                    "names": list(names),
                })

        # 5. Manufacturer Aliases detected
        mfg_alias_matches = []
        for mfg in mfg_set:
            norm_mfg = mfg.strip().lower()
            if norm_mfg in MANUFACTURER_ALIASES:
                canonical = MANUFACTURER_ALIASES[norm_mfg]
                if canonical.lower() != norm_mfg:
                    mfg_alias_matches.append({
                        "raw": mfg,
                        "canonical": canonical,
                    })

        # 6. Category naming differences across sources
        category_cross_differences = []
        for item in same_mpn_cross_source:
            norm_mpn = item["normalized_mpn"]
            group = mpn_to_records[norm_mpn]
            categories = {g.category for g in group if g.category}
            if len(categories) > 1:
                category_cross_differences.append({
                    "mpn": item["mpn"],
                    "categories": list(categories),
                    "sources": item["sources"],
                })

        # 7. Unit differences normalized
        unit_reconciliations = []
        for item in same_mpn_cross_source:
            norm_mpn = item["normalized_mpn"]
            group = mpn_to_records[norm_mpn]
            attrs_seen = defaultdict(set)
            for g in group:
                for k, v in g.attributes.items():
                    if v.raw_value:
                        attrs_seen[k].add(f"{v.raw_value} ({g.provenance.source_id})")
            for k, raw_vals in attrs_seen.items():
                if len(raw_vals) > 1:
                    unit_reconciliations.append({
                        "mpn": item["mpn"],
                        "attribute": k,
                        "raw_representations": list(raw_vals),
                    })

        # 8. Product family variants
        family_variants_count = len(packaging_suffix_variants)

        return {
            "sources_analyzed": len(source_records),
            "total_records": len(self.records),
            "same_mpn_cross_source_count": len(same_mpn_cross_source),
            "same_mpn_cross_source_samples": same_mpn_cross_source[:10],
            "packaging_suffix_variants_count": len(packaging_suffix_variants),
            "packaging_suffix_samples": packaging_suffix_variants[:10],
            "distributor_naming_diffs_count": len(distributor_naming_diffs),
            "distributor_naming_samples": distributor_naming_diffs[:10],
            "manufacturer_aliases_count": len(mfg_alias_matches),
            "manufacturer_aliases_samples": mfg_alias_matches[:10],
            "category_cross_differences_count": len(category_cross_differences),
            "category_cross_samples": category_cross_differences[:10],
            "unit_reconciliations_count": len(unit_reconciliations),
            "unit_reconciliation_samples": unit_reconciliations[:10],
            "product_family_variants_count": family_variants_count,
        }
