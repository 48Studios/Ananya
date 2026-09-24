"""
Autonomous Content Extractor (HTML & PDF).

Extracts structured product records across broad ERP domains:
- HTML: Title, meta description, JSON-LD Schema.org Product, OpenGraph, breadcrumbs, spec tables, DL/DT/DD lists
- PDF: Document metadata, page text, identifier matches, technical specifications
"""

import io
import re
import json
import html
from pathlib import Path
from urllib.parse import urlparse
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone
import pypdf

from ...schemas.product import (
    ProductRecord,
    ProductDomain,
    EntityType,
    DocumentType,
    ProvenanceRecord,
    AttributeValueRecord,
    DocumentRefRecord,
    VerificationStatus,
)
from ..ananya_db import infer_domain
from .registry import SourceConfig


NON_PRODUCT_URL_PATTERNS = [
    r"/login(?:/|\.html?|\?|$)",
    r"/logout(?:/|\.html?|\?|$)",
    r"/signin(?:/|\.html?|\?|$)",
    r"/signout(?:/|\.html?|\?|$)",
    r"/register(?:/|\.html?|\?|$)",
    r"/signup(?:/|\.html?|\?|$)",
    r"/user-profile(?:/|\.html?|\?|$)",
    r"/dashboard(?:/|\.html?|\?|$)",
    r"/my-account(?:/|\.html?|\?|$)",
    r"/service/(?:contact|imprint|data-privacy)",
    r"/(?:contact|contact-us)(?:/|\.html?|\?|$)",
    r"/(?:about|about-us|company)(?:/|\.html?|\?|$)",
    r"/(?:careers|jobs|karriere|stellenangebote)(?:/|\.html?|\?|$)",
    r"/(?:faqs?|frequently[-_]asked[-_]questions)(?:/|\.html?|\?|$)",
    r"/faqs[-_]",
    r"/(?:events?|webinars?|seminars?|messen)(?:/|\.html?|\?|$)",
    r"/(?:privacy|privacy-policy|data-privacy)(?:/|\.html?|\?|$)",
    r"/(?:terms|terms-of-use|terms-of-service|terms-and-conditions|imprint|impressum|legal|disclaimer|copyright)(?:/|\.html?|\?|$)",
    r"/(?:cookie|cookies|cookie-settings)(?:/|\.html?|\?|$)",
    r"/(?:cart|checkout|basket|wishlist)(?:/|\.html?|\?|$)",
    r"/system/search",
    r"/news-center/(?:blog|press)",
    r"/newscenter(?:/|\.html?|\?|$)",
    r"/wissen(?:/|\.html?|\?|$)",
    r"/knowledge(?:/|\.html?|\?|$)",
    r"/pressemeldungen(?:/|\.html?|\?|$)",
    r"/presse(?:/|\.html?|\?|$)",
    r"/technical-articles(?:/|\.html?|\?|$)",
    r"/r-and-d(?:/|\.html?|\?|$)",
    r"/support(?:/|\.html?|\?|$)",
    r"/video-center(?:/|\.html?|\?|$)",
    r"/application-notes(?:/|\.html?|\?|$)",
    r"/appnotes(?:/|\.html?|\?|$)",
    r"/press(?:/|\.html?|\?|$)",
    r"/news(?:/|\.html?|\?|$)",
    r"/article(?:s)?/",
    r"/media[-_]overview",
    r"/categories(?:/|$)",
    r"certification\.oshwa\.org/(?:requirements|mark-usage|license-agreement|process|basics|about|directory|list|privacy-policy)",
]

NON_PRODUCT_TITLE_PATTERNS = [
    r"^(?:login|log in|sign in|sign on|logout|log out)\b",
    r"^(?:service contact|contact us|contact|contact & support)\b",
    r"^(?:service imprint|imprint|impressum)\b",
    r"^(?:service data privacy|data privacy|privacy policy|cookie settings|cookie policy)\b",
    r"^(?:user profile|dashboard|my account)\b",
    r"^(?:terms (?:and|&) conditions|terms of (?:service|use)|legal notice)\b",
    r"^(?:shopping cart|cart|checkout)\b",
    r"^(?:press release|press releases|news center|media overview)\b",
    r"^(?:about us|about the company)\b",
    r"^(?:faq|faqs|frequently asked questions)\b",
    r"^(?:webinars?|seminars?|events?)\b",
    r"^(?:careers?|karriere|jobs?)\b",
    r"^(?:this browser is not supported)\b",
]

NON_PRODUCT_PDF_PATTERNS = [
    r"(?:rohs|reach|flyer|brochure|guideline|richtlinie|grundlagen|certificate|zertifikat|conformity|konformitaet|declaration|erklaerung|allgemeine[-_]geschaeftsbedingungen)",
]


