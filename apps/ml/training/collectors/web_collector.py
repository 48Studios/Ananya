"""
Autonomous Web Collector.

Extends BaseCollector to provide automated discovery, crawling, extraction,
and downstream dataset pipeline integration across approved declarative sources.
"""

import time
import logging
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
import httpx

from .base import BaseCollector
from ..schemas.product import ProductRecord
from ..schemas.manifest import DatasetManifest
from ..config import settings
from .web.registry import SourceRegistry, SourceConfig
from .web.policy import CrawlPolicyManager
from .web.downloader import ResilientDownloader, DownloadResult
from .web.acquisition import AcquisitionStore
from .web.discovery import DiscoveryEngine, canonicalize_url
from .web.extractor import ContentExtractor

# Import existing processors and generators
from ..processors.normalization import NormalizationProcessor
from ..processors.validation import DataValidationProcessor
from ..processors.deduplication import DeduplicationProcessor
from ..generators.classification import ClassificationDatasetGenerator
from ..datasets.splitter import DeterministicDatasetSplitter

logger = logging.getLogger(__name__)


class AutonomousWebCollector(BaseCollector):
    """
    Autonomous multi-source crawler, downloader, and extractor.
    Operates strictly within domain allowlists and respects robots.txt.
    """

    name = "autonomous_web_collector"
    source_type = "generic_web"

    def __init__(
        self,
        registry_path: Optional[str] = None,
        raw_storage_base: Optional[str] = None,
        policy_manager: Optional[CrawlPolicyManager] = None,
    ):
        reg_file = registry_path or str(Path(settings.base_dir) / "config" / "sources.yaml")
        self.registry = SourceRegistry.from_yaml(reg_file)

        raw_base = raw_storage_base or str(settings.raw_data_dir)
        self.raw_base = Path(raw_base)
        self.policy_manager = policy_manager or CrawlPolicyManager()
        self.downloader = ResilientDownloader(
            raw_storage_base=str(self.raw_base),
            policy_manager=self.policy_manager,
        )
        self.acquisition_store = AcquisitionStore(
            metadata_dir=str(self.raw_base / "metadata")
        )

    def collect(
        self,
        source_id: Optional[str] = None,
        domain: Optional[str] = None,
        max_pages: Optional[int] = None,
        max_files: Optional[int] = None,
        dry_run: bool = False,
        resume: bool = True,
        client: Optional[httpx.Client] = None,
        auto_process: bool = True,
        **kwargs: Any,
    ) -> List[ProductRecord]:
        """
        Executes autonomous collection across configured sources.
        """
        # Determine sources to run
        if source_id:
            src = self.registry.get_source(source_id)
            if not src:
                raise ValueError(f"Source '{source_id}' not found in registry")
            sources = [src]
        elif domain:
            sources = [s for s in self.registry.get_sources() if s.is_domain_allowed(domain)]
            if not sources:
                raise ValueError(f"No source configured for domain '{domain}'")
        else:
            sources = self.registry.get_sources(enabled_only=True)

        all_extracted_records: List[ProductRecord] = []
        stats = {
            "sources_count": len(sources),
            "urls_discovered": 0,
            "downloaded": 0,
            "skipped": 0,
            "failed": 0,
            "pdfs": 0,
            "products_extracted": 0,
        }

        for source in sources:
            source_records = self._collect_source(
                source,
                max_pages=max_pages or source.max_pages,
                max_files=max_files or source.max_files,
                dry_run=dry_run,
                resume=resume,
                client=client,
                stats=stats,
            )
            all_extracted_records.extend(source_records)

        # Save crawl database
        self.acquisition_store.save()
        self.last_stats = stats

        # Print summary
        self._print_summary(stats)

        # Run existing pipeline: Clean -> Normalize -> Validate -> Dedupe -> Split -> Manifest
        if auto_process and not dry_run and all_extracted_records:
            self._run_downstream_pipeline(all_extracted_records)

        return all_extracted_records

    def _collect_source(
        self,
        source: SourceConfig,
        max_pages: int,
        max_files: int,
        dry_run: bool,
        resume: bool,
        client: Optional[httpx.Client],
        stats: Dict[str, int],
    ) -> List[ProductRecord]:
        """Runs discovery and extraction for a single source."""
        discovery = DiscoveryEngine(source)
        extractor = ContentExtractor(source)
        extracted: List[ProductRecord] = []

        url_queue: List[Tuple[str, int]] = [(url, 0) for url in source.start_urls]
        seen_urls: set = set()
        pages_processed = 0
        files_processed = 0

        while url_queue and pages_processed < max_pages and files_processed < max_files:
            current_url, depth = url_queue.pop(0)
            canonical = canonicalize_url(current_url)

            if canonical in seen_urls:
                continue
            seen_urls.add(canonical)
            stats["urls_discovered"] += 1

            # Check if domain allowed
            if not source.is_domain_allowed(canonical):
                continue

            # Record in acquisition store
            self.acquisition_store.record_discovered(canonical, current_url, source.id)

            if dry_run:
                # Dry run mode: report discovery without download
                stats["skipped"] += 1
                continue

            # Check acquisition cache if resume requested
            existing = self.acquisition_store.get_record(canonical)
            cached_hash = existing.content_hash if existing and resume else None
            cached_etag = existing.etag if existing and resume else None
            cached_last_mod = existing.last_modified if existing and resume else None

            # Download resource
            download_res = self.downloader.download(
                canonical,
                source_id=source.id,
                client=client,
                cached_etag=cached_etag,
                cached_last_modified=cached_last_mod,
                cached_hash=cached_hash,
                rate_limit_delay=source.rate_limit.delay_seconds,
                max_file_size_bytes=int(source.max_file_size_mb * 1024 * 1024),
                allowed_content_types=source.allowed_content_types,
            )

            # Record acquisition
            self.acquisition_store.record_downloaded(
                canonical_url=canonical,
                http_status=download_res.status_code,
                content_hash=download_res.content_hash,
                content_type=download_res.content_type,
                content_length=download_res.content_length,
                etag=download_res.etag,
                last_modified=download_res.last_modified,
                local_path=download_res.saved_path,
                error=download_res.error,
                is_cached=download_res.is_cached,
            )

            if download_res.error:
                stats["failed"] += 1
                continue

            if download_res.is_cached:
                stats["skipped"] += 1
                continue

            stats["downloaded"] += 1
            files_processed += 1

            # Process content by type
            ct = download_res.content_type.lower()
            if "html" in ct or download_res.saved_path and download_res.saved_path.endswith(".html"):
                pages_processed += 1
                if download_res.saved_path and Path(download_res.saved_path).exists():
                    with open(download_res.saved_path, "r", encoding="utf-8", errors="replace") as f:
                        html_text = f.read()

                    # 1. Discover new links if depth allows
                    if depth < source.max_depth:
                        nav_links, doc_links = discovery.extract_links_from_html(html_text, canonical)
                        for l in nav_links + doc_links:
                            if l not in seen_urls:
                                url_queue.append((l, depth + 1))

                        # Check pagination
                        next_page = discovery.detect_pagination_next(html_text, canonical)
                        if next_page and next_page not in seen_urls:
                            url_queue.append((next_page, depth))

                    # 2. Extract ProductRecords
                    prods = extractor.extract_from_html(html_text, canonical, download_res.content_hash)
                    extracted.extend(prods)
                    stats["products_extracted"] += len(prods)
                    self.acquisition_store.record_processed(canonical, "html_extractor")

            elif "pdf" in ct or (download_res.saved_path and download_res.saved_path.endswith(".pdf")):
                stats["pdfs"] += 1
                if download_res.saved_path and Path(download_res.saved_path).exists():
                    with open(download_res.saved_path, "rb") as f:
                        pdf_bytes = f.read()
                    prod = extractor.extract_from_pdf(pdf_bytes, canonical, download_res.content_hash)
                    if prod:
                        extracted.append(prod)
                        stats["products_extracted"] += 1
                    self.acquisition_store.record_processed(canonical, "pdf_extractor")

            elif "xml" in ct or "sitemap" in canonical.lower():
                # Parse Sitemap
                if download_res.saved_path and Path(download_res.saved_path).exists():
                    with open(download_res.saved_path, "r", encoding="utf-8", errors="replace") as f:
                        xml_text = f.read()
                    discovered_urls, nested_sitemaps = discovery.parse_sitemap(xml_text, canonical)
                    for u in discovered_urls:
                        if u not in seen_urls:
                            url_queue.append((u, depth + 1))
                    for sm in nested_sitemaps:
                        if sm not in seen_urls:
                            url_queue.append((sm, depth))

        return extracted

    def _run_downstream_pipeline(self, records: List[ProductRecord]) -> None:
        """
        Feeds newly extracted ProductRecords through existing processing stages:
        Normalize -> Validate & Conflict Quarantine -> Dedupe & Value Guard -> Split -> Manifest
        """
        # 1. Normalization
        normalizer = NormalizationProcessor()
        normalized, _ = normalizer.process_batch(records)

        # 2. Validation & Cross-Source Conflict Isolation
        validated, quarantined = DataValidationProcessor.detect_cross_source_conflicts(normalized)

        # 3. Deduplication & Value Guards
        deduper = DeduplicationProcessor()
        unique_records, value_conflicts = deduper.deduplicate(validated)

        # 4. Generate Task Dataset
        gen = ClassificationDatasetGenerator()
        examples = gen.generate(unique_records)

        # 5. Incremental Dataset Versioning
        import datetime
        version_num = f"crawl-{int(time.time())}"
        splitter = DeterministicDatasetSplitter()
        out_dir = str(settings.training_data_dir / f"dataset-{version_num}")
        manifest = splitter.persist_splits(
            [e.model_dump() for e in examples],
            output_dir=out_dir,
            dataset_name=f"autonomous_crawl_{version_num}",
            version=version_num,
        )

        print("\n" + "=" * 65)
        print(" AUTONOMOUS PIPELINE EXECUTION REPORT")
        print("=" * 65)
        print(f"Total Extracted:   {len(records)}")
        print(f"Validated:         {len(validated)}")
        print(f"Quarantined:       {len(quarantined)}")
        print(f"Deduplicated:      {len(unique_records)} (Value conflicts: {len(value_conflicts)})")
        print(f"Task Examples:     {len(examples)}")
        print(f"Dataset Version:   dataset-{version_num}")
        print(f"Manifest Checksum: {manifest.checksum_sha256[:16]}...")
        print(f"Snapshot Location: {out_dir}")
        print("=" * 65 + "\n")

    def _print_summary(self, stats: Dict[str, int]) -> None:
        print("\n" + "=" * 65)
        print(" AUTONOMOUS DATA COLLECTION SUMMARY")
        print("=" * 65)
        print(f"Sources configured:    {stats['sources_count']}")
        print(f"URLs found:            {stats['urls_discovered']}")
        print(f"Downloaded:            {stats['downloaded']}")
        print(f"Skipped / Cached:      {stats['skipped']}")
        print(f"Failed:                {stats['failed']}")
        print(f"PDFs collected:        {stats['pdfs']}")
        print(f"Products extracted:    {stats['products_extracted']}")
        print("=" * 65 + "\n")
