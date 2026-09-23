#!/usr/bin/env python3
"""
Document Acquisition Benchmark & Profiler.

Runs the *real* autonomous collection document pipeline (discovery → download →
PDF parse → attribute extraction → ProductRecord → acquisition persistence)
against a local, deterministic HTTP origin so before/after optimizations can be
measured reproducibly without hammering public sources.

The origin serves real, text-bearing PDFs produced by the platform's PDF
generator and applies a configurable per-request network latency / bandwidth.

Usage:
    ./apps/ml/.venv/bin/python apps/ml/benchmarks/document_acquisition_benchmark.py \
        --docs 24 --rate-delay 1.0 --net-latency 0.15 --document-workers 1

    # Two passes: first downloads, second verifies resume/cache behaviour.
    ./apps/ml/.venv/bin/python apps/ml/benchmarks/document_acquisition_benchmark.py --resume-run
"""

import argparse
import io
import json
import os
import statistics
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Dict, List, Optional, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from apps.ml.training.collectors.web.acquisition import AcquisitionStore
from apps.ml.training.collectors.web.downloader import ResilientDownloader
from apps.ml.training.collectors.web.extractor import ContentExtractor
from apps.ml.training.collectors.web.policy import CrawlPolicyManager
from apps.ml.training.collectors.web_collector import AutonomousWebCollector
from apps.ml.training.utils.profiling import StageProfiler, percentiles

SPEC_LINES = [
    "Technical Data Sheet",
    "Part Number: MPN-CB16-240V",
    "Model: CIR-BRK-16A",
    "Manufacturer: PowerTech Industries",
    "Voltage Rating: 240V AC",
    "Current Rating: 16A",
    "Breaking Capacity: 6kA",
    "Operating Temperature: -25 C to +55 C",
    "Contact Resistance: 10 mOhm",
    "Insulation Resistance: 100 MOhm",
    "Dielectric Strength: 2.5 kV",
    "Mechanical Life: 10000 cycles",
    "Electrical Life: 4000 cycles",
    "Terminal Type: Screw",
    "Mounting: DIN Rail 35mm",
    "Standards: IEC 60898-1, UL 1077",
    "Certifications: CE, RoHS, REACH",
    "Dimensions: 18mm x 80mm x 70mm",
    "Weight: 120 g",
    "Warranty: 24 months",
]


def build_pdf_text(pages: int) -> str:
    return "\n".join("\n".join(SPEC_LINES) for _ in range(pages))


