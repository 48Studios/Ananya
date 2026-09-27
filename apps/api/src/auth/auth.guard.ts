import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import {
  extractBearerToken,
  type AuthenticatedRequest,
} from './permission.guard';
import { RequestContext } from '../common/context/request-context';

/**
 * Global authentication guard.
 *
 * Enforces fail-closed security across the entire API surface:
 *  - Every endpoint requires authentication by default
 *  - Only handlers or controllers decorated with `@Public()` may bypass authentication
 *  - Authenticated session populates `request.user` and updates `RequestContext`
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException(
        'Authentication is required to access this resource.',
      );
    }

    let me: Awaited<ReturnType<AuthService['getMeByToken']>>;
    try {
      me = await this.authService.getMeByToken(token);
    } catch (error) {
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
    request.user = {
      id: user.id,
      email: user.email,
      roleName: user.roleName,
      permissions,
    };

    RequestContext.setUser({ id: user.id, email: user.email });

    return true;
  }
}
