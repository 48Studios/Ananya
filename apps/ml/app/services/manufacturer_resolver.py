import os
import json
import re
from typing import Tuple
from ..schemas import ResolveManufacturerResponse
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
                self._compiled_patterns.append((re.compile(p, re.IGNORECASE), entry["name"], code))

        self._is_loaded = True

    @property
    def is_loaded(self) -> bool:
        return self._is_loaded

    def resolve(self, part_number: str, description: str = "") -> ResolveManufacturerResponse:
        if not self._is_loaded:
            self.load()

        pn = part_number.strip().upper()
        desc = (description or "").lower()

        # 1. Check regex prefix patterns on part number (Highest priority)
        for pattern, name, code in self._compiled_patterns:
            if pattern.search(pn):
                return ResolveManufacturerResponse(
                    manufacturer=name,
                    confidence=0.99,
                    match_type="pattern",
                    code=code
                )

        # 2. Check known alias in description or part number with word boundary
        for code, entry in self._catalog.items():
            for alias in entry.get("aliases", []):
                if alias != "generic" and len(alias) >= 2:
                    alias_pat = r"\b" + re.escape(alias.lower()) + r"\b"
                    if re.search(alias_pat, desc) or re.search(alias_pat, pn.lower()):
                        return ResolveManufacturerResponse(
                            manufacturer=entry["name"],
                            confidence=0.98,
                            match_type="alias",
                            code=code
                        )

        # 3. Fallback to Generic
        return ResolveManufacturerResponse(
            manufacturer="Generic",
            confidence=0.50,
            match_type="fallback",
            code="GENERIC"
        )

manufacturer_resolver = ManufacturerResolverService()
