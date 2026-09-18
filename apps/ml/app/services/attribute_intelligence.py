import re
from typing import List, Dict, Any, Optional, Tuple, Set
from ..schemas import (
    EvidenceItem,
    DataPackIntelligenceHint,
    CategoryItem,
    ExistingAttribute,
    ExistingBinding,
    AttributeBindingSuggestion,
    CategoryAttributeSuggestion,
    AttributeConfigSuggestion,
    AttributeDuplicateMatch,
    EnumOptionSuggestion,
    AttributeAuditIssue,
)

# Canonical knowledge base of standard electronics engineering parametric dimensions
CANONICAL_PARAM_KNOWLEDGE: Dict[str, Dict[str, Any]] = {
    "voltage": {
        "canonical_name": "Voltage Rating",
        "code": "voltage_rating",
        "dataType": "QUANTITY",
        "unitCategory": "Voltage",
        "defaultUnit": "V",
        "displayUnits": ["mV", "V", "kV"],
        "groupName": "Electrical",
        "validationRules": {"min": 0, "rule": "> 0"},
        "aliases": ["Rated Voltage", "Working Voltage", "V_rated", "Max Voltage", "Voltage"],
        "categories": ["Capacitors", "MOSFET", "Transistors", "Diodes", "Voltage Regulators", "ICs & Semiconductors", "Electronic Components"],
    },
    "capacitance": {
        "canonical_name": "Capacitance",
        "code": "capacitance",
        "dataType": "QUANTITY",
        "unitCategory": "Capacitance",
        "defaultUnit": "uF",
        "displayUnits": ["pF", "nF", "uF", "mF", "F"],
        "groupName": "Electrical",
        "validationRules": {"min": 0, "rule": "> 0"},
        "aliases": ["Cap Value", "Nominal Capacitance", "Capacitance Value", "Cap"],
        "categories": ["Capacitors"],
    },
    "resistance": {
        "canonical_name": "Resistance",
        "code": "resistance",
        "dataType": "QUANTITY",
        "unitCategory": "Resistance",
        "defaultUnit": "ohm",
        "displayUnits": ["ohm", "kohm", "Mohm"],
        "groupName": "Electrical",
        "validationRules": {"min": 0, "rule": "> 0"},
        "aliases": ["Resistance Value", "Nominal Resistance", "Ohmic Value", "Res"],
        "categories": ["Resistors"],
    },
    "tolerance": {
        "canonical_name": "Tolerance",
        "code": "tolerance",
        "dataType": "QUANTITY",
        "unitCategory": "Percentage",
        "defaultUnit": "%",
        "displayUnits": ["%"],
        "groupName": "Electrical",
        "validationRules": {"min": 0, "max": 100, "rule": "0 <= x <= 100"},
        "aliases": ["Percentage Tolerance", "Tol", "Accuracy", "Value Tolerance"],
        "categories": ["Resistors", "Capacitors", "Inductors"],
    },
    "power_rating": {
        "canonical_name": "Power Rating",
        "code": "power_rating",
        "dataType": "QUANTITY",
        "unitCategory": "Power",
        "defaultUnit": "W",
        "displayUnits": ["mW", "W", "kW"],
        "groupName": "Electrical",
        "validationRules": {"min": 0, "rule": "> 0"},
        "aliases": ["Rated Power", "Max Power", "Wattage", "Power Dissipation"],
        "categories": ["Resistors", "Diodes", "Transistors", "ICs & Semiconductors"],
    },
    "current_rating": {
        "canonical_name": "Current Rating",
        "code": "current_rating",
        "dataType": "QUANTITY",
        "unitCategory": "Current",
        "defaultUnit": "A",
        "displayUnits": ["uA", "mA", "A"],
        "groupName": "Electrical",
        "validationRules": {"min": 0, "rule": "> 0"},
        "aliases": ["Rated Current", "Max Current", "Operating Current", "Continuous Current"],
        "categories": ["Diodes", "Transistors", "Inductors", "ICs & Semiconductors", "Connectors"],
    },
    "inductance": {
        "canonical_name": "Inductance",
        "code": "inductance",
        "dataType": "QUANTITY",
        "unitCategory": "Inductance",
        "defaultUnit": "uH",
        "displayUnits": ["nH", "uH", "mH", "H"],
        "groupName": "Electrical",
        "validationRules": {"min": 0, "rule": "> 0"},
        "aliases": ["Inductance Value", "Nominal Inductance", "Coil Inductance"],
        "categories": ["Inductors"],
    },
    "dielectric": {
        "canonical_name": "Dielectric",
        "code": "dielectric",
        "dataType": "SELECT",
        "unitCategory": None,
        "defaultUnit": None,
        "displayUnits": [],
        "groupName": "Electrical",
        "validationRules": None,
        "aliases": ["Dielectric Material", "Temperature Characteristic", "TC"],
        "options": ["C0G", "NP0", "X5R", "X7R", "Y5V", "X6S"],
        "categories": ["Capacitors"],
    },
    "package": {
        "canonical_name": "Package / Case",
        "code": "package",
        "dataType": "SELECT",
        "unitCategory": None,
        "defaultUnit": None,
        "displayUnits": [],
        "groupName": "Physical",
        "validationRules": None,
        "aliases": ["Footprint", "Package Footprint", "Case Code", "Package Size", "Case"],
        "options": [
            "0201", "0402", "0603", "0805", "1206", "1210", "2010", "2512",
            "SOD-123", "SOD-323", "SOT-23", "SOT-223", "TO-220", "SOIC-8", "DIP-8", "QFN-32",
        ],
        "categories": ["Resistors", "Capacitors", "Inductors", "Diodes", "Transistors", "ICs & Semiconductors", "Electronic Components"],
    },
    "mounting_type": {
        "canonical_name": "Mounting Type",
        "code": "mounting_type",
        "dataType": "SELECT",
        "unitCategory": None,
        "defaultUnit": None,
        "displayUnits": [],
        "groupName": "Physical",
        "validationRules": None,
        "aliases": ["Mounting Technology", "Termination Style", "Mount Type"],
        "options": ["SMD", "Through Hole", "Panel Mount"],
        "categories": ["Resistors", "Capacitors", "Inductors", "Diodes", "Transistors", "ICs & Semiconductors", "Electronic Components"],
    },
    "operating_temperature": {
        "canonical_name": "Operating Temperature",
        "code": "operating_temperature",
        "dataType": "QUANTITY",
        "unitCategory": "Temperature",
        "defaultUnit": "°C",
        "displayUnits": ["°C"],
        "groupName": "Environmental",
        "validationRules": None,
        "aliases": ["Temperature Range", "Operating Temp Range", "Working Temperature"],
        "categories": ["Resistors", "Capacitors", "Inductors", "Diodes", "Transistors", "ICs & Semiconductors"],
    },
}

