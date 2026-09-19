import json
import os
import re
from typing import Any, Dict, List, Optional

from ..config import settings
from ..schemas import (
    DataPackIntelligenceHint,
    ErpManufacturer,
    EvidenceItem,
    ManufacturerCandidate,
    ResolveManufacturerResponse,
)


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


class ManufacturerResolverService:
    def __init__(self):
        self._knowledge: List[Dict[str, Any]] = []
        self._is_loaded = False

    def load(self):
        if self._is_loaded:
            return
        path = settings.manufacturer_knowledge_path
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as knowledge_file:
                data = json.load(knowledge_file)
                self._knowledge = list(data.get("manufacturers", {}).values())
        self._is_loaded = True

    @property
    def is_loaded(self) -> bool:
        return self._is_loaded

    @staticmethod
    def _evidence(
        evidence_type: str,
        description: str,
        weight: float,
        source: str,
    ) -> EvidenceItem:
        return EvidenceItem(
            type=evidence_type,
            description=description,
            weight=weight,
            source=source,
        )

    @staticmethod
    def _level(confidence: float) -> str:
        if confidence >= 0.85:
            return "HIGH"
        if confidence >= 0.6:
            return "MEDIUM"
        return "LOW"

    def _add_signal(
        self,
        scores: Dict[str, float],
        evidence: Dict[str, List[EvidenceItem]],
        key: str,
        value: float,
        item: EvidenceItem,
    ) -> None:
        scores[key] = min(0.99, scores.get(key, 0.0) + value)
        if not any(existing.description == item.description for existing in evidence[key]):
            evidence[key].append(item)

    def resolve(
        self,
        part_number: str,
        description: str = "",
        datasheet_text: str = "",
        erp_manufacturers: Optional[List[ErpManufacturer]] = None,
        datapack_hints: Optional[List[DataPackIntelligenceHint]] = None,
    ) -> ResolveManufacturerResponse:
        self.load()
        erp = [item for item in (erp_manufacturers or []) if item.is_active]
        searchable_text = " ".join(
            value for value in (part_number, description, datasheet_text) if value
        )
        normalized_text = normalize(searchable_text)
        searchable_text_lower = searchable_text.lower()
        part_number_upper = part_number.strip().upper()
        scores: Dict[str, float] = {}
        evidence: Dict[str, List[EvidenceItem]] = {}
        names: Dict[str, str] = {}
        codes: Dict[str, Optional[str]] = {}
        erp_by_key: Dict[str, ErpManufacturer] = {}
        datapack_keys = set()

        def register(key: str, name: str, code: Optional[str] = None) -> None:
            names.setdefault(key, name)
            codes.setdefault(key, code)
            evidence.setdefault(key, [])

        def contains_term(term: str) -> bool:
            pattern = re.escape(term.lower()).replace(r"\ ", r"\s+")
            return bool(
                re.search(
                    rf"(?<![a-z0-9]){pattern}(?![a-z0-9])",
                    searchable_text_lower,
                )
            )

        for item in erp:
            key = normalize(item.name)
            register(key, item.name, item.code)
            erp_by_key[key] = item
            for alias in [item.code, item.name, *item.aliases, item.normalized_name or ""]:
                if alias:
                    erp_by_key[normalize(alias)] = item

        knowledge_by_name: Dict[str, Dict[str, Any]] = {}
        for item in self._knowledge:
            name = item.get("name", "").strip()
            if not name:
                continue
            key = normalize(name)
            register(key, name, None)
            knowledge_by_name[key] = item

        for hint in datapack_hints or []:
            for item in hint.manufacturerHints or []:
                key = normalize(item.name)
                datapack_keys.add(key)
                register(key, item.name, item.code)
                knowledge_by_name.setdefault(
                    key,
                    {
                        "name": item.name,
                        "aliases": item.aliases or [],
                        "prefix_patterns": item.prefixPatterns or [],
                    },
                )

        for key, item in knowledge_by_name.items():
            known_terms = [item.get("name", ""), *(item.get("aliases", []) or [])]
            for erp_item in erp:
                erp_terms = [erp_item.name, erp_item.code, *erp_item.aliases]
                if any(
                    normalize(known_term) == normalize(erp_term)
                    or (
                        len(normalize(known_term)) >= 4
                        and len(normalize(erp_term)) >= 4
                        and (
                            normalize(known_term) in normalize(erp_term)
                            or normalize(erp_term) in normalize(known_term)
                        )
                    )
                    for known_term in known_terms
                    for erp_term in erp_terms
                    if known_term and erp_term
                ):
                    erp_by_key[key] = erp_item
                    codes[key] = erp_item.code
                    break

        for key, item in knowledge_by_name.items():
            name = names[key]
            aliases = item.get("aliases", []) or []
            patterns = item.get("prefix_patterns", []) or []
            erp_item = erp_by_key.get(key)
            for alias in aliases:
                if alias == "generic" or len(alias) < 2:
                    continue
                alias_normalized = normalize(alias)
                if alias_normalized and contains_term(alias):
                    self._add_signal(
                        scores,
                        evidence,
                        key,
                        0.78,
                        self._evidence(
                            "known_alias",
                            f"Recognized manufacturer alias '{alias}' for {name}",
                            0.78,
                            f"knowledge:{key}",
                        ),
                    )

            if contains_term(name):
                self._add_signal(
                    scores,
                    evidence,
                    key,
                    0.82,
                    self._evidence(
                        "manufacturer_text",
                        f"Manufacturer name '{name}' appears in supplied text",
                        0.82,
                        "input:description",
                    ),
                )

            for raw_pattern in patterns:
                try:
                    if re.search(raw_pattern, part_number_upper, re.IGNORECASE):
                        self._add_signal(
                            scores,
                            evidence,
                            key,
                            0.68,
                            self._evidence(
                                "mpn_pattern",
                                f"Matched manufacturer part-number pattern '{raw_pattern}'",
                                0.68,
                                f"knowledge:{key}",
                            ),
                        )
                except re.error:
                    continue

            if erp_item:
                erp_values = [erp_item.name, erp_item.code, *erp_item.aliases]
                if any(contains_term(value) for value in erp_values if value):
                    self._add_signal(
                        scores,
                        evidence,
                        key,
                        0.99,
                        self._evidence(
                            "exact_erp_match",
                            f"Matched active ERP manufacturer '{erp_item.name}' by name, code, or alias",
                            0.99,
                            "erp:manufacturers",
                        ),
                    )

        ranked = sorted(scores, key=scores.get, reverse=True)
        raw_candidates = [
            ManufacturerCandidate(
                manufacturer_id=erp_by_key[key].id if key in erp_by_key else None,
                name=erp_by_key[key].name if key in erp_by_key else names[key],
                code=erp_by_key[key].code if key in erp_by_key else codes[key],
                confidence=round(scores[key], 2),
                evidence=evidence[key][:5],
            )
            for key in ranked[:5]
            if scores[key] >= 0.45
        ]
        unique_candidates: Dict[str, ManufacturerCandidate] = {}
        for candidate in raw_candidates:
            candidate_key = candidate.manufacturer_id or f"name:{normalize(candidate.name)}"
            if candidate_key not in unique_candidates:
                unique_candidates[candidate_key] = candidate
        candidates = list(unique_candidates.values())

        if not candidates:
            return ResolveManufacturerResponse(
                resolution="UNKNOWN",
                confidence=0.0,
                confidence_level="LOW",
                match_type="unresolved",
                evidence=[
                    self._evidence(
                        "classifier",
                        "No ERP record, knowledge rule, alias, or text evidence identified a manufacturer",
                        0.0,
                        "resolver:unknown",
                    )
                ],
            )

        top = candidates[0]
        runner_up = candidates[1] if len(candidates) > 1 else None
        ambiguous = runner_up and top.confidence - runner_up.confidence < 0.12
        if top.confidence < 0.55 or ambiguous:
            return ResolveManufacturerResponse(
                resolution="UNKNOWN",
                confidence=0.0,
                confidence_level="LOW",
                match_type="ambiguous" if ambiguous else "unresolved",
                evidence=top.evidence,
                candidates=candidates,
            )

        erp_item = erp_by_key.get(normalize(top.name))
        resolution = "EXISTING" if erp_item else "NEW_CANDIDATE"
        if normalize(top.name) in datapack_keys:
            match_type = "datapack"
        elif erp_item:
            match_type = "erp"
        elif any(item.type == "mpn_pattern" for item in top.evidence):
            match_type = "pattern"
        elif any(item.type == "known_alias" for item in top.evidence):
            match_type = "alias"
        else:
            match_type = "knowledge"
        return ResolveManufacturerResponse(
            resolution=resolution,
            manufacturer=top.name,
            manufacturer_id=top.manufacturer_id,
            confidence=top.confidence,
            confidence_level=self._level(top.confidence),
            match_type=match_type,
            code=top.code,
            evidence=top.evidence,
            candidates=candidates,
        )


manufacturer_resolver = ManufacturerResolverService()
