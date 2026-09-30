# Testing Guide

This document describes the testing practices, quality gates, and automated test suites for the Ananya ERP platform.

---

## 1. Required Quality Gates

Every pull request must pass the following checks before merging:

```bash
pnpm check-types
pnpm lint
pnpm test
pnpm build
```

These commands verify:

- **Type correctness**: Zero TypeScript compiler errors across all apps and packages (`pnpm check-types`).
- **Coding standards**: Zero ESLint rule violations or syntax discrepancies (`pnpm lint`).
- **Unit and domain tests**: Domain rules and aggregate invariants pass (`pnpm test`).
- **Production build**: Successful compilation of Next.js web application, NestJS API, and shared packages (`pnpm build`).

To execute the entire quality gate pipeline locally:

```bash
pnpm qa
```

---

## 2. Automated QA & Playwright E2E Testing Platform

Ananya includes a comprehensive Playwright-based test suite covering UI flows, API interactions, accessibility, and visual regression.

### Test Directory Layout

```text
tests/
├── e2e/                          # Automated E2E spec suites
│   ├── authentication/           # Login, logout, password recovery tests
│   ├── onboarding/               # Setup wizard & organization onboarding tests
│   ├── dashboard/                # Widget grid & view customization tests
│   ├── inventory/                # Components & stock transactions tests
│   ├── procurement/              # Purchase orders & goods receipt tests
│   ├── manufacturing/            # BOM & work order tests
│   ├── projects/                 # Project allocations & material issue tests
│   ├── administration/          # System settings & RBAC matrix tests
│   ├── search/                   # Command palette & global search tests
│   ├── notifications/            # Notification center tests
│   ├── attachments/              # Document & CAD viewer tests
│   ├── import-export/            # CSV wizard & template download tests
│   ├── workflows/                # Automation engine & trigger tests
│   └── visual-regression.spec.ts # Screenshot visual diff tests
├── page-objects/                 # Page Object Model abstractions
│   ├── LoginPage.ts
│   ├── DashboardPage.ts
│   ├── ComponentsPage.ts
│   ├── SettingsPage.ts
│   └── NavigationPage.ts
├── fixtures/                     # Test fixtures & console error listeners
│   └── test.fixture.ts
└── accessibility/                # axe-core WCAG 2.1 AA accessibility audits
    └── accessibility.spec.ts
```

### Running E2E Tests Locally

```bash
# Run all Playwright E2E tests
pnpm test:e2e

# Run with interactive UI mode
pnpm test:e2e:ui

# Run in headed browser mode
pnpm test:e2e:headed

# Run in debug mode
pnpm test:e2e:debug

# Run accessibility audits only (axe-core WCAG 2.1 AA)
pnpm test:accessibility

# Run visual regression tests
pnpm test:visual

# Update visual regression baselines
pnpm test:e2e:update-snapshots
```

### E2E Test Credentials & Environment

End-to-end checks that require an existing administrator account read credentials from `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD`. Those authenticated checks are skipped when the variables are not configured; they do not rely on a repository account or a hard-coded password.

---

## 3. Testing Principles & Best Practices

1. **Page Object Model**: Abstract UI locators into clean methods (`loginPage.login(...)`) to prevent brittle test code.
2. **Automatic Runtime Error Catching**: Tests fail immediately on uncaught JavaScript exceptions, `console.error()` outputs, or React hydration failures.
3. **Multi-Browser & Cross-Platform**: Configured for Chromium, Firefox, WebKit, Mobile Chrome (Pixel 5), and Mobile Safari (iPhone 12).
4. **WCAG 2.1 AA Compliance**: Automatic `axe-core` accessibility audits on core user flows.
5. **CI/CD Integration**: Emits JUnit XML reports (`playwright-report/results.xml`), HTML reports, videos, and screenshots on failure.
6. **Domain Test Independence**: Unit tests for `@ananya/inventory` and other domain packages test business rules directly on aggregates without mocking databases or spawning HTTP servers.
