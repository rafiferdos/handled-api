import { ActionType } from '../../../common/contracts/domain.enums.js';
import { isIdempotencyKey } from '../../../common/contracts/idempotency.contracts.js';
import { approvedActionCommandSchema } from './approved-action.contracts.js';

const id = '11111111-1111-4111-8111-111111111111';
const command = {
  workspaceId: id,
  ticketId: id,
  proposalId: id,
  proposalVersion: 1,
  decisionId: id,
  actorUserId: id,
  membershipId: id,
  targetId: id,
  recommendation: {
    type: ActionType.CANCEL_AT_PERIOD_END,
    targetRef: 'SUB-1002',
    params: {},
  },
  idempotencyKey: 'approval-1',
  requestId: 'req_1',
};

describe('server-only action handoff contract', () => {
  it('requires a concrete decision, exact version, actor/membership and resolved target', () => {
    expect(approvedActionCommandSchema.parse(command)).toEqual(command);
    for (const field of [
      'decisionId',
      'proposalVersion',
      'actorUserId',
      'membershipId',
      'targetId',
    ]) {
      expect(
        approvedActionCommandSchema.safeParse({
          ...command,
          [field]: undefined,
        }).success,
      ).toBe(false);
    }
  });

  it('does not accept model/client approval flags or an unresolved display ID', () => {
    expect(
      approvedActionCommandSchema.safeParse({ ...command, approved: true })
        .success,
    ).toBe(false);
    expect(
      approvedActionCommandSchema.safeParse({
        ...command,
        targetId: 'SUB-1002',
      }).success,
    ).toBe(false);
    expect(
      approvedActionCommandSchema.safeParse({
        ...command,
        recommendation: null,
      }).success,
    ).toBe(false);
  });

  it.each(['', ' ', 'key,other', 'x'.repeat(129), 'key.valid_1-2'])(
    'uses the same key admission rule as HTTP for %#',
    (idempotencyKey) => {
      expect(
        approvedActionCommandSchema.safeParse({ ...command, idempotencyKey })
          .success,
      ).toBe(isIdempotencyKey(idempotencyKey));
    },
  );
});
