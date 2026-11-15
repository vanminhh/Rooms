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

- [x] **FE-EX-14** Overlay in `src/features/public/` (one feature only, KIT-07), built from kit pieces: three choices "Tìm phòng" (closes onto `/`), "Tôi đang thuê" → `/thue`, "Quản lý tòa nhà" → `/ql`; the route guard handles login and `?next=` (AUTH-06). Texts from the dictionary in both languages.
  Done when: tests `UI-11: …`: each choice goes to the right place; a logged-in GUEST who picks "Quản lý tòa nhà" lands on `/toi`; picking never calls an API that changes the account (SCOPE-05).
  Checkpoint 14/11/2026: EntryScreen uses kit buttons/card and VI/EN dictionary, mounted by PublicHomePage only. Nine new tests cover visitor redirects with next, tenant/manager/boss destinations, GUEST fallback to /toi, zero API calls, and English labels. Lint exit 0, build exit 0 (731 modules; existing >500 kB chunk warning), full component suite 838/838 pass, 0 fail/skip, 135607.388 ms. Manual browser check not performed in this task. Persistence/reopen belongs to FE-EX-15; background and focus handling to FE-EX-16. Stop after FE-EX-14 for owner commit.
- [x] **FE-EX-15** Remember and reopen: the choice is kept in the browser (wrapped so a blocked storage still renders the page); the overlay shows only on `/` and only when nothing is remembered; the header gets "Chọn lại". `/phong/:id`, `/dang-nhap`, and links from notifications never show it.
  Done when: tests: first visit to `/` shows it, second does not, "Chọn lại" shows it again, a direct visit to `/phong/12` never does.
  Checkpoint 14/11/2026: FE-EX-14 committed as d3c77c9; owner confirmed its manual check. PublicLayout now owns entry visibility and the VI/EN Choose again button; EntryScreen saves only a browser preference via guarded storage helpers. Invalid/blocked storage does not break rendering. Direct room/login/recovery links bypass the overlay; explicit reopen navigates to /. Targeted tests 51/51; full suite 844/844 pass, 0 fail/skip (117546.3122 ms); lint/build exit 0 (732 modules; existing >500 kB chunk warning); diff check clean. Manual FE-EX-15 check pending owner. No new business assumptions. Stop for owner commit before FE-EX-16.
- [x] **FE-EX-16** ⏸ Background and accessibility (KIT-05): the still image always renders first; the video plays over it only when the file exists, is muted, has no controls, and is skipped with reduced-motion or when it fails to load. Focus stays inside the overlay, every choice works by keyboard and touch, no horizontal overflow at 360 px. The video file comes from the owner (Q-08): until it is in the repo, ship the still image only and say so in the report.
  Done when: tests for reduced-motion and for a failing video; manual check at 360 px and desktop; first-load time with and without the video reported.
  Verified 14/11/2026: hero still image, illustration label, initial focus, Tab/Shift+Tab cycle, inert background, scroll lock, focus restore, in-dialog language switch. Optional video stays hidden until playing; failure or reduced motion keeps the still image. No video file exists under assets/public, so shipping still only under Q-08. Real browser checked desktop and 360 CSS px (innerWidth=scrollWidth=360), VI/EN. Dev reload navigation timing without video: DOMContentLoaded 754 ms, load 1664.9 ms; not a cold-cache or production benchmark. With-video timing unavailable until owner supplies video.
- [x] **FE-EX-17** ⏸ `npm run lint`, `npm run build`, `npm run test:components`.
  Done when: all pass with real output quoted.
  Verified 14/11/2026: lint exit 0; build exit 0 (732 modules, existing >500 kB chunk warning); test:components 847/847 pass, 0 fail/skip, 138972.1054 ms. First full run 837/847: 9 auth-flow fake-DOM failures (missing querySelector) and 1 media error event harness failure; corrected the harnesses. Auth-flow rerun 102/102; entry component rerun 12/12. Continuous work authorized by owner: no commit pause.

## Questions for the owner

- Q-08 (spec): file video nền. Chưa có thì phần này giao ảnh tĩnh, video thêm sau.
- Q-EX4-1 resolved 14/11/2026: owner chose the current home hero image (`/images/hero-building.webp`).

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
