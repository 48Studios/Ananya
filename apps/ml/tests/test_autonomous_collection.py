"""
Tests for Autonomous Data Collection System in Ananya ML.

Covers:
1. Source Registry (YAML loading, domain allowlist, source types)
2. URL Canonicalization (tracking param stripping, lowercasing, anchors)
3. Robots Handling (robots.txt compliance, disallowed path blocking)
4. Rate Limiting (crawl delays, Retry-After header compliance)
5. Retry Behavior & Exponential Backoff
6. Downloader Caching (ETag, If-Modified-Since, 304 Not Modified)
7. Content Hashing (SHA-256 integrity verification)
8. Duplicate Content Detection
9. Sitemap Parsing (Standard sitemaps & sitemap indexes)
10. Pagination Detection
11. PDF Discovery & Extraction (pypdf, metadata, specs)
12. HTML Extraction (JSON-LD, OpenGraph, specification tables, breadcrumbs)
13. Provenance Preservation (source, quality, content_hash, license)
14. Acquisition Store & Resume Behavior
15. Failure Isolation (faulty responses do not abort collection)
16. Downstream Pipeline Integration & Dataset Versioning
17. CLI collect & data-collect commands
"""

import io
import json
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch

import httpx

from apps.ml.training.schemas.product import (
    ProductDomain,
    ProductRecord,
    ProvenanceRecord,
    VerificationStatus,
    EntityType,
    DocumentType,
)
from apps.ml.training.collectors.web import (
    SourceRegistry,
    SourceConfig,
    SourceType,
    SourceQuality,
    RateLimitConfig,
    CrawlPolicyManager,
    canonicalize_url,
    ResilientDownloader,
    AcquisitionStore,
    AcquisitionRecord,
    DiscoveryEngine,
    ContentExtractor,
)
from apps.ml.training.collectors.web_collector import AutonomousWebCollector
from apps.ml.training.cli import build_parser


# =====================================================================
# 1. Source Registry Tests
# =====================================================================

def test_source_registry_loading(tmp_path: Path):
    yaml_content = """
sources:
  - id: test-mfg
    name: Test Manufacturer
    type: manufacturer
    quality: authoritative_manufacturer
    enabled: true
    domains:
      - test-mfg.com
      - cdn.test-mfg.com
    start_urls:
      - https://test-mfg.com/catalog
    discovery:
      - sitemap
      - product_pages
    rate_limit:
      requests_per_second: 2.0
    max_pages: 50
    default_domain: mechanical
"""
    cfg_file = tmp_path / "sources.yaml"
    cfg_file.write_text(yaml_content, encoding="utf-8")

    registry = SourceRegistry.from_yaml(str(cfg_file))
    assert len(registry.sources) == 1
    src = registry.get_source("test-mfg")
    assert src is not None
    assert src.name == "Test Manufacturer"
    assert src.type == SourceType.MANUFACTURER
    assert src.quality == SourceQuality.AUTHORITATIVE_MANUFACTURER
    assert src.default_domain == ProductDomain.MECHANICAL
    assert src.rate_limit.delay_seconds == 0.5

    # Domain allowlist check
    assert src.is_domain_allowed("https://test-mfg.com/products/bolt-m6")
    assert src.is_domain_allowed("https://cdn.test-mfg.com/datasheet.pdf")
    assert not src.is_domain_allowed("https://unauthorized-domain.com/item")


def test_source_registry_validation():
    with pytest.raises(Exception):
        # Empty domains list should fail validation
        SourceConfig(
            id="bad-source",
            name="Bad Source",
            domains=[],
            start_urls=["https://bad.com"],
        )


# =====================================================================
# 2. URL Canonicalization Tests
# =====================================================================

def test_url_canonicalization():
    # 1. Strips tracking params & anchors
    dirty = "HTTPS://Example.COM:443/products/widget/?utm_source=google&utm_campaign=spring#specs"
    clean = canonicalize_url(dirty)
    assert clean == "https://example.com/products/widget"

    # 2. Preserves meaningful query params (e.g., page, sku, id)
    page_url = "https://example.com/catalog?page=2&ref=banner"
    assert canonicalize_url(page_url) == "https://example.com/catalog?page=2"

    # 3. Strips trailing slash on non-root paths
    slash_url = "https://example.com/items/bolts/"
    assert canonicalize_url(slash_url) == "https://example.com/items/bolts"


# =====================================================================
# 3. Robots.txt Compliance Tests
# =====================================================================

def test_robots_txt_compliance():
    policy = CrawlPolicyManager(user_agent="AnanyaBot/1.0")
    robots_content = """
User-agent: *
Disallow: /admin/
Allow: /private/public-doc.pdf
Disallow: /private/

User-agent: AnanyaBot
Disallow: /admin/
Disallow: /restricted/
"""
    policy.set_robots_txt("example.com", robots_content)

    # Allowed paths
    assert policy.is_allowed("https://example.com/products/widget")

    # Blocked paths
    assert not policy.is_allowed("https://example.com/admin/login")
    assert not policy.is_allowed("https://example.com/restricted/internal")

    # Generic bot tests wildcard section
    generic_policy = CrawlPolicyManager(user_agent="GenericBot/1.0")
    generic_policy.set_robots_txt("example.com", robots_content)
    assert not generic_policy.is_allowed("https://example.com/private/secret")
    assert generic_policy.is_allowed("https://example.com/private/public-doc.pdf")


# =====================================================================
# 4. Rate Limiting & Retry-After Handling
# =====================================================================

def test_rate_limiting_and_retry_after():
    policy = CrawlPolicyManager(default_delay=0.05)

    # Respects Retry-After header
    policy.record_retry_after("slow-site.com", retry_after_seconds=60)
    assert not policy.can_crawl_now("https://slow-site.com/item")

    # Other domains remain unaffected
    assert policy.can_crawl_now("https://other-site.com/item")

    # Custom rate limit overrides configured default delay
    custom_policy = CrawlPolicyManager(custom_rate_limit=10.0)  # 0.1s delay
    assert custom_policy.has_custom_rate_limit
    assert abs(custom_policy.default_delay - 0.1) < 1e-5


