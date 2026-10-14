// Wire values from the 14 Oct canonical plan + supplemental ERD.
// Schema owners keep Prisma enums aligned; domain state transitions stay in services.
export enum TicketStatus {
  NEW = 'NEW',
  QUEUED = 'QUEUED',
  INVESTIGATING = 'INVESTIGATING',
  AWAITING_APPROVAL = 'AWAITING_APPROVAL',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
  EXECUTING = 'EXECUTING',
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  RESOLVED = 'RESOLVED',
  REJECTED = 'REJECTED',
  CLOSED = 'CLOSED',
}

export enum TicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum InvestigationStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
}

export enum ProposalStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ESCALATED = 'ESCALATED',
  SUPERSEDED = 'SUPERSEDED',
}

export enum Confidence {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum ActionType {
  REFUND_DUPLICATE_PAYMENT = 'REFUND_DUPLICATE_PAYMENT',
  CANCEL_AT_PERIOD_END = 'CANCEL_AT_PERIOD_END',
  RESTORE_PRODUCT_ACCESS = 'RESTORE_PRODUCT_ACCESS',
}

export enum ActionExecutionStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  OUTCOME_UNKNOWN = 'OUTCOME_UNKNOWN',
}

export enum KnowledgeDocumentStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}
