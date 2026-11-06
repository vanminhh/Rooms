# P2-10 · Chốt Phase 2: danh sách QA, ghi chú môi trường thật, trạng thái Phase 3

Trạng thái: ĐÃ DUYỆT 06/11/2026
Task / spec: P2-QA-01, P2-QA-04, P2-QA-05
Gốc: 9d13364

## Làm gì, vì sao

- Thêm `docs/phase-2-rooms/p2-10-qa-checklist.md`: danh sách kiểm tay bằng tiếng Việt (cửa thoát 1 và 2 của Phase 2, cộng quản lý tòa/nhân sự/phòng/ảnh, ở 360 px và bằng bàn phím) và 10 ghi chú mang sang môi trường thật.
- `CLAUDE.md` mục "Status" và `docs/spec/README.md` mục "Status": ghi Phase 2 xong, giai đoạn hiện tại là **3 · Contracts**.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa |
|---|---|---|
| `docs/phase-2-rooms/p2-10-qa-checklist.md` | cùng đường dẫn | Thêm |
| `CLAUDE.md` | `CLAUDE.md` | Sửa (1 đoạn Status) |
| `docs/spec/README.md` | `docs/spec/README.md` | Sửa (câu Status + 1 câu trỏ tới `docs/phase-2-rooms/`) |

## Cách xem và kiểm tra

`git diff --no-index --ignore-cr-at-eol CLAUDE.md Artifacts/2026-11-06-P2-QA/CLAUDE.md` và tương tự với `docs/spec/README.md`. Con số trong câu Status (DB 54/54, 1502 unit, 43 e2e, 645 frontend) lấy từ lần chạy mới nhất; sẽ chỉnh nếu kiểm tự động P2-QA-02 báo khác.

## Đã kiểm tra

Chưa có reviewer riêng (tài liệu). Kiểm tự động P2-QA-02/03 do subagent chạy riêng, kết quả ghi vào "Issues log" của `feature_p2-10-qa.md`.

## Giả định hoặc câu hỏi cho chủ dự án

- **Chỉ áp dụng bản nháp sau khi chủ dự án chạy xong danh sách kiểm tay và đánh "đạt"**, vì Status sẽ ghi Phase 2 xong.
- Ghi chú 1–10 là tổng hợp từ các `shortcut:` và `[ASSUMPTION]` của Phase 2; chủ dự án bổ sung nếu thiếu.

Đã chép vào file chính 06/11/2026 bằng apply-draft.mjs: 3 file.
