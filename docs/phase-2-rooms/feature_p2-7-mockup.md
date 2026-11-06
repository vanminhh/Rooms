# Phase 2 · Part 7 – Mockup before coding (P2-MOCK-01..02)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
All parts and their order: [README.md](README.md).

| | |
|---|---|
| Needs first | Part 1 on the main files (runs in parallel with the backend parts) |
| Unblocks | Frontend parts 8a and 9 |
| Draft folder | `Source/frontend/artifact_FE/<YYYY-MM-DD>-phase2-mockup/` |
| How | By hand, no pipeline (owner D2-7, 01/11/2026) |
| Part done when | The owner approves the mockup in chat; it is never copied to the main files |

## Before you start

`docs/spec/30-frontend.md`, `docs/spec/31-ui-kit.md`, `src/components/README.md`, `docs/spec/11-buildings-rooms.md` (ROOM-08, PUB-01..03), `docs/spec/12-pricing.md` (PRC-07, PRC-12), `docs/spec/13-viewings.md` (VIEW-08).

## Tasks

- [!] **P2-MOCK-01** `preview.html` + sample `.tsx` built only from the kit, data like the seed: public `/`, `/phong`, `/toa/:id`, `/phong/:id` (3-slot form, estimate per ROOM-08, deposit, "Chưa có ảnh"), and staff `/ql/phong` (floor grid, "Hiện phòng đã khóa", "Quá hạn") and `/ql/duyet-gia` (old → new, %, electric tiers, expired apart). Screenshots at 360 px and desktop in `ref/`. List every place that differs from the spec.
  Đã dựng sáu màn, TypeScript/lint qua; chưa thể hoàn tất kiểm trình duyệt và ảnh 360 px/desktop vì Computer Use bị dừng bởi giới hạn URL policy trên trình duyệt Windows.
  Done when: opens; no horizontal scroll at 360 px; keyboard reaches every control.
- [x] **P2-MOCK-02** Owner review.
  Chủ dự án đã duyệt bố cục sáu màn trong chat ngày 03/11/2026; mockup không chép vào file chính.
  Done when: approved in chat; the answers are written into the files of parts 8a and 9 if they change a task.

## Questions for the owner

None yet.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->

- 02/11/2026 · P2-MOCK-01 · Draft tại Source/frontend/artifact_FE/2026-11-02-phase2-mockup; TypeScript/lint PASS, bộ test hiện có 234/234. IAB loopback timeout; CUA dừng do browser URL policy enforcement chưa hỗ trợ trên trình duyệt Windows. Không có screenshot hoặc xác nhận không tràn ngang/bàn phím. Chưa đủ Done when; chi tiết ref/QA.md. Server Vite đã dừng. Cần kiểm trình duyệt và chủ dự án xem mockup.
- 03/11/2026 · P2-MOCK-02 · Chủ dự án đã duyệt bố cục mockup trong chat. Vite trên cổng 5174 trả preview HTTP 200; kiểm 360 px, bàn phím và screenshot của P2-MOCK-01 vẫn thiếu bằng chứng do giới hạn công cụ, nên P2-MOCK-01 giữ [!].
