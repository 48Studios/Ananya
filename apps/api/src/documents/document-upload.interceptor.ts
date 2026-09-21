import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Observable, catchError, throwError } from 'rxjs';
import {
  formatDocumentBytes,
  MAX_DOCUMENT_UPLOAD_BYTES,
} from './document-file';

/** Largest accepted text field in a documentation multipart request. */
const MAX_MULTIPART_FIELD_BYTES = 32 * 1024;

/**
 * Multipart interceptor for documentation uploads.
 *
 * Wraps Nest's `FileInterceptor` so the multer limit and the error it produces
 * are stated in terms of this module's contract:
 *
 *  - the in-memory file limit is {@link MAX_DOCUMENT_UPLOAD_BYTES}, so an
 *    oversized request is rejected while it is being read rather than after it
 *    has been buffered;
 *  - a rejected upload becomes a `413` with the same wording the service uses,
 *    instead of surfacing as an unhandled multer error;
 *  - unexpected or oversized fields become `400`s naming the problem.
 *
 * MIME validation deliberately stays in the service: it needs the file name and
 * the resolved type together to produce a useful message.
 */
@Injectable()
export class DocumentFileInterceptor implements NestInterceptor {
  private readonly inner = new (FileInterceptor('file', {
    limits: {
      fileSize: MAX_DOCUMENT_UPLOAD_BYTES,
      files: 1,
      fields: 20,
      fieldSize: MAX_MULTIPART_FIELD_BYTES,
    },
  }))();

  /**
   * Nest's `FileInterceptor` is asynchronous before it hands over to the route
   * handler: the multipart body is parsed first, and a parse failure rejects
   * before any handler stream exists. Both stages are funnelled through
   * {@link mapUploadError} so the caller always receives a documented HTTP
   * error, and the handler stream is returned unchanged (never re-wrapped — an
   * Observable emitted as a *value* would be serialised instead of the result).
   */
  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    let stream: Observable<unknown>;
    try {
      stream = await this.inner.intercept(context, next);
    } catch (error) {
      throw mapUploadError(error);
    }

    return stream.pipe(
      catchError((error: unknown) => throwError(() => mapUploadError(error))),
    );
  }
}

/** Translates upload-stage failures into documented HTTP errors. */
export function mapUploadError(error: unknown): unknown {
  const code = (error as { code?: unknown } | null)?.code;

  // Nest already converts multer's LIMIT_FILE_SIZE into a 413; the message is
  // replaced here so the client learns the actual configured limit.
  if (code === 'LIMIT_FILE_SIZE' || error instanceof PayloadTooLargeException) {
    return new PayloadTooLargeException(
      `File exceeds the maximum upload size of ${formatDocumentBytes(MAX_DOCUMENT_UPLOAD_BYTES)}.`,
    );
  }

  if (code === 'LIMIT_UNEXPECTED_FILE') {
    return new BadRequestException(
      'Unexpected file field. Upload a single file under the "file" field.',
    );
  }

  if (
    code === 'LIMIT_FIELD_VALUE' ||
    code === 'LIMIT_FIELD_COUNT' ||
    code === 'LIMIT_FILE_COUNT' ||
    code === 'LIMIT_PART_COUNT'
  ) {
    return new BadRequestException(
      'Upload metadata is too large. Shorten the description or the tag list.',
    );
  }

  return error;
}
