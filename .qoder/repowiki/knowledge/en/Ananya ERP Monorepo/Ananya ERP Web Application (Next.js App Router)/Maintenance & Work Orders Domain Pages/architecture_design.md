Three Next.js App Router route segments under `apps/web/app/`:
- `maintenance/page.tsx` — list + create page for `MaintenanceScheduleDto`, driven by `maintenanceApi.getAll/pause/resume/completeVisit`.
- `equipment/page.tsx` — thin redirect alias (`redirect("/maintenance")`) so `/equipment` resolves to the maintenance page.
- `work-orders/page.tsx` — list page for `WorkOrderDto` with parallel fetches of components, locations, and BOMs into lookup maps; uses `EntityDataTable` + `DialogShell` + `ConfirmDialog`.
- `work-orders/[id]/page.tsx` — detail page fetching a single work order plus material requirements, production timeline, and linked inventory transactions via `Promise.all` with `.catch(() => ...)` fallbacks.

Dependency direction is strictly one-way: pages depend on shared UI primitives (`@/components/ui/*`), domain form components (`@/components/maintenance/maintenance-form`, `@/components/work-orders/work-order-form`, `record-output-modal`, `record-scrap-modal`), and typed API clients in `@/lib/api/*`. No cross-page imports exist between these three route segments.