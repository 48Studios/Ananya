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


def _clean_breadcrumb_path(path: str) -> str:
    """
    Cleans structural breadcrumb noise via the collector-side helper.

    The import is deliberately function-local: ``collectors/__init__`` imports
    ``web_collector``, which imports ``NormalizationProcessor`` from this module,
    so a module-level import would create a circular import whenever this module
    is imported first.
    """
    from ..collectors.web.extractor import clean_breadcrumb_path

    return clean_breadcrumb_path(path)


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
    "würth elektronik": "Würth Elektronik",
    "wuerth elektronik": "Würth Elektronik",
    "würth elektronik component catalog": "Würth Elektronik",
    "wuerth elektronik component catalog": "Würth Elektronik",
    "we-online": "Würth Elektronik",
    "wurth": "Würth Elektronik",
    "wuerth": "Würth Elektronik",
}

# Canonical Ananya Taxonomy Categories
CANONICAL_CATEGORIES: set = {
    # Electronics - Passives
    "Resistors",
    "Capacitors",
    "Inductors",
    "Transformers",
    "Passive Components",
    # Electronics - Active & Semiconductors
    "Diodes",
    "Transistors",
    "ICs & Semiconductors",
    "Optoelectronics",
    "Sensors",
    # Electrical & Electromechanical
    "Connectors",
    "Cables",
    "Switches",
    "Relays",
    "Electromechanical",
    # Mechanical & Hardware
    "Fasteners",
    "Mechanical Parts",
    "Tools",
    "Valves & Pneumatics",
    # Materials & Consumables
    "Raw Materials",
    "Consumables",
    "3D Printing Materials",
    # Systems & Prototyping
    "Development Boards",
    "Robotics",
}

# Categories that represent generic content, documents, or non-product pages
EXCLUDED_CATEGORIES: set = {
    "general",
    "uncategorized",
    "unknown",
    "other",
    "basics",
    "special categories",
    # Broad labels that must remain unresolved without stronger evidence
    "electronics",
    "power",
    "iot",
    "education",
    "sound",
    "science",
    "wireless",
    # Navigation / Web noise
    "inicio",
    "accueil",
    "startseite",
    "discontinued products",
    # Merchandise & non-product media
    "accessories",
    "merchandise",
    "badges/patches",
    "badges / patches",
    "badges",
    "patches",
    "stickers",
    "sticker",
    "clothing",
    "apparel",
    "books/magazines",
    "books / magazines",
    "books",
    "magazines",
    "gift cards",
    "gift card",
    # Documents
    "technical documentation",
    "application note",
    "application notes",
    "datasheet",
    "datasheets",
    "user manual",
    "user manuals",
    "press release",
    "press releases",
    "presse pressemeldungen",
    "pressemeldungen",
    "faq",
    "faqs",
    "blog",
    "news",
    "newscenter",
    "video center",
    "knowledge video center",
    "wissen video center",
    "wissen application notes",
    "knowledge application notes",
}