# =====================================================================
# 5. Downloader Caching & Conditional Requests (ETag / 304)
# =====================================================================

def test_downloader_conditional_requests_and_caching(tmp_path: Path):
    storage_dir = tmp_path / "raw"
    downloader = ResilientDownloader(raw_storage_base=str(storage_dir))

    # Mock HTTP client
    mock_client = MagicMock()

    # 1. First download: returns 200 OK with ETag
    content = b"<html><title>Product X</title></html>"
    mock_resp1 = MagicMock()
    mock_resp1.status_code = 200
    mock_resp1.content = content
    mock_resp1.headers = {
        "content-type": "text/html",
        "etag": '"abc123etag"',
        "last-modified": "Wed, 21 Oct 2025 07:28:00 GMT",
    }
    mock_client.get.return_value = mock_resp1

    res1 = downloader.download(
        "https://example.com/prod1",
        source_id="test-src",
        client=mock_client,
    )
    assert res1.status_code == 200
    assert not res1.is_cached
    assert res1.etag == '"abc123etag"'
    assert res1.saved_path is not None
    assert Path(res1.saved_path).exists()

    # 2. Second download with cached ETag: server returns 304 Not Modified
    mock_resp2 = MagicMock()
    mock_resp2.status_code = 304
    mock_resp2.content = b""
    mock_resp2.headers = {"etag": '"abc123etag"'}
    mock_client.get.return_value = mock_resp2

    res2 = downloader.download(
        "https://example.com/prod1",
        source_id="test-src",
        client=mock_client,
        cached_etag=res1.etag,
        cached_hash=res1.content_hash,
    )
    assert res2.status_code == 304
    assert res2.is_cached is True
    assert res2.content_hash == res1.content_hash


# =====================================================================
# 6. Content Hashing & Size Limits
# =====================================================================

def test_downloader_file_size_limit(tmp_path: Path):
    downloader = ResilientDownloader(
        raw_storage_base=str(tmp_path / "raw"),
        max_file_size_bytes=100,  # 100 bytes limit
    )
    mock_client = MagicMock()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.content = b"X" * 200  # Exceeds 100 bytes
    mock_resp.headers = {"content-type": "application/octet-stream"}
    mock_client.get.return_value = mock_resp

    res = downloader.download(
        "https://example.com/large-file.bin",
        source_id="test-src",
        client=mock_client,
    )
    assert res.error is not None
    assert "exceeds" in res.error.lower()


# =====================================================================
# 7. Sitemap Discovery Tests
# =====================================================================

def test_sitemap_parsing():
    source = SourceConfig(
        id="sitemap-src",
        name="Sitemap Source",
        domains=["example.com"],
        start_urls=["https://example.com"],
    )
    discovery = DiscoveryEngine(source)

    xml_sitemap = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
   <url>
      <loc>https://example.com/products/screw-m4</loc>
   </url>
   <url>
      <loc>https://example.com/products/bearing-608</loc>
   </url>
</urlset>
"""
    urls, nested = discovery.parse_sitemap(xml_sitemap, "https://example.com/sitemap.xml")
    assert len(urls) == 2
    assert "https://example.com/products/screw-m4" in urls
    assert "https://example.com/products/bearing-608" in urls
    assert len(nested) == 0

    # Sitemap index test
    xml_index = """<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
   <sitemap>
      <loc>https://example.com/sitemap-catalog.xml</loc>
   </sitemap>
