import { WorkspaceRole } from '../../../common/contracts/access-context.js';
import {
  InvestigationStatus,
  ProposalStatus,
} from '../../../common/contracts/domain.enums.js';

export const LeadReadRoles = [
  WorkspaceRole.ADMIN,
  WorkspaceRole.AGENT,
  WorkspaceRole.VIEWER,
] as const;
export const LeadWriteRoles = [
  WorkspaceRole.ADMIN,
  WorkspaceRole.AGENT,
] as const;
export const InvestigationStepType = {
  CLASSIFY: 'CLASSIFY',
  TOOL: 'TOOL',
  RAG: 'RAG',
  VALIDATE: 'VALIDATE',
  PROPOSE: 'PROPOSE',
} as const;
export type InvestigationStepType =
  (typeof InvestigationStepType)[keyof typeof InvestigationStepType];
export const InvestigationStepStatus = {
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type InvestigationStepStatus =
  (typeof InvestigationStepStatus)[keyof typeof InvestigationStepStatus];
export const ProposalDecisionKind = {
  EDITED: 'EDITED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  ESCALATED: 'ESCALATED',
} as const;
export type ProposalDecisionKind =
  (typeof ProposalDecisionKind)[keyof typeof ProposalDecisionKind];

// Lifecycle edges are necessary, not sufficient: authorization, current version,
// evidence and policy still need server checks. Retry creates a new run.
export const investigationTransitions = {
  [InvestigationStatus.QUEUED]: [
    InvestigationStatus.RUNNING,
    InvestigationStatus.FAILED,
  ],
  [InvestigationStatus.RUNNING]: [
    InvestigationStatus.COMPLETED,
    InvestigationStatus.FAILED,
    InvestigationStatus.NEEDS_REVIEW,
  ],
  [InvestigationStatus.COMPLETED]: [],
  [InvestigationStatus.FAILED]: [],
  [InvestigationStatus.NEEDS_REVIEW]: [],
} as const satisfies Record<
  InvestigationStatus,
  readonly InvestigationStatus[]
>;

export const proposalTransitions = {
  [ProposalStatus.DRAFT]: [
    ProposalStatus.READY,
    ProposalStatus.SUPERSEDED,
    ProposalStatus.ESCALATED,
  ],
  [ProposalStatus.READY]: [
    ProposalStatus.APPROVED,
    ProposalStatus.REJECTED,
    ProposalStatus.ESCALATED,
    ProposalStatus.SUPERSEDED,
  ],
  [ProposalStatus.APPROVED]: [],
  [ProposalStatus.REJECTED]: [],
  [ProposalStatus.ESCALATED]: [],
  [ProposalStatus.SUPERSEDED]: [],
} as const satisfies Record<ProposalStatus, readonly ProposalStatus[]>;