def normalize_text(text: str) -> str:
    """Normalize text by stripping non-alphanumeric chars and lowercasing."""
    return re.sub(r"[^a-zA-Z0-9]", "", text or "").lower()

def tokenize_words(text: str) -> Set[str]:
    return set(re.findall(r"[a-zA-Z0-9]+", (text or "").lower()))

def compute_attribute_similarity(
    s1: str,
    s2: str,
    s1_aliases: Optional[List[str]] = None,
    s2_aliases: Optional[List[str]] = None,
) -> float:
    """Computes hybrid semantic, token, n-gram, and canonical parameter similarity between two attributes."""
    norm1 = normalize_text(s1)
    norm2 = normalize_text(s2)
    if not norm1 or not norm2:
        return 0.0
    if norm1 == norm2:
        return 1.0

    # 1. Check direct aliases
    all1 = [s1] + (s1_aliases or [])
    all2 = [s2] + (s2_aliases or [])
    for a1 in all1:
        for a2 in all2:
            if normalize_text(a1) == normalize_text(a2):
                return 0.98

    # 2. Check canonical knowledge match
    for key, param in CANONICAL_PARAM_KNOWLEDGE.items():
        candidates = set(
            normalize_text(c)
            for c in [param["canonical_name"], param["code"]] + param.get("aliases", [])
        )
        if norm1 in candidates and norm2 in candidates:
            return 0.95

    # 3. Substring check: e.g. "voltage" in "voltagerating"
    substring_sim = 0.0
    if norm1 in norm2 or norm2 in norm1:
        shorter = min(len(norm1), len(norm2))
        longer = max(len(norm1), len(norm2))
        substring_sim = 0.75 + 0.20 * (shorter / longer)

    # 4. Word tokens Jaccard
    words1 = tokenize_words(s1)
    words2 = tokenize_words(s2)
    token_jaccard = (
        len(words1 & words2) / len(words1 | words2)
        if (words1 and words2)
        else 0.0
    )

    # 5. Character 3-gram Dice
    n = 3
    char_sim = 0.0
    if len(norm1) >= n and len(norm2) >= n:
        ngrams1 = set(norm1[i : i + n] for i in range(len(norm1) - n + 1))
        ngrams2 = set(norm2[i : i + n] for i in range(len(norm2) - n + 1))
        char_sim = (2.0 * len(ngrams1 & ngrams2)) / (len(ngrams1) + len(ngrams2))

    return max(char_sim, token_jaccard * 0.85, substring_sim)

