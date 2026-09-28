# Testing

This document describes how changes are currently validated in Ananya.

## Required Quality Gates

Every pull request should pass the following commands.

```bash
pnpm check-types
pnpm lint
pnpm build
```

These verify:

- Type correctness
- Coding standards
- Successful production builds

## Current State

Automated testing is being introduced incrementally.

End-to-end checks that require an existing administrator account read credentials
from `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD`. Those authenticated checks are
skipped when the variables are not configured; they do not rely on a repository
account or a hard-coded password.

Until the testing infrastructure is established, the quality gates above are required for every change.

## Future Direction

This document will expand as the project grows to cover:

- Unit testing
- Integration testing
- End-to-end testing
- Test coverage
- Testing conventions

These sections will be documented when the corresponding tooling and workflows become part of the repository.
