# Ananya Project Status

**Snapshot date:** 2026-09-29

**Version:** V0.2 (`0.2.0` in the web and API package metadata)

This document describes what is present in the repository today. A route, service, or test proves that code exists; it does not by itself prove that every workflow is complete or ready for every production use. Feature maturity varies across the application.

## At a glance

Ananya is a self-hosted operations system developed for the internal operations of 48 Studios. It began as a personal tool for tracking project inventory and has grown to cover component cataloguing, inventory, purchasing, manufacturing, projects, service, and related operations.

The repository contains a runnable web app, API, PostgreSQL persistence layer, background worker, Docker deployment setup, and an ML Intelligence service. The web and API packages identify as version `0.2.0`. The repository does not establish that a public hosted service, support SLA, or externally verified production deployment is available.

Solo builders, hobbyists, and small teams are welcome to use or adapt it. Users should be comfortable running a self-hosted application and validating the workflows they rely on.

## What is present in the repository

The following areas have application code and supporting services in the repository. This is a map of implemented areas, not a claim that every edge case or workflow has been operationally validated.

| Area                            | Repository status                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Component catalog and inventory | Catalog, stock transactions, nested storage locations, transfers, reservations, counts, batches, serials, and related reporting are represented in application and domain code. |
| Purchasing and receiving        | Supplier, purchase order, goods receipt, and supplier return workflows are present.                                                                                             |
| Manufacturing                   | Bills of materials, material planning, work orders, production, and finished goods workflows are present.                                                                       |
| Projects and service            | Project/task tracking, material allocation, timesheets, service, warranty, and return workflows are present.                                                                    |
| Operations and administration   | Reports, activity/audit features, notifications, barcode/QR support, user access controls, organization settings, imports, documents, and data packs are represented.           |
| Finance, sales, and CRM         | Related application areas exist, but maturity is mixed. Several screens currently use in-code sample records; see [Fixture-backed screens](#fixture-backed-screens).            |
| Deployment and persistence      | Docker Compose configuration, setup scripts, PostgreSQL schema and migrations, CI, and Docker publishing/release workflows are checked in.                                      |

## ML Intelligence

ML Intelligence is a significant part of Ananya, intended to reduce repetitive manual catalog entry. The repository includes component-entry suggestions for manufacturer, part number, category/classification, names and descriptions, likely duplicates, and structured attributes. Documentation Intelligence can extract component details from eligible datasheets and presents findings with evidence for review.

The workflow is assistive: users can review, edit, apply, or reject suggestions. The available implementation is CPU-first and based on classifiers/rules; it does not require a GPU or a generative chat model. Core operations have deterministic fallback behavior when the ML service is unavailable, with intelligence features unavailable or reduced. See the [ML service guide](apps/ml/README.md).

## Known gaps and limits

### Fixture-backed screens

Repository inspection found pages with in-code sample records at these routes:

- `/activities`
- `/sales/crm`
- `/sales/customer-returns`
- `/sales/customers`
- `/sales/fulfillment`
- `/finance/journal-entries`
- `/sales/leads`
- `/sales/opportunities`
- `/sales/quotations`
- `/sales`
- `/sales/orders`
- `/manufacturing/traceability`

Treat these screens as illustrative until their data paths are connected to the expected live workflows. This list is based on a source-code search and may need updating as the application changes.

### Missing features found in the current source

- **Brands**: no Brands feature/module was found in the current repository inspection.
- **Project Costing**: no Project Costing feature/module was found in the current repository inspection.

These are source inspection findings, not a promise that no related capability could be implemented through another workflow.

### Deployment and operational ownership

Ananya is self-hosted. The repository includes setup and container configuration, but the operator remains responsible for secrets, network exposure, backups and restore drills, upgrades, access administration, and validating operational procedures. A checked-in release workflow does not establish the current status of published images or a running installation.

## Data ingestion

The application includes an import workflow for CSV, Excel (`.xlsx`), and JSON data, with templates, column mapping, validation, duplicate checks, and relationship resolution. Data Packs provide starter reference data such as units, categories, logistics locations, and demo inventory. Database migrations create schema; they do not populate an organization's operational catalog or balances. Start with a small import and verify the result before loading a full dataset.

See [Data Lifecycle](docs/architecture/DATA_LIFECYCLE.md) for supported import behavior and [Docker guide](docker/README.md) for deployment.

## Verification snapshot

The following repository-wide commands completed successfully on 2026-09-29:

| Command            | Result                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------- |
| `pnpm check-types` | Passed; 15 Turbo tasks succeeded.                                                      |
| `pnpm test`        | Passed; 26 tasks succeeded. API: 66 suites / 1,143 tests. Web: 41 files / 1,164 tests. |
| `pnpm lint`        | Passed; web and API lint tasks succeeded.                                              |

`pnpm build` and `pnpm test:e2e` were not run for this snapshot. Passing unit, service, and type checks does not establish full end-to-end or production readiness.

## Verified facts, assumptions, and unknowns

### Verified from the repository

- Web and API package versions are `0.2.0`.
- The codebase includes web, API, domain packages, PostgreSQL persistence, a background worker, Docker setup, imports, Data Packs, and ML Intelligence.
- The checks listed above passed on the snapshot date.
- The fixture-backed routes listed above contain in-code sample records.

### Project context supplied by the maintainer

- Ananya was initially developed as a personal inventory tracker for the maintainer's projects.
- The application is currently used for the internal operations of 48 Studios.

### Not established by this repository snapshot

- Whether a particular production deployment is currently running or which release it uses.
- Current availability or freshness of published container images.
- Number of active users, external adoption, uptime, support commitments, certifications, or service-level guarantees.
- Complete production suitability of every workflow; teams should validate the screens and procedures they depend on.

## Developer references

- [Architecture](ARCHITECTURE.md)
- [Design system](DESIGN.md)
- [Contributor guide](CONTRIBUTING.md)
- [Local development](docs/development/LOCAL_DEVELOPMENT.md)
- [Testing guide](docs/development/TESTING.md)
