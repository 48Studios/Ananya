"""
Authoritative Schema & Physical Sanity Validation Processor.

Validates:
1. Identifier completeness (MPN or SKU, Category, Name)
2. Malformed/placeholder MPNs (regex patterns)
3. Physical sanity bounds (resistance, capacitance, voltage, current, inductance, dimensions, mass)
4. Cross-source conflict detection (quarantines conflicting records rather than guessing)
5. Provenance audit
"""

import re
from typing import List, Dict, Any, Tuple, Optional
from .base import BaseProcessor, ProcessingDisposition, ProcessingAudit
from ..schemas.product import ProductRecord, VerificationStatus, EntityType


# Multi-domain physical sanity bounds
PHYSICAL_SANITY_BOUNDS: Dict[str, Dict[str, float]] = {
    # Electronics (SI Units)
    "resistance": {"min_si": 1e-4, "max_si": 1e11},     # 0.1 mOhm to 100 GigaOhm
    "capacitance": {"min_si": 1e-15, "max_si": 50.0},   # 0.001 pF to 50 Farad
    "voltage": {"min_si": 0.1, "max_si": 100000.0},     # 0.1 V to 100 kV
    "current": {"min_si": 1e-7, "max_si": 2000.0},      # 0.1 uA to 2000 A
    "inductance": {"min_si": 1e-12, "max_si": 500.0},   # 0.001 nH to 500 H
    # Mechanical & Materials (SI Units: meters, kilograms)
    "length": {"min_si": 1e-5, "max_si": 100.0},        # 0.01 mm to 100 meters
    "diameter": {"min_si": 1e-5, "max_si": 10.0},       # 0.01 mm to 10 meters
    "thread_pitch": {"min_si": 1e-4, "max_si": 0.05},   # 0.1 mm to 50 mm
    "weight": {"min_si": 1e-7, "max_si": 50000.0},      # 0.1 mg to 50 tons
}

INVALID_MPN_PATTERNS = [
    r"^tbd$",
    r"^n/?a$",
    r"^unknown$",
    r"^placeholder$",
    r"^test$",
    r"^xxx+$",
    r"^\?+$",
    r"^none$",
    r"^null$",
    r"^[\-_].*$",
]

NON_PRODUCT_CATEGORIES = {
    "login",
    "logout",
    "signin",
    "signout",
    "service contact",
    "service imprint",
    "service data privacy",
    "data privacy",
    "imprint",
    "impressum",
    "user profile",
    "dashboard",
    "my account",
    "press press releases",
    "press releases",
    "press release",
    "news center blog",
    "blog",
    "application notes appnotes author",
    "cookie settings",
    "shopping cart",
    "cart",
    "checkout",
    "about us",
    "contact us",
    "careers",
    "customer service",
    "terms and conditions",
    "terms of use",
    "terms of service",
    "privacy policy",
    "presse pressemeldungen",
    "pressemeldungen",
    "presse",
    "newscenter",
    "newscenter blog",
    "newscenter presse",
    "blog blog author",
    "knowledge application notes",
    "wissen application notes",
    "knowledge video center",
    "wissen video center",
    "video center",
    "application notes",
    "press and media",
    "support",
    "r and d at we technical articles r and d we",
}


