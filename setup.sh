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
for arg in "$@"; do
  case "$arg" in
    --upgrade|-u)
      IS_UPGRADE=true
      ;;
  esac
done

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

# Preflight (Phase 3.4.12/D3): in artifact-only mode (no usable local migration
# checkout) the requested version is the sole release binding, so validate it
# HERE — before image pulls, web builds, or database startup. This is a cheap
# shell preflight for values that cannot be final releases (empty, known
# mutable tags, or anything that is not X.Y.Z / vX.Y.Z with integer parts);
# the authoritative check is the in-container verifier, which additionally
# compares against the baked identity. Checkout mode is unaffected: any
# ANANYA_VERSION is accepted here and the journal-identity comparison below
# remains the gate.
if [ ! -d "packages/database/drizzle" ]; then
  PREFLIGHT_VERSION_OK=true
  case "${ANANYA_VERSION}" in
    ""|"latest"|"Latest"|"LATEST"|"edge"|"Edge"|"EDGE"|"rc"|"RC"|"beta"|"Beta"|"BETA"|"main"|"Main"|"MAIN"|"unknown"|"Unknown"|"UNKNOWN")
      PREFLIGHT_VERSION_OK=false
      ;;
    *)
      # Final release format only: optional single "v" + X.Y.Z integers, no
      # prerelease suffixes, no leading zeros. Shell-pattern approximation of
      # the verifier's FINAL_RELEASE_PATTERN; the verifier remains authoritative.
      PREFLIGHT_TMP="${ANANYA_VERSION#[vV]}"
      case "$PREFLIGHT_TMP" in
        *[!0-9.]*|*..*|.*|*.) PREFLIGHT_VERSION_OK=false ;;
        *.*.*)
          PREFLIGHT_MAJOR="${PREFLIGHT_TMP%%.*}"
          PREFLIGHT_REST="${PREFLIGHT_TMP#*.}"
          PREFLIGHT_MINOR="${PREFLIGHT_REST%%.*}"
          PREFLIGHT_PATCH="${PREFLIGHT_REST#*.}"
          case "$PREFLIGHT_PATCH" in
            *.*) PREFLIGHT_VERSION_OK=false ;;
          esac
          for PREFLIGHT_PART in "$PREFLIGHT_MAJOR" "$PREFLIGHT_MINOR" "$PREFLIGHT_PATCH"; do
            case "$PREFLIGHT_PART" in
              ""|*[!0-9]*) PREFLIGHT_VERSION_OK=false ;;
              0*) [ "${#PREFLIGHT_PART}" -gt 1 ] && PREFLIGHT_VERSION_OK=false ;;
            esac
          done
          ;;
        *) PREFLIGHT_VERSION_OK=false ;;
      esac
      unset PREFLIGHT_TMP PREFLIGHT_MAJOR PREFLIGHT_REST PREFLIGHT_MINOR PREFLIGHT_PATCH PREFLIGHT_PART
      ;;
  esac
  if [ "$PREFLIGHT_VERSION_OK" != "true" ]; then
    log_error "ANANYA_VERSION='${ANANYA_VERSION}' is not a pinned final release version (expected X.Y.Z or vX.Y.Z, e.g. 0.2.0)."
    log_error "Artifact-only upgrades (no local packages/database/drizzle checkout) require a final release tag such as ANANYA_VERSION=0.2.0."
    log_error "Deploy prerelease, channel, SHA, or mutable tags (latest/edge/rc/beta) only from a full checkout, where the migration tree is verified by journal identity."
    exit 1
  fi
  unset PREFLIGHT_VERSION_OK
fi

log_info "Deployment Configuration:"
echo "  - Release Tag (ANANYA_VERSION)    : ${ANANYA_VERSION}"
echo "  - Browser API URL (API_PUBLIC_URL): ${API_PUBLIC_URL}"
echo "  - Upgrade Mode (IS_UPGRADE)       : ${IS_UPGRADE}"

