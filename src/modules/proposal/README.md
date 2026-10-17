# Proposal module

Immutable Proposal/Source revisions and exact-version ProposalDecision persistence.

Step 2 implements `ProposalRepository` validates structured output, copies immutable snapshots on edit and records decisions in a caller-owned `IdentityTransaction` from `UnitOfWork.runAs`. The coordinator must still verify current ticket/run/target/policy and create action/outbox atomically.

No public approval/action shortcut exists. Real source resolution and policy/action admission follow their numbered steps.

See the [foundation setup/API guide](../../../docs/backend-foundation-setup.md),
[numbered backend roadmap](../../../docs/solo-backend-steps.md) and real DB tests in
`test/database`. A/B/C/D are retained module boundaries under the solo workflow.
Only Lead Jira items receive delivery updates.
