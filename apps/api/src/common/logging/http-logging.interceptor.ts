import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Observable, catchError, throwError } from 'rxjs';

interface HttpErrorLike {
  name?: string;
  message?: string;
  stack?: string;
  status?: number;
  statusCode?: number;
}

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(HttpLoggingInterceptor.name);
  private readonly accessLoggingEnabled =
    process.env.HTTP_ACCESS_LOGGING !== 'false';
  private readonly errorLoggingEnabled =
    process.env.HTTP_ERROR_LOGGING !== 'false';

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = performance.now();
    const requestId = this.getRequestId(request);

    response.setHeader('X-Request-Id', requestId);

    let accessLogged = false;
    const logAccess = (connectionClosed = false) => {
      if (accessLogged || !this.accessLoggingEnabled) return;
      accessLogged = true;

      const durationMs =
        Math.round((performance.now() - startedAt) * 100) / 100;
      this.logger.log(
        this.serialize({
          event: 'http.request',
          requestId,
          method: request.method,
          route: this.getRoute(request),
          statusCode: response.statusCode,
          durationMs,
          ip: request.ip,
          userAgent: request.get('user-agent') || undefined,
          connectionClosed,
        }),
      );
    };

    response.once('finish', () => logAccess(false));
    response.once('close', () => {
      if (!response.writableFinished) logAccess(true);
    });

    return next.handle().pipe(
      catchError((error: unknown) => {
        if (this.errorLoggingEnabled) {
          this.logError(error, request, requestId, startedAt);
        }
        return throwError(() => error);
      }),
    );
  }

  private logError(
    error: unknown,
    request: Request,
    requestId: string,
    startedAt: number,
  ): void {
    const details = this.toErrorLike(error);
    const statusCode = this.getStatusCode(error, details);

    this.logger.error(
      this.serialize({
        event: 'http.error',
        requestId,
        method: request.method,
        route: this.getRoute(request),
        statusCode,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        errorName: details.name,
        errorMessage: details.message || String(error),
        stack: details.stack,
      }),
      details.stack,
    );
  }

  private getRequestId(request: Request): string {
    const forwardedId = request.get('x-request-id');
    return forwardedId?.trim() || randomUUID();
  }

  private getRoute(request: Request): string {
    const route = (request.route as { path?: string | string[] } | undefined)
      ?.path;
    if (Array.isArray(route)) return route.join('|');
    return route || request.originalUrl || request.url;
  }

  private toErrorLike(error: unknown): HttpErrorLike {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }
    if (typeof error === 'object' && error !== null) {
      const candidate = error as Record<string, unknown>;
      return {
        name: typeof candidate.name === 'string' ? candidate.name : undefined,
        message:
          typeof candidate.message === 'string' ? candidate.message : undefined,
        stack:
          typeof candidate.stack === 'string' ? candidate.stack : undefined,
        status:
          typeof candidate.status === 'number' ? candidate.status : undefined,
        statusCode:
          typeof candidate.statusCode === 'number'
            ? candidate.statusCode
            : undefined,
      };
    }
    return { message: String(error) };
  }

  private getStatusCode(
    error: unknown,
    details: HttpErrorLike,
  ): number | undefined {
    if (error instanceof HttpException) return error.getStatus();
    return details.statusCode ?? details.status;
  }

  private serialize(value: Record<string, unknown>): string {
    return JSON.stringify(value);
  }
}
