# Durable queue

Transactional PostgreSQL outbox intents feed the standalone BullMQ worker. Capacity-aware claims, one-time execution tokens, heartbeat leases, bounded retries and current-lease transaction fences protect work and effects. ADMIN job reads/retry recover exhausted intents. The API does not start this worker.

See the [core setup and recovery guide](../../../docs/backend-core-setup.md),
[verification evidence](../../../docs/backend-core-verification.md) and
[solo backend roadmap](../../../docs/solo-backend-steps.md). Historical A/B/C/D
labels are module boundaries under solo execution; only Lead Jira items are updated.
