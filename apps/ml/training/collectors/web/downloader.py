"""
Resilient HTTP Downloader with Caching, Deduplication, and Provenance Hashing.
"""

import os
import time
import hashlib
from typing import Optional, Dict, Any, Tuple, List
from pathlib import Path
from pydantic import BaseModel, Field
import httpx

from .policy import CrawlPolicyManager


class DownloadResult(BaseModel):
    url: str
    status_code: int = 200
    content_type: str = "text/html"
    content_hash: str = ""
    content_length: int = 0
    etag: Optional[str] = None
    last_modified: Optional[str] = None
    saved_path: Optional[str] = None
    is_cached: bool = False
    error: Optional[str] = None


class ResilientDownloader:
    """Downloader with exponential backoff, conditional requests, size limits, and SHA-256 hashing."""

    def __init__(
        self,
        raw_storage_base: str,
        policy_manager: Optional[CrawlPolicyManager] = None,
        timeout: float = 15.0,
        max_retries: int = 3,
        max_file_size_bytes: int = 15 * 1024 * 1024,  # 15 MB
        user_agent: str = "AnanyaBot/1.0 (+https://ananya.48studios.internal/bot; data-training)",
    ):
        self.raw_storage_base = Path(raw_storage_base)
        self.policy_manager = policy_manager or CrawlPolicyManager(user_agent=user_agent)
        self.timeout = timeout
        self.max_retries = max_retries
        self.max_file_size_bytes = max_file_size_bytes
        self.user_agent = user_agent

        # Ensure raw directories exist
        for subdir in ("web", "catalogs", "documents", "datasets", "metadata"):
            (self.raw_storage_base / subdir).mkdir(parents=True, exist_ok=True)

    def determine_storage_subdir(self, content_type: str, url: str) -> str:
        """Determines target raw subfolder based on content type and URL extension."""
        ct = content_type.lower()
        if "pdf" in ct or url.lower().endswith(".pdf"):
            return "documents"
        elif "json" in ct or "xml" in ct or url.lower().endswith((".json", ".xml", ".csv")):
            return "catalogs"
        return "web"

    def download(
        self,
        url: str,
        source_id: str,
        client: Optional[httpx.Client] = None,
        cached_etag: Optional[str] = None,
        cached_last_modified: Optional[str] = None,
        cached_hash: Optional[str] = None,
        rate_limit_delay: Optional[float] = None,
        max_file_size_bytes: Optional[int] = None,
        allowed_content_types: Optional[List[str]] = None,
    ) -> DownloadResult:
        """
        Downloads a resource over HTTP, checking robots.txt, rate limits, and caching.
        """
        # 1. Robots.txt Compliance Check
        if not self.policy_manager.can_fetch(url, client=client):
            return DownloadResult(
                url=url,
                status_code=403,
                error="BLOCKED_BY_ROBOTS_TXT: URL is prohibited by robots.txt rules",
            )

        # 2. Rate Limiting Check
        self.policy_manager.wait_for_rate_limit(url, configured_delay=rate_limit_delay)

        # 3. Setup Headers with Conditional GET
        headers = {"User-Agent": self.user_agent}
        if cached_etag:
            headers["If-None-Match"] = cached_etag
        if cached_last_modified:
            headers["If-Modified-Since"] = cached_last_modified

        should_close_client = False
        if client is None:
            client = httpx.Client(timeout=self.timeout, follow_redirects=True)
            should_close_client = True

        try:
            attempt = 0
            backoff = 1.0

            while attempt < self.max_retries:
                attempt += 1
                try:
                    response = client.get(url, headers=headers)

                    # Handle 429 Rate Limit
                    if response.status_code == 429:
                        self.policy_manager.record_retry_after(url, response.headers.get("Retry-After"))
                        time.sleep(backoff)
                        backoff *= 2.0
                        continue

                    # Handle 304 Not Modified
                    if response.status_code == 304:
                        resp_etag = response.headers.get("ETag") or response.headers.get("etag") or cached_etag
                        return DownloadResult(
                            url=url,
                            status_code=304,
                            content_hash=cached_hash or "",
                            etag=resp_etag,
                            last_modified=cached_last_modified,
                            is_cached=True,
                        )

                    # Transient server errors
                    if response.status_code in (502, 503, 504):
                        time.sleep(backoff)
                        backoff *= 2.0
                        continue

                    if response.status_code != 200:
                        return DownloadResult(
                            url=url,
                            status_code=response.status_code,
                            error=f"HTTP_{response.status_code}",
                        )

                    # Success: check file size limit
                    content = response.content
                    limit = max_file_size_bytes if max_file_size_bytes is not None else self.max_file_size_bytes
                    if len(content) > limit:
                        return DownloadResult(
                            url=url,
                            status_code=response.status_code,
                            error=f"FILE_SIZE_LIMIT_EXCEEDED: Size {len(content)} exceeds {limit}",
                        )

                    content_hash = hashlib.sha256(content).hexdigest()
                    raw_ct = response.headers.get("Content-Type") or response.headers.get("content-type") or "application/octet-stream"
                    content_type = raw_ct.split(";")[0].strip()

                    # Check allowed content types if specified
                    if allowed_content_types:
                        ct_lower = content_type.lower()
                        if not any(act.lower() in ct_lower for act in allowed_content_types):
                            return DownloadResult(
                                url=url,
                                status_code=response.status_code,
                                error=f"DISALLOWED_CONTENT_TYPE: '{content_type}' not in allowed list",
                            )

                    etag = response.headers.get("ETag") or response.headers.get("etag")
                    last_mod = response.headers.get("Last-Modified") or response.headers.get("last-modified")

                    # Check if unchanged by content hash
                    if cached_hash and cached_hash == content_hash:
                        return DownloadResult(
                            url=url,
                            status_code=200,
                            content_type=content_type,
                            content_hash=content_hash,
                            content_length=len(content),
                            etag=etag,
                            last_modified=last_mod,
                            is_cached=True,
                        )

                    # Persist raw bytes
                    subdir = self.determine_storage_subdir(content_type, url)
                    ext = ".pdf" if "pdf" in content_type else (".json" if "json" in content_type else ".html")
                    file_name = f"{source_id}_{content_hash[:16]}{ext}"
                    save_path = self.raw_storage_base / subdir / file_name

                    with open(save_path, "wb") as f:
                        f.write(content)

                    return DownloadResult(
                        url=url,
                        status_code=200,
                        content_type=content_type,
                        content_hash=content_hash,
                        content_length=len(content),
                        etag=etag,
                        last_modified=last_mod,
                        saved_path=str(save_path),
                        is_cached=False,
                    )

                except (httpx.TimeoutException, httpx.NetworkError) as e:
                    if attempt >= self.max_retries:
                        return DownloadResult(url=url, status_code=599, error=f"NETWORK_TIMEOUT: {str(e)}")
                    time.sleep(backoff)
                    backoff *= 2.0

            return DownloadResult(url=url, status_code=500, error="MAX_RETRIES_EXCEEDED")

        finally:
            if should_close_client:
                client.close()
