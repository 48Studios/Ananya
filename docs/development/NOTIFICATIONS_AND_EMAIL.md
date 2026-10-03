# Inventory Alerts & Email

How Ananya detects low stock, notifies people, and delivers alert email.

---

## 1. Alert types and trigger semantics

Two alert types are supported. Both are company-wide: on-hand is the sum of every
location projection and available subtracts active reservations, because the product
configures one reorder point rather than per-location thresholds.

| Alert | Condition | Notes |
| --- | --- | --- |
| `OUT_OF_STOCK` | on-hand ≤ 0 | Applies to any component that has been stocked. |
| `LOW_STOCK` | on-hand > 0 and available ≤ reorder point | `available = max(0, on-hand − active reserved)`. |

Deliberate rules:

- The boundary is inclusive (`≤`): a component exactly at its reorder point alerts.
- Components that have never been stocked (no projection rows and no active alert) are
  not evaluated, so an empty catalog does not produce one alert per component.
- Inactive and consolidated components are never evaluated, and an open alert on a
  component that leaves that scope (deactivated, or retired by component consolidation)
  is closed by the next evaluation — without a recovery notification, because the
  component is no longer part of stock planning. Without that sweep the alert would stay
  `ACTIVE` forever, since nothing evaluates such a component again.
- A reorder point of `0` disables `LOW_STOCK`; `OUT_OF_STOCK` still applies.
- A reorder point that is missing from system settings falls back to `10`.

Alert state lives in `inventory_alerts`. A partial unique index on
`(component_id, alert_type) WHERE status = 'ACTIVE'` makes the state race-safe: at most
one open alert per condition, and a resolved row no longer blocks the next breach.

## 2. When evaluation runs

| Trigger | Where |
| --- | --- |
| Every stock-changing operation | `InventoryProjectionsService.rebuild()` calls the alert engine after rebuilding projections. Receipts, issues, consumption, adjustments, transfers, returns, production, fulfillment, cycle counts and stock counts all rebuild. |
| Opening-inventory imports | `ImportExportService.executeImport` writes `InitialStock` ledger rows and rebuilds projections afterwards, so imported balances become stock and are evaluated. |
| Reservation changes | `ReservationsService` re-evaluates after create/update/fulfill/release/cancel/delete, because reservations change available stock without changing projections. |
| Reorder threshold edits | `SettingsService.updateSystemSettings` re-evaluates when `reorderDefaultsJson` is part of the update. |
| Scheduled reconciliation | `InventoryAlertScheduler` re-evaluates every `INVENTORY_ALERT_INTERVAL_MS` (default 5 minutes). Catches missed events and failed inline evaluations. |
| Manual | `POST /inventory-alerts/evaluate` (requires `Administration.Settings`). |

Evaluation failures never fail the operation that triggered them: they are logged and the
scheduler retries.

## 3. Recipients and notifications

Recipients are active users whose role (primary or secondary) includes `Inventory.Read`
or `*`. For each activation Ananya:

1. opens or updates the alert row,
2. creates one in-app notification per recipient (`LOW_STOCK`, `OUT_OF_STOCK`, or
   `STOCK_RECOVERED`), and
3. queues one alert email per recipient whose notification preferences allow it
   (`emailEnabled`, the `Inventory` category, and quiet hours are respected).

Notifications are emitted **only when an alert opens**, so repeated evaluation does not
spam recipients. Recovery is announced only when a component returns fully to normal
stock, not when it merely moves between alert types (for example out-of-stock to low
stock). Re-notification while an alert stays open is disabled by default and can be
enabled with `INVENTORY_ALERT_RENOTIFY_HOURS`.

## 4. Email configuration

Mail is **disabled by default**. Add the following to `.env` (never commit real values):

```bash
MAIL_ENABLED=false                 # set true to send
MAIL_TRANSPORT=log                 # 'log' captures messages without delivery (dev/test)
MAIL_FROM=alerts@your-domain.test
MAIL_REPLY_TO=ops@your-domain.test # optional
MAIL_MAX_ATTEMPTS=3                # 1-10
MAIL_QUEUE_INTERVAL_MS=30000       # outbox drain interval

# Required when MAIL_TRANSPORT=smtp
SMTP_HOST=smtp.your-domain.test
SMTP_PORT=587
SMTP_SECURE=false                  # true for implicit TLS (usually port 465)
SMTP_USER=
SMTP_PASSWORD=
SMTP_TIMEOUT_MS=10000
```

