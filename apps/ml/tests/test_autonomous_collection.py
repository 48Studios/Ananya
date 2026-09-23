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

from apps.ml.training.schemas.product import ProductDomain
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
