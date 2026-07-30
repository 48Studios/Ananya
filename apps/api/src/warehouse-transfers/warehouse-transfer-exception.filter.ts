import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import {
  IdenticalTransferLocationsError,
  ImmutableTransferError,
  InvalidTransferQuantityError,
  InvalidTransferStatusTransitionError,
} from '@ananya/warehouse';
import type { Response } from 'express';

@Catch(
  IdenticalTransferLocationsError,
  ImmutableTransferError,
  InvalidTransferQuantityError,
  InvalidTransferStatusTransitionError,
)
export class WarehouseTransferExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status = HttpStatus.BAD_REQUEST;
    let message = 'Invalid warehouse transfer operation';

    if (
      exception instanceof IdenticalTransferLocationsError ||
      exception instanceof ImmutableTransferError ||
      exception instanceof InvalidTransferQuantityError ||
      exception instanceof InvalidTransferStatusTransitionError
    ) {
      message = exception.message;
    }

    response.status(status).json({
      statusCode: status,
      error: HttpStatus[status],
      message,
    });
  }
}