</sitemapindex>
"""
    urls, nested = discovery.parse_sitemap(xml_index, "https://example.com/sitemap.xml")
    assert len(nested) == 1
    assert "https://example.com/sitemap-catalog.xml" in nested


# =====================================================================
# 8. Pagination & Link Discovery Tests
# =====================================================================

def test_pagination_and_link_discovery():
    source = SourceConfig(
        id="page-src",
        name="Page Source",
        domains=["example.com"],
        start_urls=["https://example.com/catalog"],
    )
    discovery = DiscoveryEngine(source)

    html = """
    <html>
      <body>
        <div class="product-list">
          <a href="/products/resistor-10k">10k Resistor</a>
          <a href="/datasheets/resistor-10k.pdf">Datasheet PDF</a>
          <a href="https://external.com/ad">Ad</a>
        </div>
        <div class="pagination">
          <a rel="next" href="/catalog?page=2">Next Page</a>
        </div>
      </body>
    </html>
    """
    nav_links, doc_links = discovery.extract_links_from_html(html, "https://example.com/catalog")
    assert "https://example.com/products/resistor-10k" in nav_links
    assert "https://example.com/datasheets/resistor-10k.pdf" in doc_links
    # External ad should NOT be in nav_links
    assert "https://external.com/ad" not in nav_links

    # Detect pagination next
    next_page = discovery.detect_pagination_next(html, "https://example.com/catalog")
    assert next_page == "https://example.com/catalog?page=2"


# =====================================================================
# 9. HTML Extraction (JSON-LD, OpenGraph, Specs, Breadcrumbs)
# =====================================================================

def test_html_extraction():
    source = SourceConfig(
        id="mfg-src",
        name="Acme Fasteners",
        domains=["acme-fasteners.com"],
        start_urls=["https://acme-fasteners.com"],
        default_domain="fasteners",
        source_quality=SourceQuality.AUTHORITATIVE_MANUFACTURER,
    )
    extractor = ContentExtractor(source)

    html = """
    <!DOCTYPE html>
    <html>
      <head>
        <title>M8 Socket Head Cap Screw - Acme Fasteners</title>
        <meta property="og:description" content="High tensile zinc-plated steel cap screw M8 x 20mm.">
        <script type="application/ld+json">
        {
          "@context": "https://schema.org/",
          "@type": "Product",
          "name": "M8x20mm Socket Head Cap Screw",
          "sku": "ACME-SHCS-M8-20",
          "mpn": "SHCS-M8-20",
          "brand": {
            "@type": "Brand",
            "name": "Acme Fasteners"
          },
          "category": "Fasteners > Screws > Socket Screws"
        }
        </script>
      </head>
      <body>
        <nav aria-label="breadcrumb">
          <ol>
            <li><a href="/">Home</a></li>
            <li><a href="/fasteners">Fasteners</a></li>
            <li><span>Socket Screws</span></li>
          </ol>
        </nav>
        <table class="specs">
          <tr><th>Thread Size</th><td>M8</td></tr>
          <tr><th>Length</th><td>20mm</td></tr>
          <tr><th>Material</th><td>Steel Zinc Plated</td></tr>
        </table>
      </body>
    </html>
    """

    records = extractor.extract_from_html(
        html,
        "https://acme-fasteners.com/products/shcs-m8-20",
        content_hash="mocksha256hash123",
    )
    assert len(records) >= 1
    rec = records[0]
    assert rec.sku == "ACME-SHCS-M8-20"
    assert rec.mpn == "SHCS-M8-20"
    assert rec.manufacturer == "Acme Fasteners"
    assert rec.domain == ProductDomain.FASTENERS
    assert rec.category == "Fasteners > Screws > Socket Screws"
    assert rec.attributes["thread_size"].value == "M8"
    assert rec.attributes["length"].value == "20mm"
    assert rec.provenance.source == "mfg-src"
    assert rec.provenance.source_id == "ACME-SHCS-M8-20"
    assert rec.provenance.content_hash == "mocksha256hash123"
    assert rec.provenance.source_quality == SourceQuality.AUTHORITATIVE_MANUFACTURER


# =====================================================================
# 10. PDF Extraction & Provenance Preservation
# =====================================================================

def test_pdf_extraction_and_provenance():
    source = SourceConfig(
        id="pdf-src",
        name="Tech Docs",
        domains=["docs.example.com"],
        start_urls=["https://docs.example.com"],
        default_domain="electrical",
    )
    extractor = ContentExtractor(source)

    # Mock pypdf reader extracting technical specs
    sample_text = """
    Technical Data Sheet
    Model: CIR-BRK-16A
    Part Number: MPN-CB16-240V
    Manufacturer: PowerTech
    Voltage: 240V AC
    Current Rating: 16A
    Breaking Capacity: 6kA
    """

    with patch("pypdf.PdfReader") as mock_pdf_reader:
        mock_page = MagicMock()
        mock_page.extract_text.return_value = sample_text
        mock_instance = MagicMock()
        mock_instance.pages = [mock_page]
        mock_instance.metadata = {"/Title": "PowerTech Circuit Breaker Datasheet"}
        mock_pdf_reader.return_value = mock_instance

        record = extractor.extract_from_pdf(
            b"%PDF-1.4 mock data",
            "https://docs.example.com/datasheets/cir-brk-16a.pdf",
            content_hash="pdfhash456",
        )

        assert record is not None
        assert record.mpn in ("CIR-BRK-16A", "MPN-CB16-240V")
        assert record.domain == ProductDomain.ELECTRICAL
        assert record.provenance.content_type == "application/pdf"
        assert record.provenance.content_hash == "pdfhash456"
        assert record.provenance.source_url == "https://docs.example.com/datasheets/cir-brk-16a.pdf"


# =====================================================================
# 11. Acquisition Store & Resume Behavior
# =====================================================================

def test_acquisition_store_persistence(tmp_path: Path):
    meta_dir = tmp_path / "metadata"
    store = AcquisitionStore(metadata_dir=str(meta_dir))

    store.record_discovered("https://example.com/p1", "https://example.com/p1?ref=1", "test-src")
    store.record_downloaded(
        canonical_url="https://example.com/p1",
        http_status=200,
        content_hash="hash_p1",
        content_type="text/html",
        content_length=1200,
        etag='"etag1"',
        last_modified="Mon, 1 Jan 2026 00:00:00 GMT",
        local_path=str(tmp_path / "raw/web/test-src/p1.html"),
    )
    store.record_processed("https://example.com/p1", "html_extractor")
    store.save()

    # Re-open from disk and test resume
    store2 = AcquisitionStore(metadata_dir=str(meta_dir))
    rec = store2.get_record("https://example.com/p1")
    assert rec is not None
    assert rec.content_hash == "hash_p1"
    assert rec.etag == '"etag1"'
    assert rec.processing_status == "PROCESSED"
    assert rec.parser == "html_extractor"


# =====================================================================
# 12. Failure Isolation (Faulty HTTP does not abort collection)
# =====================================================================

def test_failure_isolation(tmp_path: Path):
    yaml_content = """
sources:
  - id: robust-test
    name: Robustness Test Source
    domains:
      - example.com
    start_urls:
      - https://example.com/broken-page
      - https://example.com/good-page
"""
    cfg_file = tmp_path / "sources.yaml"
    cfg_file.write_text(yaml_content, encoding="utf-8")

    collector = AutonomousWebCollector(
        registry_path=str(cfg_file),
        raw_storage_base=str(tmp_path / "raw"),
    )

    mock_client = MagicMock()

    def mock_get(url, **kwargs):
        resp = MagicMock()
        if "broken-page" in url:
            resp.status_code = 500
            resp.content = b"Internal Server Error"
            resp.text = "Internal Server Error"
            resp.headers = {"content-type": "text/html"}
        elif "robots.txt" in url:
            resp.status_code = 200
            resp.content = b"User-agent: *\nAllow: /\n"
            resp.text = "User-agent: *\nAllow: /\n"
            resp.headers = {"content-type": "text/plain"}
        else:
            resp.status_code = 200
            resp.content = b"<html><title>Good Product</title></html>"
            resp.text = "<html><title>Good Product</title></html>"
            resp.headers = {"content-type": "text/html"}
        return resp

    mock_client.get.side_effect = mock_get

    records = collector.collect(
        source_id="robust-test",
        client=mock_client,
        auto_process=False,
    )
    assert collector.last_stats["failed"] == 1
    assert collector.last_stats["downloaded"] == 1
    # Collection did NOT crash and successfully acquired good-page


def test_downloader_remote_protocol_error_resilience(tmp_path: Path):
    storage_dir = tmp_path / "raw"
    downloader = ResilientDownloader(raw_storage_base=str(storage_dir), max_retries=2)

    mock_client = MagicMock()
    # Simulate peer closing connection mid-transfer
    mock_client.get.side_effect = httpx.RemoteProtocolError("peer closed connection without sending complete message body")

    res = downloader.download(
        "https://example.com/huge-broken.pdf",
        source_id="test-src",
        client=mock_client,
        rate_limit_delay=0.01,
    )

    assert res is not None
    assert res.status_code == 599
    assert "NETWORK_ERROR" in res.error or "RemoteProtocolError" in res.error
    assert res.saved_path is None


# =====================================================================
# 13. End-to-End Autonomous Pipeline & Incremental Dataset Versioning
# =====================================================================

def test_autonomous_collection_pipeline_versioning(tmp_path: Path):
    yaml_content = """
