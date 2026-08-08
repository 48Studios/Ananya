# Ananya ERP — Production Containerization & Release Engineering Guide

> **Production Deployment Architecture & Release Engineering Reference**
>
> This guide details how to build, deploy, manage, update, rollback, and publish multi-architecture container images for **Ananya ERP** using GitHub Container Registry (GHCR) and standalone Docker Compose specifications.

---

## 🏗 Container Architecture & Registry

Ananya ERP uses a modular multi-service container architecture. Production images are built as multi-architecture containers (`linux/amd64`, `linux/arm64`) using Docker Buildx, 4-stage pipeline pruning (`pruner` → `builder` → `prod-deps` → `runner`), and non-root security (`ananya` user, `UID/GID 10001`).

```
                    ┌────────────────────────────────┐
                    │  Reverse Proxy / Ingress       │
                    │  (Caddy / Traefik / Nginx /    │
                    │   Cloudflare Tunnel / Tailscale)│
                    └───────────────┬────────────────┘
                                    │ (Port 3000)
                    ┌───────────────▼────────────────┐
                    │  ghcr.io/48studios/ananya-web  │
                    │  (Next.js Standalone UI)       │
                    └───────────────┬────────────────┘
                                    │ (Internal Network: ananya_internal)
                    ┌───────────────┴────────────────┐
                    │                                │
          ┌─────────▼──────────┐          ┌──────────▼─────────┐
          │ ghcr.io/48studios/ │          │ PostgreSQL         │
          │ ananya-api         │          │ Database           │
          │ (NestJS REST API)  │          │ (postgres:16-alpine│
          └─────────┬──────────┘          └────────────────────┘
                    │ (Optional Profile: worker)
          ┌─────────▼──────────┐
          │ ghcr.io/48studios/ │
          │ ananya-worker      │
          │ (Background Worker)│
          └────────────────────┘
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

## 🚀 Quick Start (Production Deployment via Standalone Compose)

Production deployments use a **standalone, self-contained** Compose configuration (`compose.prod.yaml`). It does NOT depend on or merge with `compose.yaml`.

### 1. Configure Environment
Copy `.env.example` to `.env` and set production credentials:
```bash
cp .env.example .env
```

### 2. Deploy Production Stack
To deploy the default production stack (`postgres`, `api`, `web`):
```bash
docker compose -f compose.prod.yaml up -d
```

### 3. Optional Service Profiles
To enable the background worker or pgAdmin management tools:
```bash
# Enable background worker service
docker compose -f compose.prod.yaml --profile worker up -d

# Enable pgAdmin administration tool
docker compose -f compose.prod.yaml --profile tools up -d

# Enable all optional services
docker compose -f compose.prod.yaml --profile all up -d
```
Alternatively, set `COMPOSE_PROFILES=worker` in your `.env` file.

---

## 💻 Local Development Workflow

To build and run all services locally from workspace source files:

```bash
# Build and boot all local development services
docker compose up --build -d

# Verify local container health & ports
docker compose ps
```
Local dev ports exposed to host:
- **Web UI**: `http://localhost:3000`
- **API Server**: `http://localhost:4000` (Health Probe: `http://localhost:4000/health`)
- **Worker**: `http://localhost:4001` (Health Probe: `http://localhost:4001/health`)
- **PostgreSQL**: `localhost:5432`
- **pgAdmin**: `http://localhost:5050`

To reset local development database:
```bash
docker compose down -v
docker compose up --build -d
```

---

## 🔒 Security & Network Isolation

- **Single Ingress Point**: In production (`compose.prod.yaml`), only the Web interface (port 3000) is published to the host interface.
- **Backend Network Isolation**: PostgreSQL (5432), API (4000), and Worker (4001) communicate over the private Docker network `ananya_internal` with zero host port exposure.
- **Dynamic Database Credentials**: `DATABASE_URL` is automatically constructed by Docker Compose from `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`.
- **Non-Root Execution**: Container processes run under non-root user `ananya` (`UID/GID 10001`).

---

## 🌐 Reverse Proxy Integration

The `ananya-web` container exposes port `3000`. You can front it with any reverse proxy or ingress solution.

### Caddy Example
```caddy
ananya.example.com {
    reverse_proxy localhost:3000
}
```

### Nginx Example
```nginx
server {
    listen 80;
    server_name ananya.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 🔄 Updating & Rollback

### Updating to Latest Container Images
```bash
docker compose -f compose.prod.yaml pull
docker compose -f compose.prod.yaml up -d --remove-orphans
```

### Rolling Back to a Specific Tag or Git SHA
To roll back to a previous tag (e.g. `v0.1.0` or `sha-a1b2c3d`):
```bash
ANANYA_VERSION=v0.1.0 docker compose -f compose.prod.yaml up -d
```

---

## 💾 Backup & Maintenance Procedures

### Database Backup (PostgreSQL)
```bash
docker exec -t ananya-postgres pg_dump -U ananya ananya | gzip > ananya_backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### Database Restore
```bash
gunzip -c ananya_backup.sql.gz | docker exec -i ananya-postgres psql -U ananya -d ananya
```

### Persistent Volume Backup (File Uploads)
```bash
docker run --rm -v ananya_uploads_data:/volume -v $(pwd):/backup alpine tar czf /backup/ananya_uploads_$(date +%Y%m%d).tar.gz -C /volume .
```
