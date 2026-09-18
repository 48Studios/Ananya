# RFC-0059: Attribute Intelligence v1 (Dynamic Binding, Semantic Configuration, Duplicate Detection, and Explainable Audits)

## 1. Purpose

This RFC defines the production architecture for **Attribute Intelligence v1** in Ananya ERP (`ananya-ml` and `@ananya/inventory`). Building upon the lightweight, CPU-first ML architecture established in [RFC-0056](0056-lightweight-ml-architecture.md), [RFC-0057](0057-component-intelligence-v2.md), and [RFC-0058](0058-authoritative-data-training-pipeline.md), this system introduces automated, explainable assistance for engineering attribute management.

Attribute Intelligence eliminates manual toil in attribute taxonomy curation while adhering strictly to the **Non-Hallucinatory Loop**: AI recommendations remain non-authoritative proposals until explicitly accepted by a human engineer.

---

## 2. Motivation

In electronic manufacturing and industrial hardware operations, defining parametric schemas is high-friction and error-prone:
1. **Redundant Attribute Sprawl**: Different engineers create near-duplicate attributes (`Voltage`, `Voltage Rating`, `Rated Voltage`, `Working Voltage`, `V_rated`).
2. **Onerous Category Binding**: Binding 30+ physical categories to standard attributes requires hundreds of repetitive manual clicks.
3. **Inconsistent Units & Dimensions**: Inconsistent canonical units (`V` vs `mV`, `ohm` vs `kohm`) cause SQL indexing and range filtering failures.
4. **Suspicious Cross-Pollination**: Errors such as binding `Resistance` to `Capacitors` pollute component datasheets and parametric search.
5. **Cold-Start Category Gaps**: Creating new categories often omits standard engineering specifications (e.g. forgetting `Dielectric` or `Tolerance` on ceramic capacitors).

Attribute Intelligence v1 solves these challenges through statistical n-gram analysis, Data Pack domain hints, and inventory telemetry without requiring non-deterministic Large Language Models (LLMs) or discrete GPUs.

---

## 3. Core Architectural Principles

1. **Human Authority Rule**: AI must never silently create, mutate, merge, or delete an attribute definition, option, or category binding. All suggestions are provisional until a human accepts them.
2. **Zero Secondary AI Frameworks**: Extend the existing `ananya-ml` FastAPI microservice, ONNX/scikit-learn runtime, and NestJS in-process deterministic fallback. No Ollama, OpenAI, or external LLM daemons.
3. **Dynamic Data Pack Ingestion**: Active Data Packs (e.g. `electronics-smd`) immediately supply domain rules, MPN patterns, aliases, and expected attribute matrices without model retraining.
4. **Calibrated Confidence & Transparent Evidence**: Every suggestion provides a confidence score (`HIGH`, `MEDIUM`, `LOW`) and verifiable evidence citations (Data Pack rule, inventory usage frequency, n-gram similarity, category taxonomy).
5. **Unified Telemetry**: All accept, edit, and reject actions stream to `ai_suggestion_feedback` with provenance tracking for continuous model evaluation.
6. **Graceful Degradation**: If `ananya-ml` is unreachable or disabled, NestJS API automatically executes in-process deterministic fallback with zero disruption to ERP workflows.

---

## 4. System Architecture & Information Flow

```
                                  Attribute Name / Query / Category Context
                                                      │
                                                      ▼
                                           Active Data Pack Hints
                                  (Expected attributes, aliases, units, enums)
                                                      │
                         ┌────────────────────────────┼────────────────────────────┐
                         │                            │                            │
                         ▼                            ▼                            ▼
               ┌───────────────────┐        ┌───────────────────┐        ┌───────────────────┐
               │ Binding Recommender│        │Config & Unit Engine│       │Deduplication Engine│
               │                   │        │                   │        │                   │
               │ - Taxonomy affinity│        │ - Type inference  │        │ - Char-wb n-gram  │
               │ - Inventory usage │        │ - Unit Category   │        │ - Jaro-Winkler    │
               │ - Data Pack rules │        │ - Enum provenance │        │ - Alias detection │
               └─────────┬─────────┘        └─────────┬─────────┘        └─────────┬─────────┘
                         │                            │                            │
                         └────────────────────────────┼────────────────────────────┘
                                                      │
                                                      ▼
                                      ┌───────────────────────────────┐
                                      │   Evidence & Confidence Engine│
                                      │                               │
                                      │  - Source Attribution         │
                                      │  - Multi-factor Scoring       │
                                      │  - HIGH / MEDIUM / LOW        │
                                      └───────────────┬───────────────┘
                                                      │
                                                      ▼
                                     Provisional Structured Proposals
                                                      │
                                                      ▼
                                      ┌───────────────────────────────┐
                                      │   NestJS Reconciler & API     │
                                      │   (Validation & Verification) │
                                      └───────────────┬───────────────┘
                                                      │
                         ┌────────────────────────────┴────────────────────────────┐
                         ▼                                                         ▼
         ┌───────────────────────────────┐                         ┌───────────────────────────────┐
         │     Web UI Inline Assistant   │                         │  Attribute Intelligence Queue │
         │  - Attribute Form Dialog      │                         │  - Whole-Library Audit        │
         │  - Category Attributes Manager│                         │  - Bulk Review & Triage       │
         │  - "Why?" Evidence Explorer   │                         │  - Suspicious Binding Alerts  │
         └───────────────┬───────────────┘                         └───────────────┬───────────────┘
                         │                                                         │
                         └────────────────────────────┬────────────────────────────┘
                                                      │
                                                      ▼
                                        Explicit Human Action
                                    [Accept]   [Edit]   [Reject]
                                                      │
                                                      ▼
                                       Authoritative Database Commit
                                                      │
                                                      ▼
                                        AI Feedback Telemetry Ledger
                                        (ai_suggestion_feedback)
```

