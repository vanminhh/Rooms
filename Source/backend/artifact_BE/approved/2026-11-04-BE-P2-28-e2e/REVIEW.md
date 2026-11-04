# P2-5 · E2E giá (BE-P2-28)

Trạng thái: ĐÃ DUYỆT 04/11/2026
Task / spec: BE-P2-28 · PRC-01..03, PRC-06, PRC-09, API-05, API-07, SCOPE-02, G-06
Gốc: e91e3cd

## Làm gì, vì sao

Thêm file e2e `test/pricing.e2e-spec.ts` (10 `it`, chạy trên Prisma/DB dev thật qua bộ chạy e2e BE-P2-09) để đóng Done-when của BE-P2-28: manager đề xuất giá → `rooms.price` chưa đổi → Boss duyệt → giá đổi; giá tương lai chỉ đổi khi job chạy với `roomIds` của test. Không đổi code nghiệp vụ.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích từ `Source/backend/` | Thêm / Sửa / Xóa |
|---|---|---|
| `test/pricing.e2e-spec.ts` (+427 dòng) | cùng đường dẫn | Thêm |

`PLAN.md`, `REVIEW.md`, `ref/` không áp dụng.

## Kịch bản

fixtures · PRC-01/02 đề xuất, giá chưa đổi · PRC-03/G-06 Boss duyệt hôm nay · PRC-06 giá tương lai chỉ do job ghi, chạy lần hai không đổi · API-05 replay `Idempotency-Key`, khác payload → 409 · PRC-09 duyệt hai lần → 409 · API-07 manager không duyệt/từ chối · Q-P5-7/SCOPE-02 manager bị chặn với phòng khóa · giá 0 hoặc ngày quá khứ → `VALIDATION_FAILED` · nhật ký chạy không chứa bí mật.

## Đã kiểm tra

- Tester: CP-1 và CP-2 PASS ở mức tĩnh; `oxlint --type-aware` trên `test/` 0 lỗi; `npm run test` main 1272/1272.
- Reviewer: **DUYỆT**, không lỗi chặn; đối chiếu từng kịch bản với code pricing và spec 12. Reviewer không chạy được test, chỉ đọc mã.
- **Chưa chạy trên DB thật** (agent bị cấm ghi DB dev): e2e sẽ chạy sau khi áp dụng bằng `npm run test:e2e`, rồi `node scripts/e2e/cleanup.mjs` (chỉ liệt kê).
- `main-files.mjs check`: không file chính nào đổi.

## Giả định hoặc câu hỏi cho chủ dự án

- A1: "giá công khai" = cột `rooms.price` (chưa kiểm qua `GET /public/rooms/:id`, vì API công khai thuộc P2-6).
- A2: không du hành thời gian; "đến ngày hiệu lực" mô phỏng bằng `prisma.roomPrice.update({effectiveFrom: hôm nay})`.
- A3: nhánh "tòa khóa" dùng phòng khóa (`isActive:false`), cùng mã `OUT_OF_SCOPE`.
- A4: mốc ngày tính một lần lúc bắt đầu chạy; có thể flaky nếu chạy qua 00:00 giờ Hà Nội.
- A5: `job.sync([phòng chưa có giá APPROVED])` → `withoutApprovedPrice: 1`, `updated: 0`.
- Test ghi dữ liệu `[E2E <runId>]` lên DB dev rồi tự dọn; nhật ký ở `test/e2e-runs/`.

Đã chép vào file chính 04/11/2026 bằng apply-draft.mjs: 1 file.
