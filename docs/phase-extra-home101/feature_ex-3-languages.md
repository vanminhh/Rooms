# Phase Extra · Part 3 – Vietnamese + English (BE-EX-10..11, FE-EX-08..13)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Fixes | Phase 1, Phase 2 and the UI work (all texts were Vietnamese only) |
| Needs first | EX-2 committed. Not at the same time as another part that edits public or auth pages (EX-4, EX-5, EX-7) |
| Unblocks | EX-4 |
| How | planner writes `plans/EX-3/PLAN.md` (it decides: own small dictionary or a library) → main session builds |
| Part done when | FE-EX-13 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/frontend/CLAUDE.md`, `Source/backend/CLAUDE.md`
2. `docs/spec/00-overview.md` – G-03, D-27, A-12
3. `docs/spec/01-architecture.md` – "Languages" LOC-01..06, API-03
4. `docs/spec/30-frontend.md` – UI-01, UI-02, UI-12; `docs/spec/31-ui-kit.md` – KIT-04, KIT-13
5. Code FE: `src/shared/` (`api.ts`, `status-labels.ts`, `formatters.ts`), `src/layouts/`, `src/components/` (`RoomsHeader`, `RoomsFooter`), `src/pages/public/`, `src/features/public/`, `src/features/auth/`
6. Code BE: `src/common/errors/` (filter, `validation.ts`, `error-code.ts`), every non-spec file with a Vietnamese `message` in `auth`, `rooms`, `buildings`, `viewings`

## Scope

In: the dictionary mechanism, the language switch, English for the public pages, the auth pages and the guest area that exist after EX-2; BE error texts in English on `/public/*`, `/auth/*`, `/me/*`.
Out: the staff app `/ql` (stays Vietnamese, LOC-01), contract documents, the tenant pages that do not exist yet (they are written with the dictionary when Phase 3–5 build them), translating text typed by people (A-12), any currency choice (LOC-05).

## Tasks

- [ ] **FE-EX-08** ⏸ Dictionary core in `src/shared/i18n/`: `vi` and `en` dictionaries, `t(key, params)`, a provider, the choice kept in the browser, fallback to Vietnamese for a missing English text, never a raw key (LOC-03, LOC-04). If the plan chooses a library, stop and ask the owner before installing it.
  Done when: tests `LOC-04: …` for fallback and for "no raw key"; a test that fails when a key exists in `vi` but not in `en` lists the missing keys (allowed list empty at the end of the part).
- [ ] **FE-EX-09** Language switch "Tiếng Việt / English" in the header of `PublicLayout`, `GuestLayout`, `TenantLayout` (kit component takes its texts through props, KIT-04). `shared/api.ts` sends `Accept-Language` on every request (LOC-02). When logged in, the choice is saved with `PATCH /auth/me` (`locale`) and read from `/auth/me` at login.
  Done when: tests: switching changes the page without reload and keeps typed form input (UI-12); the header is sent; `StaffLayout` has no switch.
- [ ] **FE-EX-10** Public pages into the dictionary: home, `/phong`, `/toa/:id`, `/phong/:id`, header, footer, list states, status labels (`status-labels.ts` becomes bilingual). Money and dates do not change with the language (LOC-05).
  Done when: no Vietnamese literal left in these pages and components (a test scans the files); `2.984.000 đ` and `dd/mm/yyyy` are the same in both languages.
- [ ] **FE-EX-11** ⏸ Auth pages and guest area into the dictionary: `/dang-nhap`, `/dang-ky`, `/xac-minh-so`, `/quen-mat-khau`, `/doi-mat-khau`, `/toi`, `/toi/tai-khoan`, zod messages.
  Done when: same scan test for these files. Stop and report FE-EX-08..11.
- [ ] **BE-EX-10** Request language: read `Accept-Language` (`vi` / `en`, anything else → `vi`), use `en` only on `/public/*`, `/auth/*`, `/me/*` (LOC-02). One catalog of messages per error code and language used by the exception filter and by validation messages; error `code`s unchanged.
  Done when: tests `LOC-02: …`: `/auth/login` wrong password in English with `en`; a staff route in Vietnamese with `en`; `fr` → Vietnamese.
- [ ] **BE-EX-11** English texts for every message the `auth`, public `rooms` / `buildings` and `viewings` endpoints can return, including `fields` messages. Emails and SMS texts use `users.locale` (LOC-06).
  Done when: a test walks the catalog and fails on a code without an English text; BE `lint`, `test`, `build` pass.
- [ ] **FE-EX-12** ⏸ English copy for approval: write every English sentence of the home page and other marketing copy (slogans, promises) in `docs/phase-extra-home101/en-copy.md`, Vietnamese beside English. The owner approves or edits it (KIT-13); until then the English site is not shown on production.
  Done when: the owner's answer is recorded in that file.
- [ ] **FE-EX-13** ⏸ `npm run lint`, `npm run build`, `npm run test:components`.
  Done when: all pass with real output quoted; manual walk of every translated page in both languages at 360 px and desktop; list `[ASSUMPTION]`s used (A-12).

## Questions for the owner

<!-- none yet -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
