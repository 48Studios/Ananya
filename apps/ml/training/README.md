# Ananya ML Training Workspace

Local development machine learning and data-training workspace for **Ananya ERP**.

Designed to support broad ERP product intelligence across:
- **Electronics & Semiconductors** (ICs, passives, diodes, microcontrollers)
- **Electrical Equipment** (relays, cables, switches, terminal blocks)
- **Mechanical Parts & Fasteners** (screws, bolts, bearings, heatsinks, gears)
- **Tools & Hardware** (multimeters, hand tools, crimpers)
- **Raw Materials** (sheet metal, rods, FR-4 laminates)
- **Consumables** (solder, flux, adhesives, thermal compound)
- **3D-Printing Materials** (PLA/PETG/ABS filament, photopolymer resins)
- **Industrial Components** (solenoid valves, pneumatic cylinders, sensors)
- **Finished Goods & Packaging** (assemblies, antistatic bags, cartons)

---

## Architecture & Boundaries

```
apps/ml/
├── app/                         # Production inference microservice (FastAPI, sub-20ms)
├── models/                      # Deployed model artifacts & versioned registry
├── pipeline/                    # Existing RFC-0058 training automation & operator bridge
└── training/                    # Local development ML & data-training workspace
    ├── datasets/
    │   ├── raw/                 # Raw ingested records with full provenance
    │   ├── cleaned/             # Validated & quarantined datasets
    │   ├── normalized/          # Standardized units, taxonomy, text, MPNs
    │   ├── training/            # Task-specific snapshots (classification, etc.)
    │   └── evaluation/          # Held-out benchmark & evaluation partitions
    │
    ├── collectors/              # Extensible multi-source data collectors
    ├── processors/              # Validation, normalization, deduplication, value guards
    ├── generators/              # Task dataset generators (classification, attributes, etc.)
    ├── datasets/splitter.py     # Deterministic zero-leakage grouped splitter
    ├── trainers/                # Scikit-learn candidate trainers & device-aware hooks
    ├── evaluation/              # Reusable metrics engine & automated quality gates
    ├── experiments/             # Experiment runs & version tracking
    ├── config/                  # Settings & hardware detection (Apple Silicon / CUDA / CPU)
    └── cli.py                   # Composable CLI entry point
```

### Production Boundary Guarantee
- `apps/ml/app/` remains the production runtime inference service.
- `apps/ml/training/` is development-only training infrastructure.
- `docker/Dockerfile.ml` copies only production runtime dependencies and runtime directories (`app/`, `models/`, `pipeline/`, `benchmarks/`, `data/`). The new `training/` workspace and raw datasets are **never** included in production Docker images.

---

## 1. Existing Training Pipeline Audit

The existing training pipeline was established under RFC-0058 and RFC-0057:

| Aspect | Current RFC-0058 Implementation | Training Workspace Evolution |
| :--- | :--- | :--- |
| **Entry Point** | `apps/ml/pipeline/run_training.py` | Composable `apps/ml/training/cli.py` + legacy bridge |
| **Datasets** | `apps/ml/data/*.json` | Structured lifecycle (`datasets/raw`, `cleaned`, `normalized`, `training`, `evaluation`) |
| **Scope** | Electronics passives & ICs | Generalized ERP product domains (mechanical, fasteners, tools, materials, etc.) |
| **Feature Extraction** | Word n-grams, Char n-grams, Hybrid Union | Extensible candidate trainer architectures + hardware acceleration |
| **Classification Model** | `TfidfVectorizer` + `LogisticRegression(C=5.0)` | Retained champion classifier + extensible model base |
| **Data Splitting** | `GroupShuffleSplit` on base MPN | `DeterministicDatasetSplitter` (seed-controlled, zero-leakage, train/val/test) |
| **Quality Gates** | Top-1 accuracy, duplicate precision/recall, latency, RAM | `ModelEvaluator` with machine-readable JSON & human-readable Markdown summary |
| **Deployment** | `deploy.py` checks gates, backs up to `.backup`, updates metadata | Same promotion mechanism into `apps/ml/models/` |

