# Ananya ERP — Production Containerization & Deployment Guide

> **Release Candidate 1 (RC1) Daily Driver Documentation**
>
> This guide details how to build, deploy, manage, update, backup, and publish the Docker container suite for **Ananya ERP**.

---

## 🏗 Container Architecture

Ananya ERP is containerized using a modular multi-service architecture. Each component is built from multi-stage Dockerfiles leveraging Turborepo dependency pruning (`turbo prune`) for minimal image sizes and non-root execution (`ananya` user, uid/gid 10001).

```
                      ┌────────────────────────┐
                      │    Reverse Proxy /     │
                      │     Ingress Controller │
                      └───────────┬────────────┘
                                  │
                  ┌───────────────┴───────────────┐
                  │                               │
        ┌─────────▼──────────┐         ┌──────────▼─────────┐
        │  48studios/        │         │  48studios/        │
        │  ananya-web        │         │  ananya-api        │
        │  (Next.js :3000)   │         │  (NestJS :4000)    │
        └────────────────────┘         └──────────┬─────────┘
                                                  │
                                 ┌────────────────┼────────────────┐
                                 │                │                │
                        ┌────────▼────────┐ ┌─────▼───────┐ ┌──────▼─────────┐
                        │  48studios/     │ │ PostgreSQL  │ │ Redis          │
                        │  ananya-worker  │ │ Database    │ │ Cache/Queue    │
                        │  (Worker :4001) │ │ (:5432)     │ │ (:6379)        │
                        └─────────────────┘ └─────────────┘ └────────────────┘
```

### Published Docker Hub Images

| Service           | Docker Hub Repository     | Description                                         | Exposed Port |
| :---------------- | :------------------------ | :-------------------------------------------------- | :----------- |
| **Web Interface** | `48studios/ananya-web`    | Next.js Standalone frontend UI                      | `3000`       |
| **API Backend**   | `48studios/ananya-api`    | NestJS REST API server                              | `4000`       |
| **Worker Engine** | `48studios/ananya-worker` | Background jobs (Notifications, Imports, Workflows) | `4001`       |

---

## 🚀 Quick Start (Production Compose)

### 1. Configure Environment

Copy `.env.example` to `.env` and update credentials:

```bash
cp .env.example .env
```

### 2. Launch Production Stack

```bash
docker compose -f compose.prod.yaml up -d
```

### 3. Verify Health Status

Check container health probes:

```bash
docker compose -f compose.prod.yaml ps
```

- **Web Endpoint**: `http://localhost:3000` (Healthcheck: `http://localhost:3000/api/health`)
- **API Endpoint**: `http://localhost:4000` (Healthcheck: `http://localhost:4000/health`)
- **Worker Endpoint**: `http://localhost:4001` (Healthcheck: `http://localhost:4001/health`)

---

## 🛠 Local Container Image Building

To manually build images from source:

### Build API Image

```bash
docker build -f docker/Dockerfile.api -t 48studios/ananya-api:latest .
```

### Build Web Image

```bash
docker build -f docker/Dockerfile.web -t 48studios/ananya-web:latest .
```

### Build Worker Image

```bash
docker build -f docker/Dockerfile.worker -t 48studios/ananya-worker:latest .
```

---

## 🏷 Docker Hub Publishing Strategy

When publishing releases to Docker Hub (`48studios/ananya-*`), follow the tag strategy:

1. `latest` — Latest stable build on `main` branch
2. `rc1` — Release Candidate builds
3. `vX.Y.Z` — Semantic version tags (e.g., `v1.0.0`)
4. `<git-sha>` — Immutable commit SHA tags

### Manual Publishing Commands

```bash
# Tag images
docker tag 48studios/ananya-web:latest 48studios/ananya-web:rc1
docker tag 48studios/ananya-api:latest 48studios/ananya-api:rc1
docker tag 48studios/ananya-worker:latest 48studios/ananya-worker:rc1

# Push to Docker Hub
docker push 48studios/ananya-web:latest
docker push 48studios/ananya-web:rc1

docker push 48studios/ananya-api:latest
docker push 48studios/ananya-api:rc1

docker push 48studios/ananya-worker:latest
docker push 48studios/ananya-worker:rc1
```

---

## 🏡 Home Lab & Daily Driver Deployment

For Home Lab server deployment (e.g. Unraid, Portainer, TrueNAS SCALE, Proxmox LXC):

1. **Clone & Configure**:
   ```bash
   git clone https://github.com/48studios/ananya.git /opt/ananya
   cd /opt/ananya
   cp .env.example .env
   ```
2. **Persistence Mounts**: Ensure volumes `ananya_postgres_data`, `ananya_redis_data`, and `ananya_uploads_data` map to persistent host SSD/NVMe paths.
3. **Run Daemon**:
   ```bash
   docker compose -f compose.prod.yaml up -d
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

### Persistent Attachments & Uploads Backup

```bash
docker run --rm -v ananya_uploads_data:/volume -v $(pwd):/backup alpine tar czf /backup/ananya_uploads_$(date +%Y%m%d).tar.gz -C /volume .
```

---

## 🔒 Security Hardening Standards

- **Non-Root Execution**: Container runtimes execute under standard unprivileged user `ananya` (`UID/GID 10001`).
- **Network Isolation**: PostgreSQL and Redis are isolated within internal bridge network `ananya-network` and are not exposed externally in production.
- **Capability Dropping**: Unnecessary Linux capabilities are dropped (`cap_drop: [ALL]`).
- **Health Probes**: Automated healthcheck probes trigger container restarts if service unresponsiveness occurs.
