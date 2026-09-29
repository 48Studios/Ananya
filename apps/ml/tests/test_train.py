import pytest

from apps.ml.pipeline.train import (
    _build_classification_report,
    _validated_class_labels,
)
from apps.ml.training.processors.normalization import CANONICAL_CATEGORIES


def test_classification_report_includes_model_classes_missing_from_validation():
    model_classes = sorted(CANONICAL_CATEGORIES)[:18]
    validation_labels = model_classes[:17]
    predictions = model_classes[1:18]

    report = _build_classification_report(
        validation_labels,
        predictions,
        model_classes,
    )

    assert len(model_classes) == 18
    assert len(set(validation_labels)) == 17
    assert set(model_classes).issubset(report)
    assert report[model_classes[-1]]["support"] == 0


def test_noncanonical_classifier_class_fails_clearly():
    valid_class = sorted(CANONICAL_CATEGORIES)[0]
    invalid_class = "Legacy Electronics"

    with pytest.raises(ValueError, match="outside the canonical taxonomy"):
        _validated_class_labels([valid_class, invalid_class])


def test_evaluation_label_outside_model_vocabulary_fails_clearly():
    valid_class = sorted(CANONICAL_CATEGORIES)[0]

    with pytest.raises(ValueError, match="outside the classifier vocabulary"):
        _build_classification_report(
            [valid_class, "Legacy Electronics"],
            [valid_class, valid_class],
            [valid_class],
        )
