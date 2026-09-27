import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { getClientIp } from '../utils/client-ip.util';

export interface RequestStore {
  clientIp: string;
  userAgent?: string;
  requestId: string;
  userId?: string | null;
  userEmail?: string | null;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestStore>();

export class RequestContext {
  static run<R>(store: RequestStore, callback: () => R): R {
    return asyncLocalStorage.run(store, callback);
  }

  static get(): RequestStore | undefined {
    return asyncLocalStorage.getStore();
  }

  static getClientIp(): string {
    return asyncLocalStorage.getStore()?.clientIp || '127.0.0.1';
  }

  static getUser(): { userId?: string | null; userEmail?: string | null } | undefined {
    const store = asyncLocalStorage.getStore();
    if (!store) return undefined;
    return {
      userId: store.userId,
      userEmail: store.userEmail,
    };
  }

  static setUser(user: { id?: string | null; email?: string | null }): void {
    const store = asyncLocalStorage.getStore();
    if (store) {
      if (user.id) store.userId = user.id;
      if (user.email) store.userEmail = user.email;
    }
  }
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const clientIp = getClientIp(req);
    const userAgent = (req.headers['user-agent'] as string) || undefined;
    const forwardedRequestId = req.headers['x-request-id'];
    const requestId =
      typeof forwardedRequestId === 'string' && forwardedRequestId.trim()
        ? forwardedRequestId.trim()
        : randomUUID();

    const userObj = (req as Request & { user?: { id?: string; email?: string } }).user;

    const store: RequestStore = {
      clientIp,
      userAgent,
      requestId,
      userId: userObj?.id || null,
      userEmail: userObj?.email || null,
    };

    RequestContext.run(store, () => next());
  }
}
