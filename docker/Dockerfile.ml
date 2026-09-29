# ==============================================================================
# Ananya ERP — Production ML Container Image (ananya-ml)
# Lightweight CPU-First Python FastAPI Microservice
# ==============================================================================

FROM python:3.12-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY apps/ml/requirements.txt .

RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

# ------------------------------------------------------------------------------
# Stage 2: Final Runner
# ------------------------------------------------------------------------------
FROM python:3.12-slim AS runner

WORKDIR /app

# Create non-root system user
RUN groupadd -r ananya && useradd -r -g ananya -s /bin/false ananya

# Copy virtualenv from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONPATH=/app

# Copy application source & model artifacts
COPY apps/ml/app /app/apps/ml/app
COPY apps/ml/models /app/apps/ml/models
# The training control plane runs the EXISTING pipeline in this container, so the
# pipeline, its benchmark cases and the data directory it reads and writes must be
# present. Without them the ML operations dashboard can report status but cannot
# train. `data/` and `models/registry/` are the pipeline's own working directories
# (dataset snapshots and candidate artifacts); they are container-local, which is
# documented in docs/ML_OPERATIONS.md.
COPY apps/ml/pipeline /app/apps/ml/pipeline
COPY apps/ml/benchmarks /app/apps/ml/benchmarks
COPY apps/ml/data /app/apps/ml/data
# The production dataset lifecycle reuses these existing training workspace
# packages for group-aware splitting and normalization. Copy the import-time
# package dependencies only; dataset corpora and other training tools stay out
# of the runtime image.
COPY apps/ml/training/__init__.py /app/apps/ml/training/__init__.py
COPY apps/ml/training/config /app/apps/ml/training/config
COPY apps/ml/training/schemas /app/apps/ml/training/schemas
COPY apps/ml/training/datasets/__init__.py /app/apps/ml/training/datasets/__init__.py
COPY apps/ml/training/datasets/splitter.py /app/apps/ml/training/datasets/splitter.py
COPY apps/ml/training/processors /app/apps/ml/training/processors
# The pinned, read-only historical training source and frozen evaluation set are
# required by production retraining. Other training workspace data stays out of
# the runtime image.
COPY apps/ml/training/datasets/training/dataset-crawl-1790343594-reprocessed/train.json /app/apps/ml/training/datasets/training/dataset-crawl-1790343594-reprocessed/train.json
COPY apps/ml/training/datasets/training/dataset-crawl-1790343594-reprocessed/test.json /app/apps/ml/training/datasets/training/dataset-crawl-1790343594-reprocessed/test.json

# Set permissions
RUN chown -R ananya:ananya /app /opt/venv
# Baseline inputs are immutable runtime inputs. Candidate snapshots are written
# only under apps/ml/data/datasets/retraining.
RUN chown root:root \
      /app/apps/ml/data/canonical_training_baseline.json \
      /app/apps/ml/training/datasets/training/dataset-crawl-1790343594-reprocessed \
      /app/apps/ml/training/datasets/training/dataset-crawl-1790343594-reprocessed/train.json \
      /app/apps/ml/training/datasets/training/dataset-crawl-1790343594-reprocessed/test.json && \
    chmod 0444 \
      /app/apps/ml/data/canonical_training_baseline.json \
      /app/apps/ml/training/datasets/training/dataset-crawl-1790343594-reprocessed/train.json \
      /app/apps/ml/training/datasets/training/dataset-crawl-1790343594-reprocessed/test.json && \
    chmod 0555 \
      /app/apps/ml/training/datasets/training/dataset-crawl-1790343594-reprocessed

USER ananya

EXPOSE 5001

HEALTHCHECK --interval=10s --timeout=3s --retries=3 --start-period=5s \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:5001/health')" || exit 1

CMD ["uvicorn", "apps.ml.app.main:app", "--host", "0.0.0.0", "--port", "5001", "--workers", "1"]
