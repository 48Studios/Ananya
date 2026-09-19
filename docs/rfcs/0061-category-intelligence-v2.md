# RFC-0061: Category Intelligence v2

## Status

Implemented.

## Decision

ERP categories are authoritative. NestJS sends the complete category snapshot to the stateless ML service, including ID, name, code, description, parent ID, active state, aliases when available, and a computed hierarchy path. Inactive categories are context only and cannot resolve as `EXISTING`.

`apps/ml/models/category_knowledge.json` is versioned domain knowledge, not a category database. It contains aliases, terminology, package and MPN patterns, component families, and proposed parent relationships. It may produce a `NEW_CANDIDATE`, but it cannot create or assign an ERP category.

## Resolution model

Category scoring combines:

1. Active ERP category names, codes, descriptions, aliases, and hierarchy.
2. Category knowledge aliases, terminology, and MPN patterns.
3. Data Pack aliases, keywords, terminology, and MPN patterns.
4. Manufacturer names as supporting context only.
5. Datasheet text and component description text.
6. The existing statistical classifier as one weighted signal.
7. Hierarchy specificity, which favors a strongly supported child over its parent.

The result carries `EXISTING`, `NEW_CANDIDATE`, or `UNKNOWN`, ranked candidates, evidence, category ID/code, parent metadata, and the full category path. Ambiguous or weak results do not force a category.

Data Pack rules augment ERP categories. A Data Pack rule that names an existing ERP category resolves against that ERP record; a strong rule for a missing category can produce a new candidate. Deterministic NestJS fallback remains available when ML is unavailable and uses current ERP categories plus Data Pack evidence.

## Evaluation

The 21-case corpus at `apps/ml/tests/category_resolution_cases.json` covers passive components, semiconductors, connectors, modules and boards, electromechanical parts, aliases, hierarchy specificity, a missing photovoltaic connector category, and an unknown item.

On the identifiable 20-case subset, the preserved legacy classifier scored `4/20 (20%)` top-1. Category Intelligence v2 scored `20/20 (100%)` top-1. Top-k candidate coverage was `21/21 (100%)`, including the unknown case, and resolution-state accuracy was `21/21 (100%)`.

These are measurements on this repository corpus only, not production-wide accuracy claims.

## Out of scope

This RFC does not change the component form UI, SKU generation, attribute assignment, attribute bindings, category creation, or manufacturer intelligence behavior.
