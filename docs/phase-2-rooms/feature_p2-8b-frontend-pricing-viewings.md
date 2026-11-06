# Phase 2 · Part 8b – Frontend rates, price approval, viewings, "Việc hôm nay" (FE-P2-09..13)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified on the main files. Do tasks in order. Every task is drafted in `Source/frontend/artifact_FE/` and approved by the owner before it touches main files (root `CLAUDE.md`). All parts and their order: [README.md](README.md).

| | |
|---|---|
| Needs first | Backend part 6 and frontend part 8a on the main files |
| Unblocks | Part 10 |
| Draft folder | `Source/frontend/artifact_FE/<YYYY-MM-DD>-FE-P2-09-13/` |
| How | Pipeline (may run in parallel with part 9) |
| Part done when | FE-P2-13 on the main files; "manager proposes → Boss approves → price changes" works in the browser |

Do not edit `routes.tsx`, `package.json` or `src/components/` (skeleton of part 8a). Tests go in `tests/p2/`.

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/frontend/CLAUDE.md`
2. `docs/spec/12-pricing.md` – PRC-01..12, RATE-01..06; `docs/spec/13-viewings.md` – VIEW-03, 04, 07..10, 13
3. `docs/spec/19-notifications.md` – NOTI-06 Phase 2 note; `docs/spec/30-frontend.md`, `docs/spec/31-ui-kit.md`
4. The approved mockup of part 7 ("Duyệt giá")

## Tasks

- [x] **09** "Đề xuất giá" on `/ql/phong`: dialog, "Quá hạn" and "Đề xuất lại" (PRC-07).
  Done when: tests; API errors on fields.
- [x] **10** `/ql/don-gia`: current rates per building (tier ladder), upcoming rates, history, propose, proposal status.
  Done when: tests for tier input matching RATE-02.
- [x] **11** `/ql/duyet-gia` (Boss): PRC-12 table, confirm dialog with the amount and the PRC-08 note (UI-04), reject with note, expired apart.
  Done when: tests; values and % come from the API (UI-06).
- [x] **12** `/ql/lich-hen`: by date, manual add (VIEW-03), call / Zalo buttons, status changes allowed by VIEW-04, change date/slot (VIEW-09); no "Chốt" yet. `/ql` shows the two cards (NOTI-06 Phase 2).
  Done when: tests for allowed status buttons per status and the two cards per role.
- [x] **13** `npm run lint`, `npm run build`, `npm run test:components` pass; manual flow after applying.
  Done when: all pass.

## Questions for the owner

None yet.

- Q-FE8B-1 (FE-P2-10, từ planner): "Đang áp dụng"/"Sắp áp dụng" khi API không có cờ hiệu lực?
  Chủ dự án chọn A ngày 05/11/2026: FE chia theo effectiveFrom so với hôm nay (chỉ so sánh ngày).
- Q-FE8B-2 (FE-P2-11): Mã phòng và tên tòa trên /ql/duyet-gia?
  Chủ dự án chọn C ngày 05/11/2026: thêm task backend để API giá trả roomCode/buildingName (draft backend riêng).
- Q-FE8B-3 (FE-P2-10/11, phiên chính quyết): Đơn vị đơn giá nước: đọc waterMode từ GET /buildings (không thêm API); không phải [ASSUMPTION] nghiệp vụ.
- Q-FE8B-4 (FE-P2-12): Nút Zalo ở /ql/lich-hen?
  Chủ dự án chọn A ngày 05/11/2026: "Gọi" dùng tel:, Zalo mở https://zalo.me/{số} tab mới.
- Q-FE8B-5 (FE-P2-12): Khoảng ngày mặc định /ql/lich-hen?
  Chủ dự án chọn A ngày 05/11/2026: hôm nay đến hôm nay+30 ngày.

- Q-FE8B-6 (FE-P2-11, PRC-08, từ coder CP-4): Hộp xác nhận duyệt nói giá nào bị thay thế?
  Chủ dự án chọn câu chung ngày 05/11/2026: luôn hiện "Duyệt có thể thay thế giá đã duyệt chưa có hiệu lực."; không sửa backend.
- Q-FE8B-7 (FE-P2-11): Tên dịch vụ ở tiêu đề thẻ duyệt bảng giá dịch vụ?
  Chủ dự án chọn backend thêm serviceName ngày 05/11/2026 (draft backend riêng).
- Q-FE8B-8 (phiên chính quyết, chữ UI): nhãn đơn giá nước "Đơn giá nước (đ/m³)" hoặc "(đ/người/kỳ)" theo waterMode; trạng thái rỗng "Chưa có đề xuất nào chờ duyệt"; từ chối thiếu ghi chú "Vui lòng nhập lý do từ chối"; chữ mockup "Duyệt giá mới?", "Từ chối đề xuất?", "Xác nhận duyệt", "Xác nhận từ chối", "Quay lại", "Đã qua ngày áp dụng. Cần quản lý đề xuất lại để duyệt.", "Giá mới" được chấp nhận; chủ dự án xem lại khi duyệt.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
- 06/11/2026 · FE-P2-09..12 · Chủ dự án duyệt trước và áp dụng P2-8b (đơn giá, duyệt giá, lịch hẹn, Việc hôm nay). Trên main: lint PASS, build PASS, test:components 645/645 (tuần tự và song song). FE-P2-13 còn [~]: chưa kiểm tay luồng 'quản lý đề xuất → Boss duyệt → giá đổi' trên trình duyệt với backend thật (làm ở P2-10).
- 06/11/2026 · FE-P2-13 · Chủ dự án chạy checklist tay (nhóm B: đề xuất, duyệt, từ chối, giá có hiệu lực ngày mai, biểu giá điện, Boss tự đề xuất) và cho đạt hết; đã sửa B1 (hiện giá đề xuất) trước khi đạt. FE-P2-09..13 đánh [x]. Mục 12 ghi "no Chốt yet": nay có nút "Chốt" bị mờ theo yêu cầu của chủ dự án (VIEW-05, bật ở Phase 3).
