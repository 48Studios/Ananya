import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { HttpLoggingInterceptor } from './http-logging.interceptor';

describe('HttpLoggingInterceptor', () => {
  const makeContext = () => {
    const headers: Record<string, string> = {};
    const response = {
      statusCode: 201,
      setHeader: jest.fn((name: string, value: string) => {
        headers[name] = value;
      }),
      once: jest.fn(),
      writableFinished: false,
    };
    const request = {
      method: 'POST',
      originalUrl: '/components',
      url: '/components',
      ip: '127.0.0.1',
      route: { path: '/components' },
      get: jest.fn((name: string) =>
        name === 'x-request-id' ? 'request-from-test' : undefined,
      ),
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    return { context, response, headers };
  };

  it('adds the incoming request ID to the response and passes through success', (done) => {
    const interceptor = new HttpLoggingInterceptor();
    const { context, response, headers } = makeContext();
    const next: CallHandler = { handle: () => of({ ok: true }) };

    interceptor.intercept(context, next).subscribe({
      next: (value) => {
        expect(value).toEqual({ ok: true });
        expect(response.setHeader).toHaveBeenCalledWith(
          'X-Request-Id',
          'request-from-test',
        );
        expect(headers['X-Request-Id']).toBe('request-from-test');
        done();
      },
      error: done,
    });
  });

  it('rethrows errors so exception filters can format the response', (done) => {
    const interceptor = new HttpLoggingInterceptor();
    const { context } = makeContext();
    const error = new Error('database failure');
    const next: CallHandler = { handle: () => throwError(() => error) };

    interceptor.intercept(context, next).subscribe({
      next: () => {
        done.fail('Expected the error to be rethrown');
      },
      error: (received: unknown) => {
        expect(received).toBe(error);
        done();
      },
    });
  });
});
