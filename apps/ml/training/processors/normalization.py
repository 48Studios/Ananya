"""
Unified Normalization Processor.

Normalizes:
1. Text (unicode cleaning, casing, spacing)
2. Units and electrical/mechanical physical quantities (converting to canonical units & SI base)
3. Manufacturer names and aliases
4. Part numbers and packaging suffixes
5. Category taxonomy across diverse ERP domains
"""

import re
import unicodedata
from typing import Tuple, Optional, Dict, Any, List
from .base import BaseProcessor, ProcessingDisposition, ProcessingAudit
from ..schemas.product import ProductRecord, AttributeValueRecord


# Canonical Manufacturer Alias Map
MANUFACTURER_ALIASES: Dict[str, str] = {
    "murata": "Murata Manufacturing",
    "murata mfg": "Murata Manufacturing",
    "murata electronics": "Murata Manufacturing",
    "yageo corp": "Yageo",
    "yageo corporation": "Yageo",
    "kemet": "KEMET",
    "kemet electronics": "KEMET",
    "ti": "Texas Instruments",
    "texas instruments inc": "Texas Instruments",
    "st": "STMicroelectronics",
    "stmicro": "STMicroelectronics",
    "vishay intertechnology": "Vishay",
    "vishay dale": "Vishay",
    "sunlord electronics": "Sunlord",
    "slkor micro": "Slkor",
    "microchip technology": "Microchip",
    "panasonic electronic": "Panasonic",
    "mcmaster": "McMaster-Carr",
    "mcmaster carr": "McMaster-Carr",
    "fastenal company": "Fastenal",
    "misumi group": "Misumi",
    "3m company": "3M",
    "loctite": "Henkel / Loctite",
}

# Cross-Domain Supplier Taxonomy Mapping
GLOBAL_TAXONOMY_MAP: Dict[str, str] = {
    # Electronics - Resistors
    "chip resistor - surface mount": "Resistors",
    "through hole resistors": "Resistors",
    "resistor networks, arrays": "Resistors",
    "smd resistor": "Resistors",
    "smd resistors": "Resistors",
    # Electronics - Capacitors
    "ceramic capacitors": "Capacitors",
    "aluminum electrolytic capacitors": "Capacitors",
    "tantalum capacitors": "Capacitors",
    "film capacitors": "Capacitors",
    "smd capacitors": "Capacitors",
    # Electronics - Inductors & Ferrites
    "fixed inductors": "Inductors",
    "ferrite beads and chips": "Inductors",
    "chokes": "Inductors",
    # Electronics - Semiconductors
    "diodes - rectifiers - single": "Diodes",
    "diodes - zener - single": "Diodes",
    "schottky diodes": "Diodes",
    "transistors - fets, mosfets - single": "Transistors",
    "transistors - bipolar (bjt) - single": "Transistors",
    "microcontrollers": "ICs & Semiconductors",
    "linear - amplifiers - op amps": "ICs & Semiconductors",
    "pmic - voltage regulators - linear": "ICs & Semiconductors",
    "pmic - voltage regulators - dc dc switching": "ICs & Semiconductors",
    # Electrical
    "rectangular connectors - headers, male pins": "Connectors",
    "usb connectors": "Connectors",
    "modular connectors - jacks": "Connectors",
    "tactile switches": "Switches",
    "dip switches": "Switches",
    "led indication - discrete": "Optoelectronics",
    "optoisolators": "Optoelectronics",
    "flat ribbon cables": "Cables",
    "hook up wire": "Cables",
    # Mechanical & Fasteners
    "screws, bolts": "Fasteners",
    "machine screws": "Fasteners",
    "socket head cap screws": "Fasteners",
    "nuts, locknuts": "Fasteners",
    "washers": "Fasteners",
    "standoffs, spacers": "Mechanical Parts",
    "heat sinks": "Mechanical Parts",
    "ball bearings": "Mechanical Parts",
    "linear guide rails": "Mechanical Parts",
    "timing belts, pulleys": "Mechanical Parts",
    # Tools & Hardware
    "hand tools - screwdrivers": "Tools",
    "pliers, cutters": "Tools",
    "crimpers, crimp tools": "Tools",
    "soldering irons, stations": "Tools",
    "multimeters, test probes": "Tools",
    # Raw Materials
    "copper clad laminates": "Raw Materials",
    "aluminum sheets, plates": "Raw Materials",
    "stainless steel rods": "Raw Materials",
    "acrylic sheets": "Raw Materials",
    # Consumables
    "solder, desoldering braid, flux": "Consumables",
    "solder paste": "Consumables",
    "heat shrink tubing": "Consumables",
    "thermal grease, paste": "Consumables",
    "epoxy adhesives": "Consumables",
    # 3D Printing
    "3d printer filament - pla": "3D Printing Materials",
    "3d printer filament - petg": "3D Printing Materials",
    "3d printer resin": "3D Printing Materials",
    "3d printer nozzles": "Mechanical Parts",
}


