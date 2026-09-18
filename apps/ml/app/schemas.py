from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class CategoryPrediction(BaseModel):
    category: str
    subcategory: Optional[str] = None
    confidence: float
    parent_category: Optional[str] = None

class PredictCategoryRequest(BaseModel):
    text: str
    top_k: int = Field(default=3, ge=1, le=10)

class PredictCategoryResponse(BaseModel):
    predictions: List[CategoryPrediction]

class BatchPredictCategoryRequest(BaseModel):
    texts: List[str]
    top_k: int = Field(default=3, ge=1, le=10)

class BatchPredictCategoryResponse(BaseModel):
    results: List[List[CategoryPrediction]]

class ResolveManufacturerRequest(BaseModel):
    part_number: str
    description: Optional[str] = ""

class ResolveManufacturerResponse(BaseModel):
    manufacturer: str
    confidence: float
    match_type: str  # "exact", "pattern", "alias", "fallback"
    code: Optional[str] = None

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
    match_type: str  # "exact_mpn", "semantic", "exact_sku"
    reason: str

class DetectDuplicatesRequest(BaseModel):
    part_number: str
    description: Optional[str] = ""
    existing_components: List[ExistingComponent] = []
    similarity_threshold: float = Field(default=0.75, ge=0.0, le=1.0)

class DetectDuplicatesResponse(BaseModel):
    is_duplicate: bool
    matches: List[DuplicateCandidate]

class ExtractedAttribute(BaseModel):
    code: str
    value: Any
    unit: Optional[str] = None
    formatted: str
    confidence: float

class ExtractDatasheetRequest(BaseModel):
    text: Optional[str] = None
    pdf_base64: Optional[str] = None

class ExtractDatasheetResponse(BaseModel):
    attributes: Dict[str, ExtractedAttribute]
    extracted_text_preview: Optional[str] = None

class SuggestComponentRequest(BaseModel):
    query: str
    part_number: Optional[str] = None
    description: Optional[str] = None
    existing_components: List[ExistingComponent] = []

class SuggestComponentResponse(BaseModel):
    category_predictions: List[CategoryPrediction]
    manufacturer: ResolveManufacturerResponse
    duplicates: DetectDuplicatesResponse
    extracted_attributes: Dict[str, ExtractedAttribute]
    execution_time_ms: float

class HealthResponse(BaseModel):
    status: str
    version: str

class ReadyResponse(BaseModel):
    ready: bool
    models_loaded: Dict[str, bool]
    version: str
