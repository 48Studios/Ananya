"""
Component attribute intelligence — the relevant specifications of one part.

Two questions are exercised separately, because they answer different things and
fail independently: what matters for this part (relevance), and what a stated
value is called in the library's own vocabulary (canonicalisation). The third
thing under test is what must NOT happen: a value the library cannot express is
never invented, and an attribute with no definition is never surfaced.
"""

try:
    from apps.ml.app.services.attribute_intelligence import (
        attribute_intelligence_service,
        canonicalize_option_value,
        category_hint_matches,
        contains_word_sequence,
        is_usable_term,
        match_canonical_param,
        term_words,
    )
    from apps.ml.app.schemas import (
        AttributeOptionItem,
        ComponentAttributeDefinition,
        DataPackIntelligenceHint,
        ExtractedAttribute,
        SuggestComponentAttributesCategory,
    )
except ModuleNotFoundError:
    from app.services.attribute_intelligence import (
        attribute_intelligence_service,
        canonicalize_option_value,
        category_hint_matches,
        contains_word_sequence,
        is_usable_term,
        match_canonical_param,
        term_words,
    )
    from app.schemas import (
        AttributeOptionItem,
        ComponentAttributeDefinition,
        DataPackIntelligenceHint,
        ExtractedAttribute,
        SuggestComponentAttributesCategory,
    )


# The live library's connector-ish vocabulary, so the fixtures describe the ERP
# rather than an invented catalog.
MOUNTING_TYPE = ComponentAttributeDefinition(
    id="def-mounting",
    code="mounting_type",
    name="Mounting Type",
    dataType="SELECT",
    options=[
        AttributeOptionItem(code="SMD", label="Surface Mount (SMD/SMT)"),
        AttributeOptionItem(code="Through Hole", label="Through Hole (THT)"),
        AttributeOptionItem(code="Panel Mount", label="Panel Mount"),
    ],
)
CONNECTOR_TYPE = ComponentAttributeDefinition(
    id="def-connector",
    code="connector_type",
    name="Connector Interface",
    dataType="SELECT",
    options=[
        AttributeOptionItem(code="JST-XH", label="JST-XH (2.50mm)"),
        AttributeOptionItem(code="Pin Header", label="Pin Header 2.54mm (0.1\")"),
    ],
)
VOLTAGE = ComponentAttributeDefinition(
    id="def-voltage",
    code="voltage_rating",
    name="Voltage Rating",
    dataType="QUANTITY",
    unitCategory="Voltage",
    defaultUnit="V",
)
PITCH = ComponentAttributeDefinition(
    id="def-pitch",
    code="pitch",
    name="Contact Pitch",
    dataType="QUANTITY",
    unitCategory="Length",
    defaultUnit="mm",
)
CONNECTORS = SuggestComponentAttributesCategory(
    categoryId="cat-conn",
    categoryCode="CONN",
    categoryName="Connectors",
    confidence=0.98,
)


def extract(code: str, value, formatted: str, confidence: float = 0.85, unit=None):
    return ExtractedAttribute(
        code=code,
        value=value,
        unit=unit,
        formatted=formatted,
        confidence=confidence,
        confidence_level="MEDIUM",
    )


def suggest(**overrides):
    payload = {
        "query": "B06B-XH-A(LF)(SN) JST connector",
        "part_number": "B06B-XH-A",
        "description": "JST XH series connector",
        "datasheet_text": None,
        "categories": [CONNECTORS],
        "attributes": [MOUNTING_TYPE, CONNECTOR_TYPE, VOLTAGE, PITCH],
        "bound_attribute_ids": [CONNECTOR_TYPE.id, MOUNTING_TYPE.id],
        "bound_attribute_codes": [],
        "existing_values": {},
        "extracted_attributes": {},
        "datapack_hints": None,
    }
    payload.update(overrides)
    return attribute_intelligence_service.suggest_component_attributes(**payload)


def by_code(results, code):
    return next((item for item in results if item.code == code), None)


# ---------------------------------------------------------------------------
# Canonicalisation of stated values
# ---------------------------------------------------------------------------


def test_canonicalize_matches_an_exact_option_code_or_label():
    option = canonicalize_option_value(
        "SMD", MOUNTING_TYPE.code, MOUNTING_TYPE.name, MOUNTING_TYPE.options
    )
    assert option is not None and option.code == "SMD"

    option = canonicalize_option_value(
        "Through Hole",
        MOUNTING_TYPE.code,
        MOUNTING_TYPE.name,
        MOUNTING_TYPE.options,
    )
    assert option is not None and option.code == "Through Hole"


