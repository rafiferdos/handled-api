-- The target must provide pgvector in the private extensions schema. An existing
-- installation elsewhere requires a reviewed target-specific migration.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
-- AlterTable
ALTER TABLE "handled"."InvestigationRun" ADD COLUMN     "ticketVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "usage" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "handled"."KnowledgeDocument" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "title" VARCHAR(256) NOT NULL,
    "body" TEXT NOT NULL,
    "policyRules" JSONB NOT NULL DEFAULT '{}',
    "status" "handled"."KnowledgeDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedVersion" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handled"."KnowledgeRevision" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "title" VARCHAR(256) NOT NULL,
    "body" TEXT NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "policyRules" JSONB NOT NULL,
    "indexStatus" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "embeddingModel" VARCHAR(100),
    "failureCode" VARCHAR(64),
    "publishedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handled"."KnowledgeChunk" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "documentVersion" INTEGER NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "embeddingModel" VARCHAR(100) NOT NULL,
    "embedding" extensions.vector(768) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handled"."ActionExecution" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "proposalVersion" INTEGER NOT NULL,
    "decisionId" UUID NOT NULL,
    "type" "handled"."ActionType" NOT NULL,
    "targetId" UUID NOT NULL,
    "targetRef" VARCHAR(256) NOT NULL,
    "status" "handled"."ActionExecutionStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "beforeState" JSONB,
    "afterState" JSONB,
    "failureCode" VARCHAR(64),
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "requestId" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ActionExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeDocument_workspaceId_status_updatedAt_id_idx" ON "handled"."KnowledgeDocument"("workspaceId", "status", "updatedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeDocument_workspaceId_id_key" ON "handled"."KnowledgeDocument"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeDocument_workspaceId_slug_key" ON "handled"."KnowledgeDocument"("workspaceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeRevision_workspaceId_id_key" ON "handled"."KnowledgeRevision"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeRevision_workspaceId_documentId_version_key" ON "handled"."KnowledgeRevision"("workspaceId", "documentId", "version");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_workspaceId_documentId_documentVersion_idx" ON "handled"."KnowledgeChunk"("workspaceId", "documentId", "documentVersion");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeChunk_workspaceId_id_key" ON "handled"."KnowledgeChunk"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeChunk_workspaceId_documentId_documentVersion_embed_key" ON "handled"."KnowledgeChunk"("workspaceId", "documentId", "documentVersion", "embeddingModel", "chunkIndex");

-- CreateIndex
CREATE INDEX "ActionExecution_workspaceId_ticketId_createdAt_id_idx" ON "handled"."ActionExecution"("workspaceId", "ticketId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ActionExecution_workspaceId_status_createdAt_id_idx" ON "handled"."ActionExecution"("workspaceId", "status", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ActionExecution_workspaceId_id_key" ON "handled"."ActionExecution"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ActionExecution_workspaceId_decisionId_key" ON "handled"."ActionExecution"("workspaceId", "decisionId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionExecution_workspaceId_decisionId_proposalId_proposalV_key" ON "handled"."ActionExecution"("workspaceId", "decisionId", "proposalId", "proposalVersion");

-- CreateIndex
CREATE UNIQUE INDEX "ActionExecution_workspaceId_proposalId_proposalVersion_key" ON "handled"."ActionExecution"("workspaceId", "proposalId", "proposalVersion");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_workspaceId_ticketId_id_version_key" ON "handled"."Proposal"("workspaceId", "ticketId", "id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalDecision_workspaceId_id_proposalId_proposalVersion_key" ON "handled"."ProposalDecision"("workspaceId", "id", "proposalId", "proposalVersion");

-- AddForeignKey
ALTER TABLE "handled"."KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "handled"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."KnowledgeRevision" ADD CONSTRAINT "KnowledgeRevision_workspaceId_documentId_fkey" FOREIGN KEY ("workspaceId", "documentId") REFERENCES "handled"."KnowledgeDocument"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_workspaceId_documentId_documentVersion_fkey" FOREIGN KEY ("workspaceId", "documentId", "documentVersion") REFERENCES "handled"."KnowledgeRevision"("workspaceId", "documentId", "version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."ActionExecution" ADD CONSTRAINT "ActionExecution_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "handled"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."ActionExecution" ADD CONSTRAINT "ActionExecution_workspaceId_ticketId_proposalId_proposalVe_fkey" FOREIGN KEY ("workspaceId", "ticketId", "proposalId", "proposalVersion") REFERENCES "handled"."Proposal"("workspaceId", "ticketId", "id", "version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handled"."ActionExecution" ADD CONSTRAINT "ActionExecution_workspaceId_decisionId_proposalId_proposal_fkey" FOREIGN KEY ("workspaceId", "decisionId", "proposalId", "proposalVersion") REFERENCES "handled"."ProposalDecision"("workspaceId", "id", "proposalId", "proposalVersion") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE handled."KnowledgeDocument" ADD CONSTRAINT knowledge_document_values CHECK (
  version > 0 AND ("publishedVersion" IS NULL OR "publishedVersion" BETWEEN 1 AND version)
  AND length(trim(title)) > 0 AND length(body) BETWEEN 1 AND 100000
  AND jsonb_typeof("policyRules")='object');
ALTER TABLE handled."KnowledgeRevision" ADD CONSTRAINT knowledge_revision_values CHECK (
  version > 0 AND "contentHash" ~ '^[a-f0-9]{64}$' AND jsonb_typeof("policyRules")='object'
  AND "indexStatus" IN ('PENDING','READY','FAILED')
  AND ("indexStatus"<>'READY' OR "embeddingModel" IS NOT NULL));
ALTER TABLE handled."KnowledgeChunk" ADD CONSTRAINT knowledge_chunk_values CHECK (
  "documentVersion">0 AND "chunkIndex">=0 AND "contentHash" ~ '^[a-f0-9]{64}$'
  AND length(content) BETWEEN 1 AND 4000);
ALTER TABLE handled."ActionExecution" ADD CONSTRAINT action_execution_values CHECK (
  "proposalVersion">0 AND version>0 AND attempts>=0
  AND (status<>'SUCCEEDED' OR ("beforeState" IS NOT NULL AND "afterState" IS NOT NULL AND "finishedAt" IS NOT NULL)));
CREATE FUNCTION handled.guard_knowledge_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Policy history retained' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(NEW)-ARRAY['indexStatus','embeddingModel','failureCode']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['indexStatus','embeddingModel','failureCode']) THEN
    RAISE EXCEPTION 'Policy revision immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER immutable_knowledge_revision BEFORE UPDATE OR DELETE ON handled."KnowledgeRevision" FOR EACH ROW EXECUTE FUNCTION handled.guard_knowledge_revision();
CREATE TRIGGER immutable_knowledge_chunk BEFORE UPDATE OR DELETE ON handled."KnowledgeChunk" FOR EACH ROW EXECUTE FUNCTION handled.reject_history_mutation();
CREATE FUNCTION handled.guard_action_history() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Action history retained' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(NEW)-ARRAY['status','attempts','version','beforeState','afterState','failureCode','retryable','updatedAt','finishedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','attempts','version','beforeState','afterState','failureCode','retryable','updatedAt','finishedAt']) THEN
    RAISE EXCEPTION 'Action command immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.status='SUCCEEDED' OR (OLD.status='OUTCOME_UNKNOWN' AND NEW.status NOT IN ('SUCCEEDED','FAILED','OUTCOME_UNKNOWN')) THEN
    RAISE EXCEPTION 'Action cannot replay' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER action_history BEFORE UPDATE OR DELETE ON handled."ActionExecution" FOR EACH ROW EXECUTE FUNCTION handled.guard_action_history();
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['KnowledgeDocument','KnowledgeRevision','KnowledgeChunk','ActionExecution'] LOOP
    EXECUTE format('ALTER TABLE handled.%I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('REVOKE ALL ON handled.%I FROM PUBLIC, anon, authenticated',tab);
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION handled.guard_knowledge_revision() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION handled.guard_action_history() FROM PUBLIC,anon,authenticated;
