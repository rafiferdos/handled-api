# Ticket module

Authenticated tickets/messages, verification, assignments, manual closure and public intake.

Step 2 implements `TicketService`, `TicketStateService` and `PublicTicketService`. Create workflows are durable/idempotent; public receipts contain only id/reference/status. Customer linking is an explicit authenticated attestation.

Queue orchestration and action-owned state transitions are added by later steps.

See the [foundation setup/API guide](../../../docs/backend-foundation-setup.md),
[numbered backend roadmap](../../../docs/solo-backend-steps.md) and real DB tests in
`test/database`. A/B/C/D are retained module boundaries under the solo workflow.
Only Lead Jira items receive delivery updates.
