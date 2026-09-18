from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class EvidenceItem(BaseModel):
    type: str  # "mpn_pattern", "keyword", "existing_data", "data_pack_rule", "datasheet_param", "classifier"
    description: str
    weight: float = 1.0
    source: Optional[str] = None

class DataPackManufacturerHint(BaseModel):
    name: str
    code: Optional[str] = None
    prefixPatterns: Optional[List[str]] = None
    aliases: Optional[List[str]] = None

class DataPackIntelligenceHint(BaseModel):
    categoryCode: Optional[str] = None
    categoryName: Optional[str] = None
    aliases: Optional[List[str]] = None
    keywords: Optional[List[str]] = None
    mpnPatterns: Optional[List[str]] = None
    manufacturerHints: Optional[List[DataPackManufacturerHint]] = None
    commonTerminology: Optional[List[str]] = None
    expectedAttributes: Optional[List[str]] = None
    attributeAliases: Optional[Dict[str, List[str]]] = None
    packagePatterns: Optional[List[str]] = None
    electricalUnitHints: Optional[Dict[str, List[str]]] = None

class CategoryPrediction(BaseModel):
    category: str
    subcategory: Optional[str] = None
    confidence: float
    confidence_level: str = "MEDIUM"  # "HIGH", "MEDIUM", "LOW"
    parent_category: Optional[str] = None
    evidence: List[EvidenceItem] = Field(default_factory=list)

class PredictCategoryRequest(BaseModel):
    text: str
    top_k: int = Field(default=3, ge=1, le=10)
    datapack_hints: Optional[List[DataPackIntelligenceHint]] = None

class PredictCategoryResponse(BaseModel):
    predictions: List[CategoryPrediction]

class BatchPredictCategoryRequest(BaseModel):
    texts: List[str]
    top_k: int = Field(default=3, ge=1, le=10)
    datapack_hints: Optional[List[DataPackIntelligenceHint]] = None

class BatchPredictCategoryResponse(BaseModel):
    results: List[List[CategoryPrediction]]

class ResolveManufacturerRequest(BaseModel):
    part_number: str
    description: Optional[str] = ""
    datapack_hints: Optional[List[DataPackIntelligenceHint]] = None

class ResolveManufacturerResponse(BaseModel):
    manufacturer: str
    confidence: float
    confidence_level: str = "MEDIUM"  # "HIGH", "MEDIUM", "LOW"
    match_type: str  # "exact", "pattern", "alias", "fallback", "datapack"
    code: Optional[str] = None
    evidence: List[EvidenceItem] = Field(default_factory=list)

class ExistingComponent(BaseModel):
    id: str
    sku: str
    name: Optional[str] = ""
    description: Optional[str] = ""
    manufacturer: Optional[str] = ""

class DuplicateCandidate(BaseModel):
    id: str
    sku: str
    similarity: float
    confidence_level: str = "MEDIUM"  # "HIGH", "MEDIUM", "LOW"
    match_type: str  # "exact_mpn", "semantic", "exact_sku"
    reason: str
    evidence: List[EvidenceItem] = Field(default_factory=list)

class DetectDuplicatesRequest(BaseModel):
    part_number: str
    description: Optional[str] = ""
    existing_components: List[ExistingComponent] = []
    similarity_threshold: float = Field(default=0.75, ge=0.0, le=1.0)
    datapack_hints: Optional[List[DataPackIntelligenceHint]] = None

class DetectDuplicatesResponse(BaseModel):
    is_duplicate: bool
    matches: List[DuplicateCandidate]

class ExtractedAttribute(BaseModel):
    code: str
    value: Any
    unit: Optional[str] = None
    formatted: str
    confidence: float
    confidence_level: str = "HIGH"
    evidence: List[EvidenceItem] = Field(default_factory=list)

class ExtractDatasheetRequest(BaseModel):
    text: Optional[str] = None
    pdf_base64: Optional[str] = None
    datapack_hints: Optional[List[DataPackIntelligenceHint]] = None

class ExtractDatasheetResponse(BaseModel):
    attributes: Dict[str, ExtractedAttribute]
    extracted_text_preview: Optional[str] = None

class SuggestComponentRequest(BaseModel):
    query: str
    part_number: Optional[str] = None
    description: Optional[str] = None
    existing_components: List[ExistingComponent] = []
    datapack_hints: Optional[List[DataPackIntelligenceHint]] = None

class SuggestComponentResponse(BaseModel):
    category_predictions: List[CategoryPrediction]
    manufacturer: ResolveManufacturerResponse
    duplicates: DetectDuplicatesResponse
    extracted_attributes: Dict[str, ExtractedAttribute]
    confidence_level: str = "MEDIUM"
    overall_evidence: List[EvidenceItem] = Field(default_factory=list)
    execution_time_ms: float

class HealthResponse(BaseModel):
    status: str
    version: str

class ReadyResponse(BaseModel):
    ready: bool
    models_loaded: Dict[str, bool]
    version: str
