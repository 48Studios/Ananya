# AI-TEST dataset — test data index

Generated test dataset for manually exercising the Ananya intelligence stack.
Everything here is **test data**: it is namespaced `AI-TEST-`, created through the
real HTTP API, and removable with one command.

Generated: 2026-09-21T21:32:09.161Z

## Contents

| Record | Count |
| --- | --- |
| Manufacturers (ERP) | 15 |
| Categories (ERP) | 12 |
| Components | 32 |
| Documents | 20 |
| Document versions | 20 |
| Category attribute bindings | 29 |
| Component findings (PENDING) | 76 |
| Attribute findings (PENDING) | 38 |

## Components

Search `AI-TEST-` in the components list to find all of them. `purpose` is the
test intent, not a description of the record.

### Group A — clean, fully classified baseline

| Key | SKU | Name | Manufacturer | Category | MPN | Intent |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | `CMP-000283` | `AI-TEST-YAGEO-10K-0603` | YAGEO | RES | `RC0603FR-0710KL` |  |
| A2 | `CMP-000284` | `AI-TEST-YAGEO-1K-0603` | YAGEO | RES | `RC0603FR-071KL` |  |
| A3 | `CMP-000285` | `AI-TEST-VISHAY-4K7-0805` | VISHAY | RES | `CRCW08054K70FKEA` |  |
| A4 | `CMP-000286` | `AI-TEST-MURATA-100NF-0603` | MURATA | CAP | `GRM188R71H104KA93D` |  |
| A5 | `CMP-000287` | `AI-TEST-SAMSUNG-1UF-0805` | SAMSUNG | CAP | `CL21A105KBFNNNE` |  |
| A6 | `CMP-000288` | `AI-TEST-TDK-10UF-0805` | TDK | CAP | `C2012X5R1A106M125AB` |  |
| A7 | `CMP-000289` | `AI-TEST-TI-LM358` | TI | ICSEM | `LM358DR` |  |
| A8 | `CMP-000290` | `AI-TEST-ST-AMS1117-33` | ST | ICSEM | `AMS1117-3.3` |  |

### Group B — deliberately incomplete classification

| Key | SKU | Name | Manufacturer | Category | MPN | Intent |
| --- | --- | --- | --- | --- | --- | --- |
| B9 | `CMP-000291` | `AI-TEST-B-NO-MFR-MURATA-CAP` | — | CAP | `GRM31CR61C106KA88L` |  |
| B10 | `CMP-000292` | `AI-TEST-B-NO-CAT-VISHAY-RES` | VISHAY | — | `CRCW0805220RFKEA` |  |
| B11 | `CMP-000293` | `AI-TEST-B-NO-CAT-NEXPERIA-LOGIC` | NEXPERIA | — | `74HC595PW` |  |
| B12 | `CMP-000294` | `AI-TEST-B-NO-MFR-PANASONIC-RES` | — | RES | `ERJ8ENF1002V` |  |
| B13 | `CMP-000295` | `AI-TEST-B-NO-MFR-NO-CAT-INFINEON-IRF540N` | — | — | `IRF540NPBF` |  |

### Group C — MPN / identity extraction

| Key | SKU | Name | Manufacturer | Category | MPN | Intent |
| --- | --- | --- | --- | --- | --- | --- |
| C14 | `CMP-000296` | `AI-TEST-MPN-NOISY-ALPHA` | YAGEO | RES | — |  |
| C15 | `CMP-000297` | `AI-TEST-MPN-NOISY-BETA` | MURATA | CAP | — |  |
| C16 | `CMP-000298` | `AI-TEST-MPN-NOISY-GAMMA` | TDK | CAP | — |  |
| C17 | `CMP-000299` | `AI-TEST-YAGEO-MPN-CONFLICT-RC0603FR-0733KL` | YAGEO | RES | `RC0603FR-0722KL` |  |

### Group D1 — exact duplicate (identical normalized MPN)

