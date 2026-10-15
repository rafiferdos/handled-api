import { z } from 'zod';
import { SourceType } from '../../proposal/contracts/evidence.schema.js';
import {
  readToolArgumentSchemas,
  readToolCallSchema,
  readToolResultSchema,
} from './read-tool.contracts.js';

const customerId = '11111111-1111-4111-8111-111111111111';
const source = {
  sourceType: SourceType.KNOWLEDGE,
  sourceRefId: 'KB-REFUND-v1#2',
  title: 'Refund policy',
  excerpt: 'Only duplicate settled payments are eligible.',
  contentHash: 'a'.repeat(64),
  observedAt: '2026-10-14T00:00:00Z',
  documentId: customerId,
  chunkId: customerId,
  documentVersion: 1,
  score: 0.8,
};

describe('read-only tool boundary', () => {
  it('admits exactly the documented five names and supplies the bounded RAG default', () => {
    expect(Object.keys(readToolArgumentSchemas)).toHaveLength(5);
    expect(
      readToolCallSchema.parse({
        name: 'searchKnowledge',
        arguments: { query: 'refund policy' },
      }),
    ).toEqual({
      name: 'searchKnowledge',
      arguments: { query: 'refund policy', topK: 5 },
    });
  });

  it.each([
    'refundPayment',
    'cancelSubscription',
    'updateAccess',
    '__proto__',
    'toString',
  ])('rejects non-read tool %s', (name) => {
    expect(
      readToolCallSchema.safeParse({ name, arguments: { customerId } }).success,
    ).toBe(false);
  });

  it.each([
    {
      name: 'getCustomerProfile',
      arguments: { customerId, workspaceId: customerId },
    },
    { name: 'getCustomerProfile', arguments: { customerId: 'CUS-1001' } },
    {
      name: 'searchKnowledge',
      arguments: { query: 'refund', status: 'DRAFT' },
    },
    { name: 'searchKnowledge', arguments: { query: '  ' } },
    { name: 'searchKnowledge', arguments: { query: 'refund', topK: 21 } },
    { name: 'searchKnowledge', arguments: { query: 'refund', topK: '5' } },
    {
      name: 'listCustomerPayments',
      arguments: {
        customerId,
        from: '2026-10-15T00:00:00Z',
        to: '2026-10-14T00:00:00Z',
      },
    },
  ])('rejects scope, type or range expansion %#', (call) => {
    expect(readToolCallSchema.safeParse(call).success).toBe(false);
  });

  it('compares payment ranges as instants, including timezone offsets', () => {
    expect(
      readToolArgumentSchemas.listCustomerPayments.safeParse({
        customerId,
        from: '2026-10-15T06:00:00+06:00',
        to: '2026-10-15T00:00:00Z',
      }).success,
    ).toBe(true);
  });

  it('validates an owner-specific projection and retains immutable versioned citations', () => {
    const schema = readToolResultSchema(
      z.strictObject({ customerId: z.uuid() }),
    );
    const result = schema.parse({
      data: { customerId },
      sources: [source],
      missingFacts: [],
    });
    expect(result.sources[0]).toEqual(source);
    expect(Object.isFrozen(result.sources)).toBe(true);
    expect(
      schema.safeParse({
        ...result,
        data: { customerId, serviceRoleKey: 'secret' },
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...result,
        sources: [{ ...source, documentVersion: 0 }],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...result,
        sources: [{ ...source, contentHash: 'unverifiable' }],
      }).success,
    ).toBe(false);
  });
});
