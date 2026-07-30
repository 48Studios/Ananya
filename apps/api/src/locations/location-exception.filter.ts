import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import {
  LocationCodeAlreadyExistsError,
  ParentLocationNotFoundError,
  InactiveParentLocationError,
  LocationNotFoundError,
  LocationHasChildrenError,
  CannotParentToSelfError,
} from '@ananya/inventory';
import type { Response } from 'express';

@Catch(
  LocationCodeAlreadyExistsError,
  ParentLocationNotFoundError,
  InactiveParentLocationError,
  LocationNotFoundError,
  LocationHasChildrenError,
  CannotParentToSelfError,
)
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
    }

    response.status(status).json({
      statusCode: status,
      error: HttpStatus[status],
      message,
    });
  }
}
