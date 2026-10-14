export const QueueName = {
  INVESTIGATION: 'investigation',
  ACTION: 'action',
  KNOWLEDGE_INDEX: 'knowledge-index',
  EVALUATION: 'evaluation',
} as const;

export interface JobContext {
  workspaceId: string;
  requestId: string;
  traceId?: string;
}

export interface InvestigationJob extends JobContext {
  ticketId: string;
  investigationId: string;
}

export interface ActionJob extends JobContext {
  actionExecutionId: string;
  proposalId: string;
}

export interface KnowledgeIndexJob extends JobContext {
  documentId: string;
  version: number;
}

export interface EvaluationJob extends JobContext {
  runId: string;
}

export const SupportEvent = {
  TICKET_UPDATED: 'ticket.updated',
  INVESTIGATION_QUEUED: 'investigation.queued',
  INVESTIGATION_PROGRESS: 'investigation.progress',
  INVESTIGATION_COMPLETED: 'investigation.completed',
  INVESTIGATION_FAILED: 'investigation.failed',
  PROPOSAL_READY: 'proposal.ready',
  ACTION_QUEUED: 'action.queued',
  ACTION_PROGRESS: 'action.progress',
  ACTION_COMPLETED: 'action.completed',
  ACTION_FAILED: 'action.failed',
  KNOWLEDGE_GAP_DETECTED: 'knowledge.gap.detected',
} as const;

// Thin notifications only: clients refetch authorized REST state on reconnect.
export interface SupportEventPayload<
  TStatus extends string = string,
> extends JobContext {
  resourceId: string;
  status: TStatus;
  changedAt: string;
}
