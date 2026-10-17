# Hosted synthetic business acceptance

This repeatable probe drives the real HTTP API, hosted BullMQ worker and Gemini
provider. It does not replace browser login/interaction acceptance. All effects
must remain simulated and all customer/business records must be synthetic.

## Prepare an isolated scope

Use the existing explicit scoped seed described in
[backend foundation setup](backend-foundation-setup.md). Provision four distinct,
verified and active Supabase Auth users, two new workspace UUIDs, then run the
seed with the locally held migration-owner connection. The seed checks the Auth
users and uses deterministic fixture IDs. It preserves existing changed records;
it never resets business effects. Do not upload the migration-owner URL to the
application host. Use fresh workspace UUIDs for a new independent acceptance run
once a refund/cancellation/restoration has already happened.

The seeded subscription window is October 2026. Outside that window, prepare a
new reviewed synthetic fixture window before running time-sensitive actions.
The existing runtime role must not gain Auth-management privileges for seeding.

Log in to Supabase as the AcmeCloud admin and PixelDesk admin to obtain real
access tokens. On the API, bootstrap profiles as required, issue the AcmeCloud
support form token through `POST /workspaces/:id/support-form/token`, and keep it
private. Configure the allowed public origin and private form-token pepper before
enabling intake. If the frontend proxies public intake, also configure matching
private `SUPPORT_PROXY_SECRET` values on both servers and supply it to this probe.
See the [ticket module contract](../src/modules/ticket/README.md).

## Run and resume

Supply the following environment variables through private shell/session state;
never commit tokens, passwords, full environment dumps or output containing them:

- `HANDLED_API_BASE_URL`: hosted HTTPS base including `/api/v1`.
- `HANDLED_ADMIN_ACCESS_TOKEN`, `HANDLED_FOREIGN_ACCESS_TOKEN`: actual Supabase
  login access tokens for the two scoped admin users.
- `HANDLED_WORKSPACE_ID`, `HANDLED_FOREIGN_WORKSPACE_ID`: seeded AcmeCloud and
  PixelDesk UUIDs respectively.
- `HANDLED_PUBLIC_ORIGIN`: exact allowed frontend origin without a trailing slash.
- `HANDLED_FORM_TOKEN`: current private support form token.
- `HANDLED_SUPPORT_PROXY_SECRET`: required when the API uses signed public proxy
  mode; omit for explicitly direct/socket-IP mode.
- `HANDLED_ACCEPTANCE_STATE_FILE`: private absolute path, such as an explicitly
  chosen file under `/tmp`; it stores only workflow IDs and idempotency keys.
- Optional `HANDLED_ACCEPTANCE_TIMEOUT_MS`: per background stage, 30000–600000;
  default 240000 to include a Free-host wake delay.

Run `pnpm acceptance:hosted`. Reuse the same state file to resume after a network
interruption or to verify persisted effects again. The probe never logs tokens,
form secrets, customer messages or provider responses. It reports safe entity
IDs, selected model, terminal status and assertion labels. It never modifies an
AI proposal to force the desired result and never silently retries failed AI.
Investigate a recorded failed/needs-review run, then use the supported retry
endpoint deliberately if appropriate. Keep the existing state evidence.

## Acceptance assertions

For each refund, period-end cancellation and access-restoration case the probe:

1. Publishes the seeded policy and waits for the real index revision to be READY.
2. Creates a fresh public ticket, proves same-key replay and changed-body conflict.
3. Confirms investigation is denied before authenticated customer verification.
4. Verifies the controlled account mapping, admits a real Gemini investigation,
   and waits for completion with a policy citation and account-source citation.
5. Rejects a stale proposal version, approves the exact current version, replays
   the approval and requires the same action execution ID.
6. Waits for a SUCCEEDED simulated action, checks before/after state and rereads
   the actual account data for the persisted effect. Cancellation preserves the
   paid period end.
7. Requires persisted completion audit, exactly one ticket action, denied retry
   of the succeeded action, cross-tenant 403/404 isolation and RESOLVED ticket
   state after refetch.

A passing probe proves these HTTP/business stages for the recorded live source
and fixture scope. Browser submission, login, reload and responsive UI behavior
still require their separate evidence. Free-host sleep, Redis restart recovery,
provider quotas and always-on capacity are separate operational limits.
