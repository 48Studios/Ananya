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
)
from .services.category_classifier import category_classifier
from .services.manufacturer_resolver import manufacturer_resolver
from .services.duplicate_detector import duplicate_detector
from .services.datasheet_extractor import datasheet_extractor

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
        datapack_hints=req.datapack_hints
    )
    return PredictCategoryResponse(predictions=predictions)

@app.post("/v1/predict/category/batch", response_model=BatchPredictCategoryResponse)
def predict_category_batch(req: BatchPredictCategoryRequest):
    results = category_classifier.predict_batch(
        req.texts,
        top_k=req.top_k,
        datapack_hints=req.datapack_hints
    )
    return BatchPredictCategoryResponse(results=results)

@app.post("/v1/resolve/manufacturer", response_model=ResolveManufacturerResponse)
def resolve_manufacturer(req: ResolveManufacturerRequest):
    return manufacturer_resolver.resolve(
        req.part_number,
        req.description or "",
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
    cat_preds = category_classifier.predict(full_text, top_k=3, datapack_hints=hints)

    # 2. Manufacturer Resolution
    mfg_res = manufacturer_resolver.resolve(pn, desc, datapack_hints=hints)

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
