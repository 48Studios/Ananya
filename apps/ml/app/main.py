import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .schemas import (
    HealthResponse,
    ReadyResponse,
    PredictCategoryRequest,
    PredictCategoryResponse,
    BatchPredictCategoryRequest,
    BatchPredictCategoryResponse,
    ResolveManufacturerRequest,
    ResolveManufacturerResponse,
    DetectDuplicatesRequest,
    DetectDuplicatesResponse,
    ExtractDatasheetRequest,
    ExtractDatasheetResponse,
    SuggestComponentRequest,
    SuggestComponentResponse,
    EvidenceItem,
    SuggestAttributeBindingsRequest,
    SuggestAttributeBindingsResponse,
    SuggestCategoryAttributesRequest,
    SuggestCategoryAttributesResponse,
    SuggestAttributeConfigRequest,
    SuggestAttributeConfigResponse,
    DetectAttributeDuplicatesRequest,
    DetectAttributeDuplicatesResponse,
    SuggestEnumValuesRequest,
    SuggestEnumValuesResponse,
    AuditAttributeLibraryRequest,
    AuditAttributeLibraryResponse,
)
from .services.category_classifier import category_classifier
from .services.manufacturer_resolver import manufacturer_resolver
from .services.duplicate_detector import duplicate_detector
from .services.datasheet_extractor import datasheet_extractor
from .services.attribute_intelligence import attribute_intelligence_service

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Eagerly load lightweight models on startup (<50ms)
    category_classifier.load()
    manufacturer_resolver.load()
    yield

