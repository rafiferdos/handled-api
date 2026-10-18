import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { AppException } from '../../common/errors/app.exception.js';

export interface SupportProxyContext {
  origin: string | undefined;
  ip: string;
  clientIp?: string;
  timestamp?: string;
  signature?: string;
}

/** Trust client identity only when the private support proxy attests to it. */
export function resolveSupportClientIp(
  secret: string | undefined,
  slug: string,
  context: SupportProxyContext,
  now = Date.now(),
): string {
  if (!secret) return context.ip;
  if (secret.length < 32) throw new AppException('DEPENDENCY_UNAVAILABLE');
  const { clientIp, timestamp, signature, origin } = context;
  if (
    !clientIp ||
    !isIP(clientIp) ||
    !timestamp ||
    !/^[1-9]\d{0,11}$/.test(timestamp) ||
    Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 60 ||
    !signature ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    !origin
  )
    throw new AppException('FORBIDDEN');
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}\n${slug}\n${origin}\n${clientIp}`)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex')))
    throw new AppException('FORBIDDEN');
  return clientIp;
}
