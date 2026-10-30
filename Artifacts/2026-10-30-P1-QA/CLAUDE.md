# Trọ Thông Minh

Management system for a chain of mini apartment buildings for rent in Hà Nội: one Boss, managers (≤ 2 buildings each), tenants, guests. Postpaid monthly rent via VietQR, confirmed by a bank webhook.

## Review before changing main files (highest priority)

The owner approves every change before it reaches the main files: assets, UI, code, config, docs.

1. Create or change things first in a draft folder `<YYYY-MM-DD>-<task-id>/` inside a staging area, with a `REVIEW.md` (template and rules: `Artifacts/README.md`):
   - `Artifacts/` – shared drafts (assets, sample data, schema/spec drafts); paths inside mirror the repo root
   - `Source/frontend/artifact_FE/` – frontend drafts; paths mirror `Source/frontend/`
   - `Source/backend/artifact_BE/` – backend drafts; paths mirror `Source/backend/`
2. Test the draft there, tell the owner its path, and **stop until the owner explicitly approves in chat**.
3. After approval: set `REVIEW.md` to "ĐÃ DUYỆT <date>", then run `node .claude/scripts/apply-draft.mjs <draft folder>`. It copies every draft file to its target (except `REVIEW.md`, `PLAN.md`, `ref/`, `preview.html`) and moves the folder into that area's `approved/`; the owner confirms once. Then re-run the app's checks. Delete main files marked "Xóa" by hand, with the owner's OK.
4. Only exception: status marks, "Issues log" and "Questions for the owner" in `feature_*.md` may be edited directly.
5. Never write main files with shell commands (`cp`, `mv`, `sed -i`, redirects); use the file tools or `apply-draft.mjs`, so the guard below sees them.

Guard: `.claude/settings.json` runs `.claude/hooks/staging-guard.mjs` before every file edit and shell command; any edit outside the staging areas (and outside `feature_*.md`) and every `apply-draft.mjs` run makes Claude Code ask the owner first. Subagents may not run `apply-draft.mjs`.

## Source of truth

- `docs/spec/` is the specification. Start at `docs/spec/README.md`, always read `00-overview.md`, then only the module files your task needs.
- `Source/backend/prisma/schema.prisma` + `constraints.sql` are the verified schema.
- If code and spec disagree, follow the spec and say so. If the spec is silent or marked `[OPEN]`, ask the owner; do not invent business rules. Things marked `[ASSUMPTION]` may be implemented but must be listed in your summary.
- The claude.ai artifact pages linked in older notes are presentations only; ignore them when they differ from `docs/spec/`.

## Repo map

```
Artifacts/         shared staging area for drafts awaiting approval; approved/ = history; reviews/ = UI kit reviews
assets/            raw source assets (logos, fonts, mockup PDFs, design images) – not served
docs/spec/         specification (English, Vietnamese domain terms and UI text)
Source/backend/    NestJS 12 + Prisma 6 API – see Source/backend/CLAUDE.md
  prisma/                                    schema.prisma, constraints.sql, check-constraints.mjs, migrations, seed
  src/modules/<module>/feature_<name>.md     backend task list of a feature
  artifact_BE/                               backend staging area (drafts, approved/)
Source/frontend/   React 19 + Vite SPA – see Source/frontend/CLAUDE.md
  src/features/<module>/feature_<name>.md    frontend task list of a feature
  artifact_FE/                               frontend staging area (drafts, approved/)
  src/components/                            official UI kit (An Lâm style) – rules in docs/spec/31-ui-kit.md
```

## How to work on a module

Each feature has a task file `feature_<name>.md` in its backend module folder and its frontend feature folder (e.g. `auth/feature_login.md`). Existing: **auth / login**. The owner creates the other feature files.

1. Open the feature file you were asked to work on. Read every file in its "Before you start" list first (this file, the app `CLAUDE.md`, the listed spec files).
2. Work task by task in order. Status marks: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked.
3. Set `[~]` when you start a task. Build it as a draft in the staging area (section above), get the owner's approval, apply it, then set `[x]` only after its "Done when" is verified on the main files (command output or manual check).
4. If a task fails or the spec does not answer something: set `[!]`, write the reason on the next line and in the file's "Issues log", add the question under "Questions for the owner", and ask the owner. Do not guess.
5. Keep task IDs stable (e.g. `BE-LOGIN-11`); use them with spec IDs in commit messages.

## Agent pipeline (features, modules, UI screens)

The agents live in `.claude/agents/`. `.claude/hooks/agent-guard.mjs` (run from `.claude/settings.json`, keyed by the calling agent's name) keeps each one in its lane, also when nested. The main session does not run them one by one: it creates the draft folder with `REVIEW.md`, sets the tasks `[~]`, runs `node .claude/scripts/main-files.mjs save`, and hands the request and folder path to **orchestrator** (Haiku 5.5, effort high), which runs the chain in its own context and passes only paths, so every agent starts clean:

1. **planner** (Opus 5.5, effort high) writes `PLAN.md`: architecture, open questions, checkpoints.
2. Per checkpoint, **coder** (Haiku 5.5, effort high) builds it in the draft folder (no tests), then **tester** (Sonnet 5.5, effort high) writes and runs tests from the spec and `PLAN.md`. On `FAIL` the coder fixes and the tester re-runs, at most 2 rounds.
3. **reviewer** (Sonnet 5.5, effort medium) reviews the whole draft folder, given only its path.

Models are pinned by full ID and effort is set in each agent's frontmatter; change both there and here together.

After every orchestrator reply, run `node .claude/scripts/main-files.mjs check` first. It lists main files changed during the run, including shell writes the hooks cannot see. Report every listed file to the owner, and neither keep nor revert it without the owner's word. Run `save` again before each resume.

The orchestrator returns only one of two messages:
- `DỪNG …` (open questions, coder blocked, or tests still failing after 2 rounds): set the task `[!]` as in "How to work on a module", ask the owner, then resume the orchestrator (`SendMessage`) with the answers.
- `XONG …` with the reviewer's report: put the test and review results in `REVIEW.md` under "Đã kiểm tra" and present the draft with the full report. `DUYỆT` / `CHẶN` is the reviewer's recommendation; the owner decides to approve or to ask for more fixes, which go back to the orchestrator. After approval, continue with step 3 of "Review before changing main files".

Small fixes (a typo, a one-line change) may skip the pipeline, never the approval.

One git repo at the root. The frontend UI is built only from the kit in `Source/frontend/src/components/` (official design, preview at `/components.html`); do not add another component folder or design system.

## Status

Phase 1 · Foundation is done (30/10/2026): the 3 roles log in and land in their layout, scope guard, first migration and seed, UI kit with form pieces; task lists and QA in `docs/phase-1-foundation/`. Current phase: **2 · Rooms** (`docs/spec/01-architecture.md#roadmap`).

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
