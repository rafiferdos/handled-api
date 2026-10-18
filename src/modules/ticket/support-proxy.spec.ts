import { createHmac } from 'node:crypto';
import { resolveSupportClientIp } from './support-proxy.js';

const secret = 'synthetic-proxy-secret-with-at-least-32-characters';
const now = 1800000000000;
const base = { origin: 'https://support.example.invalid', ip: '127.0.0.1' };
function signed(clientIp = '203.0.113.8', timestamp = String(now / 1000)) {
  return {
    ...base,
    clientIp,
    timestamp,
    signature: createHmac('sha256', secret)
      .update(`${timestamp}\nacme-cloud\n${base.origin}\n${clientIp}`)
      .digest('hex'),
  };
}
it('preserves socket identity when signed proxy mode is disabled', () => {
  expect(resolveSupportClientIp(undefined, 'acme-cloud', signed(), now)).toBe(
    base.ip,
  );
});
it.each(['203.0.113.8', '2001:db8::1'])(
  'accepts a correctly signed proxied IP %s',
  (ip) => {
    expect(resolveSupportClientIp(secret, 'acme-cloud', signed(ip), now)).toBe(
      ip,
    );
  },
);
it('binds the signature to the workspace, origin, timestamp and client IP', () => {
  for (const context of [
    { ...base },
    { ...signed(), clientIp: '203.0.113.9' },
    { ...signed(), origin: 'https://evil.example.invalid' },
    { ...signed(), timestamp: String(now / 1000 + 1) },
    { ...signed(), signature: 'f'.repeat(64) },
    { ...signed(), signature: 'bad' },
    signed('203.0.113.8, 203.0.113.9'),
    signed('not-an-ip'),
    signed('203.0.113.8', String(now / 1000 - 61)),
    signed('203.0.113.8', String(now / 1000 + 61)),
    signed('203.0.113.8', `0${String(now / 1000)}`),
  ])
    expect(() =>
      resolveSupportClientIp(secret, 'acme-cloud', context, now),
    ).toThrow();
  expect(() =>
    resolveSupportClientIp(secret, 'foreign-cloud', signed(), now),
  ).toThrow();
});
it('accepts the inclusive clock-skew boundary and rejects an undersized configured secret', () => {
  expect(
    resolveSupportClientIp(
      secret,
      'acme-cloud',
      signed('203.0.113.8', String(now / 1000 - 60)),
      now,
    ),
  ).toBe('203.0.113.8');
  expect(() =>
    resolveSupportClientIp('short', 'acme-cloud', signed(), now),
  ).toThrow();
});
