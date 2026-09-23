"""
Acquisition Database & Crawl State Tracking.

Tracks the lifecycle of every discovered, downloaded, and extracted resource:
- Discovery timestamp
- Content hash, ETag, Last-Modified
- Download status and HTTP code
- Extraction and processing status
"""

import os
import json
import uuid
import threading
from typing import Dict, Any, Optional, List
from pathlib import Path
from datetime import datetime, timezone
from pydantic import BaseModel, Field


class AcquisitionRecord(BaseModel):
    """Tracks state and provenance for an individual discovered/downloaded URL."""

    source_id: str
    url: str
    canonical_url: str
    content_hash: Optional[str] = None
    etag: Optional[str] = None
    last_modified: Optional[str] = None
    first_seen: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    last_seen: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    last_downloaded: Optional[str] = None
    http_status: Optional[int] = None
    content_type: Optional[str] = None
    content_length: Optional[int] = None
    local_path: Optional[str] = None
    processing_status: str = "DISCOVERED"  # DISCOVERED, DOWNLOADED, PROCESSED, SKIPPED, FAILED
    parser: Optional[str] = None
    error: Optional[str] = None


class AcquisitionStore:
    """Persistent storage for acquisition records and crawl history."""

    def __init__(self, metadata_dir: str):
        self.metadata_dir = Path(metadata_dir)
        self.metadata_dir.mkdir(parents=True, exist_ok=True)
        self.state_file = self.metadata_dir / "acquisition.json"
        self._lock = threading.Lock()
        self._records: Dict[str, AcquisitionRecord] = {}
        self._load()

    def _load(self) -> None:
        if self.state_file.exists():
            try:
                with open(self.state_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                for k, v in data.items():
                    self._records[k] = AcquisitionRecord(**v)
            except Exception:
                pass

    def save(self) -> None:
        """Atomically saves the acquisition database."""
        with self._lock:
            temp_path = self.state_file.with_suffix(".tmp")
            data = {k: v.model_dump() for k, v in self._records.items()}
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            temp_path.replace(self.state_file)

    def get_record(self, canonical_url: str) -> Optional[AcquisitionRecord]:
        with self._lock:
            return self._records.get(canonical_url)

    def get_records_for_source(self, source_id: str) -> List[AcquisitionRecord]:
        with self._lock:
            return [r for r in self._records.values() if r.source_id == source_id]

    def is_cached(self, canonical_url: str) -> bool:
        with self._lock:
            rec = self._records.get(canonical_url)
            if not rec:
                return False
            if rec.local_path and Path(rec.local_path).exists() and rec.processing_status in ("DOWNLOADED", "PROCESSED", "SKIPPED"):
                return True
            return False

    def record_discovered(self, canonical_url: str, raw_url: str, source_id: str) -> AcquisitionRecord:
        with self._lock:
            now = datetime.now(timezone.utc).isoformat()
            if canonical_url in self._records:
                rec = self._records[canonical_url]
                rec.last_seen = now
                return rec

            rec = AcquisitionRecord(
                source_id=source_id,
                url=raw_url,
                canonical_url=canonical_url,
                first_seen=now,
                last_seen=now,
                processing_status="DISCOVERED",
            )
            self._records[canonical_url] = rec
            return rec

    def record_downloaded(
        self,
        canonical_url: str,
        http_status: int,
        content_hash: Optional[str] = None,
        content_type: Optional[str] = None,
        content_length: Optional[int] = None,
        etag: Optional[str] = None,
        last_modified: Optional[str] = None,
        local_path: Optional[str] = None,
        error: Optional[str] = None,
        is_cached: bool = False,
    ) -> AcquisitionRecord:
        with self._lock:
            rec = self._records.get(canonical_url)
            if not rec:
                rec = AcquisitionRecord(
                    source_id="unknown",
                    url=canonical_url,
                    canonical_url=canonical_url,
                )
                self._records[canonical_url] = rec

            now = datetime.now(timezone.utc).isoformat()
            rec.last_downloaded = now
            rec.http_status = http_status
            rec.content_hash = content_hash or rec.content_hash
            rec.content_type = content_type or rec.content_type
            rec.content_length = content_length or rec.content_length
            rec.etag = etag or rec.etag
            rec.last_modified = last_modified or rec.last_modified
            rec.local_path = local_path or rec.local_path
            rec.error = error

            if error:
                rec.processing_status = "FAILED"
            elif is_cached:
                rec.processing_status = "SKIPPED"
            else:
                rec.processing_status = "DOWNLOADED"

            return rec

    def record_processed(self, canonical_url: str, parser_name: str) -> None:
        with self._lock:
            rec = self._records.get(canonical_url)
            if rec:
                rec.processing_status = "PROCESSED"
                rec.parser = parser_name

    def record_parse_failure(self, canonical_url: str, error: str) -> None:
        """Records a parse/extraction failure so the document can be retried later."""
        with self._lock:
            rec = self._records.get(canonical_url)
            if rec:
                rec.processing_status = "FAILED"
                rec.error = error

    def get_summary(self) -> Dict[str, int]:
        with self._lock:
            summary = {
                "total_urls": len(self._records),
                "discovered": 0,
                "downloaded": 0,
                "processed": 0,
                "skipped": 0,
                "failed": 0,
            }
            for r in self._records.values():
                st = r.processing_status.lower()
                if st in summary:
                    summary[st] += 1
            return summary


class DocumentTextCache:
    """
    Sidecar cache of extracted PDF text/title keyed by content hash.

    Prevents re-parsing unchanged PDFs on resume while keeping the acquisition
    state file lean. Hashing and provenance remain authoritative in the
    AcquisitionStore; this cache only short-circuits the CPU-bound pypdf pass.
    """

    def __init__(self, cache_dir: str):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _path(self, content_hash: str) -> Path:
        return self.cache_dir / f"{content_hash}.json"

    def get(self, content_hash: Optional[str]) -> Optional[Dict[str, Any]]:
        if not content_hash:
            return None
        path = self._path(content_hash)
        if not path.exists():
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None

    def put(self, content_hash: Optional[str], payload: Dict[str, Any]) -> None:
        if not content_hash:
            return
        path = self._path(content_hash)
        # Unique temp name avoids races when two workers parse identical content.
        temp_path = path.parent / f".{path.name}.{uuid.uuid4().hex}.tmp"
        try:
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(payload, f)
            os.replace(temp_path, path)
        except Exception:
            try:
                if temp_path.exists():
                    temp_path.unlink()
            except OSError:
                pass
