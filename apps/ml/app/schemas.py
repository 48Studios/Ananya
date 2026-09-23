from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field

class EvidenceItem(BaseModel):
    type: str  # "mpn_pattern", "keyword", "existing_data", "data_pack_rule", "datasheet_param", "classifier"
    description: str
    weight: float = 1.0
    source: Optional[str] = None
    # Datasheet extraction (Pass 2): the page the value was read from and the
    # normalized excerpt of that page's text that produced it. Optional because
    # only the datasheet extractor can locate a value in a document; every other
    # producer leaves them unset rather than inventing a location.
    page: Optional[int] = None
    text: Optional[str] = None
    # Datasheet extraction (Pass 4): the datasheet section the value was found in,
    # e.g. "ELECTRICAL_CHARACTERISTICS". A closed vocabulary mirrored by the API,
    # which turns it into an evidence role. Unset when the extractor could not
    # identify the section, so evidence is never promoted on a guess.
    section: Optional[str] = None

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

class ErpCategory(BaseModel):
    id: str
    name: str
    code: str
    description: Optional[str] = None
    parent_id: Optional[str] = None
    parent_name: Optional[str] = None
    path: List[str] = Field(default_factory=list)
    aliases: List[str] = Field(default_factory=list)
    is_active: bool = True
    metadata: Dict[str, Any] = Field(default_factory=dict)

class ErpManufacturer(BaseModel):
    id: str
    name: str
    code: str
    aliases: List[str] = Field(default_factory=list)
    normalized_name: Optional[str] = None
    is_active: bool = True
    metadata: Dict[str, Any] = Field(default_factory=dict)

class CategoryPrediction(BaseModel):
    category: str
    subcategory: Optional[str] = None
    resolution: Literal["EXISTING", "NEW_CANDIDATE", "UNKNOWN"] = "NEW_CANDIDATE"
    category_id: Optional[str] = None
    category_code: Optional[str] = None
    category_path: List[str] = Field(default_factory=list)
    parent_category_id: Optional[str] = None
    parent_category_code: Optional[str] = None
    candidates: List["CategoryCandidate"] = Field(default_factory=list)
    suggested_parent: Optional[str] = None
    proposed_description: Optional[str] = None
    confidence: float
    confidence_level: str = "MEDIUM"  # "HIGH", "MEDIUM", "LOW"
    parent_category: Optional[str] = None
    evidence: List[EvidenceItem] = Field(default_factory=list)

class CategoryCandidate(BaseModel):
    category_id: Optional[str] = None
    category_name: str
    category_code: Optional[str] = None
    category_path: List[str] = Field(default_factory=list)
    confidence: float
    evidence: List[EvidenceItem] = Field(default_factory=list)

class PredictCategoryRequest(BaseModel):
    text: str
    top_k: int = Field(default=3, ge=1, le=10)
    datapack_hints: Optional[List[DataPackIntelligenceHint]] = None
    erp_categories: List[ErpCategory] = Field(default_factory=list)
    erp_manufacturers: List[ErpManufacturer] = Field(default_factory=list)
    datasheet_text: Optional[str] = None

class PredictCategoryResponse(BaseModel):
    predictions: List[CategoryPrediction]

class BatchPredictCategoryRequest(BaseModel):
    texts: List[str]
    top_k: int = Field(default=3, ge=1, le=10)
    datapack_hints: Optional[List[DataPackIntelligenceHint]] = None
    erp_categories: List[ErpCategory] = Field(default_factory=list)
    erp_manufacturers: List[ErpManufacturer] = Field(default_factory=list)

class BatchPredictCategoryResponse(BaseModel):
    results: List[List[CategoryPrediction]]

class ResolveManufacturerRequest(BaseModel):
    part_number: str
    description: Optional[str] = ""
    datasheet_text: Optional[str] = ""
    erp_manufacturers: List[ErpManufacturer] = Field(default_factory=list)
    datapack_hints: Optional[List[DataPackIntelligenceHint]] = None

