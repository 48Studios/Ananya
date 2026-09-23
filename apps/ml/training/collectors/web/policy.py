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
import urllib.robotparser
from urllib.parse import urlparse
from typing import Dict, Optional, Tuple, Any
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
        else:
            self.default_delay = default_delay
        self.user_agent = user_agent
        self._parsers: Dict[str, urllib.robotparser.RobotFileParser] = {}
        self._last_request_time: Dict[str, float] = {}
        self._custom_delays: Dict[str, float] = {}
        self._retry_after_until: Dict[str, float] = {}

    def get_domain(self, url: str) -> str:
        return urlparse(url).netloc.lower()

    def set_robots_txt(self, domain: str, robots_content: str) -> None:
        """Injects robots.txt content directly (useful for tests or pre-cached rules)."""
        parser = urllib.robotparser.RobotFileParser()
        parser.parse(robots_content.splitlines())
        self._parsers[domain.lower()] = parser

    def fetch_robots_txt(self, domain: str, client: Optional[httpx.Client] = None) -> None:
        """Fetches robots.txt over HTTP if not already cached."""
        if domain in self._parsers:
            return

        robots_url = f"https://{domain}/robots.txt"
        parser = urllib.robotparser.RobotFileParser()
        parser.set_url(robots_url)

        try:
            if client:
                res = client.get(robots_url, timeout=5.0)
                if res.status_code == 200:
                    parser.parse(res.text.splitlines())
                else:
                    # If 404 or other, standard convention allows crawling
                    parser.allow_all = True
            else:
                parser.read()
        except Exception:
            # Conservative: allow with default delay on network error fetching robots
            parser.allow_all = True

        self._parsers[domain] = parser

    def can_fetch(self, url: str, client: Optional[httpx.Client] = None) -> bool:
        """Checks whether robots.txt permits crawling the given URL."""
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        if not domain:
            return False

        if domain not in self._parsers:
            self.fetch_robots_txt(domain, client=client)

        parser = self._parsers.get(domain)
        if not parser:
            return True

        return parser.can_fetch(self.user_agent, url)

    def is_allowed(self, url: str, client: Optional[httpx.Client] = None) -> bool:
        """Alias for can_fetch for convenience."""
        return self.can_fetch(url, client=client)

    def can_crawl_now(self, url: str) -> bool:
        """Returns True if the domain is not currently blocked by a Retry-After delay."""
        domain = self.get_domain(url)
        return time.time() >= self._retry_after_until.get(domain, 0.0)

    def wait_for_rate_limit(self, url: str, configured_delay: Optional[float] = None) -> None:
        """Enforces polite delay between requests to the same domain."""
        domain = self.get_domain(url)
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
        delay = robots_delay or configured_delay or self.default_delay

        last_time = self._last_request_time.get(domain, 0.0)
        elapsed = now - last_time
        if elapsed < delay:
            time.sleep(delay - elapsed)

        self._last_request_time[domain] = time.time()

    def record_retry_after(
        self,
        url_or_domain: str,
        retry_after: Any = None,
        retry_after_seconds: Optional[float] = None,
    ) -> None:
        """Records HTTP 429 Retry-After header delay."""
        domain = self.get_domain(url_or_domain) if "://" in url_or_domain else url_or_domain.lower()
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
