-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "handled";

-- CreateEnum
CREATE TYPE "handled"."WorkspaceStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "handled"."WorkspaceRole" AS ENUM ('ADMIN', 'AGENT', 'VIEWER');

-- CreateEnum
CREATE TYPE "handled"."MembershipStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "handled"."CustomerStatus" AS ENUM ('ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "handled"."SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "handled"."PaymentStatus" AS ENUM ('PENDING', 'SETTLED', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "handled"."ProductAccessStatus" AS ENUM ('ACTIVE', 'REVOKED', 'PENDING');

-- CreateEnum
CREATE TYPE "handled"."TicketCategory" AS ENUM ('BILLING_DUPLICATE_CHARGE', 'SUBSCRIPTION_CANCELLATION', 'PRODUCT_ACCESS_ISSUE', 'OTHER');

-- CreateEnum
CREATE TYPE "handled"."TicketStatus" AS ENUM ('NEW', 'QUEUED', 'INVESTIGATING', 'AWAITING_APPROVAL', 'NEEDS_REVIEW', 'EXECUTING', 'EXECUTION_FAILED', 'RESOLVED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "handled"."TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "handled"."TicketSource" AS ENUM ('AGENT', 'PUBLIC_FORM');

-- CreateEnum
CREATE TYPE "handled"."MessageAuthorType" AS ENUM ('CUSTOMER', 'AGENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "handled"."MessageVisibility" AS ENUM ('PUBLIC', 'INTERNAL');

-- CreateEnum
CREATE TYPE "handled"."InvestigationStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "handled"."InvestigationStepType" AS ENUM ('CLASSIFY', 'TOOL', 'RAG', 'VALIDATE', 'PROPOSE');

-- CreateEnum
CREATE TYPE "handled"."InvestigationStepStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "handled"."ProposalStatus" AS ENUM ('DRAFT', 'READY', 'APPROVED', 'REJECTED', 'ESCALATED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "handled"."Confidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "handled"."ActionType" AS ENUM ('REFUND_DUPLICATE_PAYMENT', 'CANCEL_AT_PERIOD_END', 'RESTORE_PRODUCT_ACCESS');

-- CreateEnum
CREATE TYPE "handled"."SourceType" AS ENUM ('TOOL', 'KNOWLEDGE');

-- CreateEnum
CREATE TYPE "handled"."ProposalDecisionKind" AS ENUM ('EDITED', 'APPROVED', 'REJECTED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "handled"."AuditActorType" AS ENUM ('USER', 'AI', 'SYSTEM');

-- CreateEnum
CREATE TYPE "handled"."OutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "handled"."ActionExecutionStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'OUTCOME_UNKNOWN');

-- CreateEnum
CREATE TYPE "handled"."KnowledgeDocumentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "handled"."InvestigationRun" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "parentRunId" UUID,
    "status" "handled"."InvestigationStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" VARCHAR(100) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "promptVersion" VARCHAR(100) NOT NULL,
    "triggeredByUserId" UUID NOT NULL,
    "triggeredByMembershipId" UUID NOT NULL,
    "triggeredBySessionId" UUID NOT NULL,
    "requestId" VARCHAR(128) NOT NULL,
    "classification" JSONB,
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "failureCode" VARCHAR(64),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InvestigationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handled"."InvestigationStep" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "investigationId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" "handled"."InvestigationStepType" NOT NULL,
    "label" VARCHAR(256) NOT NULL,
    "status" "handled"."InvestigationStepStatus" NOT NULL,
    "toolName" VARCHAR(100),
    "sourceRefs" JSONB NOT NULL DEFAULT '[]',
    "durationMs" INTEGER,
    "errorCode" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InvestigationStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handled"."Proposal" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "investigationId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "handled"."ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "category" "handled"."TicketCategory" NOT NULL,
    "confidence" "handled"."Confidence" NOT NULL,
    "summary" TEXT NOT NULL,
    "recommendationType" "handled"."ActionType",
    "recommendationPayload" JSONB,
    "replyDraft" TEXT NOT NULL,
    "missingFacts" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handled"."ProposalSource" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "sourceType" "handled"."SourceType" NOT NULL,
    "sourceRefId" VARCHAR(256) NOT NULL,
    "title" VARCHAR(256) NOT NULL,
    "excerpt" TEXT NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "documentId" UUID,
    "documentVersion" INTEGER,
    "chunkId" UUID,
    "score" DOUBLE PRECISION,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handled"."ProposalDecision" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "proposalVersion" INTEGER NOT NULL,
    "kind" "handled"."ProposalDecisionKind" NOT NULL,
    "actorUserId" UUID NOT NULL,
    "actorMembershipId" UUID NOT NULL,
    "actorSessionId" UUID NOT NULL,
    "reason" TEXT,
    "requestId" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handled"."Customer" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "externalRef" VARCHAR(64) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "status" "handled"."CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handled"."Subscription" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "externalRef" VARCHAR(64) NOT NULL,
    "planCode" VARCHAR(100) NOT NULL,
    "productCode" VARCHAR(100) NOT NULL,
    "status" "handled"."SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodStart" TIMESTAMPTZ(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMPTZ(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handled"."Payment" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "subscriptionId" UUID,
    "externalRef" VARCHAR(64) NOT NULL,
    "billingPeriodKey" VARCHAR(32) NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "handled"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMPTZ(3),
    "refundedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handled"."ProductAccess" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "productCode" VARCHAR(100) NOT NULL,
    "status" "handled"."ProductAccessStatus" NOT NULL DEFAULT 'PENDING',
    "reason" VARCHAR(256),
    "lastSyncedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProductAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handled"."Profile" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "displayName" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handled"."Workspace" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(40) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "status" "handled"."WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "supportFormTokenHash" CHAR(64),
    "supportFormTokenExpiresAt" TIMESTAMPTZ(3),
    "ticketSequence" INTEGER NOT NULL DEFAULT 1000,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handled"."Membership" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "handled"."WorkspaceRole" NOT NULL,
    "status" "handled"."MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handled"."Invite" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "role" "handled"."WorkspaceRole" NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdByUserId" UUID NOT NULL,
    "createdByMembershipId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handled"."AuditEvent" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "entityType" VARCHAR(100) NOT NULL,
    "entityId" UUID NOT NULL,
    "eventType" VARCHAR(100) NOT NULL,
    "actorType" "handled"."AuditActorType" NOT NULL,
    "actorId" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "requestId" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handled"."OutboxEvent" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "aggregateId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "handled"."OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMPTZ(3),
    "lockToken" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handled"."IdempotencyRecord" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "actorScope" VARCHAR(128) NOT NULL,
    "operation" VARCHAR(100) NOT NULL,
    "target" VARCHAR(128) NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handled"."Ticket" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "reference" VARCHAR(32) NOT NULL,
    "customerId" UUID,
    "customerVerifiedAt" TIMESTAMPTZ(3),
    "customerVerifiedById" UUID,
    "subject" VARCHAR(256) NOT NULL,
    "category" "handled"."TicketCategory",
    "priority" "handled"."TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "handled"."TicketStatus" NOT NULL DEFAULT 'NEW',
    "source" "handled"."TicketSource" NOT NULL DEFAULT 'AGENT',
    "assigneeId" UUID,
    "requesterEmail" VARCHAR(320),
    "requesterCustomerRef" VARCHAR(64),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handled"."TicketMessage" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "authorType" "handled"."MessageAuthorType" NOT NULL,
    "visibility" "handled"."MessageVisibility" NOT NULL DEFAULT 'PUBLIC',
    "authorUserId" UUID,
    "authorMembershipId" UUID,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvestigationRun_workspaceId_ticketId_createdAt_id_idx" ON "handled"."InvestigationRun"("workspaceId", "ticketId", "createdAt" DESC, "id");

-- CreateIndex
CREATE INDEX "InvestigationRun_workspaceId_ticketId_parentRunId_idx" ON "handled"."InvestigationRun"("workspaceId", "ticketId", "parentRunId");

-- CreateIndex
CREATE INDEX "InvestigationRun_triggeredByUserId_idx" ON "handled"."InvestigationRun"("triggeredByUserId");

-- CreateIndex
CREATE INDEX "InvestigationRun_workspaceId_triggeredByMembershipId_trigge_idx" ON "handled"."InvestigationRun"("workspaceId", "triggeredByMembershipId", "triggeredByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "InvestigationRun_workspaceId_id_key" ON "handled"."InvestigationRun"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InvestigationRun_workspaceId_ticketId_id_key" ON "handled"."InvestigationRun"("workspaceId", "ticketId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InvestigationStep_workspaceId_id_key" ON "handled"."InvestigationStep"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InvestigationStep_workspaceId_investigationId_sequence_key" ON "handled"."InvestigationStep"("workspaceId", "investigationId", "sequence");

-- CreateIndex
CREATE INDEX "Proposal_workspaceId_ticketId_createdAt_id_idx" ON "handled"."Proposal"("workspaceId", "ticketId", "createdAt" DESC, "id");

-- CreateIndex
CREATE INDEX "Proposal_workspaceId_ticketId_investigationId_idx" ON "handled"."Proposal"("workspaceId", "ticketId", "investigationId");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_workspaceId_id_key" ON "handled"."Proposal"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_workspaceId_id_version_key" ON "handled"."Proposal"("workspaceId", "id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_workspaceId_investigationId_version_key" ON "handled"."Proposal"("workspaceId", "investigationId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalSource_workspaceId_id_key" ON "handled"."ProposalSource"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalSource_workspaceId_proposalId_sourceRefId_key" ON "handled"."ProposalSource"("workspaceId", "proposalId", "sourceRefId");

-- CreateIndex
CREATE INDEX "ProposalDecision_actorUserId_idx" ON "handled"."ProposalDecision"("actorUserId");

-- CreateIndex
CREATE INDEX "ProposalDecision_workspaceId_actorMembershipId_actorUserId_idx" ON "handled"."ProposalDecision"("workspaceId", "actorMembershipId", "actorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalDecision_workspaceId_id_key" ON "handled"."ProposalDecision"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalDecision_workspaceId_proposalId_proposalVersion_key" ON "handled"."ProposalDecision"("workspaceId", "proposalId", "proposalVersion");

-- CreateIndex
CREATE INDEX "Customer_workspaceId_createdAt_id_idx" ON "handled"."Customer"("workspaceId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_workspaceId_id_key" ON "handled"."Customer"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_workspaceId_externalRef_key" ON "handled"."Customer"("workspaceId", "externalRef");

-- CreateIndex
CREATE INDEX "Subscription_workspaceId_customerId_status_idx" ON "handled"."Subscription"("workspaceId", "customerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_workspaceId_id_key" ON "handled"."Subscription"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_workspaceId_customerId_id_key" ON "handled"."Subscription"("workspaceId", "customerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_workspaceId_externalRef_key" ON "handled"."Subscription"("workspaceId", "externalRef");

-- CreateIndex
CREATE INDEX "Payment_workspaceId_customerId_paidAt_id_idx" ON "handled"."Payment"("workspaceId", "customerId", "paidAt", "id");

-- CreateIndex
CREATE INDEX "Payment_workspaceId_customerId_subscriptionId_idx" ON "handled"."Payment"("workspaceId", "customerId", "subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_workspaceId_id_key" ON "handled"."Payment"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_workspaceId_externalRef_key" ON "handled"."Payment"("workspaceId", "externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAccess_workspaceId_id_key" ON "handled"."ProductAccess"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAccess_workspaceId_customerId_productCode_key" ON "handled"."ProductAccess"("workspaceId", "customerId", "productCode");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "handled"."Workspace"("slug");

-- CreateIndex
CREATE INDEX "Membership_userId_status_idx" ON "handled"."Membership"("userId", "status");

-- CreateIndex
CREATE INDEX "Membership_workspaceId_role_status_idx" ON "handled"."Membership"("workspaceId", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_workspaceId_userId_key" ON "handled"."Membership"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_workspaceId_id_key" ON "handled"."Membership"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_workspaceId_id_userId_key" ON "handled"."Membership"("workspaceId", "id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_tokenHash_key" ON "handled"."Invite"("tokenHash");

-- CreateIndex
CREATE INDEX "Invite_workspaceId_email_expiresAt_idx" ON "handled"."Invite"("workspaceId", "email", "expiresAt");

-- CreateIndex
CREATE INDEX "Invite_workspaceId_createdByMembershipId_createdByUserId_idx" ON "handled"."Invite"("workspaceId", "createdByMembershipId", "createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_workspaceId_id_key" ON "handled"."Invite"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "AuditEvent_workspaceId_entityType_entityId_createdAt_id_idx" ON "handled"."AuditEvent"("workspaceId", "entityType", "entityId", "createdAt" DESC, "id");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_workspaceId_id_key" ON "handled"."AuditEvent"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_availableAt_lockedUntil_id_idx" ON "handled"."OutboxEvent"("status", "availableAt", "lockedUntil", "id");

-- CreateIndex
CREATE INDEX "OutboxEvent_workspaceId_aggregateId_idx" ON "handled"."OutboxEvent"("workspaceId", "aggregateId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_workspaceId_id_key" ON "handled"."OutboxEvent"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_workspaceId_createdAt_idx" ON "handled"."IdempotencyRecord"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_workspaceId_actorScope_operation_target_k_key" ON "handled"."IdempotencyRecord"("workspaceId", "actorScope", "operation", "target", "key");

-- CreateIndex
CREATE INDEX "Ticket_workspaceId_status_updatedAt_id_idx" ON "handled"."Ticket"("workspaceId", "status", "updatedAt" DESC, "id");

-- CreateIndex
CREATE INDEX "Ticket_workspaceId_customerId_idx" ON "handled"."Ticket"("workspaceId", "customerId");

-- CreateIndex
CREATE INDEX "Ticket_workspaceId_assigneeId_idx" ON "handled"."Ticket"("workspaceId", "assigneeId");

-- CreateIndex
CREATE INDEX "Ticket_workspaceId_customerVerifiedById_idx" ON "handled"."Ticket"("workspaceId", "customerVerifiedById");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_workspaceId_id_key" ON "handled"."Ticket"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_workspaceId_reference_key" ON "handled"."Ticket"("workspaceId", "reference");

-- CreateIndex
CREATE INDEX "TicketMessage_workspaceId_ticketId_createdAt_id_idx" ON "handled"."TicketMessage"("workspaceId", "ticketId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "TicketMessage_authorUserId_idx" ON "handled"."TicketMessage"("authorUserId");

-- CreateIndex
CREATE INDEX "TicketMessage_workspaceId_authorMembershipId_authorUserId_idx" ON "handled"."TicketMessage"("workspaceId", "authorMembershipId", "authorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketMessage_workspaceId_id_key" ON "handled"."TicketMessage"("workspaceId", "id");

-- AddForeignKey
ALTER TABLE "handled"."InvestigationRun" ADD CONSTRAINT "InvestigationRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "handled"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."InvestigationRun" ADD CONSTRAINT "InvestigationRun_workspaceId_ticketId_fkey" FOREIGN KEY ("workspaceId", "ticketId") REFERENCES "handled"."Ticket"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."InvestigationRun" ADD CONSTRAINT "InvestigationRun_triggeredByUserId_fkey" FOREIGN KEY ("triggeredByUserId") REFERENCES "handled"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."InvestigationRun" ADD CONSTRAINT "InvestigationRun_workspaceId_triggeredByMembershipId_trigg_fkey" FOREIGN KEY ("workspaceId", "triggeredByMembershipId", "triggeredByUserId") REFERENCES "handled"."Membership"("workspaceId", "id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."InvestigationRun" ADD CONSTRAINT "InvestigationRun_workspaceId_ticketId_parentRunId_fkey" FOREIGN KEY ("workspaceId", "ticketId", "parentRunId") REFERENCES "handled"."InvestigationRun"("workspaceId", "ticketId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "handled"."InvestigationStep" ADD CONSTRAINT "InvestigationStep_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "handled"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."InvestigationStep" ADD CONSTRAINT "InvestigationStep_workspaceId_investigationId_fkey" FOREIGN KEY ("workspaceId", "investigationId") REFERENCES "handled"."InvestigationRun"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."Proposal" ADD CONSTRAINT "Proposal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "handled"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."Proposal" ADD CONSTRAINT "Proposal_workspaceId_ticketId_fkey" FOREIGN KEY ("workspaceId", "ticketId") REFERENCES "handled"."Ticket"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."Proposal" ADD CONSTRAINT "Proposal_workspaceId_ticketId_investigationId_fkey" FOREIGN KEY ("workspaceId", "ticketId", "investigationId") REFERENCES "handled"."InvestigationRun"("workspaceId", "ticketId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."ProposalSource" ADD CONSTRAINT "ProposalSource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "handled"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."ProposalSource" ADD CONSTRAINT "ProposalSource_workspaceId_proposalId_fkey" FOREIGN KEY ("workspaceId", "proposalId") REFERENCES "handled"."Proposal"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."ProposalDecision" ADD CONSTRAINT "ProposalDecision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "handled"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."ProposalDecision" ADD CONSTRAINT "ProposalDecision_workspaceId_proposalId_proposalVersion_fkey" FOREIGN KEY ("workspaceId", "proposalId", "proposalVersion") REFERENCES "handled"."Proposal"("workspaceId", "id", "version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."ProposalDecision" ADD CONSTRAINT "ProposalDecision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "handled"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."ProposalDecision" ADD CONSTRAINT "ProposalDecision_workspaceId_actorMembershipId_actorUserId_fkey" FOREIGN KEY ("workspaceId", "actorMembershipId", "actorUserId") REFERENCES "handled"."Membership"("workspaceId", "id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."Customer" ADD CONSTRAINT "Customer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "handled"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."Subscription" ADD CONSTRAINT "Subscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "handled"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."Subscription" ADD CONSTRAINT "Subscription_workspaceId_customerId_fkey" FOREIGN KEY ("workspaceId", "customerId") REFERENCES "handled"."Customer"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."Payment" ADD CONSTRAINT "Payment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "handled"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."Payment" ADD CONSTRAINT "Payment_workspaceId_customerId_fkey" FOREIGN KEY ("workspaceId", "customerId") REFERENCES "handled"."Customer"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."Payment" ADD CONSTRAINT "Payment_workspaceId_customerId_subscriptionId_fkey" FOREIGN KEY ("workspaceId", "customerId", "subscriptionId") REFERENCES "handled"."Subscription"("workspaceId", "customerId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."ProductAccess" ADD CONSTRAINT "ProductAccess_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "handled"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."ProductAccess" ADD CONSTRAINT "ProductAccess_workspaceId_customerId_fkey" FOREIGN KEY ("workspaceId", "customerId") REFERENCES "handled"."Customer"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."Membership" ADD CONSTRAINT "Membership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "handled"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "handled"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."Invite" ADD CONSTRAINT "Invite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "handled"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."Invite" ADD CONSTRAINT "Invite_workspaceId_createdByMembershipId_createdByUserId_fkey" FOREIGN KEY ("workspaceId", "createdByMembershipId", "createdByUserId") REFERENCES "handled"."Membership"("workspaceId", "id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."AuditEvent" ADD CONSTRAINT "AuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "handled"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."OutboxEvent" ADD CONSTRAINT "OutboxEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "handled"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "handled"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."Ticket" ADD CONSTRAINT "Ticket_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "handled"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."Ticket" ADD CONSTRAINT "Ticket_workspaceId_customerId_fkey" FOREIGN KEY ("workspaceId", "customerId") REFERENCES "handled"."Customer"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."Ticket" ADD CONSTRAINT "Ticket_workspaceId_assigneeId_fkey" FOREIGN KEY ("workspaceId", "assigneeId") REFERENCES "handled"."Membership"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."Ticket" ADD CONSTRAINT "Ticket_workspaceId_customerVerifiedById_fkey" FOREIGN KEY ("workspaceId", "customerVerifiedById") REFERENCES "handled"."Membership"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."TicketMessage" ADD CONSTRAINT "TicketMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "handled"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."TicketMessage" ADD CONSTRAINT "TicketMessage_workspaceId_ticketId_fkey" FOREIGN KEY ("workspaceId", "ticketId") REFERENCES "handled"."Ticket"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."TicketMessage" ADD CONSTRAINT "TicketMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "handled"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."TicketMessage" ADD CONSTRAINT "TicketMessage_workspaceId_authorMembershipId_authorUserId_fkey" FOREIGN KEY ("workspaceId", "authorMembershipId", "authorUserId") REFERENCES "handled"."Membership"("workspaceId", "id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