---

## 5. Attribute Intelligence Capabilities

### 5.1 AI Suggested Category Bindings (Primary Feature)
When an attribute is selected or edited:
- Analyzes attribute semantics, active Data Pack `expectedAttributes`, and verified inventory component relationships.
- Scores category affinity:
  - **HIGH ($\ge 0.85$)**: Explicit Data Pack specification or $\ge 80\%$ category component adoption.
  - **MEDIUM ($0.60 - 0.84$)**: Corroborating lexical similarity and moderate category inventory usage.
  - **LOW ($< 0.60$)**: Generic or weak lexical affinity.
- Supported interactions:
  - Individual Accept / Reject
  - Bulk Accept Selected
  - Accept All High-Confidence

### 5.2 Category Expected Attributes (Missing Attribute Detection)
When managing attributes for a category (e.g. `Capacitors`):
- Cross-references currently assigned attributes against Data Pack definitions and high-frequency attributes across verified components in that category.
- Flags expected missing attributes (e.g. `Dielectric`, `Tolerance`) with percentage adoption.
- Allows one-click multi-select binding without retyping or searching.

### 5.3 Semantic Attribute Configuration & Unit Inference
When creating or editing an attribute by name:
- Infers `dataType`: `QUANTITY`, `SELECT`, `BOOLEAN`, `NUMBER`, `TEXT`.
- Infers physical dimension (`unitCategory`) and `defaultUnit` (e.g. `Voltage Rating` $\rightarrow$ `Voltage`, `V`; `Resistance` $\rightarrow$ `Resistance`, `ohm`).
- Suggests standard display units (e.g. `mV`, `V`, `kV`).
- Infers validation rules (e.g. `> 0`, or range `[0, 100]` for percentage).
- Proposes logical grouping (`Electrical`, `Physical`, `Environmental`).

### 5.4 Attribute Deduplication & Alias Detection
When typing an attribute name:
- Calculates character-wb TF-IDF cosine similarity against existing attribute definitions.
- Identifies potential duplicates and canonical aliases (e.g. `Cap Value` $\approx$ `Capacitance`).
- Displays existing usage count and current category bindings.
- Offers explicit choices: **[Use Existing Canonical Attribute]** vs **[Create New Distinct Attribute]**.

### 5.5 Suspicious Binding Detection
Scans existing category-attribute bindings and flags anomalies:
- Flags bindings where inventory usage is near zero while another category accounts for $>95\%$ of component instances (e.g. `Resistance` bound to `Capacitors`).
- Flags bindings unsupported by active Data Packs with low component frequency.
- Offers non-destructive actions: **[Keep Binding]** or **[Remove Binding]**. Never removes automatically.

### 5.6 Verified Enum Option Suggestions
For `SELECT` and `MULTI_SELECT` attributes:
- Gathers observed options from active Data Packs and verified component values (e.g. for `Dielectric`: `C0G`, `NP0`, `X5R`, `X7R`, `Y5V`).
- Shows frequency and provenance for each suggested option.
- Prohibits hallucinated synthetic options.

### 5.7 Whole-Library Attribute Intelligence Audit
An on-demand and asynchronous audit engine evaluating:
1. Duplicate and near-duplicate definitions across the organization.
2. Suspicious category bindings.
3. Unused attributes (zero component records and zero category bindings).
4. Categories missing common engineering specifications.
5. Inconsistent units or invalid configuration types.
Results feed directly into the **Attribute Review Queue**.

---

## 6. Schema & Data Contracts

### 6.1 Database Schema Extensions
1. **`attribute_definitions`**:
   - `aliases`: `jsonb` array of strings (`string[]`), indexed for alias lookups.
   - `group_name`: `varchar(100)` storing logical grouping (`Electrical`, `Physical`, `Environmental`, `Mechanical`).