def normalize_text(text: str) -> str:
    """Normalizes unicode characters, replaces micro/ohm variants, and collapses whitespace."""
    if not text:
        return ""
    # NFKD normalization
    text = unicodedata.normalize("NFKD", text)
    # Greek and unit symbols
    text = text.replace("µ", "u").replace("μ", "u").replace("Ω", "ohm").replace("Ω", "ohm")
    # Collapse whitespace
    return re.sub(r"\s+", " ", text).strip()


def normalize_unit_value(
    raw_str: str, property_hint: Optional[str] = None
) -> Tuple[Optional[float], Optional[str], Optional[float]]:
    """
    Parses a raw physical value string and converts it to (canonical_val, canonical_unit, normalized_si).
    Examples:
        '10k' -> (10.0, 'kΩ', 10000.0) [if resistance]
        '0.1 uF' -> (0.1, 'µF', 1e-7)
        '50V' -> (50.0, 'V', 50.0)
        '10 uH' -> (10.0, 'µH', 1e-5)
        '8mm' -> (8.0, 'mm', 0.008)
        '1.75 mm' -> (1.75, 'mm', 0.00175)
    """
    t = normalize_text(raw_str).lower()

    # 1. Resistance (ohm, kohm, mohm)
    res_m = re.search(r"(\d+(?:\.\d+)?)\s*(kohm|mohm|gohm|ohm|k|m|r)\b", t)
    if res_m and (not property_hint or "resist" in property_hint.lower()):
        val = float(res_m.group(1))
        u = res_m.group(2)
        mult = 1.0
        unit = "Ω"
        if u in ("k", "kohm"):
            mult = 1000.0
            unit = "kΩ"
        elif u in ("m", "mohm"):
            mult = 1000000.0
            unit = "MΩ"
        elif u == "gohm":
            mult = 1e9
            unit = "GΩ"
        return val, unit, val * mult

    # 2. Capacitance (pf, nf, uf, mf, f)
    cap_m = re.search(r"(\d+(?:\.\d+)?)\s*(uf|nf|pf|mf|f)\b", t)
    if cap_m and (not property_hint or "capacit" in property_hint.lower()):
        val = float(cap_m.group(1))
        u = cap_m.group(2)
        mult = 1.0
        unit = "F"
        if u == "pf":
            mult = 1e-12
            unit = "pF"
        elif u == "nf":
            mult = 1e-9
            unit = "nF"
        elif u == "uf":
            mult = 1e-6
            unit = "µF"
        elif u == "mf":
            mult = 1e-3
            unit = "mF"
        return val, unit, val * mult

    # 3. Voltage (mv, v, kv)
    volt_m = re.search(r"(\d+(?:\.\d+)?)\s*(kv|mv|v)\b", t)
    if volt_m and (not property_hint or "volt" in property_hint.lower()):
        val = float(volt_m.group(1))
        u = volt_m.group(2)
        mult = 1.0
        unit = "V"
        if u == "mv":
            mult = 1e-3
            unit = "mV"
        elif u == "kv":
            mult = 1e3
            unit = "kV"
        return val, unit, val * mult

    # 4. Inductance (nh, uh, mh, h)
    ind_m = re.search(r"(\d+(?:\.\d+)?)\s*(nh|uh|mh|h)\b", t)
    if ind_m and (not property_hint or "induct" in property_hint.lower()):
        val = float(ind_m.group(1))
        u = ind_m.group(2)
        mult = 1.0
        unit = "H"
        if u == "nh":
            mult = 1e-9
            unit = "nH"
        elif u == "uh":
            mult = 1e-6
            unit = "µH"
        elif u == "mh":
            mult = 1e-3
            unit = "mH"
        return val, unit, val * mult

    # 5. Length / Dimensions (mm, cm, m, inch, in)
    len_m = re.search(r"(\d+(?:\.\d+)?)\s*(mm|cm|m|inch|in|\")\b", t)
    if len_m and (not property_hint or any(k in property_hint.lower() for k in ("length", "dimension", "diameter", "size", "height", "width"))):
        val = float(len_m.group(1))
        u = len_m.group(2)
        mult = 0.001
        unit = "mm"
        if u == "cm":
            mult = 0.01
            unit = "cm"
        elif u == "m":
            mult = 1.0
            unit = "m"
        elif u in ("inch", "in", '"'):
            mult = 0.0254
            unit = "in"
        return val, unit, val * mult

    # 6. Mass / Weight (mg, g, kg, lb, oz)
    mass_m = re.search(r"(\d+(?:\.\d+)?)\s*(mg|g|kg|lb|oz)\b", t)
    if mass_m and (not property_hint or any(k in property_hint.lower() for k in ("mass", "weight"))):
        val = float(mass_m.group(1))
        u = mass_m.group(2)
        mult = 0.001
        unit = "g"
        if u == "mg":
            mult = 1e-6
            unit = "mg"
        elif u == "kg":
            mult = 1.0
            unit = "kg"
        elif u == "lb":
            mult = 0.453592
            unit = "lb"
        elif u == "oz":
            mult = 0.0283495
            unit = "oz"
        return val, unit, val * mult

    # Fallback to plain float
    num_m = re.search(r"^(\d+(?:\.\d+)?)$", t)
    if num_m:
        val = float(num_m.group(1))
        return val, "", val

    return None, None, None