---

## 2. Dataset Lifecycle & Provenance

Every dataset record progresses through a four-stage pipeline:

```
Raw Data Ingest (collectors)
  ↓
Cleaned & Quarantined (validation)
  ↓
Normalized (units, taxonomy, MPNs)
  ↓
Task Datasets & Zero-Leakage Split (generators + splitter)
  ↓
Model Training & Quality Gate Evaluation
```

### Provenance Audit Trail
Every record preserves:
- `source`: Origin name (e.g. `ananya_db`, `murata_catalog`, `digikey_feed`)
- `source_type`: One of `ananya_db_snapshot`, `manufacturer_catalog`, `distributor_catalog`, `datasheet`, `human_reviewed_feedback`, `user_provided`
- `source_url`: URL or internal URI reference
- `source_id`: Upstream record or database UUID
- `collected_at`: UTC ISO-8601 timestamp
- `license`: Usage terms
- `processing_version`: Processor version
- `verification_status`: `VERIFIED`, `QUARANTINED`, `REJECTED`, or `UNVERIFIED`

---

## 3. Local CLI Usage (`ananya-ml`)

You can run the workspace CLI using:
```bash
PYTHONPATH=. python -m apps.ml.training.cli <command>
```

### Data Commands
```bash
# Inspect dataset files or directories
PYTHONPATH=. python -m apps.ml.training.cli data inspect apps/ml/training/datasets/raw

# Export training snapshot from Ananya DB or export files
PYTHONPATH=. python -m apps.ml.training.cli data export --snapshot-file db_dump.json --output apps/ml/training/datasets/raw/snapshot.json

# Validate records and isolate quarantine
PYTHONPATH=. python -m apps.ml.training.cli data validate --input apps/ml/training/datasets/raw/fixtures.json

# Normalize text, units, manufacturer aliases, and categories
PYTHONPATH=. python -m apps.ml.training.cli data normalize --input apps/ml/training/datasets/cleaned/validated_records.json

# Deduplicate records with physical value guards
PYTHONPATH=. python -m apps.ml.training.cli data dedupe --input apps/ml/training/datasets/normalized/normalized_records.json
```

### Dataset & Training Commands
```bash
# Build task dataset (e.g. classification)
PYTHONPATH=. python -m apps.ml.training.cli dataset build --input apps/ml/training/datasets/normalized/normalized_records.json

# Split dataset deterministically (train: 80%, val: 10%, test: 10%) with zero leakage
PYTHONPATH=. python -m apps.ml.training.cli dataset split --input apps/ml/training/datasets/training/classification_dataset.json --version 1.4.0

# Train candidate models and select champion
PYTHONPATH=. python -m apps.ml.training.cli train --train-path apps/ml/training/datasets/training/snapshot-1.4.0/train.json --val-path apps/ml/training/datasets/training/snapshot-1.4.0/val.json --version 1.4.0

# Evaluate candidate model against quality gates and active baseline
PYTHONPATH=. python -m apps.ml.training.cli evaluate --val-path apps/ml/training/datasets/training/snapshot-1.4.0/val.json --version 1.4.0

# List experiment runs and registered model versions
PYTHONPATH=. python -m apps.ml.training.cli experiment
```

---

## 4. Hardware Awareness

The training workspace automatically detects and configures hardware acceleration:
- **MacBook Apple Silicon (M4 Pro / Metal / MPS)**: Automatically selects `mps` when running PyTorch or native Metal capabilities.
- **Workstations (32GB RAM / 16GB VRAM / CUDA)**: Automatically uses `cuda` if an NVIDIA GPU is available.
- **CPU Fallback**: Fallback to multi-threaded CPU for scikit-learn models and lightweight inference.

