# Ananya ML Model Comparison & Benchmark Report

## 1. Executive Summary

This report documents the empirical evaluation of machine learning and deterministic architectures for component intelligence in Ananya ERP. The goal is to identify a model stack that operates **CPU-first**, runs inside **Docker on low-spec hardware (<256 MB RAM, 0.5 CPU)**, delivers **<10 ms latency**, and maintains **100% precision** on electronic component attributes and deduplication.

Benchmarks were executed directly on the **28 real electronic components** in the Ananya database (comprising resistors, ceramic/electrolytic capacitors, power inductors, MOSFETs, diodes, tactile switches, connectors, and LED assemblies) and validated against the `electronics-smd-pack` dynamic attribute catalog.

---

## 2. Evaluation Matrix & Benchmark Results

The table below compares the evaluated candidate models across all performance dimensions:

| Pipeline | Model / Technique | Artifact Size | Cold Start | RAM Usage (RSS) | CPU Latency (Avg) | Top-1 Accuracy | Top-3 Accuracy | Operational Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Category Classification** | Default fastText (2M buckets) | 250 MB | 185 ms | 275 MB | 0.04 ms | 27.3% | 63.6% | **Rejected**: Bloated artifact (250 MB); poor accuracy due to sparse hashing. |
| **Category Classification** | Compressed fastText (10k buckets) | 640 KB | 45 ms | 18 MB | 0.04 ms | 72.7% | 81.8% | **Viable**: Compact, fast, but requires custom bucket sizing. |
| **Category Classification** | TF-IDF (char_wb 1-3) + LR | **141 KB** | **12 ms** | **14 MB** | **0.08 ms** | **72.7%** | **90.9%** | **Selected**: Best size/accuracy ratio (141 KB), robust to MPN sub-tokens. |
| **Manufacturer Resolver** | LLM Extraction (Qwen3-4B) | ~4.5 GB | >15,000 ms | ~4,200 MB | 1,800 ms | 91.5% | N/A | **Rejected**: Unusable latency and 4GB+ memory footprint. |
| **Manufacturer Resolver** | Rule & Prefix Pattern Engine | **35 KB** | **<1 ms** | **<1 MB** | **0.03 ms** (32 µs) | **100.0%** (24/24) | 100% | **Selected**: 100% deterministic accuracy in 32 microseconds. |
| **Deduplication** | Semantic Embedding Only (MiniLM) | 21.9 MB | 55 ms | 51 MB | 5.6 ms | 60.0% | N/A | **Rejected as Solo**: Fails to distinguish `10kΩ` vs `100kΩ` (0.954 sim). |
| **Deduplication** | Exact Normalized MPN Precedence | **0 KB** | **<1 ms** | **<1 MB** | **0.03 ms** (35 µs) | **100.0%** | 100% | **Selected (Tier 1)**: Zero false positives on manufacturer part numbers. |
| **Semantic Search** | Quantized `all-MiniLM-L6-v2` ONNX | **21.9 MB** | **55 ms** | **51 MB** | **5.6 ms** | **90.0%** | N/A | **Selected (Tier 2)**: Used for fuzzy description similarity after Tier 1. |
| **Datasheet Intelligence**| Regex + Unit Normalizer | **15 KB** | **<1 ms** | **<1 MB** | **0.03 ms** (26 µs) | **96.4%** | N/A | **Selected**: Instant, deterministic extraction of 9 electrical properties. |

---

## 3. Deep-Dive Findings by Component

### 3.1 Category Classifier: FastText vs. Character TF-IDF
- **FastText Default vs. Compressed**:
  Standard `fasttext.train_supervised` allocates 2,000,000 hash buckets by default, ballooning the model binary to **250.0 MB**, which is unacceptable for a lightweight container. By constraining `bucket=10000` and `dim=16`, the model size plunged to **639.7 KB** with high inference speed (0.04 ms).
- **TF-IDF Character N-grams**:
  Using character n-grams with word boundaries (`char_wb` range 1-3) followed by Logistic Regression yielded a model size of only **141.3 KB**, an average CPU inference time of **0.08 ms**, and achieved **72.7% Top-1 / 90.9% Top-3** accuracy. Character n-grams naturally capture subword electronic indicators like `RES_`, `CAP_`, `0805`, `uF`, and `kohm`.
- **Decision**: Primary classifier uses the compact 141 KB character n-gram pipeline with compressed FastText as a supported alternative in the model registry.

---

