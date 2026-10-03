# Documentation

Welcome to the Ananya documentation.

Documentation is organized by domain and topic rather than by technology.

---

## Architecture

High-level system design, DDD boundaries, data lifecycle, and navigation architecture.

- [Architecture Overview](architecture/README.md)
- [System Architecture](architecture/ARCHITECTURE.md) — Core principles, dependency rules, and production data lifecycle
- [Project Structure](architecture/PROJECT_STRUCTURE.md) — Monorepo layout, applications, and bounded context packages
- [Domain-Driven Design Standard](architecture/DDD.md) — Layer responsibilities, aggregate invariants, and ubiquitous language
- [Production Data Lifecycle](architecture/DATA_LIFECYCLE.md) — Operational data management, zero CLI scripts, data packs, and import framework
- [Information Architecture](architecture/INFORMATION_ARCHITECTURE.md) — 7-module navigation architecture, rails, and routing layout
- [Route & Navigation Architecture Audit](architecture/ROUTE_ARCHITECTURE_AUDIT.md) — Full route inventory, domain-prefixed hierarchy, redirect policy, and post-implementation record
- [Component Consolidation](architecture/COMPONENT_CONSOLIDATION.md) — Duplicate component retirement & consolidation lifecycle
- [AI Agent Guide](architecture/AI_AGENT_GUIDE.md) — Collaborative architecture rules for autonomous AI coding agents
- [Architectural Review Checklist](architecture/REVIEW_CHECKLIST.md) — In-depth architectural review checklist

---

## Security

Authentication models, RBAC authorization matrices, and endpoint threat boundaries.

- [Authorization & Access Matrix](security/authorization-matrix.md) — Complete controller permissions, system roles, and ownership checks
- [Public Endpoints Inventory](security/public-endpoints.md) — Authoritative inventory of `@Public()` opt-outs and defense-in-depth controls
- [Authentication & Onboarding](security/AUTHENTICATION.md) — Multi-tenant organization creation, invitation mechanics, and session model

---

## Development & Operations

Guides for setting up, developing, testing, and operating Ananya services.

- [Development Guide](development/README.md)
- [Setup](development/SETUP.md) — Prerequisites and environment configuration
- [Local Development](development/LOCAL_DEVELOPMENT.md) — Compose workflows, pnpm dev, and database tasks
- [Testing Guide](development/TESTING.md) — Quality gates, unit tests, and Playwright E2E testing platform
- [ML Operations](development/ML_OPERATIONS.md) — Training, evaluation, deployment, and rollback control plane
- [Scanner App](development/SCANNER_APP.md) — Standalone `/scan` PWA surface, camera constraints, and scan lifecycle

---

## Standards

Engineering standards and contributor guidelines.

- [Engineering Standards](standards/ENGINEERING.md) — Coding conventions, error handling, package boundaries
- [Coding Standards](standards/CODING_STANDARDS.md) — TypeScript best practices and DTO validation
- [New Package Guide](standards/NEW_PACKAGE.md) — Checklist for creating workspace packages
- [New Module Guide](standards/NEW_MODULE.md) — Checklist for introducing new domain modules
- [PR Review Checklist](standards/PR_REVIEW_CHECKLIST.md) — Pre-merge quality checklist

---

## Benchmarks & Research

- [ML Model Comparison Report](benchmarks/ml-model-comparison-report.md) — Empirical evaluation of FastText, TF-IDF, MiniLM, and deterministic rules

---

## API & Database

- [API Documentation](api/README.md) — Resource-oriented endpoints, thin controllers, and contracts
- [Database Documentation](database/README.md) — Drizzle schema, migrations, and persistence rules

---

## RFCs

Sequential architectural decision records (RFC-0001 through RFC-0061).

- [RFC Index](rfcs/README.md)

---

## Archive

Historical artifacts, past audits, and superseded architectural analyses.

- [Archive Index](archive/README.md)
