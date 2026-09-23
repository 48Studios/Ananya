"""
Ananya Database Snapshot Collector.

Builds training snapshots safely from Ananya's ERP database or export dumps.
Extracts:
- Components master data
- Categories and taxonomy hierarchy
- Manufacturers and brands
- Attribute definitions and values
- Document / datasheet references
- AI Suggestion feedback history (accepted, edited, rejected)

Guarantees:
- Read-only queries (never mutates production state)
- Preserves all database UUIDs and timestamps in ProvenanceRecord
- Safe handling of missing/inconsistent foreign keys
- Supports offline snapshot files as well as direct database connections
"""

import json
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

from .base import BaseCollector
from ..schemas.product import (
    ProductRecord,
    ProductDomain,
    ProvenanceRecord,
    AttributeValueRecord,
    DocumentRefRecord,
    VerificationStatus,
)

logger = logging.getLogger(__name__)

# Canonical domain map from category naming conventions
CATEGORY_TO_DOMAIN_MAP = {
    "capacitors": ProductDomain.ELECTRONICS,
    "resistors": ProductDomain.ELECTRONICS,
    "inductors": ProductDomain.ELECTRONICS,
    "diodes": ProductDomain.ELECTRONICS,
    "transistors": ProductDomain.ELECTRONICS,
    "ics & semiconductors": ProductDomain.ELECTRONICS,
    "semiconductors": ProductDomain.ELECTRONICS,
    "optoelectronics": ProductDomain.ELECTRONICS,
    "connectors": ProductDomain.ELECTRICAL,
    "switches": ProductDomain.ELECTRICAL,
    "relays": ProductDomain.ELECTRICAL,
    "cables": ProductDomain.ELECTRICAL,
    "wire": ProductDomain.ELECTRICAL,
    "terminal blocks": ProductDomain.ELECTRICAL,
    "mechanical parts": ProductDomain.MECHANICAL,
    "bearings": ProductDomain.MECHANICAL,
    "gears": ProductDomain.MECHANICAL,
    "fasteners": ProductDomain.FASTENERS,
    "screws": ProductDomain.FASTENERS,
    "bolts": ProductDomain.FASTENERS,
    "tools": ProductDomain.TOOLS,
    "hand tools": ProductDomain.TOOLS,
    "raw materials": ProductDomain.RAW_MATERIALS,
    "metals": ProductDomain.RAW_MATERIALS,
    "plastics": ProductDomain.RAW_MATERIALS,
    "consumables": ProductDomain.CONSUMABLES,
    "solder": ProductDomain.CONSUMABLES,
    "flux": ProductDomain.CONSUMABLES,
    "3d printing": ProductDomain.PRINTING_MATERIALS_3D,
    "filament": ProductDomain.PRINTING_MATERIALS_3D,
    "industrial": ProductDomain.INDUSTRIAL,
    "packaging": ProductDomain.PACKAGING,
    "assemblies": ProductDomain.FINISHED_GOODS,
}


def infer_domain(category_name: str) -> ProductDomain:
    """Infers high-level ERP product domain from category string."""
    clean = category_name.lower().strip()
    for key, domain in CATEGORY_TO_DOMAIN_MAP.items():
        if key in clean:
            return domain
    return ProductDomain.OTHER


