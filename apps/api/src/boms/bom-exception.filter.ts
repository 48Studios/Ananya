import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import {
  InvalidBomStatusTransitionError,
  EmptyBomError,
  ImmutableBomError,
  InvalidBomLineQuantityError,
  DuplicateBomComponentLineError,
  CircularBomDependencyError,
  ActiveBomAlreadyExistsError,
  BomNotFoundError,
} from '@ananya/manufacturing';
import type { Response } from 'express';

@Catch(
  InvalidBomStatusTransitionError,
  EmptyBomError,
  ImmutableBomError,
  InvalidBomLineQuantityError,
  DuplicateBomComponentLineError,
  CircularBomDependencyError,
  ActiveBomAlreadyExistsError,
  BomNotFoundError,
)
export class BomExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof BomNotFoundError) {
      status = HttpStatus.NOT_FOUND;
      message = exception.message;
    } else if (
      exception instanceof InvalidBomStatusTransitionError ||
      exception instanceof EmptyBomError ||
      exception instanceof ImmutableBomError ||
      exception instanceof InvalidBomLineQuantityError ||
      exception instanceof DuplicateBomComponentLineError ||
      exception instanceof CircularBomDependencyError ||
      exception instanceof ActiveBomAlreadyExistsError
    ) {
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
