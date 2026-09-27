---
kind: frontend_style
name: Next.js + Tailwind CSS 4 + shadcn/ui Design System
category: frontend_style
scope:
    - '**'
source_files:
    - apps/web/package.json
    - apps/web/components.json
    - apps/web/app/globals.css
    - apps/web/postcss.config.mjs
    - apps/web/components/theme-provider.tsx
    - apps/web/components/ui/button.tsx
---

## What system/approach is used

The Ananya ERP web app (`apps/web`) is styled with **Tailwind CSS v4** (via `@tailwindcss/postcss`), the **shadcn/ui** component library, and a custom design-token layer built on CSS variables. The stack is:
- Next.js App Router (RSC) as the framework.
- Tailwind CSS 4 with PostCSS (`@tailwindcss/postcss` plugin).
- shadcn/ui configured via `components.json` using the `base-nova` style preset, Radix primitives under the hood, and Lucide icons.
- `class-variance-authority` (CVA) for variant-driven component styling, combined with `clsx` and `tailwind-merge` through a shared `cn()` utility in `@/lib/utils`.
- `next-themes` for light/dark mode toggling, driven by a `ThemeProvider` wrapper around `NextThemesProvider`.
- Base UI (`@base-ui/react`) provides low-level unstyled primitives (e.g., `Button`, `Dialog`) that shadcn components wrap.
- `tw-animate-css` supplies animation utilities.

There is no separate `tailwind.config.js`; Tailwind 4 uses CSS-based configuration via `@theme inline { ... }` blocks inside `globals.css`.

## Key files and packages

- `apps/web/package.json` — declares all frontend styling dependencies: `tailwindcss`, `@tailwindcss/postcss`, `shadcn`, `class-variance-authority`, `clsx`, `tailwind-merge`, `next-themes`, `@base-ui/react`, `lucide-react`, `tw-animate-css`.
- `apps/web/components.json` — shadcn/ui configuration: `style: "base-nova"`, RSC enabled, CSS variables enabled, base color `neutral`, icon library `lucide`, aliases mapping `@/components/ui` to the generated UI layer.
- `apps/web/app/globals.css` — single source of truth for design tokens. Imports Tailwind, tw-animate-css, and shadcn's CSS; defines a `@custom-variant dark` selector; maps semantic CSS variables (`--background`, `--primary`, `--sidebar-*`, `--chart-*`, `--radius*`) into Tailwind theme tokens via `@theme inline`; declares light and dark palettes under `:root` and `.dark`; includes global base styles, custom scrollbars, and comprehensive `@media print` rules.
- `apps/web/components/theme-provider.tsx` — thin client-side provider wrapping `NextThemesProvider` from `next-themes`.
- `apps/web/postcss.config.mjs` — registers only `@tailwindcss/postcss` as the PostCSS plugin.
- `apps/web/components/ui/*` — ~56 shadcn-generated React components (button, dialog, accordion, calendar, checkbox, tabs, select, etc.) that compose Radix/Base UI primitives with CVA variants and the `cn()` utility.

## Architecture and conventions

1. **Design tokens live in CSS variables.** All colors, radii, chart scales, sidebar tokens, and semantic roles (`--primary`, `--destructive`, `--muted`, `--card`, `--ring`, etc.) are declared as CSS custom properties under `:root` (light) and `.dark` (dark). These are then re-exported into Tailwind's theme namespace via an `@theme inline { --color-*, --radius-* }` block so they can be consumed as `bg-primary`, `text-muted-foreground`, `rounded-lg`, etc.
2. **Dark mode is class-based.** A `@custom-variant dark (&:is(.dark *))` rule lets Tailwind match the `.dark` class. The `ThemeProvider` from `next-themes` toggles this class at runtime, and a `prefers-color-scheme: dark` media query also applies the dark palette when the user has not explicitly set a theme.
3. **Components use CVA + cn pattern.** Every UI component in `components/ui/` defines a `cva(...)` variant map (e.g., `variant: default|outline|secondary|ghost|destructive|link`, `size: default|xs|sm|lg|icon|icon-xs|icon-sm|icon-lg`) and merges them with `cn(buttonVariants({ variant, size, className }))`. This keeps per-component style logic declarative and composable.
4. **Radix/Base UI primitives are wrapped.** Components import from `@base-ui/react` (or `@radix-ui/react-*`) and add shadcn semantics like `data-slot="..."` attributes (e.g., `data-slot="button"`, `data-slot="dialog-content"`) which are later targeted by global print and layout rules.
5. **Icons are uniformly sourced from Lucide.** The shadcn config sets `iconLibrary: "lucide"`, and components consume Lucide React icons consistently.
6. **Global base styles centralize cross-cutting concerns.** `globals.css` sets universal border/ring defaults, body background/foreground, button cursor behavior, custom scrollbar styling (webkit + Firefox), and extensive print styles that hide navigation/dialog chrome and reset modal constraints for label printing.
7. **No custom Tailwind config file.** Configuration is entirely CSS-based (Tailwind 4 approach): imports, `@theme inline`, `@custom-variant`, and `@layer base` rules replace the traditional `tailwind.config.js`.
8. **Print-first considerations.** The stylesheet includes dedicated `@media print` blocks that suppress application UI, reset dialog flex clamps so labels flow naturally across pages, and target `[data-slot="dialog-content"]` elements produced by shadcn dialogs — showing tight coupling between component markup and print behavior.

## Conventions and constraints

- **All visual tokens must go through CSS variables** defined in `app/globals.css`; ad-hoc hex values should be avoided in favor of semantic tokens like `bg-primary`, `text-muted-foreground`, or `border-border`.
- **New shadcn components are added via the shadcn CLI** (configured in `components.json`), which generates files into `components/ui/` following the established CVA + `cn()` + `data-slot` pattern.
- **Dark/light themes are toggled exclusively through the `next-themes` provider**; components must not manage theme state themselves.
- **Component variants are expressed with CVA**, not conditional class strings — new interactive components should define `variants` and `defaultVariants` in a `cva()` call.
- **Accessibility hooks into shadcn data attributes**: print rules and focus styles rely on `data-slot="..."` markers emitted by shadcn components, so adding new components should follow the same slot naming convention.
- **Responsive and motion styles use Tailwind utilities** exclusively; there is no separate CSS-in-JS or SCSS pipeline beyond what Tailwind 4 processes through PostCSS.