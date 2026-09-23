"""
Task-Specific Dataset Example Schemas for Model Training.

Supports 7 core ML tasks:
1. Category Classification
2. Attribute Extraction
3. Attribute Relevance
4. Entity Resolution (Manufacturers / Suppliers)
5. Unit & Value Normalization
6. Duplicate / Variant Matching
7. Product Similarity / Retrieval Triplets
"""

from typing import Dict, Any, List, Optional
from enum import Enum
from pydantic import BaseModel, Field
from .product import ProvenanceRecord


class DuplicateLabel(str, Enum):
    SAME = "SAME"
    VARIANT = "VARIANT"
    RELATED = "RELATED"
    DIFFERENT = "DIFFERENT"
    UNCERTAIN = "UNCERTAIN"


class ClassificationExample(BaseModel):
    """Product text -> Category task."""

    text: str
    category: str
    domain: str
    hierarchy: List[str] = Field(default_factory=list)
    base_family: Optional[str] = None
    mpn: Optional[str] = None
    sku: Optional[str] = None
    provenance: ProvenanceRecord


class AttributeExtractionExample(BaseModel):
    """Text/document -> Structured attributes task."""

    text: str
    target_attributes: Dict[str, Any]
    document_context: Optional[str] = None
    provenance: ProvenanceRecord


class AttributeRelevanceExample(BaseModel):
    """
    Product description + Candidate attribute universe -> Relevant attributes.
    Attribute relevance does NOT depend solely on pre-existing category bindings.
    """

    product_text: str
    category: str
    candidate_attribute_codes: List[str]
    relevant_attribute_codes: List[str]
    provenance: ProvenanceRecord


class EntityResolutionExample(BaseModel):
    """Raw entity variation -> Canonical entity task."""

    query_text: str
    entity_type: str = "MANUFACTURER"  # MANUFACTURER, SUPPLIER, BRAND
    canonical_id: Optional[str] = None
    canonical_name: str
    aliases: List[str] = Field(default_factory=list)
    confidence: float = 1.0


class NormalizationExample(BaseModel):
    """Raw value representation -> Canonical value & unit task."""

    raw_input: str
    property_type: str  # resistance, capacitance, length, torque, mass, voltage
    canonical_value: float
    canonical_unit: str
    normalized_si: Optional[float] = None


class DuplicatePairExample(BaseModel):
    """Pairwise product duplicate & variant comparison."""

    component_a: Dict[str, Any]
    component_b: Dict[str, Any]
    label: DuplicateLabel
    reason: Optional[str] = None
    is_duplicate: bool
    guard_passed: bool = True


class SimilarityTripletExample(BaseModel):
    """Anchor / Positive / Negative triplet for metric learning / embeddings."""

    anchor_text: str
    positive_text: str
    negative_text: str
    domain: str
    task_hint: Optional[str] = None