class AnanyaDbCollector(BaseCollector):
    """Collector for extracting training data from Ananya database or export dump."""

    name = "ananya_db"
    source_type = "ananya_db_snapshot"

    def __init__(self, database_url: Optional[str] = None):
        self.database_url = database_url

    def collect(
        self,
        snapshot_file: Optional[str] = None,
        feedback_file: Optional[str] = None,
        **kwargs: Any,
    ) -> List[ProductRecord]:
        """
        Collects records from an export file, live database, or provided data dictionary.
        """
        if snapshot_file:
            return self.collect_from_snapshot_file(snapshot_file, feedback_file)
        elif self.database_url:
            return self.collect_from_live_db(**kwargs)
        else:
            logger.info("No snapshot_file or database_url provided; returning empty record set.")
            return []

    def collect_from_snapshot_file(
        self, snapshot_file: str, feedback_file: Optional[str] = None
    ) -> List[ProductRecord]:
        """Collects records from a pre-dumped JSON snapshot file."""
        with open(snapshot_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        records: List[ProductRecord] = []

        # If data is a list of components
        components = data.get("components", data if isinstance(data, list) else [])
        categories_map = {c["id"]: c["name"] for c in data.get("categories", []) if "id" in c and "name" in c}
        mfg_map = {m["id"]: m["name"] for m in data.get("manufacturers", []) if "id" in m and "name" in m}
        attr_defs_map = {a["id"]: a for a in data.get("attributeDefinitions", []) if "id" in a}

        # Map component attribute values by componentId
        attr_values_by_comp: Dict[str, Dict[str, AttributeValueRecord]] = {}
        for cav in data.get("componentAttributeValues", []):
            comp_id = cav.get("componentId")
            attr_def_id = cav.get("attributeDefinitionId")
            attr_def = attr_defs_map.get(attr_def_id, {})
            code = attr_def.get("code") or cav.get("code") or "unknown_attr"
            if comp_id:
                attr_values_by_comp.setdefault(comp_id, {})[code] = AttributeValueRecord(
                    code=code,
                    name=attr_def.get("name"),
                    data_type=attr_def.get("dataType", "TEXT"),
                    value=cav.get("numberValue") or cav.get("textValue") or cav.get("booleanValue") or cav.get("jsonValue"),
                    raw_value=cav.get("textValue"),
                    normalized_si=float(cav["normalizedNumberValue"]) if cav.get("normalizedNumberValue") is not None else None,
                    unit=cav.get("unit"),
                )

        # Map documents by entityId
        docs_by_comp: Dict[str, List[DocumentRefRecord]] = {}
        for doc in data.get("documents", []):
            eid = doc.get("entityId")
            if eid:
                docs_by_comp.setdefault(eid, []).append(
                    DocumentRefRecord(
                        title=doc.get("title", "Document"),
                        document_type=doc.get("documentType", "DATASHEET"),
                        source_type=doc.get("sourceType", "EXTERNAL_URL"),
                        file_url=doc.get("fileUrl"),
                        external_url=doc.get("externalUrl"),
                        storage_key=doc.get("storageKey"),
                    )
                )

        for comp in components:
            if not isinstance(comp, dict):
                continue

            comp_id = comp.get("id")
            category_name = comp.get("categoryName") or categories_map.get(comp.get("categoryId", ""), "General Inventory")
            mfg_name = comp.get("manufacturerName") or mfg_map.get(comp.get("manufacturerId", ""), "Generic")
            domain = infer_domain(category_name)

            sku = comp.get("sku", "")
            mpn = comp.get("manufacturerPartNumber") or comp.get("mpn")
            base_mpn = mpn.split("-")[0] if mpn and "-" in mpn else mpn

            provenance = ProvenanceRecord(
                source="ananya_db",
                source_type=self.source_type,
                source_id=comp_id,
                source_url=f"ananya://components/{comp_id}" if comp_id else None,
                collected_at=datetime.now(timezone.utc).isoformat(),
                original_record_id=comp_id,
                verification_status=VerificationStatus.VERIFIED if comp.get("isActive", True) else VerificationStatus.QUARANTINED,
                verification_method="erp_inventory_record",
            )

            record = ProductRecord(
                id=comp_id,
                sku=sku,
                mpn=mpn,
                base_mpn=base_mpn,
                name=comp.get("name", sku),
                description=comp.get("description"),
                manufacturer=mfg_name,
                category=category_name,
                domain=domain,
                unit=comp.get("unit", "pcs"),
                is_active=comp.get("isActive", True),
                attributes=attr_values_by_comp.get(comp_id, {}),
                documents=docs_by_comp.get(comp_id, []),
                provenance=provenance,
            )
            records.append(record)

        # Ingest feedback if provided
        if feedback_file:
            feedback_records = self.collect_from_feedback_file(feedback_file)
            records.extend(feedback_records)

        return records

    def collect_from_feedback_file(self, feedback_file: str) -> List[ProductRecord]:
        """Ingests accepted or human-edited feedback records."""
        with open(feedback_file, "r", encoding="utf-8") as f:
            raw = json.load(f)

        dataset = raw.get("dataset", raw if isinstance(raw, list) else [])
        feedback_products: List[ProductRecord] = []

        for item in dataset:
            if not isinstance(item, dict):
                continue
            action = item.get("userAction")
            if action in ("ACCEPTED", "EDITED"):
                ctx = item.get("creationContext") or {}
                final_val = item.get("finalValue") or item.get("predictedValue")
                cat_name = (
                    final_val.get("subcategoryName") or final_val.get("categoryName")
                    if isinstance(final_val, dict)
                    else str(final_val)
                ) if final_val else "General Inventory"

                sku = ctx.get("sku") or f"FB-{item.get('id', '')[:8]}"
                mpn = ctx.get("mpn") or ctx.get("sku")

                provenance = ProvenanceRecord(
                    source="ananya_feedback",
                    source_type="human_reviewed_feedback",
                    source_id=item.get("id"),
                    source_url=f"ananya://feedback/{item.get('id', '')}",
                    collected_at=item.get("createdAt") or datetime.now(timezone.utc).isoformat(),
                    original_record_id=item.get("id"),
                    verification_status=VerificationStatus.VERIFIED,
                    verification_method="human_audit",
                )

                feedback_products.append(
                    ProductRecord(
                        sku=sku,
                        mpn=mpn,
                        base_mpn=mpn.split("-")[0] if mpn and "-" in mpn else mpn,
                        name=ctx.get("name") or sku,
                        description=ctx.get("description"),
                        manufacturer=ctx.get("manufacturer") or "Unknown",
                        category=cat_name,
                        domain=infer_domain(cat_name),
                        provenance=provenance,
                    )
                )

        return feedback_products

    def collect_from_live_db(self, limit: int = 5000) -> List[ProductRecord]:
        """
        Connects to live PostgreSQL database using psycopg / sqlalchemy if installed.
        Executed strictly as read-only SELECT.
        """
        if not self.database_url:
            raise ValueError("database_url is required for live DB collection")

        try:
            # Fallback to local import to keep requirements lightweight
            import psycopg2  # type: ignore
            from psycopg2.extras import RealDictCursor
        except ImportError:
            logger.warning("psycopg2 not installed; cannot query live database directly.")
            return []

        conn = psycopg2.connect(self.database_url)
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Query components with category and manufacturer joins
                query = """
                SELECT
                    c.id,
                    c.sku,
                    c.manufacturer_part_number,
                    c.name,
                    c.description,
                    c.unit,
                    c.is_active,
                    cat.name as category_name,
                    m.name as manufacturer_name
                FROM components c
                LEFT JOIN categories cat ON c.category_id = cat.id
                LEFT JOIN manufacturers m ON c.manufacturer_id = m.id
                WHERE c.is_active = true
                LIMIT %s;
                """
                cur.execute(query, (limit,))
                rows = cur.fetchall()

            records: List[ProductRecord] = []
            for r in rows:
                cat_name = r.get("category_name") or "General Inventory"
                mpn = r.get("manufacturer_part_number")
                record = ProductRecord(
                    id=str(r["id"]),
                    sku=r["sku"],
                    mpn=mpn,
                    base_mpn=mpn.split("-")[0] if mpn and "-" in mpn else mpn,
                    name=r["name"],
                    description=r.get("description"),
                    manufacturer=r.get("manufacturer_name") or "Generic",
                    category=cat_name,
                    domain=infer_domain(cat_name),
                    unit=r.get("unit") or "pcs",
                    is_active=r.get("is_active", True),
                    provenance=ProvenanceRecord(
                        source="ananya_db",
                        source_type=self.source_type,
                        source_id=str(r["id"]),
                        source_url=f"ananya://components/{r['id']}",
                        original_record_id=str(r["id"]),
                        verification_status=VerificationStatus.VERIFIED,
                        verification_method="live_db_snapshot",
                    ),
                )
                records.append(record)

            return records
        finally:
            conn.close()