sources:
  - id: e2e-mfg
    name: E2E Fastener Mfg
    domains:
      - e2e-fasteners.com
    start_urls:
      - https://e2e-fasteners.com/item1
    default_domain: fasteners
"""
    cfg_file = tmp_path / "sources.yaml"
    cfg_file.write_text(yaml_content, encoding="utf-8")

    collector = AutonomousWebCollector(
        registry_path=str(cfg_file),
        raw_storage_base=str(tmp_path / "raw"),
    )

    # Mock response returning complete structured product
    mock_html = """
    <html>
      <head>
        <title>M10 Flange Nut</title>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org/",
          "@type": "Product",
          "name": "M10 Serrated Flange Nut",
          "sku": "E2E-NUT-M10",
          "mpn": "NUT-M10-FLG",
          "brand": {"@type": "Brand", "name": "E2E Fasteners"},
          "category": "Fasteners > Nuts > Flange Nuts"
        }
        </script>
      </head>
      <body></body>
    </html>
    """
    mock_client = MagicMock()
    def mock_resp_fn(url, **kwargs):
        resp = MagicMock()
        if "robots.txt" in url:
            resp.status_code = 200
            resp.content = b"User-agent: *\nAllow: /\n"
            resp.text = "User-agent: *\nAllow: /\n"
            resp.headers = {"content-type": "text/plain"}
        else:
            resp.status_code = 200
            resp.content = mock_html.encode("utf-8")
            resp.text = mock_html
            resp.headers = {"content-type": "text/html"}
        return resp
    mock_client.get.side_effect = mock_resp_fn

    records = collector.collect(
        source_id="e2e-mfg",
        client=mock_client,
        auto_process=True,
    )

    assert len(records) == 1
    assert records[0].sku == "E2E-NUT-M10"
    assert collector.last_stats["products_extracted"] == 1


# =====================================================================
# 14. CLI Commands (collect and data-collect)
# =====================================================================

def test_cli_collect_dry_run_and_subparser():
    parser = build_parser()

    # Test "collect --dry-run --source test"
    args = parser.parse_args(["collect", "--dry-run", "--source", "sample-mfg"])
    assert args.command == "collect"
    assert args.dry_run is True
    assert args.source == "sample-mfg"

    # Test "data-collect --all --resume"
    args2 = parser.parse_args(["data-collect", "--all", "--resume", "--workers", "2"])
    assert args2.command == "data-collect"
    assert args2.all is True
    assert args2.resume is True
    assert args2.workers == 2


# =====================================================================
# 15. Discovery Pipeline & Sitemap Index Recursion Regression Tests
# =====================================================================

def test_sitemap_index_recursion_and_pdf_discovery():
    """Verifies that sitemap index files are recursively followed and PDFs discovered."""
    src = SourceConfig(
        id="test-recursive",
        name="Recursive Mfg",
        type="manufacturer",
        quality="distributor",
        domains=["recursive-mfg.com"],
        start_urls=["https://recursive-mfg.com/sitemap-index.xml"],
    )
    discovery = DiscoveryEngine(src)

    index_xml = """<?xml version="1.0" encoding="UTF-8"?>
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap>
        <loc>https://recursive-mfg.com/sitemap-products.xml</loc>
      </sitemap>
      <sitemap>
        <loc>https://recursive-mfg.com/sitemap-pdf.xml</loc>
      </sitemap>
    </sitemapindex>
    """
    products_xml = """<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://recursive-mfg.com/products/widget-1</loc></url>
      <url><loc>https://recursive-mfg.com/products/widget-2</loc></url>
    </urlset>
    """
    pdf_xml = """<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://recursive-mfg.com/datasheets/widget-1.pdf</loc></url>
      <url><loc>https://recursive-mfg.com/datasheets/widget-2.pdf</loc></url>
    </urlset>
    """

    mock_client = MagicMock()
    def mock_get(url, **kwargs):
        resp = MagicMock()
        resp.status_code = 200
        if "sitemap-index.xml" in url:
            resp.text = index_xml
            resp.content = index_xml.encode("utf-8")
        elif "sitemap-products.xml" in url:
            resp.text = products_xml
            resp.content = products_xml.encode("utf-8")
        elif "sitemap-pdf.xml" in url:
            resp.text = pdf_xml
            resp.content = pdf_xml.encode("utf-8")
        else:
            resp.status_code = 404
        return resp
    mock_client.get.side_effect = mock_get

    res = discovery.discover(client=mock_client)
    assert res.report.sitemaps_found == 3  # index + 2 child sitemaps
    assert res.report.sitemaps_parsed == 3
    assert res.report.urls_in_sitemaps == 4
    assert res.report.product_urls == 2
    assert res.report.document_urls == 2
    assert len(res.page_queue) == 2
    assert len(res.doc_queue) == 2
    assert "https://recursive-mfg.com/datasheets/widget-1.pdf" in res.doc_queue


def test_large_sitemap_parsing_with_multiple_namespaces():
    """Verifies parsing of sitemaps with complex namespaces and schema locations."""
    src = SourceConfig(
        id="ns-test",
        name="Namespace Test",
        type="manufacturer",
        quality="distributor",
        domains=["we-online.com"],
        start_urls=[],
    )
    discovery = DiscoveryEngine(src)

    complex_xml = """<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
            xmlns:xhtml="http://www.w3.org/1999/xhtml"
            xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
            xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
      <url>
        <loc>https://we-online.com/en/components/products/74404052100</loc>
      </url>
      <url>
        <loc>https://we-online.com/katalog_download/pdf/74404052100.pdf</loc>
      </url>
      <url>
        <loc>https://outside-domain.com/unallowed.pdf</loc>
      </url>
    </urlset>
    """
    discovered, nested = discovery.parse_sitemap(complex_xml, "https://we-online.com/sitemap.xml")
    assert len(discovered) == 2  # outside domain filtered out
    assert "https://we-online.com/en/components/products/74404052100" in discovered
    assert "https://we-online.com/katalog_download/pdf/74404052100.pdf" in discovered


def test_discovery_vs_processing_limits_separation(tmp_path: Path):
    """
    Verifies that --max-pages and --max-files limit processing only,
    without truncating the discovery space, and that PDFs are not starved by HTML pages.
    """
    cfg_content = """
