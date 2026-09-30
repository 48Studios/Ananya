# Development

This section contains documentation for contributors developing and operating Ananya.

## Documents

### Setup

Prepare a local development environment.

→ [SETUP.md](SETUP.md)

---

### Local Development

Run the applications and supporting infrastructure locally.

→ [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)

---

### Testing Guide

Quality gates, validation commands, unit testing, and Playwright E2E suites.

→ [TESTING.md](TESTING.md)

---

### ML Operations

Operator control plane for model training, candidate evaluation, deployment, and rollback.

→ [ML_OPERATIONS.md](ML_OPERATIONS.md)

---

### Scanner App

Setup and testing guide for the standalone camera scanner PWA (`/scan`) and iOS requirements.

→ [SCANNER_APP.md](SCANNER_APP.md)

---

## Development Workflow

Before opening a pull request, ensure the repository passes all engineering quality gates.

```bash
pnpm check-types
pnpm lint
pnpm test
pnpm build
```

Then review:

- [Engineering Standards](../standards/ENGINEERING.md)
- [Pull Request Review Checklist](../standards/PR_REVIEW_CHECKLIST.md)
- [Contributing Guide](../../CONTRIBUTING.md)