| Key | SKU | Name | Manufacturer | Category | MPN | Intent |
| --- | --- | --- | --- | --- | --- | --- |
| D18 | `CMP-000300` | `AI-TEST-DUP-EXACT-YAGEO-33K-A` | YAGEO | RES | `RC0805FR-0733KL` | duplicate scenario |
| D19 | `CMP-000301` | `AI-TEST-DUP-EXACT-YAGEO-33K-B` | YAGEO | RES | `RC0805FR0733KL` | duplicate scenario |

### Group D2 — packaging variant

| Key | SKU | Name | Manufacturer | Category | MPN | Intent |
| --- | --- | --- | --- | --- | --- | --- |
| D20 | `CMP-000302` | `AI-TEST-DUP-PACKAGING-MURATA-LQH32-A` | MURATA | IND | `LQH32CN100K23L` | duplicate scenario |
| D21 | `CMP-000303` | `AI-TEST-DUP-PACKAGING-MURATA-LQH32-B` | MURATA | IND | `LQH32CN100K23LTR` | duplicate scenario |

### Group D3 — semantic name similarity

| Key | SKU | Name | Manufacturer | Category | MPN | Intent |
| --- | --- | --- | --- | --- | --- | --- |
| D22 | `CMP-000304` | `AI-TEST-DUP-SEMANTIC-MURATA-100NF-50V-X7R-0603-A` | MURATA | CAP | `GRM188R71H104JA93D` | duplicate scenario |
| D23 | `CMP-000305` | `AI-TEST-DUP-SEMANTIC-MURATA-100NF-50V-X7R-0603-B` | MURATA | CAP | `GRM188R71H104MA93D` | duplicate scenario |

### Group D4 — identical MPN, conflicting manufacturers

| Key | SKU | Name | Manufacturer | Category | MPN | Intent |
| --- | --- | --- | --- | --- | --- | --- |
| D24 | `CMP-000306` | `AI-TEST-DUP-MFRCONFLICT-VISHAY-CRCW0603` | VISHAY | RES | `CRCW060310K0FKEA` | duplicate scenario |
| D25 | `CMP-000307` | `AI-TEST-DUP-MFRCONFLICT-PANASONIC-CRCW0603` | PANASONIC | RES | `CRCW060310K0FKEA` | duplicate scenario |

### Group E — interconnect, discretes, modules

| Key | SKU | Name | Manufacturer | Category | MPN | Intent |
| --- | --- | --- | --- | --- | --- | --- |
| E26 | `CMP-000308` | `AI-TEST-JST-XH-SERIES-HEADER` | — | CONN | `B4B-XH-A` |  |
| E27 | `CMP-000309` | `AI-TEST-NEXPERIA-BSS138` | NEXPERIA | TRAN | `BSS138` |  |
| E28 | `CMP-000310` | `AI-TEST-ESP32-WROOM-32E` | — | ICSEM | `ESP32-WROOM-32E` |  |
| E29 | `CMP-000311` | `AI-TEST-RPI-PICO` | RASPBERRYPI | PROTO | `SC0915` |  |
| E30 | `CMP-000312` | `AI-TEST-ADAFRUIT-BME280` | ADAFRUIT | PROTO | `BME280` |  |

### Group H — deliberate identity conflicts

| Key | SKU | Name | Manufacturer | Category | MPN | Intent |
| --- | --- | --- | --- | --- | --- | --- |
| H31 | `CMP-000313` | `AI-TEST-CONFLICT-MFR-IS-YAGEO-RES` | MURATA | RES | `RC1206FR-0710KL` | identity conflict |
| H32 | `CMP-000314` | `AI-TEST-CONFLICT-CAT-MECHANICAL-RES` | YAGEO | MECH | `RC0805FR-0710KL` | identity conflict |

## Duplicate scenarios

