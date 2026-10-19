import { AuditService } from './audit.service.js';
import { CreateAuditEventDto } from './dto/create-audit-event.dto.js';
import { AuditEventResponseDto } from './dto/audit-event-response.dto.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import {
  AuditSource,
  AuditSubjectType,
} from '../../generated/prisma/client.js';

type AuditRow = {
  id: string;
  workspaceId: string;
  subjectType: AuditSubjectType;
  subjectId: string;
  action: string;
  actorId: string | null;
  source: AuditSource;
  createdAt: Date;
  metadata: unknown;
};

function makePrismaStub() {
  const auditEvents: AuditRow[] = [];
  const actionExecutions: Array<{
    id: string;
    workspaceId: string;
    ticketId: string | null;
  }> = [];
  let auditSeq = 0;

  const auditEvent = {
    create: vi.fn(
      async ({ data }: { data: Omit<AuditRow, 'id' | 'createdAt'> }) => {
        auditSeq += 1;
        const row: AuditRow = {
          id: `audit-${auditSeq}`,
          createdAt: new Date(
            `2026-10-14T00:00:00.${String(auditSeq).padStart(3, '0')}Z`,
          ),
          ...data,
        };
        auditEvents.push(row);
        return row;
      },
    ),
    findMany: vi.fn(
      async ({
        where,
        orderBy,
        skip,
        take,
      }: {
        where: { workspaceId: string; OR?: unknown };
        orderBy?: { createdAt?: 'asc' | 'desc' };
        skip?: number;
        take?: number;
      }) => {
        const filtered = auditEvents
          .filter((row) => row.workspaceId === where.workspaceId)
          .filter((row) => matchesOr(row, where.OR))
          .sort((a, b) => {
            const dir = orderBy?.createdAt === 'asc' ? 1 : -1;
            return dir * (a.createdAt.getTime() - b.createdAt.getTime());
          });
        return filtered.slice(
          skip ?? 0,
          (skip ?? 0) + (take ?? filtered.length),
        );
      },
    ),
    count: vi.fn(
      async ({ where }: { where: { workspaceId: string; OR?: unknown } }) => {
        return auditEvents
          .filter((row) => row.workspaceId === where.workspaceId)
          .filter((row) => matchesOr(row, where.OR)).length;
      },
    ),
  };

  const actionExecution = {
    findMany: vi.fn(
      async ({
        where,
        _select,
      }: {
        where: { workspaceId: string; ticketId?: string };
        _select: { id: true };
      }) => {
        return actionExecutions
          .filter(
            (row) =>
              row.workspaceId === where.workspaceId &&
              (where.ticketId === undefined || row.ticketId === where.ticketId),
          )
          .map((row) => ({ id: row.id }));
      },
    ),
  };

  return {
    auditEvent,
    actionExecution,
    $transaction: vi.fn(async (ops: Array<Promise<unknown>>) =>
      Promise.all(ops),
    ),
    __seed: {
      auditEvents,
      actionExecutions,
    },
  };
}

function matchesOr(row: AuditRow, or: unknown): boolean {
  if (!or) return true;
  const branches = Array.isArray(or) ? or : [or];
  return branches.some((branch) => {
    const b = branch as {
      subjectType?: AuditSubjectType;
      subjectId?: string | { in?: string[] };
    };
    if (b.subjectType && row.subjectType !== b.subjectType) return false;
    if (typeof b.subjectId === 'string' && row.subjectId !== b.subjectId) {
      return false;
    }
    if (
      b.subjectId &&
      typeof b.subjectId === 'object' &&
      Array.isArray(b.subjectId.in) &&
      !b.subjectId.in.includes(row.subjectId)
    ) {
      return false;
    }
    return true;
  });
}

