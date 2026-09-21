import { createPermissionGuard } from './permission.guard';
import { COMPONENT_WRITE_PERMISSION } from './component-write.guard';

/**
 * Permissions for the attribute library and its intelligence review workflow.
 *
 * The attribute library is inventory master data, so it reuses the existing
 * inventory permission vocabulary instead of introducing attribute-specific
 * permissions — the same approach `ComponentWriteGuard` and
 * `DocumentReadGuard`/`DocumentWriteGuard` already take:
 *
 *  - reading the review queue (findings, evidence, counts, filters) needs
 *    `Inventory.Read` ("View Inventory")
 *  - recording a review decision, running an audit (which creates and stales
 *    persisted findings), marking findings stale, and applying suggested
 *    bindings all need `Inventory.Update` ("Edit Components"), the permission
 *    that already gates component edits, documentation writes and the component
 *    review queue's write routes
 *
 * A review decision is a write even though this pass applies nothing: it
 * changes persisted review state that other reviewers see.
 */
export const ATTRIBUTE_READ_PERMISSION = 'Inventory.Read';
export const ATTRIBUTE_WRITE_PERMISSION = COMPONENT_WRITE_PERMISSION;

/**
 * Permission for deleting an attribute definition.
 *
 * Pass 6C. `DELETE /attributes/:id` is a **hard delete that cascades**: the
 * definition's category bindings, its options and every component attribute
 * value recorded against it are removed by the database
 * (`attribute_definitions` ← `category_attributes` / `attribute_options` /
 * `component_attribute_values`, all `ON DELETE CASCADE`). There is no soft
 * delete, no retirement state and no usage check, so the operation destroys
 * recorded component specifications irreversibly.
 *
 * That is a different capability from editing the library, and the permission
 * catalogue already separates them: `Inventory.Delete` ("Remove catalog
 * components") is held by no system role except `Administrator`. It is reused
 * here for the same reason and with the same consequence as
 * `ComponentDeleteGuard` on `DELETE /components/:id` — a role holding
 * `Inventory.Update` but not `Inventory.Delete` (an `Inventory Manager`) now
 * receives `403` when deleting a definition.
 *
 * The narrower boundary was chosen deliberately for a destructive, cascading
 * operation, and the asymmetry is recorded rather than hidden. A dedicated
 * `Attributes.Delete` permission would be more precise, but the repository has
 * no such vocabulary and introducing one would require every role definition to
 * be revisited.
 *
 * Binding, option and component-value writes — including their deletes — remain
 * {@link ATTRIBUTE_WRITE_PERMISSION}: they edit the content of a definition
 * rather than destroying the catalog record, and the attribute UI already gates
 * the binding actions on `Inventory.Update`.
 */
export const ATTRIBUTE_DELETE_PERMISSION = 'Inventory.Delete';

const READ_SUBJECT = 'view attribute intelligence findings';
const WRITE_SUBJECT = 'review attribute intelligence findings';
const DELETE_SUBJECT =
  'delete an attribute definition from the attribute library';

/** Guards every attribute intelligence read route. */
export const AttributeReadGuard = createPermissionGuard(
  ATTRIBUTE_READ_PERMISSION,
  READ_SUBJECT,
);

/**
 * Guards every attribute intelligence write route: audit runs, review
 * decisions, stale marking, and the legacy `apply-bindings` mutation.
 *
 * Also guards the attribute-library write routes on `AttributesController`,
 * including binding edits — the same mutation the intelligence apply path
 * performs, so the reviewed path and the direct path require the same
 * permission.
 */
export const AttributeWriteGuard = createPermissionGuard(
  ATTRIBUTE_WRITE_PERMISSION,
  WRITE_SUBJECT,
);

/**
 * Guards attribute definition deletion.
 *
 * Separate from {@link AttributeWriteGuard} because destroying a definition is a
 * different capability from editing one; see {@link ATTRIBUTE_DELETE_PERMISSION}.
 */
export const AttributeDeleteGuard = createPermissionGuard(
  ATTRIBUTE_DELETE_PERMISSION,
  DELETE_SUBJECT,
);