class DataValidationProcessor(BaseProcessor):
    """Validates records against schema, bounds, and provenance rules."""

    name = "data_validation"

    def process(self, record: ProductRecord) -> Tuple[ProductRecord, ProcessingAudit]:
        reasons: List[str] = []
        disposition = ProcessingDisposition.ACCEPTED

        # 1. Identifier completeness
        identifier = (record.mpn or record.sku or "").strip()
        if not identifier:
            reasons.append("MISSING_IDENTIFIER: Both MPN and SKU are empty")
            disposition = ProcessingDisposition.REJECTED

        if not (record.name or "").strip():
            reasons.append("MISSING_NAME: Product name is empty")
            disposition = ProcessingDisposition.REJECTED
        elif (record.name or "").strip().lower().replace("&uuml;", "ü") in (
            "würth elektronik",
            "wuerth elektronik",
            "sparkfun electronics",
            "adafruit industries",
            "wiha",
            "prusa research",
            "e3d",
            "polymaker",
            "skf",
        ) and (record.mpn or "").startswith("AUTO-"):
            reasons.append("NON_PRODUCT_HOMEPAGE: Corporate entity name with synthetic MPN")
            disposition = ProcessingDisposition.REJECTED

        if not (record.category or "").strip():
            reasons.append("MISSING_CATEGORY: Category is empty")
            disposition = ProcessingDisposition.QUARANTINED
        elif record.category.strip().lower() in NON_PRODUCT_CATEGORIES:
            reasons.append(f"NON_PRODUCT_CATEGORY: Category '{record.category}' represents non-product web content")
            disposition = ProcessingDisposition.REJECTED

        # 2. Malformed / Placeholder checks
        if record.mpn:
            for pat in INVALID_MPN_PATTERNS:
                if re.search(pat, record.mpn.strip(), re.IGNORECASE):
                    reasons.append(f"MALFORMED_MPN: Placeholder or invalid part number '{record.mpn}'")
                    disposition = ProcessingDisposition.REJECTED
                    break

            is_document = getattr(record, "entity_type", EntityType.PRODUCT) == EntityType.DOCUMENT
            if record.mpn.startswith("AUTO-"):
                if not record.attributes and (record.category or "").strip().lower() in ("general", "unknown", "other", "uncategorized", "technical documentation"):
                    reasons.append(f"UNGROUNDED_PLACEHOLDER: Synthetic MPN '{record.mpn}' with no attributes and ungrounded category")
                    disposition = ProcessingDisposition.REJECTED
            elif record.mpn.startswith("PDF-") and not is_document:
                if not record.attributes and (record.category or "").strip().lower() in ("general", "unknown", "other", "uncategorized", "technical documentation"):
                    reasons.append(f"UNGROUNDED_PLACEHOLDER: Synthetic MPN '{record.mpn}' with no attributes and ungrounded category")
                    disposition = ProcessingDisposition.REJECTED
            elif record.mpn.startswith("PDF-") and is_document:
                has_docs = bool(getattr(record, "documents", None) or getattr(record, "document_references", None))
                if not has_docs and not record.attributes and not (record.name or "").strip():
                    reasons.append(f"EMPTY_DOCUMENT: Document entity '{record.mpn}' has no references or content")
                    disposition = ProcessingDisposition.REJECTED

        # 3. Provenance verification
        if not record.provenance:
            reasons.append("MISSING_PROVENANCE: Record has no provenance metadata")
            disposition = ProcessingDisposition.QUARANTINED
        else:
            if record.provenance.verification_status == VerificationStatus.REJECTED:
                reasons.append("PROVENANCE_REJECTED: Record explicitly marked as REJECTED in provenance")
                disposition = ProcessingDisposition.REJECTED
            elif record.provenance.verification_status == VerificationStatus.QUARANTINED:
                reasons.append("PROVENANCE_QUARANTINED: Record marked as QUARANTINED in provenance")
                disposition = ProcessingDisposition.QUARANTINED

        # 4. Physical sanity bounds
        for attr_code, attr_spec in record.attributes.items():
            norm_val = attr_spec.normalized_si
            if norm_val is not None:
                # Match normalized SI against bounds
                for bound_prop, bounds in PHYSICAL_SANITY_BOUNDS.items():
                    if bound_prop in attr_code.lower():
                        if norm_val < bounds["min_si"] or norm_val > bounds["max_si"]:
                            reasons.append(
                                f"IMPOSSIBLE_PHYSICAL_VALUE: Parameter '{attr_code}'={norm_val} outside physical bounds [{bounds['min_si']}, {bounds['max_si']}]"
                            )
                            disposition = ProcessingDisposition.QUARANTINED

        audit = ProcessingAudit(
            record_id=record.id or record.sku,
            disposition=disposition,
            reasons=reasons,
            processor_name=self.name,
        )
        return record, audit

    @classmethod
    def detect_cross_source_conflicts(
        cls, records: List[ProductRecord]
    ) -> Tuple[List[ProductRecord], List[Tuple[ProductRecord, ProcessingAudit]]]:
        """
        Cross-source conflict detection across a collection of records.
        If multiple authoritative records share the same normalized MPN but disagree on:
        - Category
        - Manufacturer
        - Key physical parameters
        BOTH/ALL records are QUARANTINED for operator audit.
        """
        by_mpn: Dict[str, List[ProductRecord]] = {}
        for r in records:
            key = re.sub(r"[\s\-_/]", "", (r.mpn or r.sku or "").upper())
            by_mpn.setdefault(key, []).append(r)

        passed: List[ProductRecord] = []
        flagged: List[Tuple[ProductRecord, ProcessingAudit]] = []

        processor = cls()

        for norm_key, group in by_mpn.items():
            if len(group) == 1:
                r, audit = processor.process(group[0])
                if audit.disposition == ProcessingDisposition.ACCEPTED:
                    passed.append(r)
                else:
                    flagged.append((r, audit))
            else:
                # Check for category disagreements
                categories = {g.category.strip().lower() for g in group if g.category}
                manufacturers = {
                    (g.manufacturer or "").strip().lower()
                    for g in group
                    if g.manufacturer and g.manufacturer.lower() != "unknown"
                }

                conflicts = []
                if len(categories) > 1:
                    conflicts.append(f"CONFLICTING_CATEGORIES: Sources disagree on category: {list(categories)}")
                if len(manufacturers) > 1:
                    conflicts.append(f"CONFLICTING_MANUFACTURERS: Sources disagree on manufacturer: {list(manufacturers)}")

                # Check attribute conflicts
                common_attrs = set()
                for g in group:
                    common_attrs.update(g.attributes.keys())

                for attr_key in common_attrs:
                    vals = {
                        g.attributes[attr_key].normalized_si
                        for g in group
                        if attr_key in g.attributes and g.attributes[attr_key].normalized_si is not None
                    }
                    if len(vals) > 1:
                        conflicts.append(f"CONFLICTING_PHYSICAL_PARAMETER: Sources disagree on '{attr_key}': {list(vals)}")

                if conflicts:
                    for g in group:
                        audit = ProcessingAudit(
                            record_id=g.id or g.sku,
                            disposition=ProcessingDisposition.QUARANTINED,
                            reasons=conflicts,
                            processor_name=cls.name,
                        )
                        flagged.append((g, audit))
                else:
                    # Records agree 100%! Accept primary
                    primary = group[0]
                    r, audit = processor.process(primary)
                    if audit.disposition == ProcessingDisposition.ACCEPTED:
                        passed.append(r)
                    else:
                        flagged.append((r, audit))

        return passed, flagged
