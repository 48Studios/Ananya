# Component Intelligence

<cite>
**Referenced Files in This Document**
- [main.py](file://apps/ml/app/main.py)
- [category_classifier.py](file://apps/ml/app/services/category_classifier.py)
- [duplicate_detector.py](file://apps/ml/app/services/duplicate_detector.py)
- [schemas.py](file://apps/ml/app/schemas.py)
- [ml.service.ts](file://apps/api/src/ml/ml.service.ts)
- [ml-client.service.ts](file://apps/api/src/ml/ml-client.service.ts)
- [component-review-analyzer.ts](file://apps/api/src/ml/component-review-analyzer.ts)
- [specification-aggregation.ts](file://apps/api/src/ml/specification-aggregation.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction
This document explains the component intelligence features that power category classification, duplicate detection, and suggestion workflows across the API and ML service layers. It focuses on:
- The category classifier endpoint `/v1/predict/category`, including top-k predictions, datapack hints, and ERP category filtering.
- The duplicate detection system that identifies existing components by part numbers, SKUs, vendor part numbers, and semantic similarity with strict physical attribute guards.
- The composite confidence calibration system that combines signals from category classification, manufacturer resolution, and attribute extraction to produce an overall confidence level and aggregated evidence.
- Practical guidance for batch processing, evidence aggregation, performance optimization, and troubleshooting low-confidence or false-positive scenarios.

## Project Structure
The intelligence pipeline spans two services:
- Ananya ML Service (Python/FastAPI): implements category classification, manufacturer resolution, duplicate detection, datasheet extraction, and a unified suggest endpoint that composes these signals.
- Ananya API (NestJS/TypeScript): orchestrates calls to the ML service, enriches results with ERP context, applies deterministic fallbacks, and builds review findings and suggestions.

```mermaid
graph TB
Client["Client App"] --> API["NestJS API<br/>MlService.suggest()"]
API --> MLSuggest["ML Service<br/>POST /v1/suggest"]
MLSuggest --> Cat["Category Classifier<br/>predict()"]
MLSuggest --> Mfg["Manufacturer Resolver"]
MLSuggest --> Dup["Duplicate Detector"]
MLSuggest --> DS["Datasheet Extractor"]
API --> DB["ERP Database<br/>Categories, Manufacturers, Components"]
API --> Review["Component Review Analyzer"]
```

**Diagram sources**
- [main.py:103-152](file://apps/ml/app/main.py#L103-L152)
- [ml.service.ts:313-452](file://apps/api/src/ml/ml.service.ts#L313-L452)

**Section sources**
- [main.py:60-152](file://apps/ml/app/main.py#L60-L152)
- [ml.service.ts:313-452](file://apps/api/src/ml/ml.service.ts#L313-L452)

## Core Components
- Category Classification: Predicts ERP categories or new candidates using model probabilities, ERP metadata, knowledge terms, MPN patterns, and datapack hints. Supports top-k and ERP category filtering.
- Duplicate Detection: Two-tier matching — authoritative exact matches (MPN/SKU/vendor part/base MPN) followed by semantic similarity with guarded physical attributes.
- Composite Confidence Calibration: Aggregates high-confidence signals from category, manufacturer, and extracted attributes to compute an overall confidence level and collect representative evidence.
- Suggestion Workflow: The API composes ML outputs with ERP data, applies deterministic fallbacks when needed, and produces actionable suggestions and review findings.

**Section sources**
- [category_classifier.py:44-477](file://apps/ml/app/services/category_classifier.py#L44-L477)
- [duplicate_detector.py:35-312](file://apps/ml/app/services/duplicate_detector.py#L35-L312)
- [main.py:154-256](file://apps/ml/app/main.py#L154-L256)
- [ml.service.ts:313-953](file://apps/api/src/ml/ml.service.ts#L313-L953)

## Architecture Overview
The end-to-end flow for a component suggestion request:

```mermaid
sequenceDiagram
participant C as "Client"
participant A as "API MlService"
participant M as "ML Service"
participant CC as "Category Classifier"
participant MR as "Manufacturer Resolver"
participant DD as "Duplicate Detector"
participant DE as "Datasheet Extractor"
C->>A : POST /api/components/suggest
A->>M : POST /v1/suggest {query, part_number, description,<br/>erp_categories, erp_manufacturers, datapack_hints}
M->>CC : predict(text, top_k, datapack_hints, erp_categories, erp_manufacturers)
M->>MR : resolve(part_number, description, datasheet_text, erp_manufacturers, datapack_hints)
M->>DD : detect(part_number, description, existing_components, datapack_hints)
M->>DE : process(text, pdf_base64, datapack_hints)
M-->>A : {category_predictions, manufacturer, duplicates,<br/>extracted_attributes, confidence_level, overall_evidence}
A->>A : Resolve categories, build suggestions, aggregate evidence
A-->>C : ComponentSuggestionResponseDto
```

**Diagram sources**
- [main.py:154-256](file://apps/ml/app/main.py#L154-L256)
- [ml.service.ts:313-953](file://apps/api/src/ml/ml.service.ts#L313-L953)

## Detailed Component Analysis

### Category Classification Endpoint (/v1/predict/category)
- Purpose: Predict one or more ERP categories for a text query, optionally constrained to active ERP categories and enriched by datapack hints and datasheet text.
- Inputs:
  - text: query string combining part number and description.
  - top_k: number of candidate predictions (default 3).
  - datapack_hints: category-specific rules such as aliases, keywords, MPN patterns, and common terminology.
  - erp_categories: active ERP categories with hierarchy paths used to filter and score only relevant categories.
  - erp_manufacturers: optional manufacturer context to boost category scores when names or codes appear in the input.
  - datasheet_text: optional specification text appended to improve classification accuracy.
- Outputs:
  - predictions: list of CategoryPrediction objects with category, subcategory, resolution (EXISTING/NEW_CANDIDATE/UNKNOWN), confidence, confidence_level, candidates, and evidence.
- Behavior highlights:
  - When ERP categories are provided, scoring uses ERP metadata, hierarchy specificity, MPN patterns, and knowledge terms; unknown or ambiguous cases return UNKNOWN with candidates for reviewer action.
  - Without ERP categories, legacy mode falls back to known parent categories and model probabilities.
  - Evidence items explain why each prediction was scored (classifier probability, MPN pattern match, data pack rule, ERP metadata).

```mermaid
flowchart TD
Start(["predict_category(req)"]) --> Load["Load model + knowledge"]
Load --> Mode{"ERP categories provided?"}
Mode -- "Yes" --> ERP["Score active ERP categories:<br/>text match, hierarchy specificity,<br/>MPN patterns, manufacturer context,<br/>model probability"]
Mode -- "No" --> Legacy["Legacy scoring over known parents:<br/>model probability + datapack hints"]
ERP --> Rank["Rank by score, cap at top_k"]
Legacy --> Rank
Rank --> Decide{"Top candidate confident?<br/>Ambiguous?"}
Decide -- "Yes" --> Existing["Return EXISTING with path and evidence"]
Decide -- "No" --> NewCandidate["Return NEW_CANDIDATE with suggested_parent"]
Decide -- "Ambiguous" --> Unknown["Return UNKNOWN with candidates"]
```

**Diagram sources**
- [category_classifier.py:192-477](file://apps/ml/app/services/category_classifier.py#L192-L477)

**Section sources**
- [main.py:103-124](file://apps/ml/app/main.py#L103-L124)
- [category_classifier.py:192-477](file://apps/ml/app/services/category_classifier.py#L192-L477)
- [schemas.py:86-105](file://apps/ml/app/schemas.py#L86-L105)

### Duplicate Detection System
- Purpose: Identify existing components that may be duplicates of the queried part, prioritizing authoritative identifiers before semantic similarity.
- Inputs:
  - part_number: primary identifier to compare.
  - description: supplementary text for semantic comparison.
  - existing_components: catalog entries with id, sku, name, description, manufacturer_part_number.
  - similarity_threshold: threshold for semantic tier (default 0.75).
  - datapack_hints: optional hints used during attribute extraction for guard checks.
- Matching tiers:
  - Tier 1 (Authoritative): Exact MPN, exact SKU, exact vendor part number (extracted from description), base MPN ignoring packaging suffixes, and significant substring overlap if the normalized part is substantial.
  - Tier 2 (Advisory Semantic): N-gram textual similarity between query and component descriptions, corroborated by agreement on guarded physical attributes (resistance, capacitance, voltage, package, tolerance, dielectric, power, current). Physical conflicts reject candidates outright.
- Output:
  - DetectDuplicatesResponse with is_duplicate flag and up to five ranked matches, each with similarity, confidence_level, match_type, reason, and evidence.

```mermaid
flowchart TD
Start(["detect(part_number, description, existing_components)"]) --> T1["Tier 1: Authoritative matches<br/>Exact MPN/SKU/vendor part/base MPN/substring"]
T1 --> Found1{"Any Tier 1 match?"}
Found1 -- "Yes" --> Return1["Return matches with HIGH confidence"]
Found1 -- "No" --> T2["Tier 2: Semantic similarity<br/>N-gram overlap + guarded attribute agreement"]
T2 --> Guard{"Physical conflict?"}
Guard -- "Yes" --> Skip["Skip candidate"]
Guard -- "No" --> Score["Compute similarity, add attribute corroboration"]
Score --> Threshold{"Above threshold?"}
Threshold -- "Yes" --> Add["Add to matches"]
Threshold -- "No" --> Next["Next candidate"]
Add --> Sort["Sort by similarity, limit to top 5"]
Next --> Sort
Sort --> Return2["Return matches with confidence levels"]
```

**Diagram sources**
- [duplicate_detector.py:35-312](file://apps/ml/app/services/duplicate_detector.py#L35-L312)

**Section sources**
- [duplicate_detector.py:35-312](file://apps/ml/app/services/duplicate_detector.py#L35-L312)
- [schemas.py:132-162](file://apps/ml/app/schemas.py#L132-L162)

### Composite Confidence Calibration and Evidence Aggregation
- Purpose: Combine signals from category classification, manufacturer resolution, and attribute extraction to determine an overall confidence level and assemble representative evidence for user-facing decisions.
- ML Service Path:
  - Counts high-confidence signals: category confidence level HIGH, manufacturer confidence level HIGH, and presence of extracted attributes.
  - Assigns overall confidence level: HIGH if two or more signals are HIGH; MEDIUM if exactly one; LOW otherwise.
  - Collects overall_evidence by taking top items from category, manufacturer, and attribute evidence arrays.
- API Path:
  - Mirrors the same logic after resolving categories and manufacturers, then aggregates evidence slices into overall_evidence and sets overallConfLevel based on primary category and manufacturer confidence levels.
- Specification Aggregation (for attribute values):
  - Builds per-attribute aggregate confidence considering source conflict count, document count, primary vs contextual evidence, expected-by-category, ERP agreement, validation validity, and weakest-source bounding. Produces confidenceReasons for transparency.

```mermaid
flowchart TD
Start(["suggest_component()"]) --> Cat["Category predictions"]
Start --> Mfg["Manufacturer resolution"]
Start --> Attr["Extracted attributes"]
Cat --> Signals["Count HIGH signals"]
Mfg --> Signals
Attr --> Signals
Signals --> Level{"HIGH signals >= 2?"}
Level -- "Yes" --> OverallHigh["overall_confidence = HIGH"]
Level -- "No" --> One{"Exactly 1 HIGH?"}
One -- "Yes" --> OverallMed["overall_confidence = MEDIUM"]
One -- "No" --> OverallLow["overall_confidence = LOW"]
OverallHigh --> Evidence["Aggregate top evidence items"]
OverallMed --> Evidence
OverallLow --> Evidence
Evidence --> End(["Return response"])
```

**Diagram sources**
- [main.py:220-256](file://apps/ml/app/main.py#L220-L256)
- [ml.service.ts:928-953](file://apps/api/src/ml/ml.service.ts#L928-L953)
- [specification-aggregation.ts:710-810](file://apps/api/src/ml/specification-aggregation.ts#L710-L810)

**Section sources**
- [main.py:220-256](file://apps/ml/app/main.py#L220-L256)
- [ml.service.ts:928-953](file://apps/api/src/ml/ml.service.ts#L928-L953)
- [specification-aggregation.ts:710-810](file://apps/api/src/ml/specification-aggregation.ts#L710-L810)

### Suggestion Workflow and ERP Integration
- The API fetches ERP categories, manufacturers, attributes, and candidate components, then calls the ML service’s unified suggest endpoint.
- If the ML service responds, its outputs are resolved against ERP records (e.g., mapping ML-picked category names to canonical rows), and alternative categories are preserved.
- Deterministic fallbacks apply when the ML service is unavailable or returns no predictions, using Data Pack hints and keyword heuristics to assign categories and manufacturers.
- Duplicate detection excludes the component being edited to avoid self-matches and limits candidate scans to a bounded set ordered oldest-first to preserve canonical records.

```mermaid
sequenceDiagram
participant API as "API MlService"
participant DB as "ERP Database"
participant ML as "ML Service"
API->>DB : Fetch categories, manufacturers, attributes, components
API->>ML : POST /v1/suggest (with ERP context and datapack hints)
ML-->>API : Suggestions with confidence and evidence
API->>API : Resolve categories to ERP rows, build suggestions
API-->>Caller : ComponentSuggestionResponseDto
```

**Diagram sources**
- [ml.service.ts:313-452](file://apps/api/src/ml/ml.service.ts#L313-L452)
- [ml.service.ts:544-670](file://apps/api/src/ml/ml.service.ts#L544-L670)

**Section sources**
- [ml.service.ts:313-452](file://apps/api/src/ml/ml.service.ts#L313-L452)
- [ml.service.ts:544-670](file://apps/api/src/ml/ml.service.ts#L544-L670)

## Dependency Analysis
- ML Service depends on:
  - Category classifier model artifact and knowledge JSON for classification.
  - Manufacturer resolver for brand/part identity.
  - Duplicate detector for catalog matching.
  - Datasheet extractor for attribute extraction and PDF handling.
- API depends on:
  - ML client service for HTTP calls to the ML service.
  - ERP database for categories, manufacturers, attributes, and components.
  - Data packs service for active intelligence hints.
  - Component review analyzer for generating review findings from suggestions.

```mermaid
graph LR
MLMain["main.py"] --> CatSvc["category_classifier.py"]
MLMain --> MfgSvc["manufacturer_resolver.py"]
MLMain --> DupSvc["duplicate_detector.py"]
MLMain --> DSExt["datasheet_extractor.py"]
APIML["ml.service.ts"] --> MLClient["ml-client.service.ts"]
APIML --> DB["ERP DB"]
APIML --> Review["component-review-analyzer.ts"]
```

**Diagram sources**
- [main.py:47-52](file://apps/ml/app/main.py#L47-L52)
- [ml.service.ts:19-20](file://apps/api/src/ml/ml.service.ts#L19-L20)
- [ml.service.ts:313-452](file://apps/api/src/ml/ml.service.ts#L313-L452)

**Section sources**
- [main.py:47-52](file://apps/ml/app/main.py#L47-L52)
- [ml.service.ts:19-20](file://apps/api/src/ml/ml.service.ts#L19-L20)

## Performance Considerations
- Model loading: Category classifier loads models eagerly at startup to minimize cold-start latency.
- Bounded candidate scanning: Duplicate detection limits scanned components to a fixed bound and orders oldest-first to ensure canonical records remain in scope.
- Evidence capping: Top evidence items are limited per signal to keep payloads manageable.
- Timeout handling: API client enforces timeouts for ML calls to prevent blocking long-running requests.
- Batch endpoints: Use `/v1/predict/category/batch` for multiple queries to reduce round-trips.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
- Low confidence scores:
  - Check whether ERP categories were supplied; without them, classification falls back to legacy mode which may yield lower confidence.
  - Verify datapack hints include accurate MPN patterns and aliases for your part families.
  - Ensure datasheet text is included so the classifier can leverage specification content.
  - Inspect overall_evidence to see which signals contributed and their weights.
- Duplicate detection false positives:
  - Confirm that manufacturer_part_number is present in existing components; without it, detection relies on less precise fields like SKU or description.
  - Review guarded physical attributes: mismatches in resistance, capacitance, voltage, package, tolerance, dielectric, power, or current will reject candidates even if text overlaps.
  - Adjust similarity_threshold if necessary, but note that attribute corroboration is capped to avoid inflating scores.
- Self-match avoidance:
  - When editing a component, the API removes the current component from the candidate set before duplicate detection to prevent reporting itself as a duplicate.
- Evidence-driven debugging:
  - Use evidence items from category predictions, manufacturer resolution, and extracted attributes to understand why a decision was made.
  - For attribute-level issues, consult specification aggregation confidence reasons to identify weak mappings, conflicts, or missing primary evidence.

**Section sources**
- [ml.service.ts:356-365](file://apps/api/src/ml/ml.service.ts#L356-L365)
- [duplicate_detector.py:68-75](file://apps/ml/app/services/duplicate_detector.py#L68-L75)
- [duplicate_detector.py:226-305](file://apps/ml/app/services/duplicate_detector.py#L226-L305)
- [specification-aggregation.ts:710-810](file://apps/api/src/ml/specification-aggregation.ts#L710-L810)

## Conclusion
The component intelligence system integrates category classification, manufacturer resolution, duplicate detection, and attribute extraction into a cohesive workflow. It leverages ERP context, datapack hints, and datasheet content to produce actionable suggestions with transparent evidence and calibrated confidence levels. By following the recommended practices for batching, evidence aggregation, and performance tuning, teams can achieve reliable classification and duplication prevention while maintaining clear auditability through evidence and confidence reasoning.