# Database

This document describes the persistence architecture used by Ananya.

## Overview

Ananya uses:

- PostgreSQL
- Drizzle ORM

Database schema definitions are maintained in:

```
packages/database
```

---

## Responsibilities

The database package is responsible for:

- schema definitions
- migrations
- database connections
- persistence infrastructure

It does **not** contain business rules.

---

## Domain Ownership

The domain defines repository interfaces.

The database package provides repository implementations.

Dependency direction:

```
Domain

↓

Repository Interface

↓

Database Implementation

↓

PostgreSQL
```

---

## Migrations

Schema changes are managed through Drizzle migrations.

Every schema modification should include a corresponding migration.

### Release migration identity (artifact-only upgrades)

`setup.sh --upgrade` must never apply a stale migration tree. Two paths:

- **Checkout present**: the local `packages/database/drizzle/` tree is mounted
  read-only after a git-tracking check, then verified inside the migrate
  container by journal-entry identity (`idx` + `tag` + `when`) plus SQL-file
  presence (`verify-migrations.js`, checkout mode).
- **Artifact-only directory** (no checkout): the migrate image's baked-in
  `packages/database/migration-identity.json` binds its migration tree to the
  release it was built from. `setup.sh` runs
  `verify-migrations.js --release "${ANANYA_VERSION}"` inside the migrate
  container, which requires the requested version to match the baked
  `RELEASE_VERSION` and the tree head + entry count + SQL files to match the
  baked identity. A shell preflight in `setup.sh` rejects non-final versions
  before any image pull, build, or database start.

Version rules (Phase 3.4.12/D2): artifact-only upgrades accept only final
release tags `X.Y.Z` / `vX.Y.Z` with integer parts and no leading zeros
(e.g. `0.2.0`, `v1.10.3`). Prereleases (`1.0.0-rc.1`), channel/SHA/mutable
tags (`latest`, `edge`, `rc`, `beta`, `sha-*`, `main`), partial versions, and
malformed strings fail closed. The baked `revision` must be a full 40-hex-char
Git SHA (or `unknown` for local builds, which can never pass artifact-only
mode). The SHA is trusted as baked from CI's `github.sha`; the verifier runs
without a Docker socket, so it cannot independently corroborate the image OCI
`revision` label — a forged identity requires forging the image itself.

How legitimate releases carry the identity: the shared script
`packages/database/scripts/bake-migration-identity.js` (invoked by
`docker/Dockerfile.api` and `docker/Dockerfile.worker`) writes
`migration-identity.json` at build time from the `GIT_SHA` / `RELEASE_VERSION`
build args, reading the journal + SQL files actually packaged in that build,
and fails the build when the tree is incomplete. `.github/workflows/release.yml`
passes the tag name and commit SHA
(`GIT_SHA=${{ github.sha }}`, `RELEASE_VERSION=${{ github.ref_name }}`);
`.github/workflows/docker.yml` (edge builds) passes `RELEASE_VERSION=edge`,
which artifact-only upgrades refuse — deploy edge only with a checkout, and
deploy artifact-only directories only with a pinned final release tag
(e.g. `ANANYA_VERSION=0.2.0`). Images predating identity baking (no identity
file) always fail closed.

Provenance scope (Phase 3.4.12/D1): the migration gate verifies the `migrate`
(api) image only. The worker image bakes the identical file via the same
script (same `@ananya/api` prune scope, verified byte-identical in testing).
The web image (prune scope `@ananya/web`, no drizzle tree) and the ML image
(Python, no drizzle tree) carry informational OCI labels
(`org.opencontainers.image.revision`, `ananya.release.version`) only — they
make no migration claim. Cross-service commit consistency beyond the migrate
image is therefore not established; the gate guarantees the migrations applied
are the intended release's, not that every service image shares one commit.

---

## Design Principles

- Prefer relational modelling.
- Use constraints to enforce invariants where appropriate.
- Keep persistence concerns outside the domain.
- Never bypass repository interfaces.

---

## Future Evolution

As the system grows, this document will expand to describe:

- indexing strategy
- transaction management
- projections
- inventory ledger persistence
- reporting models
