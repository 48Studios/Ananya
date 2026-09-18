# RFC-0056: Lightweight CPU-First ML Architecture for Component Intelligence

## 1. Purpose

This RFC defines the revised, production-grade machine learning architecture for Ananya ERP (`ananya-ml`). It eliminates general-purpose Large Language Models (such as Qwen3-4B or Ollama) for routine component suggestions and establishes an Immich-style lightweight, CPU-first microservice designed for low-power hardware, high-throughput batch operations, and deterministic reliability.

---

## 2. Motivation

Previous architectural proposals explored running local LLMs (e.g., Qwen3-4B via Ollama) to assist with component ingestion, categorization, manufacturer resolution, and datasheet parsing. In practice, general-purpose LLMs present critical operational liabilities for enterprise ERP environments:

1. **Hardware Inefficiency**: A 4B–7B parameter LLM demands 4 GB–8 GB of VRAM/RAM, requiring discrete GPUs or high-end servers. On standard CPU hardware, token generation consumes seconds per component, causing unacceptable UI latency and thermal throttling.
2. **Non-Deterministic Extraction**: LLMs suffer from hallucination and variability in output formats, requiring complex prompt guarding and retry loops for structured data.
3. **Operational Overhead**: Requiring an external Ollama daemon or heavy Docker runtime violates the self-contained, turnkey deployment principle of Ananya.
4. **Poor Part-Number Discrimination**: General language models evaluate semantic similarity based on broad linguistic tokens rather than rigid electronics engineering parameters. For instance, embeddings often cluster `10kΩ` and `100kΩ` resistors together (similarity > 0.95), risking dangerous inventory corruption.

By transitioning to specialized, lightweight statistical models and deterministic parsers, Ananya achieves sub-10ms latency, zero GPU dependence, <100 MB RAM consumption, and 100% deterministic accuracy on component attributes.

---

## 3. Core Architectural Principles

1. **Immich-Style Microservice**: `ananya-ml` operates as an independent, stateless Python/FastAPI service packaged in Docker.
2. **CPU-First & Low Hardware Footprint**: The entire service executes comfortably on 0.5 CPU cores and <256 MB RAM. No CUDA or GPU acceleration is required.
3. **Exact Precedence Rule**: Exact normalized part-number (MPN) matching and physical parameter bounds strictly override semantic vector embeddings for duplicate detection.
4. **Graceful Degradation**: The ML service is entirely optional. If `ananya-ml` is absent, unreachable, or times out, Ananya's NestJS API continues to operate normally with in-process deterministic fallback.
5. **Cold-Start & Latency Budget**: Cold boot must complete in under 500 ms, and inference on individual components must complete in under 20 ms.

---

## 4. Proposed ML Stack & Component Pipelines

```
                                  Input Query / Part Number / Datasheet Text
                                                     │
               ┌─────────────────────────────────────┼─────────────────────────────────────┐
               │                                     │                                     │
               ▼                                     ▼                                     ▼
     ┌───────────────────┐                 ┌───────────────────┐                 ┌───────────────────┐
     │Category Classifier│                 │Manufacturer Lookup│                 │Datasheet Extractor│
     │                   │                 │                   │                 │                   │
     │ - TF-IDF char-wb  │                 │ - Deterministic   │                 │ - Regex Pattern   │
     │ - Compressed      │                 │   Catalog Prefix  │                 │   Matching        │
     │   FastText        │                 │ - Alias Map       │                 │ - Unit Normalizer │
     │ - Top-3 & Conf    │                 │ - Fuzzy Fallback  │                 │ - EE Schema Match │
     └─────────┬─────────┘                 └─────────┬─────────┘                 └─────────┬─────────┘
               │                                     │                                     │
               └───────────────────┬─────────────────┴─────────────────────────────────────┘
                                   │
                                   ▼
                   ┌───────────────────────────────┐
                   │  Deduplication & Similarity   │
                   │                               │
                   │  Tier 1: Exact Normalized MPN │
                   │  Tier 2: Quantized ONNX       │
                   │          all-MiniLM-L6-v2     │
                   └───────────────┬───────────────┘
                                   │
                                   ▼
                      Structured Suggestion Response
                      (JSON Contract with Confidence)
```

### 4.1 Category Classifier
- **Model**: Character and word n-gram model (compressed FastText or character n-gram TF-IDF with Linear/Logistic classifier).
- **Training Data**: Ananya catalog categories, subcategories, confirmed electronic components, and official Data Packs (`electronics-smd-pack`).
- **Output**: Primary category, subcategory, confidence score, and top-3 ranking alternatives.

### 4.2 Manufacturer Resolver
- **Mechanism**: Deterministic lookup table utilizing:
  - Canonical manufacturer names and standard industry codes (`YAGEO`, `MURATA`, `KEMET`, `VISHAY`, `SLKOR`, `JST`, `FENGHUA`, `SUNLORD`, etc.).
  - Manufacturer part-number prefix rules (e.g., `RC*` $\rightarrow$ Yageo, `GRM*` $\rightarrow$ Murata, `C*` $\rightarrow$ KEMET, `BSS*` $\rightarrow$ Slkor/Onsemi, `SWPA*` $\rightarrow$ Sunlord).
  - Alias normalization (e.g., "Phycomp" $\rightarrow$ Yageo, "Royalohm" $\rightarrow$ Uniohm).
- **Fallback**: Levenshtein / fuzzy string matching for manufacturer descriptions. No LLM.

