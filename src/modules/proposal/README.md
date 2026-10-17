# Human decisions

ProposalService composes immutable revisions and exact-version approve/reject/escalate decisions in an identity-bound transaction. Approval requires Idempotency-Key and current source, ticket, run, policy and target checks; MEDIUM needs a reason, LOW cannot execute. The exact decision, action admission, audit and outbox commit together. Edits preserve confidence and evidence while revalidating actionable content.

See the [core setup and recovery guide](../../../docs/backend-core-setup.md),
[verification evidence](../../../docs/backend-core-verification.md) and
[solo backend roadmap](../../../docs/solo-backend-steps.md). Historical A/B/C/D
labels are module boundaries under solo execution; only Lead Jira items are updated.
