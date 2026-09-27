import type { Request } from 'express';

/**
 * Extracts the authoritative client IP address behind reverse proxies such as
 * Caddy, Nginx, Cloudflare, or AWS ALB.
 *
 * Headers evaluated in precedence order:
 * 1. cf-connecting-ip / true-client-ip (Cloudflare)
 * 2. x-real-ip (Caddy / Nginx)
 * 3. x-forwarded-for (standard proxy chain; takes the leftmost/client IP)
 * 4. req.ip (Express with trust proxy enabled)
 * 5. socket remoteAddress (direct TCP socket)
 */
export function getClientIp(req: Request): string {
  // 1. Cloudflare headers
  const cfConnectingIp = req.headers?.['cf-connecting-ip'];
  if (typeof cfConnectingIp === 'string' && cfConnectingIp.trim()) {
    return cleanIp(cfConnectingIp.trim());
  }

  const trueClientIp = req.headers?.['true-client-ip'];
  if (typeof trueClientIp === 'string' && trueClientIp.trim()) {
    return cleanIp(trueClientIp.trim());
  }

  // 2. X-Real-IP (Caddy / Nginx configured header)
  const xRealIp = req.headers?.['x-real-ip'];
  if (typeof xRealIp === 'string' && xRealIp.trim()) {
    return cleanIp(xRealIp.trim());
  }

  // 3. X-Forwarded-For (standard proxy chain e.g. "client, proxy1, proxy2")
  const xForwardedFor = req.headers?.['x-forwarded-for'];
  if (typeof xForwardedFor === 'string' && xForwardedFor.trim()) {
    const parts = xForwardedFor.split(',');
    const client = parts[0]?.trim();
    if (client) {
      return cleanIp(client);
    }
  } else if (Array.isArray(xForwardedFor) && xForwardedFor.length > 0) {
    const first = xForwardedFor[0];
    if (typeof first === 'string' && first.trim()) {
      const client = first.split(',')[0]?.trim();
      if (client) {
        return cleanIp(client);
      }
    }
  }

  // 4. Express req.ip (when trust proxy is enabled)
  if (req.ip) {
    return cleanIp(req.ip);
  }

  // 5. Socket remote address
  const remote = req.socket?.remoteAddress;
  if (remote) {
    return cleanIp(remote);
  }

  return '127.0.0.1';
}

/**
 * Normalizes an IP address by:
 * - Stripping IPv6-mapped IPv4 prefix ("::ffff:192.0.2.1" -> "192.0.2.1")
 * - Stripping accidental port suffix on IPv4 ("192.0.2.1:54321" -> "192.0.2.1")
 * - Trimming whitespace
 */
export function cleanIp(raw: string): string {
  let ip = raw.trim();

  // Strip IPv4-mapped IPv6 prefix
  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }

  // If formatted as IPv4:port, strip port
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/.test(ip)) {
    ip = ip.split(':')[0]!;
  }

  return ip;
}
