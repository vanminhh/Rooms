# P2-1 · Spec và file task Phase 2

Trạng thái: ĐÃ DUYỆT 01/11/2026
Task / spec: P2-SPEC-01..03 · kế hoạch `Artifacts/approved/2026-11-01-phase-2-plan/PLAN.md` (bản 4)
Gốc: 3429b8b

## Làm gì, vì sao

Ghi 18 quyết định của chủ dự án (D2-1..D2-18) và 21 quy tắc đã duyệt cùng kế hoạch (R2-1..R2-21) vào spec, mỗi điều một mã luật, để agent Phase 2 chỉ đọc spec. Tạo `docs/phase-2-rooms/` với một file task cho mỗi phần P2-0..P2-10. Sửa luôn 3 việc còn sót của Phase 1: câu chữ AUTH-T3 ("các phiên **khác**"), `OUT_OF_SCOPE` không áp cho người thuê (dùng 404), lệnh kiểm DB trong `feature_p1-1`.

Mã task Phase 2 là `BE-P2-xx` / `FE-P2-xx` (không dùng `BE-ROOM-xx` như kế hoạch, vì dễ lẫn với mã luật spec `ROOM-xx`).

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `docs/spec/00-overview.md` | cùng đường dẫn | Sửa A-03, A-05 |
| `docs/spec/01-architecture.md` | cùng đường dẫn | Sửa: 2 mã lỗi mới, mục Files (FILE-01, 02), AUTH-T3, `OUT_OF_SCOPE`, cron 01:00 + khi khởi động |
| `docs/spec/10-auth.md` | cùng đường dẫn | Sửa AUTH-08, bảng API, thêm 2 acceptance |
| `docs/spec/11-buildings-rooms.md` | cùng đường dẫn | Sửa BLD-04, 05; thêm BLD-06, 07, ROOM-06..09, PUB-01..04, SVC-04, 05; API; acceptance |
| `docs/spec/12-pricing.md` | cùng đường dẫn | Sửa PRC-03, 04, RATE-01, 05; thêm PRC-06..12, RATE-06; acceptance |
| `docs/spec/13-viewings.md` | cùng đường dẫn | Sửa VIEW-01..04, 07; thêm VIEW-08..13; acceptance |
| `docs/spec/19-notifications.md` | cùng đường dẫn | Sửa NOTI-06 (phạm vi Phase 2) |
| `docs/spec/30-frontend.md` | cùng đường dẫn | Sửa 7 dòng trang |
| `docs/phase-1-foundation/feature_p1-1-backend-foundation.md` | cùng đường dẫn | Sửa lệnh kiểm DB |
| `docs/phase-2-rooms/README.md` + 12 file `feature_p2-*.md` | cùng đường dẫn | Thêm |

## Bảng đối chiếu kế hoạch → mã luật

| Kế hoạch | Spec |
|---|---|
| D2-1 cài `@nestjs/schedule` | P2-SETUP-01 (đã xong), cron ở 01 |
| D2-2 ước tính / D2-13 tiền cọc | A-05, ROOM-08 |
| D2-3 3 ca | VIEW-08 |
| D2-4 quá hạn / D2-11 mã lỗi | PRC-07, RATE-05, bảng mã lỗi 01 |
| D2-5 Nhân sự | AUTH-08, trang `/ql/nhan-su` |
| D2-6 hai thẻ | NOTI-06 (Phase 2), VIEW-07, PRC-11 |
| D2-7 mockup | `feature_p2-7-mockup.md` |
| D2-8 cách đếm giới hạn | A-03, VIEW-11 |
| D2-9 khóa quản lý / D2-18 thiếu số liên hệ | AUTH-08, BLD-04 |
| D2-10 "Chưa có ảnh" | trang `/phong/:id` |
| D2-12 "Gửi xe điện" | SVC-05 |
| D2-14 e2e trên DB dev | BE-P2-09 |
| D2-15 thay giá đã duyệt chưa tới ngày | PRC-08, RATE-01 |
| D2-16 khóa tòa bỏ gán / R2-8 | BLD-06 |
| D2-17 lịch hẹn còn treo | VIEW-13, ROOM-09 |
| R2-1 phòng công khai cần đơn giá điện, nước | ROOM-05, BLD-05 |
| R2-2 đơn giá hiện hành | RATE-06, PUB-03 |
| R2-3 giá hiện hành, job | PRC-06, cron 01 |
| R2-4, R2-5 ca đã qua, 30 ngày | VIEW-08 |
| R2-6 nhãn | PRC-10, VIEW-10 |
| R2-7 ảnh | ROOM-07, FILE-01, FILE-02 |
| R2-9, R2-10 nổi bật, sắp xếp | PUB-01 |
| R2-11 thẻ của Boss | VIEW-07 |
| R2-12 Boss đề xuất | PRC-04 |
| R2-13 đổi ngày/ca | VIEW-09 |
| R2-14 dịch vụ chưa có giá / đã khóa | ROOM-08, SVC-04 |
| R2-15 đếm theo số | VIEW-11 |
| R2-16 thẻ không đếm quá hạn | PRC-11 |
| R2-17 % thay đổi | PRC-12 |
| R2-18 phòng/tòa đã khóa | ROOM-06, BLD-07 |
| R2-19 không tự đặt "Đã chốt" | VIEW-04 |
| R2-20 404, body chung | PUB-02, VIEW-12 |
| R2-21 lịch nhập tay | VIEW-03 |
| Duyệt hai lần cùng lúc (bản 3) | PRC-09 |

## Cách xem và kiểm tra

Xem diff từng file:

```bash
git diff --no-index docs/spec Artifacts/2026-11-01-P2-1-spec/docs/spec
```

Lệnh trên hiện các file spec không có trong bản nháp (02, 14–18, 20, 31, README) như "bị xóa" – bỏ qua, `apply-draft.mjs` chỉ chép file có trong bản nháp. File mới: `Artifacts/2026-11-01-P2-1-spec/docs/phase-2-rooms/`.

## Đã kiểm tra

01/11/2026:
- Mọi link tương đối trong bản nháp trỏ tới file có thật (0 link hỏng).
- Mọi mã luật được nhắc trong bản nháp đều có định nghĩa trong spec (bản nháp hoặc bản chính); mã task `BE-P2-xx` / `FE-P2-xx` không trùng.
- Mỗi mục D2/R2 của kế hoạch có mã luật (bảng trên).

## Giả định hoặc câu hỏi cho chủ dự án

- **RATE-05** cũ ghi 400 khi duyệt đề xuất quá hạn; quyết định D2-11 là 409 `PRICE_PROPOSAL_EXPIRED`. Spec mới theo quyết định, có ghi chú thay đổi.
- A-03 (5 lần/giờ/IP, 3 lần/ngày/số) vẫn là `[ASSUMPTION]`: anh/chị mới chốt cách đếm, chưa chốt con số.
- Không có câu hỏi mở.

Đã chép vào file chính 01/11/2026 bằng apply-draft.mjs: 22 file (thư mục chuyển tay vào approved/ do lỗi EPERM khi đổi tên).

Đã dọn 01/11/2026: xóa bản sao docs/spec/{00,01,10,11,12,13,19,30}, docs/phase-1-foundation/feature_p1-1-backend-foundation.md, docs/phase-2-rooms/* – nội dung lúc duyệt ở file chính cùng đường dẫn. Mã commit: b020c48.
