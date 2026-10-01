import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import {
  SpatialModelNotFoundError,
  SpatialAnchorNotFoundError,
  SpatialNodeNotFoundError,
  SpatialModelInUseError,
  SpatialAnchorDoesNotBelongToModelError,
  SpatialNodeCannotParentToSelfError,
  SpatialHierarchyCycleError,
  SpatialHierarchyLocationMismatchError,
  InvalidSpatialDimensionsError,
  InvalidSpatialModelCodeError,
  InvalidSpatialModelNameError,
  InvalidSpatialAnchorCodeError,
  InvalidSpatialAnchorNameError,
  LocationNotFoundError,
  SpatialAnchorAlreadyOccupiedError,
  SpatialNodeHasChildrenError,
} from '@ananya/inventory';
import type { Response } from 'express';
import {
  isPostgresErrorCode,
  POSTGRES_FOREIGN_KEY_VIOLATION,
  POSTGRES_UNIQUE_VIOLATION,
} from '../common/utils/postgres-error';

@Catch()
export class SpatialExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (
      exception instanceof SpatialModelNotFoundError ||
      exception instanceof SpatialAnchorNotFoundError ||
      exception instanceof SpatialNodeNotFoundError ||
      exception instanceof LocationNotFoundError
    ) {
      status = HttpStatus.NOT_FOUND;
      message = exception.message;
    } else if (
      exception instanceof SpatialAnchorDoesNotBelongToModelError ||
      exception instanceof SpatialNodeCannotParentToSelfError ||
      exception instanceof SpatialHierarchyCycleError ||
      exception instanceof SpatialHierarchyLocationMismatchError ||
      exception instanceof InvalidSpatialDimensionsError ||
      exception instanceof InvalidSpatialModelCodeError ||
      exception instanceof InvalidSpatialModelNameError ||
      exception instanceof InvalidSpatialAnchorCodeError ||
      exception instanceof InvalidSpatialAnchorNameError
    ) {
      status = HttpStatus.BAD_REQUEST;
      message = exception.message;
    } else if (
      exception instanceof SpatialModelInUseError ||
      exception instanceof SpatialAnchorAlreadyOccupiedError ||
      exception instanceof SpatialNodeHasChildrenError
    ) {
      status = HttpStatus.CONFLICT;
      message = exception.message;
    } else if (isPostgresErrorCode(exception, POSTGRES_UNIQUE_VIOLATION)) {
      status = HttpStatus.CONFLICT;
      message =
        'A spatial record with this unique identifier or location mapping already exists.';
    } else if (isPostgresErrorCode(exception, POSTGRES_FOREIGN_KEY_VIOLATION)) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Referenced entity in spatial definition does not exist.';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message =
        typeof res === 'string'
          ? res
          : (res as { message?: string | string[] }).message
            ? Array.isArray((res as { message: string | string[] }).message)
              ? (res as { message: string[] }).message.join(', ')
              : (res as { message: string }).message
            : exception.message;
    } else if (exception instanceof Error) {
      message = exception.message;
      if (message.includes('already has a spatial representation')) {
        status = HttpStatus.CONFLICT;
      } else {
        status = HttpStatus.BAD_REQUEST;
      }
    }

    response.status(status).json({
      statusCode: status,
      error: HttpStatus[status] || 'Error',
      message,
    });
  }
}