| Finding id | Rule (matchType) | Pair | Confidence |
| --- | --- | --- | --- |
| `1e379fc3-725a-40d6-881f-9a8a1702ceef` | `SEMANTIC_NAME_SIMILARITY` | AI-TEST-DUP-SEMANTIC-MURATA-100NF-50V-X7R-0603-A<br>↔ AI-TEST-MURATA-100NF-0603 | 0.79 MEDIUM |
| `9c25009f-d8fa-41e3-aeae-63e4f60df91d` | `SEMANTIC_NAME_SIMILARITY` | AI-TEST-DUP-SEMANTIC-MURATA-100NF-50V-X7R-0603-B<br>↔ AI-TEST-DUP-SEMANTIC-MURATA-100NF-50V-X7R-0603-A | 0.91 HIGH |
| `681a1c17-d756-4354-92b2-3c3436b874a8` | `PACKAGING_VARIANT` | AI-TEST-DUP-PACKAGING-MURATA-LQH32-B<br>↔ AI-TEST-DUP-PACKAGING-MURATA-LQH32-A | 0.9 HIGH |
| `72dd32f2-6a9d-4b2b-ad58-d0e2f846d6b2` | `MPN_MANUFACTURER_CONFLICT` | AI-TEST-DUP-MFRCONFLICT-PANASONIC-CRCW0603<br>↔ AI-TEST-DUP-MFRCONFLICT-VISHAY-CRCW0603 | 0.8 MEDIUM |
| `1e59a319-be88-44c7-b25a-abc8de1f804d` | `EXACT_MPN` | AI-TEST-DUP-EXACT-YAGEO-33K-B<br>↔ AI-TEST-DUP-EXACT-YAGEO-33K-A | 1 HIGH |
| `255da9c4-4312-4e02-a785-4ba73670022a` | `SEMANTIC_NAME_SIMILARITY` | AI-TEST-DUP-SEMANTIC-MURATA-100NF-50V-X7R-0603-B<br>↔ AI-TEST-MURATA-100NF-0603 | 0.917 HIGH |

The **consolidation test pair** is the `EXACT_MPN` row above
(group D1: `AI-TEST-DUP-EXACT-YAGEO-33K-A` / `-B`). The preview for that finding
reports `executable: true` with no blocked reasons, so the
Duplicate Finding → Investigation → Preview → Consolidate walkthrough can be
completed end to end. The other pairs are review-only by design.

## Datasheet-driven scenarios

| Key | Component | Documents | Analyzable |
| --- | --- | --- | --- |
| A1 | `AI-TEST-YAGEO-10K-0603` | `DATASHEET`, `CAD_DRAWING`, `SYMBOL` | 1 |
| A4 | `AI-TEST-MURATA-100NF-0603` | `DATASHEET` | 1 |
| A6 | `AI-TEST-TDK-10UF-0805` | `DATASHEET` | 1 |
| A7 | `AI-TEST-TI-LM358` | `DATASHEET` | 1 |
| A8 | `AI-TEST-ST-AMS1117-33` | `TECHNICAL_MANUAL` | 1 |
| B10 | `AI-TEST-B-NO-CAT-VISHAY-RES` | `DATASHEET` | 1 |
| B11 | `AI-TEST-B-NO-CAT-NEXPERIA-LOGIC` | `DATASHEET` | 1 |
| B13 | `AI-TEST-B-NO-MFR-NO-CAT-INFINEON-IRF540N` | `DATASHEET` | 1 |
| B9 | `AI-TEST-B-NO-MFR-MURATA-CAP` | `DATASHEET`, `DATASHEET` | 2 |
| C14 | `AI-TEST-MPN-NOISY-ALPHA` | `DATASHEET` | 1 |
| C15 | `AI-TEST-MPN-NOISY-BETA` | `DATASHEET` | 1 |
| C16 | `AI-TEST-MPN-NOISY-GAMMA` | `DATASHEET` | 1 |
| D20 | `AI-TEST-DUP-PACKAGING-MURATA-LQH32-A` | `DATASHEET` | 1 |
| E27 | `AI-TEST-NEXPERIA-BSS138` | `APPLICATION_NOTE` | 1 |
| E28 | `AI-TEST-ESP32-WROOM-32E` | `TECHNICAL_MANUAL` | 1 |
| E29 | `AI-TEST-RPI-PICO` | `PRODUCT_PAGE` | 1 |
| E30 | `AI-TEST-ADAFRUIT-BME280` | `REFERENCE_DESIGN` | 1 |