Validation runs at startup. Invalid configuration is logged with the variable names
only (never credentials) and leaves mail disabled; it never silently falls back to the
log transport when SMTP was requested. `GET /mail/status` (requires
`Administration.Settings`) reports `enabled`, `transport`, `from` and configuration
errors.

### Queue, retries and delivery status

Outbound mail is written to `email_outbox` and drained by `MailQueueScheduler` in every
process that hosts the mail module (API and worker). Rows are claimed with
`FOR UPDATE SKIP LOCKED` and marked `SENDING` before the network call, so concurrent
processes cannot double-send; rows stuck in `SENDING` for more than 10 minutes are
requeued.

| Status | Meaning |
| --- | --- |
| `QUEUED` | Waiting for the next drain. |
| `SENDING` | Claimed by a process; a crash here is recovered by the staleness requeue. |
| `SENT` | The transport accepted the message. This is **not** an inbox-delivery receipt. |
| `FAILED` | Retries exhausted; `last_error` holds a redacted, bounded reason. |
| `SKIPPED` | Mail is disabled or misconfigured; the message was not attempted. |

Failures retry with exponential backoff (`60s × 2^(attempt−1)`, capped at one hour).
Errors are stored single-line, bounded and credential-masked. SMTP provides no delivery
receipt, so nothing in the product claims "delivered".

Admin endpoints: `GET /mail/outbox`, `GET /mail/outbox/counts`,
`POST /mail/outbox/process`, `POST /mail/verify` — all require
`Administration.Settings`.

## 5. Templates

Supported event types and their variables:

| Event | Sent when | Variables |
| --- | --- | --- |
| `inventory.low_stock` | `LOW_STOCK` opens | `company_name`, `event_name`, `component_name`, `component_sku`, `location_name`, `quantity_on_hand`, `quantity_available`, `reorder_point`, `shortage_quantity`, `occurred_at`, `alert_url`, `alerts_url` |
| `inventory.out_of_stock` | `OUT_OF_STOCK` opens | same as above |
| `inventory.stock_recovered` | an alert resolves | same as above except `shortage_quantity` |

Syntax is `{{variable_name}}` only. There is no expression language, no conditionals,
and no filesystem or network access. Values are always supplied by the server from the
alert context; client-supplied context is never trusted for real sends.

Safety rules enforced by the renderer and the API:

- Variables are allowlisted per event type. Unknown variables are rejected on save with
  an actionable error.
- HTML values are escaped; plain-text values are not. Missing optional values render as
  empty strings, never `undefined` or `null`.
- `alert_url` and `alerts_url` are sanitized to internal relative paths; anything with a
  scheme, host, protocol-relative prefix, backslash or control character collapses to an
  empty string.
- Subjects are stripped of CR/LF to prevent header injection.
- Bodies are limited to 20,000 characters and subjects to 255.

### Seeding

`EmailTemplatesSeedService` inserts defaults with
`ON CONFLICT (event_type) DO NOTHING` at module start. It is idempotent and **never
overwrites** a template an administrator has edited, on startup or on deploy.

### Editing

`/settings/notifications` (permission `Administration.Settings`) lets an authorized user:

- list templates by event type and see enabled state, version and last-updated date,
- edit subject, HTML body and plain-text fallback, and enable/disable the template,
- browse the per-event variable reference with descriptions and examples,
- preview the current draft rendered with server-side sample data (sandboxed iframe),
- send a test email to their own account only,
- restore the shipped default after a confirmation dialog, and
- review the delivery log (statuses, attempts, redacted last error, sent time).

Saving is optimistic: the editor sends the version it loaded and receives `409 Conflict`
if another administrator saved in the meantime. Every update, restore and test-send is
recorded in the security audit log.

## 6. Troubleshooting

| Symptom | Check |
| --- | --- |
| No alerts appear | `GET /inventory-alerts/summary`; confirm the component has projection rows and is active; confirm the reorder point in system settings. |
| Alerts appear but no email | `GET /mail/status` for `enabled` and configuration errors; check `/settings/notifications` delivery log for `SKIPPED`/`FAILED` rows. |
| Emails stuck in `QUEUED` | The drain interval is disabled (`MAIL_QUEUE_INTERVAL_MS=0`) or the scheduler is not running; trigger `POST /mail/outbox/process`. |
| `FAILED` rows | Inspect the redacted `last_error` in the delivery log; verify host/port/TLS and credentials in `.env`. |
| Template not updating | Confirm the save returned `409`; reload the page to pick up the newer version. |
