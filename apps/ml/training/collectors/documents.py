"""
Technical Document & Datasheet Metadata Collector.

Collects metadata from engineering drawings, datasheets, manuals, and material specs.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from pathlib import Path
import json

from .base import BaseCollector
from ..schemas.product import (
    ProductRecord,
    ProvenanceRecord,
    DocumentRefRecord,
    VerificationStatus,
)
from .ananya_db import infer_domain


class DocumentCollector(BaseCollector):
    """Collects technical documents and associates extracted metadata with ProductRecords."""

    name = "document_collector"
    source_type = "technical_document"

    def collect(
        self,
        index_file: str,
        **kwargs: Any,
    ) -> List[ProductRecord]:
        path = Path(index_file)
        if not path.exists():
            raise FileNotFoundError(f"Document index file not found at {index_file}")

        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        records: List[ProductRecord] = []
        for entry in data:
            if not isinstance(entry, dict):
                continue

            mpn = entry.get("mpn", "")
            sku = entry.get("sku") or mpn
            name = entry.get("title") or entry.get("name") or mpn
            cat = entry.get("category", "General")

            doc_ref = DocumentRefRecord(
                title=entry.get("document_title") or name,
                document_type=entry.get("document_type", "DATASHEET"),
                source_type="EXTERNAL_URL" if entry.get("url") else "UPLOADED_FILE",
                file_url=entry.get("file_url"),
                external_url=entry.get("url"),
            )

            provenance = ProvenanceRecord(
                source=f"doc_{entry.get('document_id', 'entry')}",
                source_type=self.source_type,
                source_id=entry.get("document_id"),
                source_url=entry.get("url"),
                collected_at=datetime.now(timezone.utc).isoformat(),
                verification_status=VerificationStatus.VERIFIED,
                verification_method="datasheet_metadata_index",
            )

            records.append(
                ProductRecord(
                    sku=sku,
                    mpn=mpn,
                    base_mpn=mpn.split("-")[0] if "-" in mpn else mpn,
                    name=name,
                    description=entry.get("description"),
                    manufacturer=entry.get("manufacturer"),
                    category=cat,
                    domain=infer_domain(cat),
                    documents=[doc_ref],
                    provenance=provenance,
                )
            )

        return records
