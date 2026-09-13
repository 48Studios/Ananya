import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import {
  LocationCodeAlreadyExistsError,
  ParentLocationNotFoundError,
  InactiveParentLocationError,
  LocationNotFoundError,
  LocationHasChildrenError,
  CannotParentToSelfError,
  LocationInUseError,
} from '@ananya/inventory';
import type { Response } from 'express';

@Catch()
export class LocationExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof LocationCodeAlreadyExistsError) {
      status = HttpStatus.CONFLICT;
      message = exception.message;
    } else if (exception instanceof ParentLocationNotFoundError) {
      status = HttpStatus.BAD_REQUEST;
      message = exception.message;
    } else if (exception instanceof InactiveParentLocationError) {
      status = HttpStatus.CONFLICT;
      message = exception.message;
    } else if (exception instanceof LocationNotFoundError) {
      status = HttpStatus.NOT_FOUND;
      message = exception.message;
    } else if (exception instanceof LocationHasChildrenError) {
      status = HttpStatus.BAD_REQUEST;
      message = exception.message;
    } else if (exception instanceof CannotParentToSelfError) {
      status = HttpStatus.BAD_REQUEST;
      message = exception.message;
    } else if (exception instanceof LocationInUseError) {
      status = HttpStatus.CONFLICT;
      message = exception.message;
    } else {
      const pgErr = exception as { code?: string };
      if (pgErr?.code === '23503') {
        status = HttpStatus.CONFLICT;
        message =
          'Cannot delete location because it is currently in use by inventory records, receipts, or transactions.';
      } else if (exception instanceof HttpException) {
        status = exception.getStatus();
        const res = exception.getResponse();
        message =
          typeof res === 'string'
            ? res
            : (res as { message?: string | string[] }).message
              ? Array.isArray((res as { message: string | string[] }).message)
                ? (res as { message: string[] }).message.join(', ')
                : (res as { message: string }).message
              : exception.message;
      }
    }

    response.status(status).json({
      statusCode: status,
      error: HttpStatus[status] || 'Error',
      message,
    });
  }
}
