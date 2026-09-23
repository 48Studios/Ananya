"""
Autonomous Content Extractor (HTML & PDF).

Extracts structured product records across broad ERP domains:
- HTML: Title, meta description, JSON-LD Schema.org Product, OpenGraph, breadcrumbs, spec tables, DL/DT/DD lists
- PDF: Document metadata, page text, identifier matches, technical specifications
"""

import io
import re
import json
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone
import pypdf

from ...schemas.product import (
    ProductRecord,
    ProductDomain,
    ProvenanceRecord,
    AttributeValueRecord,
    DocumentRefRecord,
    VerificationStatus,
)
from ..ananya_db import infer_domain
from .registry import SourceConfig


class ContentExtractor:
    """Extracts structured product metadata from raw HTML and PDF payloads."""

    def __init__(self, source_config: SourceConfig):
        self.source_config = source_config

    def extract_from_html(
        self, html_content: str, url: str, content_hash: str
    ) -> List[ProductRecord]:
        """Extracts ProductRecords from an HTML document."""
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

        for raw_json in matches:
            try:
                data = json.loads(raw_json.strip())
                items = data if isinstance(data, list) else [data]
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    item_type = str(item.get("@type", ""))
                    if "Product" in item_type or item.get("sku") or item.get("mpn"):
                        name = item.get("name") or "Unnamed Product"
                        sku = item.get("sku") or f"WEB-{content_hash[:8]}"
                        mpn = item.get("mpn") or sku
                        desc = item.get("description")
                        brand_obj = item.get("brand") or {}
                        brand = (
                            brand_obj.get("name")
                            if isinstance(brand_obj, dict)
                            else str(brand_obj)
                        ) or self.source_config.name

                        category = item.get("category") or "General"
                        domain = infer_domain(category)
                        if (domain == ProductDomain.OTHER or domain is None) and self.source_config.default_domain:
                            domain = self.source_config.default_domain

                        attrs: Dict[str, AttributeValueRecord] = {}
                        for prop in item.get("additionalProperty", []):
                            if isinstance(prop, dict) and "name" in prop:
                                code = prop.get("name", "").strip().lower().replace(" ", "_")
                                val = prop.get("value")
                                attrs[code] = AttributeValueRecord(
                                    code=code,
                                    name=prop.get("name"),
                                    value=val,
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
                            source_id=sku,
                            collected_at=datetime.now(timezone.utc).isoformat(),
                            source_quality=self.source_config.source_quality.value,
                            content_type="text/html",
                            content_hash=content_hash,
                            verification_status=VerificationStatus.VERIFIED,
                            verification_method="json_ld_schema",
                        )

                        records.append(
                            ProductRecord(
                                sku=sku,
                                mpn=mpn,
                                base_mpn=mpn.split("-")[0] if "-" in mpn else mpn,
                                name=name,
                                description=desc,
                                manufacturer=brand,
                                category=category,
                                domain=domain,
                                attributes=attrs,
                                provenance=provenance,
                            )
                        )
            except Exception:
                continue

        return records

    def _extract_heuristic_html(
        self, html_content: str, url: str, content_hash: str
    ) -> List[ProductRecord]:
        """Extracts product info using semantic HTML title, meta tags, and specification tables."""
        # Title
        title_m = re.search(r"<title>(.*?)</title>", html_content, re.IGNORECASE | re.DOTALL)
        title = title_m.group(1).strip() if title_m else ""
        title = re.sub(r"\s+", " ", title)

        # Meta description
        desc_m = re.search(r'<meta\s+name=["\']description["\']\s+content=["\'](.*?)["\']', html_content, re.IGNORECASE)
        desc = desc_m.group(1).strip() if desc_m else ""

        # Breadcrumbs
        breadcrumbs = re.findall(r'<li[^>]*?itemprop=["\']itemListElement["\'][^>]*?>.*?<span[^>]*?itemprop=["\']name["\'][^>]*?>(.*?)</span>', html_content, re.IGNORECASE | re.DOTALL)
        category = breadcrumbs[-1].strip() if breadcrumbs else "General"
        if not breadcrumbs:
            # Fallback to URL path segment
            from urllib.parse import urlparse
            path_parts = [p for p in urlparse(url).path.split("/") if p and not p.endswith((".html", ".htm"))]
            if path_parts:
                category = path_parts[0].replace("-", " ").title()

        # Part number heuristic from text/title
        mpn_m = re.search(r"\b(?:part\s*(?:number|no|#)|mpn|sku)[\s:]*([A-Z0-9_\-\.\/]{4,30})\b", html_content, re.IGNORECASE)
        mpn = mpn_m.group(1) if mpn_m else f"AUTO-{content_hash[:8]}"
        sku = mpn

        # Specification table extraction
        attrs = self._extract_specification_tables(html_content)

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
                category=category,
                domain=dom,
                attributes=attrs,
                provenance=provenance,
            )
        ]

    def extract_from_pdf(
        self, pdf_bytes: bytes, url: str, content_hash: str
    ) -> Optional[ProductRecord]:
        """Extracts text, metadata, and parameters from a PDF document."""
        try:
            reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
            meta = reader.metadata or {}
            title = meta.get("/Title") or meta.get("title")

            full_text = []
            for page in reader.pages[:10]:  # Limit to first 10 pages for speed
                text = page.extract_text()
                if text:
                    full_text.append(text)

            combined_text = "\n".join(full_text)
            if not combined_text and not title:
                return None

            # Detect MPN in document text
            mpn_m = re.search(r"\b(?:part\s*(?:number|no|#)|model|series)[\s:]*([A-Z0-9_\-\.\/]{4,30})\b", combined_text, re.IGNORECASE)
            mpn = mpn_m.group(1) if mpn_m else f"PDF-{content_hash[:8]}"

            # Detect category/domain keywords
            category = "Technical Documentation"
            for kw in ("fastener", "screw", "bearing", "resistor", "capacitor", "valve", "sensor", "filament"):
                if kw in combined_text.lower():
                    category = kw.title()
                    break

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
                title=title or f"Document {mpn}",
                document_type="DATASHEET",
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
                name=title or f"Product {mpn}",
                description=combined_text[:500] if combined_text else None,
                manufacturer=self.source_config.name,
                category=category,
                domain=pdf_domain,
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
