import re
import base64
import io
from typing import Dict, Optional, Tuple
from pypdf import PdfReader
from ..schemas import ExtractedAttribute, ExtractDatasheetResponse

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
        except Exception as e:
            return ""

    def extract_attributes(self, text: str) -> Dict[str, ExtractedAttribute]:
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
                confidence=0.95
            )

        # 2. Capacitance (pF, nF, uF, F)
        cap_m = re.search(r"\b(\d+(?:\.\d+)?)\s*(uf|nf|pf|f)\b", t, re.IGNORECASE)
        if cap_m:
            val_str, unit_raw = cap_m.groups()
            val = float(val_str)
            u = unit_raw.lower()
            attrs["capacitance"] = ExtractedAttribute(
                code="capacitance",
                value=val,
                unit=u,
                formatted=f"{val_str}{u}",
                confidence=0.95
            )

        # 3. Inductance (nH, uH, mH, H)
        ind_m = re.search(r"\b(\d+(?:\.\d+)?)\s*(uh|mh|nh|h)\b", t, re.IGNORECASE)
        if ind_m:
            val_str, unit_raw = ind_m.groups()
            val = float(val_str)
            u = unit_raw.lower()
            attrs["inductance"] = ExtractedAttribute(
                code="inductance",
                value=val,
                unit=u,
                formatted=f"{val_str}{u}",
                confidence=0.95
            )

        # 4. Voltage Rating (V, kV, mV)
        volt_m = re.search(r"\b(\d+(?:\.\d+)?)\s*(v|kv|mv)\b", t, re.IGNORECASE)
        if volt_m:
            val_str, unit_raw = volt_m.groups()
            attrs["voltage"] = ExtractedAttribute(
                code="voltage",
                value=float(val_str),
                unit=unit_raw.upper(),
                formatted=f"{val_str}{unit_raw.upper()}",
                confidence=0.92
            )

        # 5. Current Rating (mA, A, uA)
        curr_m = re.search(r"\b(\d+(?:\.\d+)?)\s*(ma|a|ua)\b", t, re.IGNORECASE)
        if curr_m:
            val_str, unit_raw = curr_m.groups()
            attrs["current"] = ExtractedAttribute(
                code="current",
                value=float(val_str),
                unit=unit_raw.upper(),
                formatted=f"{val_str}{unit_raw.upper()}",
                confidence=0.90
            )

        # 6. Power Rating (W, mW, kW)
        pow_m = re.search(r"\b(\d+(?:/\d+|\.\d+)?)\s*(w|mw|kw)\b", t, re.IGNORECASE)
        if pow_m:
            val_str, unit_raw = pow_m.groups()
            attrs["power"] = ExtractedAttribute(
                code="power",
                value=val_str,
                unit=unit_raw.upper(),
                formatted=f"{val_str}{unit_raw.upper()}",
                confidence=0.90
            )

        # 7. Tolerance (%)
        tol_m = re.search(r"\b(\d+(?:\.\d+)?)\s*%", t)
        if tol_m:
            val_str = tol_m.group(1)
            attrs["tolerance"] = ExtractedAttribute(
                code="tolerance",
                value=float(val_str),
                unit="%",
                formatted=f"{val_str}%",
                confidence=0.95
            )

        # 8. Package / Footprint
        pkg_m = re.search(
            r"\b(0402|0603|0805|1206|1210|2010|2512|SOT-?23|SOD-?123|SOD-?323|SC-?70|DIP-?8|QFN|SOIC-?8)\b",
            t,
            re.IGNORECASE
        )
        if pkg_m:
            pkg = pkg_m.group(1).upper().replace(" ", "")
            attrs["package"] = ExtractedAttribute(
                code="package",
                value=pkg,
                formatted=pkg,
                confidence=0.98
            )

        # 9. Dielectric (X7R, X5R, C0G, NP0, Y5V)
        diel_m = re.search(r"\b(X7R|X5R|C0G|NP0|Y5V)\b", t, re.IGNORECASE)
        if diel_m:
            code = diel_m.group(1).upper()
            attrs["dielectric"] = ExtractedAttribute(
                code="dielectric",
                value=code,
                formatted=code,
                confidence=0.99
            )

        return attrs

    def process(self, text: Optional[str] = None, pdf_base64: Optional[str] = None) -> ExtractDatasheetResponse:
        extracted_text = ""
        if pdf_base64:
            extracted_text = self.extract_text_from_pdf_base64(pdf_base64)
        if text:
            extracted_text = f"{extracted_text}\n{text}".strip()

        attributes = self.extract_attributes(extracted_text)
        preview = (extracted_text[:200] + "...") if len(extracted_text) > 200 else extracted_text

        return ExtractDatasheetResponse(
            attributes=attributes,
            extracted_text_preview=preview or None
        )

datasheet_extractor = DatasheetExtractorService()
