# Ananya ML (`ananya-ml`)

Lightweight, CPU-first machine learning and deterministic component intelligence microservice for **Ananya ERP**.

Designed following the principles outlined in [RFC-0056](../../docs/rfcs/0056-lightweight-ml-architecture.md). It eliminates heavy GPU-dependent Large Language Models (LLMs) in favor of fast statistical classifiers, regex parsers, and strict electrical attribute value guards.

---

## Key Features

- **Category Classification**: Character and word n-gram model (scikit-learn) classifying electronic parts and mapping subcategories to parent groups.
- **Manufacturer Resolution**: Deterministic MPN prefix matching (`RC*` $\rightarrow$ Yageo, `GRM*` $\rightarrow$ Murata, `C*` $\rightarrow$ KEMET, `SWPA*` $\rightarrow$ Sunlord) with alias recognition.
- **Deduplication with Value Guard**: Tier-1 normalized MPN/SKU matching with Tier-2 character 3-gram similarity. Strictly prevents false positive duplicate merges between differing electrical ratings (e.g. 10kΩ vs 100kΩ).
- **Datasheet Parameter Extraction**: Rule-based extraction of resistance, capacitance, inductance, voltage, current, power, package footprints, and dielectric ratings from plaintext or PDF uploads (`pypdf`).
- **Low Footprint**: Operates comfortably on 0.5 CPU cores and <256 MB RAM. Sub-20ms inference latency.

---

## Directory Structure

```
apps/ml/
├── app/
│   ├── config.py             # Environment configuration & model paths
│   ├── main.py               # FastAPI application & route declarations
│   ├── schemas.py            # Pydantic request/response schemas
│   └── services/
│       ├── category_classifier.py    # TF-IDF & scikit-learn classifier
│       ├── datasheet_extractor.py    # EE attribute & package parser
│       ├── duplicate_detector.py     # Two-tier deduplication & value guard
│       └── manufacturer_resolver.py  # Regex prefix & catalog resolver
├── models/
│   ├── category_classifier.pkl       # Serialized scikit-learn model
│   └── manufacturer_catalog.json     # Manufacturer definitions and prefixes
├── tests/
│   └── test_ml_service.py            # Pytest test suite
├── pyproject.toml
└── requirements.txt
```

---

## Quickstart

### 1. Run via Docker Compose (Recommended)

From the repository root:

```bash
# Start ML microservice locally (port 5001)
docker compose -f compose.yml -f compose.local.yml --profile ml up --build -d ml

# Or start the entire production-equivalent stack
docker compose -f compose.yml -f compose.local.yml --profile all up --build -d
```

Verify service readiness:

```bash
curl http://localhost:5001/health
curl http://localhost:5001/ready
```

### 2. Run Locally via Python (Host)

**Prerequisites**: Python `>= 3.11` (or `3.12`).

```bash
# Create and activate virtual environment
cd apps/ml
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the service from repository root
cd ../..
uvicorn apps.ml.app.main:app --host 0.0.0.0 --port 5001 --reload
```

### 3. Running Tests

```bash
# Run pytest from repository root
pytest apps/ml/tests -v
```

---

## Training & Retraining

The training pipeline lives in `pipeline/` and implements the full workflow defined in [RFC-0058](../../docs/rfcs/0058-authoritative-data-training-pipeline.md). It executes six stages sequentially: collect, validate, build dataset, train, evaluate quality gates, and deploy.

### Full Pipeline (Single Command)

From the **repository root**:

```bash
# Activate the ML virtualenv
source apps/ml/.venv/bin/activate

# Run the complete 6-stage pipeline
python -m apps.ml.pipeline.run_training --version 1.4.0
```

This will:

| Stage | Script | Purpose |
| :--- | :--- | :--- |
| 1 | `collect.py` | Ingest authoritative records with ground-truth provenance |
| 2 | `validate.py` | Schema validation, physics sanity bounds, quarantine conflicts |
| 3 | `build_dataset.py` | Taxonomy mapping, grouped zero-leakage train/val split |
| 4 | `train.py` | Train multiple candidate architectures, select champion |
| 5 | `evaluate.py` | Quality gates vs active production baseline |
| 6 | `deploy.py` | Promote champion to production (if gates pass) |

### Incorporating Human Feedback

The review queue and suggestion feedback collected in `ai_suggestion_feedback` can be exported and fed into retraining.

**Export feedback via the API:**

```bash
curl http://localhost:3000/api/ml/feedback/export > feedback.json
```

**Or use the dedicated export script:**

```bash
python -m apps.ml.pipeline.export_feedback --output feedback.json
```

**Pass the feedback file into training:**

```bash
python -m apps.ml.pipeline.run_training --version 1.4.0 --feedback-file feedback.json
```

### CLI Options

```
python -m apps.ml.pipeline.run_training [OPTIONS]

  --version          Model and dataset version string (default: 1.3.0)
  --feedback-file    Path to exported human feedback JSON
  --extra-catalog    Path to supplementary manufacturer catalog JSON
  --no-deploy        Skip automatic production deployment (dry run)
```

### Running Individual Stages

Each stage can be executed independently for debugging or iteration:

```bash
# Collect authoritative records
python -m apps.ml.pipeline.collect

# Validate and quarantine
python -m apps.ml.pipeline.validate

# Build versioned dataset snapshot
python -m apps.ml.pipeline.build_dataset --version 1.4.0

# Train model candidates
python -m apps.ml.pipeline.train --version 1.4.0

# Evaluate quality gates
python -m apps.ml.pipeline.evaluate --version 1.4.0

# Deploy to production
python -m apps.ml.pipeline.deploy --version 1.4.0
```

### Pipeline Directory Structure

```
apps/ml/pipeline/
├── run_training.py        # End-to-end orchestrator (entry point)
├── collect.py             # Stage 1: Record ingestion with provenance
├── validate.py            # Stage 2: Schema and physics validation
├── build_dataset.py       # Stage 3: Grouped split and snapshot
├── train.py               # Stage 4: Multi-candidate training
├── evaluate.py            # Stage 5: Quality gate evaluation
├── deploy.py              # Stage 6: Model promotion
└── export_feedback.py     # Utility: Export feedback for retraining
```

### Model Artifacts

Trained models and reports are written to the registry:

```
apps/ml/models/registry/v{version}/
├── category_classifier.pkl     # Champion model artifact
└── pipeline_summary.json       # Full execution report
```

---

## API Reference

The service runs on internal port `5001`:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Liveness probe returning service status and version |
| `GET` | `/ready` | Readiness probe confirming loaded model artifacts |
| `POST` | `/v1/predict/category` | Predict category and subcategory for a single text query |
| `POST` | `/v1/predict/category/batch` | Batch category predictions for multiple queries |
| `POST` | `/v1/resolve/manufacturer` | Resolve manufacturer by part number prefix or description |
| `POST` | `/v1/detect/duplicates` | Authoritative duplicate detection with electrical value guards |
| `POST` | `/v1/extract/datasheet` | Extract electrical parameters from text or base64 PDF |
| `POST` | `/v1/suggest` | Unified composite pipeline executing all 4 intelligence steps |

---

## Configuration

Environment variables (configurable via `.env` or container environment):

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `5001` | HTTP listening port |
| `MODEL_DIR` | `apps/ml/models` | Path containing serialized models and catalogs |
| `CATEGORY_MODEL_PATH` | `<MODEL_DIR>/category_classifier.pkl` | Path to scikit-learn classification artifact |
| `MANUFACTURER_CATALOG_PATH` | `<MODEL_DIR>/manufacturer_catalog.json` | Path to manufacturer prefix rules JSON |
| `ENABLE_ONNX_EMBEDDINGS` | `false` | Enable optional quantized ONNX embedding model |