class AttributeIntelligenceService:
    def __init__(self):
        pass

    def suggest_attribute_bindings(
        self,
        attribute_name: str,
        attribute_code: Optional[str],
        description: Optional[str],
        data_type: Optional[str],
        unit_category: Optional[str],
        categories: List[CategoryItem],
        datapack_hints: Optional[List[DataPackIntelligenceHint]] = None,
        component_category_counts: Optional[Dict[str, int]] = None,
    ) -> List[AttributeBindingSuggestion]:
        """Suggests category bindings for a given attribute."""
        norm_name = normalize_text(attribute_name)
        norm_code = normalize_text(attribute_code or "")
        suggestions: List[AttributeBindingSuggestion] = []

        # Find param key from canonical knowledge
        matched_param = None
        for key, param in CANONICAL_PARAM_KNOWLEDGE.items():
            candidate_names = [param["canonical_name"], param["code"]] + param.get("aliases", [])
            for cname in candidate_names:
                if normalize_text(cname) == norm_name or (norm_code and normalize_text(cname) == norm_code):
                    matched_param = param
                    break
            if matched_param:
                break

        # Check Data Pack hints for expectedAttributes
        dp_expected_categories: Set[str] = set()
        if datapack_hints:
            for hint in datapack_hints:
                cat_name = hint.categoryName or hint.categoryCode or ""
                expected = hint.expectedAttributes or []
                for exp in expected:
                    if normalize_text(exp) in norm_name or (norm_code and normalize_text(exp) in norm_code):
                        dp_expected_categories.add(cat_name)
                    # Check attributeAliases inside Data Pack
                    if hint.attributeAliases and exp in hint.attributeAliases:
                        for al in hint.attributeAliases[exp] or []:
                            if normalize_text(al) in norm_name:
                                dp_expected_categories.add(cat_name)

        for cat in categories:
            evidence: List[EvidenceItem] = []
            score = 0.0

            # 1. Active Data Pack match
            cat_matched_dp = False
            for dp_cat in dp_expected_categories:
                if normalize_text(dp_cat) in normalize_text(cat.name) or normalize_text(dp_cat) in normalize_text(cat.code):
                    cat_matched_dp = True
                    break

            if cat_matched_dp:
                score += 0.95
                evidence.append(
                    EvidenceItem(
                        type="data_pack_rule",
                        description=f"Active Data Pack specifies '{attribute_name}' as expected for category '{cat.name}'",
                        weight=0.95,
                        source="datapack:expected_attributes",
                    )
                )

            # 2. Canonical electronics domain knowledge match
            if matched_param and not cat_matched_dp:
                for target_cat in matched_param.get("categories", []):
                    if normalize_text(target_cat) in normalize_text(cat.name) or normalize_text(cat.name) in normalize_text(target_cat):
                        score += 0.88
                        evidence.append(
                            EvidenceItem(
                                type="taxonomy",
                                description=f"Standard electronics engineering taxonomy associates '{matched_param['canonical_name']}' with '{cat.name}'",
                                weight=0.88,
                                source="domain:electronics_standard",
                            )
                        )
                        break

            # 3. Inventory component counts telemetry
            if component_category_counts and cat.id in component_category_counts:
                comp_count = component_category_counts[cat.id]
                if comp_count > 0:
                    score = min(1.0, score + 0.1)
                    evidence.append(
                        EvidenceItem(
                            type="existing_data",
                            description=f"Used by {comp_count} verified components in category '{cat.name}'",
                            weight=0.85,
                            source="inventory:verified_components",
                        )
                    )

            # 4. Lexical affinity fallback
            if score == 0.0:
                sim = compute_attribute_similarity(cat.name, attribute_name)
                if sim > 0.4:
                    score = 0.55
                    evidence.append(
                        EvidenceItem(
                            type="classifier",
                            description=f"Lexical similarity between category '{cat.name}' and '{attribute_name}' ({sim:.2f})",
                            weight=0.55,
                            source="ngram:similarity",
                        )
                    )

            if score > 0.4:
                confidence = round(min(score, 0.99), 2)
                if confidence >= 0.85:
                    conf_level = "HIGH"
                elif confidence >= 0.60:
                    conf_level = "MEDIUM"
                else:
                    conf_level = "LOW"

                reason = evidence[0].description if evidence else f"Suggested for {cat.name}"
                suggestions.append(
                    AttributeBindingSuggestion(
                        categoryId=cat.id,
                        categoryCode=cat.code,
                        categoryName=cat.name,
                        confidence=confidence,
                        confidenceLevel=conf_level,
                        reason=reason,
                        evidence=evidence,
                        modelVersion="1.0.0",
                    )
                )

        suggestions.sort(key=lambda x: x.confidence, reverse=True)
        return suggestions

    def suggest_category_attributes(
        self,
        category_id: str,
        category_code: Optional[str],
        category_name: str,
        existing_attributes: List[ExistingAttribute],
        bound_attribute_ids: List[str],
        datapack_hints: Optional[List[DataPackIntelligenceHint]] = None,
        category_component_count: Optional[int] = None,
    ) -> List[CategoryAttributeSuggestion]:
        """Suggests attributes that should be bound to a given category."""
        suggestions: List[CategoryAttributeSuggestion] = []
        bound_set = set(bound_attribute_ids)
        norm_cat_name = normalize_text(category_name)
        norm_cat_code = normalize_text(category_code or "")

        # 1. Collect expected attributes from Data Pack hints
        dp_expected_codes: Dict[str, str] = {}
        if datapack_hints:
            for hint in datapack_hints:
                h_name = normalize_text(hint.categoryName or "")
                h_code = normalize_text(hint.categoryCode or "")
                if (h_name and h_name in norm_cat_name) or (h_code and h_code in norm_cat_code) or (norm_cat_name in h_name):
                    for exp in hint.expectedAttributes or []:
                        dp_expected_codes[normalize_text(exp)] = exp

        # 2. Check canonical knowledge
        canonical_expected: Dict[str, Dict[str, Any]] = {}
        for key, param in CANONICAL_PARAM_KNOWLEDGE.items():
            for target_cat in param.get("categories", []):
                norm_target = normalize_text(target_cat)
                if norm_target in norm_cat_name or norm_cat_name in norm_target:
                    canonical_expected[normalize_text(param["code"])] = param
                    break

        # Match against existing attributes in Ananya
        for attr in existing_attributes:
            norm_code = normalize_text(attr.code)
            norm_name = normalize_text(attr.name)
            score = 0.0
            evidence: List[EvidenceItem] = []

            # Check DP match
            if norm_code in dp_expected_codes or norm_name in dp_expected_codes:
                score += 0.98
                evidence.append(
                    EvidenceItem(
                        type="data_pack_rule",
                        description=f"Specified as standard expected attribute in active Data Pack for '{category_name}'",
                        weight=0.98,
                        source="datapack:expected_attributes",
                    )
                )

            # Check canonical knowledge
            if norm_code in canonical_expected or norm_name in canonical_expected:
                param = canonical_expected.get(norm_code) or canonical_expected.get(norm_name)
                score = max(score, 0.92)
                evidence.append(
                    EvidenceItem(
                        type="taxonomy",
                        description=f"Standard electronics engineering parameter for '{category_name}'",
                        weight=0.92,
                        source="domain:electronics_standard",
                    )
                )

            if score > 0.5:
                confidence = round(score, 2)
                conf_level = "HIGH" if confidence >= 0.85 else "MEDIUM"
                is_bound = attr.id in bound_set
                reason = evidence[0].description if evidence else f"Recommended specification for {category_name}"

                suggestions.append(
                    CategoryAttributeSuggestion(
                        attributeDefinitionId=attr.id,
                        code=attr.code,
                        name=attr.name,
                        dataType=attr.dataType,
                        unitCategory=attr.unitCategory,
                        defaultUnit=attr.defaultUnit,
                        groupName=attr.groupName,
                        confidence=confidence,
                        confidenceLevel=conf_level,
                        isAlreadyBound=is_bound,
                        reason=reason,
                        evidence=evidence,
                    )
                )

        suggestions.sort(key=lambda x: (not x.isAlreadyBound, x.confidence), reverse=True)
        return suggestions

    def suggest_attribute_config(
        self,
        name: str,
        description: Optional[str] = "",
        existing_attributes: List[ExistingAttribute] = None,
        datapack_hints: Optional[List[DataPackIntelligenceHint]] = None,
    ) -> AttributeConfigSuggestion:
        """Infers attribute configuration (type, dimension, units, validation, group, aliases) from name."""
        clean_name = name.strip()
        norm_name = normalize_text(clean_name)
        existing_attributes = existing_attributes or []

        matched_param = None
        matched_score = 0.0
        canonical_match = None

        # 1. Match against canonical electronics parameter knowledge
        for key, param in CANONICAL_PARAM_KNOWLEDGE.items():
            candidates = [param["canonical_name"], param["code"]] + param.get("aliases", [])
            for c in candidates:
                sim = compute_attribute_similarity(clean_name, c)
                if sim > matched_score and sim >= 0.65:
                    matched_score = sim
                    matched_param = param

        # 2. Check if there is an exact or near duplicate in existing attributes
        best_existing_match = None
        best_sim = 0.0
        for attr in existing_attributes:
            sim = compute_attribute_similarity(clean_name, attr.name, s2_aliases=attr.aliases)
            if sim > best_sim:
                best_sim = sim
                best_existing_match = attr

        evidence: List[EvidenceItem] = []

        if matched_param and matched_score >= 0.70:
            suggested_code = matched_param["code"]
            suggested_data_type = matched_param["dataType"]
            unit_category = matched_param.get("unitCategory")
            default_unit = matched_param.get("defaultUnit")
            display_units = matched_param.get("displayUnits", [])
            group_name = matched_param.get("groupName")
            suggested_aliases = matched_param.get("aliases", [])
            suggested_options = matched_param.get("options", [])
            validation_rules = matched_param.get("validationRules")
            confidence = round(min(0.99, matched_score), 2)
            conf_level = "HIGH" if confidence >= 0.85 else "MEDIUM"
            evidence.append(
                EvidenceItem(
                    type="domain_rule",
                    description=f"Matched known engineering parameter '{matched_param['canonical_name']}' ({confidence:.0%})",
                    weight=0.95,
                    source="domain:electronics_standard",
                )
            )
            reason = f"Derived configuration from standard electrical parameter '{matched_param['canonical_name']}'"
        else:
            # Fallback heuristic: check for keywords
            lower_name = clean_name.lower()
            suggested_code = re.sub(r"[^a-z0-9]+", "_", lower_name).strip("_")
            suggested_aliases = []
            suggested_options = []
            validation_rules = None
            display_units = []

            if any(k in lower_name for k in ["type", "package", "style", "color", "grade", "material", "status"]):
                suggested_data_type = "SELECT"
                unit_category = None
                default_unit = None
                group_name = "General"
                confidence = 0.65
                conf_level = "MEDIUM"
                reason = "Inferred SELECT enumeration from keyword naming pattern"
            elif any(k in lower_name for k in ["is_", "has_", "flag", "enable", "active"]):
                suggested_data_type = "BOOLEAN"
                unit_category = None
                default_unit = None
                group_name = "General"
                confidence = 0.75
                conf_level = "MEDIUM"
                reason = "Inferred BOOLEAN flag from boolean prefix"
            elif any(k in lower_name for k in ["count", "number", "quantity", "pins", "positions"]):
                suggested_data_type = "INTEGER"
                unit_category = "Count"
                default_unit = "pcs"
                group_name = "Physical"
                confidence = 0.70
                conf_level = "MEDIUM"
                reason = "Inferred INTEGER count from keyword"
            else:
                suggested_data_type = "TEXT"
                unit_category = None
                default_unit = None
                group_name = "General"
                confidence = 0.50
                conf_level = "LOW"
                reason = "Defaulted to TEXT data type"

            evidence.append(
                EvidenceItem(
                    type="classifier",
                    description=f"Heuristic name inference ({confidence:.0%})",
                    weight=confidence,
                    source="heuristic:pattern_matcher",
                )
            )

        if best_existing_match and best_sim >= 0.75:
            canonical_match = {
                "id": best_existing_match.id,
                "name": best_existing_match.name,
                "code": best_existing_match.code,
                "similarity": round(best_sim, 2),
            }
            evidence.append(
                EvidenceItem(
                    type="existing_data",
                    description=f"Existing attribute '{best_existing_match.name}' matches with {best_sim:.0%} similarity",
                    weight=best_sim,
                    source="database:attribute_definitions",
                )
            )

        return AttributeConfigSuggestion(
            suggestedCode=suggested_code,
            suggestedDataType=suggested_data_type,
            unitCategory=unit_category,
            defaultUnit=default_unit,
            displayUnits=display_units,
            groupName=group_name,
            suggestedAliases=suggested_aliases,
            suggestedOptions=suggested_options,
            validationRules=validation_rules,
            canonicalMatch=canonical_match,
            confidence=confidence,
            confidenceLevel=conf_level,
            reason=reason,
            evidence=evidence,
        )

    def detect_duplicates(
        self,
        name: str,
        code: Optional[str],
        existing_attributes: List[ExistingAttribute],
        existing_bindings: List[ExistingBinding],
        threshold: float = 0.70,
        datapack_hints: Optional[List[DataPackIntelligenceHint]] = None,
    ) -> Tuple[bool, List[AttributeDuplicateMatch], List[str]]:
        """Detects duplicates and aliases among existing attributes."""
        clean_name = name.strip()
        norm_name = normalize_text(clean_name)
        norm_code = normalize_text(code or "")
        matches: List[AttributeDuplicateMatch] = []
        suggested_aliases: Set[str] = set()

        # Map bindings to attribute ID
        bindings_by_attr: Dict[str, List[str]] = {}
        for b in existing_bindings:
            cat_name = b.categoryName or b.categoryCode or b.categoryId
            bindings_by_attr.setdefault(b.attributeDefinitionId, []).append(cat_name)

        for attr in existing_attributes:
            attr_norm_name = normalize_text(attr.name)
            attr_norm_code = normalize_text(attr.code)

            # Skip comparing attribute against itself if code matches exactly
            if norm_code and norm_code == attr_norm_code:
                # Same code
                matches.append(
                    AttributeDuplicateMatch(
                        attributeId=attr.id,
                        code=attr.code,
                        name=attr.name,
                        similarity=1.0,
                        confidenceLevel="HIGH",
                        matchType="exact_code",
                        usageCount=len(bindings_by_attr.get(attr.id, [])),
                        boundCategories=bindings_by_attr.get(attr.id, []),
                        aliases=attr.aliases,
                        reason=f"Exact matching attribute code '{attr.code}' already exists",
                        evidence=[
                            EvidenceItem(
                                type="exact_match",
                                description=f"Code '{attr.code}' is identical",
                                weight=1.0,
                                source="database:attribute_definitions",
                            )
                        ],
                    )
                )
                continue

            # Check exact name
            if norm_name == attr_norm_name:
                matches.append(
                    AttributeDuplicateMatch(
                        attributeId=attr.id,
                        code=attr.code,
                        name=attr.name,
                        similarity=1.0,
                        confidenceLevel="HIGH",
                        matchType="exact_name",
                        usageCount=len(bindings_by_attr.get(attr.id, [])),
                        boundCategories=bindings_by_attr.get(attr.id, []),
                        aliases=attr.aliases,
                        reason=f"Exact matching attribute name '{attr.name}' already exists",
                        evidence=[
                            EvidenceItem(
                                type="exact_match",
                                description=f"Name '{attr.name}' is identical",
                                weight=1.0,
                                source="database:attribute_definitions",
                            )
                        ],
                    )
                )
                continue

            # Check aliases
            alias_matched = False
            for al in attr.aliases:
                if normalize_text(al) == norm_name:
                    matches.append(
                        AttributeDuplicateMatch(
                            attributeId=attr.id,
                            code=attr.code,
                            name=attr.name,
                            similarity=0.98,
                            confidenceLevel="HIGH",
                            matchType="alias_match",
                            usageCount=len(bindings_by_attr.get(attr.id, [])),
                            boundCategories=bindings_by_attr.get(attr.id, []),
                            aliases=attr.aliases,
                            reason=f"Matches known alias '{al}' of existing attribute '{attr.name}'",
                            evidence=[
                                EvidenceItem(
                                    type="alias_match",
                                    description=f"Matched declared alias '{al}'",
                                    weight=0.98,
                                    source="attribute:aliases",
                                )
                            ],
                        )
                    )
                    alias_matched = True
                    break

            if alias_matched:
                continue

            # Fuzzy similarity
            sim = compute_attribute_similarity(clean_name, attr.name, s2_aliases=attr.aliases)
            if sim >= threshold:
                conf_level = "HIGH" if sim >= 0.85 else "MEDIUM"
                matches.append(
                    AttributeDuplicateMatch(
                        attributeId=attr.id,
                        code=attr.code,
                        name=attr.name,
                        similarity=round(sim, 2),
                        confidenceLevel=conf_level,
                        matchType="token_similarity",
                        usageCount=len(bindings_by_attr.get(attr.id, [])),
                        boundCategories=bindings_by_attr.get(attr.id, []),
                        aliases=attr.aliases,
                        reason=f"High character similarity ({sim:.0%}) with existing attribute '{attr.name}'",
                        evidence=[
                            EvidenceItem(
                                type="similarity",
                                description=f"N-gram character similarity: {sim:.0%}",
                                weight=sim,
                                source="ngram:similarity",
                            )
                        ],
                    )
                )
                suggested_aliases.add(clean_name)
                suggested_aliases.add(attr.name)

        matches.sort(key=lambda m: m.similarity, reverse=True)
        is_dup = len(matches) > 0
        return is_dup, matches, sorted(list(suggested_aliases))

    def suggest_enum_values(
        self,
        attribute_code: str,
        attribute_name: str,
        existing_options: List[str],
        datapack_hints: Optional[List[DataPackIntelligenceHint]] = None,
    ) -> List[EnumOptionSuggestion]:
        """Suggests verified option values for SELECT attributes."""
        existing_set = set(o.lower() for o in existing_options)
        norm_code = normalize_text(attribute_code)
        norm_name = normalize_text(attribute_name)
        suggestions: List[EnumOptionSuggestion] = []

        # 1. Check Data Pack package patterns if package attribute
        if "package" in norm_code or "footprint" in norm_name or "package" in norm_name:
            if datapack_hints:
                for hint in datapack_hints:
                    for pkg in hint.packagePatterns or []:
                        if pkg.lower() not in existing_set:
                            existing_set.add(pkg.lower())
                            suggestions.append(
                                EnumOptionSuggestion(
                                    code=pkg,
                                    label=pkg,
                                    source=f"datapack:{hint.categoryCode or 'electronics-smd'}",
                                    confidence=0.98,
                                    confidenceLevel="HIGH",
                                )
                            )

        # 2. Check canonical knowledge
        for key, param in CANONICAL_PARAM_KNOWLEDGE.items():
            if norm_code == normalize_text(param["code"]) or norm_name == normalize_text(param["canonical_name"]):
                for opt in param.get("options", []):
                    if opt.lower() not in existing_set:
                        existing_set.add(opt.lower())
                        suggestions.append(
                            EnumOptionSuggestion(
                                code=opt,
                                label=opt,
                                source="domain:electronics_standard",
                                confidence=0.95,
                                confidenceLevel="HIGH",
                            )
                        )

        return suggestions

    def audit_library(
        self,
        attributes: List[ExistingAttribute],
        categories: List[CategoryItem],
        bindings: List[ExistingBinding],
        component_counts_by_attribute: Dict[str, int],
        component_counts_by_category_attribute: Dict[str, int],
        datapack_hints: Optional[List[DataPackIntelligenceHint]] = None,
    ) -> Tuple[Dict[str, int], List[AttributeAuditIssue]]:
        """Audits the entire attribute library for duplicates, suspicious bindings, and missing specifications."""
        issues: List[AttributeAuditIssue] = []
        issue_id_counter = 1

        # 1. Audit Duplicates
        for i in range(len(attributes)):
            for j in range(i + 1, len(attributes)):
                a1 = attributes[i]
                a2 = attributes[j]
                sim = compute_attribute_similarity(a1.name, a2.name, s1_aliases=a1.aliases, s2_aliases=a2.aliases)
                if sim >= 0.78:
                    issues.append(
                        AttributeAuditIssue(
                            id=f"audit-{issue_id_counter}",
                            type="DUPLICATE_ATTRIBUTE",
                            severity="WARNING",
                            attributeId=a1.id,
                            attributeName=a1.name,
                            confidence=round(sim, 2),
                            confidenceLevel="HIGH" if sim >= 0.85 else "MEDIUM",
                            reason=f"Possible duplicate attributes: '{a1.name}' and '{a2.name}' ({sim:.0%} similarity)",
                            evidence=[
                                EvidenceItem(
                                    type="similarity",
                                    description=f"High character n-gram overlap between '{a1.name}' and '{a2.name}'",
                                    weight=sim,
                                    source="audit:deduplication",
                                )
                            ],
                        )
                    )
                    issue_id_counter += 1

        # 2. Audit Suspicious Bindings
        for b in bindings:
            attr_code = normalize_text(b.attributeCode or "")
            cat_name = b.categoryName or ""
            norm_cat = normalize_text(cat_name)

            # Check if Resistance bound to Capacitor
            if "resistance" in attr_code and ("capacitor" in norm_cat or "diode" in norm_cat):
                key = f"{b.categoryId}_{b.attributeDefinitionId}"
                cnt = component_counts_by_category_attribute.get(key, 0)
                issues.append(
                    AttributeAuditIssue(
                        id=f"audit-{issue_id_counter}",
                        type="SUSPICIOUS_BINDING",
                        severity="WARNING",
                        attributeId=b.attributeDefinitionId,
                        attributeName=b.attributeCode,
                        categoryId=b.categoryId,
                        categoryName=cat_name,
                        confidence=0.85,
                        confidenceLevel="HIGH",
                        reason=f"Suspicious binding: '{b.attributeCode}' bound to '{cat_name}' (Only {cnt} components use this)",
                        evidence=[
                            EvidenceItem(
                                type="anomaly",
                                description=f"Attribute '{b.attributeCode}' is characteristic of Resistors, not '{cat_name}'",
                                weight=0.85,
                                source="audit:anomaly_detection",
                            )
                        ],
                    )
                )
                issue_id_counter += 1

        # 3. Audit Missing Expected Attributes on Categories
        cat_bound_attr_map: Dict[str, Set[str]] = {}
        for b in bindings:
            cat_bound_attr_map.setdefault(b.categoryId, set()).add(normalize_text(b.attributeCode or ""))

        for cat in categories:
            bound_codes = cat_bound_attr_map.get(cat.id, set())
            # Check canonical params expected for this category
            for key, param in CANONICAL_PARAM_KNOWLEDGE.items():
                p_code = normalize_text(param["code"])
                for target_cat in param.get("categories", []):
                    if normalize_text(target_cat) == normalize_text(cat.name):
                        if p_code not in bound_codes:
                            issues.append(
                                AttributeAuditIssue(
                                    id=f"audit-{issue_id_counter}",
                                    type="MISSING_EXPECTED_ATTRIBUTE",
                                    severity="INFO",
                                    attributeName=param["canonical_name"],
                                    categoryId=cat.id,
                                    categoryName=cat.name,
                                    confidence=0.90,
                                    confidenceLevel="HIGH",
                                    reason=f"Standard attribute '{param['canonical_name']}' is commonly expected for '{cat.name}' but not currently bound",
                                    evidence=[
                                        EvidenceItem(
                                            type="taxonomy",
                                            description=f"Industry standard specification for category '{cat.name}'",
                                            weight=0.90,
                                            source="domain:electronics_standard",
                                        )
                                    ],
                                )
                            )
                            issue_id_counter += 1
                            break

        # 4. Audit Unused Attributes
        for attr in attributes:
            usage = component_counts_by_attribute.get(attr.id, 0)
            binding_count = sum(1 for b in bindings if b.attributeDefinitionId == attr.id)
            if usage == 0 and binding_count == 0:
                issues.append(
                    AttributeAuditIssue(
                        id=f"audit-{issue_id_counter}",
                        type="UNUSED_ATTRIBUTE",
                        severity="INFO",
                        attributeId=attr.id,
                        attributeName=attr.name,
                        confidence=0.75,
                        confidenceLevel="MEDIUM",
                        reason=f"Attribute '{attr.name}' has 0 category bindings and 0 component values",
                        evidence=[
                            EvidenceItem(
                                type="existing_data",
                                description="Zero references in inventory ledger",
                                weight=0.75,
                                source="database:component_attribute_values",
                            )
                        ],
                    )
                )
                issue_id_counter += 1

        summary = {
            "totalAttributes": len(attributes),
            "possibleDuplicates": sum(1 for i in issues if i.type == "DUPLICATE_ATTRIBUTE"),
            "suspiciousBindings": sum(1 for i in issues if i.type == "SUSPICIOUS_BINDING"),
            "missingExpectedAttributes": sum(1 for i in issues if i.type == "MISSING_EXPECTED_ATTRIBUTE"),
            "unusedAttributes": sum(1 for i in issues if i.type == "UNUSED_ATTRIBUTE"),
            "issuesCount": len(issues),
        }

        return summary, issues

attribute_intelligence_service = AttributeIntelligenceService()
