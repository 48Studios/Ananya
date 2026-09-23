"""
Tests for Shared Live Progress Utility and Reporting Integration.

Covers:
1. Known totals (progress bar calculation, percentage, elapsed time)
2. Unknown totals (spinner frames, indeterminate counter)
3. TTY output (carriage return \r, line erasing \033[K, throttled rendering)
4. Non-TTY / CI output (clean milestone lines, no \r spam)
5. Quiet mode (--quiet, suppresses live output while preserving state)
6. Discovery counters (sitemaps, leaf URLs, product/document counts)
7. Collection counters (pages, files, products extracted, PDFs)
8. Cached / skipped / failed accounting (cached items not counted as downloaded)
9. Training & evaluation progress hooks (candidates, metrics)
10. Structured output compatibility (no progress pollution)
11. Exception handling (progress does not swallow errors)
"""

import io
import time
from unittest.mock import MagicMock
import pytest

from apps.ml.training.utils.progress import LiveProgress, format_time
from apps.ml.training.collectors.web.discovery import DiscoveryEngine, SourceConfig
from apps.ml.training.collectors.web_collector import AutonomousWebCollector
from apps.ml.training.trainers.classifier import CategoryClassifierTrainer
from apps.ml.training.evaluation.evaluator import ModelEvaluator
from apps.ml.training.cli import build_parser


def test_format_time():
    assert format_time(0) == "00:00:00"
    assert format_time(65) == "00:01:05"
    assert format_time(3665) == "01:01:05"
    assert format_time(-10) == "00:00:00"


def test_known_totals_progress_bar_tty():
    stream = io.StringIO()
    progress = LiveProgress(stream=stream, is_tty=True, update_interval=0.0)

    progress.start_stage("Downloading", total=100)
    progress.update(current=50, metrics={"products": 25, "PDFs": 10})
    progress.finish_stage()

    output = stream.getvalue()
    assert "\r\033[K" in output
    assert "Downloading" in output
    assert "50.0%" in output
    assert "50/100" in output
    assert "products: 25" in output
    assert "PDFs: 10" in output


def test_unknown_totals_spinner_tty():
    stream = io.StringIO()
    progress = LiveProgress(stream=stream, is_tty=True, update_interval=0.0)

    progress.start_stage("Discovering sitemaps", total=None, unit="sitemaps")
    progress.update(current=5, metrics={"URLs": 1250})
    progress.finish_stage()

    output = stream.getvalue()
    assert "\r\033[K" in output
    assert "Discovering sitemaps" in output
    assert "5 items" in output or "5 sitemaps" in output or "URLs: 1,250" in output


def test_non_tty_output_clean_no_ansi_spam():
    stream = io.StringIO()
    progress = LiveProgress(stream=stream, is_tty=False, non_tty_interval=0.0)

    progress.start_stage("Normalizing records", total=100)
    # Update at 20%
    progress.update(current=20)
    progress.finish_stage("Normalizing records: 100/100 completed")

    output = stream.getvalue()
    # Must NOT have carriage return \r or ANSI clear escape \033[K
    assert "\r" not in output
    assert "\033[K" not in output
    assert "--> Normalizing records" in output
    assert "Normalizing records: 100/100 completed" in output


def test_quiet_mode_suppresses_progress():
    stream = io.StringIO()
    progress = LiveProgress(quiet=True, stream=stream, is_tty=True)

    progress.start_stage("Quiet stage", total=100)
    progress.update(current=50)
    progress.finish_stage()

    output = stream.getvalue()
    assert output == ""


def test_context_manager_and_exception_preservation():
    stream = io.StringIO()
    progress = LiveProgress(stream=stream, is_tty=True)

    with pytest.raises(ValueError, match="Test error"):
        with progress:
            progress.start_stage("Error prone stage", total=10)
            raise ValueError("Test error")

    # Exception was raised and not swallowed
    output = stream.getvalue()
    assert "\n" in output


def test_iter_progress_helper():
    stream = io.StringIO()
    progress = LiveProgress(stream=stream, is_tty=True, update_interval=0.0)

    items = [1, 2, 3, 4, 5]
    result = list(progress.iter_progress(items, title="Iterating", total=5))
    assert result == items
    output = stream.getvalue()
    assert "Iterating" in output
    assert "5/5" in output


