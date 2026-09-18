import re
from typing import List
from ..schemas import ExistingComponent, DuplicateCandidate, DetectDuplicatesResponse

def normalize_part_number(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", s or "").upper()

class DuplicateDetectorService:
    def detect(
        self,
        part_number: str,
        description: str = "",
        existing_components: List[ExistingComponent] = None,
        similarity_threshold: float = 0.75
    ) -> DetectDuplicatesResponse:
        if not existing_components:
            return DetectDuplicatesResponse(is_duplicate=False, matches=[])

        pn_norm = normalize_part_number(part_number)
        desc_norm = normalize_part_number(description)
        matches: List[DuplicateCandidate] = []

        # TIER 1: Exact normalized MPN / SKU match (Authoritative)
        for comp in existing_components:
            sku_norm = normalize_part_number(comp.sku)
            desc_text = comp.description or ""
            
            # Extract vendor part from description if present
            m = re.search(r"Vendor part:\s*([^\s,;]+)", desc_text, re.IGNORECASE)
            vendor_pn = normalize_part_number(m.group(1)) if m else ""

            # Check exact SKU match
            if pn_norm and pn_norm == sku_norm:
                matches.append(DuplicateCandidate(
                    id=comp.id,
                    sku=comp.sku,
                    similarity=1.0,
                    match_type="exact_sku",
                    reason=f"Exact normalized SKU match: '{comp.sku}'"
                ))
                continue

            # Check vendor part match
            if vendor_pn and (pn_norm == vendor_pn or vendor_pn in desc_norm):
                matches.append(DuplicateCandidate(
                    id=comp.id,
                    sku=comp.sku,
                    similarity=1.0,
                    match_type="exact_mpn",
                    reason=f"Exact manufacturer part-number match: '{m.group(1)}'"
                ))
                continue

            # Substring match if part number is substantial (>5 chars)
            if len(pn_norm) >= 6 and (pn_norm in sku_norm or sku_norm in pn_norm):
                matches.append(DuplicateCandidate(
                    id=comp.id,
                    sku=comp.sku,
                    similarity=0.92,
                    match_type="exact_mpn",
                    reason=f"Significant normalized part number overlap with SKU '{comp.sku}'"
                ))

        if matches:
            return DetectDuplicatesResponse(is_duplicate=True, matches=matches)

        # TIER 2: Advisory Character N-Gram Jaccard similarity
        # Used only if Tier 1 found nothing, and strictly penalizes numeric value mismatches (e.g. 10k vs 100k)
        def get_char_ngrams(text: str, n: int = 3):
            clean = normalize_part_number(text)
            if len(clean) < n:
                return {clean}
            return {clean[i:i+n] for i in range(len(clean) - n + 1)}

        query_ngrams = get_char_ngrams(f"{part_number} {description}")

        from .datasheet_extractor import datasheet_extractor
        q_attrs = datasheet_extractor.extract_attributes(f"{part_number} {description}")

        for comp in existing_components:
            comp_text = f"{comp.sku} {comp.name or ''} {comp.description or ''}"
            
            # Attribute Value Guard: If both specify key electrical attributes (e.g. resistance, capacitance, voltage)
            # and their values differ, they CANNOT be duplicates.
            c_attrs = datasheet_extractor.extract_attributes(comp_text)
            conflict = False
            for attr_key in ("resistance", "capacitance", "inductance", "voltage"):
                if attr_key in q_attrs and attr_key in c_attrs:
                    if q_attrs[attr_key].value != c_attrs[attr_key].value:
                        conflict = True
                        break
            if conflict:
                continue

            comp_ngrams = get_char_ngrams(comp_text)
            
            intersection = len(query_ngrams & comp_ngrams)
            union = len(query_ngrams | comp_ngrams)
            sim = intersection / union if union > 0 else 0.0

            if sim >= similarity_threshold:
                matches.append(DuplicateCandidate(
                    id=comp.id,
                    sku=comp.sku,
                    similarity=round(sim, 3),
                    match_type="semantic",
                    reason=f"High textual similarity ({int(sim * 100)}%) with component '{comp.sku}'"
                ))

        matches.sort(key=lambda x: x.similarity, reverse=True)
        return DetectDuplicatesResponse(
            is_duplicate=len(matches) > 0,
            matches=matches[:5]
        )

duplicate_detector = DuplicateDetectorService()