def test_canonicalize_maps_a_concept_onto_the_option_that_expresses_it():
    # What a datasheet writes, versus what the library stores.
    assert (
        canonicalize_option_value(
            "surface mount", MOUNTING_TYPE.code, MOUNTING_TYPE.name, MOUNTING_TYPE.options
        ).code
        == "SMD"
    )
    assert (
        canonicalize_option_value(
            "SMT", MOUNTING_TYPE.code, MOUNTING_TYPE.name, MOUNTING_TYPE.options
        ).code
        == "SMD"
    )
    assert (
        canonicalize_option_value(
            "thru-hole", MOUNTING_TYPE.code, MOUNTING_TYPE.name, MOUNTING_TYPE.options
        ).code
        == "Through Hole"
    )
    assert (
        canonicalize_option_value(
            "panel mount",
            MOUNTING_TYPE.code,
            MOUNTING_TYPE.name,
            MOUNTING_TYPE.options,
        ).code
        == "Panel Mount"
    )


def test_canonicalize_accepts_a_leading_part_of_one_option_label():
    female = ComponentAttributeDefinition(
        id="def-gender",
        code="gender",
        name="Gender",
        dataType="SELECT",
        options=[
            AttributeOptionItem(code="M", label="Male (Pin)"),
            AttributeOptionItem(code="F", label="Female (Socket)"),
        ],
    )
    option = canonicalize_option_value(
        "Female", female.code, female.name, female.options
    )
    assert option is not None and option.code == "F"


def test_canonicalize_refuses_a_value_the_library_cannot_express():
    # The whole point: a concept with no option produces no value at all, rather
    # than a free-form string written onto a component.
    assert (
        canonicalize_option_value(
            "ceramic", MOUNTING_TYPE.code, MOUNTING_TYPE.name, MOUNTING_TYPE.options
        )
        is None
    )
    assert canonicalize_option_value("", MOUNTING_TYPE.code, MOUNTING_TYPE.name, MOUNTING_TYPE.options) is None
    assert canonicalize_option_value("SMD", MOUNTING_TYPE.code, MOUNTING_TYPE.name, []) is None


def test_canonicalize_does_not_confuse_two_attributes_knowledge():
    # Mounting Type lists `Termination Style` among its aliases, so an alias-based
    # parameter match could attach the wrong concept map to a definition.
    assert match_canonical_param("mounting_type", "Mounting Type")["code"] == "mounting_type"
    assert match_canonical_param("termination", "Termination Style")["code"] == "termination"
    assert match_canonical_param("nonsense_code", "Nothing Like It") is None


# ---------------------------------------------------------------------------
# Terminology matching
# ---------------------------------------------------------------------------


def test_term_matching_is_word_based_not_substring():
    assert contains_word_sequence(term_words("gold plated contact"), term_words("gold plated"))
    # `tin` must not match inside `testing`, which a substring rule would do.
    words = term_words("testing the assembly")
    assert not contains_word_sequence(words, term_words("tin"))
    # `res` is a real parameter alias but too short to be evidence by itself.
    assert not is_usable_term("res")
    assert is_usable_term("contact plating")


def test_category_hint_matching_follows_the_library_suggestion_rule():
    assert category_hint_matches("Capacitors", "CAP", "Capacitors", "CAP")
    assert category_hint_matches(None, "CAP", "Capacitors (MLCC)", "CAP")
    assert category_hint_matches("Capacitors", None, "Capacitors (MLCC)", "CPC")
    assert not category_hint_matches("Resistors", "RES", "Capacitors", "CAP")


# ---------------------------------------------------------------------------
# Relevance
# ---------------------------------------------------------------------------


def test_bound_attributes_are_relevant_without_any_other_evidence():
    results = suggest()

    mounting = by_code(results, "mounting_type")
    assert mounting is not None
    assert any(item.type == "category_binding" for item in mounting.relevance)
    # Bound but unknown: relevance and value are separate statements.
    assert mounting.suggestedValue is None
    assert mounting.confidence is None
    assert mounting.confidenceLevel is None


def test_bound_attributes_come_first():
    results = suggest()
    assert [item.code for item in results][:2] == ["connector_type", "mounting_type"]