### Document conflict

Component `AI-TEST-B-NO-MFR-MURATA-CAP` (1d374fb7-4ae3-443e-8414-139534800323) carries two
datasheets that state **different voltage ratings** (25 V and 50 V). The
aggregate reports `DOCUMENT_CONFLICT` with no value offered, and both
documents are listed as evidence. Conflicts are review-only: the type is
deliberately absent from the apply rules.

### Attribute-value suggestions

| Component | Pending value suggestions |
| --- | --- |
| `AI-TEST-ADAFRUIT-BME280` | 2 |
| `AI-TEST-B-NO-CAT-NEXPERIA-LOGIC` | 2 |
| `AI-TEST-B-NO-CAT-VISHAY-RES` | 4 |
| `AI-TEST-B-NO-MFR-MURATA-CAP` | 4 |
| `AI-TEST-B-NO-MFR-NO-CAT-INFINEON-IRF540N` | 5 |
| `AI-TEST-DUP-PACKAGING-MURATA-LQH32-A` | 3 |
| `AI-TEST-ESP32-WROOM-32E` | 2 |
| `AI-TEST-MPN-NOISY-ALPHA` | 3 |
| `AI-TEST-MPN-NOISY-BETA` | 4 |
| `AI-TEST-MPN-NOISY-GAMMA` | 4 |
| `AI-TEST-MURATA-100NF-0603` | 3 |
| `AI-TEST-NEXPERIA-BSS138` | 3 |
| `AI-TEST-RPI-PICO` | 2 |
| `AI-TEST-ST-AMS1117-33` | 3 |
| `AI-TEST-TDK-10UF-0805` | 3 |
| `AI-TEST-TI-LM358` | 3 |
| `AI-TEST-YAGEO-10K-0603` | 2 |

Group B and group C components record fewer attributes than their datasheet
states, which is what produces these. Apply one through the component detail
page (`Accept & Apply`) and re-run the analysis to see the row become
`VALUE_ALREADY_CURRENT`.

## Attribute definition creation candidates

| Finding id | Category | Proposed attribute | Data type | Default unit |
| --- | --- | --- | --- | --- |
| `e59648c7-e879-4967-b19a-01f8026c7c8a` | `da9ee8ec-cac7-4022-8aaa-58d2575f5d03` | `operating_temperature` (Operating Temperature) | `QUANTITY` | `°C` |
| `16c36f60-630a-4a66-afd2-44afbac3d155` | `da9ee8ec-cac7-4022-8aaa-58d2575f5d03` | `termination` (Termination Style) | `SELECT` | `—` |
| `27894b27-6058-4156-85a5-09bc393fb6c1` | `5616c40c-f8a7-4d73-ab80-347fda515576` | `operating_temperature` (Operating Temperature) | `QUANTITY` | `°C` |
| `bf52f25e-ab33-40a5-bb65-3336a4fdca2f` | `5616c40c-f8a7-4d73-ab80-347fda515576` | `termination` (Termination Style) | `SELECT` | `—` |
| `3701886f-625b-4f69-9ac7-ef3de6d7c7cc` | `5616c40c-f8a7-4d73-ab80-347fda515576` | `polarity` (Polarity) | `SELECT` | `—` |
| `53b6edef-ec1f-4ba3-bfdd-c91f488e617c` | `10b3ae06-e43e-4122-900e-9de56ecf4bd9` | `current_rating` (Current Rating) | `QUANTITY` | `A` |
| `ae8cc244-2440-4cab-ba6c-6278ea6aa76d` | `10b3ae06-e43e-4122-900e-9de56ecf4bd9` | `inductance` (Inductance) | `QUANTITY` | `uH` |
| `bab0a7a7-02c7-43e0-a9e9-26a02cb4e9cd` | `10b3ae06-e43e-4122-900e-9de56ecf4bd9` | `operating_temperature` (Operating Temperature) | `QUANTITY` | `°C` |
| `dc422e2e-e333-4f2d-8126-c293cf12b9e6` | `10b3ae06-e43e-4122-900e-9de56ecf4bd9` | `termination` (Termination Style) | `SELECT` | `—` |
| `f2bd5629-1429-4900-8a7f-a65b36cfa458` | `e791b0f4-62d6-4ee3-8f84-3d53545035a4` | `current_rating` (Current Rating) | `QUANTITY` | `A` |
| `024a1d5d-386c-482f-a446-bfb46d8cf47d` | `e791b0f4-62d6-4ee3-8f84-3d53545035a4` | `operating_temperature` (Operating Temperature) | `QUANTITY` | `°C` |
| `bf4c27dc-9047-4da0-b878-6daf59798f07` | `e791b0f4-62d6-4ee3-8f84-3d53545035a4` | `polarity` (Polarity) | `SELECT` | `—` |

