# ML Operations — Training, Evaluation & Deployment Control Plane

**ML & Intelligence** (`/intelligence`) is the operator surface for the
machine-learning service. It reports what the existing pipeline produced and lets an
authorised operator trigger training, inspect a candidate and promote it explicitly.
It does not reimplement training, and it does not change any intelligence behaviour.

It is reached from the **Administration** module in the sidebar (Administrator-only),
and is deliberately not nested under `/settings`: it is an operational control plane
for a running service, not configuration.

---

## 1. What runs where

```
Browser (administrator session)
   ↓  authenticated HTTP  /ml/ops/*
NestJS API  (apps/api)                    ← authorisation, durable run record, audit
   ↓  internal HTTP  /v1/training/*, /v1/models/*, /v1/datasets/current
ML service  (apps/ml, FastAPI)            ← executes the pipeline on a background thread
   ↓  existing modules, unchanged
apps/ml/pipeline/*  →  apps/ml/data/*  →  apps/ml/models/registry/v{version}/*
```

**The pipeline executes in the ML service, not in the API.** Three reasons, all
verified from the repository:

1. The pipeline reads and writes `apps/ml/data/*` and `apps/ml/models/registry/*`.
   Those directories exist in the ML container and **not** in the API container
   (the API image is built from the `@ananya/api` turbo scope).
2. Executing Python from a NestJS request handler would put training in the request
   path, which is exactly what the control plane must avoid.
3. The ML process is the only thing that can hold the model in memory, so it is the
   only place a deployment can be reflected in a *running* model.

The API remains the authority for **who may do it** and for **what happened**: the
run record lives in PostgreSQL, and every mutation is written to the security audit
log by the API, not by the ML service.

### Asynchronous by construction

`POST /ml/ops/training-runs` inserts a `QUEUED` row, asks the ML service to start the
job, and returns the run id. The job runs on a background thread in the ML service,
so a closed browser tab, a dropped connection or a restarted API cannot stop it. The
dashboard polls the API while a run is active and stops the moment the run is
terminal.

### Cancellation is not offered

A running job is a Python thread inside the ML service. It cannot be interrupted
safely mid-fit without killing the process, so `cancellable` is always `false` and
the dashboard shows **no cancel control** — it says why instead. Cancelling a queued
run that never started is the only case that would be safe, and that window is
sub-millisecond, so no control is exposed for it either.

---

## 2. Training lifecycle

| State | Meaning |
| --- | --- |
| `QUEUED` | The row exists; the ML service has been asked to start the job. |
| `RUNNING` | Collect → validate → build dataset → train. |
| `EVALUATING` | The evaluator is running the quality gates against the active model. |
| `PASSED` | Every mandatory gate passed. The candidate is deployable, and nothing has been deployed. |
| `REJECTED` | A gate failed. The candidate is not deployable. |
| `FAILED` | The run stopped with a stable `error_code`. |
| `CANCELLED` | Reserved for a run that never started. |

Phases reported to the UI are the pipeline's own boundaries — `PREPARING_DATASET`,
`TRAINING`, `EVALUATING`, `PACKAGING`, `COMPLETED`. **There is no percentage
anywhere**: the pipeline reports steps, not fractions of work, and the dashboard
never invents one.

### Error codes

`DATASET_BUILD_FAILED`, `TRAINING_FAILED`, `EVALUATION_FAILED`, `PACKAGING_FAILED`,
`INTERNAL_ERROR` are emitted by the runner. `ML_UNAVAILABLE`, `ML_DISABLED`,
`ML_BUSY`, `ML_JOB_LOST`, `DISPATCH_FAILED` are observed by the API.

`ML_JOB_LOST` is reported when the ML service no longer knows a run the API still
believes is active — its process restarted. The run is closed as `FAILED` rather
than left "running" forever, because a candidate whose gates cannot be proven must
not look deployable.

---

## 3. Dataset snapshot

