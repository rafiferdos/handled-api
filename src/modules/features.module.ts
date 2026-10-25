import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { QueueModule, shouldEnableBull } from './queue/queue.module.js';
import { EventsModule } from './events/events.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { EvaluationModule } from './evaluation/evaluation.module.js';
import { HealthModule } from './health/health.module.js';

// Build a ConfigService-shaped object from process.env at import time so
// `QueueModule.forRoot` can branch on REDIS_URL / QUEUE_DISABLED without
// requiring the full ConfigModule to be initialized first. The full
// ConfigService is injected inside each provider; this lightweight probe
// is only used for the module-shape decision.
const envConfig = {
  get: (key: string) => process.env[key],
} as unknown as ConfigService;

@Module({
  imports: [
    AuthModule,
    WorkspaceModule,
    CustomerModule,
    BillingModule,
    TicketModule,
    KnowledgeModule,
    AiModule,
    InvestigationModule,
    ProposalModule,
    ActionModule,
    // QueueModule.forRoot returns a DynamicModule that branches on
    // REDIS_URL / QUEUE_DISABLED: the BullMQ root + the worker are only
    // registered when the broker is configured. The no-bull branch
    // provides a stub queue token so ActionService can still be
    // instantiated in tests. The decision is logged once at startup.
    QueueModule.forRoot(envConfig),
    EventsModule,
    AuditModule,
    AnalyticsModule,
    EvaluationModule,
    HealthModule,
  ],
})
export class FeaturesModule {
  // Intentionally empty: FeaturesModule is a static composition root. The
  // shouldEnableBull reference here keeps the helper referenced so the
  // tree-shaker keeps the branch decision observable from a debugger.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private static readonly _bullEnabled = shouldEnableBull(envConfig);
}
