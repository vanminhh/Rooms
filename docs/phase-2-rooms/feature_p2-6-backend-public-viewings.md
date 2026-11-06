# Phase 2 · Part 6 – Backend public API, viewings, "Việc hôm nay" (BE-P2-29..35)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified on the main files. Do tasks in order. Every task is drafted in `Source/backend/artifact_BE/` and approved by the owner before it touches main files (root `CLAUDE.md`). All parts and their order: [README.md](README.md).

| | |
|---|---|
| Needs first | Part 5 on the main files |
| Unblocks | Frontend parts 8b and 9 |
| Draft folder | `Source/backend/artifact_BE/<YYYY-MM-DD>-BE-P2-29-35/` |
| How | Pipeline |
| Part done when | BE-P2-35 on the main files |

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/backend/CLAUDE.md`
2. `docs/spec/00-overview.md` (A-03, A-05), `docs/spec/01-architecture.md`
3. `docs/spec/11-buildings-rooms.md` – BLD-04, BLD-05, ROOM-05, ROOM-08, PUB-01..04
4. `docs/spec/13-viewings.md` – VIEW-01..13 (VIEW-05, VIEW-06 are Phase 3)
5. `docs/spec/19-notifications.md` – NOTI-06 Phase 2 note; `docs/spec/12-pricing.md` – PRC-11
6. Code of parts 2–5 (`public-room.ts`, `rates-at.ts`, `buildingContact`)

## Scope

In: `/public/*` (controllers inside `buildings` and `rooms`), `viewings` module, `GET /dashboard` in `notifications`.
Out: VIEW-05, VIEW-06 (need contracts – Phase 3), other dashboard groups (later phases).

## Tasks

- [x] **BE-P2-29** `GET /public/locations`, `GET /public/rooms` (filters, `sort`, `meta`), `GET /public/featured-rooms` (PUB-01, ROOM-05, BLD-05).
  Done when: acceptance spec 11 "price = null never appears"; e2e on seed: CG01/203 and CG01/301 absent; building without E/W rate has no rooms.
- [x] **BE-P2-30** `GET /public/rooms/:id`, `GET /public/buildings/:id` (PUB-02..04, ROOM-08, BLD-04): images, deposit, today's and upcoming rates, `monthlyEstimate`, contact; non-public → 404.
  Done when: tests for ROOM-08 on a PER_M3 and a PER_PERSON building, a service without a rate, a locked service; no internal field in the body.
- [x] **BE-P2-31** `POST /public/viewings` (VIEW-01, VIEW-02, VIEW-08, VIEW-11, VIEW-12): honeypot, per-IP limit in memory, per-phone count with `pg_advisory_xact_lock`, same body without id.
  Done when: acceptance spec 13 "non-public room → ROOM_NOT_AVAILABLE", "4th submission same phone → 429"; parallel submissions; slot already started; date > 30 days.
- [x] **BE-P2-32** `GET /viewings?buildingId&status&from&to`, `POST /viewings` manual (VIEW-03), `PATCH /viewings/:id` (VIEW-04, VIEW-09) with conditional updates and `handled_by_id`.
  Done when: tests: WON refused, NEW → LOST refused, LOST without note refused, change date only while NEW/CONFIRMED, manual for a non-public active room works.
- [x] **BE-P2-33** `GET /dashboard?buildingId` in `src/modules/notifications/dashboard.*` (NOTI-06 Phase 2, VIEW-07, PRC-11).
  Done when: tests: manager counts own NEW viewings; Boss counts only buildings without an active manager; expired proposals not counted.
- [x] **BE-P2-34** VIEW-13: locking a building/room or maintenance keeps viewings; the locked building's viewings show on Boss's card.
  Done when: e2e test with the BE-P2-09 runner.
- [x] **BE-P2-35** `npm run lint`, `test`, `build`, `test:e2e` pass.
  Done when: all pass; list every `[ASSUMPTION]` (A-03).

## Questions for the owner

- Q-P6-1 (BE-P2-32, từ planner): POST /viewings thủ công cho phòng thuộc tòa khóa?
  Chủ dự án chọn B ngày 05/11/2026: chỉ Boss được tạo.
- Q-P6-2 (BE-P2-33): Thẻ "Lịch hẹn mới" có đếm lịch NEW đã quá visit_date?
  Chủ dự án chọn A ngày 05/11/2026: đếm tất cả lịch NEW.
- Q-P6-3 (BE-P2-32): CANCELLED có bắt buộc outcomeNote?
  Chủ dự án chọn A ngày 05/11/2026: không bắt buộc (chỉ LOST bắt buộc).
- Q-P6-4 (BE-P2-30, từ coder CP-2): Dịch vụ VEHICLE chưa có giá có hiện "chưa gồm: <tên> (chưa có giá)" trong ước tính ROOM-08?
  Chủ dự án chọn A ngày 05/11/2026: có hiện "chưa gồm"; VEHICLE có giá không vào tổng.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
- 05/11/2026 · BE-P2-29..35 · Chủ dự án duyệt và áp dụng P2-6 cùng các bản sửa (timeout giao dịch Prisma, test AppModule, e2e). Trên main: lint 0 lỗi, build PASS, unit 77 file/1460 test PASS; e2e 5 file/43 test PASS (viewings 10/10 sau khi nâng testTimeout 180 s; các file khác đạt ở lần chạy trước). DB dev chậm (~0,8 s/truy vấn) nên e2e mất ~4 phút. Còn bản ghi [E2E sót (4 lịch hẹn ngoài nhật ký, 34 tòa, 12 lịch hẹn) — dọn ở P2-10.
