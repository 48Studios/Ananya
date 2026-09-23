"""
Regression tests for concurrent, decoupled document acquisition.

Covers:
1. Concurrent document workers produce identical records in deterministic order
2. Thread-safe per-domain rate limiting under concurrency
3. Resume behaviour: cached documents are neither re-downloaded nor re-parsed
4. Document text cache round-trip and duplicate-content reuse
5. Failure isolation (corrupt PDFs, HTTP errors) never terminates the queue
6. RemoteProtocolError resilience under concurrent downloads
7. Large PDF streaming preserves SHA-256, content length, and raw file
8. Oversized streamed downloads abort cleanly with no partial files
9. Acquisition state persistence under concurrent workers
10. CLI --document-workers option
"""

import hashlib
import threading
import time
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

import httpx
import pytest

from apps.ml.training.cli import build_parser
from apps.ml.training.collectors.web import (
    AcquisitionStore,
    ContentExtractor,
    CrawlPolicyManager,
    DocumentTextCache,
    ResilientDownloader,
)
from apps.ml.training.collectors.web_collector import AutonomousWebCollector


# =====================================================================
# Fixtures / helpers
# =====================================================================

def _minimal_pdf(lines: List[str]) -> bytes:
    """Builds a valid, text-bearing single-page PDF (portable, no external tools)."""
    content_lines = ["BT", "/F1 10 Tf", "14 TL", "40 750 Td"]
    for line in lines:
        escaped = line.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
        content_lines.append(f"({escaped}) Tj T*")
    content_lines.append("ET")
    stream = "\n".join(content_lines).encode("latin-1", "replace")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for idx, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{idx} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref_offset = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets[1:]:
        out += f"{off:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_offset}\n%%EOF\n"
    ).encode()
    return bytes(out)


def _sitemap(docs: int) -> str:
    urls = "".join(
        f"<url><loc>http://bench.local/docs/doc-{i}.pdf</loc></url>" for i in range(docs)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        f"{urls}</urlset>"
    )


def _write_source_yaml(tmp_path: Path, name: str = "sources.yaml") -> Path:
    cfg = tmp_path / name
    cfg.write_text(
        "sources:\n"
        "  - id: conc-test\n"
        "    name: Concurrency Test\n"
        "    type: manufacturer\n"
        "    quality: distributor\n"
        "    enabled: true\n"
        "    domains:\n"
        "      - bench.local\n"
        "    start_urls:\n"
        "      - http://bench.local/sitemap.xml\n"
        "    discovery:\n"
        "      - sitemap\n"
        "      - documents\n"
        "    rate_limit:\n"
        "      requests_per_second: 1000\n"
        "      delay_seconds: 0.0\n"
        "      max_concurrent: 1\n"
        "    max_depth: 0\n"
        "    max_pages: 0\n"
        "    max_files: 100\n"
        "    allowed_content_types:\n"
        "      - text/html\n"
        "      - application/pdf\n"
        "      - text/xml\n"
        "      - application/xml\n"
        "    default_domain: electrical\n",
        encoding="utf-8",
    )
    return cfg


def _make_handler(
    docs: int,
    pdf_for: Optional[Callable[[int], Optional[bytes]]] = None,
    raise_for: Optional[Dict[int, Exception]] = None,
) -> Tuple[Callable[[httpx.Request], httpx.Response], List[str]]:
    """Returns (handler, requested_paths) with per-document override hooks."""
    requested: List[str] = []
    lock = threading.Lock()

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        with lock:
            requested.append(path)
        if path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nAllow: /\n")
        if path == "/sitemap.xml":
            return httpx.Response(200, text=_sitemap(docs), headers={"content-type": "text/xml"})
        if path.startswith("/docs/doc-") and path.endswith(".pdf"):
            idx = int(path.split("doc-")[1].split(".pdf")[0])
            if raise_for and idx in raise_for:
                raise raise_for[idx]
            if pdf_for is not None:
                body = pdf_for(idx)
                if body is None:
                    return httpx.Response(404)
            else:
                body = _minimal_pdf([f"Part Number: DOC-{idx}-A1", f"Resistance: {idx + 1}k Ohm"])
            return httpx.Response(200, content=body, headers={"content-type": "application/pdf"})
        return httpx.Response(404)

    return handler, requested


def _run_collector(
    cfg: Path,
    raw_base: Path,
    handler: Callable[[httpx.Request], httpx.Response],
    workers: int,
    resume: bool = True,
    max_retries: int = 1,
) -> Tuple[List, AutonomousWebCollector]:
    collector = AutonomousWebCollector(registry_path=str(cfg), raw_storage_base=str(raw_base))
    collector.downloader.max_retries = max_retries
    with httpx.Client(transport=httpx.MockTransport(handler), timeout=30.0) as client:
        records = collector.collect(
            source_id="conc-test",
            resume=resume,
            client=client,
            auto_process=False,
            quiet=True,
            document_workers=workers,
        )
    return records, collector


