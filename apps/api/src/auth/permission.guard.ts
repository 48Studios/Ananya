import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Type,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { PermissionsService } from '../permissions/permissions.service';

/**
 * Authenticated principal attached to the request by a permission guard.
 *
 * Controllers read reviewer/uploader identity from here, never from the request
 * body.
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

export function extractBearerToken(
  request: AuthenticatedRequest,
): string | null {
  const raw = request.headers?.authorization;
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (!header) return null;
  const token = header.replace(/^Bearer\s+/i, '').trim();
  return token.length > 0 ? token : null;
}

/**
 * Builds an authorization guard for one permission.
 *
 * The repository has no global guard infrastructure: authentication today is
 * performed ad hoc by `AuthController` reading the `Authorization` header and
 * calling `AuthService.getMeByToken()`. This factory applies that same
 * mechanism plus the existing `PermissionsService.hasPermission` check,
 * without introducing a parallel auth system, a new permission vocabulary, or
 * custom token handling.
 *
 * Behaviour:
 *  - no/malformed/expired/revoked session token → `401 Unauthorized`
 *  - authenticated but missing the required permission → `403 Forbidden`
 *  - otherwise populates `request.user` and allows the request
 *
 * Only authentication failures are translated into a `401`. Any other failure
 * while validating the session — a database error, an exhausted pool — is
 * re-thrown so it keeps its own meaning (a `5xx`) instead of being reported to
 * the caller as an invalid session. See {@link createPermissionGuard}'s
 * `canActivate` for why that distinction is load-bearing.
 *
 * @param permission Permission code that must be held, e.g. `Inventory.Update`.
 * @param subject    Human-readable operation used in error messages, phrased so
 *                   it reads after "to" (e.g. "modify component data").
 */
export function createPermissionGuard(
  permission: string,
  subject: string,
): Type<CanActivate> {
  @Injectable()
  class PermissionGuard implements CanActivate {
    constructor(
      private readonly authService: AuthService,
      private readonly permissionsService: PermissionsService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

      const token = extractBearerToken(request);
      if (!token) {
        throw new UnauthorizedException(
          `Authentication is required to ${subject}.`,
        );
      }

      // Reuses the same session validation used by GET /auth/me.
      let me: Awaited<ReturnType<AuthService['getMeByToken']>>;
      try {
        me = await this.authService.getMeByToken(token);
      } catch (error) {
        // Only the authentication-failure shapes become a 401. `getMeByToken`
        // throws `UnauthorizedException` for a missing/expired/revoked session,
        // and `NotFoundException` when the session's user or role no longer
        // exists; both mean "this principal is not valid".
        //
        // Anything else is an operational failure and is re-thrown untouched.
        // Swallowing it into a 401 is what made an observed integration-run
        // failure undiagnosable: the caller was told to sign in again, no `5xx`
        // was recorded, and nothing appeared in the logs — the request looked
        // like an authorization result when it was an infrastructure fault.
        // `GET /auth/me`, which this validation is borrowed from, surfaces a
        // non-authentication failure as a `5xx` for the same reason.
        if (
          error instanceof UnauthorizedException ||
          error instanceof NotFoundException
        ) {
          throw new UnauthorizedException(
            'Your session is invalid or has expired. Sign in again.',
          );
        }
        throw error;
      }

      const user = me?.user;
      if (!user || user.status !== 'ACTIVE') {
        throw new UnauthorizedException(
          'Your session is invalid or has expired. Sign in again.',
        );
      }

      const permissions = me.permissions ?? [];
      if (!this.permissionsService.hasPermission(permissions, permission)) {
        throw new ForbiddenException(
          `You do not have permission to ${subject} (requires ${permission}).`,
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

  // Distinct names keep Nest's dependency-injection diagnostics readable when
  // several guards built from this factory are provided in one module.
  Object.defineProperty(PermissionGuard, 'name', {
    value: `${permission.replace(/[^A-Za-z0-9]/g, '')}PermissionGuard`,
  });

  return PermissionGuard;
}