sources:
  - id: sep-test
    name: Separation Test
    type: manufacturer
    quality: distributor
    enabled: true
    domains:
      - sep-test.com
    start_urls:
      - https://sep-test.com/sitemap.xml
    max_pages: 5
    max_files: 2
    default_domain: mechanical
"""
    cfg_file = tmp_path / "sources.yaml"
    cfg_file.write_text(cfg_content, encoding="utf-8")

    collector = AutonomousWebCollector(
        registry_path=str(cfg_file),
        raw_storage_base=str(tmp_path / "raw"),
    )

    # 10 product pages + 10 PDF pages
    urls_xml = "".join(f"<url><loc>https://sep-test.com/products/item-{i}</loc></url>" for i in range(10))
    urls_xml += "".join(f"<url><loc>https://sep-test.com/datasheets/doc-{i}.pdf</loc></url>" for i in range(10))
    sitemap_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      {urls_xml}
    </urlset>
    """

    mock_client = MagicMock()
    def mock_get(url, **kwargs):
        resp = MagicMock()
        resp.status_code = 200
        if "sitemap.xml" in url:
            resp.text = sitemap_xml
            resp.content = sitemap_xml.encode("utf-8")
        elif url.endswith(".pdf"):
            resp.text = ""
            resp.content = b"%PDF-1.4 minimal content"
            resp.headers = {"content-type": "application/pdf"}
        else:
            resp.text = "<html><body><h1>Sample Product</h1></body></html>"
            resp.content = resp.text.encode("utf-8")
            resp.headers = {"content-type": "text/html"}
        return resp
    mock_client.get.side_effect = mock_get

    # Run with max_pages=3, max_files=2
    collector.collect(
        source_id="sep-test",
        max_pages=3,
        max_files=2,
        client=mock_client,
        auto_process=False,
    )

    stats = collector.last_stats
    # Total discovery saw all 20 URLs
    assert stats["urls_discovered"] == 20
    # Processed exactly 3 HTML pages and 2 PDF files
    assert stats["downloaded"] == 5
    assert stats["pdfs"] == 2


def test_discovery_report_structured_counters():
    """Verifies that DiscoveryReport populates and formats all requested counters."""
    from apps.ml.training.collectors.web.discovery import DiscoveryReport

    rep = DiscoveryReport(
        source_id="wuerth-elektronik",
        sitemaps_found=3,
        sitemaps_parsed=3,
        urls_in_sitemaps=12481,
        product_urls=8932,
        document_urls=2104,
        other_urls=1445,
        rejected_outside_domain=23,
        rejected_robots=17,
        rejected_duplicate=1102,
        rejected_invalid=4,
        skipped_cached=200,
        final_crawl_queue=9690,
    )
    formatted = rep.format_report()
    assert "DISCOVERY REPORT" in formatted
    assert "Source: wuerth-elektronik" in formatted
    assert "Found:             3" in formatted
    assert "URLs in sitemaps:  12,481" in formatted
    assert "Product URLs:       8,932" in formatted
    assert "Document URLs:      2,104" in formatted
    assert "Outside domain:     23" in formatted
    assert "Robots:             17" in formatted
    assert "Final crawl queue:   9,690" in formatted


def test_robots_txt_sitemap_auto_discovery():
    """Verifies that sitemaps declared in robots.txt are extracted and discovered."""
    policy = CrawlPolicyManager()
    robots_body = """
    User-agent: *
    Disallow: /admin/
    Sitemap: https://test-domain.com/declared-sitemap.xml
    """
    policy.set_robots_txt("test-domain.com", robots_body)
    sitemaps = policy.get_sitemaps("test-domain.com")
    assert sitemaps == ["https://test-domain.com/declared-sitemap.xml"]


def test_robots_txt_fetch_timeout_handling(monkeypatch):
    """Regression test: robots.txt network timeouts must not hang the crawler."""
    policy = CrawlPolicyManager()

    def mock_httpx_get(*args, **kwargs):
        raise httpx.ReadTimeout("Simulated read timeout on tarpit host")

    with monkeypatch.context() as m:
        m.setattr(httpx.Client, "get", mock_httpx_get)
        policy.fetch_robots_txt("slow-hanging-domain.com", client=None)

    # Should not raise exception and should fallback safely
    assert policy.is_allowed("https://slow-hanging-domain.com/item1") is True