Device override via environment variable:
```bash
export ANANYA_ML_DEVICE=mps   # or 'cpu' or 'cuda'
```

---

## 5. Autonomous Data Collection

Ananya ML includes an autonomous, policy-compliant data collection system designed to gather publicly accessible technical product catalogs, specifications, and technical documents across broad ERP domains (mechanical, fasteners, electrical, electronics, tools, consumables, packaging, etc.).

### Pipeline Flow
```
Source Registry (config/sources.yaml)
      ↓
Autonomous Discovery (sitemaps, catalogs, product pages, PDFs)
      ↓
Resilient Download (ETags, 304 Not Modified, SHA-256, max file sizes)
      ↓
Raw Dataset Storage (datasets/raw/web, catalogs, documents, metadata)
      ↓
Structured Extraction (HTML JSON-LD, OpenGraph, Spec Tables, PDF Parser)
      ↓
Normalization & Cleaning (Standardized units, taxonomy, MPN variants)
      ↓
Validation & Quarantine (Range checks, physical sanity, cross-source conflict detection)
      ↓
Deduplication & Value Guards (Preserves conflicting physical ratings)
      ↓
Dataset Versioning & Zero-Leakage Split (datasets/training/dataset-crawl-<timestamp>)
      ↓
Training-Ready Corpus
```

> **Note**: Autonomous data collection does **NOT** automatically train or deploy models to production.

---

### Source Registry Configuration (`config/sources.yaml`)

Sources are defined declaratively in `apps/ml/training/config/sources.yaml`. Python code does not contain hardcoded websites.

```yaml
sources:
  - id: example-manufacturer
    name: Example Fastener & Mechanical Manufacturer
    type: manufacturer                    # manufacturer | distributor | public_dataset | technical_document | catalog | generic_web
    source_quality: authoritative_manufacturer # authoritative_manufacturer | distributor | public_dataset | generic_web | user_supplied
    enabled: true
    domains:
      - example.com                       # Strict domain allowlist
      - cdn.example.com
    start_urls:
      - https://example.com/sitemap.xml
      - https://example.com/catalog
    discovery:
      - sitemap                           # sitemap | catalog | product_pages | documents | links
      - product_pages
      - documents
    rate_limit:
      requests_per_second: 1.0            # Default 1 rps
      delay_seconds: 1.0
      max_concurrent: 1
    max_depth: 3
    max_pages: 500
    max_files: 200
    default_domain: fasteners             # electronics | electrical | mechanical | fasteners | tools | etc.
```

#### Adding a New Source
1. Append the declarative block to `apps/ml/training/config/sources.yaml`.
2. Specify the strict domain boundary in `domains:`.
3. Provide one or more `start_urls` (sitemap or catalog index).
4. Run a dry run to verify discovery:
   ```bash
   PYTHONPATH=. python -m apps.ml.training.cli collect --source <source-id> --dry-run
   ```

---

### Command-Line Interface (`ananya-ml collect`)

```bash
# Run a dry run (discovers URLs without downloading or mutating state)
PYTHONPATH=. python -m apps.ml.training.cli collect --dry-run

# Run collection for a specific configured source
PYTHONPATH=. python -m apps.ml.training.cli collect --source sample-fasteners-mfg

# Run collection for a specific domain
PYTHONPATH=. python -m apps.ml.training.cli collect --domain fasteners.internal

# Limit page depth and document downloads
PYTHONPATH=. python -m apps.ml.training.cli collect --source sample-fasteners-mfg --max-pages 50 --max-files 20

# Resume an interrupted collection run (skips unchanged URLs via ETag/SHA-256)
PYTHONPATH=. python -m apps.ml.training.cli collect --resume

# Force a recrawl from scratch (ignores acquisition cache)
PYTHONPATH=. python -m apps.ml.training.cli collect --no-resume

# Run with a custom rate limit (e.g. 0.5 requests per second = 2s delay)
PYTHONPATH=. python -m apps.ml.training.cli collect --source sample-fasteners-mfg --rate-limit 0.5

# Continuous periodic collection loop (polling every N seconds)
PYTHONPATH=. python -m apps.ml.training.cli collect --continuous --interval 3600
```