# ------------------------------------------------------------------------------
# 3. Pull Published Images & Build Web Image
# ------------------------------------------------------------------------------
if [ "$IS_UPGRADE" = true ]; then
  if [ -d .git ] && command -v git &> /dev/null; then
    log_info "Fetching latest repository updates (including frontend source code)..."
    git fetch --all --prune 2>/dev/null || log_warn "git fetch failed. Proceeding with existing local files."
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
    if [ "$CURRENT_BRANCH" != "HEAD" ]; then
      log_info "Pulling latest code on branch '${CURRENT_BRANCH}'..."
      git pull --ff-only origin "$CURRENT_BRANCH" 2>/dev/null || log_warn "git pull was not fast-forwardable. Continuing with existing local source files."
    else
      git pull --ff-only 2>/dev/null || log_warn "git pull failed. Continuing with existing local source files."
    fi
  else
    log_info "No .git directory found. Skipping git repository update."
  fi
fi

log_info "Pulling published container images from GHCR..."
docker compose -f compose.yml -f compose.prod.yml pull api worker migrate web ml 2>/dev/null || {
  log_warn "Pulling 'web' image directly from registry was skipped or unavailable; pulling remaining published images (api, worker, migrate, ml)..."
  docker compose -f compose.yml -f compose.prod.yml pull api worker migrate ml
}

if [ "$IS_UPGRADE" = true ]; then
  log_info "Rebuilding Web frontend image with latest changes (API_PUBLIC_URL=${API_PUBLIC_URL})..."
  docker compose -f compose.yml -f compose.prod.yml build --pull --no-cache web
else
  log_info "Building Web application image with API_PUBLIC_URL=${API_PUBLIC_URL}..."
  docker compose -f compose.yml -f compose.prod.yml build web
fi

# ------------------------------------------------------------------------------
# 4. Start PostgreSQL & Wait for Health
# ------------------------------------------------------------------------------
log_info "Starting PostgreSQL database container..."
docker compose -f compose.yml -f compose.prod.yml up -d db

log_info "Waiting for PostgreSQL database to become healthy..."
RETRIES=30
until [ "$RETRIES" -le 0 ]; do
  HEALTH=$(docker inspect -f '{{.State.Health.Status}}' ananya-db 2>/dev/null || echo "unhealthy")
  if [ "$HEALTH" = "healthy" ]; then
    log_success "PostgreSQL database is healthy and ready."
    break
  fi
  sleep 2
  RETRIES=$((RETRIES - 1))
done

if [ "$RETRIES" -le 0 ]; then
  log_error "PostgreSQL failed to report healthy status within timeout."
  docker logs ananya-db
  exit 1
fi

# ------------------------------------------------------------------------------
# 5. Database Schema Migrations
#
# Migration-source guarantee (Phase 3.4.10, F2): the migrate container reads
# /app/packages/database/drizzle either from the image bake or from the
# read-only checkout mount below. A stale image without the mount would
# silently skip pending migrations, so the source is verified BEFORE the
# migrator runs:
#   1. If the checkout tree exists, it must be a git work tree whose HEAD
#      contains the migration journal (guards against the warn-and-continue
#      `git pull` above leaving a stale or unrelated checkout behind). Only
#      then is it mounted read-only as the migration source.
#   2. Inside the container, verify-migrations.js compares the effective tree
#      (what drizzle-orm will read) against the expected checkout tree by
#      journal-entry identity (idx + tag + when) plus SQL-file presence.
# Either check failing aborts before application activation (§6).
# ------------------------------------------------------------------------------
log_info "Executing database schema migrations..."
MIGRATE_VOL_OPTS=()
MIGRATE_EXPECTED_DIR=""
if [ -d "packages/database/drizzle" ]; then
  if [ -d .git ] && command -v git &> /dev/null; then
    JOURNAL_PATH="packages/database/drizzle/meta/_journal.json"
    if git ls-files --error-unmatch "$JOURNAL_PATH" >/dev/null 2>&1; then
      # The journal must be tracked at HEAD (not a stale checkout missing the
      # release's migrations). Uncommitted journal entries are allowed — they
      # are exactly what a release branch carries before merge — but the
      # committed HEAD version must already contain every migration the image
      # under upgrade could need. The in-container identity check below is the
      # authoritative gate; this guard only rejects clearly unrelated checkouts.
      JOURNAL_HEAD_COMMIT=$(git log -1 --format=%H -- "$JOURNAL_PATH" 2>/dev/null || echo "")
      if [ -n "$JOURNAL_HEAD_COMMIT" ] && git merge-base --is-ancestor "$JOURNAL_HEAD_COMMIT" HEAD 2>/dev/null; then
        MIGRATE_VOL_OPTS=(-v "$(pwd)/packages/database/drizzle:/app/packages/database/drizzle:ro")
        MIGRATE_EXPECTED_DIR="$(pwd)/packages/database/drizzle"
        log_info "Migration source: verified checkout tree (journal HEAD commit ${JOURNAL_HEAD_COMMIT:0:8} is an ancestor of $(git rev-parse --short HEAD 2>/dev/null || echo HEAD))."
      else
        log_error "Checkout migration journal is not tracked at HEAD (stale or unrelated checkout?). Refusing to supply migrations from this directory."
        exit 1
      fi
    else
      log_error "Migration journal $JOURNAL_PATH is not tracked in this checkout. Refusing to supply migrations from an unverifiable directory."
      exit 1
    fi
  else
    # No git metadata (artifact-only deploy dir): the checkout tree itself is
    # still the intended source when present — verify it inside the container.
    MIGRATE_VOL_OPTS=(-v "$(pwd)/packages/database/drizzle:/app/packages/database/drizzle:ro")
    MIGRATE_EXPECTED_DIR="$(pwd)/packages/database/drizzle"
    log_info "Migration source: local directory (no git metadata; content verified inside the migrate container)."
  fi
