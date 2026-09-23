import re
from typing import List, Optional
from ..schemas import ExistingComponent, DuplicateCandidate, DetectDuplicatesResponse, EvidenceItem, DataPackIntelligenceHint

def normalize_part_number(s: str) -> str:
    """Canonicalize part numbers by stripping all non-alphanumerics and uppercasing."""
    return re.sub(r"[^A-Za-z0-9]", "", s or "").upper()

def strip_packaging_suffix(mpn: str) -> str:
    """Strip common packaging suffixes (e.g. -TR, -07, TAPE, REEL, TU, CTU) for equivalent MPN comparison."""
    norm = normalize_part_number(mpn)
    suffixes = ["TR", "REEL", "TAPE", "7R", "07", "13", "CTU", "TU"]
    for s in suffixes:
        if norm.endswith(s) and len(norm) > len(s) + 4:
            return norm[:-len(s)]
    return norm

#: Shortest normalized part number treated as an identifier. Below this a value
#: is too generic (a bare "0603") for a match to mean the same part.
MIN_IDENTIFIER_LENGTH = 6

#: Text similarity a candidate must already have before attribute agreement is
#: allowed to corroborate it. Corroboration may strengthen a real resemblance; it
#: must never manufacture one, or every pair of parts sharing generic values
#: (100 nF / 50 V / X7R / 0603) reads as a duplicate.
CORROBORATION_TEXT_FLOOR = 0.30

#: How much attribute agreement may add, by number of matching attributes.
CORROBORATION_BOOST = {2: 0.10, 3: 0.20}

#: Ceiling for a corroborated score. Agreement is evidence, not proof, so a
#: candidate never reaches certainty on attribute overlap alone.
CORROBORATION_CEILING = 0.95

