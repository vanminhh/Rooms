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

- [ ] **FE-EX-22** API and labels: `features/viewings/api.ts` and a guest API for `/me/viewings*` and `viewing-times` following the spec 13 table; labels NEW "Chờ xác nhận", DONE "Đã xem", NO_SHOW "Khách không đến" in `status-labels.ts` (VIEW-10); old viewings show their slot label (VIEW-08).
  Done when: label tests with the spec texts; API tests for every route used.
- [ ] **FE-EX-23** Calendar booking on `/phong/:id` (VIEW-01, VIEW-08, VIEW-21): a month calendar (today to 30 days ahead; days without a free hour and days out of range disabled; legend "Còn chỗ" / "Không đặt được" / "Đã chọn"), the free hours of the chosen day as buttons, an optional note, "Gửi yêu cầu". Not logged in → "Đăng nhập để đặt lịch", returning to this room after login or sign-up. `VIEWING_TIME_TAKEN` shows the API message and reloads the hours; 429 and `ROOM_NOT_AVAILABLE` show their messages. Works by keyboard and touch, at 360 px, and with reduced-motion (KIT-05). Remove the old 3-slot form and its honeypot field, and remove their entries from the allow-list of the EX-3 "no Vietnamese literal" scan test.
  Done when: the scan test passes with no viewing file on its allow-list; tests for the calendar states, the login gate and the three errors; `ui-24-booking-panel.test.mjs` rewritten to the new panel; nothing posts to `/public/viewings`.
- [ ] **FE-EX-24** ⏸ Booked screen (VIEW-14): after a successful booking the panel shows "Đặt lịch thành công. Vui lòng đợi Rooms xác nhận.", the room and time, the phone of the building's manager and of Boss (Boss only when the building has no manager), and a link to `/toi/lich-hen/:id`.
  Done when: tests for a building with and without a manager; manual check on the dev server with the BE log showing the manager email. Stop and report FE-EX-22..24.
- [ ] **FE-EX-25** Guest pages (VIEW-18, VIEW-20): `/toi` – upcoming viewings first (waiting for confirmation, then confirmed), then past, with loading, empty and error states (UI-03); `/toi/lich-hen/:id` – room and building with address, time, status and how it was confirmed, contact of the person responsible, "Hủy lịch" with a confirm dialog (hidden after the start time), the note "Muốn đổi giờ? Gọi quản lý".
  Done when: page tests; cancel needs the confirm click; another user's id shows the not-found state; 360 px check.
- [ ] **FE-EX-26** Staff `/ql/lich-hen` and "Việc hôm nay" (VIEW-04, VIEW-07, VIEW-09, VIEW-15, VIEW-17, VIEW-22): list by date and hour; on a viewing waiting for confirmation "Xác nhận" (after the call) and "Gửi email xác nhận" (only when the guest has an email; a failed send shows the error and the viewing stays waiting); edit the time after agreeing by phone, with `VIEWING_TIME_TAKEN` handled; "Đã xem" / "Khách không đến" only after the start time; marks "Quá giờ, chưa xác nhận" and "Trùng giờ"; manual add with an exact hour (VIEW-03). The dashboard card counts viewings waiting for confirmation and lists the overdue and overlapping ones.
  Done when: page tests; `fe12-viewings-page.test.mjs`, `fe12-viewing-form.test.mjs` and `fe12-dashboard.test.mjs` updated and green.
- [ ] **FE-EX-27** ⏸ `npm run lint`, `npm run build`, `npm run test:components`.
  Done when: all pass with real output quoted; manual walk with two browsers (a guest and the building's manager): book an hour → the hour disappears for another guest → the manager confirms by phone → book another → the manager sends the confirmation email (text in the BE log) → the guest cancels and the hour is free again.

## Questions for the owner

<!-- none yet -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
