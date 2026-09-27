import type { Request } from 'express';
import { getClientIp, cleanIp } from './client-ip.util';

describe('client-ip.util', () => {
  describe('cleanIp', () => {
    it('strips IPv4-mapped IPv6 prefix', () => {
      expect(cleanIp('::ffff:203.0.113.195')).toBe('203.0.113.195');
    });

    it('strips port suffix from IPv4 address', () => {
      expect(cleanIp('203.0.113.195:48123')).toBe('203.0.113.195');
    });

    it('trims whitespace', () => {
      expect(cleanIp('  198.51.100.42  ')).toBe('198.51.100.42');
    });

    it('preserves native IPv6 addresses', () => {
      expect(cleanIp('2001:db8::1')).toBe('2001:db8::1');
    });
  });

  describe('getClientIp', () => {
    it('extracts client IP from Caddy/Nginx X-Real-IP header', () => {
      const req = {
        headers: {
          'x-real-ip': '203.0.113.50',
        },
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;

      expect(getClientIp(req)).toBe('203.0.113.50');
    });

    it('extracts leftmost client IP from X-Forwarded-For chain behind Caddy proxy', () => {
      const req = {
        headers: {
          'x-forwarded-for': '198.51.100.75, 10.0.0.1, 127.0.0.1',
        },
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;

      expect(getClientIp(req)).toBe('198.51.100.75');
    });

    it('prioritizes CF-Connecting-IP when behind Cloudflare + Caddy', () => {
      const req = {
        headers: {
          'cf-connecting-ip': '192.0.2.10',
          'x-real-ip': '10.0.0.2',
          'x-forwarded-for': '10.0.0.2, 127.0.0.1',
        },
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;

      expect(getClientIp(req)).toBe('192.0.2.10');
    });

    it('extracts from True-Client-IP header if present', () => {
      const req = {
        headers: {
          'true-client-ip': '192.0.2.99',
        },
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;

      expect(getClientIp(req)).toBe('192.0.2.99');
    });

    it('falls back to req.ip when headers are missing', () => {
      const req = {
        headers: {},
        ip: '198.51.100.1',
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;

      expect(getClientIp(req)).toBe('198.51.100.1');
    });

    it('falls back to socket remoteAddress if req.ip and headers are missing', () => {
      const req = {
        headers: {},
        socket: { remoteAddress: '192.168.1.50' },
      } as unknown as Request;

      expect(getClientIp(req)).toBe('192.168.1.50');
    });

    it('returns 127.0.0.1 if completely empty', () => {
      const req = {
        headers: {},
      } as unknown as Request;

      expect(getClientIp(req)).toBe('127.0.0.1');
    });
  });
});
