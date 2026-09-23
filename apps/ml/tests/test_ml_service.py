import pytest
from fastapi.testclient import TestClient
from apps.ml.app.main import app

@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c

def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["version"] == "1.0.0"

def test_ready(client):
    res = client.get("/ready")
    assert res.status_code == 200
    data = res.json()
    assert data["ready"] is True
    assert data["models_loaded"]["category_classifier"] is True
    assert data["models_loaded"]["manufacturer_resolver"] is True

def test_predict_category_resistor(client):
    res = client.post("/v1/predict/category", json={
        "text": "10k ohm 0805 smd resistor precision 1%",
        "top_k": 3
    })
    assert res.status_code == 200
    data = res.json()
    assert len(data["predictions"]) > 0
    top = data["predictions"][0]
    assert top["category"] == "Electronic Components"
    assert top["subcategory"] == "Resistors"
    assert top["confidence"] > 0.5

def test_predict_category_capacitor(client):
    res = client.post("/v1/predict/category", json={
        "text": "10uf 16v x7r 0805 ceramic capacitor",
        "top_k": 3
    })
    assert res.status_code == 200
    data = res.json()
    top = data["predictions"][0]
    assert top["subcategory"] == "Capacitors"

def test_batch_predict_category(client):
    res = client.post("/v1/predict/category/batch", json={
        "texts": ["10k resistor", "10uf capacitor", "bss138 mosfet"],
        "top_k": 2
    })
    assert res.status_code == 200
    data = res.json()
    assert len(data["results"]) == 3

def test_resolve_manufacturer_patterns(client):
    # Yageo (RC0805...)
    res = client.post("/v1/resolve/manufacturer", json={"part_number": "RC0805FR-072KL"})
    assert res.status_code == 200
    assert res.json()["manufacturer"] == "Yageo"
    assert res.json()["match_type"] == "pattern"

    # Murata (GRM...)
    res = client.post("/v1/resolve/manufacturer", json={"part_number": "GRM21BR61A226ME51L"})
    assert res.status_code == 200
    assert res.json()["manufacturer"] == "Murata"

    # KEMET (C0805...)
    res = client.post("/v1/resolve/manufacturer", json={"part_number": "C0805C105K8RACTU"})
    assert res.status_code == 200
    assert res.json()["manufacturer"] == "KEMET"

    # Sunlord (SWPA...)
    res = client.post("/v1/resolve/manufacturer", json={"part_number": "SWPA4020S100MT"})
    assert res.status_code == 200
    assert res.json()["manufacturer"] == "Sunlord"

    # Alias in description
    res = client.post("/v1/resolve/manufacturer", json={
        "part_number": "CUSTOM-123",
        "description": "Manufactured by Murata Electronics"
    })
    assert res.status_code == 200
    assert res.json()["manufacturer"] == "Murata"
    assert res.json()["match_type"] == "alias"

def test_detect_duplicates_exact_mpn(client):
    existing = [
        {"id": "comp-1", "sku": "RES_0805_10K", "name": "10k Resistor", "description": "Vendor part: RC0805JR-0710KL"},
        {"id": "comp-2", "sku": "CAP_0805_10UF", "name": "10uF Capacitor", "description": "Vendor part: C0805C106K8RACTU"}
    ]
    # Exact vendor part match
    res = client.post("/v1/detect/duplicates", json={
        "part_number": "RC0805JR-0710KL",
        "existing_components": existing
    })
    assert res.status_code == 200
    data = res.json()
    assert data["is_duplicate"] is True
    assert data["matches"][0]["sku"] == "RES_0805_10K"
    assert data["matches"][0]["match_type"] == "exact_mpn"

def test_detect_duplicates_value_guard(client):
    # 100k resistor should NOT be flagged as duplicate of 10k resistor
    existing = [
        {"id": "comp-1", "sku": "RES_0805_10K", "name": "10k Resistor", "description": "10k ohm 0805 resistor"}
    ]
    res = client.post("/v1/detect/duplicates", json={
        "part_number": "RES_0805_100K",
        "description": "100k ohm 0805 resistor",
        "existing_components": existing
    })
    assert res.status_code == 200
    assert res.json()["is_duplicate"] is False