`build_dataset_snapshot` (existing, unchanged) writes
`apps/ml/data/datasets/{datasetVersion}/` containing `train.json`, `val.json`,
`duplicate_pairs.json` and `metadata.json`. Each run allocates its own model version
(`next_candidate_version()` = highest registry version + 1 patch), and the dataset
version embeds it (`components-YYYY-MM-DD-vX.Y.Z`), so every run gets a distinct
snapshot.

The dashboard reports:

- **version**, **generated at**, **total records**, **validated**, **quarantined**,
  **training records**, **evaluation records**, **expanded examples**, **distinct MPN
  families**, **duplicate pairs**, and the **zero-leakage verification** flag — all
  read from the snapshot's own `metadata.json`;
- a **snapshot fingerprint**: `sha256` over `metadata.json`, `train.json` and
  `val.json` in a fixed order, so "which data trained this model" is reproducible
  rather than merely dated;
- **quality counts** (duplicates, conflicting labels, missing required fields,
  quarantine total and per-reason counts, category and manufacturer distributions)
  computed from the validator's own output — `validated_records.json` and
  `quarantine.json`;
- **freshness**: snapshot age and how many feedback rows have been recorded since the
  last successful training run.

Only measures the pipeline actually produces are shown. Anything absent renders
**"Not available"**, and a missing `quarantine.json` reports `null` rather than a
zero that would read as "nothing was quarantined".

---

## 4. Model management

### Versions and the registry

`apps/ml/models/registry/v{version}/` holds `category_classifier.pkl`,
`metadata.json` (train.py), `evaluation_report.json` (evaluate.py) and
`pipeline_summary.json`. The dashboard reads all of it read-only and reports version,
training timestamp, champion architecture, evaluation metrics, gate verdicts,
deployability and the artifact checksum. **No filesystem path is ever returned** —
the registry reader strips `validationSource`, resolves versions by checksum, and
rejects anything that is not a timestamp in a timestamp field.

### Artifact deployed vs running model

This is the distinction the dashboard exists to make honest. `deploy.py` copies the
candidate over `apps/ml/models/category_classifier.pkl`; the ML process loads the
artifact once at startup, so **copying a file does not change the running model**.

- `production.artifactVersion` — the version whose artifact checksum matches the file
  on disk (resolved by checksum, not by trusting `model_metadata.json`, which the
  promotion tool does not rewrite on rollback).
- `running.version` — the version the ML process is serving, from the artifact
  identity it recorded when it loaded.
- `reloadPending` — true when those two differ.

After a deployment the ML service **reloads the classifier in place**
(`CategoryClassifierService.reload()`): the new artifact is fully parsed before the
reference is swapped, so a corrupt or missing file leaves the previous model serving
traffic, and a request sees either the old pipeline or the new one — never a
half-loaded one. If the reload fails, the deployment is recorded as
`DEPLOYED_PENDING_RELOAD` and the dashboard says the ML service is *still serving
vN*. `POST /ml/ops/models/reload` retries the reload without restarting the
container. A reload writes nothing and changes no version.

### Rollback

`deploy.py` already keeps `category_classifier.pkl.backup` and implements the
restore, so rollback is exposed rather than invented: `POST /ml/ops/models/rollback`
calls that same tool. It is refused with `NO_ROLLBACK_ARTIFACT` when no backup
exists, and every rollback is recorded in `ml_model_deployments` as a `ROLLBACK`
entry naming what was running before and after.

`deploy.py` does not rewrite `model_metadata.json` on rollback, so the metadata's
`activeVersion` can name the version that was just replaced. The dashboard reports the
**checksum-derived** version and surfaces the divergence
(`deploymentMetadataStale`) instead of repeating the stale claim.

---

## 5. Evaluation gates

Unchanged, from `apps/ml/pipeline/evaluate.py`:

| Gate | Rule |
| --- | --- |
| `accuracy_gate` | Top-1 ≥ 70% and no more than 5 points below the active model |
| `duplicate_precision_gate` | Precision ≥ 95% with zero critical false merges |
| `duplicate_recall_gate` | Recall ≥ 95% |
| `latency_gate` | P95 inference latency ≤ 5 ms |
| `memory_gate` | Peak memory ≤ 256 MB |
| `provenance_gate` | Zero records with unverified provenance |

