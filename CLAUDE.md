# Trọ Thông Minh

Management system for a chain of mini apartment buildings for rent in Hà Nội: one Boss, managers (≤ 2 buildings each), tenants, guests. Postpaid monthly rent via VietQR, confirmed by a bank webhook.

## Change workflow (highest priority)

Since 11/11/2026 there are no draft folders. Edit the main files directly; git is the safety net. The owner verifies and commits.

1. Before a task, run `git status`. If there are uncommitted changes that do not belong to this task, tell the owner and wait, so "back to the last commit" stays a clean rollback.
2. Before coding, read the spec and collect every open question (`[OPEN]`, spec silent, business choice). Ask them all in one batch, with concrete options. After that, do not stop for things the spec answers.
3. Edit the main files and run the lint and tests of the app you touched.
4. Stop at each checkpoint and report: files changed, check results (real output), how to verify by hand, `[ASSUMPTION]`s used, and a suggested commit message with task and spec IDs. Checkpoints are the end of each task (or of the task group the owner named) and every step in rule 7.
5. The owner verifies, commits and says so; then continue. **Never run `git commit` yourself.** Push only when the owner approves that push in chat.
6. If the owner finds an error: fix it, or, only when the owner says so, go back to the last commit. Going back discards work, so never do it on your own.
7. Ask first, every time, because git cannot undo these: a schema change or a migration applied to a database; deleting files; installing a new dependency. `.env*` is filled by the owner only.

`Artifacts/`, `Source/frontend/artifact_FE/` and `Source/backend/artifact_BE/` are the old staging areas. They are history (`approved/`, `REVIEW.md`); do not create new drafts there.

## Source of truth

- `docs/spec/` is the specification. Start at `docs/spec/README.md`, always read `00-overview.md`, then only the module files your task needs.
- `Source/backend/prisma/schema.prisma` + `constraints.sql` are the verified schema.
- If code and spec disagree, follow the spec and say so. If the spec is silent or marked `[OPEN]`, ask the owner; do not invent business rules. Things marked `[ASSUMPTION]` may be implemented but must be listed in your summary.
- The claude.ai artifact pages linked in older notes are presentations only; ignore them when they differ from `docs/spec/`.

## Repo map

```
Artifacts/         old shared staging area, history only (approved/); reviews/ = UI kit reviews
assets/            raw source assets (logos, fonts, mockup PDFs, design images) – not served
docs/spec/         specification (English, Vietnamese domain terms and UI text)
Source/backend/    NestJS 12 + Prisma 6 API – see Source/backend/CLAUDE.md
  prisma/                                    schema.prisma, constraints.sql, check-constraints.mjs, migrations, seed
  src/modules/<module>/feature_<name>.md     backend task list of a feature
  artifact_BE/                               old backend staging area, history only
Source/frontend/   React 19 + Vite SPA – see Source/frontend/CLAUDE.md
  src/features/<module>/feature_<name>.md    frontend task list of a feature
  artifact_FE/                               old frontend staging area, history only
  src/components/                            official UI kit (An Lâm style) – rules in docs/spec/31-ui-kit.md
```

## How to work on a module

Each feature has a task file `feature_<name>.md` in its backend module folder and its frontend feature folder (e.g. `auth/feature_login.md`). Existing: **auth / login**. The owner creates the other feature files.

1. Open the feature file you were asked to work on. Read every file in its "Before you start" list first (this file, the app `CLAUDE.md`, the listed spec files).
2. Work task by task in order. Status marks: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked.
3. Set `[~]` when you start a task. Build it on the main files as in "Change workflow", and set `[x]` only after its "Done when" is verified (command output or manual check).
4. If a task fails or the spec does not answer something: set `[!]`, write the reason on the next line and in the file's "Issues log", add the question under "Questions for the owner", and ask the owner. Do not guess.
5. Keep task IDs stable (e.g. `BE-LOGIN-11`); use them with spec IDs in commit messages.

## Agents (by task size)

- **Default** (one task or a few tasks in one module): the main session writes the code and its tests. No subagents.
- **New module, or a change across backend and frontend**: run **planner** (Opus 5, effort medium) first. It writes only `PLAN.md`, at the path you give it (`docs/phase-<n>-<name>/plans/<task-ids>/PLAN.md`): architecture, open questions, checkpoints. Ask the owner its open questions in one batch, then build the checkpoints yourself.
- **Before the stop of a large or risky task** (new module, money, authorization, schema): run **reviewer** (Sonnet 5, effort medium) once on the uncommitted changes and put its full report in the checkpoint report. `DUYỆT` / `CHẶN` is its recommendation; the owner decides. Fix its blocking findings before you stop, or list the ones you did not fix and why.

Tests: expected values come from the spec, never from the code under test; no `.skip` / `.only`; do not mock the unit under test.

The agents live in `.claude/agents/`. `.claude/hooks/agent-guard.mjs` (run from `.claude/settings.json`) keeps the planner to `PLAN.md` and the reviewer read-only. Models are pinned by full ID and effort is set in each agent's frontmatter; change both there and here together.

One git repo at the root. The frontend UI is built only from the kit in `Source/frontend/src/components/` (official design, preview at `/components.html`); do not add another component folder or design system.

## Status

Phase 1 · Foundation is done (30/10/2026): the 3 roles log in and land in their layout, scope guard, first migration and seed, UI kit with form pieces; task lists and QA in `docs/phase-1-foundation/`. Phase 2 · Rooms is done (06/11/2026): buildings, services, managers, rooms and images, pricing with Boss approval and the 01:00 price job, public pages, viewings, "Việc hôm nay"; task lists, QA checklist and production notes in `docs/phase-2-rooms/`. Current phase: **3 · Contracts** (`docs/spec/01-architecture.md#roadmap`).

## Rules that apply everywhere

- Money is integer đồng. No floats. Dates: `date` for business dates, timezone `Asia/Ho_Chi_Minh`.
- All UI text is Vietnamese. Code, identifiers, commits and comments are English.
- Authorization and money math live only in the BE. The DB constraints are a safety net, not a replacement for BE validation.
- Never hard-delete rows with history; use `is_active`.
- Never commit secrets. `.env*` is ignored (except `.env.example`). Secrets: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `CCCD_KEY`, `BANK_WEBHOOK_SECRET`, `CLOUDINARY_URL`, `MAIL_*`.
- Reference requirement IDs (e.g. `BIL-09`) in test names and commit messages.

## Commands

```bash
# backend (Source/backend)
npm run start:dev      # API with watch
npm run test           # vitest unit tests
npm run test:e2e
npm run lint           # oxlint

# frontend (Source/frontend)
npm run dev
npm run build          # tsc -b && vite build
npm run lint
npm run test:components   # UI kit tests, must stay green

# database rule check (Source/backend) – see docs/spec/02-database.md
node prisma/check-constraints.mjs . prisma   # must print 50/50
```

## Definition of done

- The behavior matches the spec IDs you implemented; each business rule has a test named with its ID.
- Lint and tests pass for the app you touched; DB check still 50/50 if the schema changed.
- New `[ASSUMPTION]`s or spec gaps are reported in your final message, not silently decided.

## Working with the owner

The owner (Vietnamese speaker) wants to be asked, not surprised: when a business decision is unclear, ask with concrete options instead of choosing. Reply to the owner in Vietnamese.