def test_extract_datasheet_attributes(client):
    text = "0805 SMD Resistor, 10k Ohm 1% 1/4W 50V"
    res = client.post("/v1/extract/datasheet", json={"text": text})
    assert res.status_code == 200
    attrs = res.json()["attributes"]
    assert "resistance" in attrs
    assert attrs["resistance"]["value"] == 10000.0
    assert attrs["resistance"]["unit"] == "ohm"
    assert "tolerance" in attrs
    assert attrs["tolerance"]["value"] == 1.0
    assert "package" in attrs
    assert attrs["package"]["value"] == "0805"
    assert "voltage" in attrs
    assert attrs["voltage"]["value"] == 50.0

def test_composite_suggest_pipeline(client):
    res = client.post("/v1/suggest", json={
        "query": "RC0805FR-0710KL",
        "description": "10k Ohm 1% 0805 SMD Resistor Yageo",
        "existing_components": [
            {"id": "1", "sku": "RES_0805_10K", "name": "10k Resistor", "description": "Vendor part: RC0805FR-0710KL"}
        ]
    })
    assert res.status_code == 200
    data = res.json()
    assert data["category_predictions"][0]["subcategory"] == "Resistors"
    assert data["manufacturer"]["manufacturer"] == "Yageo"
    assert data["duplicates"]["is_duplicate"] is True
    assert "resistance" in data["extracted_attributes"]
    assert len(data["overall_evidence"]) > 0
    assert data["confidence_level"] == "HIGH"
    assert data["execution_time_ms"] < 50.0  # Under 50 ms!

def test_explainable_evidence_and_confidence_level(client):
    res = client.post("/v1/suggest", json={
        "query": "GRM188R71H104KA93D",
        "description": "100nF 50V X7R 0603 Capacitor",
    })
    assert res.status_code == 200
    data = res.json()
    top_cat = data["category_predictions"][0]
    assert top_cat["subcategory"] == "Capacitors"
    assert top_cat["confidence_level"] in ("HIGH", "MEDIUM")
    assert len(top_cat["evidence"]) > 0
    # Manufacturer evidence
    mfg = data["manufacturer"]
    assert mfg["manufacturer"] == "Murata"
    assert len(mfg["evidence"]) > 0
    assert any(e["type"] == "mpn_pattern" for e in mfg["evidence"])

def test_datapack_intelligence_hints_consumption(client):
    # Pass dynamic Data Pack hint for custom component
    custom_hint = {
        "categoryName": "Capacitors",
        "categoryCode": "CAP",
        "mpnPatterns": ["^CUSCAP\\d+"],
        "manufacturerHints": [
            {"name": "CustomAcro", "code": "CUSTOMACRO", "prefixPatterns": ["^CUSCAP\\d+"]}
        ],
    }
    res = client.post("/v1/suggest", json={
        "query": "CUSCAP9000",
        "description": "Ceramic element",
        "datapack_hints": [custom_hint],
    })
    assert res.status_code == 200
    data = res.json()
    assert data["category_predictions"][0]["subcategory"] == "Capacitors"
    assert any(e["type"] == "mpn_pattern" for e in data["category_predictions"][0]["evidence"])
    assert data["manufacturer"]["manufacturer"] == "CustomAcro"
    assert data["manufacturer"]["match_type"] == "datapack"

