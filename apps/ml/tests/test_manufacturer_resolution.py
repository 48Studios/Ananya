import json
import re
from pathlib import Path

from apps.ml.app.schemas import DataPackIntelligenceHint, ErpManufacturer
from apps.ml.app.services.manufacturer_resolver import ManufacturerResolverService


CASES = json.loads(
    (Path(__file__).parent / "manufacturer_resolution_cases.json").read_text()
)


def make_erp(names):
    return [
        ErpManufacturer(
            id=str(index),
            name=name,
            code=name.upper().replace(" ", "-"),
        )
        for index, name in enumerate(names)
    ]


def resolve_v2(case):
    return ManufacturerResolverService().resolve(
        case["part_number"],
        case.get("description", ""),
        erp_manufacturers=make_erp(case["erp_manufacturers"]),
        datapack_hints=[
            DataPackIntelligenceHint.model_validate(item)
            for item in case.get("datapack_hints", [])
        ],
    )


def legacy_resolve(case, catalog):
    part_number = case["part_number"].upper()
    text = f"{case['part_number']} {case.get('description', '')}".lower()
    for hint in case.get("datapack_hints", []):
        for manufacturer in hint.get("manufacturerHints", []):
            if any(
                re.search(pattern, part_number, re.IGNORECASE)
                for pattern in manufacturer.get("prefixPatterns", [])
            ):
                return manufacturer["name"]
    for manufacturer in catalog.values():
        if any(
            re.search(pattern, part_number, re.IGNORECASE)
            for pattern in manufacturer.get("prefix_patterns", [])
        ):
            return manufacturer["name"]
    for manufacturer in catalog.values():
        if any(
            alias != "generic"
            and re.search(r"\b" + re.escape(alias.lower()) + r"\b", text)
            for alias in manufacturer.get("aliases", [])
        ):
            return manufacturer["name"]
    return "Generic"


def test_resolution_corpus_covers_expected_states_and_candidates():
    results = [resolve_v2(case) for case in CASES]

    assert all(
        result.resolution == case["expected_resolution"]
        and result.manufacturer == case["expected_manufacturer"]
        for case, result in zip(CASES, results)
    )
    assert any(result.resolution == "UNKNOWN" and result.candidates for result in results)
    assert all(result.evidence for result in results)


def test_v2_candidate_accuracy_beats_legacy_baseline():
    catalog = json.loads(
        (Path(__file__).parents[1] / "models" / "manufacturer_knowledge.json").read_text()
    )["manufacturers"]
    legacy_correct = sum(
        legacy_resolve(case, catalog) == case["expected_manufacturer"] for case in CASES
    )
    v2_correct = sum(
        resolve_v2(case).manufacturer == case["expected_manufacturer"] for case in CASES
    )

    assert legacy_correct == 15
    assert v2_correct == 18
    assert v2_correct > legacy_correct