### 4.3 Semantic Search & Duplicate Detection
- **Mechanism**: Two-tier deduplication:
  - **Tier 1 (Authoritative)**: Normalized exact MPN comparison (`s.replaceAll(/[^A-Za-z0-9]/, '').toUpperCase()`). If matched, duplicate certainty is 1.0.
  - **Tier 2 (Advisory)**: Quantized INT8 ONNX embedding model (`all-MiniLM-L6-v2`, ~22 MB model size, ~5 ms CPU inference). Gated by strict attribute compatibility (e.g., resistance, voltage, package footprint must match).

### 4.4 Datasheet Intelligence & Attribute Extraction
- **Mechanism**: Rule-based electrical engineering parameter extractor and unit normalizer.
- **Supported Parameters**: Resistance ($\Omega$, $\text{k}\Omega$, $\text{M}\Omega$), Capacitance ($\text{pF}$, $\text{nF}$, $\mu\text{F}$, $\text{F}$), Inductance ($\text{nH}$, $\mu\text{H}$, $\text{mH}$), Voltage Rating ($\text{V}$, $\text{kV}$, $\text{mV}$), Current Rating ($\text{mA}$, $\text{A}$), Power Rating ($\text{mW}$, $\text{W}$), Tolerance ($\%$, e.g., 1%, 5%), Package Footprint (`0402`, `0603`, `0805`, `1206`, `SOT-23`, `SOD-123`, `SC-70`, `DIP-8`), Dielectric (`X7R`, `X5R`, `C0G`, `NP0`).
- **Extraction Input**: Plaintext or direct PDF stream via `pypdf`.
- **Validation**: Strict schema conformance against Ananya's dynamic attribute registry.

---

## 5. Service Architecture & Docker Infrastructure

### 5.1 Service Topology
`ananya-ml` exposes an internal REST API on port `5000`:
- `GET /health`: Liveness probe.
- `GET /ready`: Readiness probe verifying cached model artifacts.
- `POST /v1/predict/category`: Predict category and subcategory for text query or batch.
- `POST /v1/resolve/manufacturer`: Deterministic manufacturer resolution.
- `POST /v1/detect/duplicates`: MPN normalization and semantic vector similarity.
- `POST /v1/extract/datasheet`: Attribute extraction from text or base64 PDF.
- `POST /v1/suggest`: Unified composite pipeline executing categorization, manufacturer resolution, deduplication, and attribute extraction in a single request.

### 5.2 Docker Specification
- **Base Image**: `python:3.12-slim`
- **Profiles**: `ml`, `all` (service name `ananya-ml`)
- **Resource Constraints**: Default `cpus: '0.5'`, `mem_limit: 256m`
- **Network**: `ananya_internal` (internal network; not exposed to public ingress)

---

## 6. Node.js & NestJS API Integration

### 6.1 Bounded Context & Dependency Direction
The NestJS API (`apps/api`) encapsulates all ML communication within `MlModule`:
- `MlClient`: Handles HTTP requests with a strict `1500ms` timeout using `AbortSignal`.
- `MlService`: Provides typed high-level methods with graceful fallback to in-process deterministic rules if `ananya-ml` is unreachable or disabled.
- `ComponentsController`: Exposes `POST /components/suggest` for web client consumption.

### 6.2 Data Flow & Entity Resolution
When `POST /components/suggest` is invoked:
1. NestJS checks `ML_SERVICE_ENABLED`. If false or unreachable, invokes in-memory deterministic regex patterns.
2. If ML service responds with category codes (e.g. `ELEC-RES`, `RESISTORS`) or manufacturer names (e.g. `Yageo`), NestJS maps these to active database UUIDs in `categories` and `manufacturers` tables.
3. Candidate duplicates are cross-referenced with active component SKUs in PostgreSQL.
4. Extracted dynamic attributes are checked against Ananya's `attributeDefinitions` table to ensure valid types and unit IDs.

---

## 7. Web UI Workflow & Review Experience

The web application integrates suggestions directly into the component workflow (`apps/web/components/components/component-form.tsx`):
1. **Low-Distraction Recommendation Card**: When the user enters an MPN or pastes part description, an AI suggestion banner appears displaying:
   - Suggested Category with confidence indicator (`<StatusBadge />`).
   - Resolved Manufacturer with matched rule badge.
   - Duplicate warning banner if similar parts exist in inventory.
   - Detected specifications pills (`10kΩ`, `0805`, `1%`, `50V`).
2. **One-Click Apply**: User can click "Apply All Suggestions" or selectively accept individual fields.
3. **Datasheet Paste / Upload**: A dedicated quick drawer allows pasting raw datasheet text or uploading a PDF, instantly pre-filling dynamic attributes without manual form entry.

---

## 8. Failure Modes & Graceful Degradation

| Failure Scenario | Behavior | ERP Impact |
| :--- | :--- | :--- |
| `ananya-ml` container not started | API detects ECONNREFUSED within 50ms, falls back to deterministic regex | Zero impact. Form continues to work normally. |
| Model inference timeout (>1500ms) | Request aborted, returns partial deterministic suggestion | Zero disruption. Warning logged in API. |
| Unrecognized part number pattern | Returns `Generic` manufacturer and low category confidence | User manually selects from shadcn Combobox. |
| Invalid / corrupt PDF | Returns empty attribute set with validation error | User notified via standard UI toast. |

---

## 9. Security & Privacy

1. **Air-Gapped & Offline Capable**: Zero outbound calls to external LLM APIs (OpenAI, Anthropic, HuggingFace Hub runtime).
2. **Internal Network Isolation**: `ananya-ml` is bound exclusively to `ananya_internal` bridge network and is inaccessible from the public internet.
3. **Input Sanitization**: File uploads are restricted to 10 MB with strict PDF magic-byte verification to prevent arbitrary file upload vulnerabilities.