class ManufacturerCandidate(BaseModel):
    manufacturer_id: Optional[str] = None
    name: str
    code: Optional[str] = None
    confidence: float
    evidence: List[EvidenceItem] = Field(default_factory=list)

class ResolveManufacturerResponse(BaseModel):
    resolution: Literal["EXISTING", "NEW_CANDIDATE", "UNKNOWN"]
    manufacturer: Optional[str] = None
    manufacturer_id: Optional[str] = None
    confidence: float
    confidence_level: str = "MEDIUM"  # "HIGH", "MEDIUM", "LOW"
    match_type: str
    code: Optional[str] = None
    evidence: List[EvidenceItem] = Field(default_factory=list)
    candidates: List[ManufacturerCandidate] = Field(default_factory=list)

class ExistingComponent(BaseModel):
    id: str
    sku: str
    name: Optional[str] = ""
    description: Optional[str] = ""
    manufacturer: Optional[str] = ""
    # The manufacturer part number. This is the part's real identity: `sku` is
    # the ERP's own key (`CMP-000305`), so comparing a searched part number
    # against it never matches anything. Authoritative duplicate detection reads
    # this field.
    manufacturer_part_number: Optional[str] = ""

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
    # The quantity as the document stated it, for the rules that canonicalise.
    # `value`/`unit` remain the canonical form the ERP already depends on (a
    # resistance is stated in ohms); this pair is the source representation
    # (`100` with `kΩ`), which is what a suggestion records when the attribute
    # accepts that unit. Both are None when the rule's value is not a quantity,
    # and the caller falls back to `value`/`unit`.
    source_value: Optional[float] = None
    source_unit: Optional[str] = None
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
    # Pass 2 additions. `extracted_text` is the document text the extractor
    # actually read (bounded), so a caller can feed the same bytes into the
    # existing identity/category intelligence without a second PDF pass.
    extracted_text: Optional[str] = None
    page_count: Optional[int] = None
    pages_analyzed: Optional[int] = None
    extractor_version: Optional[str] = None

class SuggestComponentRequest(BaseModel):
    query: str
    part_number: Optional[str] = None
    description: Optional[str] = None
    datasheet_text: Optional[str] = None
    datasheet_pdf_base64: Optional[str] = None
    existing_components: List[ExistingComponent] = []
    erp_categories: List[ErpCategory] = Field(default_factory=list)
    erp_manufacturers: List[ErpManufacturer] = Field(default_factory=list)
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
    # Identity of the artifact this process is SERVING (not the one on disk).
    # Reported here because `/ready` is the only endpoint an orchestrator polls, and
    # "the container is up" is not the same statement as "the new model is live".
    running_model: Optional[Dict[str, Any]] = None

# ---------------------------------------------------------
# ML Operations Schemas (training control plane)
#
# These routes are internal: they are reached only by the authenticated NestJS API
# (`MlClientService`), never by a browser. Authorisation, the durable run record and
# the audit trail all live on the API side; this surface only executes and reports.
#
# No schema here carries a filesystem path, an environment value or a credential.
# The pipeline's own report fields (`validationSource`, `sourceArtifact`,
# `productionPath`) are dropped by `services/model_registry.py` before they reach
# these models, and `response_model` filtering is the second line of defence.
# ---------------------------------------------------------

class TrainingRunRequest(BaseModel):
    """Start request. There is deliberately no free-form argument surface."""

    runId: Optional[str] = Field(default=None, max_length=128)
    requestedBy: Optional[str] = Field(default=None, max_length=255)

class TrainingRunResponse(BaseModel):
    runId: str
    status: str
    phase: Optional[str] = None
    requestedBy: Optional[str] = None
    queuedAt: Optional[str] = None
    startedAt: Optional[str] = None
    completedAt: Optional[str] = None
    durationMs: Optional[int] = None
    candidateVersion: Optional[str] = None
    baseModelVersion: Optional[str] = None
    # Identity of the training code (pipeline revision) that produced the candidate.
    pipelineVersion: Optional[str] = None
    datasetVersion: Optional[str] = None
    datasetFingerprint: Optional[str] = None
    datasetRecordCount: Optional[int] = None
    feedbackRecordCount: Optional[int] = None
    trainingRecordCount: Optional[int] = None
    validationRecordCount: Optional[int] = None
    quarantineRecordCount: Optional[int] = None
    evaluationSummary: Optional[Dict[str, Any]] = None
    gateSummary: Optional[Dict[str, Any]] = None
    errorCode: Optional[str] = None
    errorMessage: Optional[str] = None
    artifactReference: Optional[str] = None
    log: List[str] = Field(default_factory=list)
    # A background thread cannot be interrupted safely, so this is always False and
    # the dashboard offers no cancel control.
    cancellable: bool = False