The dashboard shows each verdict with its threshold, and states plainly when a run
produced no gate verdicts at all. There is no overall model score.

**One pre-existing crash was fixed to make evaluation reachable at all.**
`evaluate.py` called `res.manufacturer.lower()` on the manufacturer resolver's
result, which is `Optional` — the resolver legitimately reports no manufacturer for
an ambiguous or unresolved part number, so a single unresolvable test case aborted
the whole evaluation with an `AttributeError` and no gate was ever reported. An
unresolved manufacturer is now counted as a miss, which is what it was before the
crash became reachable; no threshold and no metric definition changed.

---

## 6. Permissions

| Operation | Route | Guard |
| --- | --- | --- |
| Health, overview, models, datasets, usage, run list/detail | `GET /ml/ops/*` | `MlAdminGuard` |
| Trigger training | `POST /ml/ops/training-runs` | `MlAdminGuard` |
| Deploy candidate | `POST /ml/ops/training-runs/:id/deploy` | `MlAdminGuard` |
| Rollback | `POST /ml/ops/models/rollback` | `MlAdminGuard` |
| Reload running model | `POST /ml/ops/models/reload` | `MlAdminGuard` |

`MlAdminGuard` = **`Administration.Roles`**, the same administrator-only boundary the
ML training surface already uses for `GET /ml/feedback/export` and the quarantine
review routes. It is held by no system role except `Administrator` (via `*`), so it
fails closed.

Deliberately **not** used:

- `Inventory.Update` — held by `Inventory Manager`, which legitimately edits master
  data. Promoting a model changes the behaviour of the intelligence that advises
  every future edit; that is a different capability.
- `Administration.Security` — held by the read-only `Auditor` role, so it would hand
  model promotion to auditors.

Reads are administrator-only too: the registry listing, dataset counts and quarantine
breakdown are operational detail about the model, and the page that consumes them is
already behind an administrator permission.

**A dedicated `Administration.ML` permission is deferred, not rejected.** It would be
more precise, but it does not exist in the catalogue and adding one requires revisiting
every role definition (`SYSTEM_ROLE_PERMISSIONS` + `ensureSystemRoles`, which only
inserts a system role when it is absent, so existing installations would keep the old
grants). That is a role-model decision, recorded here rather than taken unilaterally.

### Actor identity

Every mutation derives the actor from the authenticated session (`req.user`).
No request body carries an actor id or email, and the global `forbidNonWhitelisted`
pipe rejects one with a 400. The trigger route additionally asserts that the body is
empty before the service is called.

### Audit

`ML_TRAINING_TRIGGERED`, `ML_CANDIDATE_DEPLOYED`, `ML_MODEL_ROLLED_BACK`,
`ML_MODEL_RELOADED`, written through the existing `SecurityAuditService` with the
existing `Inventory` category. No parallel audit system. Audit writes are
post-commit and failure-tolerant, matching the existing ML apply services.

### Service-to-service authentication — existing debt

The API → ML hop (`/v1/training/*`, `/v1/models/*`) has **no authentication today**.
This is pre-existing: `MlClientService` already calls `/v1/suggest`,
`/v1/extract/datasheet` and the attribute routes the same way. Consequences and
mitigations:

- no privileged ML control route is reachable from a browser — every one of them sits
  behind the authenticated NestJS API;
- the ML service is only published on the internal compose network
  (`ananya_internal`), so the exposure is a caller that already has network access to
  the ML container;
- the ML service enforces its own invariants independently of the API (one active run,
  no promotion during a run, gates checked before promotion, no rollback without a
  backup), so a forged internal call cannot corrupt production silently.

Closing this properly needs a service credential — out of scope for this pass and
recorded as debt rather than papered over.

---

## 7. Failure behaviour

