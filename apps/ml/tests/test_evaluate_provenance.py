import json

from apps.ml.pipeline.evaluate import _count_unverified_provenance


def test_verified_snake_case_provenance_is_counted_as_verified():
    samples = [{"provenance": {"verification_status": "VERIFIED"}}]

    assert _count_unverified_provenance(samples) == 0


def test_non_verified_and_missing_provenance_are_counted_as_unverified():
    samples = [
        {"provenance": {"verification_status": "UNVERIFIED"}},
        {"provenance": {"verification_status": "QUARANTINED"}},
        {"provenance": {}},
        {},
        {"provenance": None},
    ]

    assert _count_unverified_provenance(samples) == len(samples)


def test_frozen_test_rows_use_canonical_provenance_field():
    test_path = (
        "apps/ml/training/datasets/training/"
        "dataset-crawl-1790343594-reprocessed/test.json"
    )
    with open(test_path, encoding="utf-8") as handle:
        samples = json.load(handle)

    assert len(samples) == 1342
    assert _count_unverified_provenance(samples) == 0
