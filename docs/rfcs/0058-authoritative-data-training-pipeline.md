# RFC-0058: Independent ML Training Pipeline Using Authoritative & Verified Data

## 1. Purpose

This RFC establishes the independent training, validation, and dataset curation pipeline for Ananya's lightweight component intelligence system (`ananya-ml`).

It guarantees that **AI never generates its own training labels** and that all model training data originates exclusively from authoritative, verified sources or human-confirmed enterprise inventory.

---

## 2. Core Architectural Principle: The Non-Hallucinatory Loop

### Anti-Pattern: Self-Reinforcing AI Bias (Forbidden)
```text
AI Suggestion ──> Unverified Database ──> Training Data ──> AI reinforces its own hallucination
```

### Correct Pattern: Authoritative Human-in-the-Loop Architecture
```text
Authoritative Data Sources (Datasheets, Catalogs, Confirmed Inventory)
                    │
                    ▼
       Rigorous Validation & Cross-Source Conflict Check
                    │
           ┌────────┴────────┐
           ▼                 ▼
   Verified Dataset      Quarantine (Needs Human Review)
           │
           ▼
    Grouped Split (Zero Data Leakage by MPN Family)
           │
           ▼
  Candidate Training (TF-IDF char/word + Classifier)
           │
           ▼
   Quality Gate Evaluation (vs Active Production Model)
           │
           ▼
    Explicit Human Promotion (Deploy to Production)
           │
           ▼
  Production Suggestion ──> Human Confirms/Edits ──> Future Verified Data
```

---

## 3. Authoritative Data Sources

Data is accepted only from trusted sources in this strict priority order:

| Priority | Source Type | Description | Verification Method |
| :--- | :--- | :--- | :--- |
| **P1** | `manufacturer_datasheet` | Official manufacturer PDF / technical specification documents | Document hash, manufacturer domain |
| **P2** | `manufacturer_catalog` | Verified manufacturer catalog exports and parametric tables | Catalog series checksum, MPN pattern |
| **P3** | `distributor_catalog` | Trusted authorized distributors (DigiKey, Mouser, Element14) | Authorized distributor API / catalog mapping |
| **P4** | `confirmed_inventory` | Explicitly human-confirmed Ananya component records | Component ledger confirmation status |
| **P5** | `human_reviewed_feedback` | Explicitly human-accepted or edited AI suggestions (`ai_suggestion_feedback`) | Authenticated reviewer ID, positive action |

### Prohibited Sources:
* LLM completions (e.g. Qwen, GPT, synthetic prompts).
* Inferred electrical parameters treated as ground truth without source documentation.
* Unreviewed or rejected AI suggestions.
* Web-scraped component aggregators with unknown provenance.

---

## 4. Dataset Provenance Model

Every training record must retain full, immutable provenance metadata:

```json
{
  "mpn": "GRM188R71C104KA01D",
  "baseMpn": "GRM188R71C104K",
  "seriesFamily": "GRM188",
  "category": "Capacitors",
  "subcategory": "Ceramic Capacitors",
  "manufacturer": "Murata Manufacturing",
  "description": "CAP CER 0.1UF 16V X7R 0603 SMD",
  "attributes": {
    "capacitance": {"value": 0.1, "unit": "uF", "normalized_si": 1e-7},
    "voltage": {"value": 16.0, "unit": "V", "normalized_si": 16.0},
    "tolerance": {"value": "±10%", "unit": "%"},
    "dielectric": {"value": "X7R"},
    "package": {"value": "0603"}
  },
  "provenance": {
    "sourceType": "manufacturer_datasheet",
    "sourceIdentifier": "MURATA-GRM-SERIES-2024",
    "sourceUrl": "https://www.murata.com/products/productdetail?partno=GRM188R71C104KA01%23",
    "retrievalTimestamp": "2026-09-18T00:00:00Z",
    "verificationStatus": "VERIFIED",
    "verificationMethod": "catalog_cross_check",
    "datasetVersion": "components-2026-09-18-v1"
  }
}
```

---

## 5. Validation Pipeline & Conflict Detection

Before any record enters a training dataset, it passes through 7 automated validation stages:

1. **Identifier Check**: MPN, Category, and Manufacturer must not be empty or generic placeholders (`TBD`, `N/A`, `UNKNOWN`).
2. **Schema & Taxonomy Normalization**: Categories and subcategories mapped through the explicit taxonomy mapping layer.
3. **Manufacturer Canonicalization**: Reconciled against known manufacturer codes and official aliases.
4. **Physical Sanity Bounds**:
   * Resistance $> 0$ and $\le 100\,\text{G}\Omega$.
   * Capacitance $> 0$ and $\le 10\,\text{F}$.
   * Voltage $> 0$ and $\le 50\,\text{kV}$.
   * Package must be a recognized footprint (e.g. `0402`, `0603`, `0805`, `SOT-23`, `SOIC-8`).
5. **Cross-Source Agreement**: When multiple sources provide the same MPN:
   * Values agree: Record marked `VERIFIED`.
   * Values disagree: Record quarantined under `quarantine.json` with conflict report (`CONFLICTING_SOURCES`).
6. **Data Leakage Grouping**: Base MPN and series families tagged to prevent train/test contamination.
7. **Quarantine Isolation**: Rejected records are preserved for human audit, never silently repaired.

---

## 6. Zero Data Leakage (MPN Family Grouping)

In electronics components, packaging and reel variations create near-identical MPNs:
* `GRM188R71C104KA01D` (Paper tape, 180mm reel)
* `GRM188R71C104KA01J` (Paper tape, 330mm reel)
* `GRM188R71C104KA01-TR` (Generic Tape/Reel)

A naive random split would place `KA01D` in Train and `KA01J` in Test, yielding an artificially inflated 99.9% accuracy that fails on truly new component families in production.

**Enforced Strategy**: Grouped train/test splitting (`GroupShuffleSplit` on `base_mpn` / `series_family`). All packaging variations of an engineering part must belong entirely to Train or entirely to Validation/Test.

---

## 7. Category Model Training

* **Feature Extractors**:
  1. Character n-grams (`ngram_range=(3, 5)`, `analyzer='char_wb'`).
  2. Word n-grams (`ngram_range=(1, 2)`, `analyzer='word'`).
  3. Hybrid Union (Character n-grams + Word n-grams).
* **Classifier**: Scikit-Learn `SGDClassifier(loss='log_loss', penalty='l2', alpha=1e-5)` with calibrated probability output.
* **Evaluation Metrics**:
  * Top-1 Category Accuracy
  * Top-3 Category Accuracy
  * Per-Category Precision & Recall
  * Confusion Matrix
  * Inference Latency (P95)
  * Artifact Size & Peak RAM

---

## 8. Quality Gates & Safe Promotion

Every candidate model must pass all quality gates before deployment:

| Gate | Threshold | Description |
| :--- | :--- | :--- |
| **Accuracy Gate** | $\ge \text{Active Model Accuracy}$ | Overall top-1 accuracy must not regress |
| **Category Gate** | No category drops $> 5\%$ | Prevents degradation of critical categories |
| **Deduplication Gate** | Precision $\ge 95\%$, Critical False Positives $= 0$ | Physical electrical guards strictly enforced |
| **Latency Gate** | $\text{P95} \le 5.0\,\text{ms}$ (Microservice budget $\le 20\,\text{ms}$) | Ultra-fast CPU execution |
| **Memory Gate** | Peak RAM $\le 256\,\text{MB}$ | Lightweight container footprint |
| **Provenance Gate** | Unverified / synthetic count $= 0$ | Zero synthetic or hallucinated training data |

---

## 9. Single Reproducible Command

The entire pipeline can be run modularly or via a single reproducible orchestrator:

```bash
python apps/ml/pipeline/run_training.py --version 1.3.0
```

Produces:
* Verified dataset snapshot (`apps/ml/data/datasets/components-{date}-v{version}/`)
* Quarantine audit log (`quarantine.json`)
* Model artifacts in registry (`apps/ml/models/registry/v{version}/`)
* Quality gate verification report (`evaluation_report.json`)
* Atomic deployment to production with rollback backup.
