import { createValidationPipe } from '../../../common/pipes/validation.pipe.js';
import {
  ActionType,
  InvestigationStatus,
} from '../../../common/contracts/domain.enums.js';
import {
  InvestigationListQueryDto,
  InvestigationParamsDto,
} from '../../investigation/dto/investigation-request.dto.js';
import {
  ApproveProposalRequestDto,
  EditProposalRequestDto,
  ReasonedProposalDecisionDto,
} from './proposal-request.dto.js';

const validEdit = {
  expectedVersion: 1,
  summary: 'Verified duplicate charge',
  replyDraft: 'We will review this charge.',
  recommendation: {
    type: ActionType.REFUND_DUPLICATE_PAYMENT,
    targetRef: 'PAY-9002',
    params: { amountMinor: 2900, currency: 'USD' },
  },
};

describe('Lead HTTP input contracts', () => {
  const pipe = createValidationPipe();

  it.each([0, -1, 1.2, Number.MAX_SAFE_INTEGER + 1, '1', null, undefined])(
    'rejects an invalid expectedVersion %s',
    async (expectedVersion) => {
      await expect(
        pipe.transform(
          { expectedVersion },
          { type: 'body', metatype: ApproveProposalRequestDto },
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    },
  );

  it.each(['workspaceId', 'actorUserId', 'status', 'confidence', 'approved'])(
    'rejects client-controlled authority field %s',
    async (field) => {
      await expect(
        pipe.transform(
          { expectedVersion: 1, [field]: 'private-value' },
          { type: 'body', metatype: ApproveProposalRequestDto },
        ),
      ).rejects.toThrow();
    },
  );

  it('accepts a versioned full edit or an explicit no-action edit', async () => {
    expect(
      await pipe.transform(validEdit, {
        type: 'body',
        metatype: EditProposalRequestDto,
      }),
    ).toEqual(validEdit);
    expect(
      await pipe.transform(
        { ...validEdit, recommendation: null },
        { type: 'body', metatype: EditProposalRequestDto },
      ),
    ).toMatchObject({ recommendation: null });
  });

  it.each([
    { ...validEdit, recommendation: undefined },
    { ...validEdit, summary: '  ' },
    {
      ...validEdit,
      recommendation: {
        ...validEdit.recommendation,
        params: { amountMinor: 0, currency: 'USD' },
      },
    },
    {
      ...validEdit,
      recommendation: {
        ...validEdit.recommendation,
        params: { amountMinor: 2900, currency: 'USD', override: true },
      },
    },
  ])(
    'rejects incomplete or unsafe edits %# without echoing their contents',
    async (body) => {
      try {
        await pipe.transform(body, {
          type: 'body',
          metatype: EditProposalRequestDto,
        });
        expect.unreachable();
      } catch (error) {
        expect(error).toHaveProperty('code', 'VALIDATION_ERROR');
        expect(JSON.stringify(error)).not.toContain('PAY-9002');
      }
    },
  );

  it.each([null, '', '  ', 'x'.repeat(2001)])(
    'requires meaningful bounded decision reasons %#',
    async (reason) => {
      await expect(
        pipe.transform(
          { expectedVersion: 1, reason },
          { type: 'body', metatype: ReasonedProposalDecisionDto },
        ),
      ).rejects.toThrow();
    },
  );

  it('rejects explicit null for optional fields instead of treating it as omitted', async () => {
    await expect(
      pipe.transform(
        { expectedVersion: 1, reason: null },
        { type: 'body', metatype: ApproveProposalRequestDto },
      ),
    ).rejects.toThrow();
    await expect(
      pipe.transform(
        { status: null },
        { type: 'query', metatype: InvestigationListQueryDto },
      ),
    ).rejects.toThrow();
  });

  it('reuses bounded pagination and allowlisted filters', async () => {
    expect(
      await pipe.transform(
        { page: '2', status: InvestigationStatus.RUNNING },
        { type: 'query', metatype: InvestigationListQueryDto },
      ),
    ).toMatchObject({ page: 2, limit: 20, status: 'RUNNING' });
    await expect(
      pipe.transform(
        { limit: '101' },
        { type: 'query', metatype: InvestigationListQueryDto },
      ),
    ).rejects.toThrow();
    await expect(
      pipe.transform(
        { status: 'APPROVED' },
        { type: 'query', metatype: InvestigationListQueryDto },
      ),
    ).rejects.toThrow();
  });

  it('validates tenant and resource UUIDs as separate route parameters', async () => {
    await expect(
      pipe.transform(
        { workspaceId: 'not-a-workspace', investigationId: 'INV-1001' },
        { type: 'param', metatype: InvestigationParamsDto },
      ),
    ).rejects.toThrow();
  });
});
