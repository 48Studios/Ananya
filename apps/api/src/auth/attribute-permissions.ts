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

const READ_SUBJECT = 'view attribute intelligence findings';
const WRITE_SUBJECT = 'review attribute intelligence findings';

/** Guards every attribute intelligence read route. */
export const AttributeReadGuard = createPermissionGuard(
  ATTRIBUTE_READ_PERMISSION,
  READ_SUBJECT,
);

/**
 * Guards every attribute intelligence write route: audit runs, review
 * decisions, stale marking, and the legacy `apply-bindings` mutation.
 */
export const AttributeWriteGuard = createPermissionGuard(
  ATTRIBUTE_WRITE_PERMISSION,
  WRITE_SUBJECT,
);