def _flatten_json_ld(data: Any) -> List[Dict[str, Any]]:
    """Recursively flattens JSON-LD payloads including @graph collections."""
    items: List[Dict[str, Any]] = []
    if isinstance(data, list):
        for sub in data:
            items.extend(_flatten_json_ld(sub))
    elif isinstance(data, dict):
        if "@graph" in data and isinstance(data["@graph"], list):
            for sub in data["@graph"]:
                items.extend(_flatten_json_ld(sub))
        items.append(data)
    return items


def clean_breadcrumb_path(path: Optional[str]) -> str:
    """
    Cleans structural breadcrumb noise:
    - Strips trailing/leading '/' or '>' components
    - Collapses repeated '>' delimiters
    - Strips empty components and whitespace
    - Preserves legitimate category text (e.g. 'Radiation / Geiger', 'Cutters/Pliers')
    """
    if not path:
        return ""
    raw_segments = path.split(">")
    cleaned_segments = []
    for seg in raw_segments:
        s = seg.strip()
        if not s or s in ("/", "\\", "|", "-"):
            continue
        s = s.strip("/").strip()
        if s:
            cleaned_segments.append(s)
    return " > ".join(cleaned_segments)


def extract_breadcrumbs_from_json_ld(items: List[Dict[str, Any]], product_name: Optional[str] = None) -> List[str]:
    """Extracts hierarchical category names from Schema.org BreadcrumbList in JSON-LD."""
    noise = {
        "home", "start", "index", "en", "de", "fr", "es", "it", "zh", "ja",
        "shop", "products", "components", "all", "inicio", "accueil", "startseite",
    }
    for item in items:
        if not isinstance(item, dict):
            continue
        item_type = str(item.get("@type", ""))
        if "BreadcrumbList" in item_type:
            raw_elements = item.get("itemListElement", [])
            if isinstance(raw_elements, list):
                try:
                    sorted_elems = sorted(
                        [e for e in raw_elements if isinstance(e, dict)],
                        key=lambda x: int(x.get("position", 0)),
                    )
                except Exception:
                    sorted_elems = [e for e in raw_elements if isinstance(e, dict)]

                trail = []
                for elem in sorted_elems:
                    name = None
                    if "name" in elem and isinstance(elem["name"], str):
                        name = elem["name"].strip()
                    elif "item" in elem:
                        it = elem["item"]
                        if isinstance(it, dict) and "name" in it:
                            name = str(it["name"]).strip()
                        elif isinstance(it, str) and not it.startswith(("http://", "https://")):
                            name = it.strip()
                    if name:
                        name_clean = html.unescape(name).strip()
                        if name_clean in ("/", "\\", "|", ">", "-", "»", "›"):
                            continue
                        name_clean = name_clean.strip("/").strip()
                        if name_clean and name_clean.lower() not in noise:
                            trail.append(name_clean)

                if trail:
                    if product_name and trail and (trail[-1].lower() in product_name.lower() or product_name.lower() in trail[-1].lower()):
                        trail = trail[:-1]
                    while trail and (trail[-1] in ("/", "\\", "|", ">", "-") or not trail[-1].strip("/").strip()):
                        trail.pop()
                    if trail:
                        return trail
    return []


def extract_breadcrumbs_from_html(html_content: str, product_name: Optional[str] = None) -> List[str]:
    """Extracts breadcrumb segments from semantic HTML navigation elements."""
    noise = {
        "home", "start", "index", "en", "de", "fr", "es", "it", "zh", "ja",
        "shop", "products", "components", "bauelemente", "katalog", "catalog",
        "all products", "all", "overview", "inicio", "accueil", "startseite",
    }
    items: List[str] = []

    # 1. Microdata / Schema.org itemprop="itemListElement"
    items = re.findall(
        r'<li[^>]*?itemprop=["\']itemListElement["\'][^>]*?>.*?<span[^>]*?itemprop=["\']name["\'][^>]*?>(.*?)</span>',
        html_content,
        re.IGNORECASE | re.DOTALL,
    )

    # 2. Semantic breadcrumb container
    if not items:
        bc_containers = re.findall(
            r'<(?:nav|div|ul|ol)[^>]*?(?:aria-label=["\']breadcrumb["\']|class=["\'][^"\']*\bbreadcrumb[^"\']*["\'])[^>]*>(.*?)</(?:nav|div|ul|ol)>',
            html_content,
            re.IGNORECASE | re.DOTALL,
        )
        if bc_containers:
            links = re.findall(r'<(?:a|span)[^>]*?>(.*?)</(?:a|span)>', bc_containers[0], re.DOTALL | re.IGNORECASE)
            items = links

    # 3. Simple <nav class="breadcrumb"><a>
    if not items:
        items = re.findall(r'<nav[^>]*?breadcrumb[^>]*?>.*?<a[^>]*?>(.*?)</a>', html_content, re.IGNORECASE | re.DOTALL)

    trail: List[str] = []
    for it in items:
        clean = re.sub(r"<[^>]+>", "", it).strip()
        clean = html.unescape(clean)
        clean = re.sub(r"\s+", " ", clean).strip()
        if clean in ("/", "\\", "|", ">", "-", "»", "›"):
            continue
        clean = clean.strip("/").strip()
        if clean and clean.lower() not in noise:
            trail.append(clean)

    if product_name and trail and (trail[-1].lower() in product_name.lower() or product_name.lower() in trail[-1].lower()):
        trail = trail[:-1]

    while trail and (trail[-1] in ("/", "\\", "|", ">", "-") or not trail[-1].strip("/").strip()):
        trail.pop()

    return trail


