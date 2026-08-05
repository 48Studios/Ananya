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

# Canonical Status System & Indicators

Every status badge in Ananya ERP must use the shared `<StatusBadge />` primitive ([status-badge.tsx](file:///Users/jrsarath/Documents/GitHub/ananya/apps/web/components/ui/status-badge.tsx)) with standard `w-3 h-3` icons, semantic HSL colors, and font-mono styling:

- **Success (`ACTIVE`, `COMPLETED`, `SUCCESS`, `FULFILLED`, `APPROVED`, `RESOLVED`, `CREDITED`)**: Emerald background (`bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20`), `<CheckCircle2 className="w-3 h-3" />`.
- **Warning (`PENDING`, `IN_REVIEW`, `ON_HOLD`, `PAUSED`, `OVERDUE`, `SHORTAGE`)**: Amber background (`bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20`), `<Clock className="w-3 h-3" />` / `<Pause className="w-3 h-3" />`.
- **Error (`REJECTED`, `CANCELLED`, `FAILED`, `BLOCKED`, `UNPAID`)**: Destructive background (`bg-destructive/10 text-destructive border-destructive/20`), `<XCircle className="w-3 h-3" />`.
- **Info (`SCHEDULED`, `SUBMITTED`, `OPEN`, `IN_PROGRESS`, `ISSUED`, `DISPATCHED`)**: Blue background (`bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20`), `<Clock className="w-3 h-3" />` / `<RefreshCw className="w-3 h-3" />`.
- **Draft / Neutral (`DRAFT`, `INACTIVE`, `ARCHIVED`)**: Slate background (`bg-muted text-muted-foreground border-border`), `<FileText className="w-3 h-3" />` / `<Archive className="w-3 h-3" />`.

---

# Form Architecture & Spacing Standards

All forms, dialogs, drawers, and setup wizards must adhere to standard form spacing scale:
- **Control Height**: `h-9` (`36px`) for standard controls; `h-8` (`32px`) for small; `h-10` (`40px`) for large input fields.
- **Label → Input Spacing**: `mb-1.5` (`6px`)
- **Input → Help Text Spacing**: `mt-1.5` (`6px`)
- **Validation Error Message**: `mt-1 text-[11px] text-destructive` (`4px`)
- **Field → Field Spacing**: `space-y-4` (`16px`)
- **Section Spacing**: `space-y-6` (`24px`)

---

# Organization Setup & Initial Administrator

During organization setup:
- Organization Name is required.
- Optional fields (`legalName`, `supportPhone`, `address`, `website`, `country`, `primaryTimezone`, `baseCurrency`, `taxId`) persist `null`/empty values when omitted.
- The initial root administrator created during setup automatically receives the system `Admin` role (`eq(roles.name, 'Admin')`) with full administrative privileges.

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

---

# Design Token System & Brand Specifications

## Primary Brand Color

The official primary brand color for Ananya ERP is **Dodger Blue**:

- **Hex**: `#1E90FF`
- **HSL**: `hsl(210, 100%, 56%)`

Dodger Blue is the canonical primary accent used consistently across both Light and Dark themes for:
- Primary actions & buttons
- Active navigation items & rail indicators
- Focus rings & keyboard focus outlines
- Interactive selections, switches, radio buttons, and checkboxes
- Analytics chart highlights
- Command palette selection states

---

## Semantic Theme Tokens

All UI components derive colors strictly from semantic CSS tokens defined in `apps/web/app/globals.css`:

| Token | Light Theme | Dark Theme | Purpose |
| :--- | :--- | :--- | :--- |
| `--primary` | `#1E90FF` | `#1E90FF` | Primary brand color (Dodger Blue) |
| `--primary-foreground` | `#FFFFFF` | `#FFFFFF` | Text on primary brand backgrounds |
| `--secondary` | `#F1F5F9` | `#2D2D2D` | Muted background actions |
| `--secondary-foreground` | `#0F172A` | `#FFFFFF` | Text on secondary backgrounds |
| `--muted` | `#CBD5E1` | `#404040` | Secondary backgrounds & scrollbars |
| `--muted-foreground` | `#64748b` | `#A0A0A0` | Subtitles, captions, disabled text |
| `--accent` | `#1E90FF` | `#1E90FF` | Interactive highlights & hover states |
| `--accent-foreground` | `#FFFFFF` | `#FFFFFF` | Text on accent backgrounds |
| `--destructive` | `#DC2626` | `#FF4444` | High-risk/delete actions & alerts |
| `--border` | `#E2E8F0` | `#2D2D2D` | Divider and card border lines |
| `--input` | `#F1F5F9` | `#2D2D2D` | Form input backgrounds |
| `--ring` | `#1E90FF` | `#1E90FF` | Focus rings & active selection borders |
| `--sidebar` | `#FFFFFF` | `#0D0D0D` | Application navigation container |
| `--sidebar-primary` | `#1E90FF` | `#1E90FF` | Active rail item & sidebar selection |

---

## Standardized Control & Button Dimensions

Every interactive control follows standard desktop ERP dimensions for a comfortable, confident click target:

- **Button Scale**:
  - `default`: Height `36px` (`h-9`), Horizontal Padding `14px` (`px-3.5`), Gap `8px` (`gap-2`), Typography `text-xs font-medium`.
  - `sm`: Height `32px` (`h-8`), Horizontal Padding `12px` (`px-3`), Gap `6px` (`gap-1.5`), Typography `text-xs`.
  - `lg`: Height `40px` (`h-10`), Horizontal Padding `16px` (`px-4`), Gap `8px` (`gap-2`), Typography `text-sm font-semibold`.
  - `icon-sm`: Square `32px x 32px` (`size-8`), Icon `14px` (`size-3.5`).
  - `icon` (default): Square `36px x 36px` (`size-9`), Icon `16px` (`size-4`).
  - `icon-lg`: Square `40px x 40px` (`size-10`), Icon `18px` (`size-4.5`).

- **Form Control Scale**:
  - Inputs, Selects, Comboboxes, and Switches match button height scale (`36px` default height) to achieve visual balance in toolbar rows and form layouts.

---

# Component Rules

If shadcn/ui provides the component:

Use it.

Do not recreate it.

Compose existing primitives before creating new abstractions.

Vendor files and third-party primitives remain untouched.

---

# Definition of Done

A UI implementation is complete only when:

- Dodger Blue (`#1E90FF`) is used as the single primary brand color across Light and Dark themes.
- Visual weight is low and information hierarchy is obvious.
- Button sizes are comfortable, standardized, and visually balanced with form controls.
- Light and Dark modes are fully polished and tokenized.
- The page could reasonably exist alongside the ShadcnSpace dashboard without feeling out of place.