| Failure | Effect on production |
| --- | --- |
| Dataset build fails | Unchanged. The run is `FAILED` with `DATASET_BUILD_FAILED`. |
| Training fails | Unchanged. `TRAINING_FAILED`. |
| Evaluation fails | Unchanged. `EVALUATION_FAILED`; no candidate is deployable. |
| Gates reject the candidate | Unchanged. The run is `REJECTED` and the API refuses deployment on its own stored evidence. |
| Dispatch fails | Unchanged. The row is stored as `FAILED` / `DISPATCH_FAILED` so the attempt is visible. |
| Deployment fails | The known-good production artifact is unchanged; the run is marked `DEPLOYMENT_FAILED` and no deployment row is written. |
| Reload fails | The artifact is deployed but the running model is not updated; the deployment is `DEPLOYED_PENDING_RELOAD` and the dashboard says so. |

`auto_deploy` is `False` by construction in the runner, so a run cannot promote a
model even if the pipeline's own default would have.

---

## 8. Database

Two narrowly scoped tables, migration `0016_curly_black_knight.sql` (additive only):

**`ml_training_runs`** — the durable run record: status, actor, timestamps, base and
candidate versions, training-code version, dataset version/fingerprint and counts,
evaluation summary, gate summary, stable error code and message, a bounded log
excerpt, the registry artifact reference, and deployment status.

A **partial unique index on a constant expression** where the status is active makes
"at most one run in flight" a database invariant rather than a service-side check that
two API replicas could both pass. A concurrent trigger therefore fails with a unique
violation, which the API translates into a 409.

**`ml_model_deployments`** — the deployment history the pipeline's single
`model_metadata.json` cannot express: which version, what it replaced, whether it came
from a candidate or a rollback, the artifact checksum, the running model version after
it, whether a reload is pending, and who did it.

No binaries, no raw pipeline output, no secrets and no filesystem paths are stored.
`logExcerpt` is capped at 40 lines / 4000 characters by the runner and capped again on
the way into the column.

---

## 9. Tests

```bash
# ML runner + registry (pytest)
.venv/bin/python -m pytest apps/ml/tests/ -q

# API HTTP-level integration (needs DATABASE_URL from the root .env)
cd apps/api && set -a; source ../../.env; set +a
npx jest --config test/jest-e2e.json --runInBand test/integration/ml-ops.integration-spec.ts

# Web presentation logic
pnpm --filter @ananya/web test
```

The integration suite proves, at the HTTP boundary: anonymous 401 on every route;
403 for an `Inventory Manager` on reads and writes alike; 400 for a spoofed actor;
one active run (service check *and* database index); 503 with no row created when ML
is unreachable; `DISPATCH_FAILED` when the job cannot start; terminal state stored on
poll and **no further polling** afterwards; `ML_JOB_LOST` for a run the ML service
forgot; a run left active when ML is merely unreachable; history pagination and
filters; dataset summary shape including the `null`-not-zero quarantine case;
deployment refused for active, failed, rejected, gate-less and already-deployed runs;
a passing candidate promoted with its deployment row and audit entry; reload-pending
reported as such; deployment failure marked on the run with no deployment row;
rollback refused without a backup and recorded with a `ROLLBACK` entry when performed;
server-side usage aggregation; and overview composition.

---

## 10. Known limitations

**Release blockers:** none.

**Acceptable debt (documented, not hidden):**

- No service-to-service authentication between the API and the ML service (§6).
- A dedicated `Administration.ML` permission is deferred; the administrator-only
  proxy is used instead (§6).
- Training state and the model registry are container-local files. The ML container
  has no volume for `apps/ml/data` or `apps/ml/models/registry`, so candidates and
  dataset snapshots do not survive a container replacement. The *durable* record of
  what happened is in PostgreSQL; the artifacts themselves are not.
- The runner's in-memory job registry is per-process. An ML restart mid-run surfaces
  as `ML_JOB_LOST` rather than resuming.
- Rollback is one level deep, because that is what `deploy.py` keeps.

**Future improvements:**

- A volume (or object store) for `apps/ml/models/registry` and `apps/ml/data`, so
  candidates survive a redeploy.
- Service credentials for the API → ML hop.
- `Administration.ML` as a first-class permission once the role model is revisited.
- Safe cancellation for a *queued* run, if a queue with a real pending state is ever
  introduced.
