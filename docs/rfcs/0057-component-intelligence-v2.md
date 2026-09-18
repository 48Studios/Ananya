# RFC-0057: Component Intelligence Layer v2 (Feedback, Data Pack Hints, Explainability, and Semantic Deduplication)

## 1. Purpose

This RFC defines the second-generation component intelligence layer (`ananya-ml` v2) for Ananya ERP. Building upon the CPU-first, Immich-style foundation established in [RFC-0056](0056-lightweight-ml-architecture.md), this document establishes an adaptive, explainable, and human-supervised intelligence system without introducing GPU-dependent, non-deterministic Large Language Models (LLMs).

---

## 2. Motivation

While RFC-0056 succeeded in replacing heavy LLMs with sub-20ms statistical classifiers and regex extractors, real-world manufacturing operations require:

1. **Continuous Human Feedback**: When engineers correct an AI-suggested category, manufacturer, or parameter in the UI, that correction must be preserved as labeled training data rather than lost. Crucially, AI suggestions must remain strictly separated from authoritative inventory ledger data.
2. **Dynamic Domain Customization**: Standard statistical models are frozen at train-time. Installing a specialized electronics Data Pack (e.g. `electronics-smd`) should immediately expand the system's recognition of part-number prefixes, aliases, and expected attributes without requiring an offline retraining cycle.
3. **Transparent Explainability**: Enterprise users reject opaque probabilities (e.g., "Confidence: 0.94"). Suggestions must present human-readable evidence (e.g. "MPN prefix matched known series", "Description keyword matched Data Pack rule").
4. **Calibrated Confidence**: Multi-source evidence (classifier probability, MPN patterns, Data Pack rules, inventory similarity) must combine into standardized High, Medium, or Low confidence tiers rather than implying certainty on weak signals.
5. **Safe Semantic Deduplication**: General text embedding models suffer from numeric and physical parameter blindness (treating `10kΩ` and `100kΩ` as nearly identical). Deduplication must enforce rigid electrical compatibility guards.

---

## 3. Core Architecture & Pipeline

```
                                  Component SKU / Query / Datasheet Text
                                                     │
                                                     ▼
                                          Active Data Pack Hints
                             (MPN patterns, aliases, expected attributes, units)
                                                     │
               ┌─────────────────────────────────────┼─────────────────────────────────────┐
               │                                     │                                     │
               ▼                                     ▼                                     ▼
     ┌───────────────────┐                 ┌───────────────────┐                 ┌───────────────────┐
     │Category Classifier│                 │Manufacturer Lookup│                 │Datasheet Extractor│
     │                   │                 │                   │                 │                   │
     │ - TF-IDF char-wb  │                 │ - Deterministic   │                 │ - Regex Pattern   │
     │ - Data Pack Hints │                 │   Catalog Prefix  │                 │   Matching        │
     │ - Top-3 & Conf    │                 │ - Alias Map       │                 │ - Unit Normalizer │
     │ - Evidence List   │                 │ - Evidence List   │                 │ - Evidence List   │
     └─────────┬─────────┘                 └─────────┬─────────┘                 └─────────┬─────────┘
               │                                     │                                     │
               └───────────────────┬─────────────────┴─────────────────────────────────────┘
                                   │
                                   ▼
                   ┌───────────────────────────────┐
                   │  Deduplication & Similarity   │
                   │                               │
                   │  Tier 1: Normalized Exact MPN │
                   │  Tier 2: Semantic Similarity  │
                   │          WITH Physical Guard  │
                   │          (Ω, F, V, pkg, tol)  │
                   └───────────────┬───────────────┘
                                   │
                                   ▼
                   ┌───────────────────────────────┐
                   │   Evidence & Confidence Engine│
                   │                               │
                   │  Weighted Multi-Source Score  │
                   │  Level: HIGH / MEDIUM / LOW   │
                   └───────────────┬───────────────┘
                                   │
                                   ▼
                   Structured Explainable Suggestion
                                   │
                                   ▼
                   ┌───────────────────────────────┐
                   │    Web UI Review Experience   │
                   │                               │
                   │  - "Why?" Evidence Explorer   │
                   │  - Individual Accept/Reject   │
                   │  - Inline Edit                │
                   └───────────────┬───────────────┘
                                   │
                                   ▼
                    Persistent AI Feedback Ledger
                     (ai_suggestion_feedback table)
                                   │
                                   ▼
                    Offline Training & Eval Pipeline
```

---

## 4. Key Architectural Pillars