def test_domain_knowledge_reaches_attributes_the_category_does_not_bind():
    # The knowledge base lists Tolerance for Resistors; the fixture binds only
    # Mounting Type, so relevance for Tolerance can only come from the domain
    # vocabulary — an attribute the category does not bind can still be relevant.
    resistors = SuggestComponentAttributesCategory(
        categoryId="cat-res", categoryCode="RES", categoryName="Resistors"
    )
    tolerance = ComponentAttributeDefinition(
        id="def-tolerance",
        code="tolerance",
        name="Tolerance",
        dataType="QUANTITY",
        unitCategory="Percentage",
        defaultUnit="%",
    )
    results = suggest(
        query="RC0805FR-0710KL 10k resistor",
        categories=[resistors],
        attributes=[MOUNTING_TYPE, tolerance],
        bound_attribute_ids=[MOUNTING_TYPE.id],
    )

    assert any(
        item.type == "domain_knowledge" and item.source == "domain:electronics_standard"
        for item in by_code(results, "tolerance").relevance
    )


def test_a_category_the_knowledge_base_does_not_cover_gets_no_domain_evidence():
    # Connectors are not listed for Voltage Rating, and claiming otherwise would
    # be inventing domain knowledge rather than reading it.
    results = suggest(bound_attribute_ids=[], bound_attribute_codes=[])
    assert results == []


def test_data_pack_expectations_are_reported_and_bridge_the_parameter_vocabulary():
    results = suggest(
        datapack_hints=[
            DataPackIntelligenceHint(
                categoryName="Connectors",
                categoryCode="CONN",
                expectedAttributes=["voltage"],
                attributeAliases={"voltage": ["working voltage"]},
            )
        ],
    )

    voltage = by_code(results, "voltage_rating")
    assert any(
        item.type == "data_pack_expectation" and item.source == "datapack:expected_attributes"
        for item in voltage.relevance
    )
    assert any("Data Pack expects" in item.description for item in voltage.relevance)


def test_a_data_pack_for_another_category_does_not_apply():
    results = suggest(
        datapack_hints=[
            DataPackIntelligenceHint(
                categoryName="Capacitors",
                categoryCode="CAP",
                expectedAttributes=["voltage"],
            )
        ],
    )
    # The bindings still establish their own attributes; the pack for a category
    # this component is not in contributes nothing at all.
    assert not any(
        item.type == "data_pack_expectation"
        for suggestion in results
        for item in suggestion.relevance
    )


def test_the_text_naming_an_attribute_makes_it_relevant():
    results = suggest(
        datasheet_text="Contact pitch 2.50 mm, rated voltage 250 V",
    )
    assert by_code(results, "pitch") is not None
    assert any(
        item.type == "attribute_mention" for item in by_code(results, "pitch").relevance
    )


def test_an_existing_recorded_value_makes_the_attribute_relevant():
    results = suggest(existing_values={"pitch": "2.5 mm"})
    assert any(
        item.type == "existing_value" and item.source == "component:attribute_value"
        for item in by_code(results, "pitch").relevance
    )


def test_attributes_with_no_evidence_at_all_are_not_returned():
    # `connector_type` is bound, `pitch` is domain knowledge, but nothing in this
    # fixture establishes an unrelated attribute — and no attribute is invented.
    results = suggest(attributes=[ComponentAttributeDefinition(
        id="def-unrelated",
        code="unrelated_thing",
        name="Unrelated Thing",
        dataType="TEXT",
    )])
    assert [item.code for item in results] == []


def test_an_attribute_the_library_lacks_is_never_invented():
    # Connectors are expected to have Gender, but the library has no such
    # definition. The audit reports that gap; this endpoint must not fabricate it.
    results = suggest(datasheet_text="Gender: Male")
    assert by_code(results, "gender") is None


# ---------------------------------------------------------------------------
# Values
# ---------------------------------------------------------------------------


def test_an_extracted_option_value_is_canonicalised_onto_the_definition():
    results = suggest(
        extracted_attributes={
            "mounting_type": extract("mounting_type", "surface mount", "surface mount", 0.85)
        }
    )

    mounting = by_code(results, "mounting_type")
    assert mounting.suggestedValue == "SMD"
    assert mounting.formatted == "SMD"
    assert mounting.confidence == 0.85
    assert mounting.confidenceLevel == "HIGH"
    assert any(
        item.source == "canonical:option_mapping" for item in mounting.valueEvidence
    )


