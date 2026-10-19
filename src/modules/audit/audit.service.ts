import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service.js';
import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { paginated, paginationBounds } from '../../common/utils/pagination.js';
import type { PaginatedResult } from '../../common/http/api-response.js';
import {
  AuditSource,
  AuditSubjectType,
  Prisma,
} from '../../generated/prisma/client.js';
import { CreateAuditEventDto } from './dto/create-audit-event.dto.js';
import { AuditEventResponseDto } from './dto/audit-event-response.dto.js';

const AUDITABLE_ACTION_SUBJECT: AuditSubjectType =
  AuditSubjectType.ACTION_EXECUTION;
const AUDITABLE_TICKET_SUBJECT: AuditSubjectType = AuditSubjectType.TICKET;


@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}


  async recordEvent(
    tx: Prisma.TransactionClient | PrismaService,
    params: CreateAuditEventDto,
  ): Promise<void> {
    await tx.auditEvent.create({
      data: {
        workspaceId: params.workspaceId,
        subjectType: params.subjectType,
        subjectId: params.subjectId,
        action: params.action,
        actorId: params.actorId ?? null,
        source: params.source ?? AuditSource.API,
        businessEffectKey: params.businessEffectKey ?? null,
        idempotencyKey: params.idempotencyKey ?? null,
        metadata: (params.metadata ?? null) as Prisma.InputJsonValue,
      },
    });
  }


  async listTicketAudits(
    workspaceId: string,
    ticketId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<AuditEventResponseDto>> {
    const { skip, take } = paginationBounds(query);

    const actionIds = await this.prisma.actionExecution.findMany({
      where: { workspaceId, ticketId },
      select: { id: true },
    });
    const actionSubjectIds = actionIds.map((row) => row.id);

    const subjectFilter: Prisma.AuditEventWhereInput['OR'] = [
      {
        subjectType: AUDITABLE_TICKET_SUBJECT,
        subjectId: ticketId,
      },
    ];
    if (actionSubjectIds.length > 0) {
      subjectFilter.push({
        subjectType: AUDITABLE_ACTION_SUBJECT,
        subjectId: { in: actionSubjectIds },
      });
    }

    const where: Prisma.AuditEventWhereInput = {
      workspaceId,
      OR: subjectFilter,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.auditEvent.count({ where }),
    ]);

    return paginated(
      items.map((row) => this.toResponse(row)),
      total,
      query,
    );
  }

  private toResponse(row: {
    id: string;
    workspaceId: string;
    subjectType: AuditSubjectType;
    subjectId: string;
    action: string;
    actorId: string | null;
    source: AuditSource;
    createdAt: Date;
    metadata: Prisma.JsonValue | null;
  }): AuditEventResponseDto {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      action: row.action,
      actorId: row.actorId,
      source: row.source,
      createdAt: row.createdAt.toISOString(),
      metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    };
  }
}