def normalize_manufacturer(name: Optional[str]) -> str:
    """Resolves manufacturer aliases into canonical names."""
    if not name:
        return "Generic"
    cleaned = normalize_text(name).strip().lower()
    return MANUFACTURER_ALIASES.get(cleaned, name.strip())


def normalize_category(category: str) -> str:
    """Maps vendor category string to canonical Ananya category."""
    if not category:
        return "General"
    cleaned = normalize_text(category).strip().lower()
    return GLOBAL_TAXONOMY_MAP.get(cleaned, category.strip())


def strip_packaging_suffix(mpn: str) -> Tuple[str, str]:
    """
    Strips commercial packaging suffixes (e.g. -TR, /TR, -REEL, -ND)
    while returning (clean_mpn, base_mpn).
    """
    clean = mpn.strip().upper()
    base = re.sub(r"([-_/](TR|REEL|CT|TAPE|ND|ROHS|LEADFREE|\d+K))+$", "", clean, flags=re.IGNORECASE)
    base_family = base[:8] if len(base) >= 8 else base
    return clean, base_family


class NormalizationProcessor(BaseProcessor):
    """Applies canonical normalization across text, units, manufacturers, and categories."""

    name = "normalization"

    def process(self, record: ProductRecord) -> Tuple[ProductRecord, ProcessingAudit]:
        modified = []

        # 1. Normalize Category
        canon_cat = normalize_category(record.category)
        if canon_cat != record.category:
            record.category = canon_cat
            modified.append("category")

        # 2. Normalize Manufacturer
        if record.manufacturer:
            canon_mfg = normalize_manufacturer(record.manufacturer)
            if canon_mfg != record.manufacturer:
                record.manufacturer = canon_mfg
                modified.append("manufacturer")

        # 3. Normalize MPN & Base Family
        if record.mpn:
            clean_mpn, base_fam = strip_packaging_suffix(record.mpn)
            if clean_mpn != record.mpn:
                record.mpn = clean_mpn
                modified.append("mpn")
            if not record.base_mpn or record.base_mpn != base_fam:
                record.base_mpn = base_fam
                modified.append("base_mpn")

        # 4. Normalize Attributes
        for code, attr in list(record.attributes.items()):
            if attr.raw_value:
                val, unit, norm_si = normalize_unit_value(attr.raw_value, code)
                if norm_si is not None and attr.normalized_si is None:
                    attr.normalized_si = norm_si
                    attr.unit = unit or attr.unit
                    modified.append(f"attribute.{code}")

        audit = ProcessingAudit(
            record_id=record.id or record.sku,
            disposition=ProcessingDisposition.ACCEPTED,
            processor_name=self.name,
            modified_fields=modified,
        )
        return record, audit
