# Refresh and recovery

Authenticated REST polling is the selected refresh/recovery contract for this delivery. Clients refetch persisted investigation, proposal, action and audit state after admission, reconnect or worker restart; current membership is checked on reads. No Socket.IO server or room subscription is implemented. Push notifications remain deferred until worker/hosting acceptance.

See the [core setup and recovery guide](../../../docs/backend-core-setup.md),
[verification evidence](../../../docs/backend-core-verification.md) and
[solo backend roadmap](../../../docs/solo-backend-steps.md). Historical A/B/C/D
labels are module boundaries under solo execution; only Lead Jira items are updated.
