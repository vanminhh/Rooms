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
Out: the old public viewing form (owner 13/11/2026: EX-6 and EX-7 replace it, so it stays Vietnamese until then), the staff app `/ql` (stays Vietnamese, LOC-01), contract documents, the tenant pages that do not exist yet (they are written with the dictionary when Phase 3–5 build them), translating text typed by people (A-12), any currency choice (LOC-05).

## Tasks

- [x] **FE-EX-08** ⏸ Dictionary core in `src/shared/i18n/`: `vi` and `en` dictionaries, `t(key, params)`, a provider, the choice kept in the browser, fallback to Vietnamese for a missing English text, never a raw key (LOC-03, LOC-04). If the plan chooses a library, stop and ask the owner before installing it.
  Done when: tests `LOC-04: …` for fallback and for "no raw key"; a test that fails when a key exists in `vi` but not in `en` lists the missing keys (allowed list empty at the end of the part).
- [x] **FE-EX-09** Language switch "Tiếng Việt / English" in the header of `PublicLayout`, `GuestLayout`, `TenantLayout` (kit component takes its texts through props, KIT-04). `shared/api.ts` sends `Accept-Language` on every request (LOC-02). When logged in, the choice is saved with `PATCH /auth/me` (`locale`) and read from `/auth/me` at login.
  Done when: tests: switching changes the page without reload and keeps typed form input (UI-12); the header is sent; `StaffLayout` has no switch.
- [x] **FE-EX-10** Public pages into the dictionary: home, `/phong`, `/toa/:id`, `/phong/:id`, header, footer, list states. `shared/status-labels.ts` stays Vietnamese: only the staff app uses it (checked by the planner, 13/11/2026). Money and dates do not change with the language (LOC-05).
  Done when: no Vietnamese literal left in these pages and components (a test scans the files); `2.984.000 đ` and `dd/mm/yyyy` are the same in both languages.
- [x] **FE-EX-11** ⏸ Auth pages and guest area into the dictionary: `/dang-nhap`, `/dang-ky`, `/xac-minh-email`, `/quen-mat-khau`, `/doi-mat-khau`, `/toi`, `/toi/tai-khoan`, zod messages.
  Done when: same scan test for these files. Stop and report FE-EX-08..11.
  Checkpoint 14/11/2026: owner confirmed the guided manual checks and requested continuation; code committed in 414ef1d. Checks covered registration, wrong/correct code, guest account read-only fields, and client validation on password change/recovery; successful password change/recovery submissions were not exercised.
- [x] **BE-EX-10** Request language: read `Accept-Language` (`vi` / `en`, anything else → `vi`), use `en` only on `/public/*`, `/auth/*`, `/me/*` (LOC-02). One catalog of messages per error code and language used by the exception filter and by validation messages; error `code`s unchanged.
  Checkpoint 14/11/2026: owner-provided full unit/HTTP result: 1655/1655 pass, 81 files, 64.40 s. Q-EX3-4 resolved as B; owner-provided e2e result: 53/53 pass, 7 files, 216.14 s. CP-4 verified, awaiting owner commit.
  Done when: tests `LOC-02: …`: `/auth/login` wrong password in English with `en`; a staff route in Vietnamese with `en`; `fr` → Vietnamese.
- [x] **BE-EX-11** English texts for every message the `auth`, public `rooms` / `buildings` and `viewings` endpoints can return, including `fields` messages. Emails to guests use `users.locale` (LOC-06).
  Checkpoint 14/11/2026: catalog, mail and estimate translations implemented; unit/HTTP 1655/1655 pass (owner screenshot), lint/build pass; e2e 53/53 pass (7 files, owner screenshot). Read-only review: source approved, see `plans/EX-3/CP-4-REVIEW.md`.
  Done when: a test walks the catalog and fails on a code without an English text; BE `lint`, `test`, `build` pass.
- [x] **FE-EX-12** ⏸ English copy for approval: write every English sentence of the home page and other marketing copy (slogans, promises) in `docs/phase-extra-home101/en-copy.md`, Vietnamese beside English. The owner approves or edits it (KIT-13); until then the English site is not shown on production.
  Checkpoint 14/11/2026: en-copy.md contains all home/nav/footer keys and room-list marketing copy, copied exactly from the dictionaries; owner approved all copy on 14/11/2026 (“duyệt hết nhé”), recorded in en-copy.md (KIT-13). CP-5 committed as 12e3135. CP-4 committed as e95efad.
  Done when: the owner's answer is recorded in that file.
- [x] **FE-EX-13** ⏸ `npm run lint`, `npm run build`, `npm run test:components`.
  Done when: all pass with real output quoted; manual walk of every translated page in both languages at 360 px and desktop; list `[ASSUMPTION]`s used (A-12).
  Checkpoint 14/11/2026: owner explicitly confirmed verification and closure of both remaining items (FE-EX-12 commit and final VI/EN checks on desktop and 360 px). Git was clean at 12e3135. Accepted on owner confirmation; no new automated run is claimed. Earlier evidence: FE lint/build exit 0 and 829/829 component tests; BE lint/build exit 0, 1655/1655 unit tests and 53/53 e2e tests. Assumptions remain those recorded in PLAN.md section 7; A-12 preserves user-entered content. Old public viewing form remains Vietnamese under OQ-2 until EX-7. EX-3 closed.

## Questions for the owner

- Q-EX3-4: owner chose B on 14/11/2026 — preserve /^en\b/i matching, including en-US/en-GB; other first languages fall back to vi.

Đã trả lời 13/11/2026 (câu hỏi của planner, chi tiết trong `plans/EX-3/PLAN.md`):

- OQ-1: không thêm cơ chế bật / tắt tiếng Anh. Chủ dự án duyệt `en-copy.md` ở điểm dừng FE-EX-12 rồi mới commit phần chữ tiếng Anh.
- OQ-2: EX-3 **không** dịch form đặt lịch công khai cũ (`ViewingForm.tsx`, `viewing-schema.ts`, thông điệp `CreateViewingDto`); EX-6 xóa route, EX-7 viết giao diện đặt lịch mới bằng từ điển hai ngôn ngữ. Cho tới lúc đó bản tiếng Anh còn một form chữ Việt.
- OQ-3: chủ dự án chỉ duyệt chữ marketing; nhãn và thông điệp lỗi tiếng Anh do agent viết và liệt kê trong báo cáo cuối.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->

- 14/11/2026 · BE-EX-10 · Header parsing differs between LOC-02 and plan §2.9/current registration. Resolved: owner chose B on 14/11/2026.

- 14/11/2026 · BE-EX-10/11 · code review approved; HTTP tests blocked by managed sandbox (`connect EACCES 127.0.0.1`). Run unit and e2e from the owner terminal before marking done. No schema/migration/seed/env changes.

- 14/11/2026 - BE-EX-10/11 - Resolved: owner ran tests outside the sandbox; unit/HTTP 1655/1655 and e2e 53/53 passed. Owner explicitly approved the e2e suite resetting seeded dev accounts before running it. CP-4 is verified and awaiting owner commit.
