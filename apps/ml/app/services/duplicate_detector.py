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

        # TIER 1: Exact normalized MPN / SKU / Vendor part match (Authoritative)
        for comp in existing_components:
            sku_norm = normalize_part_number(comp.sku)
            sku_base = strip_packaging_suffix(comp.sku)
            desc_text = comp.description or ""
            comp_text = f"{comp.sku} {comp.name or ''} {desc_text}"
            c_attrs = datasheet_extractor.extract_attributes(comp_text, datapack_hints)

            # Extract vendor part from description if present
            m = re.search(r"Vendor part:\s*([^\s,;]+)", desc_text, re.IGNORECASE)
            vendor_pn = normalize_part_number(m.group(1)) if m else ""
            vendor_base = strip_packaging_suffix(m.group(1)) if m else ""

            # 1. Check exact SKU match (highest priority, only if no explicit parameter conflict)
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

            # 2. Check exact vendor part match
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

            # 3. Check base MPN match (ignoring reel/packaging suffixes)
            if pn_base and len(pn_base) >= 6 and (pn_base == sku_base or (vendor_base and pn_base == vendor_base)):
                if not has_physical_conflict(c_attrs):
                    matches.append(DuplicateCandidate(
                        id=comp.id,
                        sku=comp.sku,
                        similarity=0.98,
                        confidence_level="HIGH",
                        match_type="exact_mpn",
                        reason=f"Equivalent manufacturer part number (packaging suffix variant of '{comp.sku}')",
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

            # 4. Substring match if part number is substantial (>5 chars)
            if len(pn_norm) >= 6 and (pn_norm in sku_norm or sku_norm in pn_norm):
                if not has_physical_conflict(c_attrs):
                    matches.append(DuplicateCandidate(
                        id=comp.id,
                        sku=comp.sku,
                        similarity=0.92,
                        confidence_level="HIGH",
                        match_type="exact_mpn",
                        reason=f"Significant normalized part number overlap with SKU '{comp.sku}'",
                        evidence=[
                            EvidenceItem(
                                type="mpn_pattern",
                                description=f"Normalized part number string contains high overlap with '{comp.sku}'",
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
            comp_text = f"{comp.sku} {comp.name or ''} {comp.description or ''}"
            c_attrs = datasheet_extractor.extract_attributes(comp_text, datapack_hints)

            # Strict guard: physical conflict rejects duplicate outright
            if has_physical_conflict(c_attrs):
                continue

            comp_ngrams = get_char_ngrams(comp_text)
            intersection = len(query_ngrams & comp_ngrams)
            union = len(query_ngrams | comp_ngrams)
            sim = intersection / union if union > 0 else 0.0

            # Boost similarity if physical parameters match
            matching_param_count = sum(1 for k in guarded_attributes if k in q_attrs and k in c_attrs)
            if matching_param_count >= 3:
                sim = max(sim, 0.85)
            elif matching_param_count >= 2:
                sim = min(0.95, sim + 0.20)

            if sim >= similarity_threshold:
                ev_items = [
                    EvidenceItem(
                        type="keyword",
                        description=f"High textual specification overlap ({int(sim * 100)}%) with component '{comp.sku}'",
                        weight=round(sim, 3),
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
                    reason=f"High textual similarity ({int(sim * 100)}%) with component '{comp.sku}'",
                    evidence=ev_items,
                ))

        matches.sort(key=lambda x: x.similarity, reverse=True)
        return DetectDuplicatesResponse(
            is_duplicate=len(matches) > 0,
            matches=matches[:5],
        )

duplicate_detector = DuplicateDetectorService()