24 findings propose an attribute definition that does not
exist in the library. Accept one, then **Create Attribute** to exercise
`MISSING_EXPECTED_ATTRIBUTE → CREATE_DEFINITION`. The `inductance` proposal for
`Inductors` is the cleanest: the unit catalogue already has `uH` under the
`Inductance` dimension, so the whole validation path succeeds.

## Attribute review queue families

| Issue type | Pending |
| --- | --- |
| `MISSING_EXPECTED_ATTRIBUTE` | 32 |
| `SUSPICIOUS_BINDING` | 1 |
| `UNUSED_ATTRIBUTE` | 5 |

`SUSPICIOUS_BINDING` is produced by a **deliberate fixture**: the audit rule
only fires for `resistance` bound to a capacitor/diode category, so
`resistance → Capacitors` is seeded and removed by cleanup like everything else.

## Skill / pipeline coverage

| Findings by type (component queue, PENDING) | Count |
| --- | --- |
| `ATTRIBUTE_VALUE_SUGGESTION` | 52 |
| `CATEGORY_CONFLICT` | 1 |
| `CATEGORY_UNRESOLVED` | 2 |
| `DOCUMENT_CONFLICT` | 1 |
| `EXACT_DUPLICATE` | 1 |
| `MANUFACTURER_CONFLICT` | 1 |
| `MANUFACTURER_UNRESOLVED` | 9 |
| `MPN_CONFLICT` | 1 |
| `MPN_MISSING` | 3 |
| `POTENTIAL_DUPLICATE` | 5 |

## Commands

```bash
# 1. verify the dataset will not produce false MPN findings
node tools/ai-test-dataset/verify-extraction.mjs

# 2. create the dataset (idempotent; adopts existing master data by code)
node tools/ai-test-dataset/seed.mjs

# 3. run every intelligence producer over it
node tools/ai-test-dataset/run-pipelines.mjs

# 4. regenerate this index
node tools/ai-test-dataset/report.mjs

# 5. remove the dataset (dry run first)
node tools/ai-test-dataset/cleanup.mjs
node tools/ai-test-dataset/cleanup.mjs --execute
```

The scripts need a session token in `/tmp/ai-test-token.env` (or `ANANYA_TOKEN`)
for the supplied user, and a running API on `http://localhost:4000`.

## Cleanup guarantees

- Ownership comes from `manifest.json` (explicit ids) plus the `AI-TEST-` namespace.
- No time-window deletes, no `TRUNCATE`, no removal of reference data outside the dataset.
- Cleanup is a **dry run by default**; `--execute` performs it and verifies every count at 0.
- Documents are deleted through the API so their storage objects are removed too.

