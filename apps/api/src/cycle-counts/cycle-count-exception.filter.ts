import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import {
  ImmutableCycleCountError,
  InvalidCountedQuantityError,
  InvalidCycleCountStatusTransitionError,
} from '@ananya/warehouse';
import type { Response } from 'express';

@Catch(
  ImmutableCycleCountError,
  InvalidCountedQuantityError,
  InvalidCycleCountStatusTransitionError,
)
export class CycleCountExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status = HttpStatus.BAD_REQUEST;
    let message = 'Invalid cycle count operation';

    if (exception instanceof Error) {
      message = exception.message;
    }

    response.status(status).json({
      statusCode: status,
      error: HttpStatus[status],
      message,
    });
  }
}
