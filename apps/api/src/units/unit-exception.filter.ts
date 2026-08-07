import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import {
  UnitNameAlreadyExistsError,
  UnitNotFoundError,
  InvalidUnitNameError,
  InvalidUnitCategoryError,
} from '@ananya/inventory';
import type { Response } from 'express';

@Catch(
  UnitNameAlreadyExistsError,
  UnitNotFoundError,
  InvalidUnitNameError,
  InvalidUnitCategoryError,
)
export class UnitExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof UnitNameAlreadyExistsError) {
      status = HttpStatus.CONFLICT;
      message = exception.message;
    } else if (exception instanceof UnitNotFoundError) {
      status = HttpStatus.NOT_FOUND;
      message = exception.message;
    } else if (
      exception instanceof InvalidUnitNameError ||
      exception instanceof InvalidUnitCategoryError
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
