"""
Robots.txt & Crawl Policy Management.

Respects:
- robots.txt rules and directives
- Crawl-delay instructions
- Domain rate limits
- HTTP 429 Retry-After responses
- Strict domain boundaries
"""

import time
import threading
import urllib.robotparser
from urllib.parse import urlparse
from typing import Dict, List, Optional, Tuple, Any
import httpx


class CrawlPolicyManager:
    """Manages crawl compliance, robots.txt caching, and domain rate limiting."""

    def __init__(
        self,
        default_delay: float = 1.0,
        user_agent: str = "AnanyaBot/1.0",
        custom_rate_limit: Optional[float] = None,
    ):
        if custom_rate_limit and custom_rate_limit > 0:
            self.default_delay = 1.0 / custom_rate_limit
            self.has_custom_rate_limit = True
        else:
            self.default_delay = default_delay
            self.has_custom_rate_limit = False
        self.user_agent = user_agent
        self._parsers: Dict[str, urllib.robotparser.RobotFileParser] = {}
        self._sitemaps: Dict[str, List[str]] = {}
        self._last_request_time: Dict[str, float] = {}
        self._custom_delays: Dict[str, float] = {}
        self._retry_after_until: Dict[str, float] = {}
        # Guards request-slot reservation so concurrent workers cannot start two
        # requests within the configured per-domain interval.
        self._rate_lock = threading.Lock()
        # Guards one-time robots.txt parsing under concurrent document workers.
        self._robots_lock = threading.RLock()

    def get_domain(self, url: str) -> str:
        return urlparse(url).netloc.lower()

    def set_robots_txt(self, domain: str, robots_content: str) -> None:
        """Injects robots.txt content directly (useful for tests or pre-cached rules)."""
        parser = urllib.robotparser.RobotFileParser()
        lines = robots_content.splitlines()
        parser.parse(lines)
        dom = domain.lower()
        self._parsers[dom] = parser
        for line in lines:
            line_str = line.strip()
            if line_str.lower().startswith("sitemap:"):
                sm = line_str.split(":", 1)[1].strip()
                if sm:
                    self._sitemaps.setdefault(dom, []).append(sm)

    def fetch_robots_txt(self, domain: str, client: Optional[httpx.Client] = None) -> None:
        """Fetches robots.txt over HTTP if not already cached."""
        with self._robots_lock:
            dom = domain.lower().split(":")[0].strip()
            if dom in self._parsers:
                return

            robots_url = f"https://{dom}/robots.txt"
            parser = urllib.robotparser.RobotFileParser()
            parser.set_url(robots_url)

            try:
                if client:
                    res = client.get(robots_url, timeout=5.0)
                else:
                    with httpx.Client(timeout=5.0, follow_redirects=True) as local_client:
                        res = local_client.get(robots_url)

                if res.status_code == 200:
                    lines = res.text.splitlines()
                    parser.parse(lines)
                    for line in lines:
                        line_str = line.strip()
                        if line_str.lower().startswith("sitemap:"):
                            sm = line_str.split(":", 1)[1].strip()
                            if sm:
                                self._sitemaps.setdefault(dom, []).append(sm)
                elif res.status_code in (401, 403):
                    # Explicitly forbidden
                    parser.disallow_all = True
                else:
                    # If 404 or other, standard convention allows crawling
                    parser.allow_all = True
            except Exception:
                # Conservative: allow with default delay on network error fetching robots
                parser.allow_all = True

            self._parsers[dom] = parser

    def get_sitemaps(self, domain: str, client: Optional[httpx.Client] = None) -> List[str]:
        """Returns sitemap URLs declared in robots.txt for the given domain."""
        dom = domain.lower().split(":")[0].strip()
        if dom not in self._parsers:
            self.fetch_robots_txt(dom, client=client)
        return list(dict.fromkeys(self._sitemaps.get(dom, [])))

    def can_fetch(self, url: str, client: Optional[httpx.Client] = None) -> bool:
        """Checks whether robots.txt permits crawling the given URL."""
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        if not domain:
            return False

        # Normalise away any explicit port so the parser cache key matches the
        # key used when robots.txt was fetched (otherwise hosts with ports refetch).
        lookup_domain = domain.split(":")[0].strip()
        if lookup_domain not in self._parsers:
            self.fetch_robots_txt(domain, client=client)

        parser = self._parsers.get(lookup_domain)
        if not parser:
            return True

        return parser.can_fetch(self.user_agent, url)

    def is_allowed(self, url: str, client: Optional[httpx.Client] = None) -> bool:
        """Alias for can_fetch for convenience."""
        return self.can_fetch(url, client=client)

    def can_crawl_now(self, url: str) -> bool:
        """Returns True if the domain is not currently blocked by a Retry-After delay."""
        domain = self.get_domain(url)
        with self._rate_lock:
            return time.time() >= self._retry_after_until.get(domain, 0.0)

    def wait_for_rate_limit(self, url: str, configured_delay: Optional[float] = None) -> None:
        """
        Enforces a polite minimum interval between request *starts* to the same domain.

        The wait and the reservation of the next request slot happen under a lock so
        that concurrent document workers cannot issue two requests closer together
        than the configured per-domain delay. Overlapping transfers are still
        permitted: only the spacing of request starts is constrained here.
        """
        domain = self.get_domain(url)
        with self._rate_lock:
            now = time.time()

            # Check if 429 Retry-After is active
            retry_until = self._retry_after_until.get(domain, 0.0)
            if now < retry_until:
                wait_time = retry_until - now
                time.sleep(wait_time)
                now = time.time()

            # Determine effective delay
            parser = self._parsers.get(domain)
            robots_delay = parser.crawl_delay(self.user_agent) if parser else None
            if getattr(self, "has_custom_rate_limit", False):
                delay = robots_delay or self.default_delay
            else:
                delay = robots_delay or configured_delay or self.default_delay

            last_time = self._last_request_time.get(domain, 0.0)
            elapsed = now - last_time
            if elapsed < delay:
                time.sleep(delay - elapsed)

            # Reserve this request's start slot before releasing the lock.
            self._last_request_time[domain] = time.time()

    def record_retry_after(
        self,
        url_or_domain: str,
        retry_after: Any = None,
        retry_after_seconds: Optional[float] = None,
    ) -> None:
        """Records HTTP 429 Retry-After header delay."""
        domain = self.get_domain(url_or_domain) if "://" in url_or_domain else url_or_domain.lower()
        with self._rate_lock:
            if retry_after_seconds is not None:
                self._retry_after_until[domain] = time.time() + float(retry_after_seconds)
                return

            if not retry_after:
                return

            try:
                seconds = float(retry_after)
                self._retry_after_until[domain] = time.time() + min(seconds, 300.0)  # Cap at 5 mins
            except ValueError:
                pass
