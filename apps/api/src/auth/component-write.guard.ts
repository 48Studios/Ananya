import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { PermissionsService } from '../permissions/permissions.service';

/**
 * Authenticated principal attached to the request by {@link ComponentWriteGuard}.
 *
 * Controllers read reviewer identity from here, never from the request body.
 */
export interface AuthenticatedRequestUser {
  id: string;
  email: string;
  roleName: string;
  permissions: string[];
}

export interface AuthenticatedRequest {
  headers?: Record<string, string | string[] | undefined>;
  user?: AuthenticatedRequestUser;
}

/**
 * Canonical permission for modifying component master data.
 *
 * This is the repository's existing `Inventory.Update` permission ("Edit
 * Components"), already granted to the `Inventory Manager` system role and
 * implicitly to `Administrator` via `*`.
 */
export const COMPONENT_WRITE_PERMISSION = 'Inventory.Update';

function extractBearerToken(request: AuthenticatedRequest): string | null {
  const raw = request.headers?.authorization;
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (!header) return null;
  const token = header.replace(/^Bearer\s+/i, '').trim();
  return token.length > 0 ? token : null;
}

/**
 * Authorization guard for write operations that mutate component data.
 *
 * The repository has no global guard infrastructure: authentication today is
 * performed ad hoc by `AuthController` reading the `Authorization` header and
 * calling `AuthService.getMeByToken()`. This guard applies that same mechanism
 * (plus the existing `PermissionsService.hasPermission` check) to a single
 * endpoint, without introducing a parallel auth system, a new permission
 * vocabulary, or custom token handling.
 *
 * Behaviour:
 *  - no/malformed/expired/revoked session token → `401 Unauthorized`
 *  - authenticated but missing the required permission → `403 Forbidden`
 *  - otherwise populates `request.user` and allows the request
 */
@Injectable()
export class ComponentWriteGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const token = extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException(
        'Authentication is required to modify component data.',
      );
    }

    // Reuses the same session validation used by GET /auth/me.
    let me: Awaited<ReturnType<AuthService['getMeByToken']>>;
    try {
      me = await this.authService.getMeByToken(token);
    } catch {
      throw new UnauthorizedException(
        'Your session is invalid or has expired. Sign in again.',
      );
    }

    const user = me?.user;
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException(
        'Your session is invalid or has expired. Sign in again.',
      );
    }

    const permissions = me.permissions ?? [];
    if (
      !this.permissionsService.hasPermission(
        permissions,
        COMPONENT_WRITE_PERMISSION,
      )
    ) {
      throw new ForbiddenException(
        `You do not have permission to modify component data (requires ${COMPONENT_WRITE_PERMISSION}).`,
      );
    }

    request.user = {
      id: user.id,
      email: user.email,
      roleName: user.roleName,
      permissions,
    };

    return true;
  }
}
