import re
import base64
import io
from typing import Dict, Optional, Tuple, List
from pypdf import PdfReader
from ..schemas import ExtractedAttribute, ExtractDatasheetResponse, EvidenceItem, DataPackIntelligenceHint

#
# Datasheet extraction contract version.
#
# Bumped whenever the rules or the emitted evidence change meaning, so stored
# extractions can be identified and recomputed deliberately rather than silently
# re-interpreted. It is echoed in the response and recorded by the API alongside
# every analysis.
EXTRACTOR_VERSION = "datasheet-extract-v3"

#
# Page selection.
#
# Reading only the first five pages misses the common case: a 40-page datasheet
# whose "Electrical Characteristics" table sits on page 12. Reading *every* page
# is not acceptable either, so pages are selected from their content within a
# bounded scan. All three bounds are hard: a large PDF changes how much is
# scanned, never how much is processed per page or returned.
#
#   MAX_PAGES_SCANNED   pages whose text is read to decide what to analyse
#   MAX_HEAD_PAGES      leading pages always analysed (title, summary, first specs)
#   MAX_PAGES_ANALYZED  hard cap on pages handed to the extraction rules
#   MAX_PAGE_SCAN_CHARS text per page used for the selection decision
MAX_PAGES_SCANNED = 30
MAX_HEAD_PAGES = 3
MAX_PAGES_ANALYZED = 8
MAX_PAGE_SCAN_CHARS = 4000

# Evidence per attribute: several pages may state the same specification, and a
# reviewer benefits from seeing the strongest few rather than one arbitrary hit.
MAX_EVIDENCE_PER_ATTRIBUTE = 3

# Bounds on the text returned to callers (the API forwards it to the existing
# identity/category intelligence, which is lexical and needs no more).
MAX_EXTRACTED_TEXT_CHARS = 20000
MAX_EVIDENCE_SNIPPET_CHARS = 240

#
# Datasheet section vocabulary.
#
# A closed list, mirrored by the API (`specification-evidence.ts`), because the
# section decides the *role* evidence plays: a value stated in a specification
# table is primary evidence, one that only appears in prose is contextual. A page
# whose section cannot be identified is reported as `GENERAL`, never promoted.
SECTION_ELECTRICAL = "ELECTRICAL_CHARACTERISTICS"
SECTION_MAXIMUM_RATINGS = "ABSOLUTE_MAXIMUM_RATINGS"
SECTION_ORDERING = "ORDERING_INFORMATION"
SECTION_MECHANICAL = "MECHANICAL"
SECTION_GENERAL = "GENERAL"

# Heading patterns, checked in order: the first match wins, so a page titled
# "Absolute Maximum Ratings" is not classified as generic electrical data.
SECTION_PATTERNS: List[Tuple[str, str]] = [
    (SECTION_MAXIMUM_RATINGS, r"absolute\s+maximum|maximum\s+ratings|limiting\s+values"),
    (SECTION_ELECTRICAL, r"electrical\s+characteristic|electrical\s+specification|static\s+characteristic|dc\s+characteristic"),
    (SECTION_ORDERING, r"ordering\s+information|order(ing)?\s+code|part\s+number\s+information|how\s+to\s+order"),
    (SECTION_MECHANICAL, r"mechanical\s+(data|dimension|drawing)|package\s+(outline|dimension)|physical\s+dimension"),
]

# Terms that suggest a page carries specifications, used to rank pages whose
# heading the extractor did not recognise. These are *selection* hints only: they
# never create an attribute, they only decide which pages are worth reading.
SPECIFICATION_TERMS: List[str] = [
    "resistance", "capacitance", "inductance", "voltage", "current", "power",
    "tolerance", "impedance", "frequency", "temperature", "thermal", "rating",
    "characteristic", "typical", "maximum", "minimum", "nominal", "package",
    "footprint", "case", "dielectric", "esr", "esl", "q factor", "saturation",
]