# Cross-Domain Supplier Taxonomy Mapping
GLOBAL_TAXONOMY_MAP: Dict[str, str] = {
    # Electronics - Passives
    "resistor": "Resistors",
    "resistors": "Resistors",
    "chip resistor - surface mount": "Resistors",
    "through hole resistors": "Resistors",
    "resistor networks, arrays": "Resistors",
    "smd resistor": "Resistors",
    "smd resistors": "Resistors",
    "capacitor": "Capacitors",
    "capacitors": "Capacitors",
    "ceramic capacitors": "Capacitors",
    "aluminum electrolytic capacitors": "Capacitors",
    "tantalum capacitors": "Capacitors",
    "film capacitors": "Capacitors",
    "smd capacitors": "Capacitors",
    "inductor": "Inductors",
    "inductors": "Inductors",
    "fixed inductors": "Inductors",
    "ferrite": "Inductors",
    "ferrites": "Inductors",
    "ferrite beads and chips": "Inductors",
    "choke": "Inductors",
    "chokes": "Inductors",
    "power magnetics": "Inductors",
    "transformer": "Transformers",
    "transformers": "Transformers",
    "passive components": "Passive Components",
    "passives": "Passive Components",
    # Electronics - Active & Semiconductors
    "diode": "Diodes",
    "diodes": "Diodes",
    "diodes - rectifiers - single": "Diodes",
    "diodes - zener - single": "Diodes",
    "schottky diodes": "Diodes",
    "transistor": "Transistors",
    "transistors": "Transistors",
    "transistors - fets, mosfets - single": "Transistors",
    "transistors - bipolar (bjt) - single": "Transistors",
    "mosfet": "Transistors",
    "mosfets": "Transistors",
    "microcontrollers": "ICs & Semiconductors",
    "microcontroller": "ICs & Semiconductors",
    "linear - amplifiers - op amps": "ICs & Semiconductors",
    "linear - amplifiers - audio": "ICs & Semiconductors",
    "linear - amplifiers - instrumentation, op amps": "ICs & Semiconductors",
    "pmic - voltage regulators - linear": "ICs & Semiconductors",
    "pmic - voltage regulators - dc dc switching": "ICs & Semiconductors",
    "ics & semiconductors": "ICs & Semiconductors",
    "semiconductors": "ICs & Semiconductors",
    "integrated circuits": "ICs & Semiconductors",
    "led indication - discrete": "Optoelectronics",
    "optoisolators": "Optoelectronics",
    "optoisolators - transistor, photovoltaic output": "Optoelectronics",
    "optoelectronics": "Optoelectronics",
    "leds": "Optoelectronics",
    "sensor": "Sensors",
    "sensors": "Sensors",
    # Electrical & Electromechanical
    "connectors coax": "Connectors",
    "coaxial connectors": "Connectors",
    "rectangular connectors - headers, male pins": "Connectors",
    "usb connectors": "Connectors",
    "modular connectors - jacks": "Connectors",
    "connector": "Connectors",
    "connectors": "Connectors",
    "flat ribbon cables": "Cables",
    "modular cables": "Cables",
    "hook up wire": "Cables",
    "cable": "Cables",
    "cables": "Cables",
    "wire": "Cables",
    "tactile switches": "Switches",
    "dip switches": "Switches",
    "switch": "Switches",
    "switches": "Switches",
    "relay": "Relays",
    "relays": "Relays",
    "electromechanical components": "Electromechanical",
    "electromechanical": "Electromechanical",
    # Mechanical & Fasteners
    "screws, bolts": "Fasteners",
    "machine screws": "Fasteners",
    "socket head cap screws": "Fasteners",
    "nuts, locknuts": "Fasteners",
    "washers": "Fasteners",
    "screw": "Fasteners",
    "screws": "Fasteners",
    "bolt": "Fasteners",
    "bolts": "Fasteners",
    "nuts": "Fasteners",
    "fastener": "Fasteners",
    "fasteners": "Fasteners",
    "standoffs, spacers": "Mechanical Parts",
    "heat sinks": "Mechanical Parts",
    "ball bearings": "Mechanical Parts",
    "linear guide rails": "Mechanical Parts",
    "timing belts, pulleys": "Mechanical Parts",
    "3d printer nozzles": "Mechanical Parts",
    "replacement part": "Mechanical Parts",
    "replacement parts": "Mechanical Parts",
    "bearings": "Mechanical Parts",
    "gears": "Mechanical Parts",
    "mechanical parts": "Mechanical Parts",
    # Tools & Hardware
    "hand tools - screwdrivers": "Tools",
    "pliers, cutters": "Tools",
    "pliers": "Tools",
    "plier": "Tools",
    "crimpers, crimp tools": "Tools",
    "soldering irons, stations": "Tools",
    "soldering irons": "Tools",
    "soldering iron": "Tools",
    "soldering stations": "Tools",
    "soldering station": "Tools",
    "multimeters, test probes": "Tools",
    "hand tools": "Tools",
    "tools": "Tools",
    "tool": "Tools",
    "bit": "Tools",
    "bits": "Tools",
    "screwdriver": "Tools",
    "screwdrivers": "Tools",
    "multi-bit driver": "Tools",
    "hammer": "Tools",
    "hammers": "Tools",
    "mallet face": "Tools",
    "nut driver": "Tools",
    "nut setter": "Tools",
    "blade": "Tools",
    "blades": "Tools",
    "l-key": "Tools",
    "l-keys": "Tools",
    "sockets": "Tools",
    "tool storage": "Tools",
    # Valves & Pneumatics
    "valves & pneumatics": "Valves & Pneumatics",
    "valve": "Valves & Pneumatics",
    "valves": "Valves & Pneumatics",
    "2 way valves": "Valves & Pneumatics",
    "pneumatics": "Valves & Pneumatics",
    # Raw Materials
    "copper clad laminates": "Raw Materials",
    "copper clad boards": "Raw Materials",
    "aluminum sheets, plates": "Raw Materials",
    "stainless steel rods": "Raw Materials",
    "acrylic sheets": "Raw Materials",
    "raw materials": "Raw Materials",
    "metals": "Raw Materials",
    "plastics": "Raw Materials",
    # Consumables
    "solder, desoldering braid, flux": "Consumables",
    "solder paste": "Consumables",
    "heat shrink tubing": "Consumables",
    "thermal grease, paste": "Consumables",
    "epoxy adhesives": "Consumables",
    "solder wire": "Consumables",
    "soldering flux": "Consumables",
    "thermal paste": "Consumables",
    "dielectric grease": "Consumables",
    "lubricating grease": "Consumables",
    "silicone adhesive": "Consumables",
    "adhesives": "Consumables",
    "bonding adhesives": "Consumables",
    "flux": "Consumables",
    "consumables": "Consumables",
    # 3D Printing
    "3d printer filament - pla": "3D Printing Materials",
    "3d printer filament - petg": "3D Printing Materials",
    "3d printer resin": "3D Printing Materials",
    "3d printing materials": "3D Printing Materials",
    "3d printing": "3D Printing Materials",
    "filament": "3D Printing Materials",
    "filaments": "3D Printing Materials",
    "pla filament": "3D Printing Materials",
    "petg filament": "3D Printing Materials",
    "abs filaments": "3D Printing Materials",
    "polylite": "3D Printing Materials",
    "polyflex": "3D Printing Materials",
    "polymax": "3D Printing Materials",
    "polymide": "3D Printing Materials",
    "panchroma": "3D Printing Materials",
    "fiberon": "3D Printing Materials",
    "polysonic": "3D Printing Materials",
    "polydissolve": "3D Printing Materials",
    "polysmooth": "3D Printing Materials",
    "polysupport": "3D Printing Materials",
    "polycast": "3D Printing Materials",
    "wood pla": "3D Printing Materials",
    "silk pla": "3D Printing Materials",
    "matte pla": "3D Printing Materials",
    "pla pro": "3D Printing Materials",
    # Prototyping & Robotics
    "development boards": "Development Boards",
    "development board": "Development Boards",
    "breakout board": "Development Boards",
    "breakout boards": "Development Boards",
    "arduino boards": "Development Boards",
    "arduino board": "Development Boards",
    "arduino accessories": "Development Boards",
    "arduino accessory": "Development Boards",
    "arduino shields": "Development Boards",
    "arduino shield": "Development Boards",
    "breakout pcb": "Development Boards",
    "breakout pcbs": "Development Boards",
    "prototyping boards": "Development Boards",
    "prototyping board": "Development Boards",
    "devkits": "Development Boards",
    "devkit": "Development Boards",
    "single-board computers": "Development Boards",
    "single-board computer": "Development Boards",
    "single board computers": "Development Boards",
    "single board computer": "Development Boards",
    "robotics": "Robotics",
    "stepper": "Robotics",
    "stepper motors": "Robotics",
    "stepper motor": "Robotics",
    "motors": "Robotics",
    "motor": "Robotics",
    "chassis": "Robotics",
    # Switches
    "buttons": "Switches",
    "button": "Switches",
    # Connectors & Cables
    "headers": "Connectors",
    "header": "Connectors",
    "sockets/connectors": "Connectors",
    "sockets / connectors": "Connectors",
    "socket/connector": "Connectors",
    "terminal blocks": "Connectors",
    "terminal block": "Connectors",
    "ribbon cable": "Cables",
    "ribbon cables": "Cables",
    "jumper wires": "Cables",
    "jumper wire": "Cables",
    "audio cables": "Cables",
    "audio cable": "Cables",
    # ICs & Semiconductors
    "ic & transistors": "ICs & Semiconductors",
    "ics & transistors": "ICs & Semiconductors",
    "smd ics": "ICs & Semiconductors",
    "smd ic": "ICs & Semiconductors",
    # Optoelectronics
    "lcds & displays": "Optoelectronics",
    "lcd & displays": "Optoelectronics",
    "lcds and displays": "Optoelectronics",
    "graphic lcds": "Optoelectronics",
    "graphic lcd": "Optoelectronics",
    "character lcds": "Optoelectronics",
    "character lcd": "Optoelectronics",
    "color tft displays": "Optoelectronics",
    "color tft display": "Optoelectronics",
    "tft displays": "Optoelectronics",
    "tft display": "Optoelectronics",
    "oleds": "Optoelectronics",
    "oled": "Optoelectronics",
    "e-ink / e-paper": "Optoelectronics",
    "e-ink": "Optoelectronics",
    "e-paper": "Optoelectronics",
    "segment": "Optoelectronics",
    "segmented": "Optoelectronics",
    "monocrome lcds": "Optoelectronics",
    "monochrome lcds": "Optoelectronics",
    "monocrome lcd": "Optoelectronics",
    "monochrome lcd": "Optoelectronics",
    # Sensors
    "touch": "Sensors",
    "imaging": "Sensors",
    "force": "Sensors",
    "optical": "Sensors",
    "proximity": "Sensors",
    "temperature": "Sensors",
    "current / power": "Sensors",
    "current/power": "Sensors",
    "distance": "Sensors",
    "flex": "Sensors",
    "bio-sensing": "Sensors",
    "biometric": "Sensors",
    "motion/inertial": "Sensors",
    "motion / inertial": "Sensors",
    "accelerometers": "Sensors",
    "accelerometer": "Sensors",
    # Tools
    "cnc accessories": "Tools",
    "cnc accessory": "Tools",
    "other cnc tools": "Tools",
    "cutters/pliers": "Tools",
    "cutters / pliers": "Tools",
    "wire strippers/cutters": "Tools",
    "wire strippers / cutters": "Tools",
    "tweezers": "Tools",
    "tweezer": "Tools",
    "soldering accessories": "Tools",
    "soldering accessory": "Tools",
    "desoldering": "Tools",
    "measuring & testing": "Tools",
    "hex keys / l-keys": "Tools",
    "hex keys": "Tools",
    "hex key": "Tools",
    "t-handle": "Tools",
    "t-handles": "Tools",
    # Consumables
    "potting compounds": "Consumables",
    "potting compound": "Consumables",
    "epoxy potting compounds": "Consumables",
    "rtv silicone potting compounds": "Consumables",
    "urethane potting compounds": "Consumables",
    "conformal coatings": "Consumables",
    "conformal coating": "Consumables",
    "conformal coating strippers": "Consumables",
    "solder & flux": "Consumables",
    # Mechanical Parts (E3D)
    "hotends": "Mechanical Parts",
    "hotend": "Mechanical Parts",
    "nozzles": "Mechanical Parts",
    "nozzle": "Mechanical Parts",
    "heatbreaks": "Mechanical Parts",
    "heatbreak": "Mechanical Parts",
    "extruders": "Mechanical Parts",
    "extruder": "Mechanical Parts",
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


def normalize_category(category: Optional[str]) -> str:
    """
    Maps vendor category or breadcrumb string to canonical Ananya taxonomy category.
    Returns 'Uncategorized' if the category is empty, generic, a document/content type,
    or does not resolve to the canonical taxonomy.
    """
    if not category:
        return "Uncategorized"
    cleaned = _clean_breadcrumb_path(normalize_text(category).strip())
    if not cleaned:
        return "Uncategorized"
    lower = cleaned.lower()
    if lower in EXCLUDED_CATEGORIES:
        return "Uncategorized"

    # 1. Exact match with canonical categories (case-insensitive)
    for canon in CANONICAL_CATEGORIES:
        if lower == canon.lower():
            return canon

    # 2. Match in taxonomy map
    if lower in GLOBAL_TAXONOMY_MAP:
        return GLOBAL_TAXONOMY_MAP[lower]

    # 3. Breadcrumb resolution (e.g. "Components > Passives > Resistors")
    if any(d in cleaned for d in (">", "|")):
        sep = ">" if ">" in cleaned else "|"
        parts = [p.strip() for p in cleaned.split(sep) if p.strip()]
        all_parts_excluded = True
        for part in reversed(parts):
            p_clean = normalize_text(part).lower()
            if p_clean in EXCLUDED_CATEGORIES:
                continue
            all_parts_excluded = False
            for canon in CANONICAL_CATEGORIES:
                if p_clean == canon.lower():
                    return canon
            if p_clean in GLOBAL_TAXONOMY_MAP:
                return GLOBAL_TAXONOMY_MAP[p_clean]
        if all_parts_excluded:
            return "Uncategorized"

    # 4. Partial/keyword lookup in GLOBAL_TAXONOMY_MAP
    for key, canon in GLOBAL_TAXONOMY_MAP.items():
        if len(key) >= 4 and (f" {key} " in f" {lower} " or lower.endswith(f" {key}") or lower.startswith(f"{key} ")):
            return canon

    return "Uncategorized"


# Signal classification patterns
_MERCHANDISE_PATTERN = re.compile(
    r"\b(?:t-shirt|shirt|shirts|hoodie|hoodies|plushie|plushies|plush|(?:(?<!cushion\s)cushion(?!(\s*grip)))|"
    r"mug|mugs|coaster|coasters|keychain|keychains|sticker|stickers|poster|posters|"
    r"badge|badges|patch|patches|tote bag|(?<!pi\s)(?<!raspberry\s)hats?|beanie|beanies|socks|backpack|backpacks)\b",
    re.IGNORECASE,
)

_TOOL_PATTERN = re.compile(
    r"\b(?:screwdriver|screwdrivers|multi-bit driver|nut driver|nut drivers|screw starter|"
    r"wrench|wrenches|plier|pliers|hex key|hex keys|allen key|allen keys|(?:hex\s+)?l-key(?:s)?|"
    r"crimper|crimpers|crimping tool|wire stripper|strippers|"
    r"soldering iron|soldering station|desoldering pump|multimeter|multimeters|"
    r"tweezer|tweezers|ratchet|ratchets|scraper|scrapers|hammer|hammers|saw|saws|drill bit|drill bits)\b",
    re.IGNORECASE,
)

_DEV_BOARD_PATTERN = re.compile(
    r"\b(?:arduino|feather\s+m[0-9]|feather\s+rp[0-9]|teensy|raspberry\s+pi\s+[0-9]|"
    r"raspberry\s+pi\s+zero|single-board\s+computer|sbc|eval\s+kit|evaluation\s+board|"
    r"evaluation\s+kit|devkit|dev\s+board|development\s+board|nucleo|discovery\s+kit|"
    r"launchpad|micro:bit|pyportal|pygamer|circuit\s+playground)\b",
    re.IGNORECASE,
)

_RELAY_PATTERN = re.compile(
    r"\b(?:solid\s+state\s+relay(?:s)?|ssr|electromechanical\s+relay(?:s)?|"
    r"latching\s+relay(?:s)?|non-latching\s+relay(?:s)?|reed\s+relay(?:s)?|"
    r"power\s+relay(?:s)?|relay\s+module|relay\s+featherwing|relay\s+board|"
    r"relay\s+shield|relay\s+control\s+kit|photorelay|mosfet\s+relay)\b"
    r"|\brelay(?:s)?\b",
    re.IGNORECASE,
)
_NON_RELAY_GUARDS = re.compile(
    r"\b(?:relay\s+race|tor\s+relay|mail\s+relay|smtp\s+relay|relay\s+server|relay\s+node)\b",
    re.IGNORECASE,
)

_TRANSISTOR_PATTERN = re.compile(
    r"\b(?:(?:n-channel|p-channel|power|sic|rf|logic-level)\s+)?mosfet(?:s)?\b"
    r"|\b(?:bjt|igbt|jfet)\b"
    r"|\b(?:bipolar|junction|npn|pnp|darlington|power)\s+transistor(?:s)?\b"
    r"|\btransistor(?:s)?\b",
    re.IGNORECASE,
)

_IC_PATTERN = re.compile(
    r"\b(?:multicore\s+microcontroller|microcontroller(?:s)?|microprocessor(?:s)?|\bmcu\b|\bmpu\b|"
    r"operational\s+amplifier(?:s)?|op-?amp(?:s)?|instrumentation\s+amplifier(?:s)?|"
    r"voltage\s+regulator(?:s)?|linear\s+regulator(?:s)?|switching\s+regulator(?:s)?|"
    r"buck\s+converter(?:s)?|boost\s+converter(?:s)?|buck-boost\s+converter(?:s)?|pmic|"
    r"eeprom|flash\s+memory|sram|fram|\bfpga\b|\bcpld\b|"
    r"analog-to-digital\s+converter|digital-to-analog\s+converter|"
    r"(?:audio\s+|stereo\s+|quad\s+|12-bit\s+|16-bit\s+|24-bit\s+|8-bit\s+|10-bit\s+)?(?:dac|adc)\b|"
    r"logic\s+ic|transceiver|gate\s+driver|motor\s+driver\s+ic|integrated\s+circuit(?:s)?)\b",
    re.IGNORECASE,
)

_SENSOR_PATTERN = re.compile(
    r"\b(?:accelerometer|gyroscope|magnetometer|barometer|altimeter|hygrometer|"
    r"thermocouple|phototransistor|photodiode|ambient light sensor|gas sensor|"
    r"proximity sensor|distance sensor|current sensor|temperature sensor|imu sensor|"
    r"humidity sensor|pressure sensor|touch sensor|color sensor|optical sensor|"
    r"co2 sensor|air quality sensor|soil sensor|flow sensor)\b"
    r"|\b(?:sensor|sensors)\b",
    re.IGNORECASE,
)

_FASTENER_PATTERN = re.compile(
    r"\b(?:machine\s+screw(?:s)?|socket\s+head\s+cap\s+screw(?:s)?|hex\s+head\s+cap\s+screw(?:s)?|"
    r"pan\s+head\s+screw(?:s)?|flat\s+head\s+screw(?:s)?|set\s+screw(?:s)?|thumb\s+screw(?:s)?|"
    r"hex\s+standoff(?:s)?|standoff(?:s)?|hex\s+spacer(?:s)?|spacer(?:s)?|"
    r"hex\s+nut(?:s)?|lock\s+nut(?:s)?|nylon\s+lock\s+nut(?:s)?|wing\s+nut(?:s)?|trapezoid\s+nut(?:s)?|"
    r"flat\s+washer(?:s)?|spring\s+washer(?:s)?|lock\s+washer(?:s)?|washer(?:s)?|"
    r"carriage\s+bolt(?:s)?|hex\s+bolt(?:s)?|u-bolt(?:s)?|bolt(?:s)?|"
    r"threaded\s+rod(?:s)?|fastener(?:s)?|screw\s+set|screw\s+replacement)\b"
    r"|\b(?:screw|screws)\b",
    re.IGNORECASE,
)
_FASTENER_NEGATIVE_GUARDS = re.compile(
    r"\b(?:bolt-on|screw-attached|screw\s+terminal|screw\s+terminals|shield|cover)\b",
    re.IGNORECASE,
)

_RESISTOR_PATTERN = re.compile(
    r"\b(?:smd\s+resistor(?:s)?|chip\s+resistor(?:s)?|through-hole\s+resistor(?:s)?|"
    r"carbon\s+film\s+resistor(?:s)?|metal\s+film\s+resistor(?:s)?|resistor\s+network(?:s)?|"
    r"resistor(?:s)?|potentiometer(?:s)?|trimpot(?:s)?)\b",
    re.IGNORECASE,
)

_CAPACITOR_PATTERN = re.compile(
    r"\b(?:ceramic\s+capacitor(?:s)?|electrolytic\s+capacitor(?:s)?|tantalum\s+capacitor(?:s)?|"
    r"film\s+capacitor(?:s)?|supercapacitor(?:s)?|mlcc|capacitor(?:s)?)\b",
    re.IGNORECASE,
)

_CABLE_PATTERN = re.compile(
    r"\b(?:ribbon\s+cable(?:s)?|jumper\s+wire(?:s)?|coaxial\s+cable(?:s)?|hook-up\s+wire(?:s)?|"
    r"usb\s+cable(?:s)?|ethernet\s+cable(?:s)?|hdmi\s+cable(?:s)?|power\s+cable(?:s)?|"
    r"cable\s+harness(?:es)?|wire\s+harness(?:es)?|cable(?:s)?|jumper\s+wires)\b",
    re.IGNORECASE,
)


def classify_product_signals(
    name: str,
    desc: str = "",
    attrs: Optional[Dict[str, Any]] = None,
) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Deterministic product-signal classifier based on product name and attributes.
    Returns (canonical_category, matched_signal, confidence) or (None, None, None).
    Confidence is 'HIGH', 'MEDIUM', or 'LOW'.
    """
    if not name:
        return None, None, None

    text = normalize_text(name).strip()

    # 1. Tools guard: Tools must NEVER be classified as Fasteners
    m_tool = _TOOL_PATTERN.search(text)
    if m_tool:
        return "Tools", m_tool.group(0), "HIGH"

    if _MERCHANDISE_PATTERN.search(text):
        return None, None, None

    # 2. Relays (checked before general transistors/ICs so relay modules don't get misrouted)
    m_relay = _RELAY_PATTERN.search(text)
    if m_relay and not _NON_RELAY_GUARDS.search(text):
        return "Relays", m_relay.group(0), "HIGH"

    # 3. Transistors
    m_trans = _TRANSISTOR_PATTERN.search(text)
    if m_trans:
        return "Transistors", m_trans.group(0), "HIGH"

    # 4. Development boards guard (guard dev boards before general ICs)
    m_dev = _DEV_BOARD_PATTERN.search(text)
    if m_dev:
        return "Development Boards", m_dev.group(0), "HIGH"

    # 5. Sensors
    m_sens = _SENSOR_PATTERN.search(text)
    if m_sens:
        return "Sensors", m_sens.group(0), "HIGH"

    # 6. ICs & Semiconductors
    m_ic = _IC_PATTERN.search(text)
    if m_ic:
        return "ICs & Semiconductors", m_ic.group(0), "HIGH"

    # 7. Cables (check before fasteners so 'power cable (screw-attached)' is Cables)
    m_cable = _CABLE_PATTERN.search(text)
    if m_cable:
        return "Cables", m_cable.group(0), "HIGH"

    # 8. Fasteners
    m_fast = _FASTENER_PATTERN.search(text)
    if m_fast and not _FASTENER_NEGATIVE_GUARDS.search(text):
        return "Fasteners", m_fast.group(0), "HIGH"

    # 9. Resistors
    m_res = _RESISTOR_PATTERN.search(text)
    if m_res:
        return "Resistors", m_res.group(0), "HIGH"

    # 10. Capacitors
    m_cap = _CAPACITOR_PATTERN.search(text)
    if m_cap and "capacitor load" not in text.lower():
        return "Capacitors", m_cap.group(0), "HIGH"

    return None, None, None


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

    def _resolve_source_specific_cases(self, record: ProductRecord) -> str:
        """Resolves known high-confidence source cases where evidence is present on the record."""
        mfg = (record.manufacturer or "").lower()
        prov_src = (record.provenance.source or "").lower() if record.provenance else ""
        # Polymaker clearly identifiable filament products
        if "polymaker" in mfg or "polymaker" in prov_src:
            name_str = record.name or ""
            desc_str = record.description or ""
            raw_str = record.raw_category or ""
            evidence = f"{name_str} {raw_str} {desc_str}".lower()
            non_fil = ("gift card", "polybox", "polydryer", "merchandise", "apparel", "clothing")
            if not any(nf in evidence for nf in non_fil):
                indicators = (
                    "filament", "pla", "abs", "petg", "tpu", "pva", "asa", "copa", "cope",
                    "nylon", "polycast", "polysmooth", "polysupport", "polysonic",
                    "polylite", "polyflex", "polymax", "polymide", "panchroma", "fiberon",
                )
                if any(ind in evidence for ind in indicators):
                    return "3D Printing Materials"
        return "Uncategorized"

    def process(self, record: ProductRecord) -> Tuple[ProductRecord, ProcessingAudit]:
        modified = []

        # 1. Preserve raw category & normalize category
        if not record.raw_category and record.category:
            record.raw_category = record.category

        # Category resolution hierarchy:
        canon_cat = normalize_category(record.category)
        cat_src = "taxonomy" if canon_cat in CANONICAL_CATEGORIES else None
        cat_sig = record.category if canon_cat in CANONICAL_CATEGORIES else None
        cat_conf = "HIGH" if canon_cat in CANONICAL_CATEGORIES else None

        if canon_cat not in CANONICAL_CATEGORIES:
            canon_cat = "Uncategorized"

        if canon_cat == "Uncategorized" and record.raw_category:
            fallback_cat = normalize_category(record.raw_category)
            if fallback_cat in CANONICAL_CATEGORIES:
                canon_cat = fallback_cat
                cat_src = "taxonomy"
                cat_sig = record.raw_category
                cat_conf = "HIGH"

        if canon_cat == "Uncategorized":
            source_specific = self._resolve_source_specific_cases(record)
            if source_specific in CANONICAL_CATEGORIES:
                canon_cat = source_specific
                cat_src = "source_specific"
                cat_sig = "polymaker_filament"
                cat_conf = "HIGH"

        if canon_cat == "Uncategorized":
            sig_cat, sig_val, sig_conf = classify_product_signals(
                record.name,
                record.description or "",
                record.attributes,
            )
            if sig_cat in CANONICAL_CATEGORIES and sig_conf in ("HIGH", "MEDIUM"):
                canon_cat = sig_cat
                cat_src = "product_signal"
                cat_sig = sig_val
                cat_conf = sig_conf

        if canon_cat == "Uncategorized" and record.collection_target_category:
            if record.collection_target_category in CANONICAL_CATEGORIES:
                canon_cat = record.collection_target_category
                cat_src = "collection_target"
                cat_sig = record.collection_target_category
                cat_conf = "MEDIUM"

        if canon_cat != record.category:
            record.category = canon_cat
            modified.append("category")

        if cat_src and getattr(record, "category_source", None) != cat_src:
            record.category_source = cat_src
            record.category_signal = cat_sig
            record.category_confidence = cat_conf
            modified.append("category_source")

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
