# Phase Extra · Part 7 – Frontend viewings: calendar booking, my viewings, staff page (FE-EX-22..27)

**Owner acceptance — 16/11/2026:** EX-6, EX-7, EX-8 and EX-9 were explicitly accepted as OK, including the phone-whitespace fix, success popup and overlap warning. Tasks below are closed on that owner sign-off and the existing verification record. This is not a new agent-run HTTP/e2e, browser or DB result. Consolidated evidence: [ex-9-qa-checklist.md](ex-9-qa-checklist.md). Earlier pending entries remain historical.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

Rewritten 12/11/2026 after the owner's final decisions (D-28..D-30, D-34): no proposal buttons, no claim card, no inbox. Task ID FE-EX-28 is retired.

| | |
|---|---|
| Fixes | Phase 2 (booking form, staff viewing page, "Việc hôm nay") and the UI work (booking panel) |
| Needs first | EX-2, EX-3 and EX-6 committed. Every new text of the public and guest pages goes into the EX-3 dictionary in Vietnamese and English (EX-3 left the old viewing form untranslated on purpose, owner 13/11/2026) |
| Unblocks | EX-8, EX-9. Goes to production together with EX-6 |
| How | planner writes `plans/EX-7/PLAN.md` (three areas: public, guest, staff) → main session builds |
| Part done when | FE-EX-27 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/frontend/CLAUDE.md`
2. `docs/spec/13-viewings.md` – all of it; the API table is the contract
3. `docs/spec/30-frontend.md` – rows `/phong/:id`, `/toi`, `/toi/lich-hen/:id`, `/ql/lich-hen`, `/ql`; UI-02..05, UI-07..09
4. `docs/spec/31-ui-kit.md` – KIT-01, KIT-05..07; `docs/spec/19-notifications.md` – NOTI-06
5. Code: `src/features/public/` (`ViewingForm.tsx`, `viewing-schema.ts`, `BookingJumpBar.tsx`, `booking-panel.css`), `src/pages/public/RoomDetailView.tsx`, `src/features/viewings/`, `src/pages/staff/ViewingsPage.tsx`, `StaffHomePage.tsx`, `src/features/dashboard/`, `src/shared/status-labels.ts`, tests `tests/p2/fe-p2-17-viewing-form.test.mjs`, `ui-24-booking-panel.test.mjs`, `fe12-*.test.mjs`
6. The owner's reference picture of the calendar (a month grid with free days, disabled days and the selected day, then hour buttons): reuse the idea, not the look – build it from the Rooms kit and tokens (KIT-01, KIT-07)

## Scope

In: the calendar + hour picker with the login gate, the "booked" screen, the guest's list and detail with cancel, the staff page with the two confirm actions, the dashboard card, the new status labels.
Out: "Chốt" → contract form (Phase 3), anything on the backend, the final email templates (EX-8).

## Tasks

- [x] **FE-EX-22** API and labels: staff/guest APIs follow spec 13; labels NEW "Chờ xác nhận", DONE "Đã xem", CANCELLED "Đã hủy"; no no-show status or confirmation/cancellation metadata. Request {via: PHONE|EMAIL} selects the confirmation action only. Old viewings keep slot labels (VIEW-08).
  Done when: label tests with the spec texts; API tests for every route used.
- [x] **FE-EX-23** Calendar booking on /phong/:id (VIEW-01, VIEW-08, VIEW-16, VIEW-21): today through day30, disabled unavailable days/hours, legend "Còn chỗ" / "Không đặt được" / "Đã chọn", optional note and "Gửi yêu cầu". Before login use anonymous public hours and a login gate returning to this room; after login use no-store /me/rooms/:id/viewing-times (account phone resolved server-side, no phone in client request). This lets an existing guest add another room at capacity, including a MANUAL-only place, while enforcing hard capacity/responsibility limits; guest cross-building overlap uses the VIEW-16a acknowledgement dialog. Every POST revalidates; VIEWING_TIME_TAKEN reloads hours, 429/ROOM_NOT_AVAILABLE show errors. Keyboard/touch, 360 px, reduced motion. Replace old 3-slot/honeypot form and remove its EX-3 literal-scan exemption.
  Done when: the scan test passes with no viewing file on its allow-list; tests for the calendar states, the login gate and the three errors; `ui-24-booking-panel.test.mjs` rewritten to the new panel; nothing posts to `/public/viewings`.
- [x] **FE-EX-24** ⏸ Booked screen (VIEW-14): after API success, open a kit popup with "Đặt lịch thành công", a waiting/contact reminder, room/time and public contacts. "Xem lịch hẹn" opens the created `/toi/lich-hen/:id`; "Đóng" retains the inline success and restores focus there. With no manager, refer to the Rooms contact and show Boss only. The appointment stays NEW. VI/EN, desktop/360 px, keyboard and full-viewport overlay must work.
  Done when: tests for a building with and without a manager; manual check on the dev server with the BE log showing the manager email. Stop and report FE-EX-22..24.
- [x] **FE-EX-25** Guest pages (VIEW-18, VIEW-20): /toi lists upcoming waiting/confirmed then past with loading/empty/error states. /toi/lich-hen/:id shows room/building/address, appointment time/status/public contact, no confirmation method/time or cancellation side. "Hủy lịch" requires a confirm dialog and appears only for NEW/CONFIRMED before start; note "Muốn đổi giờ? Gọi quản lý". Refresh remaining viewings/availability after cancelling; one of multiple rooms cancelled does not necessarily free a place.
  Done when: page tests; cancel needs the confirm click; another user's id shows the not-found state; 360 px check.
- [x] **FE-EX-26** Staff /ql/lich-hen and dashboard (VIEW-04, VIEW-07, VIEW-09, VIEW-15, VIEW-16a, VIEW-17, VIEW-22): date/hour list, manual exact-hour add, reschedule by phone agreement with capacity errors. Manual/reschedule show the guest-overlap warning and only retry the same payload after explicit acknowledgement; dismiss retains input and restores form focus. NEW offers "Xác nhận" and "Gửi email xác nhận" (owner email only; failure leaves NEW), also after start. After start, NEW/CONFIRMED has outcome buttons "Đã xem" (direct DONE) and "Hủy" (CANCELLED, note required), no no-show action. DONE may become LOST with note; no direct NEW/CONFIRMED → LOST. Mark overdue and hard responsible-person/capacity conflicts, not valid same-building groups or accepted guest-only overlaps. No confirmation/cancellation metadata display.
  Done when: page tests; `fe12-viewings-page.test.mjs`, `fe12-viewing-form.test.mjs` and `fe12-dashboard.test.mjs` updated and green.
- [x] **FE-EX-27** ⏸ `npm run lint`, `npm run build`, `npm run test:components`.
  Booking feedback accepted by the owner on 16/11/2026: Q-EX7-03 option B; one grouped checkpoint at [CHECKPOINT-2026-11-16-booking-feedback.md](CHECKPOINT-2026-11-16-booking-feedback.md). Manual acceptance is recorded from the owner's EX-7/EX-9 confirmation. Q-EX7-02 is resolved (phone whitespace, 16/11/2026); auth forms now trim outer phone whitespace before validation/submission. Passwords remain exact; verification is recorded in the follow-up below.
  Done when: lint/build/test:components pass with real output. Manual multi-account walk: 1st/2nd distinct guest keeps same-building hour available, 3rd fills it, 4th is refused; existing guest may add another room without another place; same responsible cannot occupy two buildings at once; the same guest may continue only after the VIEW-16a warning. Exercise PHONE/EMAIL and late confirmation, direct overdue NEW → DONE, no-show via cancellation, and last-room capacity release. Use a fake/dev-logging mailer; real email delivery is EX-8.
  Manual checkpoint prepared 16/11/2026: follow [FE-EX-27-MANUAL-CHECKLIST.md](FE-EX-27-MANUAL-CHECKLIST.md), one group at a time, with the owner operating the real browser. Two account sessions (GUEST and the building's MANAGER); additional distinct phones are MANUAL fixtures, not extra accounts. Desktop and 360 px are explicitly assigned to steps. The owner subsequently accepted EX-7 and EX-9; see the final acceptance note in that checklist. No per-step browser log is fabricated. Missing second/third-building data or overdue test rows is recorded as untested, not a pass. Backend host results do not replace this UI walk.

## Questions for the owner

- Q-EX7-01 / Q-EX6-4 resolved B (15/11/2026): TENANT requires email but no verification; GUEST still verifies. This is implemented in the booking gate and backend. Details and checkpoints: plans/EX-7/PLAN.md.
- Q-EX7-02 resolved (16/11/2026): owner clarified the affected field is the login phone. The shared phone schema for login, registration and password recovery trims leading/trailing whitespace before G-04 validation and sends the normalized phone. Embedded whitespace and malformed numbers are rejected. Passwords are preserved exactly; backend validation and credentials do not change.
- Q-EX7-03 resolved B (16/11/2026): allow guest cross-building overlap after a warning and explicit acknowledgement, including MANUAL and staff rescheduling. Different districts receive a travel reminder; no measured distance. Keep capacity, responsible-person exclusivity, duplicate account/room and WEB quota. Implement VIEW-16a together with the requested success popup; no auth change.

## Manual feedback investigation - 16/11/2026 (before implementation)

- Auth diagnosis: an offline check of the real login schema accepted the plain phone, rejected leading/trailing spaces, and preserved a trailing password space. No login HTTP request was made. Existing tests explicitly expect phone whitespace rejection; update those expectations only after the normalization behavior is settled.
- VIEW-14: the current code replaces the booking panel with inline success text after the API succeeds; it has no success popup. Owner requests a more visible notification. Proposed popup: title "Đặt lịch thành công", text "Yêu cầu của bạn đang chờ xác nhận. Quản lý tòa sẽ liên hệ với bạn.", room/time and existing public contacts, with "Xem lịch hẹn" and "Đóng". Retain the inline result after closing, the NEW status, and VI/EN support. Use the existing kit dialog and verify desktop/360 px plus keyboard focus. The owner has not reported passing these checks.
- Keep the previously accepted backend verification as evidence for the unchanged rules; do not treat it as verification of a possible future warning-only rule. No migration, seed, HTTP/e2e rerun, environment/config edit or implementation was performed during this investigation.

## Issues log

- 16/11/2026 · FE-EX-27 auth follow-up · Q-EX7-02 resolved: the phone field had trailing whitespace. Shared auth phone normalization is implemented. Two new regression tests failed before the fix; full FE now 864/864, 0 failures/skips, lint clean and build exit 0. Browser checks remain pending. No HTTP/e2e/backend/config/DB changes in this follow-up.

- 16/11/2026 · FE-EX-27 [~] · Option B and success popup are implemented across WEB/MANUAL/reschedule. Review initially blocked desktop overlay stacking and warning focus restoration; both were fixed and the focused reviewer follow-up is DUYỆT. The new focus regression failed before the fix and passed after it. Latest checks and the full review are in [booking checkpoint](CHECKPOINT-2026-11-16-booking-feedback.md); desktop/360 browser scenarios remain unverified. Auth Q-EX7-02 remains open.

- 16/11/2026 · FE-EX-27 [~] · owner selected B for Q-EX7-03; implementing booking warning and success popup as one backend/frontend checkpoint. Auth Q-EX7-02 remains unanswered and excluded. Prior full-suite evidence does not verify these new changes.

- 16/11/2026 · FE-EX-27 [!] · owner reported trailing-space login friction and requested visible booking success plus a same-hour/different-district warning. Root causes/current behavior inspected; Q-EX7-02/03 need owner answers before implementation. Manual walkthrough paused; no G/M data or browser scenario is marked passed from this feedback.
- 16/11/2026 · FE-EX-27 [~] · owner hit a PowerShell quoting SyntaxError in the group 0 startup command. Replaced `node -e` with a literal here-string piped to Node stdin; syntax-only and process-local environment checks passed without starting the backend. Owner subsequently confirmed "backend đã chạy"; startup blocker resolved, waiting for G/M sessions and test data. No browser check is marked passed.
- 16/11/2026 · FE-EX-27 [~] · backend verification is now green on the project host. Prepared the owner-run manual checklist; waiting for group 0 data/setup. The prior 853/853 frontend result, lint/build and reviewer evidence remain recorded; no frontend source changed in this documentation task. Keep Vitest MAIL_PROVIDER overrides unchanged; use a process-local console-mailer override for the live browser walk.
- 15/11/2026, historical planning entry: planner completed two checkpoints before EX-7 implementation. Q-EX7-01 is now resolved B and the code is present. Owner authorized continuous task groups without waiting for commits.

## Owner revision - 14/11/2026, clarification 15/11/2026 (guest rule superseded 16/11)

One phone is one guest across WEB/MANUAL; max 3 guests/building/hour, with guest and responsible-person cross-building exclusion. No NO_SHOW or confirmation/cancellation metadata. NEW past start may become DONE directly. These replace the original single-viewing-per-manager availability and no-show UI; follow current spec 13 and EX-6 plan.

## Tenant booking decision — 15/11/2026

Q-EX6-4 / Q-EX7-01 resolved: owner chose B. TENANT must have email but does not need email verification to book. Missing email returns VALIDATION_FAILED with fields.email; the existing account page lets TENANT add it. GUEST still needs verified email. Resend sends email, no SMS. This supersedes the pending question and the earlier verified-email-for-all wording. No schema or auth verification flow changes.

## Booking feedback decision - 16/11/2026

Q-EX7-03 option B permits a guest at two buildings at the same hour after a warning and explicit "Vẫn đặt" (or "Vẫn đổi giờ"). Different districts get a travel reminder. Actual capacity and responsible-person clashes remain hard failures. No success popup appears until the booking API succeeds; dismissing it leaves the inline result. This supersedes the earlier guest hard-block expectations. Checklist X2 now covers cancel/accept at desktop/360; X3/X4 cover manual/reschedule. The third accepted WEB booking consumes the third daily creation, so late-email QA may need an existing test viewing or the next day.

## Resumption checkpoint — 15/11/2026

Full npm run test:components: 853/853 passed, 0 failed/skipped, 114251.2906ms. Lint/build exit0; existing large-chunk warning retained. EX-7 reviewer report remains at plans/EX-7/CP-1-2-REVIEW.md. Vite starts, but both available browsers time out reaching localhost; desktop/360px and the real multi-account acceptance have not passed. FE-EX-27 therefore remains in progress. See [checkpoint report](CHECKPOINT-2026-11-15-resume.md).

## Auth follow-up verification — 16/11/2026

The real login form now submits a canonical phone after leading/trailing whitespace and still reaches the correct role home in the fake-fetch integration test. The shared schema covers login/register/forgot and preserves passwords; malformed/embedded whitespace is still rejected. Full npm run test:components: 864/864, 0 fail/skip, 157260.7201ms; lint/build exit 0. Manual AUTH steps are in the checklist; F5 is enough for this frontend change.

## Final closure — 16/11/2026

Owner accepted this part. The prior blockers are closed by that acceptance; historical logs are preserved with their original scope. No fresh per-case output was supplied with the confirmation. Code was already committed at c5adfde; this follow-up only updates acceptance documents. See [EX-9 ledger](ex-9-qa-checklist.md) for the known test counts, scope exclusions and next phase.