def test_discovery_live_progress_hooks():
    src = SourceConfig(
        id="test-progress-src",
        name="Progress Test",
        type="manufacturer",
        quality="distributor",
        domains=["progress-test.com"],
        start_urls=["https://progress-test.com/sitemap.xml"],
    )
    discovery = DiscoveryEngine(src)

    sitemap_xml = """<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://progress-test.com/products/item-1</loc></url>
      <url><loc>https://progress-test.com/datasheets/item-1.pdf</loc></url>
    </urlset>
    """

    mock_client = MagicMock()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.content = sitemap_xml.encode("utf-8")
    mock_resp.text = sitemap_xml
    mock_client.get.return_value = mock_resp

    stream = io.StringIO()
    progress = LiveProgress(stream=stream, is_tty=True, update_interval=0.0)

    res = discovery.discover(client=mock_client, progress=progress)
    assert res.report.sitemaps_parsed == 1
    assert res.report.product_urls == 1
    assert res.report.document_urls == 1

    output = stream.getvalue()
    assert "Discovering sitemaps" in output


def test_cached_skipped_failed_accounting(tmp_path):
    cfg_content = """
sources:
  - id: cache-acc-test
    name: Cache Accounting Test
    type: manufacturer
    quality: distributor
    enabled: true
    domains:
      - cache-test.com
    start_urls:
      - https://cache-test.com/item1
    max_pages: 5
    max_files: 5
    default_domain: mechanical
"""
    cfg_file = tmp_path / "sources.yaml"
    cfg_file.write_text(cfg_content, encoding="utf-8")

    collector = AutonomousWebCollector(
        registry_path=str(cfg_file),
        raw_storage_base=str(tmp_path / "raw"),
    )

    # First pass: download 1 item
    mock_client = MagicMock()
    resp1 = MagicMock()
    resp1.status_code = 200
    resp1.content = b"<html><body>Item 1</body></html>"
    resp1.text = "<html><body>Item 1</body></html>"
    resp1.headers = {"content-type": "text/html", "etag": '"etag-1"'}
    mock_client.get.return_value = resp1

    collector.collect(source_id="cache-acc-test", client=mock_client, auto_process=False, quiet=True)
    assert collector.last_stats["downloaded"] == 1
    assert collector.last_stats["cached"] == 0

    # Second pass with resume: item is cached (304 / local cache hit)
    resp2 = MagicMock()
    resp2.status_code = 304
    resp2.content = b""
    resp2.headers = {"etag": '"etag-1"'}
    mock_client.get.return_value = resp2

    collector.collect(source_id="cache-acc-test", client=mock_client, resume=True, auto_process=False, quiet=True)
    assert collector.last_stats["downloaded"] == 0  # NOT counted as downloaded!
    assert collector.last_stats["cached"] == 1      # Counted as cached!


def test_training_and_evaluation_progress_hooks():
    trainer = CategoryClassifierTrainer(max_iter=50)
    train_data = [
        {"text": "10k ohm metal film resistor 0805", "category": "Resistors"},
        {"text": "100uF 25V electrolytic capacitor", "category": "Capacitors"},
        {"text": "47nH ceramic chip inductor", "category": "Inductors"},
    ]
    val_data = [
        {"text": "1k ohm resistor", "category": "Resistors"},
        {"text": "10uF capacitor", "category": "Capacitors"},
        {"text": "10nH inductor", "category": "Inductors"},
    ]

    stream = io.StringIO()
    progress = LiveProgress(stream=stream, is_tty=True, update_interval=0.0)

    meta = trainer.train(train_data, val_samples=val_data, progress=progress)
    assert meta["champion_model"] != ""

    evaluator = ModelEvaluator()
    rep = evaluator.evaluate(trainer.champion_pipeline, val_data, progress=progress)
    assert "metrics" in rep

    output = stream.getvalue()
    assert "Training candidate" in output
    assert "Evaluating candidate" in output


def test_cli_quiet_and_verbose_flags():
    parser = build_parser()

    # Test top-level flags
    args1 = parser.parse_args(["--quiet", "collect", "--source", "sample"])
    assert args1.quiet is True

    # Test subparser flags
    args2 = parser.parse_args(["collect", "-q", "--source", "sample"])
    assert args2.quiet is True

    args3 = parser.parse_args(["train", "-v", "--train-path", "data.json"])
    assert args3.verbose is True
