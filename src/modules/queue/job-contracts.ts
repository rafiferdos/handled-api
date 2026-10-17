import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';

export const jobKindSchema = z.enum([
  'investigation',
  'action',
  'knowledge-index',
]);
export type JobKind = z.infer<typeof jobKindSchema>;
export const deliverySchema = z.strictObject({
  outboxId: z.uuid(),
  workspaceId: z.uuid(),
  lockToken: z.uuid(),
});
export type JobDelivery = z.infer<typeof deliverySchema>;
export const intentSchema = z.strictObject({
  requestId: z.string().min(1).max(128),
});

export function enqueueJob(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  kind: JobKind,
  aggregateId: string,
  requestId: string,
) {
  return tx.outboxEvent.create({
    data: {
      workspaceId,
      type: `job.${kind}`,
      aggregateId,
      payload: intentSchema.parse({ requestId }),
    },
  });
}
