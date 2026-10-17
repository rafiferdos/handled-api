BEGIN;

-- Prisma expresses the composite FKs. PostgreSQL supplies state/JSON checks,
-- partial uniqueness, append-only evidence and deny-by-default Data API access.
ALTER TABLE handled."Workspace"
  ADD CONSTRAINT "Workspace_values" CHECK (
    length(slug) BETWEEN 3 AND 40 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND length(btrim(name)) > 0 AND "ticketSequence" >= 1000 AND version > 0
    AND ("supportFormTokenHash" IS NULL OR "supportFormTokenHash" ~ '^[a-f0-9]{64}$')
  );
ALTER TABLE handled."Profile"
  ADD CONSTRAINT "Profile_email" CHECK (email = lower(btrim(email)) AND length(email) > 3);
ALTER TABLE handled."Customer"
  ADD CONSTRAINT "Customer_values" CHECK (version > 0 AND length(btrim(name)) > 0 AND email = lower(btrim(email)) AND length(btrim("externalRef")) > 0);
ALTER TABLE handled."Invite"
  ADD CONSTRAINT "Invite_values" CHECK (email = lower(btrim(email)) AND "tokenHash" ~ '^[a-f0-9]{64}$' AND "expiresAt" > "createdAt" AND NOT ("acceptedAt" IS NOT NULL AND "revokedAt" IS NOT NULL));
ALTER TABLE handled."Subscription"
  ADD CONSTRAINT "Subscription_values" CHECK (version > 0 AND "currentPeriodEnd" > "currentPeriodStart" AND length(btrim("planCode")) > 0 AND length(btrim("productCode")) > 0);
ALTER TABLE handled."Payment"
  ADD CONSTRAINT "Payment_values" CHECK (
    version > 0 AND "amountMinor" >= 0 AND currency ~ '^[A-Z]{3}$'
    AND (status NOT IN ('SETTLED','REFUNDED') OR "paidAt" IS NOT NULL)
    AND ((status = 'REFUNDED') = ("refundedAt" IS NOT NULL))
    AND ("refundedAt" IS NULL OR "refundedAt" >= "paidAt")
  );
ALTER TABLE handled."ProductAccess"
  ADD CONSTRAINT "ProductAccess_values" CHECK (version > 0 AND length(btrim("productCode")) > 0);
ALTER TABLE handled."Ticket"
  ADD CONSTRAINT "Ticket_values" CHECK (
    version > 0 AND length(btrim(subject)) > 0
    AND (("customerVerifiedAt" IS NULL) = ("customerVerifiedById" IS NULL))
    AND ("customerVerifiedAt" IS NULL OR "customerId" IS NOT NULL)
    AND ("requesterEmail" IS NULL OR "requesterEmail" = lower(btrim("requesterEmail")))
  );
ALTER TABLE handled."TicketMessage"
  ADD CONSTRAINT "TicketMessage_values" CHECK (
    length(btrim(body)) BETWEEN 1 AND 10000
    AND (("authorType" = 'AGENT' AND "authorUserId" IS NOT NULL AND "authorMembershipId" IS NOT NULL)
      OR ("authorType" <> 'AGENT' AND "authorUserId" IS NULL AND "authorMembershipId" IS NULL))
    AND ("authorType" <> 'CUSTOMER' OR visibility = 'PUBLIC')
  );
ALTER TABLE handled."InvestigationRun"
  ADD CONSTRAINT "InvestigationRun_values" CHECK (
    version > 0 AND id IS DISTINCT FROM "parentRunId"
    AND length(btrim(provider)) > 0 AND length(btrim(model)) > 0 AND length(btrim("promptVersion")) > 0
    AND ((status = 'QUEUED' AND "startedAt" IS NULL AND "finishedAt" IS NULL)
      OR (status = 'RUNNING' AND "startedAt" IS NOT NULL AND "finishedAt" IS NULL)
      OR (status IN ('COMPLETED','NEEDS_REVIEW') AND "startedAt" IS NOT NULL AND "finishedAt" IS NOT NULL)
      OR (status = 'FAILED' AND "finishedAt" IS NOT NULL AND "failureCode" IS NOT NULL))
    AND ("finishedAt" IS NULL OR "startedAt" IS NULL OR "finishedAt" >= "startedAt")
  );