def test_cross_source_analyzer():
    """Verifies that CrossSourceAnalyzer accurately identifies cross-source matches and variants."""
    from apps.ml.training.processors.cross_source import CrossSourceAnalyzer
    from apps.ml.training.schemas.product import ProductRecord, ProvenanceRecord, AttributeValueRecord

    r1 = ProductRecord(
        sku="DIST1-74404052100",
        name="Würth 10uH SMD Inductor",
        manufacturer="Wuerth Elektronik",
        mpn="74404052100-TR",
        category="Inductors",
        attributes={"inductance": AttributeValueRecord(code="inductance", value="10uH", raw_value="10uH", normalized_si=1e-5, unit="H")},
        provenance=ProvenanceRecord(source="dist1", source_type="distributor_feed", source_id="distributor-1", source_url="https://dist1.com/p1"),
    )
    r2 = ProductRecord(
        sku="DIST2-WE-74404052100",
        name="WE SMD Power Choke",
        manufacturer="Würth Elektronik",
        mpn="74404052100",
        category="Power Inductors",
        attributes={"inductance": AttributeValueRecord(code="inductance", value="0.01mH", raw_value="0.01mH", normalized_si=1e-5, unit="H")},
        provenance=ProvenanceRecord(source="dist2", source_type="distributor_feed", source_id="distributor-2", source_url="https://dist2.com/p2"),
    )

    analyzer = CrossSourceAnalyzer([r1, r2])
    report = analyzer.analyze()

    assert report["sources_analyzed"] == 2
    assert report["total_records"] == 2
    assert report["packaging_suffix_variants_count"] >= 1
    assert report["manufacturer_aliases_count"] >= 1
    assert report["product_family_variants_count"] >= 1


def test_source_health_tracking(tmp_path: Path):
    """Verifies that AutonomousWebCollector tracks source health statuses."""
    from apps.ml.training.collectors.web_collector import AutonomousWebCollector

    yaml_content = """
    sources:
      - id: src-enabled
        name: Enabled Source
        domains:
          - enabled.com
        start_urls:
          - https://enabled.com/items
        enabled: true
      - id: src-disabled
        name: Disabled Source
        domains:
          - disabled.com
        start_urls:
          - https://disabled.com/items
        enabled: false
    """
    cfg_file = tmp_path / "sources.yaml"
    cfg_file.write_text(yaml_content, encoding="utf-8")

    collector = AutonomousWebCollector(registry_path=str(cfg_file), raw_storage_base=str(tmp_path / "raw"))
    mock_client = MagicMock()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = "<html><body></body></html>"
    mock_resp.content = b"<html><body></body></html>"
    mock_resp.headers = {"content-type": "text/html"}
    mock_client.get.return_value = mock_resp

    collector.collect(dry_run=True, client=mock_client)

    assert "src-disabled" in collector.source_health
    assert collector.source_health["src-disabled"]["status"] == "SKIPPED"
    assert "src-enabled" in collector.source_health


# =====================================================================
# 18. Non-Product Filtering & Entity Extraction Integrity Tests
# =====================================================================

def test_non_product_urls_and_pages_filtered():
    source = SourceConfig(
        id="test-src",
        name="Test Manufacturer",
        domains=["example.com"],
        start_urls=["https://example.com"],
    )
    extractor = ContentExtractor(source)

    # 1. Non-product URLs (login, imprint, privacy, press)
    non_prod_urls = [
        "https://example.com/components/login",
        "https://example.com/service/contact",
        "https://example.com/service/imprint",
        "https://example.com/service/data-privacy",
        "https://example.com/user-profile",
        "https://example.com/dashboard",
        "https://example.com/press/press-releases",
        "https://example.com/news/article/123",
        "https://example.com/cart",
    ]
    for url in non_prod_urls:
        html = f"<html><head><title>Page</title></head><body><h1>Content</h1></body></html>"
        records = extractor.extract_from_html(html, url, "hash123")
        assert len(records) == 0, f"Expected 0 records for non-product URL {url}, got {len(records)}"

    # 2. Browser unsupported SPA fallback
    spa_html = "<html><head><title>Brand</title></head><body><h1>This browser is not supported</h1></body></html>"
    records = extractor.extract_from_html(spa_html, "https://example.com/products/item-1", "hash456")
    assert len(records) == 0

    # 3. Category overview page without MPN or attributes
    cat_html = """
    <html>
      <head><title>Connectors - Components</title></head>
      <body>
        <h1>Connectors</h1>
        <p>Browse our extensive selection of connectors for all applications.</p>
      </body>
    </html>
    """
    records = extractor.extract_from_html(cat_html, "https://example.com/components/connectors.html", "hash789")
    assert len(records) == 0


def test_legitimate_product_with_general_category_preserved():
    source = SourceConfig(
        id="sparkfun",
        name="SparkFun Electronics",
        domains=["sparkfun.com"],
        start_urls=["https://sparkfun.com"],
    )
    extractor = ContentExtractor(source)

    # Legitimate product with category="General" (SparkFun Passive PoE Cable Set)
    poe_html = """
    <html>
      <head>
        <title>Passive PoE Cable Set - SparkFun Electronics</title>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Passive PoE Cable Set",
          "sku": "CAB-10759",
          "mpn": "CAB-10759",
          "category": "General",
          "offers": [{"@type": "Offer", "price": 5.95, "priceCurrency": "USD"}]
        }
        </script>
      </head>
      <body><h1>Passive PoE Cable Set</h1></body>
    </html>
    """
    records = extractor.extract_from_html(poe_html, "https://sparkfun.com/passive-poe-cable-set.html", "poehash")
    assert len(records) == 1
    prod = records[0]
    assert prod.mpn == "CAB-10759"
    assert prod.sku == "CAB-10759"
    assert prod.name == "Passive PoE Cable Set"
    assert prod.category == "General"

    # Verify DataValidationProcessor accepts legitimate products with "General" category
    from apps.ml.training.processors.validation import DataValidationProcessor, ProcessingDisposition
    val_proc = DataValidationProcessor()
    _, audit = val_proc.process(prod)
    assert audit.disposition == ProcessingDisposition.ACCEPTED, f"Legitimate product was not accepted: {audit.reasons}"


