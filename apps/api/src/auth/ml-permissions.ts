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
 */
export const ML_READ_PERMISSION = 'Inventory.Read';
export const ML_WRITE_PERMISSION = 'Inventory.Update';

const READ_SUBJECT = 'use the machine-learning suggestion endpoints';
const WRITE_SUBJECT =
  'record machine-learning feedback or review training data';

/** Guards the read-only `/ml/*` routes: suggestions, audit, exports, quarantine reads. */
export const MlReadGuard = createPermissionGuard(
  ML_READ_PERMISSION,
  READ_SUBJECT,
);

/** Guards the `/ml/*` routes that write feedback or training state. */
export const MlWriteGuard = createPermissionGuard(
  ML_WRITE_PERMISSION,
  WRITE_SUBJECT,
);
