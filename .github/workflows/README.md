# GitHub Actions Workflows

## Entry points

| Workflow                      | Trigger                                                                | Purpose                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `ci.yml`                      | `push` to `main` / `release/*`, `pull_request`                          | Pull request gate and main branch validation.                                                              |
| `docker.yml`                  | `workflow_run` after a successful `Continuous Integration` run on `main` | Smoke tests the production compose stack, then publishes `edge` / `sha-*` images to GHCR.                   |
| `release.yml`                 | `push` of a `v*` tag                                                    | Quality gates, smoke test, semver image publishing (`latest`, `x.y.z`, `x.y`, channels) and GitHub Release. |

## Reusable building blocks

Files prefixed with `_` are only invoked through `workflow_call`; they never trigger on their own.

| Workflow                | Called by                   | Contents                                                             |
| ----------------------- | --------------------------- | -------------------------------------------------------------------- |
| `_quality-gates.yml`    | `ci.yml`, `release.yml`     | install, lint, `check-types`, test, production build                  |
| `_docker-smoke-test.yml` | `docker.yml`, `release.yml` | compose stack boot, migrations, container state and health assertions |

## Rules that keep this working

- `docker.yml` matches `ci.yml` **by workflow name** (`Continuous Integration`). Renaming `ci.yml` silently stops image publishing from `main`.
- Job names are the status checks reported on pull requests. Renaming `Monorepo Quality Gates` breaks any branch protection configured against it.
- Reusable workflows must not declare `concurrency`: inside a called workflow `github.workflow` resolves to the caller, so an identical group would cancel the caller mid-run.
- `packages: write` is granted per job, only where images are pushed.
- Images are built inside Docker, so the smoke test needs no Node/pnpm setup on the runner.
- `_docker-smoke-test.yml` covers the ML container only when `verify_ml: true` (`docker.yml`); `release.yml` boots the `worker` profile only.

## Adding a new image service

Add the service to the matrix in **both** `docker.yml` and `release.yml`. The two matrices are intentionally not shared: continuous integration builds use rolling `edge` tags, releases use explicit version tags.
