import { createPermissionGuard } from '../auth/permission.guard';
import { COMPONENT_WRITE_PERMISSION } from '../auth/component-write.guard';

/**
 * Permissions the documentation routes require.
 *
 * Documentation is component data, so it reuses the existing inventory
 * permission vocabulary instead of introducing document-specific permissions:
 *
 *  - reading documentation (list, metadata, preview, download, external URLs)
 *    needs `Inventory.Read` ("View Inventory")
 *  - changing documentation (upload, external reference, metadata, versions,
 *    delete) needs `Inventory.Update` ("Edit Components"), the same permission
 *    that already gates component edits and the review queue's write routes
 */
export const DOCUMENT_READ_PERMISSION = 'Inventory.Read';
export const DOCUMENT_WRITE_PERMISSION = COMPONENT_WRITE_PERMISSION;

const READ_SUBJECT = 'view component documentation';
const WRITE_SUBJECT = 'modify component documentation';

/** Guards every documentation read route. */
export const DocumentReadGuard = createPermissionGuard(
  DOCUMENT_READ_PERMISSION,
  READ_SUBJECT,
);

/** Guards every documentation write route. */
export const DocumentWriteGuard = createPermissionGuard(
  DOCUMENT_WRITE_PERMISSION,
  WRITE_SUBJECT,
);
