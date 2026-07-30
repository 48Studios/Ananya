import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import {
  InvalidAdjustmentStatusError,
  EmptyStockAdjustmentError,
  NegativeCountedQuantityError,
  StockAdjustmentNotFoundError,
} from '@ananya/inventory';
import type { Response } from 'express';

@Catch(
  InvalidAdjustmentStatusError,
  EmptyStockAdjustmentError,
  NegativeCountedQuantityError,
  StockAdjustmentNotFoundError,
)
export class AdjustmentExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof StockAdjustmentNotFoundError) {
      status = HttpStatus.NOT_FOUND;
      message = exception.message;
    } else if (
      exception instanceof InvalidAdjustmentStatusError ||
      exception instanceof EmptyStockAdjustmentError ||
      exception instanceof NegativeCountedQuantityError
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
