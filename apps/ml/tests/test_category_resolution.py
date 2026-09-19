import json
from pathlib import Path

from apps.ml.app.schemas import DataPackIntelligenceHint, ErpCategory
from apps.ml.app.services.category_classifier import CategoryClassifierService


CASES = json.loads(
    (Path(__file__).parent / "category_resolution_cases.json").read_text()
)


def make_categories(rows):
    categories = []
    for index, (name, parent) in enumerate(rows):
        parent_id = next(
            (str(parent_index) for parent_index, (parent_name, _) in enumerate(rows) if parent_name == parent),
            None,
        )
        categories.append(
            ErpCategory(
                id=str(index),
                name=name,
                code=name.upper().replace(" ", "_").replace("-", "_"),
                parent_id=parent_id,
            )
        )
    return categories


def resolve(case, top_k=3):
    return CategoryClassifierService().predict(
        case["text"],
        top_k=top_k,
        erp_categories=make_categories(case["erp"]),
    )[0]


def test_category_resolution_corpus_states_and_top_k():
    results = [resolve(case) for case in CASES]
    identifiable = [case for case in CASES if case["expected"]]

    top_one = sum(
        result.subcategory == case["expected"] or result.category == case["expected"]
        for case, result in zip(CASES, results)
        if case["expected"]
    )
    top_k = sum(
        case["expected"] is None
        or case["expected"] in [candidate.category_name for candidate in result.candidates]
        for case, result in zip(CASES, results)
    )
    state_accuracy = sum(
        result.resolution == case["resolution"]
        for case, result in zip(CASES, results)
    )

    assert len(CASES) == 21
    assert top_one == len(identifiable)
    assert top_k == len(CASES)
    assert state_accuracy == len(CASES)


def test_hierarchy_prefers_specific_child_and_returns_parent_path():
    result = resolve(CASES[0])

    assert result.resolution == "EXISTING"
    assert result.subcategory == "SMD Resistors"
    assert result.category_path == ["Electronic Components", "Resistors", "SMD Resistors"]
    assert result.parent_category_id == "1"
    assert result.candidates[1].category_name == "Resistors"
    assert any(item.type == "hierarchy" for item in result.evidence)


def test_new_category_candidate_does_not_create_erp_record():
    result = resolve(next(case for case in CASES if case["resolution"] == "NEW_CANDIDATE"))

    assert result.resolution == "NEW_CANDIDATE"
    assert result.category_id is None
    assert result.subcategory == "Photovoltaic Connectors"
    assert result.suggested_parent == "Connectors"
    assert result.proposed_description


def test_unknown_category_keeps_ranked_candidates_without_forcing_selection():
    result = resolve(next(case for case in CASES if case["resolution"] == "UNKNOWN"))

    assert result.resolution == "UNKNOWN"
    assert result.category_id is None
    assert result.confidence == 0.0
    assert len(result.candidates) >= 2


def test_datapack_can_propose_missing_category_without_creating_it():
    result = CategoryClassifierService().predict(
        "PV-900 solar connector",
        datapack_hints=[
            DataPackIntelligenceHint(
                categoryName="Solar Connectors",
                aliases=["solar connector"],
                mpnPatterns=[r"^PV-"],
            )
        ],
        erp_categories=make_categories(
            [["Electronic Components", None], ["Connectors", "Electronic Components"]]
        ),
    )[0]

    assert result.resolution == "NEW_CANDIDATE"
    assert result.category_id is None
    assert result.subcategory == "Solar Connectors"


def test_preserved_legacy_path_baseline_is_measurable():
    resolver = CategoryClassifierService()
    legacy_top_one = sum(
        (result := resolver.predict(case["text"])[0]).subcategory == case["expected"]
        or result.category == case["expected"]
        for case in CASES
        if case["expected"]
    )

    assert legacy_top_one == 4