def generate_pdf(text: str) -> bytes:
    """Generates a valid, text-bearing PDF. Uses macOS cupsfilter when available."""
    if os.path.exists("/usr/sbin/cupsfilter"):
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
            f.write(text)
            txt_path = f.name
        try:
            result = subprocess.run(
                ["/usr/sbin/cupsfilter", txt_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                check=True,
            )
            if result.stdout[:4] == b"%PDF":
                return result.stdout
        finally:
            os.unlink(txt_path)
    return _build_minimal_pdf(text)


def _build_minimal_pdf(text: str) -> bytes:
    """Portable fallback PDF writer with extractable Helvetica text."""
    lines = text.splitlines() or [""]
    content_lines = ["BT", "/F1 10 Tf", "14 TL", "40 750 Td"]
    for line in lines:
        escaped = line.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
        content_lines.append(f"({escaped}) Tj T*")
    content_lines.append("ET")
    stream = "\n".join(content_lines).encode("latin-1", "replace")

    objects: List[bytes] = []
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objects.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    objects.append(
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>"
    )
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    objects.append(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")

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


class _OriginHandler(BaseHTTPRequestHandler):
    server_version = "BenchOrigin/1.0"

    def log_message(self, *args) -> None:  # silence
        pass

    def do_GET(self) -> None:
        cfg: "_OriginConfig" = self.server.config  # type: ignore[attr-defined]
        if self.path.startswith("/robots.txt"):
            body = b"User-agent: *\nAllow: /\n"
            self._send(body, "text/plain", cfg)
            return
        if self.path.startswith("/sitemap.xml"):
            urls = "".join(
                f"<url><loc>http://127.0.0.1:{cfg.port}/docs/doc-{i}.pdf</loc></url>"
                for i in range(cfg.docs)
            )
            body = (
                '<?xml version="1.0" encoding="UTF-8"?>'
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                f"{urls}</urlset>"
            ).encode()
            self._send(body, "text/xml", cfg)
            return
        if self.path.startswith("/docs/doc-") and self.path.endswith(".pdf"):
            idx = int(self.path.split("doc-")[1].split(".pdf")[0])
            body = cfg.pdf_bytes[idx % len(cfg.pdf_bytes)]
            self._send(body, "application/pdf", cfg)
            return
        if self.path.endswith(".pdf"):
            body = cfg.pdf_bytes[0]
            self._send(body, "application/pdf", cfg)
            return
        self.send_error(404)

    def _send(self, body: bytes, content_type: str, cfg: "_OriginConfig") -> None:
        if cfg.net_latency:
            time.sleep(cfg.net_latency)
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        # Stream in chunks to mimic real bandwidth without full in-memory copy.
        chunk = max(1, cfg.chunk_bytes)
        # Per-chunk sleep enforces the simulated bandwidth ceiling.
        chunk_seconds = (chunk / cfg.bandwidth_bytes_per_second) if cfg.bandwidth_bytes_per_second else 0.0
        try:
            for start in range(0, len(body), chunk):
                self.wfile.write(body[start:start + chunk])
                if chunk_seconds:
                    time.sleep(chunk_seconds)
        except (BrokenPipeError, ConnectionResetError):
            pass


class _OriginConfig:
    def __init__(
        self,
        docs: int,
        pdf_bytes: List[bytes],
        net_latency: float,
        chunk_bytes: int,
        bandwidth_mbps: float = 0.0,
    ):
        self.docs = docs
        self.pdf_bytes = pdf_bytes
        self.net_latency = net_latency
        self.chunk_bytes = chunk_bytes
        self.bandwidth_bytes_per_second = (bandwidth_mbps * 1_000_000 / 8.0) if bandwidth_mbps else 0.0
        self.port = 0


def _install_instrumentation(profiler: StageProfiler) -> Dict[str, List[float]]:
    orig_download = ResilientDownloader.download
    orig_wait = CrawlPolicyManager.wait_for_rate_limit
    orig_read = ContentExtractor.read_pdf_text
    orig_build = ContentExtractor.build_pdf_record
    orig_save = AcquisitionStore.save
    doc_start: Dict[str, float] = {}
    doc_lock = threading.Lock()
    per_doc: List[float] = []

    def prof_download(self, url, *args, **kwargs):
        with doc_lock:
            doc_start.setdefault(url, time.perf_counter())
        start = time.perf_counter()
        try:
            result = orig_download(self, url, *args, **kwargs)
            if result.content_length:
                profiler.increment("bytes_downloaded", result.content_length)
            if not result.error and not result.is_cached:
                profiler.increment("documents_downloaded")
            if result.error:
                profiler.increment("download_errors")
            return result
        finally:
            profiler.record("download_total", time.perf_counter() - start)

    def prof_wait(self, url, *args, **kwargs):
        start = time.perf_counter()
        try:
            return orig_wait(self, url, *args, **kwargs)
        finally:
            profiler.record("rate_limit_wait", time.perf_counter() - start)

    def prof_read(self, pdf_source):
        start = time.perf_counter()
        try:
            return orig_read(self, pdf_source)
        finally:
            profiler.record("pdf_parse", time.perf_counter() - start)

    def prof_build(self, text, title, url, content_hash):
        start = time.perf_counter()
        try:
            return orig_build(self, text, title, url, content_hash)
        finally:
            profiler.record("record_build", time.perf_counter() - start)
            with doc_lock:
                t0 = doc_start.get(url)
            if t0 is not None:
                per_doc.append(time.perf_counter() - t0)

    def prof_save(self):
        start = time.perf_counter()
        try:
            return orig_save(self)
        finally:
            profiler.record("acquisition_persistence", time.perf_counter() - start)

    ResilientDownloader.download = prof_download
    CrawlPolicyManager.wait_for_rate_limit = prof_wait
    ContentExtractor.read_pdf_text = prof_read
    ContentExtractor.build_pdf_record = prof_build
    AcquisitionStore.save = prof_save
    return {"per_doc": per_doc, "doc_start": doc_start}


def _install_attribute_timing(profiler: StageProfiler) -> None:
    import apps.ml.app.services.datasheet_extractor as ds_module

    service = ds_module.datasheet_extractor
    orig_process = service.process

    def prof_process(*args, **kwargs):
        start = time.perf_counter()
        try:
            return orig_process(*args, **kwargs)
        finally:
            profiler.record("attribute_extraction", time.perf_counter() - start)

    service.process = prof_process  # type: ignore[method-assign]


def run_pass(
    label: str,
    docs: int,
    rate_delay: float,
    net_latency: float,
    document_workers: int,
    pages: int,
    workdir: Path,
    origin: ThreadingHTTPServer,
    port: int,
    profiler: StageProfiler,
    resume: bool,
    per_doc: Optional[List[float]] = None,
    max_concurrent: int = 1,
    max_retries: int = 2,
) -> Dict[str, object]:
    source_yaml = workdir / f"sources-{label}.yaml"
    source_yaml.write_text(
        "sources:\n"
        "  - id: bench-origin\n"
        "    name: Benchmark Origin\n"
        "    type: manufacturer\n"
        "    quality: distributor\n"
        "    enabled: true\n"
        "    domains:\n"
        "      - 127.0.0.1\n"
        f"    start_urls:\n"
        f"      - http://127.0.0.1:{port}/sitemap.xml\n"
        "    discovery:\n"
        "      - sitemap\n"
        "      - documents\n"
        f"    rate_limit:\n"
        f"      requests_per_second: {1.0 / rate_delay if rate_delay else 1000.0}\n"
        f"      delay_seconds: {rate_delay}\n"
        "      max_concurrent: " + str(max_concurrent) + "\n"
        "    max_depth: 0\n"
        "    max_pages: 0\n"
        f"    max_files: {docs}\n"
        "    allowed_content_types:\n"
        "      - text/html\n"
        "      - application/pdf\n"
        "      - text/xml\n"
        "      - application/xml\n"
        "    default_domain: electrical\n",
        encoding="utf-8",
    )

    collector = AutonomousWebCollector(
        registry_path=str(source_yaml),
        raw_storage_base=str(workdir / "raw"),
    )
    collector.downloader.max_retries = max_retries

    import httpx

    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        start = time.perf_counter()
        records = collector.collect(
            source_id="bench-origin",
            resume=resume,
            client=client,
            auto_process=False,
            quiet=True,
            document_workers=document_workers,
        )
        wall = time.perf_counter() - start

    stats = collector.last_stats
    counters = profiler.counters()
    downloaded = stats.get("downloaded", 0)
    result = {
        "label": label,
        "wall_seconds": wall,
        "documents_processed": downloaded,
        "products_extracted": len(records),
        "pdfs": stats.get("pdfs", 0),
        "cached": stats.get("cached", 0),
        "failed": stats.get("failed", 0),
        "docs_per_min": (downloaded / wall) * 60.0 if wall else 0.0,
        "mb_per_min": (counters.get("bytes_downloaded", 0.0) / (1024 * 1024) / wall) * 60.0 if wall else 0.0,
        "avg_pdf_mb": (counters.get("bytes_downloaded", 0.0) / downloaded / (1024 * 1024)) if downloaded else 0.0,
        "document_workers": document_workers,
    }
    if per_doc is not None:
        result["document_total"] = percentiles(per_doc)
    result["stages"] = profiler.summary()
    result["counters"] = profiler.counters()
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Document acquisition benchmark")
    parser.add_argument("--docs", type=int, default=24, help="Number of PDFs to acquire")
    parser.add_argument("--rate-delay", type=float, default=1.0, help="Per-domain delay between requests (s)")
    parser.add_argument("--net-latency", type=float, default=0.15, help="Simulated origin latency (s)")
    parser.add_argument("--bandwidth-mbps", type=float, default=0.0, help="Simulated per-connection bandwidth ceiling")
    parser.add_argument("--document-workers", type=int, default=1, help="Download/parse worker count")
    parser.add_argument("--max-concurrent", type=int, default=1, help="Explicit source request concurrency (>1 caps in-flight requests)")
    parser.add_argument("--pages", type=int, default=8, help="Pages per generated PDF (when no --pdf-dir)")
    parser.add_argument("--pdf-dir", type=str, default="", help="Directory of real PDFs to serve instead of generated ones")
    parser.add_argument("--resume-run", action="store_true", help="Run a second resume pass after the first")
    parser.add_argument("--json-out", type=str, default="", help="Optional path to write JSON results")
    args = parser.parse_args()

    workdir = Path(tempfile.mkdtemp(prefix="ananya-bench-"))
    print(f"[bench] workdir: {workdir}")

    if args.pdf_dir:
        pdfs = [p.read_bytes() for p in sorted(Path(args.pdf_dir).glob("*.pdf"))]
        if not pdfs:
            raise SystemExit(f"No PDFs found in {args.pdf_dir}")
        print(f"[bench] loaded {len(pdfs)} real PDFs ({sum(len(p) for p in pdfs) / 1024 / 1024:.1f} MB)")
    else:
        t = time.perf_counter()
        pdfs = [generate_pdf(build_pdf_text(args.pages))]
        print(f"[bench] generated {len(pdfs[0])} bytes PDF in {time.perf_counter() - t:.2f}s")

    cfg = _OriginConfig(
        docs=args.docs,
        pdf_bytes=pdfs,
        net_latency=args.net_latency,
        chunk_bytes=65536,
        bandwidth_mbps=args.bandwidth_mbps,
    )
    origin = ThreadingHTTPServer(("127.0.0.1", 0), _OriginHandler)
    origin.config = cfg  # type: ignore[attr-defined]
    cfg.port = origin.server_address[1]
    thread = threading.Thread(target=origin.serve_forever, daemon=True)
    thread.start()
    print(f"[bench] origin listening on 127.0.0.1:{cfg.port}")

    profiler = StageProfiler()
    instrument_state = _install_instrumentation(profiler)
    per_doc = instrument_state["per_doc"]
    _install_attribute_timing(profiler)

    try:
        profiler.reset()
        per_doc.clear()
        instrument_state["doc_start"].clear()
        before = run_pass(
            "pass1",
            args.docs,
            args.rate_delay,
            args.net_latency,
            args.document_workers,
            args.pages,
            workdir,
            origin,
            cfg.port,
            profiler,
            resume=True,
            per_doc=per_doc,
            max_concurrent=args.max_concurrent,
        )
        results = [before]
        if args.resume_run:
            profiler.reset()
            per_doc.clear()
            instrument_state["doc_start"].clear()
            second = run_pass(
                "resume",
                args.docs,
                args.rate_delay,
                args.net_latency,
                args.document_workers,
                args.pages,
                workdir,
                origin,
                cfg.port,
                profiler,
                resume=True,
                per_doc=per_doc,
                max_concurrent=args.max_concurrent,
            )
            results.append(second)
    finally:
        origin.shutdown()

    print("\n" + "=" * 72)
    print(f" DOCUMENT ACQUISITION BENCHMARK (workers={args.document_workers})")
    print("=" * 72)
    for res in results:
        print(
            f"[{res['label']}] wall={res['wall_seconds']:.2f}s docs={res['documents_processed']} "
            f"products={res['products_extracted']} cached={res['cached']} failed={res['failed']} "
            f"docs/min={res['docs_per_min']:.1f} MB/min={res['mb_per_min']:.2f} avgPDF={res['avg_pdf_mb']:.2f}MB"
        )
        dt = res.get("document_total")
        if dt:
            print(
                f"          per-document end-to-end: avg={dt['average']:.3f}s median={dt['median']:.3f}s "
                f"p95={dt['p95']:.3f}s max={dt['maximum']:.3f}s"
            )
        for stage, s in res.get("stages", {}).items():
            print(
                f"          {stage:<24} n={s['count']:<4} avg={s['average']:.4f}s "
                f"p95={s['p95']:.4f}s max={s['maximum']:.4f}s"
            )

    print("\nFinal profiler state:")
    print(profiler.render("STAGE PROFILE (last pass)"))
    print("\nCounters:", json.dumps(profiler.counters(), indent=2))

    if args.json_out:
        Path(args.json_out).write_text(
            json.dumps({"results": results, "stages": profiler.summary(), "counters": profiler.counters()}, indent=2),
            encoding="utf-8",
        )
        print(f"[bench] wrote {args.json_out}")


if __name__ == "__main__":
    main()
