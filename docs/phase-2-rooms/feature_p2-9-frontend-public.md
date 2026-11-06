# Phase 2 · Part 9 – Frontend public pages (FE-P2-14..18)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified on the main files. Do tasks in order. Every task is drafted in `Source/frontend/artifact_FE/` and approved by the owner before it touches main files (root `CLAUDE.md`). All parts and their order: [README.md](README.md).

| | |
|---|---|
| Needs first | Backend part 6, mockup part 7 approved, frontend part 8a on the main files |
| Unblocks | Part 10 |
| Draft folder | `Source/frontend/artifact_FE/<YYYY-MM-DD>-FE-P2-14-18/` |
| How | Pipeline (may run in parallel with part 8b) |
| Part done when | FE-P2-18 on the main files; a guest books a viewing in the browser against the real API |

Do not edit `routes.tsx`, `package.json` or `src/components/` (skeleton of part 8a). Tests go in `tests/p2/`.

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/frontend/CLAUDE.md`
2. `docs/spec/11-buildings-rooms.md` – ROOM-08, PUB-01..04; `docs/spec/13-viewings.md` – VIEW-01, 02, 08, 12
3. `docs/spec/30-frontend.md` – public pages, UI-01..10; `docs/spec/31-ui-kit.md`
4. The approved mockup of part 7

## Tasks

- [~] **14** `/` home: featured rooms, districts with counts; `PublicLayout` menu "Tìm phòng".
  Done when: tests for the 4 list states (UI-03).
- [~] **15** `/phong` search: district, ward, building, price range and sort kept in the URL query.
  Done when: tests URL ↔ filters both ways.
- [~] **16** `/toa/:id` and `/phong/:id`: photos with `alt` or "Chưa có ảnh", price, furniture, deposit, estimate and "chưa gồm" lines from the API (UI-06), current and upcoming rates, contact; 404 page for non-public.
  Done when: tests; 360 px without horizontal scroll.
- [~] **17** Viewing form (VIEW-01, VIEW-08): 3 slots, date today..+30, slots already started today disabled, hidden honeypot, zod like the BE, 429 / `ROOM_NOT_AVAILABLE` message from the API, same success screen always.
  Done when: tests for the form rules.
- [~] **18** `npm run lint`, `npm run build`, `npm run test:components` pass; manual booking after applying.
  Done when: all pass.

## Questions for the owner

None yet.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
- 06/11/2026 · FE-P2-14..17 · Chủ dự án duyệt trước và áp dụng P2-9 (trang công khai, form đặt lịch). Trên main: lint PASS, build PASS, test:components 497 test (1 test harness lỗi thời đã sửa; các file riêng lẻ đạt; khi chạy toàn bộ song song 3-4 test timeout ngẫu nhiên do tải CPU, chạy riêng đều đạt). FE-P2-18 còn [~]: chưa kiểm tay 360 px và đặt lịch hẹn thật với backend (làm ở P2-10).
