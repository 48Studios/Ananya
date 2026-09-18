import os
import json
import re
from typing import Tuple, List, Optional
from ..schemas import ResolveManufacturerResponse, EvidenceItem, DataPackIntelligenceHint
from ..config import settings

class ManufacturerResolverService:
    def __init__(self):
        self._catalog = {}
        self._compiled_patterns = []
        self._is_loaded = False

    def load(self):
        if self._is_loaded:
            return
        if os.path.exists(settings.manufacturer_catalog_path):
            with open(settings.manufacturer_catalog_path, "r") as f:
                data = json.load(f)
                self._catalog = data.get("manufacturers", {})
        else:
            self._catalog = {}

        self._compiled_patterns = []
        for code, entry in self._catalog.items():
            for p in entry.get("prefix_patterns", []):
                self._compiled_patterns.append((re.compile(p, re.IGNORECASE), entry["name"], code, p))

        self._is_loaded = True

    @property
    def is_loaded(self) -> bool:
        return self._is_loaded

    def resolve(
        self,
        part_number: str,
        description: str = "",
        datapack_hints: Optional[List[DataPackIntelligenceHint]] = None,
    ) -> ResolveManufacturerResponse:
        if not self._is_loaded:
            self.load()

        pn = part_number.strip().upper()
        desc = (description or "").lower()
        pn_lower = part_number.strip().lower()

        # 1. Check Data Pack manufacturer hints (highest priority dynamic hints)
        if datapack_hints:
            for hint in datapack_hints:
                if not hint.manufacturerHints:
                    continue
                for mfg_hint in hint.manufacturerHints:
                    name = mfg_hint.name
                    code = mfg_hint.code or name.upper()

                    # Check prefix patterns
                    if mfg_hint.prefixPatterns:
                        for pat in mfg_hint.prefixPatterns:
                            try:
                                if re.search(pat, pn, re.IGNORECASE):
                                    return ResolveManufacturerResponse(
                                        manufacturer=name,
                                        confidence=0.99,
                                        confidence_level="HIGH",
                                        match_type="datapack",
                                        code=code,
                                        evidence=[
                                            EvidenceItem(
                                                type="data_pack_rule",
                                                description=f"Matched Data Pack manufacturer pattern '{pat}' for {name}",
                                                weight=0.9,
                                                source=f"datapack:{hint.categoryCode or 'hints'}",
                                            ),
                                            EvidenceItem(
                                                type="mpn_pattern",
                                                description=f"Part number '{pn}' conforms to {name} part-numbering series",
                                                weight=0.8,
                                                source="catalog:rule",
                                            ),
                                        ],
                                    )
                            except re.error:
                                pass

                    # Check aliases
                    if mfg_hint.aliases:
                        for alias in mfg_hint.aliases:
                            if alias != "generic" and len(alias) >= 2:
                                alias_pat = r"\b" + re.escape(alias.lower()) + r"\b"
                                if re.search(alias_pat, desc) or re.search(alias_pat, pn_lower):
                                    return ResolveManufacturerResponse(
                                        manufacturer=name,
                                        confidence=0.98,
                                        confidence_level="HIGH",
                                        match_type="alias",
                                        code=code,
                                        evidence=[
                                            EvidenceItem(
                                                type="data_pack_rule",
                                                description=f"Recognized Data Pack manufacturer alias '{alias}' for {name}",
                                                weight=0.85,
                                                source=f"datapack:{hint.categoryCode or 'hints'}",
                                            )
                                        ],
                                    )

        # 2. Check Static Catalog prefix patterns
        for pattern, name, code, raw_pat in self._compiled_patterns:
            if pattern.search(pn):
                return ResolveManufacturerResponse(
                    manufacturer=name,
                    confidence=0.99,
                    confidence_level="HIGH",
                    match_type="pattern",
                    code=code,
                    evidence=[
                        EvidenceItem(
                            type="mpn_pattern",
                            description=f"Matched manufacturer part-number prefix pattern '{raw_pat}'",
                            weight=0.9,
                            source=f"catalog:{code}",
                        )
                    ],
                )

        # 3. Check Static Catalog aliases
        for code, entry in self._catalog.items():
            for alias in entry.get("aliases", []):
                if alias != "generic" and len(alias) >= 2:
                    alias_pat = r"\b" + re.escape(alias.lower()) + r"\b"
                    if re.search(alias_pat, desc) or re.search(alias_pat, pn_lower):
                        return ResolveManufacturerResponse(
                            manufacturer=entry["name"],
                            confidence=0.98,
                            confidence_level="HIGH",
                            match_type="alias",
                            code=code,
                            evidence=[
                                EvidenceItem(
                                    type="keyword",
                                    description=f"Identified confirmed manufacturer alias '{alias}' in description",
                                    weight=0.85,
                                    source=f"catalog:{code}",
                                )
                            ],
                        )

        # 4. Fallback to Generic
        return ResolveManufacturerResponse(
            manufacturer="Generic",
            confidence=0.50,
            confidence_level="LOW",
            match_type="fallback",
            code="GENERIC",
            evidence=[
                EvidenceItem(
                    type="classifier",
                    description="No recognized manufacturer prefix or alias matched; assigned Generic fallback",
                    weight=0.3,
                    source="resolver:fallback",
                )
            ],
        )

manufacturer_resolver = ManufacturerResolverService()