app = FastAPI(
    title="Ananya ML Service",
    description="Lightweight CPU-first machine learning service for Ananya ERP component intelligence (RFC-0057)",
    version=settings.service_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(
        status="ok",
        version=settings.service_version
    )

@app.get("/ready", response_model=ReadyResponse)
def ready():
    models_loaded = {
        "category_classifier": category_classifier.is_loaded,
        "manufacturer_resolver": manufacturer_resolver.is_loaded,
    }
    is_ready = all(models_loaded.values())
    return ReadyResponse(
        ready=is_ready,
        models_loaded=models_loaded,
        version=settings.service_version
    )

@app.post("/v1/predict/category", response_model=PredictCategoryResponse)
def predict_category(req: PredictCategoryRequest):
    predictions = category_classifier.predict(
        req.text,
        top_k=req.top_k,
        datapack_hints=req.datapack_hints,
        erp_categories=req.erp_categories,
        erp_manufacturers=req.erp_manufacturers,
        datasheet_text=req.datasheet_text or "",
    )
    return PredictCategoryResponse(predictions=predictions)

@app.post("/v1/predict/category/batch", response_model=BatchPredictCategoryResponse)
def predict_category_batch(req: BatchPredictCategoryRequest):
    results = category_classifier.predict_batch(
        req.texts,
        top_k=req.top_k,
        datapack_hints=req.datapack_hints,
        erp_categories=req.erp_categories,
        erp_manufacturers=req.erp_manufacturers,
    )
    return BatchPredictCategoryResponse(results=results)

@app.post("/v1/resolve/manufacturer", response_model=ResolveManufacturerResponse)
def resolve_manufacturer(req: ResolveManufacturerRequest):
    return manufacturer_resolver.resolve(
        req.part_number,
        req.description or "",
        datasheet_text=req.datasheet_text or "",
        erp_manufacturers=req.erp_manufacturers,
        datapack_hints=req.datapack_hints
    )

@app.post("/v1/detect/duplicates", response_model=DetectDuplicatesResponse)
def detect_duplicates(req: DetectDuplicatesRequest):
    return duplicate_detector.detect(
        part_number=req.part_number,
        description=req.description or "",
        existing_components=req.existing_components,
        similarity_threshold=req.similarity_threshold,
        datapack_hints=req.datapack_hints,
    )

@app.post("/v1/extract/datasheet", response_model=ExtractDatasheetResponse)
def extract_datasheet(req: ExtractDatasheetRequest):
    return datasheet_extractor.process(
        text=req.text,
        pdf_base64=req.pdf_base64,
        datapack_hints=req.datapack_hints,
    )

@app.post("/v1/suggest", response_model=SuggestComponentResponse)
def suggest_component(req: SuggestComponentRequest):
    t0 = time.perf_counter()

    pn = req.part_number or req.query
    desc = req.description or req.query
    full_text = f"{pn} {desc}".strip()
    hints = req.datapack_hints

    # 1. Category Classification
    cat_preds = category_classifier.predict(
        full_text,
        top_k=3,
        datapack_hints=hints,
        erp_categories=req.erp_categories,
        erp_manufacturers=req.erp_manufacturers,
        datasheet_text=req.datasheet_text or "",
    )

    # 2. Manufacturer Resolution
    mfg_res = manufacturer_resolver.resolve(
        pn,
        desc,
        datasheet_text=req.datasheet_text or "",
        erp_manufacturers=req.erp_manufacturers,
        datapack_hints=hints,
    )

    # 3. Duplicate Detection (Authoritative exact MPN + value guard)
    dup_res = duplicate_detector.detect(
        part_number=pn,
        description=desc,
        existing_components=req.existing_components,
        datapack_hints=hints,
    )

    # 4. Attribute Extraction
    datasheet_res = datasheet_extractor.process(text=full_text, datapack_hints=hints)

    # 5. Composite Confidence Calibration & Evidence Aggregation
    overall_evidence = []
    if cat_preds and cat_preds[0].evidence:
        overall_evidence.extend(cat_preds[0].evidence[:2])
    if mfg_res.evidence:
        overall_evidence.extend(mfg_res.evidence[:1])
    for attr in list(datasheet_res.attributes.values())[:2]:
        if attr.evidence:
            overall_evidence.extend(attr.evidence[:1])

    # Compute overall confidence level
    high_signals = 0
    if cat_preds and cat_preds[0].confidence_level == "HIGH":
        high_signals += 1
    if mfg_res.confidence_level == "HIGH":
        high_signals += 1
    if len(datasheet_res.attributes) > 0:
        high_signals += 1

    if high_signals >= 2:
        overall_conf_level = "HIGH"
    elif high_signals == 1:
        overall_conf_level = "MEDIUM"
    else:
        overall_conf_level = "LOW"

    elapsed_ms = (time.perf_counter() - t0) * 1000

    return SuggestComponentResponse(
        category_predictions=cat_preds,
        manufacturer=mfg_res,
        duplicates=dup_res,
        extracted_attributes=datasheet_res.attributes,
        confidence_level=overall_conf_level,
        overall_evidence=overall_evidence,
        execution_time_ms=round(elapsed_ms, 3),
    )

# ---------------------------------------------------------
# Attribute Intelligence Endpoints (RFC-0059)
# ---------------------------------------------------------

@app.post("/v1/attributes/suggest-bindings", response_model=SuggestAttributeBindingsResponse)
def suggest_attribute_bindings(req: SuggestAttributeBindingsRequest):
    suggestions = attribute_intelligence_service.suggest_attribute_bindings(
        attribute_name=req.attributeName,
        attribute_code=req.attributeCode,
        description=req.description,
        data_type=req.dataType,
        unit_category=req.unitCategory,
        categories=req.categories,
        datapack_hints=req.datapack_hints,
        component_category_counts=req.component_category_counts,
    )
    return SuggestAttributeBindingsResponse(suggestions=suggestions)

@app.post("/v1/attributes/suggest-category-attributes", response_model=SuggestCategoryAttributesResponse)
def suggest_category_attributes(req: SuggestCategoryAttributesRequest):
    suggestions = attribute_intelligence_service.suggest_category_attributes(
        category_id=req.categoryId,
        category_code=req.categoryCode,
        category_name=req.categoryName,
        existing_attributes=req.existingAttributes,
        bound_attribute_ids=req.boundAttributeIds,
        datapack_hints=req.datapack_hints,
        category_component_count=req.categoryComponentCount,
    )
    return SuggestCategoryAttributesResponse(suggestions=suggestions)

@app.post("/v1/attributes/suggest-config", response_model=SuggestAttributeConfigResponse)
def suggest_attribute_config(req: SuggestAttributeConfigRequest):
    suggestion = attribute_intelligence_service.suggest_attribute_config(
        name=req.name,
        description=req.description,
        existing_attributes=req.existingAttributes,
        datapack_hints=req.datapack_hints,
    )
    return SuggestAttributeConfigResponse(suggestion=suggestion)

@app.post("/v1/attributes/detect-duplicates", response_model=DetectAttributeDuplicatesResponse)
def detect_attribute_duplicates(req: DetectAttributeDuplicatesRequest):
    is_dup, matches, aliases = attribute_intelligence_service.detect_duplicates(
        name=req.name,
        code=req.code,
        existing_attributes=req.existingAttributes,
        existing_bindings=req.existingBindings,
        threshold=req.threshold,
        datapack_hints=req.datapack_hints,
    )
    return DetectAttributeDuplicatesResponse(
        isDuplicate=is_dup,
        matches=matches,
        suggestedAliases=aliases,
    )

@app.post("/v1/attributes/suggest-enum-values", response_model=SuggestEnumValuesResponse)
def suggest_enum_values(req: SuggestEnumValuesRequest):
    suggested = attribute_intelligence_service.suggest_enum_values(
        attribute_code=req.attributeCode,
        attribute_name=req.attributeName,
        existing_options=req.existingOptions,
        datapack_hints=req.datapack_hints,
    )
    return SuggestEnumValuesResponse(suggestedOptions=suggested)

@app.post("/v1/attributes/audit", response_model=AuditAttributeLibraryResponse)
def audit_attribute_library(req: AuditAttributeLibraryRequest):
    summary, issues = attribute_intelligence_service.audit_library(
        attributes=req.attributes,
        categories=req.categories,
        bindings=req.bindings,
        component_counts_by_attribute=req.componentCountsByAttribute,
        component_counts_by_category_attribute=req.componentCountsByCategoryAttribute,
        datapack_hints=req.datapack_hints,
    )
    return AuditAttributeLibraryResponse(summary=summary, issues=issues)

