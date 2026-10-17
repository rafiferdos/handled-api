import { createHash } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';

export function canonicalJson(value: Prisma.InputJsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item) => (item === null ? 'null' : canonicalJson(item))).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => {
      const item = (value as Prisma.InputJsonObject)[key];
      if (item === undefined) throw new TypeError('Undefined is not JSON');
      return `${JSON.stringify(key)}:${item === null ? 'null' : canonicalJson(item)}`;
    })
    .join(',')}}`;
}

export const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');