class TrainingRunListResponse(BaseModel):
    runs: List[TrainingRunResponse]

class ModelVersionResponse(BaseModel):
    version: str
    createdAt: Optional[str] = None
    artifactExists: bool
    artifactSha256: Optional[str] = None
    artifactSizeBytes: Optional[int] = None
    championModel: Optional[str] = None
    evaluation: Optional[Dict[str, Any]] = None
    datasetVersion: Optional[str] = None
    deployable: bool

class ModelRegistryResponse(BaseModel):
    active: Dict[str, Any]
    running: Dict[str, Any]
    versions: List[ModelVersionResponse]

class ModelDeployRequest(BaseModel):
    runId: str = Field(min_length=1, max_length=128)

class ModelDeploymentResponse(BaseModel):
    artifactVersion: Optional[str] = None
    previousVersion: Optional[str] = None
    restoredVersion: Optional[str] = None
    deployedAt: Optional[str] = None
    artifactSha256: Optional[str] = None
    runningVersion: Optional[str] = None
    reloadPending: bool = False
    reloadError: Optional[str] = None
    deploymentMetadataStale: bool = False

class DatasetSnapshotResponse(BaseModel):
    datasetVersion: str
    createdAt: Optional[str] = None
    fingerprint: Optional[str] = None
    totalSourceRecords: Optional[int] = None
    totalExpandedExamples: Optional[int] = None
    trainSize: Optional[int] = None
    valSize: Optional[int] = None
    duplicatePairsCount: Optional[int] = None
    distinctBaseFamilies: Optional[int] = None
    dataLeakageVerified: Optional[bool] = None
    overlapCount: Optional[int] = None
    categories: List[str] = Field(default_factory=list)

class DatasetOverviewResponse(BaseModel):
    current: Optional[DatasetSnapshotResponse] = None
    snapshots: List[DatasetSnapshotResponse] = Field(default_factory=list)
    quarantine: Dict[str, Any]
    distribution: Dict[str, Any]

# ---------------------------------------------------------
# Attribute Intelligence Schemas (RFC-0059)
# ---------------------------------------------------------

class CategoryItem(BaseModel):
    id: str
    code: str
    name: str

class ExistingAttribute(BaseModel):
    id: str
    code: str
    name: str
    dataType: str
    unitCategory: Optional[str] = None
    defaultUnit: Optional[str] = None
    groupName: Optional[str] = None
    aliases: List[str] = Field(default_factory=list)

class ExistingBinding(BaseModel):
    categoryId: str
    categoryCode: Optional[str] = None
    categoryName: Optional[str] = None
    attributeDefinitionId: str
    attributeCode: Optional[str] = None
    isRequired: bool = False

class AttributeBindingSuggestion(BaseModel):
    categoryId: str
    categoryCode: str
    categoryName: str
    confidence: float
    confidenceLevel: str = "MEDIUM"  # "HIGH", "MEDIUM", "LOW"
    reason: str
    evidence: List[EvidenceItem] = Field(default_factory=list)
    modelVersion: str = "1.0.0"

class SuggestAttributeBindingsRequest(BaseModel):
    attributeName: str
    attributeCode: Optional[str] = None
    description: Optional[str] = None
    dataType: Optional[str] = None
    unitCategory: Optional[str] = None
    categories: List[CategoryItem] = Field(default_factory=list)
    datapack_hints: Optional[List[DataPackIntelligenceHint]] = None
    component_category_counts: Optional[Dict[str, int]] = None

