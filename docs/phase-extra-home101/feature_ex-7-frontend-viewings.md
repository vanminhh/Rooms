# Phase Extra · Part 7 – Frontend viewings: calendar booking, my viewings, staff page (FE-EX-22..27)

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
- [~] **FE-EX-23** Calendar booking on /phong/:id (VIEW-01, VIEW-08, VIEW-16, VIEW-21): today through day30, disabled unavailable days/hours, legend "Còn chỗ" / "Không đặt được" / "Đã chọn", optional note and "Gửi yêu cầu". Before login use anonymous public hours and a login gate returning to this room; after login use no-store /me/rooms/:id/viewing-times (account phone resolved server-side, no phone in client request). This lets an existing guest add another room at capacity, including a MANUAL-only place, while enforcing cross-building conflicts. Every POST revalidates; VIEWING_TIME_TAKEN reloads hours, 429/ROOM_NOT_AVAILABLE show errors. Keyboard/touch, 360 px, reduced motion. Replace old 3-slot/honeypot form and remove its EX-3 literal-scan exemption.
  Done when: the scan test passes with no viewing file on its allow-list; tests for the calendar states, the login gate and the three errors; `ui-24-booking-panel.test.mjs` rewritten to the new panel; nothing posts to `/public/viewings`.
- [~] **FE-EX-24** ⏸ Booked screen (VIEW-14): after a successful booking the panel shows "Đặt lịch thành công. Vui lòng đợi Rooms xác nhận.", the room and time, the phone of the building's manager and of Boss (Boss only when the building has no manager), and a link to `/toi/lich-hen/:id`.
  Done when: tests for a building with and without a manager; manual check on the dev server with the BE log showing the manager email. Stop and report FE-EX-22..24.
- [~] **FE-EX-25** Guest pages (VIEW-18, VIEW-20): /toi lists upcoming waiting/confirmed then past with loading/empty/error states. /toi/lich-hen/:id shows room/building/address, appointment time/status/public contact, no confirmation method/time or cancellation side. "Hủy lịch" requires a confirm dialog and appears only for NEW/CONFIRMED before start; note "Muốn đổi giờ? Gọi quản lý". Refresh remaining viewings/availability after cancelling; one of multiple rooms cancelled does not necessarily free a place.
  Done when: page tests; cancel needs the confirm click; another user's id shows the not-found state; 360 px check.
- [~] **FE-EX-26** Staff /ql/lich-hen and dashboard (VIEW-04, VIEW-07, VIEW-09, VIEW-15, VIEW-17, VIEW-22): date/hour list, manual exact-hour add, reschedule by phone agreement with capacity errors. NEW offers "Xác nhận" and "Gửi email xác nhận" (owner email only; failure leaves NEW), also after start. After start, NEW/CONFIRMED has outcome buttons "Đã xem" (direct DONE) and "Hủy" (CANCELLED, note required), no no-show action. DONE may become LOST with note; no direct NEW/CONFIRMED → LOST. Mark overdue and genuine cross-building/capacity conflicts, not valid groups of up to 3 guests in one building. No confirmation/cancellation metadata display.
  Done when: page tests; `fe12-viewings-page.test.mjs`, `fe12-viewing-form.test.mjs` and `fe12-dashboard.test.mjs` updated and green.
- [~] **FE-EX-27** ⏸ `npm run lint`, `npm run build`, `npm run test:components`.
  Done when: lint/build/test:components pass with real output. Manual multi-account walk: 1st/2nd distinct guest keeps same-building hour available, 3rd fills it, 4th is refused; existing guest may add another room without another place; same guest/responsible cannot occupy two buildings at once. Exercise PHONE/EMAIL and late confirmation, direct overdue NEW → DONE, no-show via cancellation, and last-room capacity release. Use a fake/dev-logging mailer; real email delivery is EX-8.

## Questions for the owner

- Q-EX7-01 / Q-EX6-4 resolved B (15/11/2026): TENANT requires email but no verification; GUEST still verifies. This is implemented in the booking gate and backend. Details and checkpoints: plans/EX-7/PLAN.md.

## Issues log

- 15/11/2026, historical planning entry: planner completed two checkpoints before EX-7 implementation. Q-EX7-01 is now resolved B and the code is present. Owner authorized continuous task groups without waiting for commits.

## Owner revision — 14/11/2026, clarification 15/11/2026

One phone is one guest across WEB/MANUAL; max 3 guests/building/hour, with guest and responsible-person cross-building exclusion. No NO_SHOW or confirmation/cancellation metadata. NEW past start may become DONE directly. These replace the original single-viewing-per-manager availability and no-show UI; follow current spec 13 and EX-6 plan.

## Tenant booking decision — 15/11/2026

Q-EX6-4 / Q-EX7-01 resolved: owner chose B. TENANT must have email but does not need email verification to book. Missing email returns VALIDATION_FAILED with fields.email; the existing account page lets TENANT add it. GUEST still needs verified email. Resend sends email, no SMS. This supersedes the pending question and the earlier verified-email-for-all wording. No schema or auth verification flow changes.

## Resumption checkpoint — 15/11/2026

Full npm run test:components: 853/853 passed, 0 failed/skipped, 114251.2906ms. Lint/build exit0; existing large-chunk warning retained. EX-7 reviewer report remains at plans/EX-7/CP-1-2-REVIEW.md. Vite starts, but both available browsers time out reaching localhost; desktop/360px and the real multi-account acceptance have not passed. FE-EX-27 therefore remains in progress. See [checkpoint report](CHECKPOINT-2026-11-15-resume.md).
