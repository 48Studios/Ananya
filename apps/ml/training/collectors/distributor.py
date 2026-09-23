"""
Distributor Catalog & Feed Collector.

Ingests structured product feeds from distributor sources
(e.g. DigiKey, Mouser, McMaster-Carr, RS Components, Grainger, Fastenal).
"""

import json
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from pathlib import Path

from .base import BaseCollector
from ..schemas.product import (
    ProductRecord,
    ProductDomain,
    ProvenanceRecord,
    AttributeValueRecord,
    VerificationStatus,
)
from .ananya_db import infer_domain


class DistributorFeedCollector(BaseCollector):
    """Collector for distributor catalog feeds."""

    name = "distributor_feed"
    source_type = "distributor_catalog"

    def collect(
        self,
        feed_path: str,
        distributor_name: str = "Distributor",
        **kwargs: Any,
    ) -> List[ProductRecord]:
        path = Path(feed_path)
        if not path.exists():
            raise FileNotFoundError(f"Distributor feed not found at {feed_path}")

        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        items = data if isinstance(data, list) else data.get("products", data.get("items", []))
        records: List[ProductRecord] = []

        for item in items:
            if not isinstance(item, dict):
                continue

            mpn = item.get("mpn") or item.get("manufacturerPartNumber") or item.get("mfr_part_number") or ""
            sku = item.get("distributor_sku") or item.get("sku") or item.get("partNumber") or mpn
            name = item.get("name") or item.get("title") or item.get("description") or mpn
            cat = item.get("category") or item.get("categoryName") or "General"
            mfg = item.get("manufacturer") or item.get("manufacturerName") or "Unknown"

            attrs: Dict[str, AttributeValueRecord] = {}
            for k, v in item.get("parameters", item.get("attributes", {})).items():
                attrs[k] = AttributeValueRecord(
                    code=k,
                    value=v,
                    raw_value=str(v),
                )

            provenance = ProvenanceRecord(
                source=f"{distributor_name.lower().replace(' ', '_')}_feed",
                source_type=self.source_type,
                source_id=sku,
                source_url=item.get("productUrl") or item.get("url"),
                collected_at=datetime.now(timezone.utc).isoformat(),
                verification_status=VerificationStatus.VERIFIED,
                verification_method="distributor_feed_import",
            )

            records.append(
                ProductRecord(
                    sku=sku,
                    mpn=mpn,
                    base_mpn=item.get("base_mpn") or (mpn.split("-")[0] if "-" in mpn else mpn),
                    name=name,
                    description=item.get("description"),
                    manufacturer=mfg,
                    category=cat,
                    domain=infer_domain(cat),
                    unit=item.get("unit", "pcs"),
                    attributes=attrs,
                    provenance=provenance,
                )
            )

        return records