class SuggestAttributeBindingsResponse(BaseModel):
    suggestions: List[AttributeBindingSuggestion]

class CategoryAttributeSuggestion(BaseModel):
    attributeDefinitionId: Optional[str] = None
    code: str
    name: str
    dataType: str
    unitCategory: Optional[str] = None
    defaultUnit: Optional[str] = None
    groupName: Optional[str] = None
    confidence: float
    confidenceLevel: str = "MEDIUM"
    isAlreadyBound: bool = False
    reason: str
    evidence: List[EvidenceItem] = Field(default_factory=list)

class SuggestCategoryAttributesRequest(BaseModel):
    categoryId: str
    categoryCode: Optional[str] = None
    categoryName: str
    existingAttributes: List[ExistingAttribute] = Field(default_factory=list)
    boundAttributeIds: List[str] = Field(default_factory=list)
    datapack_hints: Optional[List[DataPackIntelligenceHint]] = None
    categoryComponentCount: Optional[int] = None

class SuggestCategoryAttributesResponse(BaseModel):
    suggestions: List[CategoryAttributeSuggestion]

class AttributeConfigSuggestion(BaseModel):
    suggestedCode: str
    suggestedDataType: str
    unitCategory: Optional[str] = None
    defaultUnit: Optional[str] = None
    displayUnits: List[str] = Field(default_factory=list)
    groupName: Optional[str] = None
    suggestedAliases: List[str] = Field(default_factory=list)
    suggestedOptions: List[str] = Field(default_factory=list)
    validationRules: Optional[Dict[str, Any]] = None
    canonicalMatch: Optional[Dict[str, Any]] = None
    confidence: float
    confidenceLevel: str = "MEDIUM"
    reason: str
    evidence: List[EvidenceItem] = Field(default_factory=list)

class SuggestAttributeConfigRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    existingAttributes: List[ExistingAttribute] = Field(default_factory=list)
    datapack_hints: Optional[List[DataPackIntelligenceHint]] = None

class SuggestAttributeConfigResponse(BaseModel):
    suggestion: AttributeConfigSuggestion

class AttributeDuplicateMatch(BaseModel):
    attributeId: str
    code: str
    name: str
    similarity: float
    confidenceLevel: str = "MEDIUM"
    matchType: str
    usageCount: int = 0
    boundCategories: List[str] = Field(default_factory=list)
    aliases: List[str] = Field(default_factory=list)
    reason: str
    evidence: List[EvidenceItem] = Field(default_factory=list)

class DetectAttributeDuplicatesRequest(BaseModel):
    name: str
    code: Optional[str] = None
    existingAttributes: List[ExistingAttribute] = Field(default_factory=list)
    existingBindings: List[ExistingBinding] = Field(default_factory=list)
    threshold: float = Field(default=0.7, ge=0.0, le=1.0)
    datapack_hints: Optional[List[DataPackIntelligenceHint]] = None

class DetectAttributeDuplicatesResponse(BaseModel):
    isDuplicate: bool
    matches: List[AttributeDuplicateMatch]
    suggestedAliases: List[str] = Field(default_factory=list)

class SuggestEnumValuesRequest(BaseModel):
    attributeCode: str
    attributeName: str
    existingOptions: List[str] = Field(default_factory=list)
    datapack_hints: Optional[List[DataPackIntelligenceHint]] = None

class EnumOptionSuggestion(BaseModel):
    code: str
    label: str
    source: str
    confidence: float
    confidenceLevel: str = "HIGH"

class SuggestEnumValuesResponse(BaseModel):
    suggestedOptions: List[EnumOptionSuggestion]

class AttributeAuditIssue(BaseModel):
    id: str
    type: str  # "DUPLICATE_ATTRIBUTE", "SUSPICIOUS_BINDING", "MISSING_EXPECTED_ATTRIBUTE", "UNUSED_ATTRIBUTE"
    severity: str  # "WARNING", "INFO", "CRITICAL"
    attributeId: Optional[str] = None
    attributeCode: Optional[str] = None
    attributeName: Optional[str] = None
    categoryId: Optional[str] = None
    categoryName: Optional[str] = None
    confidence: float = 0.8
    confidenceLevel: str = "MEDIUM"
    reason: str
    payload: Optional[Dict[str, Any]] = None
    evidence: List[EvidenceItem] = Field(default_factory=list)

