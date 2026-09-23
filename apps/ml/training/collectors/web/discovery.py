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
import xml.etree.ElementTree as ET
from urllib.parse import urlparse, urljoin, parse_qs, urlencode, urlunparse
from typing import List, Tuple, Optional, Set
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


def canonicalize_url(url: str, base_url: Optional[str] = None) -> str:
    """Normalizes URL, resolves relative paths, drops fragments and tracking query params."""
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

    def parse_sitemap(self, xml_content: str, current_url: str) -> Tuple[List[str], List[str]]:
        """
        Parses XML sitemap content.
        Returns:
            discovered_urls: List of leaf page/document URLs
            nested_sitemaps: List of sitemap index URLs to traverse
        """
        discovered_urls: List[str] = []
        nested_sitemaps: List[str] = []

        try:
            # Strip namespaces for simple tag matching
            xml_clean = re.sub(r'\sxmlns(?::\w+)?="[^"]+"', '', xml_content, count=1)
            root = ET.fromstring(xml_clean)

            # 1. Sitemap Index (<sitemapindex><sitemap><loc>...</loc></sitemap>)
            for loc in root.findall(".//sitemap/loc"):
                if loc.text:
                    c_url = canonicalize_url(loc.text.strip(), current_url)
                    if self.is_allowed(c_url):
                        nested_sitemaps.append(c_url)

            # 2. Urlset (<urlset><url><loc>...</loc></url>)
            for loc in root.findall(".//url/loc"):
                if loc.text:
                    c_url = canonicalize_url(loc.text.strip(), current_url)
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
            if resolved_url.lower().endswith(".pdf") or "/datasheet" in resolved_url.lower():
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
