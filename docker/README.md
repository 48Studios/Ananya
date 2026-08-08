# Ananya ERP — Production Containerization & Release Engineering Guide

> **Production Deployment Architecture & Release Engineering Reference**
>
> This guide details how to build, deploy, manage, update, rollback, and publish multi-architecture container images for **Ananya ERP** using GitHub Container Registry (GHCR) and standalone Docker Compose specifications.

---

## 🏗 Container Architecture & Registry

Ananya ERP uses a modular multi-service container architecture with **separate public endpoints** for the Web application and the API.

```
                    ┌────────────────────────────────┐
                    │  Reverse Proxy / Ingress       │
                    │  (Caddy / Traefik / Nginx /    │
                    │   Cloudflare Tunnel)           │
                    └───┬────────────────────────┬───┘
                        │ erp.<domain>:3000      │ api.erp.<domain>:4000
          ┌─────────────▼──────────┐  ┌──────────▼─────────────┐
          │ ghcr.io/48studios/     │  │ ghcr.io/48studios/     │
          │ ananya-web             │  │ ananya-api             │
          │ (Next.js Standalone)   │  │ (NestJS REST API)      │
          └────────────────────────┘  └──────────┬─────────────┘
                                                 │ (Internal: ananya_internal)
                                      ┌──────────▼─────────────┐
                                      │ PostgreSQL              │
                                      │ (postgres:16-alpine)    │
                                      └────────────────────────┘
```

### Deployment Architecture

| Public Endpoint            | Service         | Port |
| :------------------------- | :-------------- | :--- |
| `https://erp.<domain>`     | Next.js Web UI  | 3000 |
| `https://api.erp.<domain>` | NestJS REST API | 4000 |

**Key principle**: The browser communicates **directly** with the API via its public URL. Docker service names (e.g. `http://api:4000`) are used only for internal container-to-container communication and **must never appear in browser-facing configuration**.

### Published GHCR Images

| Service           | GitHub Container Registry Path    | Multi-Arch Platforms         |
| :---------------- | :-------------------------------- | :--------------------------- |
| **Web Interface** | `ghcr.io/48studios/ananya-web`    | `linux/amd64`, `linux/arm64` |
| **API Backend**   | `ghcr.io/48studios/ananya-api`    | `linux/amd64`, `linux/arm64` |
| **Worker Engine** | `ghcr.io/48studios/ananya-worker` | `linux/amd64`, `linux/arm64` |

---

## 🏷 Image Tagging Strategy

| Tag Type              | Image Tag Pattern           | Trigger Event              | `latest` Tag Behavior                         |
| :-------------------- | :-------------------------- | :------------------------- | :-------------------------------------------- |
| **Edge Build**        | `edge`, `sha-<commit-sha>`  | Push to `main` branch      | ❌ `latest` NOT modified                      |
| **Release Candidate** | `rc1`, `rc2`, ...           | Push to `release/*` branch | ❌ `latest` NOT modified                      |
| **Official Release**  | `vX.Y.Z`, `X.Y.Z`, `latest` | Git release tag `v*.*.*`   | ✅ `latest` updated ONLY on official releases |

---

## ⚙️ Environment Variables

### The One Variable You Must Configure

**`API_PUBLIC_URL`** — the public base URL of the API that the browser calls directly.

| Environment       | Value                           |
| :---------------- | :------------------------------ |
| Local development | `http://localhost:4000`         |
| Local Docker      | `http://localhost:4000`         |
| Production        | `https://api.erp.48studios.dev` |

> [!IMPORTANT]
> `API_PUBLIC_URL` must be a URL the **browser** can reach. Docker DNS names like `http://api:4000` only work inside the Docker network and will break in the browser.

This value is passed to `docker compose` as `NEXT_PUBLIC_API_URL`, which Next.js bakes into the build. Changing `API_PUBLIC_URL` requires rebuilding the web image.

---

## 🚀 Quick Start (Production Deployment)

### 1. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set:

