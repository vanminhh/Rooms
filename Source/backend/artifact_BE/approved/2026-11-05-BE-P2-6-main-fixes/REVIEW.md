# P2-6 · Sửa hai lỗi sau khi áp dụng (timeout giao dịch, test AppModule)

Trạng thái: ĐÃ DUYỆT 05/11/2026
Task / spec: BE-P2-35 · BE-P2-22..34 · API-04
Gốc: 8bec6ab (P2-6 đã chép vào main, chưa commit)

## Làm gì, vì sao

Sau khi áp dụng P2-6, subagent kiểm tra báo trên main:
1. **`npm run test`: 1 test fail** (`prisma.service.spec.ts`): kỳ vọng danh sách import của `AppModule` thiếu `ViewingsModule` và `NotificationsModule`. Chỉ là test lỗi thời.
2. **`npm run test:e2e`: 9 test fail.** Nguyên nhân tôi xác định được: DB dev ở xa (pooler Supabase ap-south-1), mỗi truy vấn đo được ~0,8 s (`select 1` 0,8–2 s). Giao dịch tương tác của Prisma mặc định chỉ chờ 5 s, nên các giao dịch 6–8 truy vấn (duyệt giá, đặt lịch, mở khóa tòa) bị `Transaction API error: Transaction not found` → `POST /room-prices` trả 500, các test sau fail dây chuyền. Chạy riêng `pricing.e2e-spec.ts` lúc này cũng fail 1/10 test với đúng lỗi đó (trước đây 10/10 đạt, nên đây là độ trễ mạng, không phải lỗi logic P2-5/P2-6).

Sửa: `PrismaService` đặt `transactionOptions: { maxWait: 10 s, timeout: 30 s }` cho mọi giao dịch tương tác; cập nhật danh sách import trong test.

## File sẽ sửa ở bản chính (đích từ `Source/backend/`)

| Bản nháp | Sửa |
|---|---|
| `src/common/prisma/prisma.service.ts` | thêm constructor `super({ transactionOptions })`, kèm comment `shortcut:` |
| `src/common/prisma/prisma.service.spec.ts` | danh sách import kỳ vọng thêm `ViewingsModule`, `NotificationsModule` |

Không đổi logic nghiệp vụ. `ref/` không áp dụng.

## Cách xem và kiểm tra

Đã chạy overlay hai file nháp lên toàn bộ unit: **77 file, 1460/1460 test đạt**; oxlint 0 lỗi. Sau khi duyệt và áp dụng: chạy lại `npm run test`, `lint`, `build` và `npm run test:e2e` (kỳ vọng hết lỗi timeout; nếu còn fail thì điều tra riêng, trong đó có 1 test `buildings.e2e-spec.ts:256` về danh sách tòa khóa chưa rõ nguyên nhân).

## Đã kiểm tra

Như trên. Chưa có reviewer riêng (sửa nhỏ, 1 constructor + 1 test).

## Giả định hoặc câu hỏi cho chủ dự án

- Giá trị `maxWait` 10 s và `timeout` 30 s cố định trong mã (`shortcut:`), chuyển sang biến môi trường nếu môi trường khác cần.
- Lần e2e vừa rồi để sót dữ liệu `[E2E 20261105T1358-3HF9] Khách lặp lại` (viewings #2, #3) trên DB dev. Dọn bằng `scripts/e2e/cleanup.mjs --apply` cần chủ dự án đồng ý.

Đã chép vào file chính 05/11/2026 bằng apply-draft.mjs: 2 file.