fi

# Resolve the expected-source path as seen INSIDE the migrate container: the
# read-only mount lands exactly on the path the migrator reads, so the expected
# tree and the effective tree coincide when the mount is active.
#
# Without a mount (artifact-only directory), the image's baked-in
# migration-identity.json binds the tree to the intended release (Phase 3.4.11):
# the identity is written at Docker build time from CI's release tag + source
# SHA, and --release requires ANANYA_VERSION to match it. A stale-but-complete
# tree is rejected because its baked identity names the older release — the
# check never trusts the tree to describe itself. Mutable tags (latest/edge/rc)
# fail closed: pin ANANYA_VERSION to the release being deployed.
VERIFY_EXPECTED_CONTAINER_DIR="/app/packages/database/drizzle"
if [ -z "$MIGRATE_EXPECTED_DIR" ]; then
  log_info "No local migration directory; binding the migrate image's baked-in tree to release ${ANANYA_VERSION}..."
  if ! docker compose -f compose.yml -f compose.prod.yml run --rm --no-deps --entrypoint node migrate packages/database/dist/setup/verify-migrations.js --release "${ANANYA_VERSION}" "$VERIFY_EXPECTED_CONTAINER_DIR" /app/packages/database; then
    log_error "Release identity verification failed (see above). Aborting before database migration and application activation."
    exit 1
  fi
else
  if ! docker compose -f compose.yml -f compose.prod.yml run --rm --no-deps "${MIGRATE_VOL_OPTS[@]}" --entrypoint node migrate packages/database/dist/setup/verify-migrations.js "$VERIFY_EXPECTED_CONTAINER_DIR" /app/packages/database/drizzle; then
    log_error "Migration source verification failed. Aborting before application activation."
    exit 1
  fi
fi

if docker compose -f compose.yml -f compose.prod.yml run --rm "${MIGRATE_VOL_OPTS[@]}" migrate; then
  log_success "Database schema migrations applied successfully."
else
  log_error "Database schema migration failed. Aborting installation."
  exit 1
fi

# ------------------------------------------------------------------------------
# 6. Start Application Stack
# ------------------------------------------------------------------------------
if [ "$IS_UPGRADE" = true ]; then
  log_info "Upgrading Ananya ERP application containers with recreated images..."
  docker compose -f compose.yml -f compose.prod.yml --profile all up -d --force-recreate
else
  log_info "Starting Ananya ERP application stack..."
  docker compose -f compose.yml -f compose.prod.yml --profile all up -d
fi

# ------------------------------------------------------------------------------
# 7. Health Probe Verification
# ------------------------------------------------------------------------------
log_info "Verifying service initialization..."
sleep 3

CONTAINERS=("ananya-api" "ananya-web" "ananya-worker" "ananya-ml")
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
