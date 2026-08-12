#!/usr/bin/env bash
# ==============================================================================
# Ananya ERP — Production Installation & Setup Script
# Automatically configures environment, builds Web image with API_PUBLIC_URL,
# pulls published GHCR images, runs database migrations, and boots services.
#
# Usage:
#   ./setup.sh             # Fresh installation or idempotent re-run
#   ./setup.sh --upgrade   # Pull new images, rebuild Web, and apply migrations
# ==============================================================================

set -eo pipefail

COLOR_RESET="\033[0m"
COLOR_GREEN="\033[1;32m"
COLOR_CYAN="\033[1;36m"
COLOR_YELLOW="\033[1;33m"
COLOR_RED="\033[1;31m"

IS_UPGRADE=false
if [ "$1" = "--upgrade" ] || [ "$1" = "-u" ]; then
  IS_UPGRADE=true
fi

log_info() {
  echo -e "${COLOR_CYAN}[INFO]${COLOR_RESET} $1"
}

log_success() {
  echo -e "${COLOR_GREEN}[SUCCESS]${COLOR_RESET} $1"
}

log_warn() {
  echo -e "${COLOR_YELLOW}[WARN]${COLOR_RESET} $1"
}

log_error() {
  echo -e "${COLOR_RED}[ERROR]${COLOR_RESET} $1" >&2
}

echo -e "${COLOR_CYAN}"
echo "================================================================="
echo "              Ananya ERP — Production Setup                      "
echo "================================================================="
echo -e "${COLOR_RESET}"

# ------------------------------------------------------------------------------
# 1. Prerequisites Check
# ------------------------------------------------------------------------------
log_info "Checking system prerequisites..."

if ! command -v docker &> /dev/null; then
  log_error "Docker is not installed or not in system PATH."
  log_error "Please install Docker before running setup (https://docs.docker.com/get-docker/)."
  exit 1
fi

if ! docker compose version &> /dev/null; then
  log_error "Docker Compose (v2) plugin is not installed or not working."
  log_error "Please install 'docker compose' (https://docs.docker.com/compose/install/)."
  exit 1
fi

if ! docker info &> /dev/null; then
  log_error "Docker daemon is not running or current user lacks permission to access Docker socket."
  exit 1
fi

log_success "Docker & Docker Compose prerequisites verified."

# ------------------------------------------------------------------------------
# 2. Environment Configuration (.env)
# ------------------------------------------------------------------------------
if [ ! -f .env ]; then
  log_info "No .env file found. Creating initial .env from .env.example..."
  if [ -f .env.example ]; then
    cp .env.example .env
  else
    log_error ".env.example template file not found."
    exit 1
  fi
  log_success "Created .env template."
else
  log_info "Existing .env file detected. Preserving existing configuration and secrets."
fi

# Load variables from .env for validation
set -a
# shellcheck disable=SC1091
source .env 2>/dev/null || true
set +a

# Defaults for prompt / missing values
ANANYA_VERSION="${ANANYA_VERSION:-latest}"
API_PUBLIC_URL="${API_PUBLIC_URL:-http://localhost:4000}"

log_info "Deployment Configuration:"
echo "  - Release Tag (ANANYA_VERSION) : ${ANANYA_VERSION}"
echo "  - Browser API URL (API_PUBLIC_URL): ${API_PUBLIC_URL}"

# ------------------------------------------------------------------------------
# 3. Pull Published Images & Build Web Image
# ------------------------------------------------------------------------------
log_info "Pulling published API and Worker images from GHCR..."
docker compose -f compose.yml -f compose.prod.yml pull api worker migrate

log_info "Building Web application image with API_PUBLIC_URL=${API_PUBLIC_URL}..."
docker compose -f compose.yml -f compose.prod.yml build web

# ------------------------------------------------------------------------------
# 4. Start PostgreSQL & Wait for Health
# ------------------------------------------------------------------------------
log_info "Starting PostgreSQL database container..."
docker compose -f compose.yml -f compose.prod.yml up -d postgres

log_info "Waiting for PostgreSQL database to become healthy..."
RETRIES=30
until [ "$RETRIES" -le 0 ]; do
  HEALTH=$(docker inspect -f '{{.State.Health.Status}}' ananya-postgres 2>/dev/null || echo "unhealthy")
  if [ "$HEALTH" = "healthy" ]; then
    log_success "PostgreSQL database is healthy and ready."
    break
  fi
  sleep 2
  RETRIES=$((RETRIES - 1))
done

if [ "$RETRIES" -le 0 ]; then
  log_error "PostgreSQL failed to report healthy status within timeout."
  docker logs ananya-postgres
  exit 1
fi

# ------------------------------------------------------------------------------
# 5. Database Schema Migrations
# ------------------------------------------------------------------------------
log_info "Executing database schema migrations..."
if docker compose -f compose.yml -f compose.prod.yml run --rm migrate; then
  log_success "Database schema migrations applied successfully."
else
  log_error "Database schema migration failed. Aborting installation."
  exit 1
fi

# ------------------------------------------------------------------------------
# 6. Start Application Stack
# ------------------------------------------------------------------------------
if [ "$IS_UPGRADE" = true ]; then
  log_info "Upgrading Ananya ERP application containers..."
else
  log_info "Starting Ananya ERP application stack..."
fi

docker compose -f compose.yml -f compose.prod.yml --profile worker up -d

# ------------------------------------------------------------------------------
# 7. Health Probe Verification
# ------------------------------------------------------------------------------
log_info "Verifying service initialization..."
sleep 3

CONTAINERS=("ananya-api" "ananya-web")
for c in "${CONTAINERS[@]}"; do
  RUNNING=$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null || echo "false")
  if [ "$RUNNING" != "true" ]; then
    log_error "Container '$c' failed to start!"
    docker logs "$c"
    exit 1
  fi
done

echo -e "${COLOR_GREEN}"
echo "================================================================="
echo " 🎉 Ananya ERP deployment completed successfully!                "
echo "================================================================="
echo -e "${COLOR_RESET}"
echo "  Web Application : http://localhost:3000 (or your configured DOMAIN)"
echo "  API Service     : ${API_PUBLIC_URL}"
echo ""
echo "Next Steps:"
echo "  1. Configure your reverse proxy (Caddy/Nginx) if exposing over HTTPS."
echo "  2. Sign in as administrator and import Data Packs from Settings -> Data Packs."
echo ""
