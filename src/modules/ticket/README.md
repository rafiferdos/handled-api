# Ticket module

Authenticated tickets/messages, verification, assignments, manual closure and public intake.

Step 2 implements `TicketService`, `TicketStateService` and `PublicTicketService`. Create workflows are durable/idempotent; public receipts contain only id/reference/status. Customer linking is an explicit authenticated attestation.

Queue orchestration and action-owned state transitions are added by later steps.

See the [foundation setup/API guide](../../../docs/backend-foundation-setup.md),
[numbered backend roadmap](../../../docs/solo-backend-steps.md) and real DB tests in
`test/database`. A/B/C/D are retained module boundaries under the solo workflow.
Only Lead Jira items receive delivery updates.

When a private frontend server proxies public intake, configure the same random
`SUPPORT_PROXY_SECRET` (at least 32 characters) on the API and that server. Keep
the form token and signing secret on the server. Public requests must then send:

- `X-Support-Client-IP`: one validated IPv4 or IPv6 address, obtained from the
  frontend hosting platform's authoritative client-IP header.
- `X-Support-Timestamp`: canonical positive integer Unix epoch seconds.
- `X-Support-Signature`: lowercase hexadecimal HMAC-SHA256 of the exact UTF-8
  string `${timestamp}\n${workspaceSlug}\n${origin}\n${ip}`, using the shared secret.

The API requires a signature within 60 seconds of its own clock, compares the
signature in constant time, and keys the durable public limiter by that verified
client IP. The signature binds the workspace and exact allowed `Origin` too.
Missing, stale or invalid proxy headers return 403 whenever signing is configured.
Replay remains bound to the existing idempotency key and payload contract. The
API never trusts unsigned `Forwarded`/`X-Forwarded-For`. With no proxy secret set,
direct integrations retain the socket-IP behavior. The signed headers are for
server-to-server requests and are intentionally absent from browser CORS headers.
