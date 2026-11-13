# Phase Extra · Part 5 – Room attributes and filters (BE-EX-12..16, FE-EX-18..21)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Fixes | Phase 2 (rooms, buildings, public listing) |
| Needs first | – (clean `git status`). Not at the same time as another part with a migration (EX-1, EX-6, EX-8) or one that edits the public pages (EX-3, EX-7) |
| Unblocks | EX-9 |
| How | planner writes `plans/EX-5/PLAN.md` (backend + frontend) → main session builds → reviewer before the last stop (schema) |
| Part done when | FE-EX-21 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md`, `Source/frontend/CLAUDE.md`
2. `docs/spec/00-overview.md` – D-32, Q-09..Q-11 (answered)
3. `docs/spec/11-buildings-rooms.md` – BLD-02, BLD-08, ROOM-01, ROOM-05, ROOM-10, PUB-01..06, the API table
4. `docs/spec/02-database.md` – DB-07, "Planned changes" (rows EX-5); `docs/spec/01-architecture.md` – LOC-04
5. `docs/spec/30-frontend.md` – rows `/phong`, `/phong/:id`, `/ql/phong`, `/ql/toa-nha/:id`; UI-03
6. Code BE: `src/modules/rooms/` (`rooms.service.ts`, `dto/`, `public-rooms.service.ts`, `public.types.ts`), `src/modules/buildings/` (`buildings.service.ts`, `dto/`, `public-buildings.service.ts`), `src/common/rooms/`
7. Code FE: `src/features/public/` (`RoomFilters.tsx`, `room-filters.ts`, `RoomCard.tsx`, `ListState.tsx`), `src/pages/public/PublicRoomsPage.tsx`, `RoomDetailView.tsx`, `src/features/rooms/RoomForm.tsx`, `src/features/buildings/`

## Scope

In: four new room fields, the fixed amenity list, their staff forms, the public filters and `GET /public/filters`.
Out: a furniture filter (D-32 says no), guessing values from descriptions, filling old rooms automatically, English labels beyond the two lists (EX-3 owns the dictionary; add the labels of these lists to it, or leave a note in the report if EX-3 is not done yet).

## Tasks

- [x] **BE-EX-12** ⏸ Migration `room_attributes` (ask the owner before creating and before applying): `rooms.room_type` (enum `STUDIO`, `LOFT`, `ONE_BEDROOM`, `TWO_BEDROOM`, null), `has_balcony`, `has_window`, `pets_allowed` (boolean, null = "chưa nhập"). `buildings.amenities` needs no new column if the plan keeps one JSON array where a known code is an amenity and anything else is old free text (BLD-08); the plan states which way and why.
  Done when: `prisma migrate diff` shows only these changes; DB check passes all scenarios; existing rooms have null in the four fields.
- [x] **BE-EX-13** The two fixed lists in one place (`src/common/catalog/`): amenity codes and room types with their Vietnamese and English labels exactly as in BLD-08 and ROOM-10. `GET /public/filters` returns both lists (PUB-06), cached like other public GETs (PUB-05).
  Done when: a test compares the lists with the spec text; the response has no building or room data.
- [x] **BE-EX-14** Staff forms: room create/edit accepts the four fields, each optional, null kept apart from false (ROOM-10). Building edit accepts amenity codes from the list; old free text is returned to staff apart from the codes and is never converted (BLD-08). A manager may still edit only `amenities` and `description` of their buildings (BLD-02).
  Done when: tests `ROOM-10: …` (null stays null, unknown type refused) and `BLD-08: …` (unknown code refused, old text kept after saving codes).
- [x] **BE-EX-15** ⏸ `/public/rooms` filters `minArea`, `maxArea`, `minOccupants`, `floor`, `amenities`, `balcony`, `window`, `pets`, `roomType` (PUB-06): AND together, applied in the query before paging, on top of ROOM-05; a null field never matches its filter; an unknown code → `VALIDATION_FAILED`. Room list and detail responses include the new fields and the building's amenity codes (PUB-04 still holds).
  Done when: the three new acceptance lines of spec 11; `meta.total` equals the filtered count on page 2; a non-public room never appears with any filter. `npm run lint`, `test`, `build`, `test:e2e` pass. Stop and report BE-EX-12..15.
- [x] **BE-EX-16** Dev seed: give the sample rooms and buildings values for the new fields so the filters can be tried by hand. Do not touch production data.
  Done when: `seed.spec.ts` passes; the seed is still safe to run twice.
- [x] **FE-EX-18** Staff: `RoomForm` gets "Loại phòng" and three choices "Có / Không / Chưa nhập" for "Ban công", "Cửa sổ", "Cho nuôi thú cưng"; the building page gets the amenity checklist and, when present, the block "Tiện ích cũ (chưa chọn lại)".
  Done when: form tests; saving without touching the new fields keeps "chưa nhập".
- [x] **FE-EX-19** `/phong`: the new filters in `RoomFilters` with options from `/public/filters`, every filter in the URL query (`room-filters.ts`), "Xóa bộ lọc", empty state "Không có phòng phù hợp" with the clear button (UI-03). Usable at 360 px.
  Done when: tests: URL → filters → API query round trip, clear, empty state; `tests/p2/fe-p2-15-search.test.mjs` and `ui-22-building-filter.test.mjs` still green.
- [x] **FE-EX-20** Show the attributes: room type, balcony, window, pets on `/phong/:id` (facts strip) and the building's amenities on `/toa/:id`; a "chưa nhập" value is not shown at all.
  Done when: page tests for a room with all values and one with none.
- [x] **FE-EX-21** ⏸ `npm run lint`, `npm run build`, `npm run test:components`. Run the reviewer on the uncommitted changes and put its full report in the checkpoint report.
  Done when: all pass with real output quoted; manual walk on the seed: combine three filters, share the URL, clear.

## Questions for the owner

<!-- Q-09, Q-10, Q-11 were answered on 12/11/2026 (see README.md section 2) -->

Đã trả lời 13/11/2026 (chủ dự án chọn theo đề xuất của planner, `plans/EX-5/PLAN.md` mục 6):

- OQ-1 tiện ích cũ: nút "Xóa tiện ích cũ" gửi `legacyAmenities: []`; lưu mã mới không làm mất chữ cũ.
- OQ-2 ban công / cửa sổ / thú cưng: bộ lọc chỉ có trạng thái "có"; phòng "chưa nhập" không khớp.
- OQ-4 seed dev: ghi đè thuộc tính của phòng và tòa mẫu của seed.
- Tạo file migration `room_attributes`: đồng ý. Áp vào DB dev: xin riêng.
- OQ-3 nhãn tiếng Anh và OQ-5 thẻ phòng: chưa hỏi, dùng đề xuất của planner `[ASSUMPTION]` (bảng nhãn mục 2.4; thẻ phòng giữ nguyên, chữ tiện ích cũ chỉ nhân sự thấy).

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
