try:
    from apps.ml.app.services.attribute_intelligence import attribute_intelligence_service
    from apps.ml.app.schemas import (
        CategoryItem,
        ExistingAttribute,
        ExistingBinding,
        DataPackIntelligenceHint,
    )
except ModuleNotFoundError:
    from app.services.attribute_intelligence import attribute_intelligence_service
    from app.schemas import (
        CategoryItem,
        ExistingAttribute,
        ExistingBinding,
        DataPackIntelligenceHint,
    )

def test_suggest_attribute_bindings_canonical():
    categories = [
        CategoryItem(id="cat-cap", code="CAP", name="Capacitors"),
        CategoryItem(id="cat-res", code="RES", name="Resistors"),
        CategoryItem(id="cat-ind", code="IND", name="Inductors"),
    ]

    suggestions = attribute_intelligence_service.suggest_attribute_bindings(
        attribute_name="Voltage Rating",
        attribute_code="voltage_rating",
        description="Rated DC working voltage",
        data_type="QUANTITY",
        unit_category="Voltage",
        categories=categories,
    )

    assert len(suggestions) > 0
    top_suggestion = suggestions[0]
    assert top_suggestion.categoryName == "Capacitors"
    assert top_suggestion.confidenceLevel in ["HIGH", "MEDIUM"]
    assert top_suggestion.confidence >= 0.85
    assert len(top_suggestion.evidence) > 0

def test_suggest_attribute_bindings_datapack():
    categories = [
        CategoryItem(id="cat-cap", code="CAP", name="Capacitors"),
        CategoryItem(id="cat-res", code="RES", name="Resistors"),
    ]
    datapack_hints = [
        DataPackIntelligenceHint(
            categoryName="Capacitors",
            categoryCode="CAP",
            expectedAttributes=["dielectric", "capacitance", "voltage_rating"],
        )
    ]

    suggestions = attribute_intelligence_service.suggest_attribute_bindings(
        attribute_name="Dielectric",
        attribute_code="dielectric",
        description="Ceramic dielectric material",
        data_type="SELECT",
        unit_category=None,
        categories=categories,
        datapack_hints=datapack_hints,
    )

    assert len(suggestions) > 0
    top_suggestion = suggestions[0]
    assert top_suggestion.categoryName == "Capacitors"
    assert top_suggestion.confidenceLevel == "HIGH"
    assert top_suggestion.confidence >= 0.95
    assert any(e.type == "data_pack_rule" for e in top_suggestion.evidence)

def test_suggest_category_attributes():
    existing_attributes = [
        ExistingAttribute(id="a1", code="capacitance", name="Capacitance", dataType="QUANTITY", unitCategory="Capacitance", defaultUnit="uF"),
        ExistingAttribute(id="a2", code="voltage_rating", name="Voltage Rating", dataType="QUANTITY", unitCategory="Voltage", defaultUnit="V"),
        ExistingAttribute(id="a3", code="resistance", name="Resistance", dataType="QUANTITY", unitCategory="Resistance", defaultUnit="ohm"),
    ]
    datapack_hints = [
        DataPackIntelligenceHint(
            categoryName="Capacitors",
            categoryCode="CAP",
            expectedAttributes=["capacitance", "voltage_rating", "tolerance"],
        )
    ]

    suggestions = attribute_intelligence_service.suggest_category_attributes(
        category_id="cat-cap",
        category_code="CAP",
        category_name="Capacitors",
        existing_attributes=existing_attributes,
        bound_attribute_ids=["a1"],  # capacitance already bound
        datapack_hints=datapack_hints,
    )

    assert len(suggestions) >= 2
    # Voltage Rating should be recommended and not yet bound
    voltage_sug = next((s for s in suggestions if s.code == "voltage_rating"), None)
    assert voltage_sug is not None
    assert voltage_sug.isAlreadyBound is False
    assert voltage_sug.confidence >= 0.90

def test_suggest_attribute_config_voltage():
    existing_attributes = [
        ExistingAttribute(id="attr-volt", code="voltage_rating", name="Voltage Rating", dataType="QUANTITY", unitCategory="Voltage", defaultUnit="V")
    ]
    suggestion = attribute_intelligence_service.suggest_attribute_config(
        name="Rated Voltage",
        description="",
        existing_attributes=existing_attributes,
    )

    assert suggestion.suggestedDataType == "QUANTITY"
    assert suggestion.unitCategory == "Voltage"
    assert suggestion.defaultUnit == "V"
    assert "kV" in suggestion.displayUnits
    assert suggestion.canonicalMatch is not None
    assert suggestion.canonicalMatch["name"] == "Voltage Rating"

def test_detect_duplicates_exact_and_similar():
    existing_attributes = [
        ExistingAttribute(id="attr-1", code="voltage_rating", name="Voltage Rating", dataType="QUANTITY", aliases=["Rated Voltage"]),
        ExistingAttribute(id="attr-2", code="resistance", name="Resistance", dataType="QUANTITY"),
    ]
    existing_bindings = [
        ExistingBinding(categoryId="c1", categoryName="Capacitors", attributeDefinitionId="attr-1", attributeCode="voltage_rating")
    ]

    # Test alias duplicate match
    is_dup, matches, aliases = attribute_intelligence_service.detect_duplicates(
        name="Rated Voltage",
        code=None,
        existing_attributes=existing_attributes,
        existing_bindings=existing_bindings,
    )
    assert is_dup is True
    assert len(matches) > 0
    assert matches[0].matchType == "alias_match"
    assert matches[0].name == "Voltage Rating"

    # Test fuzzy duplicate match
    is_dup2, matches2, aliases2 = attribute_intelligence_service.detect_duplicates(
        name="Voltage",
        code=None,
        existing_attributes=existing_attributes,
        existing_bindings=existing_bindings,
    )
    assert is_dup2 is True
    assert len(matches2) > 0

def test_audit_library():
    attributes = [
        ExistingAttribute(id="a1", code="voltage", name="Voltage", dataType="QUANTITY"),
        ExistingAttribute(id="a2", code="voltage_rating", name="Voltage Rating", dataType="QUANTITY"),
        ExistingAttribute(id="a3", code="unused_param", name="Unused Spec", dataType="TEXT"),
    ]
    categories = [
        CategoryItem(id="c1", code="CAP", name="Capacitors"),
        CategoryItem(id="c2", code="RES", name="Resistors"),
    ]
    bindings = [
        ExistingBinding(categoryId="c1", categoryName="Capacitors", attributeDefinitionId="a2", attributeCode="voltage_rating"),
        ExistingBinding(categoryId="c1", categoryName="Capacitors", attributeDefinitionId="a_res", attributeCode="resistance"),  # suspicious
    ]

    summary, issues = attribute_intelligence_service.audit_library(
        attributes=attributes,
        categories=categories,
        bindings=bindings,
        component_counts_by_attribute={"a1": 0, "a2": 50, "a3": 0},
        component_counts_by_category_attribute={"c1_a2": 50, "c1_a_res": 0},
    )

    assert summary["possibleDuplicates"] >= 1
    assert summary["suspiciousBindings"] >= 1
    assert summary["unusedAttributes"] >= 1
    assert any(i.type == "SUSPICIOUS_BINDING" for i in issues)
    assert any(i.type == "DUPLICATE_ATTRIBUTE" for i in issues)
