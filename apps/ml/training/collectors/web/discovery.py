"""
Automatic Discovery Engine.

Supports:
- XML Sitemap parsing & nested Sitemap index traversal
- Product-page link discovery
- Catalog and PDF datasheet discovery
- Pagination detection
- Strict domain allowlist enforcement & URL canonicalization
"""

import re
import gzip
import xml.etree.ElementTree as ET
from urllib.parse import urlparse, urljoin, parse_qs, urlencode, urlunparse
from typing import List, Tuple, Optional, Set, Dict, Any
from dataclasses import dataclass, field
import httpx
from .registry import SourceConfig


TRACKING_PARAMS = {
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "gclid",
    "fbclid",
    "ref",
    "source",
    "session_id",
}


@dataclass
class DiscoveryReport:
    """Structured discovery metrics and rejection counters."""

    source_id: str
    sitemaps_found: int = 0
    sitemaps_parsed: int = 0
    sitemaps_failed: int = 0
    urls_in_sitemaps: int = 0
    product_urls: int = 0
    document_urls: int = 0
    other_urls: int = 0
    rejected_outside_domain: int = 0
    rejected_robots: int = 0
    rejected_duplicate: int = 0
    rejected_invalid: int = 0
    skipped_cached: int = 0
    final_crawl_queue: int = 0

    def format_report(self) -> str:
        return (
            f"DISCOVERY REPORT\n\n"
            f"Source: {self.source_id}\n\n"
            f"Sitemaps:\n"
            f"  Found:             {self.sitemaps_found:,}\n"
            f"  Parsed:            {self.sitemaps_parsed:,}\n"
            f"  URLs in sitemaps:  {self.urls_in_sitemaps:,}\n\n"
            f"URLs:\n"
            f"  Product URLs:       {self.product_urls:,}\n"
            f"  Document URLs:      {self.document_urls:,}\n"
            f"  Other URLs:         {self.other_urls:,}\n\n"
            f"Rejected:\n"
            f"  Outside domain:     {self.rejected_outside_domain:,}\n"
            f"  Robots:             {self.rejected_robots:,}\n"
            f"  Duplicate:          {self.rejected_duplicate:,}\n"
            f"  Invalid:            {self.rejected_invalid:,}\n"
            f"  Cached:             {self.skipped_cached:,}\n\n"
            f"Final crawl queue:   {self.final_crawl_queue:,}"
        )


@dataclass
class DiscoveryResult:
    """Result of running discovery phase."""

    report: DiscoveryReport
    page_queue: List[str] = field(default_factory=list)
    doc_queue: List[str] = field(default_factory=list)
    sitemap_urls: List[str] = field(default_factory=list)


def canonicalize_url(url: str, base_url: Optional[str] = None) -> str:
    """Normalizes URL, resolves relative paths, drops fragments and tracking query params."""
    if not url:
        return ""
    if base_url:
        url = urljoin(base_url, url)

    parsed = urlparse(url)
    scheme = parsed.scheme.lower() or "https"
    netloc = parsed.netloc.lower()

    # Drop default ports
    if netloc.endswith(":80") and scheme == "http":
        netloc = netloc[:-3]
    elif netloc.endswith(":443") and scheme == "https":
        netloc = netloc[:-4]

    path = parsed.path or "/"
    # Collapse multiple slashes
    path = re.sub(r"/{2,}", "/", path)
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/")

    # Filter tracking query parameters
    query_dict = parse_qs(parsed.query, keep_blank_values=False)
    filtered_query = {k: v for k, v in query_dict.items() if k.lower() not in TRACKING_PARAMS}
    sorted_query = urlencode(sorted(filtered_query.items()), doseq=True)

    return urlunparse((scheme, netloc, path, "", sorted_query, ""))