def test_duplicate_guards_physical_parameters(client):
    existing = [
        {"id": "comp-1", "sku": "CAP_0805_10UF", "name": "10uF 0805 Capacitor", "description": "10uF 0805 25V X7R capacitor"}
    ]
    # 1. Voltage mismatch: 25V vs 50V
    res_volt = client.post("/v1/detect/duplicates", json={
        "part_number": "CAP_0805_10UF_50V",
        "description": "10uF 0805 50V X7R capacitor",
        "existing_components": existing
    })
    assert res_volt.status_code == 200
    assert res_volt.json()["is_duplicate"] is False

    # 2. Package mismatch: 0805 vs 0603
    res_pkg = client.post("/v1/detect/duplicates", json={
        "part_number": "CAP_0603_10UF",
        "description": "10uF 0603 25V X7R capacitor",
        "existing_components": existing
    })
    assert res_pkg.status_code == 200
    assert res_pkg.json()["is_duplicate"] is False

    # 3. Dielectric mismatch: X7R vs C0G
    res_diel = client.post("/v1/detect/duplicates", json={
        "part_number": "CAP_0805_10UF_C0G",
        "description": "10uF 0805 25V C0G capacitor",
        "existing_components": existing
    })
    assert res_diel.status_code == 200
    assert res_diel.json()["is_duplicate"] is False

def test_equivalent_mpn_matching(client):
    existing = [
        {"id": "comp-1", "sku": "RC0805FR-0710KL", "name": "10k Resistor", "description": "Vendor part: RC0805FR-0710KL"}
    ]
    # Query with tape & reel packaging variant "RC0805FR-0710KLTR"
    res = client.post("/v1/detect/duplicates", json={
        "part_number": "RC0805FR-0710KLTR",
        "existing_components": existing
    })
    assert res.status_code == 200
    data = res.json()
    assert data["is_duplicate"] is True
    assert data["matches"][0]["sku"] == "RC0805FR-0710KL"


# ---------------------------------------------------------------------------
# Duplicate detection against a real ERP catalog.
#
# The fixtures below mirror the live data: `sku` is the ERP's own key
# (`CMP-000305`) and the manufacturer part number lives in its own column. The
# tests above pass without that column because they use the part number AS the
# SKU, which is not how the ERP stores anything.
# ---------------------------------------------------------------------------

CATALOG = [
    {
        "id": "comp-murata-a",
        "sku": "CMP-000304",
        "name": "AI-TEST-DUP-SEMANTIC-MURATA-100NF-50V-X7R-0603-A",
        "description": "Murata GRM series multilayer ceramic capacitor, 100 nF, 50 V, X7R, 0603 (1608 metric) SMD, +/-5% tolerance grade.",
        "manufacturer_part_number": "GRM188R71H104JA93D",
    },
    {
        "id": "comp-murata-b",
        "sku": "CMP-000305",
        "name": "AI-TEST-DUP-SEMANTIC-MURATA-100NF-50V-X7R-0603-B",
        "description": "Murata GRM series multilayer ceramic capacitor, 100 nF, 50 V, X7R, 0603 (1608 metric) SMD, +/-20% tolerance grade.",
        "manufacturer_part_number": "GRM188R71H104MA93D",
    },
    {
        "id": "comp-tdk",
        "sku": "CMP-000298",
        "name": "AI-TEST-MPN-NOISY-GAMMA",
        "description": "TDK C series multilayer ceramic capacitor, 100 nF, 50 V, X7R, 0603 (1608 metric) SMD. Manufacturer part number stated in the attached datasheet only.",
    },
]


def test_exact_mpn_match_finds_the_stored_record(client):
    """A part number the ERP already holds is an authoritative duplicate.

    Regression: the candidate list carried no manufacturer part number, so the
    detector compared the searched part number against each component's *SKU*
    (`CMP-000305`). Nothing ever matched, which silently made every authoritative
    tier unreachable and left duplicate decisions to fuzzy text overlap.
    """
    res = client.post("/v1/detect/duplicates", json={
        "part_number": "GRM188R71H104MA93D",
        "existing_components": CATALOG,
    })

    assert res.status_code == 200
    data = res.json()
    assert data["is_duplicate"] is True
    assert data["matches"][0]["sku"] == "CMP-000305"
    assert data["matches"][0]["match_type"] == "exact_mpn"
    assert data["matches"][0]["similarity"] == 1.0


