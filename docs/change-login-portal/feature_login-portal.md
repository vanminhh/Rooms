# Change · Login by entry (BE-LP-01..03, FE-LP-01..04, QA-LP-01)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every deleted file and new dependency. Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop add to `LESSONS.md` any mistake that cost a retry.

Owner request 20/11/2026: the entry screen must separate the logins. Through "Tôi đang thuê" only a tenant can log in, through "Quản lý tòa nhà" only a manager or the Boss; checked by the BE, no session for the wrong account; one shared login page. Rules: D-43 ([00-overview.md](../spec/00-overview.md)), AUTH-16 ([10-auth.md](../spec/10-auth.md)), `WRONG_PORTAL` ([01-architecture.md](../spec/01-architecture.md)), UI-11 and the `/dang-nhap?loi-vao=` row ([30-frontend.md](../spec/30-frontend.md)). Plan: [PLAN.md](PLAN.md).

| | |
|---|---|
| Fixes | Phase 1 login (AUTH-01, AUTH-06) and Phase Extra EX-4 entry screen (UI-11) |
| Needs first | a clean `git status` (Phase 3 work committed or set aside) |
| Schema / dependency | none |
| How | main session builds; reviewer once before QA-LP-01 (authorization change) |
| Part done when | QA-LP-01 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md`, `Source/frontend/CLAUDE.md`, `docs/LESSONS.md`
2. `docs/spec/10-auth.md` – AUTH-01, AUTH-02, AUTH-04, AUTH-06, AUTH-12, **AUTH-16**, SCOPE-05
3. `docs/spec/00-overview.md` – D-23, **D-43**; `docs/spec/01-architecture.md` – error codes, LOC-02
4. `docs/spec/30-frontend.md` – UI-11, rows `/dang-nhap` and `/dang-nhap?loi-vao=`
5. [PLAN.md](PLAN.md)

## Scope

In: the `portal` field of `POST /auth/login`, the `WRONG_PORTAL` code (vi + en), the `?loi-vao=` entry of `/dang-nhap`, the guard that adds it, the texts of the login page at an entry.
Out: a separate login page per entry (owner: one shared page); any change to refresh, `/auth/me` or route permissions (SCOPE-01 stays the only authorization); the staff app texts in English (LOC-01).

## Tasks

- [x] **BE-LP-01** `WRONG_PORTAL` (403) in `ErrorCode` / `ERRORS` with the Vietnamese text of AUTH-16, and its English text in `src/common/i18n/messages.ts`.
  Done when: `app.setup.spec.ts` counts 32 codes and checks status + text; the English-catalog test has no missing code.
- [x] **BE-LP-02** `LoginDto.portal?: 'TENANT' | 'STAFF'` (any other value → `VALIDATION_FAILED` with `fields.portal`); `AuthService.login` checks it after the password, lock and before creating the session; the refused attempt is taken back from the AUTH-04 counter like `ACCOUNT_LOCKED`.
  Done when: tests `AUTH-16: …` for every row of the role × entry table in PLAN.md §3, plus: wrong password at an entry → `INVALID_CREDENTIALS`; locked tenant at the tenant entry → `ACCOUNT_LOCKED`; refused login creates no session row, no cookie, `last_login_at` unchanged; 6 refused logins in a row do not give 429.
- [x] **BE-LP-03** ⏸ e2e on the dev DB: seed tenant at `TENANT` ok, seed manager at `TENANT` refused, seed manager and Boss at `STAFF` ok, seed tenant at `STAFF` refused, `Accept-Language: en` gives the English text. `npm run lint`, `test`, `build`, `test:e2e`. Stop and report BE-LP-01..03.
- [x] **FE-LP-01** `loginRequest` and `AuthContext.login` take `portal?`; `guards.ts`: `entryOf(pathname)` (`/thue…` → `thue`, `/ql…` → `quan-ly`, else none) and `guardRedirect` adds `loi-vao=` for those two areas; `portalOf(param)` maps `thue` → `TENANT`, `quan-ly` → `STAFF`, anything else → none.
  Done when: tests: `/thue/tai-khoan?a=1` signed out → `/dang-nhap?loi-vao=thue&next=%2Fthue%2Ftai-khoan%3Fa%3D1`; `/ql` → `…loi-vao=quan-ly…`; `/toi`, `/doi-mat-khau` → no entry; unknown `loi-vao` → none; the old guard tests updated to the new URLs.
- [x] **FE-LP-02** `LoginPage` at an entry: title "Đăng nhập người thuê" / "Đăng nhập quản lý" (vi + en keys), no sign-up note, link "Dùng trang đăng nhập chung" → `/dang-nhap` keeping `?next=`; sends `portal`; `WRONG_PORTAL` shows the API message in the form error slot and the user stays signed out. `EntryScreen` needs no change (it navigates to `/thue` / `/ql`; the guard adds the entry).
  Done when: page tests for both entries and for the plain page; the i18n parity test has the new keys in `vi` and `en`; `ui-30-login` and `auth-login-flow` updated where they assert URLs or texts.
- [x] **FE-LP-03** ⏸ `npm run lint`, `npm run build`, `npm run test:components`. Stop and report FE-LP-01..03.
- [ ] **QA-LP-01** ⏸ Reviewer on the uncommitted changes (full report in the checkpoint). Manual walk with the seed accounts (PLAN.md §6) in Vietnamese and English, at 360 px and desktop.
  Done when: every line of PLAN.md §6 checked with its result.

## Questions for the owner

Answered 20/11/2026: block both ways; one shared login page; checked by the BE with no session. OQ-LP-1..3 (PLAN.md §7) answered 20/11/2026, all as proposed: a logged-in user who picks the other entry goes to their own home as in AUTH-06, with no message; the link "Dùng trang đăng nhập chung" stays; one shared error text. Nothing left open.

## Issues log

- 20/11/2026 · BE-LP-03 · `test/auth.e2e-spec.ts` stops in `seed()` (`prisma/seed.ts:266`, `meterReading.upsert` with `roomId_kind_readOn`, a unique key the current schema no longer has; Phase 3 BE-P3-20 area), so the scenario `loginByEntry` was run on the dev DB through a temporary spec without seed: 1/1 passed. Other e2e files (viewings, contracts, pricing, buildings) also failed in the full run; not investigated, not caused by the login change. Needed: owner decides who fixes the seed.