def test_adafruit_json_ld_integer_sku_extraction():
    source = SourceConfig(
        id="adafruit",
        name="Adafruit Industries",
        domains=["adafruit.com"],
        start_urls=["https://adafruit.com"],
    )
    extractor = ContentExtractor(source)

    # Adafruit provides SKU as integer: "sku": 240
    ada_html = """
    <html>
      <head>
        <title>Bulbdial Clock kit : Adafruit Industries</title>
        <script type="application/ld+json">
        {
          "@context": "http://schema.org",
          "@type": "Product",
          "name": "Bulbdial Clock kit",
          "sku": 240,
          "description": "Unique indoor sundial clock kit"
        }
        </script>
      </head>
      <body><h1>Bulbdial Clock kit</h1></body>
    </html>
    """
    records = extractor.extract_from_html(ada_html, "https://adafruit.com/product/240", "adahash")
    assert len(records) == 1
    prod = records[0]
    assert prod.sku == "240"
    assert prod.mpn == "240"
    assert prod.name == "Bulbdial Clock kit"
    assert prod.provenance.source_id == "240"
    assert prod.provenance.verification_method == "json_ld_schema"


def test_oshwa_hardware_extraction():
    source = SourceConfig(
        id="oshwa",
        name="OSHWA Hardware Registry",
        domains=["certification.oshwa.org"],
        start_urls=["https://certification.oshwa.org"],
    )
    extractor = ContentExtractor(source)

    oshwa_html = """
    <!DOCTYPE html><html><head><title>US000399</title></head><body>
      <div class="heading-container"><h1>DS2413 1-Wire Two GPIO Controller Breakout</h1></div>
      <div><h2>Adafruit Industries, LLC <a href="mailto:oshw@adafruit.com">mail</a></h2></div>
      <h3>OSHWA UID</h3><span class="id">US000399</span>
      <div type-tag="electronics" class="project__type">Electronics</div>
      <h3>Version</h3><span class="version">Rev A</span>
      <h3 class="info-title">Country</h3><p class="info-data">United States of America</p>
    </body></html>
    """
    records = extractor.extract_from_html(oshwa_html, "https://certification.oshwa.org/us000399.html", "oshwahash")
    assert len(records) == 1
    prod = records[0]
    assert prod.sku == "US000399"
    assert prod.mpn == "US000399"
    assert prod.name == "DS2413 1-Wire Two GPIO Controller Breakout"
    assert prod.manufacturer == "Adafruit Industries, LLC"
    assert prod.category == "Electronics"
    assert prod.domain == ProductDomain.ELECTRONICS
    assert prod.provenance.verification_method == "oshwa_cert_parser"
    assert prod.attributes["version"].value == "Rev A"
    assert prod.attributes["country"].value == "United States of America"


def test_non_product_pdf_discarded():
    source = SourceConfig(
        id="mfg-pdf",
        name="Mfg PDF Docs",
        domains=["mfg.com"],
        start_urls=["https://mfg.com"],
    )
    extractor = ContentExtractor(source)

    # Compliance statement (RoHS declaration) with no genuine MPN
    record = extractor.build_pdf_record(
        combined_text="EU RoHS Conformity Declaration. Requirements max 0.1% lead.",
        title="Statement RoHS EU-Guideline",
        url="https://mfg.com/downloads/rohs-conformity.pdf",
        content_hash="rohshash",
    )
    assert record is None, "RoHS conformity statement should be discarded"

    # General marketing flyer with no genuine MPN and no attributes
    flyer_record = extractor.build_pdf_record(
        combined_text="Explore our complete component portfolio across all applications.",
        title="Solutions Antenna Matching Flyer",
        url="https://mfg.com/files/flyer-antenna-matching-en.pdf",
        content_hash="flyerhash",
    )
    assert flyer_record is None, "Marketing flyer with no MPN should be discarded"


def test_cli_from_raw_flag():
    parser = build_parser()
    args = parser.parse_args(["collect", "--from-raw", "--source", "sparkfun"])
    assert args.from_raw is True
    assert args.source == "sparkfun"


# =====================================================================
# 18. Product vs Document Separation & Taxonomy Fallback Tests
# =====================================================================

def test_json_ld_product_without_category_gets_category_from_breadcrumbs():
    source = SourceConfig(
        id="sparkfun",
        name="SparkFun Electronics",
        domains=["sparkfun.com"],
        start_urls=["https://sparkfun.com"],
    )
    extractor = ContentExtractor(source)

    html_content = """
    <html>
      <head>
        <title>SMD Resistor 10k - SparkFun Electronics</title>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "SMD Resistor 10k",
          "sku": "RES-10001",
          "mpn": "RES-10001"
        }
        </script>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://sparkfun.com"},
            {"@type": "ListItem", "position": 2, "name": "Components", "item": "https://sparkfun.com/components"},
            {"@type": "ListItem", "position": 3, "name": "Resistors", "item": "https://sparkfun.com/resistors"}
          ]
        }
        </script>
      </head>
      <body><h1>SMD Resistor 10k</h1></body>
    </html>
    """
    records = extractor.extract_from_html(html_content, "https://sparkfun.com/res-10001.html", "res10001hash")
    assert len(records) == 1
    prod = records[0]
    assert prod.entity_type == EntityType.PRODUCT
    assert prod.category == "Resistors"
    assert "Resistors" in (prod.raw_category or "")


def test_product_without_any_category_becomes_uncategorized_not_general():
    source = SourceConfig(
        id="generic-mfg",
        name="Generic Mfg",
        domains=["generic.com"],
        start_urls=["https://generic.com"],
    )
    extractor = ContentExtractor(source)

    # Product with no category anywhere (no Schema.org category, no breadcrumbs, no URL hint)
    html_content = """
    <html>
      <head>
        <title>Special Precision Widget - Generic Mfg</title>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Special Precision Widget",
          "sku": "WID-999",
          "mpn": "WID-999"
        }
        </script>
      </head>
      <body><h1>Special Precision Widget</h1></body>
    </html>
    """
    records = extractor.extract_from_html(html_content, "https://generic.com/item.html", "widhash")
    assert len(records) == 1
    prod = records[0]
    assert prod.entity_type == EntityType.PRODUCT
    assert prod.category == "Uncategorized"
    assert prod.category != "General"