### 4.1 AI Feedback Loop & Telemetry Ledger
AI suggestions are ephemeral recommendations; they are never written directly to authoritative inventory tables (`components`, `component_attribute_values`).

All human actions on suggestions are recorded in `ai_suggestion_feedback`:
- `component_id` & `creation_context` (SKU, name, query, description)
- `suggestion_type` (`CATEGORY`, `MANUFACTURER`, `ATTRIBUTE`, `DUPLICATE`)
- `field` (e.g. `category`, `manufacturer`, `resistance`, etc.)
- `predicted_value` & `confidence`
- `evidence` (snapshot of evidence items)
- `model_version`
- `user_action` (`ACCEPTED`, `REJECTED`, `EDITED`)
- `final_value`
- `reviewer_id` & `reviewer_email`
- `created_at`

This labeled data is exportable via `GET /ml/feedback/export` for dataset curation and offline retraining.

### 4.2 Data Pack Intelligence Hints
Data Packs declare domain hints via `intelligence?: DataPackIntelligenceHint[]`:
- `mpnPatterns`: Regex/wildcard patterns (e.g. `^GRM\d{2}`, `^RC\d{4}`)
- `aliases`: Category aliases (e.g. `cap`, `mlcc` $\rightarrow$ Capacitors)
- `keywords`: Domain keywords (e.g. `dielectric`, `X7R`, `C0G`)
- `manufacturerHints`: Manufacturer name, aliases, and prefix patterns
- `expectedAttributes`: Expected attribute codes (e.g. `capacitance`, `voltage`, `tolerance`)
- `packagePatterns`: Footprint regexes (e.g. `0402`, `0603`, `0805`, `SOT-23`)

When a Data Pack is installed, `DataPacksService.getActiveIntelligenceHints()` aggregates these hints and passes them to `ananya-ml` in `suggest` requests. Both the Python microservice and the NestJS deterministic fallback immediately benefit without model retraining.

### 4.3 Structured Evidence & Explainability
Every suggestion field includes structured evidence:
```json
{
  "type": "mpn_pattern",
  "description": "Matched known capacitor MPN pattern '^GRM'",
  "weight": 0.6,
  "source": "data_pack:electronics-smd"
}
```
Supported evidence types:
- `mpn_pattern`: Exact or regex MPN prefix match
- `keyword`: Domain terminology or alias match
- `data_pack_rule`: Explicit rule defined by an active Data Pack
- `datasheet_param`: Regex extraction from datasheet/description text
- `existing_data`: Similarity to confirmed inventory records
- `classifier`: Statistical model output

### 4.4 Normalized Confidence Model
Raw classifier probabilities are combined with corroborating evidence:
- **High Confidence ($\ge 0.85$)**: Multiple corroborating signals (e.g. MPN pattern matched AND classifier agreed, or exact prefix matched).
- **Medium Confidence ($0.60 - 0.84$)**: Single source of evidence or moderate classifier probability without strong MPN prefix.
- **Low Confidence ($< 0.60$)**: Weak or generic fallback matches.

### 4.5 Semantic Deduplication with Physical Value Guards
- **Tier 1 (Authoritative)**: Normalized exact MPN / SKU matching (`replaceAll(/[^A-Za-z0-9]/, '').toUpperCase()`). Certainty = 1.0.
- **Tier 2 (Advisory)**: Textual / semantic similarity.
- **Strict Physical Guard**: Before flagging a candidate as duplicate, all extracted physical parameters (resistance, capacitance, inductance, voltage, tolerance, dielectric, package) are compared. If any specified physical parameter differs (e.g. $10\text{k}\Omega \neq 100\text{k}\Omega$, $1\mu\text{F} \neq 10\mu\text{F}$, $5\text{V} \neq 50\text{V}$, `0805` $\neq$ `0603`), the duplicate flag is strictly rejected.

### 4.6 Offline Training & Evaluation Pipeline
Tooling in `apps/ml/pipeline/`:
1. Ingests confirmed feedback and existing inventory into training/validation splits (80/20).
2. Trains calibrated TF-IDF + LogisticRegression models.
3. Evaluates top-1 category accuracy, top-3 accuracy, manufacturer resolution accuracy, duplicate precision/recall, latency, and memory footprint.
4. Stores versioned models in `models/registry/v{version}/`.
5. Promotes to production only after passing quality threshold gates.

---

## 5. Security & Isolation
- ML services remain stateless and CPU-first.
- All feedback persistence and authorization is managed by the NestJS API layer.
- If `ananya-ml` is unreachable or times out (>1500ms), in-process deterministic fallbacks ensure uninterrupted ERP operations.
