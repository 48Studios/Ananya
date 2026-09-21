import { createPermissionGuard } from './permission.guard';

/**
 * Permissions for the legacy `/ml/*` surface.
 *
 * Pass 3 guarded the one route on this controller that mutated authoritative
 * data (`apply-bindings`) and left the rest open on the reasoning that a
 * compute-only endpoint is a read. Pass 5 revisited that reasoning and found it
 * incomplete. Three things were wrong with it:
 *
 *  1. **Compute is not free.** `POST /ml/attributes/audit` and
 *     `POST /ml/attributes/suggest-*` read the whole attribute library and, when
 *     the Python service is enabled, make an outbound model call. Unauthenticated
 *     they are an abuse and cost vector, and they are the only routes in the API
 *     that can trigger model inference.
 *  2. **Reading ERP rows is still reading ERP rows.** These routes return
 *     category, manufacturer, component and attribute data. The rest of the API
 *     requires `Inventory.Read` for that; these did not.
 *  3. **Telemetry and training are writes.** `POST /ml/feedback` inserts into
 *     `ai_suggestion_feedback`, which is the labeled dataset the model is trained
 *     on. `POST /ml/training/quarantine/:id/review` rewrites the training
 *     quarantine and can append to the validated dataset. Both were callable by
 *     anyone, which is a feedback-poisoning and training-contamination path.
 *
 * The vocabulary is reused rather than extended, matching how the attribute and
 * component review queues are already guarded:
 *
 *  - `Inventory.Read` — reading findings, suggestions, exported telemetry and
 *    quarantine records, and running the read-only computations that produce
 *    them. Every built-in role except `Auditor` holds it.
 *  - `Inventory.Update` — writing feedback or training state. This is the same
 *    permission that already gates attribute and component master-data edits and
 *    every attribute review-queue write.
 *
 * No new permission was invented. A dedicated `ML.*` or `Administration.Training`
 * permission would be more precise, but the repository has no such vocabulary and
 * introducing one would require every role definition to be revisited — a change
 * that belongs in the pass that also decides whether training review should be an
 * administrator-only activity. Until then, the closest existing boundary is the
 * honest one.
 *
 * `GET /ml/health` is deliberately NOT guarded; see the controller's route audit
 * for why a liveness probe stays public.
 *
 * ### Pass 6: the training/administration surface was split out
 *
 * Pass 5 put `GET /ml/feedback/export`, `GET /ml/training/quarantine` and
 * `POST /ml/training/quarantine/:id/review` behind the same `Inventory.Read` /
 * `Inventory.Update` pair as everything else, and recorded the mismatch. Pass 6
 * resolved it, because the mismatch is not cosmetic:
 *
 *  - `POST /ml/training/quarantine/:id/review` appends to
 *    `validated_records.json`, the corpus the component model is trained from. An
 *    `Inventory Manager` — a role that legitimately edits components — could
 *    therefore inject arbitrary records into the training set. Editing a component
 *    and injecting a training record are different capabilities, and the second is
 *    materially more dangerous: it changes the model's future behaviour rather than
 *    one row of master data.
 *  - `GET /ml/feedback/export` returns up to 1000 labeled rows including
 *    `creationContext`, `finalValue` and `evidence` — internal ERP context and
 *    reviewer decisions in bulk. A general inventory read permission is too broad
 *    for a dataset dump.
 *
 * So all three are now {@link MlAdminGuard}: **administrator-only**.
 *
 * ### Why `Administration.Roles` rather than a new permission
 *
 * There is no `Administration.ML` (or equivalent) in the catalogue, and this pass
 * was told not to proliferate permissions. `Administration.Roles` ("Manage Roles")
 * is the most privileged non-wildcard permission in the repository and is held by
 * **no system role except `Administrator`**, which has it via `*`. It is therefore
 * the tightest existing boundary that is still expressible.
 *
 * The other administration permission was considered and rejected, and the
 * distinction is the whole point of the choice: `Administration.Security` ("View
 * Security Audit") is held by the **`Auditor`** system role, which is a read-only
 * reporting role. Using it here would have handed training-corpus write access to
 * every auditor — the opposite of the intent. `Administration.Roles` is held by
 * nobody but an administrator, so the proxy fails closed.
 *
 * The name is a proxy, and that is recorded rather than hidden: a permission about
 * role management is not *about* training data, so this guard is correct in effect
 * and misleading in name. The residual risk is narrow and worth stating: an
 * administrator who creates a custom role and grants it `Administration.Roles`
 * would thereby also grant ML training and dataset-export access. That is
 * acceptable at this stage because granting `Administration.Roles` is itself a
 * highly privileged act — a holder can already grant themselves `*` — but it is
 * exactly why a dedicated `Administration.ML` permission is the correct long-term
 * answer, deferred to the pass that also decides whether training review should
 * have a UI at all.
 *
 * `Inventory.Read` and `Inventory.Update` remain the boundary for the suggestion
 * and feedback routes, which really are inventory operations.
 */
export const ML_READ_PERMISSION = 'Inventory.Read';
export const ML_WRITE_PERMISSION = 'Inventory.Update';

/**
 * The administrator-only boundary for ML training and dataset export.
 *
 * See the module doc: `Administration.Roles` is the tightest existing permission
 * held only by `Administrator`, used as a proxy for the `Administration.ML`
 * permission that does not exist yet.
 */
export const ML_ADMIN_PERMISSION = 'Administration.Roles';

const READ_SUBJECT = 'use the machine-learning suggestion endpoints';
const WRITE_SUBJECT = 'record machine-learning feedback';
const ADMIN_SUBJECT =
  'export machine-learning datasets or review training records';

/** Guards the read-only `/ml/*` routes: suggestions and the legacy audit. */
export const MlReadGuard = createPermissionGuard(
  ML_READ_PERMISSION,
  READ_SUBJECT,
);

/** Guards the `/ml/*` routes that write AI suggestion feedback. */
export const MlWriteGuard = createPermissionGuard(
  ML_WRITE_PERMISSION,
  WRITE_SUBJECT,
);

/**
 * Guards the ML training and dataset-export routes.
 *
 * Administrator-only. See the module doc for why this is a separate guard from
 * {@link MlWriteGuard} and why it borrows an administration permission.
 */
export const MlAdminGuard = createPermissionGuard(
  ML_ADMIN_PERMISSION,
  ADMIN_SUBJECT,
);
