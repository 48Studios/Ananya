import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import {
  InvalidProductionOrderStatusTransitionError,
  InvalidProductionQuantityError,
} from '@ananya/manufacturing';
import type { Response } from 'express';

@Catch(
  InvalidProductionOrderStatusTransitionError,
  InvalidProductionQuantityError,
)
export class ProductionOrderExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status = HttpStatus.BAD_REQUEST;
    let message = 'Invalid production order operation';

    if (
      exception instanceof InvalidProductionOrderStatusTransitionError ||
      exception instanceof InvalidProductionQuantityError
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
