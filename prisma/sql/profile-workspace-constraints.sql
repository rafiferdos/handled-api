-- Profile / Workspace / Membership / Invite ERD constraints.
-- Apply AFTER the combined owner-reviewed Prisma table migration.
-- Not automatically applied; no shared migration history is created here.

-- Profile
ALTER TABLE "Profile" ADD CONSTRAINT "chk_profile_email_normalized" CHECK ("email" = lower(btrim("email")));
ALTER TABLE "Profile" ADD CONSTRAINT "chk_profile_metadata_json" CHECK ("metadata" IS NULL OR jsonb_typeof("metadata") = 'object');
ALTER TABLE "Profile" ADD CONSTRAINT "chk_profile_updated_order" CHECK ("updatedAt" >= "createdAt");

-- Workspace
ALTER TABLE "Workspace" ADD CONSTRAINT "chk_workspace_slug" CHECK ("slug" = lower("slug") AND "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "Workspace" ADD CONSTRAINT "chk_workspace_public_form_key" CHECK (NOT "publicFormEnabled" OR "supportFormTokenHash" IS NOT NULL);
ALTER TABLE "Workspace" ADD CONSTRAINT "chk_workspace_website_scheme" CHECK ("websiteUrl" IS NULL OR "websiteUrl" ~ '^https://');
ALTER TABLE "Workspace" ADD CONSTRAINT "chk_workspace_settings_json" CHECK ("settings" IS NULL OR jsonb_typeof("settings") = 'object');
ALTER TABLE "Workspace" ADD CONSTRAINT "chk_workspace_metadata_json" CHECK ("metadata" IS NULL OR jsonb_typeof("metadata") = 'object');
ALTER TABLE "Workspace" ADD CONSTRAINT "chk_workspace_updated_order" CHECK ("updatedAt" >= "createdAt");

-- Membership
ALTER TABLE "Membership" ADD CONSTRAINT "chk_membership_disabled_time" CHECK (("status" = 'DISABLED') = ("disabledAt" IS NOT NULL));
ALTER TABLE "Membership" ADD CONSTRAINT "chk_membership_updated_order" CHECK ("updatedAt" >= "createdAt");

-- Invite
ALTER TABLE "Invite" ADD CONSTRAINT "chk_invite_expiry" CHECK ("expiresAt" > "createdAt");
ALTER TABLE "Invite" ADD CONSTRAINT "chk_invite_accepted" CHECK (("status" = 'ACCEPTED' AND "acceptedAt" IS NOT NULL AND "acceptedByUserId" IS NOT NULL) OR ("status" <> 'ACCEPTED' AND "acceptedAt" IS NULL AND "acceptedByUserId" IS NULL));
ALTER TABLE "Invite" ADD CONSTRAINT "chk_invite_revoked" CHECK (("status" = 'REVOKED') = ("revokedAt" IS NOT NULL));

-- Case-insensitive uniqueness applies ONLY to pending invites.
CREATE UNIQUE INDEX "uq_invite_one_pending_email"
  ON "Invite" ("workspaceId", lower("email"))
  WHERE "status" = 'PENDING';
