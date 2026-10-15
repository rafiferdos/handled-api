import { z } from 'zod';
import { IDEMPOTENCY_KEY_PATTERN } from '../../../common/contracts/idempotency.contracts.js';
import {
  positiveIntegerSchema,
  resourceIdSchema,
  textSchema,
} from '../../ai/contracts/contract-primitives.js';
import { recommendationSchema } from './recommendation.schema.js';

// SERVER-ONLY Lead -> D contract proposal. Schema validity does not prove human
// approval. D must reload the exact stored decision/version and recheck tenant,
// actor/revocation, target, evidence, policy, atomic admission and business state.
export const approvedActionCommandSchema = z
  .strictObject({
    workspaceId: resourceIdSchema,
    ticketId: resourceIdSchema,
    proposalId: resourceIdSchema,
    proposalVersion: positiveIntegerSchema,
    decisionId: resourceIdSchema,
    actorUserId: resourceIdSchema,
    membershipId: resourceIdSchema,
    targetId: resourceIdSchema,
    recommendation: recommendationSchema,
    idempotencyKey: z.string().regex(IDEMPOTENCY_KEY_PATTERN),
    requestId: textSchema(128),
    traceId: textSchema(128).optional(),
  })
  .readonly();

export type ApprovedActionCommand = z.infer<typeof approvedActionCommandSchema>;

export interface ApprovedActionAdmission {
  readonly actionExecutionId: string;
  readonly status: 'QUEUED';
}

export interface ProposalIdempotencyScope {
  readonly workspaceId: string;
  readonly actorUserId: string;
  readonly operation: 'approve' | 'edit' | 'reject' | 'escalate';
  readonly proposalId: string;
  readonly key: string;
}

// Transaction coordination and the durable implementation remain owner-reviewed
// Step 2/8 work. No DI provider or fake admission implementation is registered.
export interface ApprovedActionAdmissionPort {
  admit(command: ApprovedActionCommand): Promise<ApprovedActionAdmission>;
}
