import time
from contextlib import asynccontextmanager
from typing import Optional
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
    SuggestComponentAttributesRequest,
    SuggestComponentAttributesResponse,
    TrainingRunRequest,
    TrainingRunResponse,
    TrainingRunListResponse,
    ModelVersionResponse,
    ModelRegistryResponse,
    ModelDeployRequest,
    ModelDeploymentResponse,
    DatasetSnapshotResponse,
    DatasetOverviewResponse,
)
from .services.category_classifier import category_classifier
from .services.manufacturer_resolver import manufacturer_resolver
from .services.duplicate_detector import duplicate_detector
from .services.datasheet_extractor import datasheet_extractor
from .services.attribute_intelligence import attribute_intelligence_service
from .services import model_registry
from .services.training_runner import (
    DeploymentRefusedError,
    TrainingRunConflictError,
    TrainingRunNotFoundError,
    training_runner,
)

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
        version=settings.service_version,
        running_model=category_classifier.describe_artifact(),
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

    # 0. Datasheet input, in whichever form the caller has it.
    #
    # A pasted block of specification text is searchable as-is. A PDF has to be
    # read first, and reading it here rather than only inside the extraction
    # endpoint is what lets the *same* document text serve the category and
    # manufacturer resolvers too — otherwise a caller supplying a PDF would get
    # attribute extraction from it while classification still saw only the query.
    #
    # Both paths are bounded by the extractor (page and character caps), so a
    # large document changes how much is read, never how much is returned.
    document_text = req.datasheet_text or ""
    if req.datasheet_pdf_base64:
        pdf_text = datasheet_extractor.extract_text_from_pdf_base64(
            req.datasheet_pdf_base64
        )
        document_text = "\n".join(part for part in [document_text, pdf_text] if part)

    extraction_text = "\n".join(
        part for part in [pn, desc, document_text] if part
    ).strip()

    # 1. Category Classification
    cat_preds = category_classifier.predict(
        full_text,
        top_k=3,
        datapack_hints=hints,
        erp_categories=req.erp_categories,
        erp_manufacturers=req.erp_manufacturers,
        datasheet_text=document_text,
    )

    # 2. Manufacturer Resolution
    mfg_res = manufacturer_resolver.resolve(
        pn,
        desc,
        datasheet_text=document_text,
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
    #
    # The document text is part of what is read: a specification stated only in
    # the pasted datasheet block is a specification of this part, and leaving it
    # out is why a pasted datasheet produced no attributes.
    datasheet_res = datasheet_extractor.process(
        text=extraction_text, datapack_hints=hints
    )

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

@app.post("/v1/attributes/suggest-component-attributes", response_model=SuggestComponentAttributesResponse)
def suggest_component_attributes(req: SuggestComponentAttributesRequest):
    """
    The relevant specifications of one component, and why each one matters.

    Component-level counterpart of `/v1/attributes/suggest-category-attributes`:
    that endpoint asks what a *category* should be configured with, this one asks
    what a *part* probably has. The caller supplies its catalog, the category's
    bindings and the extraction it already ran, so this route adds judgement
    rather than a second read of the same data.
    """
    suggestions = attribute_intelligence_service.suggest_component_attributes(
        query=req.query,
        part_number=req.partNumber,
        description=req.description,
        datasheet_text=req.datasheetText,
        categories=req.categories,
        attributes=req.attributes,
        bound_attribute_ids=req.boundAttributeIds,
        bound_attribute_codes=req.boundAttributeCodes,
        existing_values=req.existingValues,
        extracted_attributes=req.extractedAttributes,
        datapack_hints=req.datapack_hints,
    )
    return SuggestComponentAttributesResponse(suggestions=suggestions)

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

# ---------------------------------------------------------
# ML Operations — training control plane
#
# INTERNAL SURFACE. Every route below is called only by the authenticated NestJS
# API (`MlClientService`), which is where authorisation, the durable training-run
# record and the security audit live. There is no service-to-service
# authentication between the API and this service today — that is pre-existing
# infrastructure debt, documented in docs/ML_OPERATIONS.md, and it is the reason
# these routes are never called from a browser and are not exposed through the
# public web app.
#
# What is enforced HERE, independently of the API:
#   - exactly one training run may be active (a second start is a 409);
#   - a run never promotes a model (`auto_deploy=False` by construction);
#   - deployment refuses anything that is not a PASSED candidate with a
#     `promotionEligible` evaluation report;
#   - a rollback is refused when no backup artifact exists.
# ---------------------------------------------------------


@app.post("/v1/training/runs", response_model=TrainingRunResponse, status_code=201)
def start_training_run(req: TrainingRunRequest):
    try:
        return TrainingRunResponse(**training_runner.start_run(req.runId, req.requestedBy))
    except TrainingRunConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@app.get("/v1/training/runs/active", response_model=Optional[TrainingRunResponse])
def get_active_training_run():
    run = training_runner.active_run()
    return TrainingRunResponse(**run) if run else None


@app.get("/v1/training/runs", response_model=TrainingRunListResponse)
def list_training_runs():
    return TrainingRunListResponse(
        runs=[TrainingRunResponse(**run) for run in training_runner.list_runs()]
    )


@app.get("/v1/training/runs/{run_id}", response_model=TrainingRunResponse)
def get_training_run(run_id: str):
    run = training_runner.get_run(run_id)
    if run is None:
        # The API turns this into `ML_JOB_LOST` for a run it still believes is
        # active: this process restarted, so nothing is progressing any more.
        raise HTTPException(status_code=404, detail="Unknown training run")
    return TrainingRunResponse(**run)


@app.get("/v1/models", response_model=ModelRegistryResponse)
def list_models():
    return ModelRegistryResponse(
        active=model_registry.active_deployment(),
        running=category_classifier.describe_artifact(),
        versions=[ModelVersionResponse(**item) for item in model_registry.list_versions()],
    )


@app.get("/v1/models/active", response_model=ModelRegistryResponse)
def get_active_model():
    """Alias kept for the dashboard's overview poll; identical body to /v1/models."""
    return list_models()


@app.post("/v1/models/deploy", response_model=ModelDeploymentResponse)
def deploy_candidate(req: ModelDeployRequest):
    try:
        return ModelDeploymentResponse(**training_runner.deploy_run(req.runId))
    except TrainingRunNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except DeploymentRefusedError as error:
        raise HTTPException(
            status_code=409, detail={"reason": error.code, "message": str(error)}
        ) from error
    except Exception as error:  # noqa: BLE001 - promotion failure must be explicit
        raise HTTPException(
            status_code=500,
            detail={"reason": "DEPLOYMENT_FAILED", "message": str(error) or "Deployment failed"},
        ) from error


@app.post("/v1/models/rollback", response_model=ModelDeploymentResponse)
def rollback_model():
    try:
        return ModelDeploymentResponse(**training_runner.rollback())
    except DeploymentRefusedError as error:
        raise HTTPException(
            status_code=409, detail={"reason": error.code, "message": str(error)}
        ) from error
    except Exception as error:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail={"reason": "ROLLBACK_FAILED", "message": str(error) or "Rollback failed"},
        ) from error


@app.post("/v1/models/reload", response_model=ModelDeploymentResponse)
def reload_model():
    """
    Re-reads the production artifact into the running process.

    Exposed so an operator can close a `reloadPending` state without restarting the
    container. It writes nothing: it only re-parses the artifact already on disk.
    """
    result = training_runner.reload_running_model()
    return ModelDeploymentResponse(
        artifactVersion=result.get("runningVersion"),
        runningVersion=result.get("runningVersion"),
        reloadPending=bool(result.get("reloadPending")),
        reloadError=result.get("reloadError"),
    )


@app.get("/v1/datasets/current", response_model=DatasetOverviewResponse)
def get_current_dataset():
    snapshots = model_registry.list_dataset_snapshots()
    return DatasetOverviewResponse(
        current=DatasetSnapshotResponse(**snapshots[0]) if snapshots else None,
        snapshots=[DatasetSnapshotResponse(**item) for item in snapshots],
        quarantine=model_registry.quarantine_summary(),
        distribution=model_registry.validated_record_distribution(),
    )

