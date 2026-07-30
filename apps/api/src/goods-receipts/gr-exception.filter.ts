import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import {
  InvalidGoodsReceiptStatusError,
  InvalidReceivingQuantityError,
  GoodsReceiptNotFoundError,
  ExceededRemainingQuantityError,
} from '@ananya/procurement';
import type { Response } from 'express';

@Catch(
  InvalidGoodsReceiptStatusError,
  InvalidReceivingQuantityError,
  GoodsReceiptNotFoundError,
  ExceededRemainingQuantityError,
)
export class GrExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof GoodsReceiptNotFoundError) {
      status = HttpStatus.NOT_FOUND;
      message = exception.message;
    } else if (
      exception instanceof InvalidGoodsReceiptStatusError ||
      exception instanceof InvalidReceivingQuantityError ||
      exception instanceof ExceededRemainingQuantityError
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
