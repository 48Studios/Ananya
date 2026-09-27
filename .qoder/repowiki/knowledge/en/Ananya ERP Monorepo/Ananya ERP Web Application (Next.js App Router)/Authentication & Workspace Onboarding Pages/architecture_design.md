Four Next.js Route Handlers under `apps/web/app/` each render a single client component (`"use client"`) and compose layout via shared UI primitives from `@/components/ui/*`.

- `login/page.tsx` — signs in via `useAuth().login`, resolves redirect through `postLoginDestination` (honoring `?from=` and `?expired=true` query params), then navigates to the destination.
- `forgot-password/page.tsx` — local-only form; submission flips a `submitted` flag and shows a confirmation banner (no API call from this page).
- `onboarding/page.tsx` — landing card routing users to `/onboarding/create` or `/onboarding/join`.
- `onboarding/create/page.tsx` — two-step wizard (admin account → org details) driven by local `step` state; final submit calls `authApi.setupOrganization` and redirects to `/dashboard`.
- `onboarding/join/page.tsx` — reads `?token` from search params, auto-validates via `authApi.verifyInvitation`, then accepts with `authApi.acceptInvitation`, persisting the returned token to both `localStorage` and a cookie before redirecting to `/dashboard`.

Dependency direction is one-way: pages depend on `@/lib/auth/auth-context` (for existing sessions), `@/lib/api/auth-api` (for setup/invitation mutations), and `@/lib/post-login-destination`; they do not export any reusable logic beyond their default page components.