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
  SpatialModelConflictError,
  SpatialAnchorConflictError,
  SpatialLayoutNotFoundError,
  SpatialLayoutRevisionConflictError,
  SpatialNodeOwnershipConflictError,
  ParentCannotBeSlotError,
  InvalidParametricConfigError,
  ConcurrentHierarchyMutationError,
  InactiveLayoutParentError,
  InactiveLocationMappingError,
  DuplicateLocationMappingError,
  DuplicateSlotMappingError,
  IncompatibleLocationKindError,
  IncompatibleSlotKindMappingError,
  IncompatibleLayoutRootKindError,
  InvalidSlotIdError,
  PublishedLayoutAlreadyExistsError,
  CannotDeleteNonDraftLayoutError,
  CannotModifyArchivedLayoutError,
  MalformedSupersededGeometryError,
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

    // 1. Specialized layout conflict errors
    if (exception instanceof SpatialLayoutRevisionConflictError) {
      response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        error: 'REVISION_CONFLICT',
        message: exception.message,
        currentRevision: exception.currentRevision,
        expectedRevision: exception.expectedRevision,
        updatedBy: exception.updatedBy,
        updatedAt: exception.updatedAt,
      });
      return;
    }

    if (exception instanceof SpatialNodeOwnershipConflictError) {
      response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        error: 'SPATIAL_NODE_OWNERSHIP_CONFLICT',
        message: exception.message,
        conflictingNodes: exception.conflictingNodes,
      });
      return;
    }

    if (exception instanceof PublishedLayoutAlreadyExistsError) {
      response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        error: 'PUBLISHED_LAYOUT_ALREADY_EXISTS',
        message: exception.message,
        parentLocationId: exception.parentLocationId,
        existingLayoutId: exception.existingLayoutId,
        existingLayoutCode: exception.existingLayoutCode,
      });
      return;
    }

    if (exception instanceof CannotDeleteNonDraftLayoutError) {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'CANNOT_DELETE_NON_DRAFT_LAYOUT',
        message: exception.message,
        layoutId: exception.layoutId,
        status: exception.status,
      });
      return;
    }

    if (exception instanceof CannotModifyArchivedLayoutError) {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'CANNOT_MODIFY_ARCHIVED_LAYOUT',
        message: exception.message,
        layoutId: exception.layoutId,
      });
      return;
    }

    if (exception instanceof MalformedSupersededGeometryError) {
      response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'MALFORMED_SUPERSEDED_GEOMETRY',
        message: exception.message,
        nodeId: exception.nodeId,
        locationId: exception.locationId,
        reason: exception.reason,
      });
      return;
    }

    if (exception instanceof InvalidParametricConfigError) {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'INVALID_PARAMETRIC_CONFIG',
        message: exception.message,
        validationErrors: exception.validationErrors,
      });
      return;
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (
      exception instanceof SpatialModelNotFoundError ||
      exception instanceof SpatialAnchorNotFoundError ||
      exception instanceof SpatialNodeNotFoundError ||
      exception instanceof SpatialLayoutNotFoundError ||
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
      exception instanceof InvalidSpatialAnchorNameError ||
      exception instanceof ParentCannotBeSlotError ||
      exception instanceof IncompatibleLocationKindError ||
      exception instanceof InvalidSlotIdError
    ) {
      status = HttpStatus.BAD_REQUEST;
      message = exception.message;
    } else if (
      exception instanceof SpatialModelInUseError ||
      exception instanceof SpatialAnchorAlreadyOccupiedError ||
      exception instanceof SpatialNodeHasChildrenError ||
      exception instanceof SpatialModelConflictError ||
      exception instanceof SpatialAnchorConflictError ||
      exception instanceof DuplicateLocationMappingError ||
      exception instanceof DuplicateSlotMappingError
    ) {
      status = HttpStatus.CONFLICT;
      message = exception.message;
    } else if (exception instanceof InactiveLayoutParentError) {
      response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'INACTIVE_LAYOUT_PARENT',
        message: exception.message,
        parentLocationId: exception.parentLocationId,
      });
      return;
    } else if (
      exception instanceof ConcurrentHierarchyMutationError ||
      exception instanceof InactiveLocationMappingError
    ) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      message = exception.message;
    } else if (exception instanceof IncompatibleSlotKindMappingError) {
      response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: exception.code,
        message: exception.message,
        violations: exception.violations,
      });
      return;
    } else if (exception instanceof IncompatibleLayoutRootKindError) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      message = exception.message;
    } else if (isPostgresErrorCode(exception, POSTGRES_UNIQUE_VIOLATION)) {
      const errCandidate = exception as {
        constraint?: string;
        cause?: { constraint?: string };
      };
      const constraint =
        errCandidate?.constraint || errCandidate?.cause?.constraint;
      if (constraint === 'spatial_layouts_active_parent_unique') {
        response.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          error: 'PUBLISHED_LAYOUT_ALREADY_EXISTS',
          message:
            'Another layout is already published for this container location. It must be archived before a new layout can be published.',
        });
        return;
      }
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
