"""
Declarative Source Registry for Autonomous Data Collection.

Manages sources, allowed domain boundaries, quality tiers, rate limits, and discovery strategies.
"""

from enum import Enum
from typing import List, Dict, Any, Optional
from pathlib import Path
import yaml
from urllib.parse import urlparse
from pydantic import BaseModel, Field, AliasChoices, field_validator, model_validator
from ...schemas.product import ProductDomain


class SourceType(str, Enum):
    MANUFACTURER = "manufacturer"
    DISTRIBUTOR = "distributor"
    PUBLIC_DATASET = "public_dataset"
    TECHNICAL_DOCUMENT = "technical_document"
    CATALOG = "catalog"
    GENERIC_WEB = "generic_web"


class SourceQuality(str, Enum):
    AUTHORITATIVE_MANUFACTURER = "authoritative_manufacturer"
    DISTRIBUTOR = "distributor"
    PUBLIC_DATASET = "public_dataset"
    GENERIC_WEB = "generic_web"
    USER_SUPPLIED = "user_supplied"


class DiscoveryType(str, Enum):
    SITEMAP = "sitemap"
    CATALOG = "catalog"
    PRODUCT_PAGES = "product_pages"
    DOCUMENTS = "documents"
    LINKS = "links"


class RateLimitConfig(BaseModel):
    requests_per_second: float = 1.0
    delay_seconds: float = 1.0
    max_concurrent: int = 1

    @model_validator(mode="after")
    def compute_delay(self) -> "RateLimitConfig":
        if self.requests_per_second > 0 and (self.delay_seconds == 1.0 or self.delay_seconds <= 0):
            if self.requests_per_second != 1.0:
                self.delay_seconds = 1.0 / self.requests_per_second
        return self


class SourceConfig(BaseModel):
    """Declarative configuration for a crawlable data source."""

    id: str
    name: str
    type: SourceType = SourceType.GENERIC_WEB
    source_quality: SourceQuality = Field(
        default=SourceQuality.GENERIC_WEB,
        validation_alias=AliasChoices("source_quality", "quality"),
    )
    enabled: bool = True
    domains: List[str] = Field(min_length=1, description="Strict allowlist of domains for this source")
    start_urls: List[str] = Field(default_factory=list, description="Seed URLs (sitemaps, catalogs, or landing pages)")
    discovery: List[DiscoveryType] = Field(default_factory=lambda: [DiscoveryType.SITEMAP, DiscoveryType.PRODUCT_PAGES])
    rate_limit: RateLimitConfig = Field(default_factory=RateLimitConfig)
    max_depth: int = 3
    max_pages: int = 1000
    max_files: int = 500
    max_file_size_mb: float = Field(
        default=15.0,
        validation_alias=AliasChoices("max_file_size_mb", "file_size_limit_mb", "max_file_size"),
    )
    allowed_content_types: List[str] = Field(
        default_factory=lambda: [
            "text/html",
            "application/xhtml+xml",
            "application/pdf",
            "application/json",
            "text/xml",
            "application/xml",
        ]
    )
    group: Optional[str] = None
    default_domain: ProductDomain = ProductDomain.ELECTRONICS
    headers: Dict[str, str] = Field(default_factory=dict)
    user_agent: str = "AnanyaBot/1.0 (+https://ananya.48studios.internal/bot; data-training)"
    custom_parser: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("default_domain", mode="before")
    @classmethod
    def parse_domain(cls, v: Any) -> ProductDomain:
        if isinstance(v, str):
            v_clean = v.strip().upper().replace("-", "_")
            if v_clean == "3D_PRINTING":
                v_clean = "3D_PRINTING_MATERIALS"
            try:
                return ProductDomain(v_clean)
            except ValueError:
                return ProductDomain.OTHER
        return v

    @property
    def quality(self) -> SourceQuality:
        return self.source_quality

    def is_domain_allowed(self, host_or_url: str) -> bool:
        """Verifies if the given hostname or URL is strictly within the allowed domains."""
        if "://" in host_or_url:
            host_clean = urlparse(host_or_url).netloc.lower()
        else:
            host_clean = host_or_url.lower()
        if ":" in host_clean:
            host_clean = host_clean.split(":")[0].strip()
        for d in self.domains:
            d_clean = d.lower().split(":")[0].strip()
            if host_clean == d_clean or host_clean.endswith(f".{d_clean}"):
                return True
        return False


class SourceRegistry(BaseModel):
    """Registry holding all configured collection sources."""

    sources: List[SourceConfig] = Field(default_factory=list)

    @classmethod
    def from_yaml(cls, path: str) -> "SourceRegistry":
        p = Path(path)
        if not p.exists():
            return cls(sources=[])
        with open(p, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        return cls(**data)

    def get_source(self, source_id: str) -> Optional[SourceConfig]:
        for s in self.sources:
            if s.id == source_id:
                return s
        return None

    def get_sources(self, enabled_only: bool = True) -> List[SourceConfig]:
        if enabled_only:
            return [s for s in self.sources if s.enabled]
        return list(self.sources)

    def is_url_allowed(self, url: str) -> bool:
        from urllib.parse import urlparse
        netloc = urlparse(url).netloc
        for s in self.get_sources(enabled_only=True):
            if s.is_domain_allowed(netloc):
                return True
        return False