class AuditAttributeLibraryRequest(BaseModel):
    attributes: List[ExistingAttribute] = Field(default_factory=list)
    categories: List[CategoryItem] = Field(default_factory=list)
    bindings: List[ExistingBinding] = Field(default_factory=list)
    componentCountsByAttribute: Dict[str, int] = Field(default_factory=dict)
    componentCountsByCategoryAttribute: Dict[str, int] = Field(default_factory=dict)
    datapack_hints: Optional[List[DataPackIntelligenceHint]] = None

class AuditAttributeLibraryResponse(BaseModel):
    summary: Dict[str, int]
    issues: List[AttributeAuditIssue]

# ---------------------------------------------------------
# Component Attribute Intelligence Schemas
#
# Component-level, not library-level: these describe what the specifications of
# one *part* are, given the category it belongs to. The library endpoints above
# answer "what should this category be configured with"; these answer "what does
# this component probably have, and why".
# ---------------------------------------------------------

class AttributeOptionItem(BaseModel):
    code: str
    label: str

class ComponentAttributeDefinition(ExistingAttribute):
    """
    An ERP attribute definition with the option catalog a value must resolve to.

    Extends `ExistingAttribute` rather than widening it, so the library endpoints
    keep their exact contract. The options are what makes a suggested value
    canonical: a concept read from text is only reported once it names an option
    this definition actually has.
    """
    description: Optional[str] = None
    options: List[AttributeOptionItem] = Field(default_factory=list)

class SuggestComponentAttributesCategory(BaseModel):
    """A category the relevance is conditioned on, primary first."""
    categoryId: str
    categoryCode: Optional[str] = None
    categoryName: str
    confidence: float = 1.0

class SuggestComponentAttributesRequest(BaseModel):
    """
    Everything the service needs to judge one component's specifications.

    The caller supplies the catalog, the bindings and the already-extracted
    attributes: this endpoint adds *judgement* (what matters, and which existing
    option a stated value names), not a second extraction or a second catalog
    read. Nothing here is inferred from the shape of the request — an attribute
    that is not in `attributes` cannot be suggested.
    """
    query: str
    partNumber: Optional[str] = None
    description: Optional[str] = None
    datasheetText: Optional[str] = None
    categories: List[SuggestComponentAttributesCategory] = Field(default_factory=list)
    attributes: List[ComponentAttributeDefinition] = Field(default_factory=list)
    boundAttributeIds: List[str] = Field(default_factory=list)
    boundAttributeCodes: List[str] = Field(default_factory=list)
    # Attribute code -> the display form of what the component already records.
    existingValues: Dict[str, str] = Field(default_factory=dict)
    # What the extractor read, keyed by its own code. Never re-extracted here.
    extractedAttributes: Dict[str, ExtractedAttribute] = Field(default_factory=dict)
    datapack_hints: Optional[List[DataPackIntelligenceHint]] = None

class ComponentAttributeSuggestion(BaseModel):
    """
    One attribute the intelligence considers relevant for this component.

    Relevance and value are separate fields because they are separate facts: an
    attribute can be relevant with `suggestedValue = None`, which is a different
    statement from a predicted value and must be reported as such.
    """
    attributeDefinitionId: Optional[str] = None
    code: str
    name: str
    dataType: Optional[str] = None
    relevance: List[EvidenceItem] = Field(default_factory=list)
    suggestedValue: Optional[str] = None
    unit: Optional[str] = None
    formatted: Optional[str] = None
    confidence: Optional[float] = None
    confidenceLevel: Optional[str] = None
    valueEvidence: List[EvidenceItem] = Field(default_factory=list)

class SuggestComponentAttributesResponse(BaseModel):
    suggestions: List[ComponentAttributeSuggestion]
    modelVersion: str = "1.0.0"

