import { createPermissionGuard } from './permission.guard';

export type {
  AuthenticatedRequest,
  AuthenticatedRequestUser,
} from './permission.guard';

/**
 * Canonical permission for modifying component master data.
 *
 * This is the repository's existing `Inventory.Update` permission ("Edit
 * Components"), already granted to the `Inventory Manager` system role and
 * implicitly to `Administrator` via `*`.
 */
export const COMPONENT_WRITE_PERMISSION = 'Inventory.Update';

const COMPONENT_WRITE_SUBJECT = 'modify component data';

/**
 * Authorization guard for write operations that mutate component data.
 *
 * Thin binding of {@link createPermissionGuard} to the component-write
 * permission; see that factory for the shared authentication mechanics.
 * Behaviours this guard has always had:
 *
 *  - no/malformed/expired/revoked session token → `401 Unauthorized`
 *  - authenticated but missing the permission → `403 Forbidden`
 *  - otherwise populates `request.user` and allows the request
 */
export const ComponentWriteGuard = createPermissionGuard(
  COMPONENT_WRITE_PERMISSION,
  COMPONENT_WRITE_SUBJECT,
);