```bash
# Your public API endpoint
API_PUBLIC_URL=https://api.erp.your-domain.com

# Required: JWT secret
JWT_SECRET=your_secure_secret_here

# Required: Database credentials
POSTGRES_PASSWORD=your_secure_password
```

### 2. Deploy Production Stack

```bash
docker compose -f compose.yml -f compose.prod.yml up -d
```

### 3. Optional Service Profiles

```bash
# Enable background worker service
docker compose -f compose.yml -f compose.prod.yml --profile worker up -d

# Enable pgAdmin administration tool
docker compose -f compose.yml -f compose.prod.yml --profile tools up -d

# Enable all optional services
docker compose -f compose.yml -f compose.prod.yml --profile all up -d
```

---

## 🗄️ Database Startup Lifecycle

The API container owns the standard Ananya database startup lifecycle:

1. On every API startup, the process waits for PostgreSQL to accept connections.
2. The API applies all pending Drizzle schema migrations before NestJS starts listening.
3. Migration execution is idempotent; repeated starts simply leave the schema up to date.
4. If migrations fail, the API logs the failure and exits with a non-zero status so the container is not marked healthy.
5. The `/health` endpoint is only reachable after migrations have completed successfully and NestJS has started.

No manual migration command is required during deployment. No automatic seed or demo business data is created on startup. After the API is healthy, administrators should open the Web UI and import the required Data Pack(s) from **Settings → Data Packs** to initialize business data.

## 💻 Local Docker Workflow

Build and run all services locally from workspace source files:

```bash
# Build and boot all local development services
docker compose -f compose.yml -f compose.local.yml up --build -d

# Verify local container health & ports
docker compose -f compose.yml -f compose.local.yml ps
```

Local ports exposed to host:

| Service        | URL                     |
| :------------- | :---------------------- |
| **Web UI**     | `http://localhost:3000` |
| **API Server** | `http://localhost:4000` |
| **Worker**     | `http://localhost:4001` |
| **PostgreSQL** | `localhost:5432`        |
| **pgAdmin**    | `http://localhost:5050` |

To reset local development database:

```bash
docker compose -f compose.yml -f compose.local.yml down -v
docker compose -f compose.yml -f compose.local.yml up --build -d
```

---

## 🔒 Security & Network Isolation

- **Separate Public Endpoints**: Web UI (`erp.<domain>`) and API (`api.erp.<domain>`) are exposed independently via a reverse proxy. The browser calls the API directly.
- **Backend Network Isolation**: PostgreSQL (5432) and Worker (4001) communicate over the private Docker network `ananya_internal` with zero host port exposure in production.
- **No Proxy Layer**: The Next.js frontend does **not** proxy API traffic. There is no `/api/*` rewrite forwarding to the backend.
- **Dynamic Database Credentials**: `DATABASE_URL` is automatically constructed by Docker Compose from `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`.
- **Non-Root Execution**: Container processes run under non-root user `ananya` (`UID/GID 10001`).

---

## 🌐 Reverse Proxy Integration

Both the Web UI and API must be publicly accessible. Front both with your reverse proxy.

### Caddy Example

```caddy
erp.example.com {
    reverse_proxy localhost:3000
}

api.erp.example.com {
    reverse_proxy localhost:4000
}
```

### Nginx Example

```nginx
server {
    listen 80;
    server_name erp.example.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name api.erp.example.com;
    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Traefik Example (Docker labels)

```yaml
services:
  web:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.web.rule=Host(`erp.example.com`)"
      - "traefik.http.services.web.loadbalancer.server.port=3000"

  api:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`api.erp.example.com`)"
      - "traefik.http.services.api.loadbalancer.server.port=4000"
```

---

## 🔄 Updating & Rollback

### Updating to Latest Container Images

```bash
docker compose -f compose.yml -f compose.prod.yml pull
docker compose -f compose.yml -f compose.prod.yml up -d --remove-orphans
```

### Rolling Back to a Specific Tag or Git SHA

```bash
ANANYA_VERSION=v0.1.0 docker compose -f compose.yml -f compose.prod.yml up -d
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