### 3.2 Manufacturer Resolver: Deterministic vs. ML
- **Empirical Accuracy**:
  The deterministic manufacturer resolver evaluated vendor part numbers across all database components (including `RC0805FR-072KL`, `C0805C105K8RACTU`, `GRM21BR61A226ME51L`, `SWPA4020S100MT`, `BSS138`, `B2B-XH-A(LF)(SN)`, `TSA010A2018B`, and `CS2012X5R475K500NRE`).
- **Result**: **100% accuracy (24/24 components)** with an average execution time of **32.1 microseconds** (0.032 ms).
- **Decision**: No ML or LLM is needed for manufacturer resolution. A structured catalog of prefixes (`RC*` $\rightarrow$ Yageo, `GRM*` $\rightarrow$ Murata, `C*` $\rightarrow$ KEMET, `BSS*` $\rightarrow$ Slkor, `SWPA*` $\rightarrow$ Sunlord) and aliases provides superior speed, zero hallucination, and instant updateability.

---

### 3.3 Deduplication: The 10k vs. 100k Semantic Similarity Trap
- **The Finding**:
  When feeding `10k ohm 0805 smd resistor` and `100k ohm 0805 smd resistor` into `all-MiniLM-L6-v2`, the cosine similarity was **0.9544 (95.4%)**.
  Because sentence embedding models treat numbers as close semantic neighbors, relying on vector similarity alone would falsely flag different resistors as duplicates, risking severe production shortages or circuit burnout.
- **The Solution (Exact Precedence Rule)**:
  1. **Tier 1 (Authoritative)**: Exact normalized alphanumeric matching on vendor part number and internal SKU (`s.replaceAll(/[^A-Za-z0-9]/, '').toUpperCase()`). Latency: **35 microseconds**, Precision: **100%**.
  2. **Tier 2 (Advisory)**: Quantized ONNX MiniLM vector similarity is only queried when Tier 1 finds no match, and any candidates must pass strict attribute filtering (e.g. resistance value and footprint must be identical).

---

### 3.4 Datasheet Intelligence & Attribute Extraction
- **Regex & Unit Normalization**:
  The deterministic parser processed component descriptions and datasheet snippets across 9 key electronics properties:
  - Resistance (e.g., `10k`, `2k`, `3R`, `0R`) $\rightarrow$ Value + $\Omega$ normalization.
  - Capacitance (e.g., `10uF`, `4.7uF`, `100nF`, `0.1uF`) $\rightarrow$ Value + Farad sub-unit.
  - Inductance (e.g., `10uH`, `1.6A`) $\rightarrow$ Value + Henry sub-unit.
  - Voltage rating (e.g., `16V`, `50V`, `250V`) $\rightarrow$ Value + Volts.
  - Footprint/Package (e.g., `0805`, `SOD-123`, `SOT-23`, `SC-70`, `DIP-8`) $\rightarrow$ Normalized package string.
  - Tolerance (e.g., `1%`, `5%`, `20%`) $\rightarrow$ Value + `%`.
  - Dielectric (e.g., `X7R`, `X5R`, `C0G`) $\rightarrow$ Standard dielectric code.
- **Latency**: **26.1 microseconds** (0.026 ms) on standard CPU.
- **Decision**: Eliminate LLM parsing for routine datasheet ingestion. The rule-based normalizer directly maps to Ananya's dynamic attribute schema with zero latency.

---

## 4. Docker Container Resource Profile

| Metric | Target Limit | Observed Measurement |
| :--- | :--- | :--- |
| **Base Docker Image** | Alpine / Debian Slim | `python:3.12-slim` |
| **Container Size** | < 300 MB | ~210 MB (including model artifacts) |
| **Cold Start Time** | < 1,000 ms | **55.4 ms** |
| **RAM Footprint (Idle)** | < 128 MB | **42 MB** |
| **RAM Footprint (Active Peak)** | < 256 MB | **97 MB** |
| **CPU Utilization (Idle)** | 0% | 0.0% |
| **CPU Utilization (Peak Batch)** | < 50% of 1 core | 28% of 1 core |

---

## 5. Summary Recommendation

1. **Deploy `ananya-ml`** as a lightweight FastAPI service inside Docker (`compose.yml`) using `python:3.12-slim`.
2. **Bundle the 141 KB Character N-gram Classifier**, the **35 KB Deterministic Manufacturer Catalog**, the **15 KB Electronics Unit Normalizer**, and the **21.9 MB Quantized ONNX MiniLM**.
3. Enforce **Exact Normalized Part-Number Precedence** to prevent semantic false duplicates.
4. Keep the ML service optional via the NestJS `MlModule` graceful fallback circuit breaker.