---

### Storage, Provenance & Acquisition Manifest

#### Raw Data Storage Structure
```
apps/ml/training/datasets/raw/
├── web/                   # Raw HTML pages saved as {source_id}_{hash[:16]}.html
├── catalogs/              # Raw catalog exports
├── documents/             # Raw PDF datasheets saved as {source_id}_{hash[:16]}.pdf
├── datasets/              # External public raw dataset dumps
└── metadata/              # Crawl state tracking
    └── acquisition.json   # Persistent acquisition store database
```

#### Acquisition Database (`acquisition.json`)
Tracks every discovered and downloaded resource to prevent duplicate crawls:
- `canonical_url` (tracking parameters and fragments stripped)
- `content_hash` (SHA-256 checksum)
- `etag` and `last_modified` (used for HTTP 304 conditional GETs)
- `processing_status` (`DISCOVERED`, `DOWNLOADED`, `PROCESSED`, `SKIPPED`, `FAILED`)
- `parser` (`html_extractor`, `pdf_extractor`)
- `first_seen`, `last_seen`, `last_downloaded`

#### Provenance Preservation
Every extracted `ProductRecord` preserves:
- `source`: Configured source ID
- `source_type`: e.g. `manufacturer`, `distributor`, `generic_web`
- `source_quality`: Quality tier (`authoritative_manufacturer`, `distributor`, etc.)
- `source_url`: Full canonical URL of the resource
- `content_type`: MIME type (`text/html`, `application/pdf`)
- `content_hash`: SHA-256 hash of original file
- `collected_at`: UTC timestamp
- `license`: Usage terms (`public_catalog`, etc.)

---

### Scheduling Collection

#### 1. Built-in Continuous Mode
```bash
PYTHONPATH=. python -m apps.ml.training.cli collect --continuous --interval 86400
```

#### 2. Local Cron (macOS / Linux)
To run autonomous collection daily at 02:00:
```crontab
0 2 * * * cd /path/to/ananya && PYTHONPATH=. apps/ml/.venv/bin/python -m apps.ml.training.cli collect --all >> /path/to/ananya/apps/ml/training/datasets/raw/metadata/crawl.log 2>&1
```

#### 3. macOS launchd Job
Create `~/Library/LaunchAgents/com.ananya.ml.collect.plist` referencing `apps/ml/.venv/bin/python` with arguments `["-m", "apps.ml.training.cli", "collect", "--all"]`.

---

### Robots, Crawl Policy & Legal Safeguards

The collection engine implements strict compliance safeguards:
- **`robots.txt` Compliance**: Automatically fetches, caches, and parses `/robots.txt` before crawling any host. Disallowed paths are never crawled.
- **Strict Domain Boundaries**: URLs outside configured `domains` are dropped immediately. No uncontrolled internet-wide crawling.
- **Polite Delays & Rate Limiting**: Defaults to 1 request per second with exponential backoff on HTTP 502/503/504 errors.
- **HTTP 429 Retry-After**: Strictly pauses crawls for the duration indicated in `Retry-After` headers.
- **Security Boundaries**: Downloaded content is treated as untrusted data. No embedded JavaScript or scripts are executed. File size is capped (default 15MB) to prevent denial-of-service or zip/compression bombs.
- **No Access Control Evasion**: Never bypasses CAPTCHAs, paywalls, authentications, or site restrictions. Only crawls publicly indexable product and catalog material.

---

### Real-World Collection Command

To initiate a live autonomous collection run across enabled sources:
```bash
PYTHONPATH=. apps/ml/.venv/bin/python -m apps.ml.training.cli collect --all --resume
```