CREATE UNIQUE INDEX "InvestigationRun_one_active_per_ticket"
  ON handled."InvestigationRun" ("workspaceId", "ticketId")
  WHERE status IN ('QUEUED','RUNNING');
ALTER TABLE handled."InvestigationStep"
  ADD CONSTRAINT "InvestigationStep_values" CHECK (
    sequence > 0 AND length(btrim(label)) > 0
    AND ("durationMs" IS NULL OR "durationMs" >= 0)
    AND jsonb_typeof("sourceRefs") = 'array' AND jsonb_array_length("sourceRefs") <= 50
    AND (type <> 'TOOL' OR ("toolName" IS NOT NULL AND length(btrim("toolName")) > 0))
  );
ALTER TABLE handled."Proposal"
  ADD CONSTRAINT "Proposal_values" CHECK (
    version > 0 AND length(btrim(summary)) BETWEEN 1 AND 4000
    AND length(btrim("replyDraft")) BETWEEN 1 AND 10000
    AND jsonb_typeof("missingFacts") = 'array' AND jsonb_array_length("missingFacts") <= 20
    AND (confidence <> 'HIGH' OR jsonb_array_length("missingFacts") = 0)
    AND (("recommendationType" IS NULL AND "recommendationPayload" IS NULL AND confidence = 'LOW')
      OR ("recommendationType" IS NOT NULL AND "recommendationPayload" IS NOT NULL AND jsonb_typeof("recommendationPayload") = 'object'))
  );
CREATE UNIQUE INDEX "Proposal_one_current_revision"
  ON handled."Proposal" ("workspaceId", "investigationId") WHERE status <> 'SUPERSEDED';
ALTER TABLE handled."ProposalSource"
  ADD CONSTRAINT "ProposalSource_values" CHECK (
    "contentHash" ~ '^[a-f0-9]{64}$' AND length(btrim(excerpt)) BETWEEN 1 AND 4000
    AND length(btrim(title)) > 0 AND length(btrim("sourceRefId")) > 0
    AND (score IS NULL OR score BETWEEN -1 AND 1)
    AND (("sourceType" = 'TOOL' AND "documentId" IS NULL AND "documentVersion" IS NULL AND "chunkId" IS NULL AND score IS NULL)
      OR ("sourceType" = 'KNOWLEDGE' AND "documentId" IS NOT NULL AND "documentVersion" IS NOT NULL AND "documentVersion" > 0 AND "chunkId" IS NOT NULL))
  );
ALTER TABLE handled."ProposalDecision"
  ADD CONSTRAINT "ProposalDecision_values" CHECK (
    "proposalVersion" > 0 AND (reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 2000)
    AND (kind NOT IN ('REJECTED','ESCALATED') OR reason IS NOT NULL)
  );
ALTER TABLE handled."OutboxEvent"
  ADD CONSTRAINT "OutboxEvent_values" CHECK (attempts >= 0 AND (("lockToken" IS NULL) = ("lockedUntil" IS NULL)));
ALTER TABLE handled."IdempotencyRecord"
  ADD CONSTRAINT "IdempotencyRecord_values" CHECK ("requestHash" ~ '^[a-f0-9]{64}$' AND length(key) BETWEEN 8 AND 128);

CREATE FUNCTION handled.reject_history_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Historical records are append-only' USING ERRCODE = '23514';
END;
$$;

DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['AuditEvent','ProposalSource','ProposalDecision','TicketMessage','IdempotencyRecord'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON handled.%I FOR EACH ROW EXECUTE FUNCTION handled.reject_history_mutation()', tab);
  END LOOP;
END; $$;

CREATE FUNCTION handled.guard_proposal_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Proposal history cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','updatedAt']) THEN
    RAISE EXCEPTION 'Proposal content is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
    (OLD.status = 'DRAFT' AND NEW.status IN ('READY','SUPERSEDED','ESCALATED')) OR
    (OLD.status = 'READY' AND NEW.status IN ('APPROVED','REJECTED','ESCALATED','SUPERSEDED'))
  ) THEN
    RAISE EXCEPTION 'Invalid proposal state transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_proposal BEFORE UPDATE OR DELETE ON handled."Proposal"
  FOR EACH ROW EXECUTE FUNCTION handled.guard_proposal_revision();

