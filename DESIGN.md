# Visual Design Language

## Canonical Reference

The visual language of Ananya is based on the ShadcnSpace Dashboard.

Reference:

https://dashboard.shadcnspace.com/

This dashboard is **not copied**, but serves as the benchmark for:

- Layout
- Spacing
- Typography
- Component composition
- Navigation
- Tables
- Cards
- Dashboard structure
- Light & Dark mode
- Overall visual polish

When making UI decisions, prefer the visual language of the reference dashboard over legacy Ananya UI.

---

# Design Philosophy

Ananya is an enterprise ERP.

The interface should disappear behind the user's work.

The design should never compete with the content.

Every screen should feel:

- Calm
- Modern
- Minimal
- Spacious
- Professional
- Predictable

Users should immediately understand where to look without visual clutter.

---

# Core Principles

## Content First

The application exists to display information.

Decorative elements should be minimized.

The user's data should always be the primary focus.

---

## Whitespace Creates Hierarchy

Prefer spacing over borders.

Prefer margins over separators.

Prefer layout over decoration.

Whitespace is a design element.

Never compress content to fit more on screen.

---

## Consistency Before Creativity

Every page should feel like it belongs to the same product.

Avoid page-specific visual experiments.

Use the same spacing, typography, and layout patterns throughout the application.

---

## Minimal Chrome

Navigation, headers, borders, and containers exist only to support the content.

Avoid large visual blocks.

Avoid unnecessary decoration.

The interface should feel lightweight.

---

# Layout Language

The application uses a single application shell.

```

DashboardLayout

├── Sidebar
├── Header
├── Content
└── Footer

```

Every page inherits this layout.

No feature may create its own shell.

---

# Dashboard Composition

Pages should be composed using responsive grids rather than vertical stacks.

Example layout:

```

KPI Cards
Chart + Metrics
Secondary Widgets
Activity
Tables

```

Avoid placing every section below the previous one.

Build pages horizontally where appropriate.

---

# Cards

Cards are quiet containers.

Cards should:

- use soft borders
- have generous padding
- avoid heavy shadows
- avoid thick outlines
- provide breathing room

Cards should never become the visual focus.

The content inside the card is the focus.

---

# Visual Weight

Reduce visual noise.

Avoid:

- thick borders
- large dark panels
- oversized containers
- unnecessary separators
- excessive shadows
- multiple competing accent colors

Prefer:

- thin borders
- subtle elevation
- whitespace
- alignment
- typography

---

# Typography

Typography establishes hierarchy.

Not decoration.

Hierarchy should follow:

Page Title

↓

Section Title

↓

Card Title

↓

Body

↓

Muted Supporting Text

Avoid excessive font sizes.

Prefer consistent weights:

400

500

600

700

Do not use typography purely for emphasis.

---

# Color Philosophy

The interface should remain largely neutral.

Use color intentionally.

Accent colors should indicate:

- Actions
- Status
- Notifications
- Charts
- Validation
- Alerts

Avoid colorful interfaces.

Most of the application should use neutral surfaces.

---

# Light & Dark Mode

Light mode and dark mode are equal citizens.

Dark mode is **not** an inverted light theme.

Both themes should feel intentionally designed.

Both should use:

- layered surfaces
- comfortable contrast
- semantic colors
- identical spacing
- identical hierarchy

---

# Sidebar

The sidebar is the application's backbone.

Characteristics:

- Compact
- Clean
- Icon driven
- Text first
- Nested navigation
- Persistent collapse state
- Active page indicators
- Responsive drawer on mobile

The sidebar should feel quiet rather than dominant.

---

# Header

The header should be visually lightweight.

Contains only:

- Breadcrumb
- Search
- Notifications
- Theme Toggle
- User Menu

Do not place large page titles inside the header.

---

# Tables

Tables are one of the most important components.

They should resemble modern SaaS dashboards rather than spreadsheets.

Characteristics:

- Comfortable row height
- Clear typography
- Minimal borders
- Soft separators
- Responsive layout
- Search
- Filters
- Pagination
- Sorting
- Column visibility
- Empty states
- Skeleton loading

Rows should never appear cramped.

Avoid heavy grid lines.

---

# Forms

Forms should feel lightweight.

Requirements:

- consistent spacing
- aligned labels
- predictable validation
- comfortable field height
- logical grouping

Users should immediately understand the form structure.

---

# Dashboard Widgets

Dashboard widgets should be small, reusable components.

Examples:

- KPI Card
- Stat Card
- Activity Feed
- Chart Card
- Recent Transactions
- Quick Actions
- Metric Summary
- Status Distribution
- Recent Alerts

Avoid creating large page-specific widgets.

---

# Information Density

Enterprise applications contain large amounts of information.

Use layout and whitespace to organize information rather than reducing content.

The goal is high information density with low cognitive load.

---

# Micro Components

Prefer reusable building blocks.

Examples:

- Status Badge
- Avatar Group
- Metric Tile
- Progress Indicator
- Toolbar
- Search Bar
- Filter Bar
- Empty State
- Loading State

Build pages by composing these primitives.

---

# Motion

Motion should communicate interaction.

Animations should be:

- subtle
- short
- purposeful

Avoid decorative animations.

---

# Accessibility

Accessibility is part of the design language.

Every interaction must support:

- Keyboard navigation
- Focus indicators
- Screen readers
- WCAG AA contrast
- Reduced motion

---

# Component Rules

If shadcn/ui provides the component:

Use it.

Do not recreate it.

Compose existing primitives before creating new abstractions.

---

# AI Design Rules

Before implementing any UI:

1. Read this document.
2. Review the ShadcnSpace dashboard.
3. Match its spacing and layout philosophy.
4. Prefer whitespace over borders.
5. Prefer typography over decoration.
6. Prefer composition over custom components.
7. Reuse before creating.
8. Every new page must visually fit beside every existing page.
9. If a page looks visually heavier than the reference dashboard, simplify it.
10. If uncertain, choose the solution that is cleaner, quieter, and more consistent.

---

# Definition of Done

A UI implementation is complete only when:

- The page immediately feels like part of the same product.
- Visual weight is low.
- Information hierarchy is obvious.
- Components are reused.
- Tables feel like modern SaaS dashboards.
- Forms are clean and predictable.
- Light mode is polished.
- Dark mode is polished.
- The page could reasonably exist alongside the ShadcnSpace dashboard without feeling out of place.