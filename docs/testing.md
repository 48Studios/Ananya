# Ananya ERP — Automated QA & E2E Testing Platform

This document describes the Playwright-based Quality Assurance and End-to-End testing architecture for the Ananya ERP platform.

---

## Architecture & Directory Structure

```
tests/
├── e2e/                     # Automated E2E spec suites
│   ├── authentication/      # Login, logout, password recovery tests
│   ├── onboarding/          # Setup wizard & user onboarding tests
│   ├── dashboard/           # Widget grid & view customization tests
│   ├── inventory/           # Components & stock transactions tests
│   ├── procurement/         # Purchase orders & goods receipt tests
│   ├── manufacturing/       # BOM & work order tests
│   ├── projects/            # Project allocations & material issue tests
│   ├── administration/     # System settings & RBAC matrix tests
│   ├── search/              # Command palette & global search tests
│   ├── notifications/       # Notification center tests
│   ├── attachments/         # Document & CAD viewer tests
│   ├── import-export/       # CSV wizard & template download tests
│   ├── workflows/           # Automation engine & trigger tests
│   └── visual-regression.spec.ts # Screenshot visual diff tests
├── page-objects/            # Page Object Model abstractions
│   ├── LoginPage.ts
│   ├── DashboardPage.ts
│   ├── ComponentsPage.ts
│   ├── SettingsPage.ts
│   └── NavigationPage.ts
├── fixtures/                # Test fixtures & console error listeners
│   └── test.fixture.ts
└── accessibility/           # axe-core WCAG 2.1 AA accessibility audits
    └── accessibility.spec.ts
```

---

## Running Tests Locally

```bash
# Run all Playwright E2E tests
pnpm test:e2e

# Run with interactive UI mode
pnpm test:e2e:ui

# Run in headed browser mode
pnpm test:e2e:headed

# Run in debug mode
pnpm test:e2e:debug

# Run accessibility audits only
pnpm test:accessibility

# Run visual regression tests
pnpm test:visual

# Run full QA quality gate pipeline (lint -> check-types -> unit tests -> build -> e2e)
pnpm qa
```

---

## Key Features

1. **Page Object Model**: Abstract UI locators into clean methods (`loginPage.login(...)`).
2. **Automatic Runtime Error Catching**: Tests fail immediately on uncaught JavaScript exceptions, `console.error()` outputs, or React hydration failures.
3. **Multi-Browser & Cross-Platform**: Configured for Chromium, Firefox, WebKit, Mobile Chrome (Pixel 5), and Mobile Safari (iPhone 12).
4. **WCAG 2.1 AA Compliance**: Automatic `axe-core` accessibility audits on core user flows.
5. **CI/CD Integration**: Emits JUnit XML reports (`playwright-report/results.xml`), HTML reports, videos, and screenshots on failure.
