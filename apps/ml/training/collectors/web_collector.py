"""
Autonomous Web Collector.

Extends BaseCollector to provide automated discovery, crawling, extraction,
and downstream dataset pipeline integration across approved declarative sources.
"""

import time
import logging
import threading
import queue
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
import json
import httpx

from .base import BaseCollector
from ..schemas.product import ProductRecord
from ..schemas.manifest import DatasetManifest
from ..config import settings
from .web.registry import SourceRegistry, SourceConfig, resolve_document_worker_counts
from .web.policy import CrawlPolicyManager
from .web.downloader import ResilientDownloader, DownloadResult
from .web.acquisition import AcquisitionStore, DocumentTextCache
from .web.discovery import DiscoveryEngine, canonicalize_url
from .web.extractor import ContentExtractor

# Import existing processors and generators
from ..processors.normalization import NormalizationProcessor
from ..processors.validation import DataValidationProcessor
from ..processors.deduplication import DeduplicationProcessor
from ..processors.cross_source import CrossSourceAnalyzer
from ..generators.classification import ClassificationDatasetGenerator
from ..datasets.splitter import DeterministicDatasetSplitter
from ..utils.progress import LiveProgress
from ..utils.profiling import format_duration

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
        self.text_cache = DocumentTextCache(
            cache_dir=str(self.raw_base / "metadata" / "documents_text")
        )
        self.source_health: Dict[str, Dict[str, Any]] = {}
        # Guards shared stats counters when document workers run concurrently.
        self._stats_lock = threading.Lock()

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
        quiet: bool = False,
        verbose: bool = False,
        document_workers: int = 1,
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

        # Track all sources (including disabled ones)
        self.source_health = {}
        all_registered = self.registry.get_sources(enabled_only=False)
        for s in all_registered:
            if not s.enabled:
                self.source_health[s.id] = {
                    "name": s.name,
                    "status": "SKIPPED",
                    "products": 0,
                    "documents": 0,
                    "failures": 0,
                    "reason": "Disabled in sources.yaml",
                }

        all_extracted_records: List[ProductRecord] = []
        stats = {
            "sources_count": len(sources),
            "urls_discovered": 0,
            "downloaded": 0,
            "cached": 0,
            "skipped": 0,
            "failed": 0,
            "pdfs": 0,
            "products_extracted": 0,
        }

        total_sources = len(sources)
        for idx, source in enumerate(sources, 1):
            try:
                source_records = self._collect_source(
                    source,
                    max_pages=max_pages or source.max_pages,
                    max_files=max_files or source.max_files,
                    dry_run=dry_run,
                    resume=resume,
                    client=client,
                    stats=stats,
                    source_idx=idx,
                    total_sources=total_sources,
                    quiet=quiet,
                    verbose=verbose,
                    document_workers=document_workers,
                )
                all_extracted_records.extend(source_records)
            except Exception as e:
                logger.exception(f"Unhandled error collecting from source {source.id}: {e}")
                stats["failed"] += 1
                self.source_health[source.id] = {
                    "name": source.name,
                    "status": "FAILED",
                    "products": 0,
                    "documents": 0,
                    "failures": 1,
                    "reason": f"Unhandled {type(e).__name__}: {str(e)}",
                }

        # Save crawl database
        self.acquisition_store.save()
        self.last_stats = stats

        # Print summary
        if not quiet:
            self._print_summary(stats)

        # Run existing pipeline: Clean -> Normalize -> Validate -> Dedupe -> Split -> Manifest
        if auto_process and not dry_run and all_extracted_records:
            self._run_downstream_pipeline(all_extracted_records, quiet=quiet, verbose=verbose)

        return all_extracted_records

    def _download_resource(
        self,
        canonical: str,
        source: SourceConfig,
        client: Optional[httpx.Client],
        resume: bool,
        stats: Dict[str, int],
    ) -> Optional[DownloadResult]:
        """Downloads a single URL and updates acquisition records."""
        existing = self.acquisition_store.get_record(canonical)
        cached_hash = existing.content_hash if existing and resume else None
        cached_etag = existing.etag if existing and resume else None
        cached_last_mod = existing.last_modified if existing and resume else None
        try:
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
        except Exception as e:
            download_res = DownloadResult(
                url=canonical,
                status_code=500,
                error=f"DOWNLOAD_EXCEPTION: {type(e).__name__}: {str(e)}",
            )

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
            with self._stats_lock:
                stats["failed"] += 1
            return None

        if download_res.is_cached:
            with self._stats_lock:
                stats["cached"] = stats.get("cached", 0) + 1
            return download_res

        with self._stats_lock:
            stats["downloaded"] += 1
        return download_res

    def _reuse_cached_pdf_record(
        self, extractor: ContentExtractor, rec: Any
    ) -> Optional[ProductRecord]:
        """
        Rebuilds a ProductRecord for an already-downloaded PDF.

        Prefers the sidecar text cache so unchanged PDFs are never parsed twice;
        falls back to a single pypdf pass (and populates the cache) when missing.
        """
        cached = self.text_cache.get(rec.content_hash)
        if cached is not None:
            return extractor.build_pdf_record(
                cached.get("text", ""),
                cached.get("title"),
                rec.canonical_url,
                rec.content_hash or "",
            )
        try:
            combined_text, title = extractor.read_pdf_text(rec.local_path)
        except Exception:
            return None
        prod = extractor.build_pdf_record(combined_text, title, rec.canonical_url, rec.content_hash or "")
        if prod:
            self.text_cache.put(rec.content_hash, {"text": combined_text, "title": title})
        return prod

    def _process_document_queue(
        self,
        doc_queue: List[str],
        source: SourceConfig,
        extractor: ContentExtractor,
        client: Optional[httpx.Client],
        resume: bool,
        stats: Dict[str, int],
        max_files: int,
        progress: Any,
        document_workers: int,
    ) -> List[ProductRecord]:
        """
        Acquires documents with decoupled, bounded concurrency.

        Downloads run in a worker pool whose request *starts* are still spaced by
        the source's per-domain rate limit (enforced inside the downloader). A
        separate pool parses/extracts completed PDFs while further downloads are
        in flight, so CPU work no longer serializes network acquisition.

        A single document failing (timeout, protocol error, corrupt PDF, parse or
        extraction error) is recorded and never terminates the queue.
        """
        docs = list(doc_queue[:max_files])
        total = len(docs)
        if total == 0:
            return []

        # download_workers = network/request concurrency (bounded by the source's
        # request-concurrency policy); parse_workers = CPU concurrency.
        download_workers, parse_workers = resolve_document_worker_counts(
            document_workers, source.rate_limit
        )
        records_by_index: Dict[int, ProductRecord] = {}
        result_lock = threading.Lock()
        counter_lock = threading.Lock()
        counters = {"downloaded": 0, "parsed": 0, "extracted": 0, "failed": 0, "bytes": 0}
        work_queue: "queue.Queue" = queue.Queue(maxsize=max(2, parse_workers * 2))

        def download_task(idx: int, canonical: str) -> None:
            dl: Optional[DownloadResult] = None
            try:
                dl = self._download_resource(canonical, source, client, resume, stats)
                if dl and not dl.error and not dl.is_cached:
                    with self._stats_lock:
                        stats["pdfs"] += 1
                with counter_lock:
                    if dl is not None and not dl.error and not dl.is_cached:
                        counters["downloaded"] += 1
                        if dl.content_length:
                            counters["bytes"] += dl.content_length
                    elif dl is not None and dl.error:
                        counters["failed"] += 1
            except Exception:
                # A download must never break the queue; record and continue.
                with counter_lock:
                    counters["failed"] += 1
                with self._stats_lock:
                    stats["failed"] += 1
            finally:
                work_queue.put((idx, canonical, dl))

        def parse_worker() -> None:
            while True:
                item = work_queue.get()
                try:
                    if item is None:
                        return
                    idx, canonical, dl = item
                    try:
                        if dl is not None and dl.saved_path and Path(dl.saved_path).exists():
                            prod: Optional[ProductRecord] = None
                            parse_error: Optional[str] = None
                            try:
                                cached = self.text_cache.get(dl.content_hash)
                                if cached is not None:
                                    prod = extractor.build_pdf_record(
                                        cached.get("text", ""),
                                        cached.get("title"),
                                        canonical,
                                        dl.content_hash or "",
                                    )
                                else:
                                    combined_text, title = extractor.read_pdf_text(dl.saved_path)
                                    prod = extractor.build_pdf_record(combined_text, title, canonical, dl.content_hash or "")
                                    if prod:
                                        self.text_cache.put(dl.content_hash, {"text": combined_text, "title": title})
                            except Exception as e:
                                parse_error = f"PDF_PARSE_ERROR: {type(e).__name__}: {str(e)}"
                                prod = None

                            if prod is not None:
                                with result_lock:
                                    records_by_index[idx] = prod
                                self.acquisition_store.record_processed(canonical, "pdf_extractor")
                                with counter_lock:
                                    counters["extracted"] += 1
                            else:
                                with counter_lock:
                                    counters["failed"] += 1
                                if parse_error is not None:
                                    with self._stats_lock:
                                        stats["failed"] += 1
                                    self.acquisition_store.record_parse_failure(canonical, parse_error)
                    except Exception:
                        with counter_lock:
                            counters["failed"] += 1
                        with self._stats_lock:
                            stats["failed"] += 1
                    finally:
                        with counter_lock:
                            counters["parsed"] += 1
                finally:
                    work_queue.task_done()

        parse_threads = [threading.Thread(target=parse_worker, daemon=True) for _ in range(parse_workers)]
        for t in parse_threads:
            t.start()

        start_time = time.time()
        download_pool = ThreadPoolExecutor(max_workers=download_workers)
        futures = []
        try:
            for idx, canonical in enumerate(docs):
                self.acquisition_store.record_discovered(canonical, canonical, source.id)
                futures.append(download_pool.submit(download_task, idx, canonical))

            last_saved = 0
            while True:
                done_downloads = sum(1 for f in futures if f.done())
                with counter_lock:
                    snap = dict(counters)
                elapsed = max(1e-6, time.time() - start_time)
                rate = snap["parsed"] / elapsed
                remaining = max(0, total - snap["parsed"])
                eta = remaining / rate if rate > 0 else 0.0
                avg_mb = (snap["bytes"] / snap["downloaded"] / (1024 * 1024)) if snap["downloaded"] else 0.0
                progress.update(
                    current=snap["parsed"],
                    total=total,
                    metrics={
                        "downloaded": snap["downloaded"],
                        "extracted": snap["extracted"],
                        "failed": snap["failed"],
                        "workers": download_workers,
                        "parseWorkers": parse_workers,
                        "docs/min": round(rate * 60, 1),
                        "avgPDF MB": round(avg_mb, 2),
                        "ETA": format_duration(eta),
                    },
                )
                # Checkpoint crash-safety periodically without slowing the pipeline.
                if snap["parsed"] - last_saved >= 25:
                    self.acquisition_store.save()
                    last_saved = snap["parsed"]
                if done_downloads >= len(futures) and snap["parsed"] >= total:
                    break
                time.sleep(0.1)
        finally:
            download_pool.shutdown(wait=True)
            for _ in parse_threads:
                work_queue.put(None)
            for t in parse_threads:
                t.join()

        return [records_by_index[i] for i in sorted(records_by_index.keys())]

    def _collect_source(
        self,
        source: SourceConfig,
        max_pages: int,
        max_files: int,
        dry_run: bool,
        resume: bool,
        client: Optional[httpx.Client],
        stats: Dict[str, int],
        source_idx: int = 1,
        total_sources: int = 1,
        quiet: bool = False,
        verbose: bool = False,
        document_workers: int = 1,
    ) -> List[ProductRecord]:
        """Runs discovery and extraction for a single source."""
        if not quiet:
            print(f"\nSource {source_idx}/{total_sources}: {source.id}")

        start_failures = stats.get("failed", 0)
        start_pdfs = stats.get("pdfs", 0)

        discovery = DiscoveryEngine(source)
        extractor = ContentExtractor(source)
        extracted: List[ProductRecord] = []
        progress = LiveProgress(quiet=quiet, verbose=verbose)

        # 1. Decoupled Discovery Phase
        discovery_res = discovery.discover(
            policy_manager=self.policy_manager,
            acquisition_store=self.acquisition_store,
            client=client,
            resume=resume,
            progress=progress,
        )

        # Print structured DISCOVERY REPORT
        if not quiet:
            print("\n" + discovery_res.report.format_report() + "\n")
        stats["urls_discovered"] += discovery_res.report.final_crawl_queue
        stats["cached"] = stats.get("cached", 0) + discovery_res.report.skipped_cached

        if dry_run:
            stats["skipped"] += discovery_res.report.final_crawl_queue
            self.source_health[source.id] = {
                "name": source.name,
                "status": "COMPLETE",
                "products": 0,
                "documents": 0,
                "failures": 0,
                "reason": "Dry run (discovered only)",
            }
            return []

        # Load previously cached records so they participate in downstream dataset generation
        if resume and self.acquisition_store:
            cached_recs = self.acquisition_store.get_records_for_source(source.id)
            if cached_recs:
                progress.start_stage(f"Loading cached records from disk", total=len(cached_recs))
                for c_idx, rec in enumerate(cached_recs, 1):
                    if rec.local_path and Path(rec.local_path).exists():
                        try:
                            if rec.content_type == "application/pdf" or rec.local_path.endswith(".pdf"):
                                prod = self._reuse_cached_pdf_record(extractor, rec)
                                if prod:
                                    extracted.append(prod)
                            else:
                                with open(rec.local_path, "r", encoding="utf-8", errors="replace") as f:
                                    prods = extractor.extract_from_html(f.read(), rec.canonical_url, rec.content_hash or "")
                                    extracted.extend(prods)
                        except Exception:
                            pass
                    if c_idx % 250 == 0:
                        progress.update(current=c_idx, metrics={"records": len(extracted)})
                progress.finish_stage(f"Loaded {len(extracted):,} cached records")

        # 2. Execution Phase: Pages (HTML / Catalog / Products)
        pages_processed = 0
        page_queue = list(discovery_res.page_queue)
        doc_queue = list(discovery_res.doc_queue)
        seen_urls = set(page_queue + doc_queue)

        total_pages_to_crawl = min(len(page_queue), max_pages) if page_queue else 0
        if total_pages_to_crawl > 0:
            progress.start_stage("Downloading pages (HTML)", total=max_pages)

        while page_queue and pages_processed < max_pages:
            canonical = page_queue.pop(0)
            self.acquisition_store.record_discovered(canonical, canonical, source.id)

            download_res = self._download_resource(canonical, source, client, resume, stats)
            pages_processed += 1

            progress.update(
                current=pages_processed,
                metrics={
                    "products": stats["products_extracted"],
                    "failed": stats["failed"],
                    "cached": stats.get("cached", 0),
                    "skipped": stats["skipped"],
                },
            )

            if not download_res:
                continue

            if download_res.saved_path and Path(download_res.saved_path).exists():
                with open(download_res.saved_path, "r", encoding="utf-8", errors="replace") as f:
                    html_text = f.read()

                # Dynamic link & pagination discovery if depth allowed
                if source.max_depth > 0:
                    nav_links, doc_links = discovery.extract_links_from_html(html_text, canonical)
                    for l in nav_links:
                        if l not in seen_urls:
                            seen_urls.add(l)
                            page_queue.append(l)
                    for d in doc_links:
                        if d not in seen_urls:
                            seen_urls.add(d)
                            doc_queue.append(d)

                    next_page = discovery.detect_pagination_next(html_text, canonical)
                    if next_page and next_page not in seen_urls:
                        seen_urls.add(next_page)
                        page_queue.insert(0, next_page)

                # Extract products from HTML
                try:
                    prods = extractor.extract_from_html(html_text, canonical, download_res.content_hash)
                    extracted.extend(prods)
                    stats["products_extracted"] += len(prods)
                    self.acquisition_store.record_processed(canonical, "html_extractor")
                except Exception:
                    pass

            if pages_processed % 25 == 0:
                self.acquisition_store.save()

        self.acquisition_store.save()
        if total_pages_to_crawl > 0:
            progress.finish_stage()

        # 3. Execution Phase: Documents / PDFs (rate-limited downloads + decoupled parsing)
        total_docs_to_crawl = min(len(doc_queue), max_files) if doc_queue else 0
        if total_docs_to_crawl > 0:
            progress.start_stage("Downloading documents (PDFs)", total=total_docs_to_crawl)
            doc_records = self._process_document_queue(
                doc_queue=doc_queue,
                source=source,
                extractor=extractor,
                client=client,
                resume=resume,
                stats=stats,
                max_files=max_files,
                progress=progress,
                document_workers=document_workers,
            )
            extracted.extend(doc_records)
            with self._stats_lock:
                stats["products_extracted"] += len(doc_records)
            progress.finish_stage(
                f"Documents        {len(doc_records):,} records from {total_docs_to_crawl:,} PDFs"
            )

        self.acquisition_store.save()

        failures_count = stats.get("failed", 0) - start_failures
        docs_count = stats.get("pdfs", 0) - start_pdfs
        products_count = len(extracted)

        # Determine status
        if discovery_res.report.rejected_robots > 0 and discovery_res.report.final_crawl_queue == 0 and products_count == 0:
            status = "BLOCKED_BY_POLICY"
            reason = f"Blocked by robots.txt policy ({discovery_res.report.rejected_robots} disallowed URLs)"
        elif discovery_res.report.final_crawl_queue == 0 and products_count == 0:
            status = "NO_DATA"
            reason = "No discoverable product/catalog URLs found in sitemaps/seeds"
        elif products_count > 0:
            if failures_count > 0 and products_count < failures_count:
                status = "PARTIAL"
                reason = f"Encountered {failures_count} failures with {products_count} records extracted"
            else:
                status = "COMPLETE"
                reason = ""
        else:
            if failures_count > 0:
                status = "FAILED"
                reason = f"All {failures_count} download attempts failed"
            else:
                status = "NO_DATA"
                reason = "Pages retrieved but no product records could be extracted"

        self.source_health[source.id] = {
            "name": source.name,
            "status": status,
            "products": products_count,
            "documents": docs_count,
            "failures": failures_count,
            "reason": reason,
        }

        return extracted

    def _run_downstream_pipeline(
        self, records: List[ProductRecord], quiet: bool = False, verbose: bool = False
    ) -> None:
        """
        Feeds newly extracted ProductRecords through existing processing stages:
        Normalize -> Validate & Conflict Quarantine -> Dedupe & Value Guard -> Split -> Manifest
        """
        progress = LiveProgress(quiet=quiet, verbose=verbose)

        # 1. Normalization
        progress.start_stage("Normalizing", total=len(records))
        normalizer = NormalizationProcessor()
        normalized, _ = normalizer.process_batch(records)
        progress.finish_stage(f"Normalizing      {len(normalized):,}/{len(records):,}")

        # 2. Validation & Cross-Source Conflict Isolation
        progress.start_stage("Validating", total=len(normalized))
        validated, quarantined = DataValidationProcessor.detect_cross_source_conflicts(normalized)
        progress.finish_stage(f"Validating       {len(validated):,}/{len(normalized):,}")

        # 3. Deduplication & Value Guards
        progress.start_stage("Deduplicating", total=len(validated))
        deduper = DeduplicationProcessor()
        unique_records, value_conflicts = deduper.deduplicate(validated)
        progress.finish_stage(f"Deduplicating    {len(unique_records):,}/{len(validated):,}")

        # 4. Generate Task Dataset
        # 4. Generate Task Datasets across all Ananya ML capabilities
        progress.start_stage("Generating task datasets", total=len(unique_records))
        from ..generators import (
            ClassificationDatasetGenerator,
            AttributeExtractionDatasetGenerator,
            AttributeRelevanceDatasetGenerator,
            EntityResolutionDatasetGenerator,
            NormalizationDatasetGenerator,
            DuplicateMatchingDatasetGenerator,
            SimilarityDatasetGenerator,
        )

        cls_gen = ClassificationDatasetGenerator()
        cls_examples = cls_gen.generate(unique_records)

        attr_ext_gen = AttributeExtractionDatasetGenerator()
        attr_ext_examples = attr_ext_gen.generate(unique_records)

        attr_rel_gen = AttributeRelevanceDatasetGenerator()
        attr_rel_examples = attr_rel_gen.generate(unique_records)

        entity_gen = EntityResolutionDatasetGenerator()
        entity_examples = entity_gen.generate(unique_records)

        norm_gen = NormalizationDatasetGenerator()
        norm_examples = norm_gen.generate(unique_records)

        dup_gen = DuplicateMatchingDatasetGenerator()
        dup_examples = dup_gen.generate(unique_records)

        sim_gen = SimilarityDatasetGenerator()
        sim_examples = sim_gen.generate(unique_records)

        task_counts = {
            "classification": len(cls_examples),
            "attribute_extraction": len(attr_ext_examples),
            "attribute_relevance": len(attr_rel_examples),
            "entity_resolution": len(entity_examples),
            "normalization": len(norm_examples),
            "duplicate_matching": len(dup_examples),
            "similarity": len(sim_examples),
        }
        total_task_examples = sum(task_counts.values())
        progress.finish_stage(f"Generating tasks  {total_task_examples:,} total task examples")

        # 5. Incremental Dataset Versioning & Splitting
        progress.start_stage("Splitting dataset", total=None)
        import datetime
        version_num = f"crawl-{int(time.time())}"
        splitter = DeterministicDatasetSplitter()
        out_dir = Path(settings.training_data_dir) / f"dataset-{version_num}"
        out_dir.mkdir(parents=True, exist_ok=True)

        # Persist standard classification split
        manifest = splitter.persist_splits(
            [e.model_dump() for e in cls_examples],
            output_dir=str(out_dir),
            dataset_name=f"autonomous_crawl_{version_num}",
            version=version_num,
        )

        # Persist task-specific JSONL corpora
        tasks_dir = out_dir / "tasks"
        tasks_dir.mkdir(parents=True, exist_ok=True)
        task_payloads = {
            "classification": [e.model_dump() for e in cls_examples],
            "attribute_extraction": [e.model_dump() for e in attr_ext_examples],
            "attribute_relevance": [e.model_dump() for e in attr_rel_examples],
            "entity_resolution": [e.model_dump() for e in entity_examples],
            "normalization": [e.model_dump() for e in norm_examples],
            "duplicate_matching": [e.model_dump() for e in dup_examples],
            "similarity": [e.model_dump() for e in sim_examples],
        }
        for task_name, task_list in task_payloads.items():
            task_file = tasks_dir / f"{task_name}.jsonl"
            with open(task_file, "w", encoding="utf-8") as tf:
                for item in task_list:
                    tf.write(json.dumps(item, default=str) + "\n")

        # Persist unique records, quarantine, and source health
        with open(out_dir / "unique_records.json", "w", encoding="utf-8") as f:
            json.dump([r.model_dump() for r in unique_records], f, indent=2, default=str)

        with open(out_dir / "quarantined.json", "w", encoding="utf-8") as f:
            json.dump(
                [{"record": r.model_dump(), "reasons": a.reasons, "disposition": a.disposition.value} for r, a in quarantined],
                f,
                indent=2,
                default=str,
            )

        with open(out_dir / "source_health.json", "w", encoding="utf-8") as f:
            json.dump(self.source_health, f, indent=2)

        # Cross-Source Analysis
        cross_analyzer = CrossSourceAnalyzer(unique_records)
        cross_report = cross_analyzer.analyze()
        with open(out_dir / "cross_source_analysis.json", "w", encoding="utf-8") as f:
            json.dump(cross_report, f, indent=2)

        # 6. Quality Metrics Calculation
        total_unique = len(unique_records)
        missing_names = sum(1 for r in unique_records if not r.name or r.name.startswith("Product AUTO-"))
        missing_mfg = sum(1 for r in unique_records if not r.manufacturer or r.manufacturer.lower() in ("generic", "unknown"))
        missing_mpn = sum(1 for r in unique_records if not r.mpn or r.mpn.startswith("AUTO-"))
        with_attrs = sum(1 for r in unique_records if r.attributes and len(r.attributes) > 0)
        with_desc = sum(1 for r in unique_records if r.description and len(r.description.strip()) > 0)
        with_prov = sum(1 for r in unique_records if r.provenance and r.provenance.source_url)
        dup_rate = ((len(validated) - len(unique_records)) / len(validated) * 100.0) if validated else 0.0

        self.last_pipeline_report = {
            "version": f"dataset-{version_num}",
            "manifest_checksum": manifest.checksum_sha256,
            "snapshot_location": str(out_dir),
            "total_extracted": len(records),
            "validated": len(validated),
            "quarantined": len(quarantined),
            "deduplicated": len(unique_records),
            "value_conflicts": len(value_conflicts),
            "duplicate_rate_pct": dup_rate,
            "missing_names": missing_names,
            "missing_manufacturer": missing_mfg,
            "missing_mpn": missing_mpn,
            "with_attributes": with_attrs,
            "with_descriptions": with_desc,
            "provenance_coverage": with_prov,
            "train_count": manifest.split_counts.train,
            "val_count": manifest.split_counts.validation,
            "test_count": manifest.split_counts.test,
            "task_counts": task_counts,
            "cross_source": cross_report,
            "source_health": self.source_health,
        }

        progress.finish_stage(f"Splitting        train {manifest.split_counts.train:,} | val {manifest.split_counts.validation:,} | test {manifest.split_counts.test:,}")

        if not quiet:
            print("\n" + "=" * 65)
            print(" AUTONOMOUS PIPELINE EXECUTION REPORT")
            print("=" * 65)
            print(f"Total Extracted:         {len(records):,}")
            print(f"Validated:               {len(validated):,}")
            print(f"Quarantined:             {len(quarantined):,}")
            print(f"Deduplicated:            {len(unique_records):,} (Duplicate rate: {dup_rate:.1f}%)")
            print(f"Value Guard Conflicts:   {len(value_conflicts):,}")
            print("-" * 65)
            print(f"Records with Attributes: {with_attrs:,} ({with_attrs/total_unique*100:.1f}%)" if total_unique else "Records with Attributes: 0")
            print(f"Records with Desc/Specs: {with_desc:,} ({with_desc/total_unique*100:.1f}%)" if total_unique else "Records with Desc/Specs: 0")
            print(f"Missing Product Names:   {missing_names:,}")
            print(f"Missing Manufacturer:    {missing_mfg:,}")
            print(f"Missing MPN:             {missing_mpn:,}")
            print(f"Provenance Coverage:     {with_prov:,} ({with_prov/total_unique*100:.1f}%)" if total_unique else "Provenance Coverage: 0")
            print("-" * 65)
            print("TASK EXAMPLES GENERATED:")
            for t_name, t_cnt in task_counts.items():
                print(f"  - {t_name.replace('_', ' ').title():<24}: {t_cnt:,}")
            print("-" * 65)
            print("CROSS-SOURCE CONSISTENCY:")
            print(f"  - Same MPN across sources : {cross_report['same_mpn_cross_source_count']:,}")
            print(f"  - Packaging suffix variants: {cross_report['packaging_suffix_variants_count']:,}")
            print(f"  - Distributor naming diffs : {cross_report['distributor_naming_diffs_count']:,}")
            print(f"  - Unit reconciliations     : {cross_report['unit_reconciliations_count']:,}")
            print(f"  - Manufacturer aliases     : {cross_report['manufacturer_aliases_count']:,}")
            print("-" * 65)
            print(f"Dataset Version:         dataset-{version_num}")
            print(f"Train / Val / Test:      {manifest.split_counts.train:,} / {manifest.split_counts.validation:,} / {manifest.split_counts.test:,}")
            print(f"Manifest Checksum:       {manifest.checksum_sha256[:16]}...")
            print(f"Snapshot Location:       {out_dir}")
            print("=" * 65 + "\n")

    def _print_summary(self, stats: Dict[str, int]) -> None:
        print("\n" + "=" * 65)
        print(" AUTONOMOUS DATA COLLECTION SUMMARY")
        print("=" * 65)
        print(f"Sources configured:    {stats['sources_count']:,}")
        print(f"URLs found:            {stats['urls_discovered']:,}")
        print(f"Downloaded:            {stats['downloaded']:,}")
        print(f"Cached:                {stats.get('cached', 0):,}")
        print(f"Skipped:               {stats['skipped']:,}")
        print(f"Failed:                {stats['failed']:,}")
        print(f"PDFs collected:        {stats['pdfs']:,}")
        print(f"Products extracted:    {stats['products_extracted']:,}")
        print("=" * 65)

        if self.source_health:
            print("\n" + "=" * 80)
            print(" SOURCE HEALTH TRACKING")
            print("=" * 80)
            print(f"{'Source':<32} {'Status':<18} {'Products':>10} {'Documents':>10} {'Failures':>9}")
            print("-" * 80)
            for sid, h in self.source_health.items():
                s_name = (h.get('name') or sid)[:31]
                s_status = h.get('status', 'UNKNOWN')
                s_prods = f"{h.get('products', 0):,}"
                s_docs = f"{h.get('documents', 0):,}"
                s_fails = f"{h.get('failures', 0):,}"
                print(f"{s_name:<32} {s_status:<18} {s_prods:>10} {s_docs:>10} {s_fails:>9}")
            print("-" * 80)
            non_complete = [h for h in self.source_health.values() if h.get("status") != "COMPLETE" and h.get("reason")]
            if non_complete:
                print("Source Status Explanations:")
                for nc in non_complete:
                    print(f"  - {nc.get('name', 'Unknown')}: {nc.get('status')} ({nc.get('reason')})")
            print("=" * 80 + "\n")
