# Ananya ERP — Production Containerization & Release Engineering Guide

> **Daily Driver Phase & Continuous Delivery Reference**
>
> This guide details how to build, deploy, manage, update, rollback, and publish multi-architecture container images for **Ananya ERP** using GitHub Container Registry (GHCR).

---

## 🏗 Container Architecture & Registry

Ananya ERP uses a modular multi-service container architecture. Production images are built as multi-architecture containers (`linux/amd64`, `linux/arm64`) using Docker Buildx and Turborepo dependency pruning (`turbo prune`) for minimal image size and non-root security (`ananya` user, `UID/GID 10001`).

```
                      ┌────────────────────────┐
                      │    Reverse Proxy /     │
                      │     Ingress Controller │
                      └───────────┬────────────┘
                                  │
                  ┌───────────────┴───────────────┐
                  │                               │
        ┌─────────▼──────────┐         ┌──────────▼─────────┐
        │  ghcr.io/48studios/│         │  ghcr.io/48studios/│
        │  ananya-web        │         │  ananya-api        │
        │  (Next.js :3000)   │         │  (NestJS :4000)    │
        └────────────────────┘         └──────────┬─────────┘
                                                  │
                                 ┌────────────────┼────────────────┐
                                 │                │                │
                        ┌────────▼────────┐ ┌─────▼───────┐ ┌──────▼─────────┐
                        │  ghcr.io/      │ │ PostgreSQL  │ │ Redis          │
                        │  48studios/     │ │ Database    │ │ Cache/Queue    │
                        │  ananya-worker  │ │ (:5432)     │ │ (:6379)        │
                        │  (Worker :4001) │ └─────────────┘ └────────────────┘
                        └─────────────────┘
```

### Published GHCR Images

| Service | GitHub Container Registry Path | Multi-Arch Platforms | Description |
| :--- | :--- | :--- | :--- |
| **Web Interface** | `ghcr.io/48studios/ananya-web` | `linux/amd64`, `linux/arm64` | Next.js Standalone frontend UI |
| **API Backend** | `ghcr.io/48studios/ananya-api` | `linux/amd64`, `linux/arm64` | NestJS REST API server |
| **Worker Engine** | `ghcr.io/48studios/ananya-worker` | `linux/amd64`, `linux/arm64` | Background job & workflow worker |

---

## 🏷 Image Tagging Strategy

| Tag Type | Image Tag Pattern | Trigger Event | `latest` Tag Behavior |
| :--- | :--- | :--- | :--- |
| **Edge Build** | `edge`, `sha-<commit-sha>` | Push to `main` branch | ❌ `latest` NOT modified |
| **Release Candidate** | `rc1`, `rc2`, ... | Push to `release/*` branch | ❌ `latest` NOT modified |
| **Official Release** | `vX.Y.Z`, `X.Y.Z`, `latest` | Git release tag `v*.*.*` | ✅ `latest` updated ONLY on official releases |

---

## 🔄 Release Engineering Lifecycle

```
 Developer Code Edit & Local Quality Gate (pnpm qa & pnpm test:e2e)
         │
         ▼
 Push to `main` Branch / Tag Release (`v*.*.*`)
         │
         ├───► GitHub Actions: `ci.yml` (Fast Quality Gates: Lint, Types, Tests, Build)
         │
         ├───► GitHub Actions: `docker.yml` (Triggered on main push)
         │           ├── 1. Mandatory Quality Gates (needs: none)
         │           ├── 2. Container Boot & Health Smoke Test (needs: quality-gates)
         │           └── 3. Buildx Multi-Arch GHCR Publish (`edge`, `sha-<commit>`)
         │
         └───► GitHub Actions: `release.yml` (Triggered on v*.*.* tag)
                     ├── 1. Mandatory Quality Gates
                     ├── 2. Container Boot & Health Smoke Test
                     ├── 3. Publish GHCR Images (`vX.Y.Z`, `latest`)
                     └── 4. Create GitHub Release with Release Notes
```

---

## 🚀 Quick Start (Production Deployment via GHCR)

### 1. Configure Environment
Copy `.env.example` to `.env` and set production secrets:
```bash
cp .env.example .env
```

### 2. Pull Latest Edge or Release Images
```bash
# Pull default 'edge' tag from GHCR
docker compose -f compose.prod.yaml pull

# Or pull a specific release tag
ANANYA_VERSION=v0.1.0 docker compose -f compose.prod.yaml pull
```

### 3. Launch Production Stack
```bash
docker compose -f compose.prod.yaml up -d
```

### 4. Verify Service Probes
```bash
docker compose -f compose.prod.yaml ps
```
- **Web Endpoint**: `http://localhost:3000` (Health Probe: `http://localhost:3000/api/health`)
- **API Endpoint**: `http://localhost:4000` (Health Probe: `http://localhost:4000/health`)
- **Worker Endpoint**: `http://localhost:4001` (Health Probe: `http://localhost:4001/health`)

---

## 🔄 Updating Containers & Rollback

### Updating to Latest Edge Images
```bash
docker compose -f compose.prod.yaml pull
docker compose -f compose.prod.yaml up -d --remove-orphans
```

### Rolling Back to a Specific Version or Git SHA
To roll back to a previous stable tag (e.g. `sha-a1b2c3d` or `v0.1.0`):
```bash
ANANYA_VERSION=sha-a1b2c3d docker compose -f compose.prod.yaml up -d
```

---

## 🛠 Local Multi-Arch Buildx Testing

To test multi-architecture builds locally using Docker Buildx:

```bash
# Initialize buildx builder instance
docker buildx create --name ananya-builder --use

# Build API multi-arch image
docker buildx build --platform linux/amd64,linux/arm64 -f docker/Dockerfile.api -t ghcr.io/48studios/ananya-api:local .

# Build Web multi-arch image
docker buildx build --platform linux/amd64,linux/arm64 -f docker/Dockerfile.web -t ghcr.io/48studios/ananya-web:local .

# Build Worker multi-arch image
docker buildx build --platform linux/amd64,linux/arm64 -f docker/Dockerfile.worker -t ghcr.io/48studios/ananya-worker:local .
```

---

## 💾 Backup & Restore Procedures

### Database Backup (PostgreSQL)
```bash
docker exec -t ananya-postgres pg_dump -U ananya ananya | gzip > ananya_backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### Database Restore
```bash
gunzip -c ananya_backup.sql.gz | docker exec -i ananya-postgres psql -U ananya -d ananya
```

### Persistent File Storage Backup
```bash
docker run --rm -v ananya_uploads_data:/volume -v $(pwd):/backup alpine tar czf /backup/ananya_uploads_$(date +%Y%m%d).tar.gz -C /volume .
```

---

## 🔒 Security Hardening Standards

- **Non-Root Execution**: Containers run as `ananya` user (`UID/GID 10001`).
- **Network Isolation**: PostgreSQL and Redis run on private bridge network `ananya-network` with zero public exposure.
- **Least Privilege Workflows**: GitHub Actions authentication uses temporary `GITHUB_TOKEN` with minimal scope (`contents: read`, `packages: write`).
- **Automated Health Probes**: Active container probes verify HTTP endpoints every 10-15s.
