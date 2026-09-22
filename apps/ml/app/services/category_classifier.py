import hashlib
import json
import os
import pickle
import re
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from ..config import settings
from ..schemas import (
    CategoryCandidate,
    CategoryPrediction,
    DataPackIntelligenceHint,
    ErpCategory,
    ErpManufacturer,
    EvidenceItem,
)


LEGACY_PARENTS = {
    "Resistors": "Electronic Components",
    "Capacitors": "Electronic Components",
    "Inductors": "Electronic Components",
    "Diodes": "Electronic Components",
    "Transistors": "Electronic Components",
    "Connectors": "Electronic Components",
    "Cables": "Electronic Components",
    "Switches": "Electronic Components",
    "Optoelectronics": "Electronic Components",
    "ICs & Semiconductors": "Electronic Components",
    "Prototyping": "Electronic Components",
    "Mechanical Parts": "Mechanical Parts",
    "Raw Materials": "Raw Materials",
    "Assemblies": "Assemblies",
    "Consumables": "Consumables",
}


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


class CategoryClassifierService:
    def __init__(self):
        self._model = None
        self._is_loaded = False
        self._knowledge: List[Dict[str, Any]] = []
        self._knowledge_loaded = False
        self._swap_lock = threading.Lock()
        self._artifact = self._empty_artifact_identity()

    @staticmethod
    def _empty_artifact_identity() -> Dict[str, Any]:
        return {
            "loaded": False,
            "loadedAt": None,
            "artifactSha256": None,
            "activeVersion": None,
        }

    @staticmethod
    def _read_active_version() -> Optional[str]:
        """
        Reads the version recorded by the deployment tool (`deploy.py`).

        The version is metadata written NEXT TO the artifact, not inside it: the
        pickled sklearn pipeline carries no version field, and the training
        pipeline was not changed to add one. Reading the sidecar is therefore the
        only honest way to name the artifact that was loaded. A missing or
        unreadable sidecar yields None rather than a guess.
        """
        metadata_path = os.path.join(settings.model_dir, "model_metadata.json")
        try:
            with open(metadata_path, "r", encoding="utf-8") as metadata_file:
                version = json.load(metadata_file).get("activeVersion")
            return str(version) if version else None
        except (OSError, ValueError):
            return None

    def _artifact_identity(self, loaded: bool) -> Dict[str, Any]:
        """
        Identity of the model artifact this process is serving.

        The version is resolved from the artifact CHECKSUM against the registry,
        not trusted from `model_metadata.json`: the existing promotion tool does not
        rewrite that sidecar when it rolls back, so a metadata-only answer would
        report the candidate version while the rolled-back artifact is running.
        The sidecar value is reported separately as the deployment record's claim.
        """
        from .model_registry import resolve_version_for_checksum

        identity = self._empty_artifact_identity()
        identity["loaded"] = loaded
        identity["loadedAt"] = datetime.now(timezone.utc).isoformat()
        model_path = settings.category_model_path
        checksum = None
        try:
            with open(model_path, "rb") as model_file:
                checksum = hashlib.sha256(model_file.read()).hexdigest()
        except OSError:
            checksum = None
        identity["artifactSha256"] = checksum

        resolved = resolve_version_for_checksum(checksum)
        recorded = self._read_active_version()
        identity["activeVersion"] = resolved or recorded
        identity["versionSource"] = (
            "CHECKSUM" if resolved else ("DEPLOYMENT_METADATA" if recorded else None)
        )
        identity["recordedActiveVersion"] = recorded
        return identity

    def load(self):
        if not self._is_loaded:
            if os.path.exists(settings.category_model_path):
                with open(settings.category_model_path, "rb") as model_file:
                    self._model = pickle.load(model_file)
                self._is_loaded = True
                self._artifact = self._artifact_identity(True)
            else:
                self._model = None
        if not self._knowledge_loaded:
            knowledge_path = settings.category_knowledge_path
            if os.path.exists(knowledge_path):
                with open(knowledge_path, "r", encoding="utf-8") as knowledge_file:
                    self._knowledge = json.load(knowledge_file).get("categories", [])
            self._knowledge_loaded = True

    def reload(self) -> Dict[str, Any]:
        """
        Re-reads the production artifact and swaps it in atomically.

        Exists because `load()` is deliberately once-only: without this, a
        deployment that copies a new `category_classifier.pkl` into place leaves
        the running process serving the OLD model until the container restarts.
        That gap is exactly what makes an "artifact deployed" claim misleading, so
        the service reports the artifact it actually holds instead of the one on
        disk (`describe_artifact()`), and this method is the only way to close it.

        Safety properties:
          - the new artifact is fully parsed BEFORE the reference is swapped, so a
            corrupt or missing file leaves the previous model serving traffic;
          - the swap is a single attribute assignment under a lock, and `predict`
            reads one local reference, so a request sees either the old or the new
            pipeline — never a half-loaded one;
          - nothing here trains, promotes or writes a file.

        Raises `RuntimeError` when the artifact is missing or cannot be parsed;
        the caller (the deployment route) reports that as `reloadPending=true`
        rather than as a successful reload.
        """
        model_path = settings.category_model_path
        if not os.path.exists(model_path):
            raise RuntimeError("Production model artifact is missing")
        with open(model_path, "rb") as model_file:
            loaded_model = pickle.load(model_file)

        with self._swap_lock:
            self._model = loaded_model
            self._is_loaded = True
            self._artifact = self._artifact_identity(True)
        # Knowledge is intentionally NOT re-read: it is a separate artifact
        # (`category_knowledge.json`) that no deployment step writes.
        return dict(self._artifact)

    def describe_artifact(self) -> Dict[str, Any]:
        """
        The identity of the artifact this process is SERVING.

        Distinct from what is on disk. `deployment.py` exposes the on-disk view;
        comparing the two is how the operator dashboard distinguishes "artifact
        deployed" from "running model version".
        """
        return dict(self._artifact)

    @property
    def is_loaded(self) -> bool:
        return self._is_loaded

    def _evidence(self, evidence_type: str, description: str, weight: float, source: str) -> EvidenceItem:
        return EvidenceItem(type=evidence_type, description=description, weight=weight, source=source)

    @staticmethod
    def _level(confidence: float) -> str:
        if confidence >= 0.85:
            return "HIGH"
        if confidence >= 0.6:
            return "MEDIUM"
        return "LOW"

    def _legacy_predict(
        self,
        text: str,
        top_k: int,
        datapack_hints: Optional[List[DataPackIntelligenceHint]],
    ) -> List[CategoryPrediction]:
        clean_text = text.strip()
        lower_text = clean_text.lower()
        upper_text = clean_text.upper()
        if not clean_text:
            return [CategoryPrediction(
                category="Electronic Components",
                confidence=0.3,
                confidence_level="LOW",
                parent_category="Electronic Components",
                evidence=[self._evidence("classifier", "Default category assigned for empty input", 0.3, "resolver:fallback")],
            )]

        scores: Dict[str, float] = {name: 0.05 for name in LEGACY_PARENTS}
        evidence: Dict[str, List[EvidenceItem]] = {name: [] for name in LEGACY_PARENTS}
        for hint in datapack_hints or []:
            target = hint.categoryName or hint.categoryCode or ""
            if not target:
                continue
            scores.setdefault(target, 0.05)
            evidence.setdefault(target, [])
            for pattern in hint.mpnPatterns or []:
                try:
                    if re.search(pattern, upper_text, re.IGNORECASE):
                        evidence[target].append(self._evidence("mpn_pattern", f"Matched Data Pack MPN pattern '{pattern}'", 0.7, f"datapack:{hint.categoryCode or target}"))
                        break
                except re.error:
                    continue
            for term in [*(hint.aliases or []), *(hint.keywords or [])]:
                if len(term) >= 2 and re.search(r"\b" + re.escape(term.lower()) + r"\b", lower_text):
                    evidence[target].append(self._evidence("data_pack_rule", f"Matched Data Pack category term '{term}'", 0.5, f"datapack:{hint.categoryCode or target}"))
                    break
            scores[target] += sum(item.weight * 0.4 for item in evidence[target])

        if self._is_loaded and self._model is not None:
            probabilities = self._model.predict_proba([lower_text])[0]
            for label, probability in zip(self._model.classes_, probabilities):
                scores[label] = float(probability) + scores.get(label, 0)
                evidence.setdefault(label, []).append(self._evidence("classifier", f"Statistical category model probability ({int(probability * 100)}%)", 0.5, "model:category_classifier_v1"))

        ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)[:top_k]
        results = []
        for name, raw in ranked:
            parent = LEGACY_PARENTS.get(name, "Electronic Components")
            has_strong_evidence = any(
                item.type in ("mpn_pattern", "data_pack_rule")
                for item in evidence.get(name, [])
            )
            if raw >= 0.8 or (raw >= 0.65 and has_strong_evidence):
                confidence = min(0.99, max(0.85, raw))
            elif raw >= 0.4 or has_strong_evidence:
                confidence = min(0.84, max(0.65, raw))
            else:
                confidence = max(0.1, raw)
            results.append(CategoryPrediction(
                category=parent,
                subcategory=name if name != parent else None,
                confidence=confidence,
                confidence_level=self._level(confidence),
                parent_category=parent,
                evidence=evidence.get(name, []),
            ))
        return results

    def _hierarchy_paths(self, categories: List[ErpCategory]) -> Dict[str, List[str]]:
        by_id = {category.id: category for category in categories}
        paths: Dict[str, List[str]] = {}
        for category in categories:
            if category.path:
                paths[category.id] = category.path
                continue
            path: List[str] = []
            current = category
            seen = set()
            while current and current.id not in seen:
                seen.add(current.id)
                path.insert(0, current.name)
                current = by_id.get(current.parent_id)
            paths[category.id] = path
        return paths

    def _erp_predict(
        self,
        text: str,
        top_k: int,
        datapack_hints: Optional[List[DataPackIntelligenceHint]],
        erp_categories: List[ErpCategory],
        erp_manufacturers: Optional[List[ErpManufacturer]],
    ) -> List[CategoryPrediction]:
        self.load()
        lower_text = text.lower()
        upper_text = text.upper()
        paths = self._hierarchy_paths(erp_categories)
        active_categories = [category for category in erp_categories if category.is_active]
        scores: Dict[str, float] = {}
        evidence: Dict[str, List[EvidenceItem]] = {}
        knowledge_scores: Dict[str, float] = {}
        knowledge_evidence: Dict[str, List[EvidenceItem]] = {}
        knowledge_by_name = {normalize(item.get("name", "")): item for item in self._knowledge}
        for hint in datapack_hints or []:
            target = hint.categoryName or hint.categoryCode or ""
            if target and not any(normalize(category.name) == normalize(target) or normalize(category.code) == normalize(target) for category in active_categories):
                knowledge_by_name.setdefault(
                    normalize(target),
                    {
                        "name": target,
                        "aliases": hint.aliases or [],
                        "terms": [*(hint.keywords or []), *(hint.commonTerminology or [])],
                        "patterns": hint.mpnPatterns or [],
                        "parent": None,
                    },
                )

        def add(category_id: str, value: float, item: EvidenceItem):
            scores[category_id] = min(0.99, scores.get(category_id, 0) + value)
            evidence.setdefault(category_id, []).append(item)

        def has_term(term: str) -> bool:
            return bool(re.search(r"(?<![a-z0-9])" + re.escape(term.lower()) + r"(?![a-z0-9])", lower_text))

        for category in active_categories:
            item = knowledge_by_name.get(normalize(category.name), {})
            terms = [category.name, category.code, category.description or "", *category.aliases, *(item.get("aliases", []) or []), *(item.get("terms", []) or [])]
            for term in terms:
                if term and len(term) >= 3 and has_term(term):
                    add(category.id, 0.28 if term not in (category.name, category.code) else 0.4, self._evidence("category_text", f"Matched category terminology '{term}'", 0.4, "input:description"))
                    break
            specific_tokens = [token for token in re.findall(r"[a-z0-9]+", category.name.lower()) if len(token) >= 3]
            matched_specific = [token for token in specific_tokens if has_term(token)]
            if len(matched_specific) > 1 or (matched_specific and category.parent_id):
                specificity_bonus = 0.35 if "smd" in matched_specific else 0.12
                add(category.id, specificity_bonus, self._evidence("hierarchy", f"Specific child-category terminology matched: {', '.join(matched_specific)}", 0.3, "erp:hierarchy"))
            for pattern in item.get("patterns", []) or []:
                try:
                    if re.search(pattern, upper_text, re.IGNORECASE):
                        add(category.id, 0.38, self._evidence("mpn_pattern", f"Matched category MPN pattern '{pattern}'", 0.7, f"knowledge:{normalize(category.name)}"))
                except re.error:
                    continue
            if category.description and has_term(category.description):
                add(category.id, 0.15, self._evidence("erp_metadata", f"Matched ERP category description for '{category.name}'", 0.3, "erp:categories"))

            for manufacturer in erp_manufacturers or []:
                manufacturer_terms = [manufacturer.name, manufacturer.code, *manufacturer.aliases]
                if any(term and has_term(term) for term in manufacturer_terms):
                    add(category.id, 0.08, self._evidence("manufacturer_context", f"Manufacturer '{manufacturer.name}' supports this category as contextual evidence", 0.15, "erp:manufacturers"))

        for item in knowledge_by_name.values():
            name = item.get("name", "")
            key = normalize(name)
            if not name:
                continue
            matched = 0.0
            item_evidence: List[EvidenceItem] = []
            for term in [name, *(item.get("aliases", []) or []), *(item.get("terms", []) or [])]:
                if term and len(term) >= 3 and has_term(term):
                    matched += 0.32 if term in (name, *(item.get("aliases", []) or [])) else 0.2
                    item_evidence.append(self._evidence("category_knowledge", f"Matched category knowledge term '{term}'", 0.4, f"knowledge:{key}"))
                    break
            for pattern in item.get("patterns", []) or []:
                try:
                    if re.search(pattern, upper_text, re.IGNORECASE):
                        matched += 0.42
                        item_evidence.append(self._evidence("mpn_pattern", f"Matched category knowledge MPN pattern '{pattern}'", 0.7, f"knowledge:{key}"))
                except re.error:
                    continue
            if matched:
                knowledge_scores[key] = min(0.99, matched)
                knowledge_evidence[key] = item_evidence

        for hint in datapack_hints or []:
            target = hint.categoryName or hint.categoryCode or ""
            matches = [category for category in active_categories if normalize(category.name) == normalize(target) or normalize(category.code) == normalize(target)]
            for category in matches:
                for pattern in hint.mpnPatterns or []:
                    try:
                        if re.search(pattern, upper_text, re.IGNORECASE):
                            add(category.id, 0.45, self._evidence("mpn_pattern", f"Matched Data Pack MPN pattern '{pattern}'", 0.8, f"datapack:{hint.categoryCode or target}"))
                    except re.error:
                        continue
                for term in [*(hint.aliases or []), *(hint.keywords or []), *(hint.commonTerminology or [])]:
                    if len(term) >= 3 and has_term(term):
                        add(category.id, 0.24, self._evidence("data_pack_rule", f"Matched Data Pack category term '{term}'", 0.5, f"datapack:{hint.categoryCode or target}"))

        if self._is_loaded and self._model is not None:
            probabilities = self._model.predict_proba([lower_text])[0]
            for label, probability in zip(self._model.classes_, probabilities):
                matches = [category for category in active_categories if normalize(category.name) == normalize(label) or normalize(category.code) == normalize(label)]
                for category in matches:
                    add(category.id, float(probability) * 0.35, self._evidence("classifier", f"Statistical category model probability ({int(probability * 100)}%)", 0.35, "model:category_classifier_v1"))

        ranked_ids = sorted(scores, key=scores.get, reverse=True)
        candidates: List[CategoryCandidate] = []
        for category_id in ranked_ids:
            category = next(item for item in active_categories if item.id == category_id)
            confidence = round(min(0.99, scores[category_id]), 2)
            candidates.append(CategoryCandidate(category_id=category.id, category_name=category.name, category_code=category.code, category_path=paths[category.id], confidence=confidence, evidence=evidence[category.id][:6]))
            if len(candidates) >= top_k:
                break

        knowledge_candidates = sorted(
            knowledge_scores.items(), key=lambda item: item[1], reverse=True
        )
        top_knowledge = knowledge_candidates[0] if knowledge_candidates else None
        existing_top_score = candidates[0].confidence if candidates else 0.0
        if top_knowledge and top_knowledge[1] >= 0.62 and top_knowledge[1] > existing_top_score + 0.1:
            knowledge_item = knowledge_by_name[top_knowledge[0]]
            proposed = CategoryCandidate(
                category_id=None,
                category_name=knowledge_item["name"],
                category_code=None,
                category_path=[
                    value
                    for value in (knowledge_item.get("parent"), knowledge_item["name"])
                    if value
                ],
                confidence=round(top_knowledge[1], 2),
                evidence=knowledge_evidence[top_knowledge[0]][:6],
            )
            candidates.insert(0, proposed)

        if not candidates:
            return [CategoryPrediction(category="", resolution="UNKNOWN", confidence=0.0, confidence_level="LOW", candidates=[])]

        top = candidates[0]
        runner_up = candidates[1] if len(candidates) > 1 else None
        ambiguous = runner_up is not None and top.confidence < 0.72 and top.confidence - runner_up.confidence < 0.12
        if top.confidence < 0.45 or ambiguous:
            return [CategoryPrediction(category=top.category_name, subcategory=top.category_name, resolution="UNKNOWN", category_id=None, category_code=None, category_path=[], confidence=0.0, confidence_level="LOW", candidates=candidates, evidence=top.evidence)]

        if top.category_id is None:
            return [CategoryPrediction(
                category=knowledge_by_name[normalize(top.category_name)].get("parent") or "",
                subcategory=top.category_name,
                resolution="NEW_CANDIDATE",
                confidence=top.confidence,
                confidence_level=self._level(top.confidence),
                candidates=candidates,
                suggested_parent=knowledge_by_name[normalize(top.category_name)].get("parent"),
                proposed_description=f"Category knowledge identifies {top.category_name} as a distinct component family.",
                evidence=top.evidence,
            )]

        top_category = next(item for item in active_categories if item.id == top.category_id)
        path = paths[top.category_id]
        root = path[0] if path else top.category_name
        return [CategoryPrediction(
            category=root,
            subcategory=top.category_name if top.category_name != root else None,
            resolution="EXISTING",
            category_id=top.category_id,
            category_code=top.category_code,
            category_path=path,
            parent_category_id=top_category.parent_id,
            parent_category_code=next((item.code for item in active_categories if item.id == top_category.parent_id), None),
            confidence=top.confidence,
            confidence_level=self._level(top.confidence),
            candidates=candidates,
            evidence=top.evidence,
        )]

    def predict(
        self,
        text: str,
        top_k: int = 3,
        datapack_hints: Optional[List[DataPackIntelligenceHint]] = None,
        erp_categories: Optional[List[ErpCategory]] = None,
        erp_manufacturers: Optional[List[ErpManufacturer]] = None,
        datasheet_text: str = "",
    ) -> List[CategoryPrediction]:
        self.load()
        combined_text = " ".join(value for value in (text, datasheet_text) if value).strip()
        if erp_categories:
            return self._erp_predict(combined_text, top_k, datapack_hints, erp_categories, erp_manufacturers)
        return self._legacy_predict(combined_text, top_k, datapack_hints)

    def predict_batch(self, texts, top_k=3, datapack_hints=None, erp_categories=None, erp_manufacturers=None):
        return [self.predict(text, top_k, datapack_hints, erp_categories, erp_manufacturers) for text in texts]


category_classifier = CategoryClassifierService()
