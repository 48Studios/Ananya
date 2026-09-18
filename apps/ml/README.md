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