class DiscoveryEngine:
    """Discovers URLs from Sitemaps, HTML pages, catalogs, and document feeds."""

    def __init__(self, source_config: SourceConfig):
        self.source_config = source_config

    def is_allowed(self, url: str) -> bool:
        """Enforces that the URL strictly matches the source's approved domains."""
        host = urlparse(url).netloc
        return self.source_config.is_domain_allowed(host)

    def classify_url(self, url: str) -> str:
        """Classifies a URL into 'document', 'product', or 'other'."""
        u = url.lower()
        parsed = urlparse(u)
        path = parsed.path
        # 0. Media / Static Assets (never crawl as HTML pages or technical documents)
        if path.endswith((".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".webm", ".avi", ".mov")):
            return "media"

        # 1. Document / PDF
        if path.endswith((".pdf", ".step", ".stp", ".dxf", ".csv", ".zip", ".doc", ".docx")):
            return "document"
        if any(p in u for p in ("/datasheet", "/drawing", "/cad-")):
            return "document"

        # 2. Product URLs
        if hasattr(self.source_config, "product_url_patterns") and self.source_config.product_url_patterns:
            for pat in self.source_config.product_url_patterns:
                if re.search(pat, url, re.IGNORECASE):
                    return "product"

        if any(p in path for p in ("/products/", "/product/", "/part/", "/item/", "/components/", "/article/", "/artikelen/")):
            return "product"

        if any(p in path for p in ("/emc-", "/passive-", "/electromechanical-", "/optoelectronics-", "/power-magnetics-")):
            return "product"

        # 3. Other
        return "other"

    def parse_sitemap(self, xml_content: str, current_url: str) -> Tuple[List[str], List[str]]:
        """
        Parses XML sitemap content.
        Supports standard sitemap, sitemapindex, and varied namespaces.
        Returns:
            discovered_urls: List of leaf page/document URLs
            nested_sitemaps: List of sitemap index URLs to traverse
        """
        discovered_urls: List[str] = []
        nested_sitemaps: List[str] = []

        try:
            # Strip all xmlns and xsi declarations so ElementTree parses cleanly
            xml_clean = re.sub(r'\sxmlns(?::\w+)?="[^"]+"', '', xml_content)
            xml_clean = re.sub(r'\sxsi:[a-zA-Z]+="[^"]+"', '', xml_clean)
            root = ET.fromstring(xml_clean)

            for elem in root.iter():
                tag = elem.tag.split("}")[-1].lower() if "}" in elem.tag else elem.tag.lower()
                if tag == "sitemap":
                    for child in elem:
                        c_tag = child.tag.split("}")[-1].lower() if "}" in child.tag else child.tag.lower()
                        if c_tag == "loc" and child.text:
                            c_url = canonicalize_url(child.text.strip(), current_url)
                            if self.is_allowed(c_url):
                                nested_sitemaps.append(c_url)
                elif tag == "url":
                    for child in elem:
                        c_tag = child.tag.split("}")[-1].lower() if "}" in child.tag else child.tag.lower()
                        if c_tag == "loc" and child.text:
                            c_url = canonicalize_url(child.text.strip(), current_url)
                            if self.is_allowed(c_url):
                                discovered_urls.append(c_url)

        except ET.ParseError:
            # Fallback regex extraction if XML malformed
            loc_matches = re.findall(r"<loc>\s*(https?://[^\s<]+)\s*</loc>", xml_content, re.IGNORECASE)
            for loc in loc_matches:
                c_url = canonicalize_url(loc.strip(), current_url)
                if self.is_allowed(c_url):
                    if "sitemap" in c_url.lower() and c_url.endswith(".xml"):
                        nested_sitemaps.append(c_url)
                    else:
                        discovered_urls.append(c_url)

        return list(dict.fromkeys(discovered_urls)), list(dict.fromkeys(nested_sitemaps))

    def discover(
        self,
        policy_manager: Optional[Any] = None,
        acquisition_store: Optional[Any] = None,
        client: Optional[httpx.Client] = None,
        resume: bool = True,
        discovery_limit: int = 50000,
        progress: Optional[Any] = None,
        category_plan: Optional[Any] = None,
    ) -> DiscoveryResult:
        """
        Executes decoupled discovery across configured start URLs, sitemaps, and robots.txt.
        Does NOT download pages/documents — builds the full crawl queue with structured diagnostics.
        """
        report = DiscoveryReport(source_id=self.source_config.id)
        product_queue: List[str] = []
        page_queue: List[str] = []
        doc_queue: List[str] = []
        seen_urls: Set[str] = set()
        seen_sitemaps: Set[str] = set()

        if progress:
            progress.start_stage("Checking policies and seeds", total=None)

        # 1. Identify initial sitemap seeds and regular start URLs
        sitemap_queue: List[str] = []
        seed_urls: List[str] = []

        for u in self.source_config.start_urls:
            c = canonicalize_url(u)
            if c.endswith(".xml") or "sitemap" in c.lower():
                sitemap_queue.append(c)
            else:
                seed_urls.append(c)

        # 2. Check robots.txt for declared sitemaps
        if policy_manager:
            for domain in self.source_config.domains:
                try:
                    r_sitemaps = policy_manager.get_sitemaps(domain, client=client)
                    for sm in r_sitemaps:
                        c_sm = canonicalize_url(sm)
                        if c_sm and c_sm not in sitemap_queue:
                            sitemap_queue.append(c_sm)
                except Exception:
                    pass

        report.sitemaps_found = len(sitemap_queue)

        if progress:
            progress.finish_stage()
            if sitemap_queue:
                progress.start_stage("Discovering sitemaps...", total=len(sitemap_queue))

        # 3. Recursively traverse sitemaps
        while sitemap_queue:
            sm_url = sitemap_queue.pop(0)
            if sm_url in seen_sitemaps:
                continue
            seen_sitemaps.add(sm_url)

            if progress:
                sitemap_total = len(seen_sitemaps) + len(sitemap_queue)
                progress.update(
                    current=report.sitemaps_parsed,
                    total=sitemap_total,
                    metrics={
                        "URLs": report.urls_in_sitemaps,
                        "products": report.product_urls,
                        "documents": report.document_urls,
                    },
                )

            # Check domain allowlist
            if not self.is_allowed(sm_url):
                report.rejected_outside_domain += 1
                continue

            # Check robots.txt policy
            if policy_manager and not policy_manager.is_allowed(sm_url, client=client):
                report.rejected_robots += 1
                continue

            # Fetch sitemap
            try:
                if client:
                    res = client.get(sm_url, follow_redirects=True, timeout=15.0)
                else:
                    with httpx.Client(follow_redirects=True, timeout=15.0) as default_client:
                        res = default_client.get(sm_url)

                if res.status_code == 200:
                    report.sitemaps_parsed += 1
                    content = res.content
                    if content[:2] == b"\x1f\x8b" or sm_url.endswith(".gz"):
                        try:
                            content_str = gzip.decompress(content).decode("utf-8", errors="replace")
                        except Exception:
                            content_str = res.text
                    else:
                        content_str = res.text

                    leaf_urls, nested = self.parse_sitemap(content_str, sm_url)

                    # Enqueue nested sitemaps
                    for n in nested:
                        if n not in seen_sitemaps and n not in sitemap_queue:
                            sitemap_queue.append(n)
                            report.sitemaps_found += 1

                    # Process leaf URLs
                    for leaf in leaf_urls:
                        report.urls_in_sitemaps += 1
                        self._filter_and_enqueue(
                            leaf,
                            report=report,
                            seen_urls=seen_urls,
                            page_queue=page_queue,
                            doc_queue=doc_queue,
                            policy_manager=policy_manager,
                            acquisition_store=acquisition_store,
                            client=client,
                            resume=resume,
                            limit=discovery_limit,
                            product_queue=product_queue,
                        )
                else:
                    report.sitemaps_failed += 1

            except Exception:
                report.sitemaps_failed += 1

        if progress:
            progress.finish_stage()

        # 4. Enqueue non-sitemap seed URLs
        for s_url in seed_urls:
            self._filter_and_enqueue(
                s_url,
                report=report,
                seen_urls=seen_urls,
                page_queue=page_queue,
                doc_queue=doc_queue,
                policy_manager=policy_manager,
                acquisition_store=acquisition_store,
                client=client,
                resume=resume,
                limit=discovery_limit,
                product_queue=product_queue,
            )

        # Prioritize crawl queues if category_plan is provided
        if category_plan and hasattr(category_plan, "categories"):
            prioritized_cats = [
                c for c in category_plan.categories
                if getattr(c, "priority", None) is not None and getattr(c, "budget", 0) > 0
            ]
            if prioritized_cats:
                def _score_url(url: str) -> int:
                    u_lower = url.lower()
                    for item in prioritized_cats:
                        cat_tokens = [w for w in re.split(r"[^a-z0-9]+", item.category.lower()) if len(w) > 2]
                        if any(tok in u_lower for tok in cat_tokens):
                            return item.priority or 999
                        for q in getattr(item, "queries", []):
                            q_tokens = [w for w in re.split(r"[^a-z0-9]+", q.lower()) if len(w) > 3 and w not in ("manufacturer", "product", "component", "datasheet")]
                            if q_tokens and all(tok in u_lower for tok in q_tokens):
                                return item.priority or 999
                    return 9999

                product_queue.sort(key=_score_url)
                page_queue.sort(key=_score_url)
                doc_queue.sort(key=_score_url)

        final_page_queue = product_queue + page_queue
        report.final_crawl_queue = len(final_page_queue) + len(doc_queue)
        return DiscoveryResult(
            report=report,
            page_queue=final_page_queue,
            doc_queue=doc_queue,
            sitemap_urls=list(seen_sitemaps),
        )

    def generate_category_discovery_seeds(
        self,
        category: str,
        queries: List[str],
    ) -> List[str]:
        """
        Generates source-specific discovery seed URLs for a category within allowed domains.
        Preserves domain boundary constraints and robots policy.
        """
        seeds: List[str] = []
        for start_url in self.source_config.start_urls:
            if "catalog" in start_url.lower() or "product" in start_url.lower():
                for q in queries:
                    slug = re.sub(r"[^a-zA-Z0-9]+", "-", q.lower()).strip("-")
                    cand = urljoin(start_url, f"?q={slug}")
                    if self.is_allowed(cand) and cand not in seeds:
                        seeds.append(cand)
        return seeds


    def _filter_and_enqueue(
        self,
        raw_url: str,
        report: DiscoveryReport,
        seen_urls: Set[str],
        page_queue: List[str],
        doc_queue: List[str],
        policy_manager: Optional[Any],
        acquisition_store: Optional[Any],
        client: Optional[httpx.Client],
        resume: bool,
        limit: int,
        product_queue: Optional[List[str]] = None,
    ) -> None:
        """Validates, filters, classifies, and enqueues a discovered URL."""
        current_total = len(page_queue) + len(doc_queue) + (len(product_queue) if product_queue else 0)
        if current_total >= limit:
            return

        parsed = urlparse(raw_url)
        if not parsed.scheme or parsed.scheme not in ("http", "https") or not parsed.netloc:
            report.rejected_invalid += 1
            return

        canonical = canonicalize_url(raw_url)
        if not canonical:
            report.rejected_invalid += 1
            return

        if canonical in seen_urls:
            report.rejected_duplicate += 1
            return
        seen_urls.add(canonical)

        if not self.is_allowed(canonical):
            report.rejected_outside_domain += 1
            return

        if policy_manager and not policy_manager.is_allowed(canonical, client=client):
            report.rejected_robots += 1
            return

        if resume and acquisition_store and hasattr(acquisition_store, "is_cached") and acquisition_store.is_cached(canonical):
            report.skipped_cached += 1
            return

        cat = self.classify_url(canonical)
        if cat == "media":
            report.rejected_invalid += 1
            return
        elif cat == "document":
            report.document_urls += 1
            doc_queue.append(canonical)
        elif cat == "product":
            report.product_urls += 1
            if product_queue is not None:
                product_queue.append(canonical)
            else:
                page_queue.append(canonical)
        else:
            report.other_urls += 1
            page_queue.append(canonical)

    def extract_links_from_html(
        self, html_content: str, current_url: str
    ) -> Tuple[List[str], List[str]]:
        """
        Extracts navigable links and document (PDF) links from an HTML document.
        Returns:
            product_and_nav_urls: List of navigable HTML URLs within approved domains
            document_urls: List of PDF / datasheet / drawing URLs
        """
        nav_urls: List[str] = []
        doc_urls: List[str] = []

        # Find all <a href="...">
        hrefs = re.findall(r'<a\s+(?:[^>]*?\s+)?href=["\']([^"\']+)["\']', html_content, re.IGNORECASE)

        for href in hrefs:
            clean_href = href.strip()
            if not clean_href or clean_href.startswith(("javascript:", "mailto:", "tel:", "#")):
                continue

            resolved_url = canonicalize_url(clean_href, base_url=current_url)
            if not self.is_allowed(resolved_url):
                continue

            # Classify into PDF/document vs HTML navigation
            if self.classify_url(resolved_url) == "document":
                doc_urls.append(resolved_url)
            else:
                nav_urls.append(resolved_url)

        return list(dict.fromkeys(nav_urls)), list(dict.fromkeys(doc_urls))

    def detect_pagination_next(self, html_content: str, current_url: str) -> Optional[str]:
        """Detects rel='next' or next page links."""
        # 1. <link rel="next" href="..."> or <a rel="next" href="...">
        m_rel = re.search(r'<(?:link|a)\s+[^>]*?rel=["\']next["\'][^>]*?href=["\']([^"\']+)["\']', html_content, re.IGNORECASE)
        if m_rel:
            resolved = canonicalize_url(m_rel.group(1), current_url)
            if self.is_allowed(resolved):
                return resolved

        # 2. Common pagination patterns: <a href="?page=2">Next</a>
        m_next_text = re.search(r'<a\s+[^>]*?href=["\']([^"\']+)["\'][^>]*?>\s*(?:Next|»|&gt;)\s*</a>', html_content, re.IGNORECASE)
        if m_next_text:
            resolved = canonicalize_url(m_next_text.group(1), current_url)
            if self.is_allowed(resolved):
                return resolved

        return None

