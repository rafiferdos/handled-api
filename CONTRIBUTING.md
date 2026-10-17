# Contributing to Handled API

**Current solo workflow — 17 October 2026:** follow the
[solo backend steps](docs/solo-backend-steps.md). Start focused work from the
current `testing` integration branch, push the feature branch, open its PR with
`testing` as the base, run the applicable checks, and merge that PR into
`testing` as authorized by the requester. Do not bypass the PR or push/merge
feature changes to `main` or `development` under this instruction. Implement
dependency domains rather than wait for separate owners; update only Lead Jira
items. Preserve domain boundaries and report frontend/deployment acceptance
separately. The older team examples below remain historical/default guidance
where this explicit solo workflow does not supersede them.

Start from the [setup guide](README.md), [module ownership](docs/ownership.md) and [feature guide](docs/feature-development.md). Jira is the primary task/status board; GitHub holds code, PRs and reviews. Read the updated [Notion project hub](https://app.notion.com/p/3f24ab5df14481e7875bdb241eff1529) before contract changes.

## Start your branch

Keep your current work committed or stashed before changing branches.

```bash
git switch main
git pull --ff-only origin main
nvm use
pnpm install --frozen-lockfile
git switch -c feat/SCRUM-45-ticket-api
pnpm start:dev
```

Use `feat/SCRUM-<id>-<task>`, `fix/...`, `refactor/...`, `test/...` or `chore/...`. One task, one short-lived branch, one focused PR. Preserve your local `.env`; copy new keys from `.env.example` and get credentials through the team lead's established secure channel.

## Work without conflicts

- Put domain controllers/services/DTOs/tests in your already-registered module; register providers there. Avoid editing main/bootstrap for each feature.
- Reuse common utilities and contracts. Coordinate shared files and dependency changes with the lead; do not reformat unrelated files in a feature PR.
- Edit only your schema file; review cross-domain relations and migration order with both owners. Update from main before generating a migration against a disposable local database.
- Export narrow consumer services; avoid broad barrels and `forwardRef` workarounds for unclear boundaries. Never reach into another domain to mutate its tables directly.
- Add the consuming frontend integration alongside the API feature. Review DTO/error/status changes before callers diverge.

Stage specific files, inspect the diff and commit a useful change:

```bash
git status
git diff
git add src/modules/ticket/ticket.service.ts
git diff --cached
git commit -m "feat(SCRUM-45): validate tenant-scoped ticket creation"
```

Meaningful commits are independently understandable changes. Avoid empty commits or arbitrary file-by-file splits. Preserve useful commit history when merging a multi-commit feature.

## Validate and review

```bash
pnpm format
pnpm check
git push -u origin feat/SCRUM-45-ticket-api
```

Open a PR targeting main using the template. Include Jira URL, behavior before/after, dependency/migration impact, tests and frontend/demo evidence when relevant. At least one peer reviews a normal feature PR. Keep main stable; direct main pushes are not the normal team workflow. This initial starter delivery follows the requester's explicit main-push instruction.

Update your branch without rewriting shared history:

```bash
git fetch origin
git merge origin/main
```

Resolve conflicts by understanding both changes, run the relevant checks, then commit. Do not blindly choose one side or force-push shared/protected branches. After merge, switch to main and pull with `--ff-only`; start the next task on a new branch.

## Jira evidence

Use the project's actual workflow: To Do → In Progress → In Review → Testing → Done. Record completed slice, next dependency, blocker and commit/PR/test evidence. A contract/helper is not a completed business feature; missing frontend, real auth, models/migrations, worker or live deployment stays visible. Only mark full feature completion after its acceptance criteria and release gate are proven.

## Repository administration

The lead should verify GitHub main protection: PR requirement, one approval, resolved conversations and blocked force-push/deletion. These hosting settings are not enforced by files in this starter. No CI/CD or Docker pipeline is added; `pnpm check` is the manual quality gate required for review.

Never commit `.env`, passwords, provider secrets, raw tokens, generated client, build output or coverage. Keep only variable names/placeholders in `.env.example`; rotate an exposed secret rather than assuming a deletion removes it from history.
