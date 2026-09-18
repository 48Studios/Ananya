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
