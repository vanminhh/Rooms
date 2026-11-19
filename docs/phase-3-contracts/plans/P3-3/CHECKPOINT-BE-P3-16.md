# P3-3 — BE-P3-16 — Ghi nhận thu tiền cọc

Ngày 19/11/2026. Bắt đầu từ `0d50e23` (BE-P3-13..15), workspace sạch. Chủ dự án chỉ giao BE-P3-16; chưa triển khai BE-P3-17..19. Chưa commit thay đổi ở mốc này.

## Hành vi

`POST /api/v1/invoices/:id/payment` nhận `{ method, paidAt?, note? }`. Chỉ Boss hoặc quản lý hiện tại trong phạm vi tòa được ghi thu. Bốn phương thức theo D-11: `CASH`, `BANK_TRANSFER`, `CARD`, `OTHER`. Số tiền lấy từ tổng hóa đơn, nguồn cố định `MANUAL`, người ghi lấy từ phiên đăng nhập; client không được gửi amount, source, recordedById hoặc bankTransactionId.

Chỉ nhận hóa đơn `DEPOSIT` đang `UNPAID`. MONTHLY/FINAL trả 409 `CONFLICT_STATE` theo D-35; các trạng thái khác trả 409 `INVOICE_NOT_UNPAID`. Không áp thêm điều kiện HOLD/ACTIVE, email hay account tenant ngoài BIL-11. `paidAt` nhận timestamp ISO có múi giờ, mặc định thời điểm ghi thu; không thêm hạn chế ngày quá khứ/tương lai. Note giữ văn bản người dùng, từ chối NUL trước PostgreSQL.

Trong một transaction: lấy mapping shared lock, kiểm scope hợp đồng và assignment đang có hiệu lực trước cả cached replay; dùng helper idempotency hiện hữu; nếu thực hiện mới thì khóa invoice, đọc lại type/status/total, INSERT payment rồi ghi audit `payment.record`. Trigger DB hiện hữu kiểm đúng số tiền và tự đổi PAID. Service không set PAID trước INSERT. Lỗi audit hoặc lưu key rollback cả payment và thay đổi do trigger.

`Idempotency-Key` là tùy chọn, giữ parser 1..255 ký tự và TTL 24 giờ của hệ thống. Khóa theo actor + route template + key. Hash gồm invoiceId, method, paidAt chuẩn hóa hoặc null, note hoặc null. Khi thiếu paidAt, hash giữ null ổn định thay vì timestamp mới. Cùng key/body trả biên nhận đầu kể cả sau khi invoice đã PAID; khác body hoặc invoiceId trả conflict. Yêu cầu mới không cùng key trên invoice PAID bị từ chối. Người mất scope không replay được biên nhận đã lưu.

Response 201 qua envelope `{data}`:

```json
{
  "data": {
    "id": 300,
    "invoiceId": 70,
    "amount": 2500000,
    "method": "CASH",
    "source": "MANUAL",
    "paidAt": "2026-11-19T03:15:30.000Z",
    "note": null,
    "recordedById": 2
  }
}
```

Các số ID/thời điểm trên chỉ là ví dụ cấu trúc. Chỉ lưu và trả projection biên nhận cho phép, không lấy password, CCCD hoặc thông tin scan. Thông báo tenant đợi inbox Phase 5 theo BIL-11.

## Tệp thay đổi

| Tệp dưới `Source/backend/` | Mục đích |
|---|---|
| `src/modules/billing/billing.service.ts` | Transaction ghi thu, scope trước replay, khóa invoice, idempotency, projection và audit. |
| `src/modules/billing/invoices.controller.ts` | Route staff, DTO, parse header và gọi service. |
| `src/modules/billing/dto/record-payment.dto.ts` | Kiểm ID Int4 dương, phương thức, timestamp và note. |
| `src/modules/billing/billing.module.ts`, `src/app.module.ts` | Đăng ký BillingModule tối thiểu và AuditModule. |
| `src/common/errors/db-errors.ts`, `db-errors.spec.ts` | Map hai trigger `INVOICE_NOT_UNPAID`, `PAYMENT_AMOUNT_MISMATCH`; cập nhật exact-key test. |
| `src/common/prisma/prisma.service.spec.ts` | Cập nhật danh sách module thực. |
| `src/modules/billing/billing.payment.http.spec.ts` | 36 ca HTTP qua AppModule, guards, DTO, service và exception filter thực; chỉ giả lập Prisma edge. |