def test_exact_mpn_match_is_not_hidden_by_attribute_drift(client):
    """Two records carrying one part number are the same part, full stop.

    The physical guard exists to stop *fuzzy* matches from being reported. For an
    identical part number a disagreement is drifted data the reviewer needs to
    see, not a reason to stay silent.
    """
    existing = [{
        "id": "comp-1",
        "sku": "CMP-000001",
        "name": "10k 0805 resistor",
        "description": "10k ohm 0805 resistor",
        "manufacturer_part_number": "RC0805FR-0710KL",
    }]

    res = client.post("/v1/detect/duplicates", json={
        # Same part number, contradicting resistance.
        "part_number": "RC0805FR-0710KL",
        "description": "100k ohm 0805 resistor",
        "existing_components": existing,
    })

    assert res.status_code == 200
    data = res.json()
    assert data["is_duplicate"] is True
    assert data["matches"][0]["match_type"] == "exact_mpn"
    assert "needs review" in data["matches"][0]["reason"]


def test_mpn_packaging_variant_matches_against_the_mpn_column(client):
    """The packaging-variant rule reads the stored MPN, not only the SKU.

    The name and description deliberately share no wording with the query, so the
    semantic tier cannot produce this result: only the stored part number can.
    """
    existing = [{
        "id": "comp-1",
        "sku": "CMP-000001",
        "name": "Precision thin film chip",
        "description": "Tape and reel packaging, 1% tolerance.",
        "manufacturer_part_number": "RC0805FR-0710KL",
    }]

    res = client.post("/v1/detect/duplicates", json={
        "part_number": "RC0805FR-0710KLTR",
        "existing_components": existing,
    })

    assert res.status_code == 200
    data = res.json()
    assert data["is_duplicate"] is True
    assert data["matches"][0]["sku"] == "CMP-000001"
    assert data["matches"][0]["match_type"] == "exact_mpn"


def test_generic_specs_alone_are_not_a_duplicate(client):
    """Shared generic values must not be reported as an invented 85% match.

    Regression: three or more matching attributes forced the score to 0.85, which
    reported a number the text did not support and flagged any two parts sharing
    capacitance/voltage/package/dielectric as duplicates however differently they
    were described.

    The query names a part number the ERP does not hold, so no authoritative tier
    can short-circuit the decision and the semantic tier is what is being tested.
    """
    res = client.post("/v1/detect/duplicates", json={
        "part_number": "GRM188R71H104KA93D",
        "description": "AI-TEST-DUP-SEMANTIC-MURATA-100NF-50V-X7R-0603-A",
        "existing_components": CATALOG,
    })

    assert res.status_code == 200
    data = res.json()
    # The TDK part shares capacitance, voltage, package and dielectric with the
    # query and is still a different part, so it must not be reported.
    assert all(m["sku"] != "CMP-000298" for m in data["matches"])
    # Every reported similarity is a score the evidence actually supports.
    assert all(
        m["similarity"] < 0.85 or m["match_type"] == "exact_mpn"
        for m in data["matches"]
    )


def test_description_only_query_still_finds_a_similar_part(client):
    """The semantic tier keeps working when there is no part number to match.

    The query names a part number the ERP does not hold, so no authoritative tier
    can answer and the decision falls to textual similarity.
    """
    res = client.post("/v1/detect/duplicates", json={
        "part_number": "GRM188R71H104KA93D",
        "description": "Murata GRM series multilayer ceramic capacitor, 100 nF, 50 V, X7R, 0603 (1608 metric) SMD",
        "existing_components": CATALOG,
    })

    assert res.status_code == 200
    data = res.json()
    assert data["is_duplicate"] is True
    similar = [m for m in data["matches"] if m["match_type"] == "semantic"]
    assert any(m["sku"] == "CMP-000305" for m in similar)
    # The unrelated manufacturer's part stays out of it.
    assert all(m["sku"] != "CMP-000298" for m in similar)


