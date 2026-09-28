# Ananya

**A self-hosted operations workspace with built-in component intelligence to reduce repetitive catalog entry.**

Ananya brings component catalogs, inventory, purchasing, warehouse activity, manufacturing, projects, and operational reporting into one system. It is built for people and teams who need to know **what they have, where it is, what is moving, and what needs to happen next**.

[![Continuous Integration](https://github.com/48studios/ananya/actions/workflows/ci.yml/badge.svg)](https://github.com/48studios/ananya/actions/workflows/ci.yml)
[![Docker Publishing](https://github.com/48studios/ananya/actions/workflows/docker.yml/badge.svg)](https://github.com/48studios/ananya/actions/workflows/docker.yml)
[![Latest Release](https://img.shields.io/github/v/release/48studios/ananya?color=green&label=Release)](https://github.com/48studios/ananya/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> Ananya is developed for the internal operations of **48 Studios**. It can be self-hosted and adapted by other teams, but it is not a hosted service with a public sign-up or support SLA.

Originally developed by [@jrsarath](https://github.com/jrsarath) to manage inventory for personal projects, Ananya has since grown into a broader operations system. Its origins remain reflected in its intended audience: solo builders, hobbyists, and small teams can use it without a dedicated operations department.

## Start here

- [What Ananya does](#what-ananya-does)
- [Who it is for](#who-ananya-is-for)
- [What it does not replace](#what-ananya-is-not)
- [Project status and known limits](#project-status-and-known-limits)
- [Get an instance running](#get-an-instance-running)
- [Load your data](#load-your-data)
- [Develop and contribute](#develop-and-contribute)

## What Ananya does

Ananya connects day-to-day operations that are often split across spreadsheets and separate tools:

| Area                         | What teams can do                                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Inventory and storage**    | Maintain component records, nested locations, stock balances, transactions, transfers, reservations, counts, batches, serials, and adjustments. |
| **Purchasing and receiving** | Manage suppliers, purchase orders, goods receipts, and supplier returns.                                                                        |
| **Manufacturing**            | Build bills of materials, plan material needs, create work orders, record production, and receive finished goods.                               |
| **Projects and service**     | Track projects, allocate and issue materials, manage tasks and timesheets, and follow service, warranty, and return workflows.                  |
| **Operations visibility**    | Review inventory, purchasing, manufacturing, project, and transaction reports; use activity, audit, notification, barcode, and QR tools.        |
| **Administration**           | Manage users, roles and permissions, organization settings, numbering, data packs, imports, and documents.                                      |

The application is a web interface backed by an API and PostgreSQL. It includes role-based access, an audit trail, and a background worker.

## ML Intelligence: less manual catalog entry

ML Intelligence is a core part of Ananya. It helps a team turn the information it already has—a part number, a short description, or a manufacturer datasheet—into a more complete, consistent component record.

During component entry, Ananya can:

- suggest a manufacturer and manufacturer part number;
- classify the component into an existing category or suggest a category candidate;
- propose a clearer component name and description;
- surface likely duplicates from the existing catalog before another record is created; and
- suggest relevant structured attributes and values, with confidence and evidence where available.

For eligible datasheets, Documentation Intelligence can extract manufacturer identity, part number, and technical specifications. Findings enter a review workflow with document evidence; reviewers can inspect and apply the values to the component. Category managers can also use suggested specifications to configure which attributes matter for a category.

The intelligence is **assistive, not autonomous**: suggestions can be reviewed, edited, applied, or rejected, and datasheet findings do not silently change a component. Reviewer decisions can be recorded as feedback. The service is designed to run CPU-first using classifiers and rules, rather than requiring a GPU or a generative chat model. Ananya's ordinary operations remain usable without the ML service, with fewer intelligence features and deterministic fallback behavior.

To run the complete self-hosted stack, use the default `all` Compose profile, which includes the ML service. See the [ML service guide](apps/ml/README.md) for its capabilities and development setup.

## Who Ananya is for

Ananya is a good fit for **one person or a team** that wants to keep physical inventory organized and connected to its projects or production work. You can start with a simple component catalog and storage locations, then use purchasing, manufacturing, reports, and other workflows when they become useful.

It may suit you if you:

- handle physical components, materials, stock, or production;
- need storage locations and stock movements to be visible and traceable;
- want purchasing, receiving, and production workflows connected to inventory;
- can run or arrange a self-hosted Docker deployment; and
- are comfortable configuring their own workspace and starting data.

It is especially useful when you handle components or materials for electronics, making, repairs, workshops, or small-scale production. Ananya is self-hosted, so it is less suitable if you want a ready-to-use cloud account or an app that works without setup.

## What Ananya is not

Ananya is an **operations system**, not a promise to replace every business application. It is not intended to replace:

- specialist statutory accounting, tax filing, or payroll/HR systems;
- a public e-commerce storefront or customer-facing commerce platform;
- CAD, PLM, or engineering design tools; or
- managed hosting, backups, identity administration, or an IT support provider.

Ananya includes finance, sales, CRM, and service areas, but that does not make it a complete substitute for a specialist system in each field.

## Project status and known limits

Ananya is at **V0.2** (`0.2.0` in the web and API package metadata). The checked-in code includes deployment automation, database migrations, tests, and Docker image/release workflows.

The [project status](PROJECT_STATUS.md) distinguishes implemented areas from known gaps and screens that still use sample records. **Brands** and **Project Costing** are not present in the current source. The following routes contain in-code sample records: `/activities`, `/crm`, `/customer-returns`, `/customers`, `/fulfillment`, `/journal-entries`, `/leads`, `/opportunities`, `/quotations`, `/sales`, `/sales-orders`, and `/traceability`. Validate the screens and workflows you depend on with your own data before using them operationally.

Before production use, an administrator should also:

- replace the example database password and JWT secret with strong unique values;
- configure HTTPS, public URLs, and allowed origins for the deployment;
- establish off-host backups for PostgreSQL and uploaded files, and test a restore; and
- confirm permissions, imports, reports, and critical workflows against the organization's procedures.

## Get an instance running

Ananya is self-hosted. The Docker setup is the shortest route to an evaluation instance; a developer checkout is described under [Develop and contribute](#develop-and-contribute).

### Requirements

- A Linux host or workstation with Docker Engine and the Docker Compose v2 plugin.
- Internet access to pull the published images on a first install.
- PostgreSQL storage and disk space for uploaded files.
- For team access over the internet: a domain, HTTPS reverse proxy, and a browser-reachable API URL.

### Time to first use

These are **planning estimates, not measured benchmarks**. They assume Docker is already installed and working:

| Goal                                                                    | Typical planning time                                            |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Local evaluation, including first-run setup and a small import          | About **30–60 minutes**                                          |
| Team deployment with DNS, HTTPS, secrets, backups, and access checks    | About **1–3 hours**, depending on infrastructure readiness       |
| Developer environment, with Node.js, pnpm, and Docker already installed | About **20–40 minutes**, plus dependency and image download time |

### Deploy with Docker

```bash
git clone https://github.com/48studios/ananya.git
cd ananya
cp .env.example .env
```

Edit `.env` **before starting the stack**. At minimum, set unique secrets and the correct browser-facing URLs:

```env
POSTGRES_PASSWORD=replace-with-a-strong-unique-password
JWT_SECRET=replace-with-a-long-random-secret
PGADMIN_DEFAULT_PASSWORD=replace-with-a-strong-unique-password
CORS_ORIGIN=https://erp.example.com
API_PUBLIC_URL=https://api.erp.example.com
```

For a local evaluation, use `CORS_ORIGIN=http://localhost:3000` and `API_PUBLIC_URL=http://localhost:4000`. Do not use these local URLs for a public deployment. `API_PUBLIC_URL` is called directly by users' browsers and must be reachable from their machines.

Start the installer:

```bash
./setup.sh
```

The script checks Docker, pulls the published API/worker/ML images, builds the web image, starts PostgreSQL, applies schema migrations, and starts the application stack. When it finishes, route traffic through your reverse proxy:

```text
https://erp.example.com      -> web on port 3000
https://api.erp.example.com  -> API on port 4000
```

Then open the web address and complete the first-run **Organization Setup** flow to create the organization and initial administrator. Once signed in, use **Settings → Data Packs** to install starter reference data. See the [Docker guide](docker/README.md) for Compose profiles, image tags, upgrades, health checks, and backup details.

> **Security:** `.env.example` contains development defaults. Never expose an installation while those example credentials or secrets are still in use.

## Load your data

Schema migrations create the database structure; they do not create your business catalog or stock. Ananya uses the same in-app data paths for development and production:

1. Complete Organization Setup.
2. Install appropriate starter packs in **Settings → Data Packs**. Current packs include units of measure, default categories, core logistics locations, and a small demo inventory pack.
3. Use the import workflow to load your own records from **CSV, Excel (`.xlsx`), or JSON** files.
4. Review the preview, match columns, resolve validation issues, and run the import.

The importer provides downloadable templates, column matching, pre-import validation, duplicate checks, and relationship resolution using business codes such as SKUs and location/category codes. Hierarchical records such as locations can be imported with their parent relationships. Start with a small, representative file and verify the resulting records before importing a full catalog.

For detailed rules and supported importer contracts, see [Data Lifecycle](docs/DATA_LIFECYCLE.md). Ananya deliberately does not rely on CLI seed scripts for operational data.

## Develop and contribute

Ananya is a TypeScript monorepo with a Next.js web app, a NestJS API, framework-independent domain packages, and a PostgreSQL/Drizzle data layer. The optional ML service is Python/FastAPI.

### Prerequisites

- Node.js `22.14.0` (see [.nvmrc](.nvmrc); supported engine is `>=22.12.0`).
- pnpm `9`.
- Docker and Docker Compose v2 for local PostgreSQL.
- Python `3.11+` only if working on the ML service directly.

### Start local development

```bash
git clone https://github.com/48studios/ananya.git
cd ananya
pnpm install
cp .env.example .env
```

Use local browser/API URLs in `.env`:

```env
API_PUBLIC_URL=http://localhost:4000
CORS_ORIGIN=http://localhost:3000
```

Start PostgreSQL, migrate the schema, and run the apps:

```bash
docker compose -f compose.yml -f compose.local.yml up -d db
pnpm db:migrate
pnpm dev
```

The web app is at `http://localhost:3000`; the API is at `http://localhost:4000`. Migrations prepare schema only. Complete organization setup and install Data Packs in the web UI before loading business data. More detail is in [Local Development](docs/development/LOCAL_DEVELOPMENT.md).

### Quality checks

Run the relevant checks before opening a pull request:

```bash
pnpm check-types
pnpm lint
pnpm test
pnpm build
```

The repository also provides `pnpm test:e2e`, `pnpm test:accessibility`, and `pnpm test:visual`. Review [CONTRIBUTING.md](CONTRIBUTING.md), [AGENTS.md](AGENTS.md), [Architecture](ARCHITECTURE.md), and [Design](DESIGN.md) before substantial changes. Keep pull requests focused and include tests and documentation when behavior changes.

### Repository map

| Path                                               | Contents                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| `apps/web`                                         | Next.js web application                                                   |
| `apps/api`                                         | NestJS REST API and background worker entrypoint                          |
| `apps/ml`                                          | Optional Python/FastAPI component-intelligence service                    |
| `packages/inventory`, `packages/procurement`, etc. | Domain packages and application logic                                     |
| `packages/database`                                | PostgreSQL schema, Drizzle repositories, and migrations                   |
| `compose*.yml`, `docker/`                          | Local and production-equivalent container setup                           |
| `docs/`                                            | Architecture, development, data lifecycle, testing, and operations guides |

### Architecture at a glance

```text
Browser → Next.js Web → NestJS API → Domain Packages → Repositories → PostgreSQL
                                      ↘ Background Worker
                                      ↘ Optional ML Service
```

The project follows a modular-monolith architecture. Domain rules live in domain packages, API controllers orchestrate requests, and repositories handle persistence. The ML service is optional; core application workflows do not require an LLM or GPU. Redis is not part of the current Compose stack.

## Operations and maintenance

- **Upgrade:** review [Docker guide](docker/README.md) and back up the database and uploaded files before applying migrations. The helper script supports `./setup.sh --upgrade`.
- **Backups:** back up both PostgreSQL and the Compose-managed upload volume. Keep copies outside the application host and test restoration.
- **Health and logs:** use `docker compose -f compose.yml -f compose.prod.yml --profile all ps` and inspect service logs with Docker Compose.
- **Detailed deployment help:** [Docker guide](docker/README.md).

## License

Ananya is released under the [MIT License](LICENSE).

Made with ❤️ in Kolkata, India.
