# Workspace module

Workspace, membership, invitation and last-admin workflows.

Step 2 implements `WorkspaceService`, membership and invitation controllers. Tokens are cryptographically random, stored only as hashes and accepted once against verified email/current admin authority.

Outbound invitation delivery is not configured.

See the [foundation setup/API guide](../../../docs/backend-foundation-setup.md),
[numbered backend roadmap](../../../docs/solo-backend-steps.md) and real DB tests in
`test/database`. A/B/C/D are retained module boundaries under the solo workflow.
Only Lead Jira items receive delivery updates.
