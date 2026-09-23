"""
General Product Intelligence Schemas & Provenance Tracking.

Covers broad ERP/product domains:
- Electronics & Semiconductors
- Electrical equipment & switchgear
- Mechanical parts & Fasteners
- Tools & Hardware
- Raw materials (sheet, bar, filaments, alloys)
- Consumables (flux, solders, adhesives, lubricants)
- 3D Printing materials & polymers
- Industrial components (valves, motors, actuators)
- Finished goods & Packaging
"""

from enum import Enum
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field


class ProductDomain(str, Enum):
    ELECTRONICS = "ELECTRONICS"
    ELECTRICAL = "ELECTRICAL"
    MECHANICAL = "MECHANICAL"
    FASTENERS = "FASTENERS"
    TOOLS = "TOOLS"
    RAW_MATERIALS = "RAW_MATERIALS"
    CONSUMABLES = "CONSUMABLES"
    PRINTING_MATERIALS_3D = "3D_PRINTING_MATERIALS"
    INDUSTRIAL = "INDUSTRIAL"
    FINISHED_GOODS = "FINISHED_GOODS"
    PACKAGING = "PACKAGING"
    OTHER = "OTHER"


class VerificationStatus(str, Enum):
    VERIFIED = "VERIFIED"
    QUARANTINED = "QUARANTINED"
    REJECTED = "REJECTED"
    UNVERIFIED = "UNVERIFIED"


class ProvenanceRecord(BaseModel):
    """Retains origin, collector metadata, and verification audit trail."""

    source: str = Field(description="Name or origin of data source (e.g. 'ananya_db', 'murata_catalog')")
    source_type: str = Field(description="Type: 'ananya_db_snapshot', 'manufacturer_catalog', 'distributor_feed', 'datasheet', 'feedback', 'user_provided'")
    source_url: Optional[str] = Field(default=None, description="External or internal source URI")
    source_id: Optional[str] = Field(default=None, description="Identifier within source system")
    collected_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    license: Optional[str] = Field(default="internal_erp", description="Data license or usage terms")
    original_record_id: Optional[str] = Field(default=None, description="Original database UUID or row id")
    processing_version: str = Field(default="1.0.0", description="Pipeline processor version that created this record")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    verification_status: VerificationStatus = Field(default=VerificationStatus.VERIFIED)
    verification_method: Optional[str] = Field(default="direct_ingest")
    source_quality: Optional[str] = Field(default="authoritative_manufacturer", description="Quality tier: authoritative_manufacturer, distributor, public_dataset, generic_web, user_supplied")
    content_type: Optional[str] = Field(default=None, description="MIME content type of original material")
    content_hash: Optional[str] = Field(default=None, description="SHA-256 hash of original raw content")


class AttributeValueRecord(BaseModel):
    """Structured attribute representation with optional SI normalization."""

    code: str
    name: Optional[str] = None
    data_type: str = "TEXT"  # TEXT, NUMBER, INTEGER, BOOLEAN, SELECT, QUANTITY
    value: Any
    raw_value: Optional[str] = None
    normalized_si: Optional[float] = None
    unit: Optional[str] = None
    confidence: float = 1.0


class DocumentRefRecord(BaseModel):
    """Document reference for datasheets, drawings, manuals."""

    title: str
    document_type: str = "DATASHEET"  # DATASHEET, MANUAL, DRAWING, CERTIFICATE, OTHER
    source_type: str = "EXTERNAL_URL"  # UPLOADED_FILE, EXTERNAL_URL
    file_url: Optional[str] = None
    external_url: Optional[str] = None
    storage_key: Optional[str] = None


class VariantRecord(BaseModel):
    """Packaging or physical variants (e.g. Reel, Cut Tape, Bulk)."""

    variant_type: str
    packaging_suffix: Optional[str] = None
    sku: Optional[str] = None
    attributes: Dict[str, Any] = Field(default_factory=dict)


class RelationshipRecord(BaseModel):
    """Equivalents, replacements, cross-references, mates-with."""

    relationship_type: str  # EQUIVALENT, REPLACEMENT, MATES_WITH, ACCESSORY, COMPONENT_OF
    target_mpn: Optional[str] = None
    target_sku: Optional[str] = None
    notes: Optional[str] = None


class ProductRecord(BaseModel):
    """
    Unified ERP Product Record for Machine Learning.
    Supports broad domains and preserves complete provenance.
    """

    id: Optional[str] = None
    sku: str
    mpn: Optional[str] = None
    base_mpn: Optional[str] = None
    name: str
    description: Optional[str] = None
    manufacturer: Optional[str] = None
    brand: Optional[str] = None
    series_family: Optional[str] = None
    category: str
    domain: ProductDomain = ProductDomain.OTHER
    unit: str = "pcs"
    is_active: bool = True

    # Detailed specifications
    attributes: Dict[str, AttributeValueRecord] = Field(default_factory=dict)
    variants: List[VariantRecord] = Field(default_factory=list)
    relationships: List[RelationshipRecord] = Field(default_factory=list)
    documents: List[DocumentRefRecord] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)

    # Provenance
    provenance: ProvenanceRecord

    def to_training_text(self) -> str:
        """Assembles a clean composite text representation for NLP/embedding."""
        parts = [
            self.mpn or "",
            self.sku,
            self.name,
            self.description or "",
            self.manufacturer or "",
            self.brand or "",
        ]
        return " ".join(p.strip() for p in parts if p.strip())