2. **`ai_suggestion_feedback`**:
   - `attribute_definition_id`: `uuid` referencing `attribute_definitions(id)` with `onDelete: "set null"`.
   - `category_id`: `uuid` referencing `categories(id)` with `onDelete: "set null"`.
   - `suggestion_type` expansion: `'ATTRIBUTE_BINDING'`, `'CATEGORY_ATTRIBUTES'`, `'ATTRIBUTE_CONFIG'`, `'ATTRIBUTE_ALIAS'`, `'ATTRIBUTE_DUPLICATE'`, `'SUSPICIOUS_BINDING'`, `'ENUM_VALUES'`.

### 6.2 REST API Contracts

#### POST `/ml/attributes/suggest-bindings`
**Request:**
```json
{
  "attributeId": "uuid-optional",
  "attributeName": "Voltage Rating",
  "dataType": "QUANTITY",
  "unitCategory": "Voltage"
}
```
**Response:**
```json
{
  "suggestions": [
    {
      "categoryId": "cat-uuid-1",
      "categoryCode": "CAP",
      "categoryName": "Capacitors",
      "confidence": 0.98,
      "confidenceLevel": "HIGH",
      "reason": "Present in Capacitor Data Pack and used by 1,842 verified components",
      "evidence": [
        {
          "type": "data_pack_rule",
          "description": "Expected attribute for category 'Capacitors'",
          "weight": 0.95,
          "source": "datapack:electronics-smd"
        }
      ]
    }
  ]
}
```

#### POST `/ml/attributes/suggest-category-attributes`
**Request:**
```json
{
  "categoryId": "cat-uuid-1"
}
```
**Response:**
```json
{
  "suggestions": [
    {
      "attributeDefinitionId": "attr-uuid-1",
      "code": "capacitance",
      "name": "Capacitance",
      "dataType": "QUANTITY",
      "defaultUnit": "uF",
      "confidence": 0.99,
      "confidenceLevel": "HIGH",
      "isAlreadyBound": false,
      "reason": "Standard specification for Capacitors (99% component coverage)",
      "evidence": [...]
    }
  ]
}
```

#### POST `/ml/attributes/suggest-config`
**Request:**
```json
{
  "name": "Working Voltage"
}
```
**Response:**
```json
{
  "suggestedCode": "working_voltage",
  "suggestedDataType": "QUANTITY",
  "unitCategory": "Voltage",
  "defaultUnit": "V",
  "displayUnits": ["mV", "V", "kV"],
  "groupName": "Electrical",
  "suggestedAliases": ["Rated Voltage", "Voltage Rating", "Working Voltage"],
  "canonicalMatch": {
    "id": "attr-uuid-voltage",
    "name": "Voltage Rating",
    "similarity": 0.94
  },
  "confidence": 0.95,
  "confidenceLevel": "HIGH",
  "evidence": [...]
}
```

#### POST `/ml/attributes/audit`
**Response:**
```json
{
  "summary": {
    "totalAttributes": 45,
    "possibleDuplicates": 3,
    "suspiciousBindings": 2,
    "missingExpectedAttributes": 4,
    "unusedAttributes": 1
  },
  "items": [
    {
      "id": "audit-item-1",
      "type": "SUSPICIOUS_BINDING",
      "severity": "WARNING",
      "attributeId": "attr-uuid-resistance",
      "attributeName": "Resistance",
      "categoryId": "cat-uuid-cap",
      "categoryName": "Capacitors",
      "confidence": 0.2,
      "confidenceLevel": "LOW",
      "reason": "Only 2 verified components use this combination; 99% used by Resistors",
      "evidence": [...]
    }
  ]
}
```

---

## 7. Security, Tenancy, and Boundaries

1. **Strict Service Decoupling**: The Python ML microservice remains strictly stateless and read-only with respect to the database. It communicates only via HTTP JSON payloads.
2. **Domain Encapsulation**: Mutation of category bindings and attributes is handled strictly by `@ananya/inventory` domain use cases. No controller or ML worker performs raw SQL updates to business tables.
3. **Audit Logging**: Every accepted AI proposal records an administrative security audit log entry (`ATTRIBUTE_BINDING_ACCEPTED`, `ATTRIBUTE_CONFIG_APPLIED`).
4. **Zero GPU / Low Memory**: The entire inference pipeline operates comfortably on <100MB RAM with sub-15ms response latency.

---

## 8. Verification & Acceptance Criteria

1. **Suggestion Latency**: Single attribute binding prediction finishes in $<20\text{ ms}$.
2. **Deterministic Fallback**: All suggestion and audit features work without error when `ananya-ml` microservice is stopped.
3. **Safe Deduplication**: Exact and fuzzy alias matching flags duplicate names with high accuracy without auto-merging.
4. **Explainability**: Every suggestion in UI displays human-readable evidence on clicking "Why?".
5. **Feedback Telemetry**: Acceptance, rejection, and editing of suggestions reliably generate entries in `ai_suggestion_feedback`.