Cập nhật thêm task, PROGRESS và bản ghi commit checkpoint trước. Không đổi schema, migration, dependency hoặc `.env`; không chạy seed, gửi mail, xóa dữ liệu hoặc ghi DB dev.

## Kết quả kiểm tra

| Phép kiểm | Kết quả thực tế |
|---|---|
| `npm run build` | Exit 0. |
| `npm run lint` | Exit 0, `Found 4 warnings and 0 errors.`, 231 file. Bốn cảnh báo sort cũ trong dashboard/pricing. |
| Test tập trung | Exit 0: `Test Files 3 passed (3)`, `Tests 62 passed (62)`, thời lượng 8,77 giây. Gồm 36 ca payment HTTP, 19 ca DB error map và 7 ca Prisma/module. Dùng HTTP trong bộ nhớ và chặn egress mạng ngoài trong Node. |
| Smoke PostgreSQL nhúng | Exit 0 trên mã build cuối. Nest HTTP và Prisma thật với schema/constraints hiện có: tạo/ký hợp đồng, thu cọc, replay, từ chối ghi thu độc lập lần hai hoặc dùng key cho invoice khác; kiểm hai lỗi trigger thực; hai lời gọi cùng key chỉ có một payment; lỗi audit rollback payment, trạng thái invoice và key; retry thành công; đổi quản lý chặn replay ngoài scope. |
| Bộ backend đầy đủ | Không có kết quả hoàn tất cho bản BE-P3-16. Automatic approval review chặn lệnh do telemetry Visual Studio gửi payload chưa xác định ra ngoài. Dừng tại chặn, không thử vượt chặn. Kết quả 1961/1961 trước đây thuộc commit BE-P3-13..15. |
| E2E DB dev | Chưa chạy ở mốc BE-P3-16; nghiệm thu create → sign → pay trên DB dev thuộc BE-P3-19. E2E và cleanup list còn chờ của P3-2 giữ nguyên. |
| Review độc lập | DUYỆT; báo cáo đầy đủ bên dưới. |
| `git diff --check` | Đạt trên thay đổi hiện tại. |

Output smoke phần payment:

```text
BIL-11/API-05: real trigger marks PAID; replay returns the receipt once; duplicate and key misuse are refused
BIL-11: both PostgreSQL trigger errors map correctly; parallel same-key calls store one payment
BIL-11/AUD-01/SCOPE-02: audit failure rolls back payment, trigger and key; revoked scope cannot replay
```

Thông báo lỗi `fixture payment audit failure` xuất hiện ở ca cố tình gây lỗi để kiểm rollback; không phải test thất bại. Không có password hoặc dữ liệu thật trong output smoke.

Fake HTTP xếp hàng toàn bộ transaction; smoke PGlite dùng một session PostgreSQL. Các kết quả này không chứng minh tranh chấp khóa giữa nhiều connection và không thay thế E2E DB dev. Không đánh dấu BE-P3-19 hoàn tất.

## Kiểm tra và commit trên máy dự án

Chạy bộ backend chuẩn:

```powershell
cd D:\Rooms\Source\backend
npm run test
```

Kiểm API trên hóa đơn cọc thử UNPAID đã có sẵn, dùng tài khoản staff đúng tòa:

1. Gửi `POST /api/v1/invoices/{id}/payment` với body `{"method":"CASH"}` và header `Idempotency-Key: BE16-TEST-1`. Nhận 201 với số tiền bằng tổng hóa đơn, source MANUAL, recordedById của người đăng nhập.
2. Gửi lại y hệt: cùng biên nhận, không thêm payment hoặc audit. Dùng key khác hoặc không key: 409 `INVOICE_NOT_UNPAID`.
3. Cùng key mà đổi method hoặc invoice: 409 `CONFLICT_STATE`. Quản lý khác tòa: 403 `OUT_OF_SCOPE`.
4. Đọc lại chi tiết hợp đồng: invoice cọc PAID, VietQR và qrImageUrl đều null.