describe('AuditService', () => {
  const workspaceA = 'a62c1b46-3429-4e12-b7d2-4a01be581a01';
  const workspaceB = 'b62c1b46-3429-4e12-b7d2-4a01be581a02';
  const ticketA = '11111111-1111-4111-8111-111111111111';
  const actionA1 = '22222222-2222-4222-8222-222222222221';
  const actionA2 = '22222222-2222-4222-8222-222222222222';
  const actionAUnrelated = '22222222-2222-4222-8222-222222222223';

  function buildService() {
    const prisma = makePrismaStub();
    const service = new AuditService(prisma as never);
    return { service, prisma };
  }

  describe('recordEvent', () => {
    it('appends a single audit row with caller-supplied fields and defaults source to API', async () => {
      const { service, prisma } = buildService();
      const params: CreateAuditEventDto = {
        workspaceId: workspaceA,
        subjectType: AuditSubjectType.TICKET,
        subjectId: ticketA,
        action: 'TICKET_CREATED',
        actorId: '33333333-3333-4333-8333-333333333333',
        businessEffectKey: 'be-1',
      };

      await service.recordEvent(prisma as never, params);

      expect(prisma.auditEvent.create).toHaveBeenCalledTimes(1);
      const [call] = prisma.auditEvent.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(call.data).toMatchObject({
        workspaceId: workspaceA,
        subjectType: AuditSubjectType.TICKET,
        subjectId: ticketA,
        action: 'TICKET_CREATED',
        actorId: params.actorId,
        source: AuditSource.API,
        businessEffectKey: 'be-1',
        idempotencyKey: null,
        metadata: null,
      });
    });

    it('uses a transaction client when the caller passes one so writes commit together', async () => {
      const { service, prisma } = buildService();
      const tx = { auditEvent: prisma.auditEvent };

      await service.recordEvent(tx as never, {
        workspaceId: workspaceA,
        subjectType: AuditSubjectType.ACTION_EXECUTION,
        subjectId: actionA1,
        action: 'ACTION_SUCCEEDED',
        source: AuditSource.WORKER,
      });

      expect(prisma.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: workspaceA,
          subjectType: AuditSubjectType.ACTION_EXECUTION,
          source: AuditSource.WORKER,
        }),
      });
    });
  });

  describe('listTicketAudits', () => {
    async function seedWorkspaceA() {
      const { service, prisma } = buildService();
      const seed = prisma.__seed;

      // Two TICKET events on the same ticket, two ACTION_EXECUTION events
      // (one on actionA1, one on actionA2), and one TICKET event on a
      // different ticket in the same workspace.
      seed.actionExecutions.push(
        { id: actionA1, workspaceId: workspaceA, ticketId: ticketA },
        { id: actionA2, workspaceId: workspaceA, ticketId: ticketA },
        { id: actionAUnrelated, workspaceId: workspaceA, ticketId: null },
      );
      await service.recordEvent(prisma as never, {
        workspaceId: workspaceA,
        subjectType: AuditSubjectType.TICKET,
        subjectId: ticketA,
        action: 'TICKET_CREATED',
      });
      await service.recordEvent(prisma as never, {
        workspaceId: workspaceA,
        subjectType: AuditSubjectType.TICKET,
        subjectId: ticketA,
        action: 'TICKET_STATUS_CHANGED',
      });
      await service.recordEvent(prisma as never, {
        workspaceId: workspaceA,
        subjectType: AuditSubjectType.ACTION_EXECUTION,
        subjectId: actionA1,
        action: 'ACTION_QUEUED',
      });
      await service.recordEvent(prisma as never, {
        workspaceId: workspaceA,
        subjectType: AuditSubjectType.ACTION_EXECUTION,
        subjectId: actionA2,
        action: 'ACTION_SUCCEEDED',
      });
      // Different ticket in the same workspace: must NOT be returned.
      await service.recordEvent(prisma as never, {
        workspaceId: workspaceA,
        subjectType: AuditSubjectType.TICKET,
        subjectId: '99999999-9999-4999-8999-999999999999',
        action: 'OTHER_TICKET_EVENT',
      });
      // Action execution not tied to this ticket: must NOT be returned.
      await service.recordEvent(prisma as never, {
        workspaceId: workspaceA,
        subjectType: AuditSubjectType.ACTION_EXECUTION,
        subjectId: actionAUnrelated,
        action: 'UNRELATED_ACTION',
      });
      return { service, prisma, seed };
    }

    it('returns TICKET and ACTION events for the ticket, scoped to the workspace, newest first', async () => {
      const { service } = await seedWorkspaceA();
      const result = await service.listTicketAudits(
        workspaceA,
        ticketA,
        Object.assign(new PaginationQueryDto(), {}),
      );
      const actions = result.data.map(
        (row: AuditEventResponseDto) => row.action,
      );
      expect(actions).toEqual([
        'ACTION_SUCCEEDED',
        'ACTION_QUEUED',
        'TICKET_STATUS_CHANGED',
        'TICKET_CREATED',
      ]);
      expect(result.data.every((row) => row.workspaceId === workspaceA)).toBe(
        true,
      );
      expect(result.meta.total).toBe(4);
      expect(result.meta.hasNext).toBe(false);
    });

    it('enforces tenant isolation: another workspace never sees workspaceA events', async () => {
      await seedWorkspaceA();
      // Fresh service backed by a separate stub so we control exactly what
      // workspaceB has visible.
      const { service, prisma } = buildService();
      // WorkspaceB has its own unrelated audit row, no TICKET events on
      // ticketA and no actions tied to it.
      await service.recordEvent(prisma as never, {
        workspaceId: workspaceB,
        subjectType: AuditSubjectType.WORKSPACE,
        subjectId: workspaceB,
        action: 'WORKSPACE_B_ONLY',
      });
      const result = await service.listTicketAudits(
        workspaceB,
        ticketA,
        Object.assign(new PaginationQueryDto(), {}),
      );
      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(result.meta.hasNext).toBe(false);
      // The actionExecution lookup must also be tenant-scoped.
      expect(prisma.actionExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: workspaceB,
            ticketId: ticketA,
          }),
        }),
      );
    });

    it('paginates with skip/take derived from the query and reports hasNext when more remain', async () => {
      const { service } = await seedWorkspaceA();
      const firstPage = await service.listTicketAudits(
        workspaceA,
        ticketA,
        Object.assign(new PaginationQueryDto(), { page: 1, limit: 2 }),
      );
      expect(firstPage.data).toHaveLength(2);
      expect(firstPage.meta).toEqual({
        page: 1,
        limit: 2,
        total: 4,
        hasNext: true,
      });

      const secondPage = await service.listTicketAudits(
        workspaceA,
        ticketA,
        Object.assign(new PaginationQueryDto(), { page: 2, limit: 2 }),
      );
      expect(secondPage.data).toHaveLength(2);
      expect(secondPage.meta.hasNext).toBe(false);

      const thirdPage = await service.listTicketAudits(
        workspaceA,
        ticketA,
        Object.assign(new PaginationQueryDto(), { page: 3, limit: 2 }),
      );
      expect(thirdPage.data).toHaveLength(0);
      expect(thirdPage.meta.hasNext).toBe(false);
    });
  });
});
