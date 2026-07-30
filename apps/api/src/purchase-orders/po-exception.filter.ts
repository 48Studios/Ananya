import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import {
  InvalidPoStatusTransitionError,
  InvalidPoLineQuantityError,
  EmptyPurchaseOrderError,
  PurchaseOrderNotFoundError,
  PurchaseOrderCannotBeDeletedError,
} from '@ananya/procurement';
import type { Response } from 'express';

@Catch(
  InvalidPoStatusTransitionError,
  InvalidPoLineQuantityError,
  EmptyPurchaseOrderError,
  PurchaseOrderNotFoundError,
  PurchaseOrderCannotBeDeletedError,
)
export class PoExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof PurchaseOrderNotFoundError) {
      status = HttpStatus.NOT_FOUND;
      message = exception.message;
    } else if (
      exception instanceof InvalidPoStatusTransitionError ||
      exception instanceof InvalidPoLineQuantityError ||
      exception instanceof EmptyPurchaseOrderError ||
      exception instanceof PurchaseOrderCannotBeDeletedError
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