Phần FE ghi thu chưa thuộc mốc này. Không thử trên hóa đơn thực chưa nhận tiền; giữ lịch sử tài chính của fixture, không xóa payment để thử lại. Không cần chạy migration hoặc sinh lại Prisma Client.

Commit gợi ý sau kiểm chứng:

```text
feat(billing): record manual deposit payments (BE-P3-16, BIL-11, API-05)
```

BE-P3-16 không dùng giả định nghiệp vụ mới. A-02 và A-22 giữ nguyên ở bước ký/cọc trước. Dừng đúng BE-P3-16 theo yêu cầu chủ dự án.

## Báo cáo reviewer đầy đủ

KẾT LUẬN: DUYỆT  
Phạm vi: BE-P3-16 chưa commit so với `0d50e23` — 9 file — +500/-4 dòng. Không xét BE-P3-17..19.

### Lỗi chặn

Không phát hiện lỗi chặn.

### Nên sửa

Không có đề nghị sửa bắt buộc trong phạm vi này. Kiểm thử concurrency PostgreSQL nhiều connection vẫn là khoảng trống xác minh, đã được ghi rõ tại `Source/backend/src/modules/billing/billing.payment.http.spec.ts:82`.

### Ghi chú

- `billing.service.ts:33` lọc invoice qua scope hợp đồng; dòng 44 kiểm tra assignment và trạng thái hoạt động hiện tại **trước replay** tại dòng 45. Mapping lock tại dòng 32 bảo vệ trước các thao tác đổi assignment.
- `billing.service.ts:48` khóa invoice rồi đọc lại type/status/total. Dòng 50 giới hạn DEPOSIT; dòng 51 chặn trạng thái khác UNPAID.
- `billing.service.ts:54` lấy tiền từ invoice, cố định nguồn MANUAL; dòng 55 cố định người ghi từ actor và bỏ liên kết giao dịch ngân hàng. Không nhận số tiền/nguồn/người ghi từ client.
- `billing.service.ts:53` chỉ INSERT payment, không cập nhật PAID trước trigger. Trigger thật tại `prisma/constraints.sql:122` khóa và kiểm tra invoice, sau đó đổi trạng thái tại dòng 129.
- `billing.service.ts:29` chuẩn hóa timestamp về ISO UTC, đưa invoiceId vào hash, giữ `paidAt` bị bỏ trống thành null ổn định. `pricing-idempotency.ts:46` khóa theo actor/route/key; dòng 49–64 xử lý replay, payload khác, thời hạn 24 giờ và thay key hết hạn.
- Payment, trigger đổi PAID, audit và idempotency receipt cùng transaction tại `billing.service.ts:30`; audit dùng transaction client tại dòng 58.
- DTO tại `dto/record-payment.dto.ts:14`, dòng 18–21 và dòng 25–26 kiểm tra method, timestamp có múi giờ và note. `app.setup.ts:21` bật whitelist và từ chối field ngoài DTO.
- `common/errors/db-errors.ts:20` bổ sung đúng hai mã lỗi trigger BIL-11; HTTP assertions tại `billing.payment.http.spec.ts:320` kiểm tra mã 409 và không lộ thông báo SQL.
- Các ca replay sau PAID, normalized offset, payload/ID/actor khác, key hết hạn, mất scope trước replay và rollback audit đều có assertions cụ thể trong test.
- Queue fake và smoke PGlite một session không chứng minh PostgreSQL concurrency nhiều connection; smoke đó cũng không phải dev E2E.
- Review này chỉ đọc; không tự chạy test, truy cập DB, secrets hoặc sửa file.

### Đã kiểm

Đọc toàn bộ Billing module/controller/service/DTO/test; diff AppModule, module fixture, DB error map/tests; các helper scope, mapping lock, idempotency, audit, validation và exception filter liên quan.

Đối chiếu BIL-11, D-35, API-03..07, SCOPE-02 và trigger payment hiện hữu.