class DuplicateDetectorService:
    def detect(
        self,
        part_number: str,
        description: str = "",
        existing_components: List[ExistingComponent] = None,
        similarity_threshold: float = 0.75,
        datapack_hints: Optional[List[DataPackIntelligenceHint]] = None,
    ) -> DetectDuplicatesResponse:
        if not existing_components:
            return DetectDuplicatesResponse(is_duplicate=False, matches=[])

        pn_norm = normalize_part_number(part_number)
        pn_base = strip_packaging_suffix(part_number)
        desc_norm = normalize_part_number(description)
        matches: List[DuplicateCandidate] = []

        from .datasheet_extractor import datasheet_extractor
        q_text = f"{part_number} {description}"
        q_attrs = datasheet_extractor.extract_attributes(q_text, datapack_hints)

        guarded_attributes = (
            "resistance",
            "capacitance",
            "inductance",
            "voltage",
            "package",
            "tolerance",
            "dielectric",
            "power",
            "current",
        )

        def has_physical_conflict(c_attrs) -> bool:
            for attr_key in guarded_attributes:
                if attr_key in q_attrs and attr_key in c_attrs:
                    q_val = str(q_attrs[attr_key].value).strip().upper()
                    c_val = str(c_attrs[attr_key].value).strip().upper()
                    if q_val != c_val:
                        return True
            return False

        # TIER 1: Exact MPN / SKU / Vendor part match (Authoritative)
        for comp in existing_components:
            sku_norm = normalize_part_number(comp.sku)
            sku_base = strip_packaging_suffix(comp.sku)
            mpn = comp.manufacturer_part_number or ""
            mpn_norm = normalize_part_number(mpn)
            mpn_base = strip_packaging_suffix(mpn) if mpn else ""
            desc_text = comp.description or ""
            comp_text = f"{comp.sku} {comp.name or ''} {desc_text}"
            c_attrs = datasheet_extractor.extract_attributes(comp_text, datapack_hints)

            # Extract vendor part from description if present
            m = re.search(r"Vendor part:\s*([^\s,;]+)", desc_text, re.IGNORECASE)
            vendor_pn = normalize_part_number(m.group(1)) if m else ""
            vendor_base = strip_packaging_suffix(m.group(1)) if m else ""

            # 1. Exact manufacturer part number. This is the part's identity, so
            # it is checked before anything else and is NOT suppressed by an
            # attribute conflict: two records carrying the same MPN are the same
            # part, and a disagreement between them is drifted data the reviewer
            # needs to see rather than a reason to stay silent.
            if pn_norm and mpn_norm and pn_norm == mpn_norm:
                conflict_note = (
                    " Stored specifications disagree with the query, so one of "
                    "the two records needs review."
                    if has_physical_conflict(c_attrs)
                    else ""
                )
                matches.append(DuplicateCandidate(
                    id=comp.id,
                    sku=comp.sku,
                    similarity=1.0,
                    confidence_level="HIGH",
                    match_type="exact_mpn",
                    reason=f"Exact manufacturer part-number match: '{mpn}'.{conflict_note}",
                    evidence=[
                        EvidenceItem(
                            type="mpn_pattern",
                            description=f"Normalized part number is identical to '{mpn}'",
                            weight=1.0,
                            source="exact:mpn",
                        )
                    ],
                ))
                continue

            # 2. Check exact SKU match (highest priority, only if no explicit parameter conflict)
            if pn_norm and pn_norm == sku_norm:
                if not has_physical_conflict(c_attrs):
                    matches.append(DuplicateCandidate(
                        id=comp.id,
                        sku=comp.sku,
                        similarity=1.0,
                        confidence_level="HIGH",
                        match_type="exact_sku",
                        reason=f"Exact normalized SKU match: '{comp.sku}'",
                        evidence=[
                            EvidenceItem(
                                type="mpn_pattern",
                                description=f"Exact normalized part-number match ({comp.sku})",
                                weight=1.0,
                                source="exact:sku",
                            )
                        ],
                    ))
                    continue

            # 3. Check exact vendor part match
            if vendor_pn and (pn_norm == vendor_pn or vendor_pn in desc_norm):
                if not has_physical_conflict(c_attrs):
                    matches.append(DuplicateCandidate(
                        id=comp.id,
                        sku=comp.sku,
                        similarity=1.0,
                        confidence_level="HIGH",
                        match_type="exact_mpn",
                        reason=f"Exact manufacturer part-number match: '{m.group(1)}'",
                        evidence=[
                            EvidenceItem(
                                type="mpn_pattern",
                                description=f"Exact manufacturer part-number match with '{m.group(1)}'",
                                weight=1.0,
                                source="exact:vendor_pn",
                            )
                        ],
                    ))
                    continue

            # 4. Check base MPN match (ignoring reel/packaging suffixes). The
            # stored MPN is the identity; the SKU and the description's vendor
            # part are kept as legacy fallbacks for records that predate it.
            candidate_bases = [b for b in (mpn_base, sku_base, vendor_base) if b]
            if (
                pn_base
                and len(pn_base) >= MIN_IDENTIFIER_LENGTH
                and any(pn_base == b for b in candidate_bases)
            ):
                if not has_physical_conflict(c_attrs):
                    matches.append(DuplicateCandidate(
                        id=comp.id,
                        sku=comp.sku,
                        similarity=0.98,
                        confidence_level="HIGH",
                        match_type="exact_mpn",
                        reason=(
                            "Equivalent manufacturer part number "
                            f"(packaging suffix variant of '{mpn or comp.sku}')"
                        ),
                        evidence=[
                            EvidenceItem(
                                type="mpn_pattern",
                                description="Base part number is identical; differs only in tape/reel packaging code",
                                weight=0.98,
                                source="base:mpn",
                            )
                        ],
                    ))
                    continue

            # 5. Substring match if part number is substantial (>5 chars)
            if len(pn_norm) >= MIN_IDENTIFIER_LENGTH and (
                pn_norm in sku_norm
                or sku_norm in pn_norm
                or (mpn_norm and (pn_norm in mpn_norm or mpn_norm in pn_norm))
            ):
                if not has_physical_conflict(c_attrs):
                    matches.append(DuplicateCandidate(
                        id=comp.id,
                        sku=comp.sku,
                        similarity=0.92,
                        confidence_level="HIGH",
                        match_type="exact_mpn",
                        reason=(
                            "Significant normalized part number overlap with "
                            f"'{mpn or comp.sku}'"
                        ),
                        evidence=[
                            EvidenceItem(
                                type="mpn_pattern",
                                description="Normalized part number string contains high overlap",
                                weight=0.92,
                                source="substr:mpn",
                            )
                        ],
                    ))

        if matches:
            return DetectDuplicatesResponse(is_duplicate=True, matches=matches)

        # TIER 2: Advisory Semantic Similarity WITH Strict Electrical & Physical Guards
        def get_char_ngrams(text: str, n: int = 3):
            clean = normalize_part_number(text)
            if len(clean) < n:
                return {clean}
            return {clean[i:i+n] for i in range(len(clean) - n + 1)}

        query_ngrams = get_char_ngrams(q_text)

        for comp in existing_components:
            # Descriptive text only. The SKU is the ERP's internal key
            # (`CMP-000305`) and carries no information about the part, so
            # including it made textual similarity depend on the ERP's numbering
            # and diluted the very overlap this tier measures. Attributes are
            # still read from the SKU-bearing text, where identifiers can matter.
            full_text = f"{comp.sku} {comp.name or ''} {comp.description or ''}"
            comp_text = f"{comp.name or ''} {comp.description or ''}".strip()
            c_attrs = datasheet_extractor.extract_attributes(full_text, datapack_hints)

            # Strict guard: physical conflict rejects duplicate outright
            if has_physical_conflict(c_attrs):
                continue

            comp_ngrams = get_char_ngrams(comp_text)
            intersection = len(query_ngrams & comp_ngrams)
            union = len(query_ngrams | comp_ngrams)
            text_similarity = intersection / union if union > 0 else 0.0
            sim = text_similarity

            # Attribute agreement corroborates a resemblance the text already
            # shows. It used to force the score to 0.85 outright, which reported
            # an invented number and flagged any two parts sharing generic values
            # (100 nF / 50 V / X7R / 0603) as duplicates however differently they
            # were described. It now only adds, and only above the floor.
            matching_param_count = sum(1 for k in guarded_attributes if k in q_attrs and k in c_attrs)
            corroborated = text_similarity >= CORROBORATION_TEXT_FLOOR
            if corroborated and matching_param_count >= 3:
                sim = min(CORROBORATION_CEILING, text_similarity + CORROBORATION_BOOST[3])
            elif corroborated and matching_param_count >= 2:
                sim = min(CORROBORATION_CEILING, text_similarity + CORROBORATION_BOOST[2])

            if sim >= similarity_threshold:
                ev_items = [
                    EvidenceItem(
                        type="keyword",
                        description=f"High textual specification overlap ({int(text_similarity * 100)}%) with component '{comp.sku}'",
                        weight=round(text_similarity, 3),
                        source="similarity:ngram",
                    )
                ]
                if matching_param_count > 0:
                    matched_codes = [k for k in guarded_attributes if k in q_attrs and k in c_attrs]
                    ev_items.append(
                        EvidenceItem(
                            type="datasheet_param",
                            description=f"Physical attributes match: {', '.join(matched_codes)}",
                            weight=0.9,
                            source="guard:physical_compat",
                        )
                    )

                matches.append(DuplicateCandidate(
                    id=comp.id,
                    sku=comp.sku,
                    similarity=round(sim, 3),
                    confidence_level="HIGH" if sim >= 0.85 else "MEDIUM",
                    match_type="semantic",
                    reason=(
                        f"Similar description ({int(text_similarity * 100)}% text overlap"
                        + (
                            f", {matching_param_count} matching specifications"
                            if matching_param_count > 0
                            else ""
                        )
                        + f") with component '{comp.sku}'"
                    ),
                    evidence=ev_items,
                ))

        matches.sort(key=lambda x: x.similarity, reverse=True)
        return DetectDuplicatesResponse(
            is_duplicate=len(matches) > 0,
            matches=matches[:5],
        )

duplicate_detector = DuplicateDetectorService()
