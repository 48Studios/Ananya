import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import {
  ComponentSkuAlreadyExistsError,
  DefaultLocationNotFoundError,
  ComponentNotFoundError,
  InvalidComponentSkuError,
  InvalidComponentNameError,
  InvalidUnitError,
  AttributeDefinitionNotFoundError,
  AttributeValueValidationError,
} from '@ananya/inventory';
import {
  InvalidPendingComponentEntityError,
  PendingComponentEntityConflictError,
} from './pending-component-entity.errors';
import type { Response } from 'express';

@Catch(
  ComponentSkuAlreadyExistsError,
  DefaultLocationNotFoundError,
  ComponentNotFoundError,
  InvalidComponentSkuError,
  InvalidComponentNameError,
  InvalidUnitError,
  AttributeDefinitionNotFoundError,
  AttributeValueValidationError,
  InvalidPendingComponentEntityError,
  PendingComponentEntityConflictError,
)
export class ComponentExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof ComponentSkuAlreadyExistsError) {
      status = HttpStatus.CONFLICT;
      message = exception.message;
    } else if (exception instanceof DefaultLocationNotFoundError) {
      status = HttpStatus.BAD_REQUEST;
      message = exception.message;
    } else if (exception instanceof ComponentNotFoundError) {
      status = HttpStatus.NOT_FOUND;
      message = exception.message;
    } else if (
      exception instanceof InvalidComponentSkuError ||
      exception instanceof InvalidComponentNameError ||
      exception instanceof InvalidUnitError ||
      exception instanceof AttributeDefinitionNotFoundError ||
      exception instanceof AttributeValueValidationError ||
      exception instanceof InvalidPendingComponentEntityError ||
      exception instanceof PendingComponentEntityConflictError
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