CREATE FUNCTION handled.guard_run_transition() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF OLD.status IN ('COMPLETED','FAILED','NEEDS_REVIEW') THEN
    RAISE EXCEPTION 'Terminal investigation is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
    (OLD.status = 'QUEUED' AND NEW.status IN ('RUNNING','FAILED')) OR
    (OLD.status = 'RUNNING' AND NEW.status IN ('COMPLETED','FAILED','NEEDS_REVIEW'))
  ) THEN
    RAISE EXCEPTION 'Invalid investigation state transition' USING ERRCODE = '23514';
  END IF;
  IF ROW(NEW.id,NEW."workspaceId",NEW."ticketId",NEW."parentRunId",NEW.provider,NEW.model,NEW."promptVersion",NEW."triggeredByUserId",NEW."triggeredByMembershipId",NEW."triggeredBySessionId",NEW."requestId",NEW."createdAt")
    IS DISTINCT FROM ROW(OLD.id,OLD."workspaceId",OLD."ticketId",OLD."parentRunId",OLD.provider,OLD.model,OLD."promptVersion",OLD."triggeredByUserId",OLD."triggeredByMembershipId",OLD."triggeredBySessionId",OLD."requestId",OLD."createdAt") THEN
    RAISE EXCEPTION 'Investigation identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER investigation_lifecycle BEFORE UPDATE ON handled."InvestigationRun"
  FOR EACH ROW EXECUTE FUNCTION handled.guard_run_transition();

-- A workspace row serializes membership changes; the deferred check allows
-- workspace creation and its initial administrator to commit together.
CREATE FUNCTION handled.lock_membership_workspace() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  PERFORM 1 FROM handled."Workspace" WHERE id = COALESCE(NEW."workspaceId",OLD."workspaceId") FOR UPDATE;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND ROW(NEW.id,NEW."workspaceId",NEW."userId") IS DISTINCT FROM ROW(OLD.id,OLD."workspaceId",OLD."userId") THEN
    RAISE EXCEPTION 'Membership identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER membership_lock BEFORE INSERT OR UPDATE OR DELETE ON handled."Membership"
  FOR EACH ROW EXECUTE FUNCTION handled.lock_membership_workspace();

CREATE FUNCTION handled.require_workspace_admin() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE workspace_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'Workspace' THEN workspace_id := NEW.id;
  ELSE workspace_id := COALESCE(NEW."workspaceId",OLD."workspaceId"); END IF;
  IF EXISTS (SELECT 1 FROM handled."Workspace" WHERE id = workspace_id AND status = 'ACTIVE')
    AND NOT EXISTS (SELECT 1 FROM handled."Membership" WHERE "workspaceId" = workspace_id AND role = 'ADMIN' AND status = 'ACTIVE') THEN
    RAISE EXCEPTION 'Active workspace requires an active administrator' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER membership_admin AFTER INSERT OR UPDATE OR DELETE ON handled."Membership"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION handled.require_workspace_admin();
CREATE CONSTRAINT TRIGGER workspace_admin AFTER INSERT OR UPDATE ON handled."Workspace"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION handled.require_workspace_admin();

REVOKE ALL ON SCHEMA handled FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA handled FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA handled FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA handled REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA handled REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
DO $$ DECLARE tab text; role_name text; BEGIN
  FOR tab IN SELECT tablename FROM pg_tables WHERE schemaname = 'handled' LOOP
    EXECUTE format('ALTER TABLE handled.%I ENABLE ROW LEVEL SECURITY', tab);
  END LOOP;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA handled FROM %I',role_name);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA handled FROM %I',role_name);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA handled FROM %I',role_name);
    END IF;
  END LOOP;
END; $$;

COMMIT;
