import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { WorkspaceModule } from './workspace/workspace.module.js';
import { CustomerModule } from './customer/customer.module.js';
import { BillingModule } from './billing/billing.module.js';
import { TicketModule } from './ticket/ticket.module.js';
import { KnowledgeModule } from './knowledge/knowledge.module.js';
import { AiModule } from './ai/ai.module.js';
import { InvestigationModule } from './investigation/investigation.module.js';
import { ProposalModule } from './proposal/proposal.module.js';
import { ActionModule } from './action/action.module.js';
import { QueueModule } from './queue/queue.module.js';
import { EventsModule } from './events/events.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { EvaluationModule } from './evaluation/evaluation.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [AuthModule, WorkspaceModule, CustomerModule, BillingModule, TicketModule, KnowledgeModule, AiModule, InvestigationModule, ProposalModule, ActionModule, QueueModule, EventsModule, AuditModule, AnalyticsModule, EvaluationModule, HealthModule]
})
export class Module {}
