import { createPermissionGuard } from './permission.guard';
import {
  COMPONENT_WRITE_PERMISSION,
  ComponentWriteGuard,
} from './component-write.guard';

export type {
  AuthenticatedRequest,
  AuthenticatedRequestUser,
} from './permission.guard';

/**
 * Permissions for the component catalog surface.
 *
 * Pass 6. `ComponentsController` had **no guards on any route** — the largest
 * unauthenticated write surface in the API. Any caller, with or without a session,
 * could list and read the whole catalog, create components, edit them, and delete
 * them, and could write AI suggestion feedback through
 * `POST /components/suggest/feedback`.
 *
 * The vocabulary is reused exactly; nothing new is invented:
 *
 *  - `Inventory.Read` ("View Inventory") — reads, search, detail, and the
 *    suggestion endpoint, which reads categories, manufacturers and existing
 *    components and can trigger model inference.
 *  - `Inventory.Update` ("Edit Components") — create, update, and feedback writes.
 *  - `Inventory.Delete` ("Delete Components", "Remove catalog components") —
 *    delete.
 *
 * ### The delete boundary, and a role-model finding
 *
 * `Inventory.Delete` already existed and was **dead**: no guard used it and the web
 * client never referenced it. It is the purpose-built permission for exactly this
 * operation, so it is the correct guard — and it means only holders of it may
 * delete. Today that is `Administrator` alone, because `Inventory Manager` holds
 * `Inventory.Read/Create/Update/Adjust/Transfer/Reserve` but **not** `Delete`.
 *
 * That is a pre-existing inconsistency in the role model rather than something
 * this guard introduces: a role with Create and Update but no Delete. Before this
 * pass the question was moot, because delete was unauthenticated — every role, and
 * anonymous callers, could delete. After this pass it is explicit, and an
 * `Inventory Manager` deleting a component over HTTP receives `403`.
 *
 * The role model was deliberately NOT changed here. `RolesService.ensureSystemRoles`
 * inserts a system role only when it does not exist, so editing
 * `SYSTEM_ROLE_PERMISSIONS` would give a *fresh* install different permissions from
 * an existing one — a worse outcome than a consistent, documented boundary. If
 * product intent is for `Inventory Manager` to delete components, the fix is to
 * grant it `Inventory.Delete`, which belongs in the pass that also decides whether
 * the permission should be split further.
 */
export const COMPONENT_READ_PERMISSION = 'Inventory.Read';
export const COMPONENT_DELETE_PERMISSION = 'Inventory.Delete';

const READ_SUBJECT = 'view component data';
const DELETE_SUBJECT = 'delete component data';

/** Guards component reads: list, detail, SKU preview and suggestion. */
export const ComponentReadGuard = createPermissionGuard(
  COMPONENT_READ_PERMISSION,
  READ_SUBJECT,
);

/**
 * Guards component deletion.
 *
 * Separate from {@link ComponentWriteGuard} because create/update and delete are
 * different capabilities in this repository's permission model, and collapsing
 * them would leave `Inventory.Delete` permanently unused.
 */
export const ComponentDeleteGuard = createPermissionGuard(
  COMPONENT_DELETE_PERMISSION,
  DELETE_SUBJECT,
);

/** Re-exported so a component route can import its write guard from one place. */
export { ComponentWriteGuard, COMPONENT_WRITE_PERMISSION };
