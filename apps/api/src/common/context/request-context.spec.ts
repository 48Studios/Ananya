import type { Request, Response, NextFunction } from 'express';
import { RequestContext, RequestContextMiddleware } from './request-context';

describe('RequestContext', () => {
  it('stores and retrieves context within async boundary', (done) => {
    const store = {
      clientIp: '203.0.113.100',
      userAgent: 'Mozilla/5.0 Test',
      requestId: 'test-req-123',
      userId: 'usr-1',
      userEmail: 'user@example.com',
    };

    RequestContext.run(store, () => {
      expect(RequestContext.getClientIp()).toBe('203.0.113.100');
      expect(RequestContext.getUser()).toEqual({
        userId: 'usr-1',
        userEmail: 'user@example.com',
      });
      done();
    });
  });

  it('updates user in active context', (done) => {
    const store = {
      clientIp: '203.0.113.100',
      requestId: 'test-req-123',
    };

    RequestContext.run(store, () => {
      expect(RequestContext.getUser()?.userId).toBeUndefined();

      RequestContext.setUser({ id: 'usr-99', email: 'admin@example.test' });

      expect(RequestContext.getUser()).toEqual({
        userId: 'usr-99',
        userEmail: 'admin@example.test',
      });
      done();
    });
  });

  it('falls back safely when outside async context', () => {
    expect(RequestContext.getClientIp()).toBe('127.0.0.1');
    expect(RequestContext.getUser()).toBeUndefined();
  });

  it('middleware initializes RequestContext with proxy-resolved IP', (done) => {
    const middleware = new RequestContextMiddleware();
    const req = {
      headers: {
        'x-forwarded-for': '198.51.100.88, 127.0.0.1',
        'user-agent': 'Caddy Test Client',
      },
    } as unknown as Request;

    const res = {} as unknown as Response;
    const next: NextFunction = () => {
      expect(RequestContext.getClientIp()).toBe('198.51.100.88');
      expect(RequestContext.get()?.userAgent).toBe('Caddy Test Client');
      done();
    };

    middleware.use(req, res, next);
  });
});