class DatasheetExtractorService:
    def extract_pages_from_pdf_base64(
        self, pdf_base64: str
    ) -> Tuple[List[Tuple[int, str]], int]:
        """
        Returns `((page_number, text)…, total_page_count)`.

        Page boundaries are preserved because they are the only location a
        text-based PDF gives us; discarding them (as the first version did)
        would make page-numbered evidence impossible to produce honestly. The
        number is the page's position in the *document*, not in the selection, so
        evidence always cites the page a reviewer will find when they open the
        file.

        Which pages are read is decided from their content, within a bounded
        scan, so a specification table on page 12 of a 40-page datasheet is
        analysed without reading all 40 pages of text.
        """
        try:
            pdf_bytes = base64.b64decode(pdf_base64)
            reader = PdfReader(io.BytesIO(pdf_bytes))
            total_pages = len(reader.pages)

            scan_limit = min(total_pages, MAX_PAGES_SCANNED)
            scanned: List[str] = []
            for index in range(scan_limit):
                try:
                    extracted = reader.pages[index].extract_text()
                except Exception:
                    # A page that cannot be read is treated as empty rather than
                    # failing the whole document.
                    extracted = ""
                scanned.append(extracted or "")

            selected = self._select_pages(scanned)
            return (
                [(index + 1, scanned[index]) for index in selected],
                total_pages,
            )
        except Exception:
            return [], 0

    def _section_of(self, text: str) -> Optional[str]:
        """
        The datasheet section a page belongs to, or None when it cannot be told.

        Deterministic and closed-vocabulary: only the headings below are
        recognised, and anything else is left unidentified rather than guessed.
        """
        haystack = self._clean(text)[:MAX_PAGE_SCAN_CHARS].lower()
        for section, pattern in SECTION_PATTERNS:
            if re.search(pattern, haystack, re.IGNORECASE):
                return section
        return None

    def _sections_by_page(
        self, pages: List[Tuple[Optional[int], str]]
    ) -> Dict[Optional[int], Optional[str]]:
        """
        The section of every analysed page, with a table continuation rule.

        A specification table routinely breaks across a page boundary, leaving
        the heading on the previous page. A page with no heading of its own
        therefore inherits the section of the page immediately before it in
        document order — one step only, so a heading cannot silently apply to a
        page far below it. A page whose predecessor also had no heading stays
        unidentified rather than inheriting from further back.

        Without this, half a specification table would be classified as
        contextual evidence, which understates it.
        """
        sections: Dict[Optional[int], Optional[str]] = {}
        previous: Optional[str] = None
        for page_number, raw_page in pages:
            own = self._section_of(raw_page)
            sections[page_number] = own if own is not None else previous
            previous = own
        return sections

    def _select_pages(self, scanned: List[str]) -> List[int]:
        """
        Chooses which scanned pages to analyse, in document order.

        Leading pages are always included (a datasheet states its headline
        ratings there), then the highest-scoring remaining pages: pages carrying
        a specification heading first, then pages dense in specification terms.
        Ties break on page order, so the same document always selects the same
        pages. The result is capped, so a large PDF cannot cause more work.
        """
        if not scanned:
            return []

        selected: List[int] = list(range(min(len(scanned), MAX_HEAD_PAGES)))

        scored: List[Tuple[int, int]] = []
        for index, text in enumerate(scanned):
            if index in selected:
                continue
            sample = self._clean(text)[:MAX_PAGE_SCAN_CHARS].lower()
            if not sample.strip():
                continue
            score = 0
            if self._section_of(text) is not None:
                # A recognised specification section is the strongest signal.
                score += 100
            for term in SPECIFICATION_TERMS:
                if term in sample:
                    score += 1
            if score > 0:
                scored.append((index, score))

        # Highest score first, then earliest page: deterministic, and it keeps a
        # document's own ordering when pages are equally informative.
        scored.sort(key=lambda entry: (-entry[1], entry[0]))
        for index, _score in scored:
            if len(selected) >= MAX_PAGES_ANALYZED:
                break
            selected.append(index)

        return sorted(selected)

    def extract_text_from_pdf_base64(self, pdf_base64: str) -> str:
        pages, _ = self.extract_pages_from_pdf_base64(pdf_base64)
        return "\n".join(text for _number, text in pages)

    def _clean(self, text: str) -> str:
        """Normalizes electrical Unicode symbols so the rules can match."""
        return (
            text.replace("µ", "u")
            .replace("Ω", "ohm")
            .replace("Ω", "ohm")
            .replace("–", "-")
            .replace("—", "-")
        )
    @staticmethod
    def _numeric_or_none(raw: str) -> Optional[float]:
        """
        The amount a matched group states, or None when it is not a number.

        A rule that keeps its canonical value as a string (`1/4W`) still reports
        a source amount when the matched text is numeric; when it is not, the
        caller falls back to the canonical pair rather than being handed a
        fabricated number.
        """
        try:
            return float(raw)
        except (TypeError, ValueError):
            return None
    def _snippet(self, text: str, start: int, end: int) -> Optional[str]:
        """
        A bounded excerpt of the matched text.

        Returned verbatim from the extracted page text: the API quotes it to a
        reviewer as the source of a value, so it must never be synthesized.
        """
        if start < 0 or end <= start:
            return None
        window = max(0, start - 60)
        excerpt = text[window : end + 60]
        excerpt = re.sub(r"\s+", " ", excerpt).strip()
        if len(excerpt) > MAX_EVIDENCE_SNIPPET_CHARS:
            excerpt = excerpt[: MAX_EVIDENCE_SNIPPET_CHARS - 1] + "…"
        return excerpt or None

    def _locate(
        self, pages: List[Tuple[Optional[int], str]], pattern: str
    ) -> Optional[Tuple[Optional[int], str, re.Match]]:
        """
        Finds the first entry (in document order) whose cleaned text matches.

        Deterministic: order decides, so the same document always yields the
        same primary evidence location.
        """
        located = self._locate_all(pages, pattern)
        return located[0] if located else None

    def _locate_all(
        self,
        pages: List[Tuple[Optional[int], str]],
        pattern: str,
        limit: int = MAX_EVIDENCE_PER_ATTRIBUTE,
    ) -> List[Tuple[Optional[int], str, re.Match]]:
        """
        Every page whose text states the value, in document order, deduplicated.

        A specification usually appears more than once — the electrical table and
        the ordering guide both state the tolerance — and a reviewer judging a
        value benefits from seeing each place it is stated. The primary location
        is still the first, so the value itself never changes with this.

        Deduplicated on `(page, matched text)`, so two identical lines on one page
        are one piece of evidence rather than two. Bounded by `limit`.
        """
        found: List[Tuple[Optional[int], str, re.Match]] = []
        seen: set = set()
        for page_number, raw_page in pages:
            cleaned = self._clean(raw_page)
            match = re.search(pattern, cleaned, re.IGNORECASE)
            if not match:
                continue
            key = (page_number, match.group(0).strip().lower())
            if key in seen:
                continue
            seen.add(key)
            found.append((page_number, cleaned, match))
            if len(found) >= limit:
                break
        return found

    def _evidence(
        self,
        evidence_type: str,
        description: str,
        weight: float,
        source: str,
        location: Optional[Tuple[Optional[int], str, re.Match]] = None,
        sections: Optional[Dict[Optional[int], Optional[str]]] = None,
    ) -> EvidenceItem:
        page_number: Optional[int] = None
        snippet: Optional[str] = None
        section: Optional[str] = None
        if location is not None:
            page_number, cleaned, match = location
            snippet = self._snippet(cleaned, match.start(), match.end())
            if sections is not None:
                section = sections.get(page_number)
            else:
                section = self._section_of(cleaned)
        return EvidenceItem(
            type=evidence_type,
            description=description,
            weight=weight,
            source=source,
            page=page_number,
            text=snippet,
            section=section,
        )

    def _evidence_list(
        self,
        evidence_type: str,
        description: str,
        weight: float,
        source: str,
        locations: List[Tuple[Optional[int], str, re.Match]],
        sections: Optional[Dict[Optional[int], Optional[str]]] = None,
    ) -> List[EvidenceItem]:
        """
        Evidence items for every located page, primary first.

        A specification stated in a specification section is listed before one
        that only appears in prose, so the strongest location is what a reviewer
        reads first; within the same strength, document order decides. The order
        is stable, which is what lets the API fingerprint the evidence.
        """
        items = [
            self._evidence(
                evidence_type, description, weight, source, location, sections
            )
            for location in locations
        ]
        return sorted(items, key=self._evidence_rank)

    @staticmethod
    def _evidence_rank(item: EvidenceItem) -> int:
        """Sort key: primary specification sections first, then the rest."""
        if item.section in (SECTION_ELECTRICAL, SECTION_MAXIMUM_RATINGS):
            return 0
        return 1 if item.section is not None else 2

    def extract_attributes(
        self,
        text: str,
        datapack_hints: Optional[List[DataPackIntelligenceHint]] = None,
    ) -> Dict[str, ExtractedAttribute]:
        """Single-blob extraction for callers that only have text (no pages)."""
        pages = [(None, text)] if text else []
        return self.extract_attributes_from_pages(pages, datapack_hints)

    def extract_attributes_from_pages(
        self,
        pages: List[Tuple[Optional[int], str]],
        datapack_hints: Optional[List[DataPackIntelligenceHint]] = None,
    ) -> Dict[str, ExtractedAttribute]:
        attrs: Dict[str, ExtractedAttribute] = {}
        if not pages or not any(text for _, text in pages):
            return attrs

        # Section per analysed page, computed once: every rule needs it, and the
        # continuation rule depends on page order.
        sections = self._sections_by_page(pages)

        def record(attr: ExtractedAttribute) -> None:
            if attr.code not in attrs:
                attrs[attr.code] = attr

        # 1. Resistance (ohm, kohm, Mohm, R)
        locations = self._locate_all(
            pages, r"\b(\d+(?:\.\d+)?)\s*(kohm|mohm|ohm|k|m|r)\b"
        )
        if locations:
            _, cleaned, res_m = locations[0]
            val_str, unit_raw = res_m.groups()
            val = float(val_str)
            u = unit_raw.lower()
            # `m`/`mohm` is mega on a datasheet, not milli: the printed `M` is
            # the only thing distinguishing 10 MΩ from 10 mΩ, and the match is
            # case-insensitive.
            if u in ("k", "kohm"):
                canonical_val = val * 1000
                source_unit = "kohm"
                display = f"{val_str}kΩ"
            elif u in ("m", "mohm"):
                canonical_val = val * 1000000
                source_unit = "Mohm"
                display = f"{val_str}MΩ"
            else:
                canonical_val = val
                source_unit = "ohm"
                display = f"{val_str}Ω"

            record(
                ExtractedAttribute(
                    code="resistance",
                    value=canonical_val,
                    unit="ohm",
                    # The document's own quantity, alongside the canonical one:
                    # the ERP records `100 kΩ` as stated rather than only its
                    # ohm equivalent, which is what keeps the representation of
                    # a quantity intact through to the component attribute.
                    source_value=val,
                    source_unit=source_unit,
                    formatted=display,
                    confidence=0.95,
                    confidence_level="HIGH",
                    evidence=self._evidence_list(
                        "datasheet_param",
                        f"Extracted resistance rating {display} from term '{val_str}{unit_raw}'",
                        0.95,
                        "extractor:ee_regex",
                        locations,
                        sections,
                    ),
                )
            )

        # 2. Capacitance (pF, nF, uF, F)
        locations = self._locate_all(pages, r"\b(\d+(?:\.\d+)?)\s*(uf|nf|pf|f)\b")
        if locations:
            _, cleaned, cap_m = locations[0]
            val_str, unit_raw = cap_m.groups()
            val = float(val_str)
            u = unit_raw.lower()
            display = f"{val_str}{u}"
            record(
                ExtractedAttribute(
                    code="capacitance",
                    value=val,
                    unit=u,
                    source_value=val,
                    source_unit=u,
                    formatted=display,
                    confidence=0.95,
                    confidence_level="HIGH",
                    evidence=self._evidence_list(
                        "datasheet_param",
                        f"Extracted capacitance rating {display} from term '{val_str}{unit_raw}'",
                        0.95,
                        "extractor:ee_regex",
                        locations,
                        sections,
                    ),
                )
            )

        # 3. Inductance (nH, uH, mH, H)
        locations = self._locate_all(pages, r"\b(\d+(?:\.\d+)?)\s*(uh|mh|nh|h)\b")
        if locations:
            _, cleaned, ind_m = locations[0]
            val_str, unit_raw = ind_m.groups()
            val = float(val_str)
            u = unit_raw.lower()
            display = f"{val_str}{u}"
            record(
                ExtractedAttribute(
                    code="inductance",
                    value=val,
                    unit=u,
                    source_value=val,
                    source_unit=u,
                    formatted=display,
                    confidence=0.95,
                    confidence_level="HIGH",
                    evidence=self._evidence_list(
                        "datasheet_param",
                        f"Extracted inductance rating {display} from term '{val_str}{unit_raw}'",
                        0.95,
                        "extractor:ee_regex",
                        locations,
                        sections,
                    ),
                )
            )

        # 4. Voltage Rating (V, kV, mV)
        locations = self._locate_all(pages, r"\b(\d+(?:\.\d+)?)\s*(v|kv|mv)\b")
        if locations:
            _, cleaned, volt_m = locations[0]
            val_str, unit_raw = volt_m.groups()
            display = f"{val_str}{unit_raw.upper()}"
            record(
                ExtractedAttribute(
                    code="voltage",
                    value=float(val_str),
                    unit=unit_raw.upper(),
                    source_value=float(val_str),
                    source_unit=unit_raw.upper(),
                    formatted=display,
                    confidence=0.92,
                    confidence_level="HIGH",
                    evidence=self._evidence_list(
                        "datasheet_param",
                        f"Extracted voltage rating {display}",
                        0.92,
                        "extractor:ee_regex",
                        locations,
                        sections,
                    ),
                )
            )

        # 5. Current Rating (mA, A, uA)
        locations = self._locate_all(pages, r"\b(\d+(?:\.\d+)?)\s*(ma|a|ua)\b")
        if locations:
            _, cleaned, curr_m = locations[0]
            val_str, unit_raw = curr_m.groups()
            display = f"{val_str}{unit_raw.upper()}"
            record(
                ExtractedAttribute(
                    code="current",
                    value=float(val_str),
                    unit=unit_raw.upper(),
                    source_value=float(val_str),
                    source_unit=unit_raw.upper(),
                    formatted=display,
                    confidence=0.90,
                    confidence_level="HIGH",
                    evidence=self._evidence_list(
                        "datasheet_param",
                        f"Extracted current rating {display}",
                        0.90,
                        "extractor:ee_regex",
                        locations,
                        sections,
                    ),
                )
            )

        # 6. Power Rating (W, mW, kW)
        locations = self._locate_all(pages, r"\b(\d+(?:/\d+|\.\d+)?)\s*(w|mw|kw)\b")
        if locations:
            _, cleaned, pow_m = locations[0]
            val_str, unit_raw = pow_m.groups()
            display = f"{val_str}{unit_raw.upper()}"
            record(
                ExtractedAttribute(
                    code="power",
                    value=val_str,
                    unit=unit_raw.upper(),
                    # `value` is a string for this rule (a datasheet writes
                    # `1/4W`), so the source amount is only reported when it is a
                    # number; the caller then falls back to `value`/`unit`.
                    source_value=self._numeric_or_none(val_str),
                    source_unit=unit_raw.upper(),
                    formatted=display,
                    confidence=0.90,
                    confidence_level="HIGH",
                    evidence=self._evidence_list(
                        "datasheet_param",
                        f"Extracted power rating {display}",
                        0.90,
                        "extractor:ee_regex",
                        locations,
                        sections,
                    ),
                )
            )

        # 7. Tolerance (%)
        locations = self._locate_all(pages, r"\b(\d+(?:\.\d+)?)\s*%")
        if locations:
            _, cleaned, tol_m = locations[0]
            val_str = tol_m.group(1)
            display = f"{val_str}%"
            record(
                ExtractedAttribute(
                    code="tolerance",
                    value=float(val_str),
                    unit="%",
                    source_value=float(val_str),
                    source_unit="%",
                    formatted=display,
                    confidence=0.95,
                    confidence_level="HIGH",
                    evidence=self._evidence_list(
                        "datasheet_param",
                        f"Extracted tolerance rating {display}",
                        0.95,
                        "extractor:ee_regex",
                        locations,
                        sections,
                    ),
                )
            )

        # 8. Package / Footprint
        locations = self._locate_all(
            pages,
            r"\b(0201|0402|0603|0805|1206|1210|2010|2512|SOT-?23|SOD-?123|SOD-?323|SOD-?523|SC-?70|DIP-?8|QFN|SOIC-?8|TSSOP|BGA|SMA|SMB|SMC|DO-?41|TO-?220)\b",
        )
        if locations:
            _, cleaned, pkg_m = locations[0]
            pkg = pkg_m.group(1).upper().replace(" ", "")
            record(
                ExtractedAttribute(
                    code="package",
                    value=pkg,
                    formatted=pkg,
                    confidence=0.98,
                    confidence_level="HIGH",
                    evidence=self._evidence_list(
                        "datasheet_param",
                        f"Identified physical package footprint '{pkg}'",
                        0.98,
                        "extractor:ee_package",
                        locations,
                        sections,
                    ),
                )
            )

        # 9. Dielectric (X7R, X5R, C0G, NP0, Y5V)
        locations = self._locate_all(pages, r"\b(X7R|X5R|C0G|NP0|Y5V)\b")
        if locations:
            _, cleaned, diel_m = locations[0]
            code = diel_m.group(1).upper()
            record(
                ExtractedAttribute(
                    code="dielectric",
                    value=code,
                    formatted=code,
                    confidence=0.99,
                    confidence_level="HIGH",
                    evidence=self._evidence_list(
                        "datasheet_param",
                        f"Identified capacitor dielectric code '{code}'",
                        0.99,
                        "extractor:ee_dielectric",
                        locations,
                        sections,
                    ),
                )
            )

        # 10. Mounting Type (surface mount vs through hole vs panel mount)
        #
        # The classification is of the *spelled-out technology*, never of a
        # footprint code: a package code is a different statement, and deriving a
        # mounting type from one is the caller's job (it owns the package
        # vocabulary and the definition's own options).
        locations = self._locate_all(
            pages,
            r"\b(surface[\s-]?mount(?:ing)?|smd|smt|through[\s-]?hole|thru[\s-]?hole|tht|panel[\s-]?mount)\b",
        )
        if locations:
            _, cleaned, mount_m = locations[0]
            token = re.sub(r"[\s-]+", " ", mount_m.group(1).strip().lower())
            if token in ("smd", "smt") or token.startswith("surface"):
                mounting = "SMD"
            elif token.startswith("panel"):
                mounting = "Panel Mount"
            else:
                mounting = "Through Hole"
            record(
                ExtractedAttribute(
                    code="mounting_type",
                    value=mounting,
                    formatted=mounting,
                    confidence=0.85,
                    confidence_level="MEDIUM",
                    evidence=self._evidence_list(
                        "datasheet_param",
                        f"Stated mounting technology '{mount_m.group(1).strip()}' indicates {mounting}",
                        0.85,
                        "extractor:ee_mounting",
                        locations,
                        sections,
                    ),
                )
            )

        # 11. Termination Style
        #
        # Lead/termination form, which is what the value names: an axial or
        # radial part is a through-hole part, and the style is the more specific
        # statement. `solder tail`/`solder lug`/`screw terminal` are their own
        # styles and are matched before the generic through-hole alternatives so
        # the more specific wording wins.
        locations = self._locate_all(
            pages,
            r"\b(solder[\s-]?lug|solder[\s-]?tail|solder[\s-]?cup|screw[\s-]?(?:terminal|clamp)|axial|radial|through[\s-]?hole|thru[\s-]?hole|tht|smd|smt)\b",
        )
        if locations:
            _, cleaned, term_m = locations[0]
            token = re.sub(r"[\s-]+", " ", term_m.group(1).strip().lower())
            termination = {
                "axial": "Through Hole (Axial)",
                "radial": "Through Hole (Radial)",
                "solder lug": "Solder Lug",
                "solder tail": "Solder Lug",
                "solder cup": "Solder Lug",
                "screw terminal": "Screw Terminal",
                "screw clamp": "Screw Terminal",
            }.get(
                token,
                "SMD / SMT"
                if token in ("smd", "smt")
                else "Through Hole",
            )
            record(
                ExtractedAttribute(
                    code="termination",
                    value=termination,
                    formatted=termination,
                    confidence=0.8,
                    confidence_level="MEDIUM",
                    evidence=self._evidence_list(
                        "datasheet_param",
                        f"Stated termination '{term_m.group(1).strip()}' indicates {termination}",
                        0.8,
                        "extractor:ee_termination",
                        locations,
                        sections,
                    ),
                )
            )

        # 12. Contact Plating
        #
        # Longest spelling first, so `gold plated` is reported as such rather
        # than truncated to `gold` by the alternation.
        locations = self._locate_all(
            pages,
            r"\b(selective gold|hard gold|gold[\s-]?flash|gold[\s-]?plated|gold|tin[\s-]?plated|tin|silver[\s-]?plated|silver|nickel[\s-]?plated|nickel)\b",
        )
        if locations:
            _, cleaned, plate_m = locations[0]
            raw_token = re.sub(r"[\s-]+", " ", plate_m.group(1).strip().lower())
            metal = raw_token.replace(" plated", "").replace(" flash", "")
            if metal.startswith("selective") or metal.startswith("hard"):
                plating = "Selective Gold"
            else:
                plating = metal.capitalize()
            record(
                ExtractedAttribute(
                    code="contact_plating",
                    value=plating,
                    formatted=plating,
                    confidence=0.8,
                    confidence_level="MEDIUM",
                    evidence=self._evidence_list(
                        "datasheet_param",
                        f"Stated contact finish '{plate_m.group(1).strip()}' indicates {plating}",
                        0.8,
                        "extractor:ee_plating",
                        locations,
                        sections,
                    ),
                )
            )

        # 13. Gender
        #
        # Only unambiguous sexed terms and plug/socket nouns are read. `header`
        # is deliberately absent: it is a layout word in datasheets and would
        # match a table rather than a connector.
        locations = self._locate_all(pages, r"\b(male|female)\b")
        if not locations:
            locations = self._locate_all(
                pages, r"\b(plug|socket|receptacle|jack)\b"
            )
        if locations:
            _, cleaned, gender_m = locations[0]
            token = gender_m.group(1).strip().lower()
            gender = "Female" if token in ("female", "socket", "receptacle", "jack") else "Male"
            record(
                ExtractedAttribute(
                    code="gender",
                    value=gender,
                    formatted=gender,
                    confidence=0.8,
                    confidence_level="MEDIUM",
                    evidence=self._evidence_list(
                        "datasheet_param",
                        f"Stated connector form '{gender_m.group(1).strip()}' indicates {gender}",
                        0.8,
                        "extractor:ee_gender",
                        locations,
                        sections,
                    ),
                )
            )

        # 14. Orientation
        locations = self._locate_all(
            pages,
            r"\b(right[\s-]?angle|side[\s-]?entry|90[\s-]?degree|vertical|straight|horizontal|top[\s-]?entry)\b",
        )
        if locations:
            _, cleaned, orient_m = locations[0]
            token = re.sub(r"[\s-]+", " ", orient_m.group(1).strip().lower())
            if token in ("vertical", "straight") or token.startswith("top"):
                orientation = "Vertical"
            elif token.startswith("right") or token.startswith("side") or token.startswith("90"):
                orientation = "Right Angle"
            else:
                orientation = "Horizontal"
            record(
                ExtractedAttribute(
                    code="orientation",
                    value=orientation,
                    formatted=orientation,
                    confidence=0.78,
                    confidence_level="MEDIUM",
                    evidence=self._evidence_list(
                        "datasheet_param",
                        f"Stated orientation '{orient_m.group(1).strip()}' indicates {orientation}",
                        0.78,
                        "extractor:ee_orientation",
                        locations,
                        sections,
                    ),
                )
            )

        # 15. Pin / Conductor Count
        locations = self._locate_all(
            pages,
            r"\b(\d{1,3})[\s-]?(?:pin|position|way|circuit|contact|pole)s?\b",
        )
        # A count outside a plausible connector range is not a pin count: it is
        # a year, a temperature or a quantity of something else in the text.
        locations = [
            location
            for location in locations
            if 1 <= int(location[2].group(1)) <= 500
        ]
        if locations:
            _, cleaned, count_m = locations[0]
            count = int(count_m.group(1))
            record(
                ExtractedAttribute(
                    code="pin_count",
                    value=count,
                    formatted=f"{count}-pin",
                    confidence=0.85,
                    confidence_level="MEDIUM",
                    evidence=self._evidence_list(
                        "datasheet_param",
                        f"Stated contact count '{count_m.group(0).strip()}'",
                        0.85,
                        "extractor:ee_pin_count",
                        locations,
                        sections,
                    ),
                )
            )

        # 16. Contact Pitch
        #
        # Two word orders, because datasheets write both `2.50mm pitch` and
        # `pitch: 2.50 mm`. The unit is required: a bare number is not a pitch.
        locations = self._locate_all(
            pages,
            r"\b(\d+(?:\.\d+)?)\s*(?:mm|millimet(?:re|er)s?)\s*(?:pitch|spacing)\b",
        )
        if not locations:
            locations = self._locate_all(
                pages,
                r"\bpitch[\s:]*(\d+(?:\.\d+)?)\s*(?:mm|millimet(?:re|er)s?)\b",
            )
        if locations:
            _, cleaned, pitch_m = locations[0]
            pitch = float(pitch_m.group(1))
            record(
                ExtractedAttribute(
                    code="pitch",
                    value=pitch,
                    unit="mm",
                    source_value=pitch,
                    source_unit="mm",
                    formatted=f"{pitch_m.group(1)} mm",
                    confidence=0.88,
                    confidence_level="MEDIUM",
                    evidence=self._evidence_list(
                        "datasheet_param",
                        f"Stated contact pitch {pitch_m.group(1)} mm",
                        0.88,
                        "extractor:ee_pitch",
                        locations,
                        sections,
                    ),
                )
            )

        # 17. Check Data Pack expected attributes to boost evidence if present
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
        pages: List[Tuple[Optional[int], str]] = []
        total_pages: Optional[int] = None

        if pdf_base64:
            # Already `(document_page_number, text)`: the number survives the
            # selection, so evidence cites the page a reviewer will find.
            raw_pages, total_pages = self.extract_pages_from_pdf_base64(pdf_base64)
            pages.extend(raw_pages)
        if text:
            # Caller-supplied text is searchable but is not a located document
            # page, so it carries no page number rather than a misleading one.
            pages.append((None, text))

        pages = [(number, page) for number, page in pages if page]
        extracted_text = "\n".join(page for _, page in pages)
        preview = (
            extracted_text[:200] + "..."
            if len(extracted_text) > 200
            else extracted_text
        )

        attributes = self.extract_attributes_from_pages(pages, datapack_hints)

        return ExtractDatasheetResponse(
            attributes=attributes,
            extracted_text_preview=preview or None,
            extracted_text=(
                extracted_text[:MAX_EXTRACTED_TEXT_CHARS] if extracted_text else None
            ),
            page_count=total_pages,
            pages_analyzed=len(pages) if pages else None,
            extractor_version=EXTRACTOR_VERSION,
        )


datasheet_extractor = DatasheetExtractorService()