# =====================================================================
# 1. Determinism & concurrency
# =====================================================================

def test_concurrent_workers_match_serial_order(tmp_path: Path):
    docs = 8
    handler, _ = _make_handler(docs)
    cfg = _write_source_yaml(tmp_path)

    serial, _ = _run_collector(cfg, tmp_path / "raw-serial", handler, workers=1)
    concurrent, _ = _run_collector(cfg, tmp_path / "raw-concurrent", handler, workers=4)

    serial_skus = [r.sku for r in serial]
    concurrent_skus = [r.sku for r in concurrent]

    assert len(serial_skus) == docs
    assert concurrent_skus == serial_skus  # deterministic ordering preserved


def test_deterministic_extraction_same_input(tmp_path: Path):
    source = __import__(
        "apps.ml.training.collectors.web.registry", fromlist=["SourceConfig"]
    ).SourceConfig(
        id="det",
        name="Det",
        domains=["bench.local"],
        start_urls=["http://bench.local"],
        default_domain="electrical",
    )
    extractor = ContentExtractor(source)
    text = "Part Number: MPN-XYZ-123\nVoltage: 240V AC\nCurrent Rating: 16A"
    r1 = extractor.build_pdf_record(text, "Title", "http://bench.local/a.pdf", "hash1")
    r2 = extractor.build_pdf_record(text, "Title", "http://bench.local/a.pdf", "hash1")
    assert r1 is not None and r2 is not None
    # Deterministic extraction semantics (collected_at is intentionally time-stamped).
    assert (r1.sku, r1.mpn, r1.name, r1.category, r1.domain) == (
        r2.sku, r2.mpn, r2.name, r2.category, r2.domain,
    )
    assert r1.attributes.keys() == r2.attributes.keys()
    assert r1.provenance.content_hash == r2.provenance.content_hash == "hash1"


# =====================================================================
# 2. Rate limiting under concurrency
# =====================================================================

def test_rate_limiter_spaces_concurrent_request_starts():
    policy = CrawlPolicyManager(default_delay=0.15)
    policy.set_robots_txt("bench.local", "User-agent: *\nAllow: /\n")

    times: List[float] = []
    lock = threading.Lock()

    def worker() -> None:
        policy.wait_for_rate_limit("http://bench.local/doc")
        with lock:
            times.append(time.perf_counter())

    threads = [threading.Thread(target=worker) for _ in range(5)]
    start = time.perf_counter()
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    elapsed = time.perf_counter() - start

    times.sort()
    gaps = [times[i + 1] - times[i] for i in range(len(times) - 1)]
    # Starts must remain spaced by the configured delay despite concurrency.
    assert min(gaps) >= 0.10
    assert elapsed >= 0.15 * 4 * 0.8


# =====================================================================
# 3. Resume / cache behaviour
# =====================================================================

