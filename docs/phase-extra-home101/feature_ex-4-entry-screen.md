# Phase Extra · Part 4 – Entry screen (FE-EX-14..17)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Fixes | The UI work (home page) and Phase 1 (navigation by role) |
| Needs first | EX-3 committed (texts in both languages) |
| Unblocks | EX-9 |
| How | main session builds (one feature); planner not needed |
| Part done when | FE-EX-17 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/frontend/CLAUDE.md`
2. `docs/spec/00-overview.md` – D-23, D-24, Q-08
3. `docs/spec/30-frontend.md` – UI-11 (the whole rule), the row of `/`
4. `docs/spec/10-auth.md` – AUTH-06, SCOPE-05
5. `docs/spec/31-ui-kit.md` – KIT-01, KIT-05, KIT-07, KIT-12, KIT-13
6. Code: how `/` is wired in `src/app/routes.tsx`, `src/pages/public/PublicHomePage.tsx`, `src/layouts/PublicLayout.tsx`, `src/app/guards.ts`, the kit's reduced-motion helpers (`tests/motion-preference.test.mjs`)

## Scope

In: the first-visit overlay on `/` with three choices, remembering it, "Chọn lại", the background (still image; video when the file exists).
Out: any new role or right (a choice only navigates), a new landing route, Home101's look, texts or assets.

## Tasks

- [ ] **FE-EX-14** Overlay in `src/features/public/` (one feature only, KIT-07), built from kit pieces: three choices "Tìm phòng" (closes onto `/`), "Tôi đang thuê" → `/thue`, "Quản lý tòa nhà" → `/ql`; the route guard handles login and `?next=` (AUTH-06). Texts from the dictionary in both languages.
  Done when: tests `UI-11: …`: each choice goes to the right place; a logged-in GUEST who picks "Quản lý tòa nhà" lands on `/toi`; picking never calls an API that changes the account (SCOPE-05).
- [ ] **FE-EX-15** Remember and reopen: the choice is kept in the browser (wrapped so a blocked storage still renders the page); the overlay shows only on `/` and only when nothing is remembered; the header gets "Chọn lại". `/phong/:id`, `/dang-nhap`, and links from notifications never show it.
  Done when: tests: first visit to `/` shows it, second does not, "Chọn lại" shows it again, a direct visit to `/phong/12` never does.
- [ ] **FE-EX-16** ⏸ Background and accessibility (KIT-05): the still image always renders first; the video plays over it only when the file exists, is muted, has no controls, and is skipped with reduced-motion or when it fails to load. Focus stays inside the overlay, every choice works by keyboard and touch, no horizontal overflow at 360 px. The video file comes from the owner (Q-08): until it is in the repo, ship the still image only and say so in the report.
  Done when: tests for reduced-motion and for a failing video; manual check at 360 px and desktop; first-load time with and without the video reported.
- [ ] **FE-EX-17** ⏸ `npm run lint`, `npm run build`, `npm run test:components`.
  Done when: all pass with real output quoted.

## Questions for the owner

- Q-08 (spec): file video nền. Chưa có thì phần này giao ảnh tĩnh, video thêm sau.
- Q-EX4-1 (FE-EX-16): ảnh tĩnh của màn chào dùng ảnh nào? Đề xuất: ảnh hero của trang chủ hiện tại.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
