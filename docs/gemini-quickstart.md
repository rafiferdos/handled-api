# Gemini setup

Updated **17 October 2026**. The ignored local `.env` already has the non-secret
model settings below. Existing database/Auth configuration was preserved.

1. Create a key in [Google AI Studio](https://aistudio.google.com/apikey). Put it
   in **this backend's** `.env`; keep it out of source control and frontend code.
   The [official key guide](https://ai.google.dev/gemini-api/docs/api-key) covers
   project permissions and API restrictions.
2. Set `REDIS_URL` to your running Redis connection. Local Redis typically uses
   `redis://127.0.0.1:6379`; use the actual host, credentials and verified TLS
   `rediss://` URL for a hosted service. The disposable test URL is not an app URL.

```dotenv
GEMINI_API_KEY=your_private_key
REDIS_URL=redis://127.0.0.1:6379
AI_PROVIDER=gemini
AI_MODEL=gemini-3.8-flash
GEMINI_MODEL=gemini-3.8-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-2
AI_PROMPT_VERSION=handled-core-v1
AI_TIMEOUT_MS=30000
AI_MAX_RETRIES=2
EMBEDDING_DIMENSION=768
RAG_TOP_K=5
INVESTIGATION_CONCURRENCY=2
ACTION_SIMULATION=true
```

3. With Node 22.23.3 / pnpm 11.25.0, run:

```bash
pnpm ai:probe
```

Success prints `live-provider-probe`, validated classification/read-tool counts
and `embeddingDimensions:768`. Failure prints a safe error code and exits with
a failure status. This calls the real provider and consumes its quota. If a model
is unavailable to your key, update the environment using the current official
[generation](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) and
[embedding](https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2)
references, then repeat the probe. `AI_MODEL` overrides `GEMINI_MODEL`.

4. Follow the [core setup guide](backend-core-setup.md) to review/apply migrations
   and runtime grants on the chosen database. Start the compiled API and worker
   in separate terminals; `ai:probe` already builds both:

```bash
# Terminal 1
pnpm start:prod
```

```bash
# Terminal 2, same backend directory and environment
pnpm worker:prod
```

5. As a workspace ADMIN, publish the three policy drafts through
   `POST /api/v1/workspaces/:workspaceId/knowledge/documents/:documentId/publish`
   with `{"expectedVersion":1}` for an unchanged seed draft. Read the actual
   current version first. Poll document detail until the published revision's
   `indexStatus` is `READY`; use search preview to verify retrieval. Scoped
   seeding instructions are in the [foundation guide](backend-foundation-setup.md).
6. Run `pnpm ai:evaluate` for the 22-case provider benchmark, then exercise all
   three real API/worker golden flows. A nonzero benchmark exit means at least
   one case failed; retain and inspect the JSON result rather than assuming
   accuracy. It uses synthetic facts and does not replace integrated acceptance.

Gemini is the implemented adapter. Resolve AI has no verified API contract here.
Adding a key enables provider verification; shared DB grants/migrations, policy
indexing, Redis and continuous worker hosting still require their own setup.