def test_resume_skips_download_and_reparse(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    docs = 5
    handler, requested = _make_handler(docs)
    cfg = _write_source_yaml(tmp_path)
    raw_base = tmp_path / "raw"

    parse_calls = {"n": 0}
    orig_read = ContentExtractor.read_pdf_text

    def counting_read(self, pdf_source):
        parse_calls["n"] += 1
        return orig_read(self, pdf_source)

    monkeypatch.setattr(ContentExtractor, "read_pdf_text", counting_read)

    records1, collector1 = _run_collector(cfg, raw_base, handler, workers=2, resume=True)
    assert len(records1) == docs
    assert parse_calls["n"] == docs  # each unique PDF parsed exactly once

    pdf_requests_first = [p for p in requested if p.startswith("/docs/")]
    assert len(pdf_requests_first) == docs

    # Second pass resumes from disk
    requested.clear()
    parse_calls["n"] = 0
    records2, collector2 = _run_collector(cfg, raw_base, handler, workers=2, resume=True)

    assert len(records2) == docs
    assert [r.sku for r in records2] == [r.sku for r in records1]
    # No PDF bytes re-downloaded...
    assert [p for p in requested if p.startswith("/docs/")] == []
    # ...and no PDF re-parsed (sidecar text cache satisfied the extraction).
    assert parse_calls["n"] == 0


def test_document_text_cache_roundtrip(tmp_path: Path):
    cache = DocumentTextCache(str(tmp_path / "cache"))
    assert cache.get("missing") is None
    assert cache.get(None) is None

    cache.put("abc123", {"text": "hello", "title": "t"})
    assert cache.get("abc123")["text"] == "hello"

    cache.put("abc123", {"text": "world", "title": "t2"})
    assert cache.get("abc123")["text"] == "world"


def test_duplicate_content_parsed_once(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    docs = 6
    shared = _minimal_pdf(["Part Number: SHARED-001", "Voltage: 240V AC"])

    def pdf_for(_idx: int) -> bytes:
        return shared  # identical bytes -> identical content hash

    handler, _ = _make_handler(docs, pdf_for=pdf_for)
    cfg = _write_source_yaml(tmp_path)

    parse_calls = {"n": 0}
    orig_read = ContentExtractor.read_pdf_text

    def counting_read(self, pdf_source):
        parse_calls["n"] += 1
        return orig_read(self, pdf_source)

    monkeypatch.setattr(ContentExtractor, "read_pdf_text", counting_read)
    records, _ = _run_collector(cfg, tmp_path / "raw", handler, workers=4)

    assert len(records) == docs
    # Identical content hash is parsed only once, then served from the text cache.
    assert parse_calls["n"] == 1


# =====================================================================
# 4. Failure isolation
# =====================================================================

def test_failure_isolation_corrupt_pdf_and_http_error(tmp_path: Path):
    docs = 3

    def pdf_for(idx: int) -> Optional[bytes]:
        if idx == 1:
            return b"%PDF-1.4\nthis is not a real pdf at all"
        return _minimal_pdf([f"Part Number: DOC-{idx}-A1", "Voltage: 240V AC"])

    handler, _ = _make_handler(docs, pdf_for=pdf_for)
    cfg = _write_source_yaml(tmp_path)

    records, collector = _run_collector(cfg, tmp_path / "raw", handler, workers=3)
    skus = [r.sku for r in records]
    assert any("DOC-0" in s for s in skus)
    assert any("DOC-2" in s for s in skus)
    assert len(records) == 2
    assert collector.last_stats["failed"] >= 1


def test_http_error_does_not_abort_queue(tmp_path: Path):
    docs = 4

    def pdf_for(idx: int) -> Optional[bytes]:
        return None if idx == 2 else _minimal_pdf([f"Part Number: DOC-{idx}-A1"])

    handler, _ = _make_handler(docs, pdf_for=pdf_for)
    cfg = _write_source_yaml(tmp_path)
    records, collector = _run_collector(cfg, tmp_path / "raw", handler, workers=3)
    assert len(records) == 3
    assert collector.last_stats["failed"] >= 1


def test_remote_protocol_error_resilience_concurrent(tmp_path: Path):
    docs = 4
    handler, _ = _make_handler(
        docs,
        raise_for={1: httpx.RemoteProtocolError("peer closed connection")},
    )
    cfg = _write_source_yaml(tmp_path)
    records, collector = _run_collector(cfg, tmp_path / "raw", handler, workers=3, max_retries=1)
    assert len(records) == 3
    assert collector.last_stats["failed"] >= 1


# =====================================================================
# 5. Large / oversized PDF streaming
# =====================================================================

def test_streaming_download_preserves_hash_length_and_file(tmp_path: Path):
    payload = b"%PDF-1.4\n" + b"x" * 2_000_000

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nAllow: /\n")
        return httpx.Response(200, content=payload, headers={"content-type": "application/pdf"})

    downloader = ResilientDownloader(raw_storage_base=str(tmp_path), max_file_size_bytes=5_000_000)
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        res = downloader.download("http://bench.local/big.pdf", "src", client=client)

    assert res.error is None
    assert res.content_length == len(payload)
    assert res.content_hash == hashlib.sha256(payload).hexdigest()
    assert res.saved_path is not None
    assert Path(res.saved_path).read_bytes() == payload
    assert list(Path(tmp_path).rglob("*.part")) == []


def test_streaming_download_aborts_oversized_cleanly(tmp_path: Path):
    payload = b"x" * 2000

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nAllow: /\n")
        return httpx.Response(200, content=payload, headers={"content-type": "application/pdf"})

    downloader = ResilientDownloader(raw_storage_base=str(tmp_path), max_file_size_bytes=100)
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        res = downloader.download("http://bench.local/big.pdf", "src", client=client)

    assert res.error is not None and "exceeds" in res.error.lower()
    assert res.saved_path is None
    assert list(Path(tmp_path).rglob("*.part")) == []
    assert list(Path(tmp_path).rglob("*.pdf")) == []


# =====================================================================
# 6. Acquisition persistence under concurrency
# =====================================================================

def test_acquisition_state_persists_under_concurrency(tmp_path: Path):
    docs = 6
    handler, _ = _make_handler(docs)
    cfg = _write_source_yaml(tmp_path)
    raw_base = tmp_path / "raw"

    _run_collector(cfg, raw_base, handler, workers=4)

    store = AcquisitionStore(metadata_dir=str(raw_base / "metadata"))
    records = store.get_records_for_source("conc-test")
    assert len(records) == docs
    for rec in records:
        assert rec.content_hash
        assert rec.local_path and Path(rec.local_path).exists()
        assert rec.processing_status == "PROCESSED"
    assert store.get_summary()["processed"] == docs


# =====================================================================
# 7. CLI
# =====================================================================

def test_cli_document_workers_flag():
    parser = build_parser()
    args = parser.parse_args(["collect", "--document-workers", "4"])
    assert args.document_workers == 4

    default_args = parser.parse_args(["collect"])
    assert default_args.document_workers is None
    assert default_args.workers == 1
