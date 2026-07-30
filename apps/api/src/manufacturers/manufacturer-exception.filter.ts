import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import {
  ManufacturerCodeAlreadyExistsError,
  ManufacturerNotFoundError,
  ManufacturerReferencedByComponentsError,
  InvalidManufacturerCodeError,
  InvalidManufacturerNameError,
} from '@ananya/inventory';
import type { Response } from 'express';

@Catch(
  ManufacturerCodeAlreadyExistsError,
  ManufacturerNotFoundError,
  ManufacturerReferencedByComponentsError,
  InvalidManufacturerCodeError,
  InvalidManufacturerNameError,
)
export class ManufacturerExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof ManufacturerCodeAlreadyExistsError) {
      status = HttpStatus.CONFLICT;
      message = exception.message;
    } else if (exception instanceof ManufacturerNotFoundError) {
      status = HttpStatus.NOT_FOUND;
      message = exception.message;
    } else if (exception instanceof ManufacturerReferencedByComponentsError) {
      status = HttpStatus.BAD_REQUEST;
      message = exception.message;
    } else if (
      exception instanceof InvalidManufacturerCodeError ||
      exception instanceof InvalidManufacturerNameError
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