def test_pdf_fallback_becomes_document_entity_type():
    source = SourceConfig(
        id="mfg-pdf",
        name="Mfg PDF Docs",
        domains=["mfg.com"],
        start_urls=["https://mfg.com"],
    )
    extractor = ContentExtractor(source)

    # Technical document (Application Note / Datasheet)
    record = extractor.build_pdf_record(
        combined_text="Application Note AN-102: Thermal design for high power converters. Operating temperature -40C to 125C. Package SOIC-8.",
        title="Application Note AN-102 High Power",
        url="https://mfg.com/docs/an-102.pdf",
        content_hash="an102hash",
    )
    assert record is not None
    assert record.entity_type == EntityType.DOCUMENT
    assert record.document_type == DocumentType.APPLICATION_NOTE
    assert record.category != "Technical Documentation"
    assert record.category in ("Uncategorized", "ICs & Semiconductors", "Power Management")


def test_non_product_pages_not_synthetic_products():
    source = SourceConfig(
        id="sparkfun",
        name="SparkFun Electronics",
        domains=["sparkfun.com"],
        start_urls=["https://sparkfun.com"],
    )
    extractor = ContentExtractor(source)

    # FAQ page
    faq_html = "<html><head><title>Frequently Asked Questions (FAQ) - SparkFun</title></head><body><h1>FAQ</h1></body></html>"
    faq_records = extractor.extract_from_html(faq_html, "https://sparkfun.com/pages/faq", "faqhash")
    assert len(faq_records) == 0

    # Non-UID certification page
    cert_html = "<html><head><title>OSHWA Certification Directory</title></head><body><h1>Directory</h1></body></html>"
    cert_records = extractor.extract_from_html(cert_html, "https://certification.oshwa.org/directory.html", "certhash")
    assert len(cert_records) == 0

    # Careers page
    career_html = "<html><head><title>Careers at Adafruit</title></head><body><h1>Join Our Team</h1></body></html>"
    career_records = extractor.extract_from_html(career_html, "https://adafruit.com/careers", "careerhash")
    assert len(career_records) == 0


def test_legitimate_product_page_becomes_product():
    source = SourceConfig(
        id="sparkfun",
        name="SparkFun Electronics",
        domains=["sparkfun.com"],
        start_urls=["https://sparkfun.com"],
    )
    extractor = ContentExtractor(source)

    prod_html = """
    <html>
      <head>
        <title>SparkFun RedBoard Plus - DEV-18158</title>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "SparkFun RedBoard Plus",
          "sku": "DEV-18158",
          "mpn": "DEV-18158",
          "category": "Development Boards"
        }
        </script>
      </head>
      <body><h1>SparkFun RedBoard Plus</h1></body>
    </html>
    """
    records = extractor.extract_from_html(prod_html, "https://sparkfun.com/products/18158", "redboardhash")
    assert len(records) == 1
    assert records[0].entity_type == EntityType.PRODUCT
    assert records[0].category == "Development Boards"


def test_classification_generator_conservative():
    from apps.ml.training.generators.classification import ClassificationDatasetGenerator

    prov = ProvenanceRecord(source="test", source_type="test", verification_status=VerificationStatus.VERIFIED)
    valid_prod = ProductRecord(
        sku="RES-1",
        mpn="RC0805JR-0710KL",
        name="10k Resistor 0805",
        category="Resistors",
        entity_type=EntityType.PRODUCT,
        provenance=prov,
    )
    uncat_prod = ProductRecord(
        sku="UNCAT-1",
        mpn="WIDGET-01",
        name="Unknown Widget",
        category="Uncategorized",
        entity_type=EntityType.PRODUCT,
        provenance=prov,
    )
    gen_prod = ProductRecord(
        sku="GEN-1",
        mpn="WIDGET-02",
        name="General Widget",
        category="General",
        entity_type=EntityType.PRODUCT,
        provenance=prov,
    )
    doc_record = ProductRecord(
        sku="DOC-1",
        mpn="PDF-ABC123",
        name="Thermal Design AN",
        category="Technical Documentation",
        entity_type=EntityType.DOCUMENT,
        document_type=DocumentType.APPLICATION_NOTE,
        provenance=prov,
    )

    gen = ClassificationDatasetGenerator(include_variations=False)
    examples = gen.generate([valid_prod, uncat_prod, gen_prod, doc_record])

    assert len(examples) == 1
    assert examples[0].category == "Resistors"
    assert all(e.category not in ("General", "Uncategorized", "Technical Documentation") for e in examples)


def test_document_and_non_product_records_available_for_other_generators():
    from apps.ml.training.generators import AttributeExtractionDatasetGenerator
    from apps.ml.training.schemas.product import AttributeValueRecord

    prov = ProvenanceRecord(source="test", source_type="test", verification_status=VerificationStatus.VERIFIED)
    doc_record = ProductRecord(
        sku="DOC-1",
        mpn="PDF-ABC123",
        name="High Power MOSFET Datasheet",
        category="Uncategorized",
        entity_type=EntityType.DOCUMENT,
        document_type=DocumentType.DATASHEET,
        provenance=prov,
        attributes={
            "voltage": AttributeValueRecord(code="voltage", value="60V", raw_value="60V", normalized_si=60.0, unit="V")
        },
    )

    attr_gen = AttributeExtractionDatasetGenerator()
    examples = attr_gen.generate([doc_record])
    assert len(examples) >= 1
    assert any("voltage" in e.target_attributes for e in examples)


def test_train_val_test_grouping_remains_leakage_free():
    from apps.ml.pipeline.build_dataset import get_base_family

    records = [
        {"mpn": "RC0805-10k-TR", "category": "Resistors"},
        {"mpn": "RC0805-10k-REEL", "category": "Resistors"},
        {"mpn": "RC0805-20k-TR", "category": "Resistors"},
        {"mpn": "GRM188-10uF", "category": "Capacitors"},
        {"mpn": "GRM188-22uF", "category": "Capacitors"},
    ]
    groups = [get_base_family(r["mpn"]) for r in records]
    assert groups[0] == groups[1] == groups[2] == "RC0805"
    assert groups[3] == groups[4] == "GRM188"



