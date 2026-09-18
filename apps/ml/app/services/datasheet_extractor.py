import re
import base64
import io
from typing import Dict, Optional, Tuple, List
from pypdf import PdfReader
from ..schemas import ExtractedAttribute, ExtractDatasheetResponse, EvidenceItem, DataPackIntelligenceHint

class DatasheetExtractorService:
    def extract_text_from_pdf_base64(self, pdf_base64: str) -> str:
        try:
            pdf_bytes = base64.b64decode(pdf_base64)
            reader = PdfReader(io.BytesIO(pdf_bytes))
            text_parts = []
            # Extract first 5 pages max to keep CPU and memory minimal
            for page in reader.pages[:5]:
                extracted = page.extract_text()
                if extracted:
                    text_parts.append(extracted)
            return "\n".join(text_parts)
        except Exception:
            return ""

    def extract_attributes(
        self,
        text: str,
        datapack_hints: Optional[List[DataPackIntelligenceHint]] = None,
    ) -> Dict[str, ExtractedAttribute]:
        attrs: Dict[str, ExtractedAttribute] = {}
        if not text:
            return attrs

        # Clean common electrical Unicode symbols
        t = (
            text.replace("µ", "u")
            .replace("Ω", "ohm")
            .replace("Ω", "ohm")
            .replace("–", "-")
            .replace("—", "-")
        )

        # 1. Resistance (ohm, kohm, Mohm, R)
        res_m = re.search(r"\b(\d+(?:\.\d+)?)\s*(kohm|mohm|ohm|k|m|r)\b", t, re.IGNORECASE)
        if res_m:
            val_str, unit_raw = res_m.groups()
            val = float(val_str)
            u = unit_raw.lower()
            if u in ("k", "kohm"):
                canonical_val = val * 1000
                display = f"{val_str}kΩ"
            elif u in ("m", "mohm"):
                canonical_val = val * 1000000
                display = f"{val_str}MΩ"
            else:
                canonical_val = val
                display = f"{val_str}Ω"

            attrs["resistance"] = ExtractedAttribute(
                code="resistance",
                value=canonical_val,
                unit="ohm",
                formatted=display,
                confidence=0.95,
                confidence_level="HIGH",
                evidence=[
                    EvidenceItem(
                        type="datasheet_param",
                        description=f"Extracted resistance rating {display} from term '{val_str}{unit_raw}'",
                        weight=0.95,
                        source="extractor:ee_regex",
                    )
                ],
            )

        # 2. Capacitance (pF, nF, uF, F)
        cap_m = re.search(r"\b(\d+(?:\.\d+)?)\s*(uf|nf|pf|f)\b", t, re.IGNORECASE)
        if cap_m:
            val_str, unit_raw = cap_m.groups()
            val = float(val_str)
            u = unit_raw.lower()
            display = f"{val_str}{u}"
            attrs["capacitance"] = ExtractedAttribute(
                code="capacitance",
                value=val,
                unit=u,
                formatted=display,
                confidence=0.95,
                confidence_level="HIGH",
                evidence=[
                    EvidenceItem(
                        type="datasheet_param",
                        description=f"Extracted capacitance rating {display} from term '{val_str}{unit_raw}'",
                        weight=0.95,
                        source="extractor:ee_regex",
                    )
                ],
            )

        # 3. Inductance (nH, uH, mH, H)
        ind_m = re.search(r"\b(\d+(?:\.\d+)?)\s*(uh|mh|nh|h)\b", t, re.IGNORECASE)
        if ind_m:
            val_str, unit_raw = ind_m.groups()
            val = float(val_str)
            u = unit_raw.lower()
            display = f"{val_str}{u}"
            attrs["inductance"] = ExtractedAttribute(
                code="inductance",
                value=val,
                unit=u,
                formatted=display,
                confidence=0.95,
                confidence_level="HIGH",
                evidence=[
                    EvidenceItem(
                        type="datasheet_param",
                        description=f"Extracted inductance rating {display} from term '{val_str}{unit_raw}'",
                        weight=0.95,
                        source="extractor:ee_regex",
                    )
                ],
            )

        # 4. Voltage Rating (V, kV, mV)
        volt_m = re.search(r"\b(\d+(?:\.\d+)?)\s*(v|kv|mv)\b", t, re.IGNORECASE)
        if volt_m:
            val_str, unit_raw = volt_m.groups()
            display = f"{val_str}{unit_raw.upper()}"
            attrs["voltage"] = ExtractedAttribute(
                code="voltage",
                value=float(val_str),
                unit=unit_raw.upper(),
                formatted=display,
                confidence=0.92,
                confidence_level="HIGH",
                evidence=[
                    EvidenceItem(
                        type="datasheet_param",
                        description=f"Extracted voltage rating {display}",
                        weight=0.92,
                        source="extractor:ee_regex",
                    )
                ],
            )

        # 5. Current Rating (mA, A, uA)
        curr_m = re.search(r"\b(\d+(?:\.\d+)?)\s*(ma|a|ua)\b", t, re.IGNORECASE)
        if curr_m:
            val_str, unit_raw = curr_m.groups()
            display = f"{val_str}{unit_raw.upper()}"
            attrs["current"] = ExtractedAttribute(
                code="current",
                value=float(val_str),
                unit=unit_raw.upper(),
                formatted=display,
                confidence=0.90,
                confidence_level="HIGH",
                evidence=[
                    EvidenceItem(
                        type="datasheet_param",
                        description=f"Extracted current rating {display}",
                        weight=0.90,
                        source="extractor:ee_regex",
                    )
                ],
            )

        # 6. Power Rating (W, mW, kW)
        pow_m = re.search(r"\b(\d+(?:/\d+|\.\d+)?)\s*(w|mw|kw)\b", t, re.IGNORECASE)
        if pow_m:
            val_str, unit_raw = pow_m.groups()
            display = f"{val_str}{unit_raw.upper()}"
            attrs["power"] = ExtractedAttribute(
                code="power",
                value=val_str,
                unit=unit_raw.upper(),
                formatted=display,
                confidence=0.90,
                confidence_level="HIGH",
                evidence=[
                    EvidenceItem(
                        type="datasheet_param",
                        description=f"Extracted power rating {display}",
                        weight=0.90,
                        source="extractor:ee_regex",
                    )
                ],
            )

        # 7. Tolerance (%)
        tol_m = re.search(r"\b(\d+(?:\.\d+)?)\s*%", t)
        if tol_m:
            val_str = tol_m.group(1)
            display = f"{val_str}%"
            attrs["tolerance"] = ExtractedAttribute(
                code="tolerance",
                value=float(val_str),
                unit="%",
                formatted=display,
                confidence=0.95,
                confidence_level="HIGH",
                evidence=[
                    EvidenceItem(
                        type="datasheet_param",
                        description=f"Extracted tolerance rating {display}",
                        weight=0.95,
                        source="extractor:ee_regex",
                    )
                ],
            )

        # 8. Package / Footprint
        pkg_m = re.search(
            r"\b(0201|0402|0603|0805|1206|1210|2010|2512|SOT-?23|SOD-?123|SOD-?323|SOD-?523|SC-?70|DIP-?8|QFN|SOIC-?8|TSSOP|BGA|SMA|SMB|SMC|DO-?41|TO-?220)\b",
            t,
            re.IGNORECASE,
        )
        if pkg_m:
            pkg = pkg_m.group(1).upper().replace(" ", "")
            attrs["package"] = ExtractedAttribute(
                code="package",
                value=pkg,
                formatted=pkg,
                confidence=0.98,
                confidence_level="HIGH",
                evidence=[
                    EvidenceItem(
                        type="datasheet_param",
                        description=f"Identified physical package footprint '{pkg}'",
                        weight=0.98,
                        source="extractor:ee_package",
                    )
                ],
            )

        # 9. Dielectric (X7R, X5R, C0G, NP0, Y5V)
        diel_m = re.search(r"\b(X7R|X5R|C0G|NP0|Y5V)\b", t, re.IGNORECASE)
        if diel_m:
            code = diel_m.group(1).upper()
            attrs["dielectric"] = ExtractedAttribute(
                code="dielectric",
                value=code,
                formatted=code,
                confidence=0.99,
                confidence_level="HIGH",
                evidence=[
                    EvidenceItem(
                        type="datasheet_param",
                        description=f"Identified capacitor dielectric code '{code}'",
                        weight=0.99,
                        source="extractor:ee_dielectric",
                    )
                ],
            )

        # 10. Check Data Pack expected attributes to boost evidence if present
        if datapack_hints:
            for hint in datapack_hints:
                if hint.expectedAttributes:
                    for exp in hint.expectedAttributes:
                        if exp in attrs:
                            attrs[exp].evidence.append(
                                EvidenceItem(
                                    type="data_pack_rule",
                                    description=f"Attribute '{exp}' is expected by active Data Pack '{hint.categoryName or 'pack'}'",
                                    weight=0.85,
                                    source=f"datapack:{hint.categoryCode or 'hints'}",
                                )
                            )

        return attrs

    def process(
        self,
        text: Optional[str] = None,
        pdf_base64: Optional[str] = None,
        datapack_hints: Optional[List[DataPackIntelligenceHint]] = None,
    ) -> ExtractDatasheetResponse:
        extracted_text = ""
        if pdf_base64:
            extracted_text = self.extract_text_from_pdf_base64(pdf_base64)
        if text:
            extracted_text = f"{extracted_text}\n{text}".strip()

        attributes = self.extract_attributes(extracted_text, datapack_hints)
        preview = (extracted_text[:200] + "...") if len(extracted_text) > 200 else extracted_text

        return ExtractDatasheetResponse(
            attributes=attributes,
            extracted_text_preview=preview or None,
        )

datasheet_extractor = DatasheetExtractorService()