def test_internal_sku_does_not_drive_text_similarity(client):
    """The ERP's own key is not descriptive text.

    Including `CMP-000305` in the compared text made similarity depend on the
    ERP's numbering rather than on the parts being described.
    """
    base = {
        "name": "10k 0805 resistor",
        "description": "10k ohm 0805 resistor",
        "manufacturer_part_number": "RC0805FR-0710KL",
    }
    existing = [
        {"id": "comp-1", "sku": "CMP-000001", **base},
        {"id": "comp-2", "sku": "ZZZ-999999", **base},
    ]

    res = client.post("/v1/detect/duplicates", json={
        "part_number": "RC0805FR-0710KL",
        "description": "10k ohm 0805 resistor",
        "existing_components": existing,
    })

    assert res.status_code == 200
    scores = {m["sku"]: m["similarity"] for m in res.json()["matches"]}
    # Identical descriptions score identically whatever their SKUs are.
    assert scores["CMP-000001"] == scores["ZZZ-999999"]


# ---------------------------------------------------------------------------
# Datasheet input to the composite suggestion
#
# A caller may hold a pasted specification block, a PDF, or both. Whichever it
# has must reach the extractor — otherwise a pasted datasheet produces no
# attributes, which is exactly what used to happen.
# ---------------------------------------------------------------------------


def test_pasted_datasheet_text_is_read_for_attributes(client):
    res = client.post("/v1/suggest", json={
        "query": "JST XH connector",
        "part_number": "B06B-XH-A",
        "datasheet_text": "Mounting Type: Through-hole\n6 position\nPitch: 2.50mm",
    })

    assert res.status_code == 200
    attrs = res.json()["extracted_attributes"]
    assert attrs["mounting_type"]["value"] == "Through Hole"
    assert attrs["pin_count"]["value"] == 6
    assert attrs["pitch"]["value"] == 2.5


def test_datasheet_pdf_base64_is_read_for_attributes(client, monkeypatch):
    # The wiring, not the PDF reader: `extract_pages_from_pdf_base64` is the
    # extractor's own entry point and is covered by its own tests.
    from apps.ml.app.services.datasheet_extractor import datasheet_extractor

    calls = []

    def fake_extract_text(pdf_base64):
        calls.append(pdf_base64)
        return "Gender: Male\nRated voltage: 250 V"

    monkeypatch.setattr(
        datasheet_extractor, "extract_text_from_pdf_base64", fake_extract_text
    )

    res = client.post("/v1/suggest", json={
        "query": "B06B-XH-A",
        "datasheet_pdf_base64": "ZmFrZQ==",
    })

    assert res.status_code == 200
    assert calls == ["ZmFrZQ=="]
    attrs = res.json()["extracted_attributes"]
    assert attrs["gender"]["value"] == "Male"
    assert attrs["voltage"]["value"] == 250.0


def test_pasted_text_and_pdf_are_both_considered(client, monkeypatch):
    from apps.ml.app.services.datasheet_extractor import datasheet_extractor

    monkeypatch.setattr(
        datasheet_extractor,
        "extract_text_from_pdf_base64",
        lambda _pdf: "Contact Plating: gold plated",
    )

    res = client.post("/v1/suggest", json={
        "query": "connector",
        "datasheet_text": "Mounting Type: SMD",
        "datasheet_pdf_base64": "ZmFrZQ==",
    })

    attrs = res.json()["extracted_attributes"]
    assert attrs["mounting_type"]["value"] == "SMD"
    assert attrs["contact_plating"]["value"] == "Gold"


def test_the_document_text_also_reaches_classification(client):
    # The datasheet block is evidence for the category too, not only for
    # attributes: a caller supplying a PDF used to get attributes extracted from
    # it while classification still saw only the query.
    res = client.post("/v1/suggest", json={
        "query": "B06B-XH-A",
        "datasheet_text": "JST XH series wire-to-board connector, 2.50mm pitch",
    })

    assert res.status_code == 200
    assert res.json()["category_predictions"]