def test_a_value_the_library_cannot_express_leaves_the_attribute_relevant_only():
    results = suggest(
        extracted_attributes={"mounting_type": extract("mounting_type", "glued", "glued")}
    )

    mounting = by_code(results, "mounting_type")
    assert mounting is not None
    assert mounting.suggestedValue is None
    assert any(item.type == "extracted_attribute" for item in mounting.relevance)


def test_a_quantity_carries_no_value_because_the_caller_assembles_it():
    results = suggest(
        extracted_attributes={"voltage": extract("voltage", 250, "250V", 0.92, unit="V")}
    )

    voltage = by_code(results, "voltage_rating")
    assert any(item.type == "extracted_attribute" for item in voltage.relevance)
    assert voltage.suggestedValue is None
    assert voltage.valueEvidence == []


def test_an_extracted_value_confidence_is_capped_at_the_ceiling():
    results = suggest(
        extracted_attributes={
            "mounting_type": extract("mounting_type", "SMD", "SMD", 0.99)
        }
    )
    assert by_code(results, "mounting_type").confidence == 0.95


# ---------------------------------------------------------------------------
# Failure modes
# ---------------------------------------------------------------------------


def test_no_categories_means_nothing_to_judge():
    assert suggest(categories=[]) == []


def test_no_attribute_catalog_means_nothing_to_suggest():
    assert suggest(attributes=[]) == []


def test_an_empty_catalogue_of_bindings_still_uses_domain_knowledge():
    # Nothing is bound, and the parts of the catalog the knowledge base covers
    # for Resistors are still reported — relevance does not depend on a binding.
    resistors = SuggestComponentAttributesCategory(
        categoryId="cat-res", categoryCode="RES", categoryName="Resistors"
    )
    resistance = ComponentAttributeDefinition(
        id="def-resistance",
        code="resistance",
        name="Resistance",
        dataType="QUANTITY",
        unitCategory="Resistance",
        defaultUnit="ohm",
    )
    results = suggest(
        query="10k resistor",
        categories=[resistors],
        attributes=[resistance, MOUNTING_TYPE],
        bound_attribute_ids=[],
        bound_attribute_codes=[],
    )

    assert {item.code for item in results} == {"resistance", "mounting_type"}


# ---------------------------------------------------------------------------
# The route
# ---------------------------------------------------------------------------


try:
    from fastapi.testclient import TestClient
    from apps.ml.app.main import app
except ModuleNotFoundError:
    from fastapi.testclient import TestClient
    from app.main import app

import pytest


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_the_route_answers_with_the_same_judgement(client):
    res = client.post(
        "/v1/attributes/suggest-component-attributes",
        json={
            "query": "B06B-XH-A(LF)(SN) JST connector",
            "partNumber": "B06B-XH-A",
            "categories": [
                {
                    "categoryId": "cat-conn",
                    "categoryCode": "CONN",
                    "categoryName": "Connectors",
                    "confidence": 0.98,
                }
            ],
            "attributes": [
                {
                    "id": "def-mounting",
                    "code": "mounting_type",
                    "name": "Mounting Type",
                    "dataType": "SELECT",
                    "options": [
                        {"code": "SMD", "label": "Surface Mount (SMD/SMT)"},
                        {"code": "Through Hole", "label": "Through Hole (THT)"},
                    ],
                }
            ],
            "boundAttributeIds": ["def-mounting"],
            "extractedAttributes": {
                "mounting_type": {
                    "code": "mounting_type",
                    "value": "through-hole",
                    "formatted": "through-hole",
                    "confidence": 0.85,
                }
            },
        },
    )

    assert res.status_code == 200
    body = res.json()
    assert body["modelVersion"]
    suggestions = body["suggestions"]
    assert len(suggestions) == 1
    mounting = suggestions[0]
    assert mounting["attributeDefinitionId"] == "def-mounting"
    assert mounting["suggestedValue"] == "Through Hole"
    assert mounting["confidenceLevel"] == "HIGH"
    assert any(item["type"] == "category_binding" for item in mounting["relevance"])


def test_the_route_returns_nothing_for_an_unknown_catalog(client):
    res = client.post(
        "/v1/attributes/suggest-component-attributes",
        json={
            "query": "anything",
            "categories": [
                {"categoryId": "cat-x", "categoryName": "Whatever", "confidence": 0.9}
            ],
            "attributes": [],
        },
    )

    assert res.status_code == 200
    assert res.json()["suggestions"] == []


def test_the_route_rejects_a_request_without_the_required_fields(client):
    res = client.post("/v1/attributes/suggest-component-attributes", json={})
    assert res.status_code == 422
