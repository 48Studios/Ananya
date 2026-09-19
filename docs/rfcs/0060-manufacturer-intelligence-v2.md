# RFC-0060: Manufacturer Intelligence v2

## Status

Implemented.

## Decision

The ERP `manufacturers` table is authoritative for existing manufacturers. NestJS loads the current active and inactive records for every suggestion request and sends an immutable snapshot to the stateless ML service. The snapshot includes ID, name, code, normalized name, aliases, active state, and a metadata extension point.

`apps/ml/models/manufacturer_knowledge.json` is versioned manufacturer knowledge, not ERP data. It contains reusable aliases, legacy names, MPN patterns, manufacturer families, and electronics domain knowledge. It may identify a manufacturer candidate, but it cannot assign an ERP ID or create a record.

## Resolution contract

The resolver returns one of:

- `EXISTING`: evidence resolves to an active ERP manufacturer and includes its ID.
- `NEW_CANDIDATE`: evidence identifies a manufacturer known outside ERP; creation remains an explicit domain action.
- `UNKNOWN`: evidence is absent or ranked candidates are too close to select safely.

`UNKNOWN` responses retain ranked candidates when available. Every selected result carries evidence. Confidence is an aggregate of independent signals rather than a single prefix rule.

## Evidence precedence

Evidence is combined in this order, with later signals augmenting rather than replacing earlier ones:

1. Exact ERP name or code, including ERP aliases.
2. Normalized ERP name.
3. Data Pack manufacturer aliases and patterns.
4. Knowledge-library aliases, legacy names, and brand relationships.
5. MPN prefix and family patterns.
6. Manufacturer text from the description or datasheet text.
7. Candidate scoring and ambiguity calibration.

Data Pack rules remain runtime/domain knowledge and can propose a new candidate. They do not override an exact ERP identity. ML remains advisory; NestJS uses ERP and Data Pack evidence when the ML service is unavailable.

## Evaluation

The versioned 18-case corpus at `apps/ml/tests/manufacturer_resolution_cases.json` covers passive components, ICs, connectors, switches and equipment families, Raspberry Pi, Waveshare, Adafruit, legacy names, ambiguous prefixes, description-only evidence, ERP-present records, ERP-absent candidates, and Data Pack rules.

The first-match implementation scored `15/18 (83.3%)`. Manufacturer Intelligence v2 scores `18/18 (100%)` on candidate names and `18/18 (100%)` on resolution states in the current corpus. These figures are corpus measurements, not a claim of production-wide accuracy.

## Out of scope

This RFC does not change the component form UI, SKU generation, category intelligence, or automatic manufacturer creation.
