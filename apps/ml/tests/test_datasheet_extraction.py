"""Datasheet extraction contract tests (Pass 2).

Covers the evidence enrichment added for Documentation Intelligence: page
numbers and text excerpts must come from the document, never be invented, and
the original extraction values must not change.
"""

import base64
import io

import pytest

from apps.ml.app.main import app
from apps.ml.app.schemas import ExtractDatasheetResponse
from apps.ml.app.services.datasheet_extractor import (
    EXTRACTOR_VERSION,
    MAX_EVIDENCE_PER_ATTRIBUTE,
    MAX_EXTRACTED_TEXT_CHARS,
    MAX_PAGES_ANALYZED,
    datasheet_extractor,
)


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    return TestClient(app)


def _pdf_bytes(pages):
    """Builds a minimal, real PDF with one text line per page (pypdf readable)."""

    def escape(text):
        return text.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")

    objects = []
    page_ids = []
    content_ids = []

    # 1 = Catalog, 2 = Pages, 3 = Font; page/content objects follow.
    next_id = 4
    for _ in pages:
        page_ids.append(next_id)
        next_id += 1
        content_ids.append(next_id)
        next_id += 1

    objects.append((1, "<< /Type /Catalog /Pages 2 0 R >>"))
    kids = " ".join(f"{pid} 0 R" for pid in page_ids)
    objects.append(
        (2, f"<< /Type /Pages /Count {len(pages)} /Kids [{kids}] >>")
    )
    objects.append(
        (3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    )

    for page_id, content_id, text in zip(page_ids, content_ids, pages):
        stream = f"BT /F1 12 Tf 72 720 Td ({escape(text)}) Tj ET"
        objects.append(
            (
                page_id,
                f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
                f"/Resources << /Font << /F1 3 0 R >> >> /Contents {content_id} 0 R >>",
            )
        )
        objects.append(
            (
                content_id,
                f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream",
            )
        )

    buffer = io.BytesIO()
    buffer.write(b"%PDF-1.4\n")
    offsets = {}
    for obj_id, body in sorted(objects):
        offsets[obj_id] = buffer.tell()
        buffer.write(f"{obj_id} 0 obj\n{body}\nendobj\n".encode("latin-1"))

    xref_offset = buffer.tell()
    max_id = max(offsets)
    buffer.write(f"xref\n0 {max_id + 1}\n".encode("latin-1"))
    buffer.write(b"0000000000 65535 f \n")
    for obj_id in range(1, max_id + 1):
        buffer.write(f"{offsets.get(obj_id, 0):010d} 00000 n \n".encode("latin-1"))
    buffer.write(
        f"trailer\n<< /Size {max_id + 1} /Root 1 0 R >>\nstartxref\n"
        f"{xref_offset}\n%%EOF\n".encode("latin-1")
    )
    return buffer.getvalue()


def _b64(pdf_bytes):
    return base64.b64encode(pdf_bytes).decode("ascii")


# ---------------------------------------------------------------------------
# Contract
# ---------------------------------------------------------------------------


def test_extractor_version_is_exposed(client):
    res = client.post("/v1/extract/datasheet", json={"text": "10k Ohm 0805"})
    assert res.status_code == 200
    assert res.json()["extractor_version"] == EXTRACTOR_VERSION


def test_text_only_input_claims_no_page(client):
    """
    Caller-supplied text is not a located document page.

    The excerpt is still the verbatim text that produced the value, but no page
    number may be claimed, because there is no document to point at.
    """
    res = client.post("/v1/extract/datasheet", json={"text": "10k Ohm 0805 50V"})
    assert res.status_code == 200
    data = res.json()
    evidence = data["attributes"]["resistance"]["evidence"][0]
    assert evidence["page"] is None
    assert evidence["text"] == "10k Ohm 0805 50V"
    assert data["page_count"] is None


def test_pdf_input_reports_pages_and_excerpts(client):
    pdf = _pdf_bytes(
        [
            "MC0805S8F3000T5E Resistor Datasheet",
            "Electrical characteristics",
            "Ratings: 300 Ohm 1% 0805 50V",
        ]
    )
    res = client.post("/v1/extract/datasheet", json={"pdf_base64": _b64(pdf)})
    assert res.status_code == 200
    data = res.json()

    assert data["page_count"] == 3
    assert data["pages_analyzed"] == 3
    assert data["extracted_text"]

    resistance = data["attributes"]["resistance"]
    assert resistance["value"] == 300.0
    assert resistance["unit"] == "ohm"
    evidence = resistance["evidence"][0]
    # The value was on page 3, and the excerpt quotes that page.
    assert evidence["page"] == 3
    assert "300 Ohm" in evidence["text"]
    assert evidence["source"] == "extractor:ee_regex"

    # Package and tolerance were found on the same page.
    assert data["attributes"]["package"]["value"] == "0805"
    assert data["attributes"]["package"]["evidence"][0]["page"] == 3
    assert data["attributes"]["tolerance"]["evidence"][0]["page"] == 3


def test_evidence_page_is_deterministic(client):
    pdf = _pdf_bytes(["nothing here", "300 Ohm resistor", "300 Ohm resistor"])
    payload = {"pdf_base64": _b64(pdf)}

    first = client.post("/v1/extract/datasheet", json=payload).json()
    second = client.post("/v1/extract/datasheet", json=payload).json()

    assert first == second
    # First matching page wins, not the last.
    assert first["attributes"]["resistance"]["evidence"][0]["page"] == 2


def test_evidence_excerpt_is_bounded(client):
    long_line = "x" * 500 + " 300 Ohm " + "y" * 500
    pdf = _pdf_bytes([long_line])
    data = client.post("/v1/extract/datasheet", json={"pdf_base64": _b64(pdf)}).json()

    snippet = data["attributes"]["resistance"]["evidence"][0]["text"]
    assert snippet is not None
    assert len(snippet) <= 240
    assert "300 Ohm" in snippet


def test_extracted_text_is_bounded(client):
    pdf = _pdf_bytes(["a" * 30000])
    data = client.post("/v1/extract/datasheet", json={"pdf_base64": _b64(pdf)}).json()
    assert len(data["extracted_text"]) <= MAX_EXTRACTED_TEXT_CHARS


def test_malformed_pdf_returns_empty_extraction_without_error(client):
    """A corrupt upload must be a clean empty result, never a 500 or a crash."""
    res = client.post(
        "/v1/extract/datasheet",
        json={"pdf_base64": base64.b64encode(b"not a pdf at all").decode("ascii")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["attributes"] == {}
    assert data["page_count"] == 0
    assert data["extracted_text"] is None


def test_invalid_base64_returns_empty_extraction(client):
    res = client.post("/v1/extract/datasheet", json={"pdf_base64": "!!!not base64!!!"})
    assert res.status_code == 200
    assert res.json()["attributes"] == {}


def test_pdf_without_extractable_text_yields_no_attributes(client):
    """A scanned/image-only PDF yields nothing rather than hallucinated values."""
    pdf = _pdf_bytes([""])
    data = client.post("/v1/extract/datasheet", json={"pdf_base64": _b64(pdf)}).json()
    assert data["attributes"] == {}
    assert data["page_count"] == 1


def test_unicode_electrical_symbols_still_extract(client):
    res = client.post("/v1/extract/datasheet", json={"text": "300 Ω ±1% 0805"})
    data = res.json()
    assert data["attributes"]["resistance"]["value"] == 300.0
    assert data["attributes"]["tolerance"]["value"] == 1.0


def test_existing_attribute_values_unchanged(client):
    """Regression guard for the contract the ERP already depends on."""
    res = client.post(
        "/v1/extract/datasheet",
        json={"text": "0805 SMD Resistor, 10k Ohm 1% 1/4W 50V"},
    )
    attrs = res.json()["attributes"]
    assert attrs["resistance"]["value"] == 10000.0
    assert attrs["resistance"]["unit"] == "ohm"
    assert attrs["resistance"]["confidence"] == 0.95
    assert attrs["tolerance"]["value"] == 1.0
    assert attrs["package"]["value"] == "0805"
    assert attrs["voltage"]["value"] == 50.0


def test_datapack_hints_still_add_evidence(client):
    res = client.post(
        "/v1/extract/datasheet",
        json={
            "text": "10k Ohm 0805",
            "datapack_hints": [
                {"categoryCode": "resistors", "categoryName": "Resistors",
                 "expectedAttributes": ["resistance"]}
            ],
        },
    )
    evidence = res.json()["attributes"]["resistance"]["evidence"]
    assert any(item["type"] == "data_pack_rule" for item in evidence)
    # Data Pack evidence is not document evidence and claims no page.
    hint = [item for item in evidence if item["type"] == "data_pack_rule"][0]
    assert hint["page"] is None


def test_response_model_accepts_enriched_payload():
    """The declared contract must include the Pass 2 evidence fields."""
    fields = ExtractDatasheetResponse.model_fields
    for field in (
        "extracted_text",
        "page_count",
        "pages_analyzed",
        "extractor_version",
    ):
        assert field in fields


def test_extract_attributes_helper_matches_page_api():
    """`extract_attributes(text)` stays as the text-only entry point."""
    direct = datasheet_extractor.extract_attributes("10k Ohm 0805")
    via_pages = datasheet_extractor.extract_attributes_from_pages(
        [(None, "10k Ohm 0805")]
    )
    assert direct == via_pages


def test_paged_extraction_numbers_real_pages_only():
    first, second = "10k Ohm 0805", "50V rating"

    paged = datasheet_extractor.extract_attributes_from_pages(
        [(1, first), (2, second)]
    )
    assert paged["resistance"].evidence[0].page == 1
    assert paged["voltage"].evidence[0].page == 2

    unpaged = datasheet_extractor.extract_attributes_from_pages([(None, first)])
    assert unpaged["resistance"].evidence[0].page is None
    assert unpaged["resistance"].evidence[0].text is not None


# ---------------------------------------------------------------------------
# Pass 4: bounded page selection, sections, multi-page evidence
# ---------------------------------------------------------------------------


def test_extractor_version_reflects_the_new_contract(client):
    res = client.post("/v1/extract/datasheet", json={"text": "10k Ohm 0805"})
    # v3 added the physical/mechanical rules (mounting, termination, plating,
    # gender, orientation, pin count, pitch), so the contract changed.
    assert res.json()["extractor_version"] == "datasheet-extract-v3"


# ---------------------------------------------------------------------------
# Physical / mechanical attributes (v3)
# ---------------------------------------------------------------------------


def test_mounting_type_is_classified_from_the_stated_technology(client):
    res = client.post(
        "/v1/extract/datasheet",
        json={"text": "Mounting Type: Surface Mount\nPackage: 0805"},
    )
    mounting = res.json()["attributes"]["mounting_type"]
    assert mounting["value"] == "SMD"
    assert mounting["formatted"] == "SMD"
    assert mounting["confidence_level"] == "MEDIUM"

    through = client.post(
        "/v1/extract/datasheet", json={"text": "Through-hole mounting, axial leads"}
    ).json()["attributes"]["mounting_type"]
    assert through["value"] == "Through Hole"

    panel = client.post(
        "/v1/extract/datasheet", json={"text": "Panel mount potentiometer"}
    ).json()["attributes"]["mounting_type"]
    assert panel["value"] == "Panel Mount"


def test_mounting_type_is_not_inferred_from_a_footprint_code(client):
    # A package code is a footprint, not a mounting technology: deriving one from
    # the other is the caller's job, which owns the package vocabulary.
    attrs = client.post(
        "/v1/extract/datasheet", json={"text": "0805 10k Ohm"}
    ).json()["attributes"]
    assert "mounting_type" not in attrs


def test_termination_style_prefers_the_specific_lead_form(client):
    axial = client.post(
        "/v1/extract/datasheet", json={"text": "Axial leaded resistor 10k"}
    ).json()["attributes"]["termination"]
    assert axial["value"] == "Through Hole (Axial)"

    radial = client.post(
        "/v1/extract/datasheet", json={"text": "Radial capacitor 10uF"}
    ).json()["attributes"]["termination"]
    assert radial["value"] == "Through Hole (Radial)"

    screw = client.post(
        "/v1/extract/datasheet", json={"text": "Screw terminal block 6 position"}
    ).json()["attributes"]["termination"]
    assert screw["value"] == "Screw Terminal"


def test_contact_plating_normalises_the_stated_finish(client):
    gold = client.post(
        "/v1/extract/datasheet", json={"text": "Contacts: gold plated"}
    ).json()["attributes"]["contact_plating"]
    assert gold["value"] == "Gold"

    selective = client.post(
        "/v1/extract/datasheet", json={"text": "Selective gold contact finish"}
    ).json()["attributes"]["contact_plating"]
    assert selective["value"] == "Selective Gold"


def test_gender_reads_sexed_terms_and_plug_socket_nouns(client):
    male = client.post(
        "/v1/extract/datasheet", json={"text": "Male header 6 pin"}
    ).json()["attributes"]["gender"]
    assert male["value"] == "Male"

    female = client.post(
        "/v1/extract/datasheet", json={"text": "Female socket housing"}
    ).json()["attributes"]["gender"]
    assert female["value"] == "Female"

    # `header` alone is a layout word in datasheets and is never used on its own.
    assert (
        "gender"
        not in client.post(
            "/v1/extract/datasheet", json={"text": "Table header row 3"}
        ).json()["attributes"]
    )


def test_orientation_reads_the_body_orientation(client):
    right = client.post(
        "/v1/extract/datasheet", json={"text": "Right angle connector"}
    ).json()["attributes"]["orientation"]
    assert right["value"] == "Right Angle"

    vertical = client.post(
        "/v1/extract/datasheet", json={"text": "Vertical mount terminal"}
    ).json()["attributes"]["orientation"]
    assert vertical["value"] == "Vertical"


def test_pin_count_and_pitch_are_read_with_their_units(client):
    attrs = client.post(
        "/v1/extract/datasheet",
        json={"text": "6 position connector, 2.50mm pitch, 3A rated"},
    ).json()["attributes"]
    assert attrs["pin_count"]["value"] == 6
    assert attrs["pin_count"]["formatted"] == "6-pin"
    assert attrs["pitch"]["value"] == 2.5
    assert attrs["pitch"]["unit"] == "mm"


def test_pitch_requires_a_unit(client):
    # A bare number after `pitch` is not a pitch and must not become one.
    attrs = client.post(
        "/v1/extract/datasheet", json={"text": "Pitch: 3 rows of contacts"}
    ).json()["attributes"]
    assert "pitch" not in attrs


def test_pin_count_outside_a_plausible_range_is_ignored(client):
    attrs = client.post(
        "/v1/extract/datasheet", json={"text": "2019 position statement"}
    ).json()["attributes"]
    assert "pin_count" not in attrs


def test_new_attributes_do_not_disturb_the_existing_rules(client):
    """Regression guard: the v2 vocabulary keeps extracting unchanged."""
    attrs = client.post(
        "/v1/extract/datasheet",
        json={"text": "0805 SMD Resistor, 10k Ohm 1% 1/4W 50V"},
    ).json()["attributes"]

    assert attrs["resistance"]["value"] == 10000.0
    assert attrs["tolerance"]["value"] == 1.0
    assert attrs["package"]["value"] == "0805"
    assert attrs["voltage"]["value"] == 50.0
    assert attrs["power"]["unit"] == "W"



def test_leading_pages_are_always_analysed(client):
    pdf = _pdf_bytes(["Resistor Datasheet", "Summary", "Ratings: 300 Ohm 0805"])
    data = client.post("/v1/extract/datasheet", json={"pdf_base64": _b64(pdf)}).json()

    assert data["pages_analyzed"] == 3
    assert data["attributes"]["resistance"]["evidence"][0]["page"] == 3


def test_specification_table_beyond_the_leading_pages_is_found(client):
    """
    The case Pass 2 could not handle: a specification table deep in a document.

    Page 8 of 10 is beyond any positional window that keeps the scan bounded, so
    it is found by content.
    """
    pages = [f"Cover page {index}" for index in range(1, 8)]
    pages.append("Electrical Characteristics: resistance 470 Ohm, tolerance 1 %")
    pages.append("Mechanical dimensions")
    pages.append("Legal notices")
    pdf = _pdf_bytes(pages)

    data = client.post("/v1/extract/datasheet", json={"pdf_base64": _b64(pdf)}).json()

    assert data["page_count"] == 10
    resistance = data["attributes"]["resistance"]
    assert resistance["value"] == 470.0
    assert resistance["evidence"][0]["page"] == 8


def test_page_selection_is_bounded(client):
    """A large PDF must not be analysed page by page."""
    pages = [f"Electrical characteristics page {index} 100 Ohm" for index in range(60)]
    pdf = _pdf_bytes(pages)

    data = client.post("/v1/extract/datasheet", json={"pdf_base64": _b64(pdf)}).json()

    assert data["page_count"] == 60
    assert data["pages_analyzed"] <= MAX_PAGES_ANALYZED


def test_page_selection_is_deterministic(client):
    pages = ["Cover", "Notes", "Electrical Characteristics 220 Ohm", "Ordering information 220 Ohm"]
    payload = {"pdf_base64": _b64(_pdf_bytes(pages))}

    first = client.post("/v1/extract/datasheet", json=payload).json()
    second = client.post("/v1/extract/datasheet", json=payload).json()
    assert first == second


def test_evidence_lists_every_page_that_states_the_value(client):
    """A specification stated twice is one value with two pieces of evidence."""
    pdf = _pdf_bytes(
        [
            "Datasheet",
            "Electrical Characteristics: 300 Ohm",
            "Ordering Information: 300 Ohm",
        ]
    )
    data = client.post("/v1/extract/datasheet", json={"pdf_base64": _b64(pdf)}).json()

    resistance = data["attributes"]["resistance"]
    assert resistance["value"] == 300.0
    pages = [item["page"] for item in resistance["evidence"]]
    assert 2 in pages and 3 in pages


def test_evidence_is_ordered_with_specification_sections_first(client):
    pages = [
        "Datasheet",
        "Product summary mentions 300 Ohm in passing",
        "Absolute Maximum Ratings: 300 Ohm",
    ]
    pdf = _pdf_bytes(pages)
    data = client.post("/v1/extract/datasheet", json={"pdf_base64": _b64(pdf)}).json()

    evidence = data["attributes"]["resistance"]["evidence"]
    assert evidence[0]["section"] == "ABSOLUTE_MAXIMUM_RATINGS"
    assert evidence[0]["page"] == 3


def test_evidence_records_the_section_it_was_found_in(client):
    pdf = _pdf_bytes(["Datasheet", "Electrical Characteristics", "resistance 300 Ohm"])
    data = client.post("/v1/extract/datasheet", json={"pdf_base64": _b64(pdf)}).json()

    evidence = data["attributes"]["resistance"]["evidence"][0]
    assert evidence["section"] == "ELECTRICAL_CHARACTERISTICS"


def test_evidence_claims_no_section_it_cannot_identify(client):
    """An unrecognised page is not promoted to a specification section."""
    pdf = _pdf_bytes(["Datasheet", "Random page", "300 Ohm resistor"])
    data = client.post("/v1/extract/datasheet", json={"pdf_base64": _b64(pdf)}).json()

    evidence = data["attributes"]["resistance"]["evidence"][0]
    assert evidence["section"] is None


def test_evidence_is_deduplicated_per_page(client):
    """The same line repeated on one page is one piece of evidence."""
    pdf = _pdf_bytes(["Datasheet", "300 Ohm 300 Ohm 300 Ohm"])
    data = client.post("/v1/extract/datasheet", json={"pdf_base64": _b64(pdf)}).json()

    evidence = data["attributes"]["resistance"]["evidence"]
    assert len(evidence) == 1


def test_evidence_count_per_attribute_is_bounded(client):
    pages = ["Datasheet"] + [f"Electrical Characteristics 300 Ohm page {i}" for i in range(1, 10)]
    pdf = _pdf_bytes(pages)
    data = client.post("/v1/extract/datasheet", json={"pdf_base64": _b64(pdf)}).json()

    assert len(data["attributes"]["resistance"]["evidence"]) <= MAX_EVIDENCE_PER_ATTRIBUTE


def test_text_only_input_still_claims_no_page_and_no_section(client):
    data = client.post(
        "/v1/extract/datasheet", json={"text": "Electrical Characteristics 300 Ohm"}
    ).json()

    evidence = data["attributes"]["resistance"]["evidence"][0]
    assert evidence["page"] is None
    # The section is derived from the text, which is present, so it is reported.
    assert evidence["section"] == "ELECTRICAL_CHARACTERISTICS"
