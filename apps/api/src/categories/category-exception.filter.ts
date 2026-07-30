import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import {
  CategoryCodeAlreadyExistsError,
  CategoryNotFoundError,
  CategoryCannotBeOwnParentError,
  CategoryHasChildrenError,
  CategoryReferencedByComponentsError,
  InvalidCategoryCodeError,
  InvalidCategoryNameError,
} from '@ananya/inventory';
import type { Response } from 'express';

@Catch(
  CategoryCodeAlreadyExistsError,
  CategoryNotFoundError,
  CategoryCannotBeOwnParentError,
  CategoryHasChildrenError,
  CategoryReferencedByComponentsError,
  InvalidCategoryCodeError,
  InvalidCategoryNameError,
)
export class CategoryExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof CategoryCodeAlreadyExistsError) {
      status = HttpStatus.CONFLICT;
      message = exception.message;
    } else if (exception instanceof CategoryNotFoundError) {
      status = HttpStatus.NOT_FOUND;
      message = exception.message;
    } else if (
      exception instanceof CategoryCannotBeOwnParentError ||
      exception instanceof CategoryHasChildrenError ||
      exception instanceof CategoryReferencedByComponentsError ||
      exception instanceof InvalidCategoryCodeError ||
      exception instanceof InvalidCategoryNameError
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
