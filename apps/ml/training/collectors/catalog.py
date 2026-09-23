"""
Manufacturer Catalog Collector.

Ingests structured manufacturer catalogs across electronics, mechanical, fasteners,
tools, raw materials, and consumables.
"""

import json
import csv
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


class ManufacturerCatalogCollector(BaseCollector):
    """Ingests catalog records directly from manufacturer-provided datasets or files."""

    name = "manufacturer_catalog"
    source_type = "manufacturer_catalog"

    def collect(
        self,
        catalog_path: str,
        manufacturer_name: Optional[str] = None,
        default_domain: Optional[ProductDomain] = None,
        **kwargs: Any,
    ) -> List[ProductRecord]:
        path = Path(catalog_path)
        if not path.exists():
            raise FileNotFoundError(f"Catalog file not found at {catalog_path}")

        if path.suffix.lower() == ".json":
            return self._collect_json(path, manufacturer_name, default_domain)
        elif path.suffix.lower() in (".csv", ".tsv"):
            return self._collect_csv(path, manufacturer_name, default_domain)
        else:
            raise ValueError(f"Unsupported catalog format: {path.suffix}")

    def _collect_json(
        self,
        path: Path,
        manufacturer_name: Optional[str],
        default_domain: Optional[ProductDomain],
    ) -> List[ProductRecord]:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        items = data if isinstance(data, list) else data.get("records", data.get("products", []))
        records: List[ProductRecord] = []

        for item in items:
            if not isinstance(item, dict):
                continue

            mpn = item.get("mpn") or item.get("part_number") or item.get("sku") or ""
            name = item.get("name") or item.get("title") or mpn
            cat = item.get("category") or item.get("subcategory") or "General"
            mfg = item.get("manufacturer") or manufacturer_name or "Unknown Manufacturer"
            domain = default_domain or infer_domain(cat)

            attrs: Dict[str, AttributeValueRecord] = {}
            raw_attrs = item.get("attributes", {})
            if isinstance(raw_attrs, dict):
                for k, v in raw_attrs.items():
                    if isinstance(v, dict):
                        attrs[k] = AttributeValueRecord(
                            code=k,
                            value=v.get("value"),
                            raw_value=str(v.get("value")),
                            normalized_si=v.get("normalized_si"),
                            unit=v.get("unit"),
                        )
                    else:
                        attrs[k] = AttributeValueRecord(
                            code=k,
                            value=v,
                            raw_value=str(v),
                        )

            prov_dict = item.get("provenance", {})
            provenance = ProvenanceRecord(
                source=prov_dict.get("sourceIdentifier") or mfg,
                source_type=self.source_type,
                source_url=prov_dict.get("sourceUrl") or item.get("url"),
                collected_at=prov_dict.get("retrievalTimestamp") or datetime.now(timezone.utc).isoformat(),
                verification_status=VerificationStatus.VERIFIED if prov_dict.get("verificationStatus") == "VERIFIED" else VerificationStatus.QUARANTINED,
                verification_method=prov_dict.get("verificationMethod") or "catalog_import",
            )

            records.append(
                ProductRecord(
                    sku=item.get("sku") or mpn,
                    mpn=mpn,
                    base_mpn=item.get("base_mpn") or (mpn.split("-")[0] if "-" in mpn else mpn),
                    name=name,
                    description=item.get("description"),
                    manufacturer=mfg,
                    series_family=item.get("series_family"),
                    category=cat,
                    domain=domain,
                    unit=item.get("unit", "pcs"),
                    attributes=attrs,
                    provenance=provenance,
                )
            )

        return records

    def _collect_csv(
        self,
        path: Path,
        manufacturer_name: Optional[str],
        default_domain: Optional[ProductDomain],
    ) -> List[ProductRecord]:
        delimiter = "\t" if path.suffix.lower() == ".tsv" else ","
        records: List[ProductRecord] = []

        with open(path, "r", encoding="utf-8", errors="replace") as f:
            reader = csv.DictReader(f, delimiter=delimiter)
            for row in reader:
                mpn = row.get("mpn") or row.get("part_number") or row.get("sku") or ""
                if not mpn:
                    continue
                name = row.get("name") or row.get("description") or mpn
                cat = row.get("category") or "General"
                mfg = row.get("manufacturer") or manufacturer_name or "Unknown Manufacturer"

                provenance = ProvenanceRecord(
                    source=f"catalog_{path.stem}",
                    source_type=self.source_type,
                    collected_at=datetime.now(timezone.utc).isoformat(),
                    verification_status=VerificationStatus.VERIFIED,
                    verification_method="catalog_csv_import",
                )

                records.append(
                    ProductRecord(
                        sku=row.get("sku") or mpn,
                        mpn=mpn,
                        base_mpn=mpn.split("-")[0] if "-" in mpn else mpn,
                        name=name,
                        description=row.get("description"),
                        manufacturer=mfg,
                        category=cat,
                        domain=default_domain or infer_domain(cat),
                        provenance=provenance,
                    )
                )

        return records
