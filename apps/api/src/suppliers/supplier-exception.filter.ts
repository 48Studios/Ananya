import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import {
  DuplicateSupplierCodeError,
  SupplierNotFoundError,
  SupplierHasPurchaseOrdersError,
  InvalidSupplierCodeError,
  InvalidSupplierNameError,
} from '@ananya/procurement';
import type { Response } from 'express';

@Catch(
  DuplicateSupplierCodeError,
  SupplierNotFoundError,
  SupplierHasPurchaseOrdersError,
  InvalidSupplierCodeError,
  InvalidSupplierNameError,
)
export class SupplierExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof DuplicateSupplierCodeError) {
      status = HttpStatus.CONFLICT;
      message = exception.message;
    } else if (exception instanceof SupplierNotFoundError) {
      status = HttpStatus.NOT_FOUND;
      message = exception.message;
    } else if (
      exception instanceof SupplierHasPurchaseOrdersError ||
      exception instanceof InvalidSupplierCodeError ||
      exception instanceof InvalidSupplierNameError
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
