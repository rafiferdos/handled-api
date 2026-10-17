# Auth module

Verified asymmetric JWT, trusted profile sync and fresh current-session identity.

Step 2 implements `JwtVerifier`, the AccessContextResolver implementation and `ProfileService`. Managed Auth is read/locked through a private function; the API never accepts body-supplied email/role authority.

Hosted sign-up/verification/reset/logout integration with the later frontend.

See the [foundation setup/API guide](../../../docs/backend-foundation-setup.md),
[numbered backend roadmap](../../../docs/solo-backend-steps.md) and real DB tests in
`test/database`. A/B/C/D are retained module boundaries under the solo workflow.
Only Lead Jira items receive delivery updates.