class ContentExtractor:
    """Extracts structured product metadata from raw HTML and PDF payloads."""

    def __init__(self, source_config: SourceConfig):
        self.source_config = source_config

    def _is_non_product_content(self, html_content: str, url: str) -> bool:
        """Determines whether an HTML payload represents non-product web content."""
        parsed_url = urlparse(url)
        clean_path = parsed_url.path.strip("/")
        if clean_path in ("", "en", "de", "fr", "es", "it", "zh", "ja", "ko"):
            return True

        # OSHWA registry check: Only individual certified hardware UID pages (e.g. /us000399.html) are products
        if "certification.oshwa.org" in parsed_url.netloc:
            if not re.search(r"/[a-z]{2}\d{6}\.html", parsed_url.path, re.IGNORECASE):
                return True

        for pat in NON_PRODUCT_URL_PATTERNS:
            if re.search(pat, url, re.IGNORECASE):
                return True

        # 2. Check title
        title_m = re.search(r"<title>(.*?)</title>", html_content, re.IGNORECASE | re.DOTALL)
        if title_m:
            title = re.sub(r"\s+", " ", title_m.group(1)).strip()
            for pat in NON_PRODUCT_TITLE_PATTERNS:
                if re.search(pat, title, re.IGNORECASE):
                    return True
            if re.search(r"\bfaqs?\b", title, re.IGNORECASE) and len(title) < 60:
                return True

        # 3. Check H1
        h1_m = re.search(r"<h1[^>]*>(.*?)</h1>", html_content, re.IGNORECASE | re.DOTALL)
        if h1_m:
            h1 = re.sub(r"<[^>]+>", "", h1_m.group(1)).strip()
            for pat in NON_PRODUCT_TITLE_PATTERNS:
                if re.search(pat, h1, re.IGNORECASE):
                    return True
            if re.search(r"\bfaqs?\b", h1, re.IGNORECASE) and len(h1) < 60:
                return True

        # 4. Check for SPA or broken error pages
        if "This browser is not supported" in html_content:
            return True
        if "Access Denied" in html_content and len(html_content) < 5000:
            return True

        return False

    def extract_from_html(
        self, html_content: str, url: str, content_hash: str
    ) -> List[ProductRecord]:
        """Extracts ProductRecords from an HTML document."""
        if self._is_non_product_content(html_content, url):
            return []

        # 1. Try structured JSON-LD first
        json_ld_products = self._extract_json_ld(html_content, url, content_hash)
        if json_ld_products:
            return json_ld_products

        # 2. Heuristic extraction from HTML tags & spec tables
        return self._extract_heuristic_html(html_content, url, content_hash)

    def _extract_json_ld(
        self, html_content: str, url: str, content_hash: str
    ) -> List[ProductRecord]:
        """Extracts Schema.org Product from <script type='application/ld+json'>."""
        records: List[ProductRecord] = []
        matches = re.findall(
            r'<script\s+[^>]*?type=["\']application/ld\+json["\'][^>]*?>(.*?)</script>',
            html_content,
            re.DOTALL | re.IGNORECASE,
        )

        all_items: List[Dict[str, Any]] = []
        for raw_json in matches:
            try:
                data = json.loads(raw_json.strip())
                all_items.extend(_flatten_json_ld(data))
            except Exception:
                continue

        for item in all_items:
            if not isinstance(item, dict):
                continue
            item_type = str(item.get("@type", ""))
            if any(t in item_type for t in ("Article", "BlogPosting", "NewsArticle", "WebSite", "BreadcrumbList", "Organization", "AboutPage", "ContactPage")) and "Product" not in item_type:
                continue

            if "Product" in item_type or item.get("sku") or item.get("mpn"):
                name_raw = item.get("name") or "Unnamed Product"
                name = name_raw.get("@value") or str(name_raw) if isinstance(name_raw, dict) else str(name_raw)
                name = html.unescape(str(name)).strip()

                sku_raw = item.get("sku")
                sku = str(sku_raw).strip() if sku_raw is not None and str(sku_raw).strip() else f"WEB-{content_hash[:8]}"
                mpn_raw = item.get("mpn")
                mpn = str(mpn_raw).strip() if mpn_raw is not None and str(mpn_raw).strip() else sku
                desc_raw = item.get("description")
                desc = desc_raw.get("@value") or str(desc_raw) if isinstance(desc_raw, dict) else (str(desc_raw) if desc_raw is not None else None)
                if desc:
                    desc = html.unescape(str(desc)).strip()
                brand_obj = item.get("brand") or {}
                brand = (
                    brand_obj.get("name")
                    if isinstance(brand_obj, dict)
                    else str(brand_obj)
                ) or self.source_config.name

                category_raw = item.get("category")
                raw_cat_str: Optional[str] = None
                category: Optional[str] = None

                # 1. Direct Schema.org Product.category
                if category_raw:
                    category = str(category_raw).strip()
                    raw_cat_str = category

                # 2. Inspect BreadcrumbList JSON-LD
                if not category or category.lower() in ("general", "uncategorized", "unknown", "other", "inicio", "accueil"):
                    bc_json = extract_breadcrumbs_from_json_ld(all_items, product_name=name)
                    if bc_json:
                        category = bc_json[-1]
                        raw_cat_str = clean_breadcrumb_path(" > ".join(bc_json))

                # 3. Inspect HTML breadcrumb structures
                if not category or category.lower() in ("general", "uncategorized", "unknown", "other", "inicio", "accueil"):
                    bc_html = extract_breadcrumbs_from_html(html_content, product_name=name)
                    if bc_html:
                        category = bc_html[-1]
                        raw_cat_str = clean_breadcrumb_path(" > ".join(bc_html))

                # 4. Constrained URL path hints
                if not category or category.lower() in ("general", "uncategorized", "unknown", "other", "inicio", "accueil"):
                    parsed = urlparse(url)
                    raw_parts = [p for p in parsed.path.split("/") if p and not p.endswith((".html", ".htm"))]
                    lang_codes = {"en", "de", "fr", "es", "it", "zh", "ja", "nl", "pl", "pt", "ru", "ko"}
                    clean_parts = [p for p in raw_parts if p.lower() not in lang_codes]
                    noise_tokens = {"components", "products", "produkte", "bauelemente", "katalog", "catalog", "info", "overview", "uebersicht", "portfolio", "item", "detail", "index", "shop", "view", "id"}
                    meaningful_parts = [p for p in clean_parts if p.lower() not in noise_tokens and not p.isdigit() and len(p) >= 3]
                    if len(meaningful_parts) >= 2:
                        category = meaningful_parts[-2].replace("-", " ").replace("_", " ").title()
                        raw_cat_str = f"URL > {category}"
                    elif meaningful_parts and not (name and meaningful_parts[-1].lower() in name.lower()):
                        category = meaningful_parts[-1].replace("-", " ").replace("_", " ").title()
                        raw_cat_str = f"URL > {category}"

                # 5. Final fallback: If missing, fallback to Uncategorized (NEVER "General")
                if not category:
                    category = "Uncategorized"

                domain = infer_domain(category)
                if (domain == ProductDomain.OTHER or domain is None) and self.source_config.default_domain:
                    domain = self.source_config.default_domain

                attrs: Dict[str, AttributeValueRecord] = {}
                prop_list = item.get("additionalProperty", [])
                if isinstance(prop_list, list):
                    for prop in prop_list:
                        if isinstance(prop, dict) and "name" in prop:
                            code = str(prop.get("name", "")).strip().lower().replace(" ", "_")
                            val = prop.get("value")
                            if code and val is not None:
                                attrs[code] = AttributeValueRecord(
                                    code=code,
                                    name=str(prop.get("name")),
                                    value=str(val),
                                    raw_value=str(val),
                                )

                # Also merge any specification tables found in HTML
                table_specs = self._extract_specification_tables(html_content)
                for k, v in table_specs.items():
                    if k not in attrs:
                        attrs[k] = v

                provenance = ProvenanceRecord(
                    source=self.source_config.id,
                    source_type=self.source_config.type.value,
                    source_url=url,
                    source_id=str(sku),
                    collected_at=datetime.now(timezone.utc).isoformat(),
                    source_quality=self.source_config.source_quality.value,
                    content_type="text/html",
                    content_hash=content_hash,
                    verification_status=VerificationStatus.VERIFIED,
                    verification_method="json_ld_schema",
                )

                records.append(
                    ProductRecord(
                        sku=str(sku),
                        mpn=str(mpn),
                        base_mpn=str(mpn).split("-")[0] if "-" in str(mpn) else str(mpn),
                        name=str(name),
                        description=desc,
                        manufacturer=str(brand),
                        entity_type=EntityType.PRODUCT,
                        document_type=None,
                        raw_category=raw_cat_str or category,
                        category=str(category),
                        domain=domain,
                        attributes=attrs,
                        provenance=provenance,
                    )
                )

        return records

    def _extract_heuristic_html(
        self, html_content: str, url: str, content_hash: str
    ) -> List[ProductRecord]:
        """Extracts product info using semantic HTML title, meta tags, and specification tables."""
        if self._is_non_product_content(html_content, url):
            return []

        # Special handler for OSHWA certified hardware: Only valid UID pages become products
        if "certification.oshwa.org" in url or re.search(r"/[a-z]{2}\d{6}\.html", url, re.IGNORECASE):
            oshwa_record = self._extract_oshwa_hardware(html_content, url, content_hash)
            if oshwa_record:
                return [oshwa_record]
            return []  # Any other page on certification.oshwa.org is non-product

        # Clean tags/styles before searching text for MPN to avoid matching CSS selectors
        clean_text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html_content, flags=re.DOTALL | re.IGNORECASE)
        clean_text_no_tags = re.sub(r"<[^>]+>", " ", clean_text)

        # Title
        title_m = re.search(r"<title>(.*?)</title>", html_content, re.IGNORECASE | re.DOTALL)
        title = title_m.group(1).strip() if title_m else ""
        title = html.unescape(re.sub(r"\s+", " ", title))

        # Meta description
        desc_m = re.search(r'<meta\s+name=["\']description["\']\s+content=["\'](.*?)["\']', html_content, re.IGNORECASE)
        desc = html.unescape(desc_m.group(1).strip()) if desc_m else ""

        # Breadcrumbs
        bc = extract_breadcrumbs_from_html(html_content, product_name=title)
        category = bc[-1].strip() if bc else ""
        raw_cat = clean_breadcrumb_path(" > ".join(bc)) if bc else None

        if not category or category.lower() in ("home", "start", "index", "en", "de", "inicio", "accueil"):
            # Fallback to URL path segment, filtering language codes and navigation noise
            from urllib.parse import urlparse
            raw_parts = [p for p in urlparse(url).path.split("/") if p and not p.endswith((".html", ".htm"))]
            lang_codes = {"en", "de", "fr", "es", "it", "zh", "ja", "nl", "pl", "pt", "ru", "ko"}
            clean_parts = [p for p in raw_parts if p.lower() not in lang_codes]
            noise_tokens = {"components", "products", "produkte", "bauelemente", "katalog", "catalog", "info", "overview", "uebersicht", "portfolio", "item", "detail", "index", "shop"}
            meaningful_parts = [p for p in clean_parts if p.lower() not in noise_tokens and not p.isdigit() and len(p) >= 3]
            if meaningful_parts:
                if len(meaningful_parts) >= 2:
                    category = f"{meaningful_parts[-2].replace('-', ' ').title()} {meaningful_parts[-1].replace('-', ' ').title()}"
                else:
                    category = meaningful_parts[-1].replace("-", " ").title()
                raw_cat = f"URL > {category}"
            else:
                category = "Uncategorized"
                raw_cat = "Uncategorized"

        # Specification table extraction
        attrs = self._extract_specification_tables(html_content)

        # Part number heuristic: clean text regex
        mpn_m = re.search(
            r"\b(?:part\s*(?:number|no|#)|mpn|sku|catalog\s*(?:number|no|#)|cat\.?\s*no\.?|order\s*code|artikelnummer)[\s:]*([A-Z0-9][A-Z0-9_\-\.\/]{2,29})\b",
            clean_text_no_tags,
            re.IGNORECASE,
        )
        mpn: Optional[str] = mpn_m.group(1).strip() if mpn_m else None
        if mpn and not (any(c.isdigit() for c in mpn) or "-" in mpn or "_" in mpn):
            mpn = None

        # Check H1 for alphanumeric part number / model (must contain digits or delimiters)
        if not mpn:
            h1_m = re.search(r"<h1[^>]*>(.*?)</h1>", html_content, re.IGNORECASE | re.DOTALL)
            h1_text = re.sub(r"<[^>]+>", "", h1_m.group(1)).strip() if h1_m else ""
            if h1_text:
                if re.match(r"^[A-Z0-9][A-Z0-9_\-\.]{2,25}$", h1_text, re.IGNORECASE) and (any(c.isdigit() for c in h1_text) or "-" in h1_text or "_" in h1_text):
                    mpn = h1_text.upper()
                elif "–" in h1_text or " - " in h1_text:
                    prefix = re.split(r"[\s–\-]+", h1_text)[0].strip()
                    if re.match(r"^[A-Z0-9]{2,15}$", prefix, re.IGNORECASE) and (any(c.isdigit() for c in prefix) or "-" in prefix or "_" in prefix):
                        mpn = prefix.upper()

        # If no genuine MPN found, check whether page has solid product signals
        # If no genuine MPN AND no specification attributes, it is an overview/category page -> reject!
        if not mpn:
            # Guard: ensure attributes are not FAQ questions or general prose
            is_faq_attrs = any(
                k.startswith(("what_", "why_", "how_", "when_", "where_", "who_", "do_", "can_"))
                or len(str(getattr(v, "value", ""))) > 150
                for k, v in attrs.items()
            )
            if is_faq_attrs:
                return []
            has_specs = len(attrs) >= 2
            has_purchase_signals = bool(re.search(r"\b(?:add\s*to\s*cart|buy\s*now|in\s*stock|out\s*of\s*stock|availability)\b", clean_text_no_tags, re.IGNORECASE))
            if not has_specs and not has_purchase_signals:
                return []
            mpn = f"AUTO-{content_hash[:8]}"

        sku = mpn

        provenance = ProvenanceRecord(
            source=self.source_config.id,
            source_type=self.source_config.type.value,
            source_url=url,
            source_id=sku,
            collected_at=datetime.now(timezone.utc).isoformat(),
            source_quality=self.source_config.source_quality.value,
            content_type="text/html",
            content_hash=content_hash,
            verification_status=VerificationStatus.VERIFIED,
            verification_method="html_heuristic_parser",
        )

        dom = infer_domain(category)
        if (dom == ProductDomain.OTHER or dom is None) and self.source_config.default_domain:
            dom = self.source_config.default_domain

        return [
            ProductRecord(
                sku=sku,
                mpn=mpn,
                base_mpn=mpn.split("-")[0] if "-" in mpn else mpn,
                name=title or mpn,
                description=desc,
                manufacturer=self.source_config.name,
                entity_type=EntityType.PRODUCT,
                document_type=None,
                raw_category=raw_cat or category,
                category=category,
                domain=dom,
                attributes=attrs,
                provenance=provenance,
            )
        ]

    def _extract_oshwa_hardware(
        self, html_content: str, url: str, content_hash: str
    ) -> Optional[ProductRecord]:
        """Extracts certified open source hardware from OSHWA certification registry pages."""
        uid_m = re.search(r"<h3>OSHWA UID</h3>\s*<span class=\"id\">([A-Z0-9]+)</span>", html_content)
        if not uid_m:
            uid_m = re.search(r"/([a-z]{2}\d{6})\.html", url, re.IGNORECASE)
        if not uid_m:
            return None
        uid = uid_m.group(1).upper()

        h1_m = re.search(r"<div class=\"heading-container\">\s*<h1>(.*?)</h1>", html_content, re.IGNORECASE | re.DOTALL)
        if not h1_m:
            h1_m = re.search(r"<h1[^>]*>(.*?)</h1>", html_content, re.IGNORECASE | re.DOTALL)
        name = re.sub(r"<[^>]+>", "", h1_m.group(1)).strip() if h1_m else f"OSHWA Hardware {uid}"

        h2_m = re.search(r"<h2>(.*?)(?:<a|\s*</h2>)", html_content, re.IGNORECASE | re.DOTALL)
        mfg = re.sub(r"<[^>]+>", "", h2_m.group(1)).strip() if h2_m else self.source_config.name

        cat_m = re.search(r"<div[^>]*class=\"project__type\">([^<]+)</div>", html_content, re.IGNORECASE)
        cat = cat_m.group(1).strip() if cat_m else "Open Source Hardware"

        attrs: Dict[str, AttributeValueRecord] = {}
        ver_m = re.search(r"<h3>Version</h3>\s*<span class=\"version\">([^<]+)</span>", html_content, re.IGNORECASE)
        if ver_m:
            attrs["version"] = AttributeValueRecord(code="version", name="Version", value=ver_m.group(1).strip(), raw_value=ver_m.group(1).strip())

        country_m = re.search(r"<h3 class=\"info-title\">Country</h3>\s*<p class=\"info-data\">([^<]+)</p>", html_content, re.IGNORECASE)
        if country_m:
            attrs["country"] = AttributeValueRecord(code="country", name="Country", value=country_m.group(1).strip(), raw_value=country_m.group(1).strip())

        provenance = ProvenanceRecord(
            source=self.source_config.id,
            source_type=self.source_config.type.value,
            source_url=url,
            source_id=uid,
            collected_at=datetime.now(timezone.utc).isoformat(),
            source_quality=self.source_config.source_quality.value,
            content_type="text/html",
            content_hash=content_hash,
            verification_status=VerificationStatus.VERIFIED,
            verification_method="oshwa_cert_parser",
        )

        dom = infer_domain(cat)
        if (dom == ProductDomain.OTHER or dom is None) and self.source_config.default_domain:
            dom = self.source_config.default_domain

        return ProductRecord(
            sku=uid,
            mpn=uid,
            base_mpn=uid,
            name=name,
            description=None,
            manufacturer=mfg,
            entity_type=EntityType.PRODUCT,
            document_type=None,
            raw_category=cat,
            category=cat,
            domain=dom,
            attributes=attrs,
            provenance=provenance,
        )

    def extract_from_pdf(
        self,
        pdf_source: Any,
        url: str,
        content_hash: str,
    ) -> Optional[ProductRecord]:
        """
        Extracts text, metadata, and parameters from a PDF document.

        ``pdf_source`` may be raw bytes, a filesystem path, or a binary stream.
        Passing the downloaded path avoids a second full in-memory copy of large
        PDFs while preserving identical extraction semantics.
        """
        try:
            combined_text, title = self.read_pdf_text(pdf_source)
        except Exception:
            return None
        return self.build_pdf_record(combined_text, title, url, content_hash)

    def read_pdf_text(self, pdf_source: Any) -> Tuple[str, Optional[str]]:
        """Parses a PDF and returns its combined page text and document title."""
        if isinstance(pdf_source, (bytes, bytearray)):
            reader = pypdf.PdfReader(io.BytesIO(pdf_source))
        elif isinstance(pdf_source, (str, Path)):
            with open(pdf_source, "rb") as f:
                reader = pypdf.PdfReader(f)
                return self._read_text_from_reader(reader)
        else:
            reader = pypdf.PdfReader(pdf_source)
        return self._read_text_from_reader(reader)

    def _read_text_from_reader(self, reader: pypdf.PdfReader) -> Tuple[str, Optional[str]]:
        meta = reader.metadata or {}
        title = meta.get("/Title") or meta.get("title")

        full_text = []
        for page in reader.pages[:10]:  # Limit to first 10 pages for speed
            text = page.extract_text()
            if text:
                full_text.append(text)

        return "\n".join(full_text), title

    def build_pdf_record(
        self,
        combined_text: str,
        title: Optional[str],
        url: str,
        content_hash: str,
    ) -> Optional[ProductRecord]:
        """Builds a ProductRecord from already-extracted PDF text and title."""
        try:
            if not combined_text and not title:
                return None

            # Detect compliance, flyer, brochure, or whitepaper documents
            url_and_title = f"{url} {title or ''}".lower()
            is_compliance_or_flyer = any(re.search(pat, url_and_title, re.IGNORECASE) for pat in NON_PRODUCT_PDF_PATTERNS)

            # Detect MPN in document text
            mpn_m = re.search(r"\b(?:part\s*(?:number|no|#)|model|series)[\s:]*([A-Z0-9_\-\.\/]{4,30})\b", combined_text, re.IGNORECASE)
            mpn = mpn_m.group(1) if mpn_m else f"PDF-{content_hash[:8]}"

            # If document is compliance/flyer/whitepaper and has no genuine MPN, reject
            if is_compliance_or_flyer and mpn.startswith("PDF-"):
                return None

            # Determine document_type
            text_sample = combined_text[:3000].lower() if combined_text else ""
            if "application note" in url_and_title or "application note" in text_sample or "/appnote" in url_and_title or "appnote" in url_and_title or "an_" in url_and_title or "an-" in url_and_title:
                doc_type = DocumentType.APPLICATION_NOTE
            elif any(k in url_and_title or k in text_sample for k in ("user manual", "user guide", "betriebsanleitung", "bedienungsanleitung", "handbuch")):
                doc_type = DocumentType.USER_MANUAL
            elif any(k in url_and_title or k in text_sample for k in ("press release", "pressemitteilung", "pressemeldung")):
                doc_type = DocumentType.PRESS_RELEASE
            elif "faq" in url_and_title or "faq" in text_sample:
                doc_type = DocumentType.FAQ
            elif any(k in url_and_title or k in text_sample for k in ("datasheet", "data sheet", "datenblatt", "technical specifications")):
                doc_type = DocumentType.DATASHEET
            else:
                doc_type = DocumentType.TECHNICAL_DOCUMENTATION

            # Category is ONLY assigned if there is reliable evidence of specific product category
            category = "Uncategorized"
            raw_category = doc_type.value
            for kw in ("fastener", "screw", "bearing", "resistor", "capacitor", "inductor", "choke", "ferrite", "connector", "transformer", "valve", "sensor", "filament", "switch", "relay"):
                if kw in combined_text.lower() or kw in url.lower():
                    category = kw.title()
                    raw_category = f"Keyword: {kw}"
                    break

            # If title is missing or generic, derive readable name from filename stem
            from urllib.parse import urlparse
            fn_stem = Path(urlparse(url).path).stem.replace("-", " ").replace("_", " ").title()
            clean_title = title.strip() if title and title.strip() and not title.lower().startswith("untitled") else fn_stem

            # Extract electronic & physical attributes using datasheet_extractor service
            attrs: Dict[str, AttributeValueRecord] = {}
            try:
                from apps.ml.app.services.datasheet_extractor import datasheet_extractor
                res = datasheet_extractor.process(text=combined_text)
                if res and res.attributes:
                    for code, attr in res.attributes.items():
                        attrs[code] = AttributeValueRecord(
                            code=code,
                            value=str(attr.value),
                            unit=attr.unit,
                            raw_value=attr.formatted or str(attr.value),
                            confidence=attr.confidence,
                        )
            except Exception:
                pass

            # If document has synthetic MPN AND 0 technical attributes extracted, it is not a product datasheet -> reject!
            if mpn.startswith("PDF-") and not attrs:
                return None

            # If compliance/flyer was flagged and attributes are minimal, reject
            if is_compliance_or_flyer and len(attrs) < 2:
                return None

            provenance = ProvenanceRecord(
                source=self.source_config.id,
                source_type="technical_document",
                source_url=url,
                source_id=mpn,
                collected_at=datetime.now(timezone.utc).isoformat(),
                source_quality=self.source_config.source_quality.value,
                content_type="application/pdf",
                content_hash=content_hash,
                verification_status=VerificationStatus.VERIFIED,
                verification_method="pdf_metadata_extractor",
            )

            doc_ref = DocumentRefRecord(
                title=clean_title or f"Document {mpn}",
                document_type=doc_type.value,
                source_type="EXTERNAL_URL",
                external_url=url,
            )

            pdf_domain = infer_domain(category)
            if (pdf_domain == ProductDomain.OTHER or pdf_domain is None) and self.source_config.default_domain:
                pdf_domain = self.source_config.default_domain

            return ProductRecord(
                sku=mpn,
                mpn=mpn,
                base_mpn=mpn.split("-")[0] if "-" in mpn else mpn,
                name=clean_title or f"Document {mpn}",
                description=combined_text[:500] if combined_text else None,
                manufacturer=self.source_config.name,
                entity_type=EntityType.DOCUMENT,
                document_type=doc_type,
                raw_category=raw_category,
                category=category,
                domain=pdf_domain,
                attributes=attrs,
                documents=[doc_ref],
                provenance=provenance,
            )

        except Exception:
            return None

    def _extract_specification_tables(self, html_content: str) -> Dict[str, AttributeValueRecord]:
        """Extracts key-value attributes from HTML tables and definition lists."""
        attrs: Dict[str, AttributeValueRecord] = {}
        rows = re.findall(r"<tr[^>]*?>(.*?)</tr>", html_content, re.DOTALL | re.IGNORECASE)
        for row in rows:
            cells = re.findall(r"<(?:th|td)[^>]*?>(.*?)</(?:th|td)>", row, re.DOTALL | re.IGNORECASE)
            if len(cells) == 2:
                key = re.sub(r"<[^>]+>", "", cells[0]).strip().lower().replace(" ", "_")
                val = re.sub(r"<[^>]+>", "", cells[1]).strip()
                if key and val and len(key) <= 40 and len(val) <= 100:
                    attrs[key] = AttributeValueRecord(code=key, value=val, raw_value=val)

        dl_pairs = re.findall(r"<dt[^>]*?>(.*?)</dt>\s*<dd[^>]*?>(.*?)</dd>", html_content, re.DOTALL | re.IGNORECASE)
        for dt, dd in dl_pairs:
            key = re.sub(r"<[^>]+>", "", dt).strip().lower().replace(" ", "_")
            val = re.sub(r"<[^>]+>", "", dd).strip()
            if key and val and len(key) <= 40:
                attrs[key] = AttributeValueRecord(code=key, value=val, raw_value=val)

        return attrs
