# P3-3 — BE-P3-18..19 — Scan, in hợp đồng và nghiệm thu

Ngày 19/11/2026, bắt đầu từ `11379c8`. Chủ dự án xác nhận BE-P3-17 pass hết và đã commit; Git xác minh workspace sạch. Không có số đếm/thời lượng test trong xác nhận đó nên không suy đoán.

**Cập nhật 20/11/2026: BE-P3-18..19 đã nghiệm thu; P3-3 chờ commit.** Chủ dự án xác nhận “pass hết r nhé”, khép bộ backend đầy đủ; E2E DB dev đạt 2/2 file, 5/5 test và cleanup đã xác minh. Reviewer DUYỆT, build/lint đạt. Không có số đếm/thời lượng unit trong xác nhận mới nên không suy đoán. Mã mới chưa commit; HEAD vẫn `11379c8`.

**Xác minh commit khi bắt đầu BE-P3-20 ngày 20/11/2026:** Git đã có `b4da02b`, workspace sạch; P3-3 xong. Các ghi nhận chờ commit bên dưới phản ánh thời điểm báo cáo trước commit, không còn là việc chờ hiện tại.

## Hành vi

- Staff có `GET /contracts/:id/scan`, `/print`; tenant có `/me/contracts/:id/scan`, `/print`, bên cạnh list/detail và QR đã có. Guest bị từ chối trước lookup. Tenant khác nhận 404; staff khác tòa nhận 403. Scope được đọc lại dưới mapping lock; truy vấn khóa tenant cũng ràng buộc tenant_id.
- Scan trả `{url, expiresAt}` qua helper P3-1, tối đa 300 giây. Mỗi lần cấp link thành công ghi `contract.view_scan` với actor/IP trong cùng transaction; audit hoặc cấu hình ký lỗi thì không trả URL, audit rollback. Không có scan trả 404. Scan và print có `Cache-Control: no-store`.
- Print trả `{content,isDraft}`, nội dung plain text từ `settings.contract_template`. Money `2.500.000 đ`, dates `dd/mm/yyyy`; thông tin tenant lấy từ signer occupant snapshot, chỉ đọc last4 CCCD, không decrypt hoặc SELECT ciphertext. Bản in không lấy tên profile đã đổi sau khi tạo hợp đồng.
- Mẫu mặc định và mẫu text cũ luôn có `isDraft=true`, đầu nội dung là **BẢN NHÁP – chưa dùng để ký** theo Q-15. Setting có thể là `{content,isDraft}` để owner đặt mẫu chính thức sau này. Thiếu setting dùng draft built-in; seed thêm draft bằng upsert `update:{}`, giữ mẫu có sẵn. Không chạy seed trên DB dev.
- Renderer chỉ thay một lượt các placeholder cho phép; giữ nguyên nội dung được chèn, không eval hay render HTML. Tên field lạ, expression/prototype, NUL và dấu ngoặc mẫu sai bị từ chối bằng lỗi kiểm soát. Trang in FE sau này phải render text, không dùng raw HTML.
- Dashboard thêm `unpaidDeposits:{count,items}`. Chỉ DEPOSIT/UNPAID, gồm cả cọc chưa đến hạn; trách nhiệm theo quản lý hiện tại, Boss fallback khi không có quản lý hoạt động. Lọc tòa trong scope; đếm đủ, tối đa năm mục theo dueDate/id, count và items cùng repeatable-read. Hóa đơn đã thu/hủy không còn trong nhóm. Projection chỉ có thông tin hiển thị invoice/contract/room/building/tenant; spec NOTI-06 đã cập nhật.

Mốc này là backend; trang in và thao tác hiển thị FE thuộc P3-6/P3-7. Q-15 còn mở, chưa có mẫu pháp lý chính thức mới. A-02, A-22 và A-23 giữ nguyên; không thêm giả định nghiệp vụ mới.

## Tệp

| Nhóm | Tệp dưới `Source/backend/` |
|---|---|
| Documents | `src/modules/contracts/contract-documents.service.ts`, `contract-print.ts`, controllers staff/tenant và contracts.module |
| Documents tests | `contracts.documents.http.spec.ts`, `contract-print.spec.ts` |
| Draft seed | `prisma/seed.ts`, `seed.spec.ts` |
| Dashboard | `src/modules/notifications/dashboard.service.ts`, `dashboard.deposits.spec.ts`, các fixture dashboard và `src/modules/viewings/viewings.http.spec.ts` |
| Workflow E2E | `test/contracts-workflow.e2e-spec.ts`, `test/fixtures/rollback-prisma.ts`, `rollback-prisma.spec.ts` |

Spec 19/20 mô tả nhóm mới và template/allowlist. Task, PROGRESS, PLAN, LESSONS và checkpoint BE-P3-17 đã cập nhật. Không đổi schema, migration, dependency hoặc `.env`, không xóa lịch sử và không gửi mail/upload tài liệu thật.

## Workflow DB và rollback

Workflow mới dùng route Nest, guards, Prisma query và PostgreSQL trigger thực trong một outer transaction. Prisma provider test-only ánh xạ mỗi transaction API sang SAVEPOINT/RELEASE; lỗi SQL được ROLLBACK TO trước khi tiếp tục. Có ca thực sự gây lỗi trigger amount mismatch rồi chứng minh route ghi thu vẫn hoạt động sau savepoint recovery.

Cuối workflow luôn ném sentinel rollback riêng, chỉ bắt chính sentinel đó. Sau rollback, root client kiểm 13 nhóm fixture đều bằng 0 và bank/template khôi phục. Không commit PAID HOLD giả, không xóa payment/audit đã commit, không thêm cleanup vượt phạm vi và không ghi `CLEANED` sai cho workflow này. Runner/cleanup BE-P3-12 giữ nguyên.

Giới hạn: một connection, không chứng minh các request commit độc lập hoặc tranh chấp khóa nhiều connection. PostgreSQL sequence có thể tăng dù rows rollback. Lệnh create giữ global mapping lock tới cuối outer transaction, vì vậy chạy riêng hoặc tuần tự với một worker trên DB dev, tránh chạy song song với các file E2E khác. Timeout outer là 240 giây cho độ trễ remote. Provider Cloudinary metadata là edge được giả lập; không upload/download từ tài khoản thật.

## Kiểm tra thực tế

| Phép kiểm | Kết quả |
|---|---|
| Build | `npm run build` exit 0. |
| Lint | Exit 0, `Found 4 warnings and 0 errors.`, 243 file. Chỉ bốn cảnh báo sort cũ dashboard/pricing. |
| Dashboard + viewing HTTP | `5 passed`, `79 passed`, 9,20 giây; gồm 12 ca mới cho unpaid deposits. |
| Scan/print cuối | `Test Files 2 passed (2)`, `Tests 64 passed (64)`, 3,96 giây; gồm HTTP 26 và renderer 38 sau bổ sung triple-brace. |
| Seed và savepoint | Seed 39 và savepoint 10 đạt trong các lượt tập trung. Lượt đầu seed count còn 2; đã cập nhật thành 3 theo Q-15. Lượt đầu HTTP giả định glyph `-`; sửa assertion không áp điều spec chưa chốt. Các lượt cuối của tệp liên quan đạt. |
| Typecheck E2E mới | noEmit phạm vi ba tệp mới đạt; scoped lint 0 lỗi/0 cảnh báo. Không dùng lỗi cũ của artifact/legacy tests trong một lượt noEmit không giới hạn làm kết luận về bản mới. |
| Workflow trên PostgreSQL nhúng | `1 passed (1)`, exit 0, 5,19 giây. Chạy chính tệp workflow với adapter PGlite test-only và HTTP trong bộ nhớ; rollback và kiểm không còn fixture đã đạt. |
| E2E DB dev | Ảnh chủ dự án ngày 20/11/2026: `Test Files 2 passed (2)`, `Tests 5 passed (5)`, 164,71 giây, bắt đầu 06:59:36. BE-P3-12 đạt 4/4 và in `CLEANED`; workflow BE-P3-19 đạt 1/1 và in `outer rollback verified; no fixture rows retained (sequences may advance)`. Lỗi kết nối của lượt 19/11 đã được khép bằng kết quả DB dev này. |
| Bộ backend đầy đủ | Chủ dự án xác nhận “pass hết r nhé” ngày 20/11/2026 cho revision BE-P3-18..19, khép phần chờ full suite. Không cung cấp số đếm/thời lượng unit nên chỉ ghi nhận pass; không dùng số đếm của mốc cũ. Không chạy lại test trong lượt ghi nhận này. |
| Review | DUYỆT, báo cáo đầy đủ bên dưới. |
| Diff | `git diff --check` đạt. |

Output workflow PostgreSQL nhúng:

```text
BE-P3-19 20261119T2229-5OTA: outer rollback verified; no fixture rows retained (sequences may advance)
Test Files 1 passed (1)
Tests 1 passed (1)
```

Log lỗi fixture audit hoặc INTERNAL_ERROR ở ca cố tình gây lỗi là kiểm rollback/validation; không phải test thất bại ở lượt cuối. Workflow kiểm logger và response/audit không có mật khẩu hay CCCD đầy đủ; ngoại lệ plaintext duy nhất là response ký cấp mật khẩu một lần, được kiểm riêng và không đưa vào nhóm response cấm private field.

Output tổng kết DB dev từ ảnh chủ dự án ngày 20/11/2026:

```text
Test Files 2 passed (2)
Tests 5 passed (5)
Start at 06:59:36
Duration 164.71s
```

Dòng lỗi đỏ `BE-P3-12 simulated failure after writing the contract audit` là lỗi cố tình tạo trong ca rollback sau audit. Ca đó đã pass; không phải lỗi E2E còn tồn tại. BE-P3-12 xác minh dọn tự động trước khi in `CLEANED`; workflow BE-P3-19 xác minh rollback và không giữ fixture. Giới hạn một connection của workflow vẫn giữ nguyên.

## Trạng thái nghiệm thu và lệnh tham khảo

Chủ dự án đã xác nhận toàn bộ test pass; không còn kết quả test cần bổ sung. Chỉ chờ chủ dự án commit, gồm các cập nhật tài liệu mới sau lần stage trước. Lệnh dưới lưu để tái kiểm khi có thay đổi:

```powershell
cd D:\Rooms\Source\backend
npm run test
```

Hai file E2E đã pass trên DB dev, không cần chạy lại. Lệnh dưới chỉ lưu để tái kiểm khi có thay đổi:

```powershell
$roomsPreviousNodeEnv = $env:NODE_ENV
try {
    $env:NODE_ENV = 'test'
    node --env-file=.env .\node_modules\vitest\vitest.mjs run --config .\vitest.config.e2e.ts .\test\contracts.e2e-spec.ts .\test\contracts-workflow.e2e-spec.ts --maxWorkers=1 --no-file-parallelism
    if ($LASTEXITCODE -eq 0) {
        node --env-file=.env .\scripts\e2e\cleanup.mjs
    }
} finally {
    $env:NODE_ENV = $roomsPreviousNodeEnv
}
```

Không dùng `npm run test:e2e` ở máy này vì script cũ trỏ `../.env`; lệnh trên dùng `backend/.env` đúng. Chỉ chạy cleanup **list**, không `--apply`.

Ảnh đã cung cấp tổng kết E2E và cả hai dấu hiệu `CLEANED`/`outer rollback verified`. Chủ dự án đã xác nhận bộ backend đầy đủ pass; BE-P3-19 được đánh dấu `[x]`. Cleanup list của BE-P3-12 được ghi riêng tại checkpoint P3-2, dựa trên đầu ra list chủ dự án gửi tiếp theo.

Chủ dự án đã gửi cleanup list ngày 20/11: không có nhật ký chờ dọn, không có run `20261120T0659-VCIC`; chỉ báo các bản ghi unlogged cũ từ 03–06/11. Tiêu chí list của BE-P3-12 đã khép và P3-2 xong; lệnh list read-only dưới đây chỉ lưu tham khảo. Các bản ghi cũ không được xử lý trong lượt nghiệm thu này.

```powershell
node --env-file=.env .\scripts\e2e\cleanup.mjs
```

Kiểm API bằng tài khoản thử nếu cần: GET own scan có no-store/expiry 5 phút và audit; guest 403, tenant khác 404; GET print có draft flag, tiền/ngày đúng và chỉ last4; dashboard unpaidDeposits mất mục sau khi ghi thu. Không ký hợp đồng thật bằng mẫu Q-15 nháp.

Commit gợi ý:

```text
feat(contracts): add scan, print and deposit tasks (BE-P3-18..19, CON-16/22, NOTI-06)
```

Đợt thay đổi cũng chứa workflow nghiệm thu BE-P3-19. P3-3 đã qua nghiệm thu và chờ chủ dự án commit; sau commit mới tiếp tục BE-P3-20 thuộc P3-4. Q-15 vẫn là mẫu nháp; A-02/A-22/A-23 giữ nguyên, xác nhận test không được diễn giải thành quyết định nghiệp vụ mới.

## Báo cáo reviewer đầy đủ

KẾT LUẬN: DUYỆT
Phạm vi: BE-P3-18/19 chưa commit so với `11379c8` — 20 file — +1392/-7 dòng; loại ba tài liệu hoàn tất BE-P3-17.

### Lỗi chặn

Không phát hiện lỗi chặn còn tồn tại.

### Nên sửa

Không có đề nghị sửa bắt buộc.

Mép validation triple-brace đã được sửa tại `Source/backend/src/modules/contracts/contract-print.ts:47`; ba ca tương ứng đã thêm tại `contract-print.spec.ts:83`.

### Ghi chú

- `contract-documents.service.ts:32` và dòng 43 lấy mapping lock trước authorization. Dòng 71–85 khóa hợp đồng, ràng buộc tenant sở hữu và kiểm tra assignment hiện tại; tenant khác nhận 404, staff ngoài scope nhận 403.
- `contract-documents.service.ts:36` ghi audit trước khi tạo signed URL. Cả hai nằm trong transaction; lỗi audit/cấu hình không trả URL và rollback audit. Helper hiện hữu giới hạn URL ở 300 giây.
- `contract-documents.service.ts:14`–20 chỉ SELECT trường in cần thiết, lấy thông tin tenant từ signer snapshot. Dòng 47 chặn last4 sai định dạng; không đọc ciphertext, CCCD đầy đủ hoặc tài sản riêng tư.
- `contract-print.ts:50`–56 chỉ thay placeholder đã biết, một lượt; giá trị chèn vào giữ nguyên dạng text. Thiếu setting dùng bản nháp; setting text luôn là draft. Seed dùng `upsert` với `update: {}` tại `prisma/seed.ts:150`, không ghi đè mẫu đã có.
- `dashboard.service.ts:129`–141 lọc DEPOSIT/UNPAID theo người quản lý hiện tại hoặc Boss fallback; count và tối đa năm items dùng cùng repeatable-read transaction. Projection tại dòng 39 chỉ gồm trường hiển thị.
- `test/contracts-workflow.e2e-spec.ts:80` giữ toàn bộ fixture, settings và nghiệp vụ trong outer transaction; facade được inject tại dòng 82–85. Không thấy đường ghi fixture hoặc tiền qua base client bên ngoài transaction.
- `test/fixtures/rollback-prisma.ts:27`–40 phục hồi SQL lỗi bằng rollback-to/release savepoint. Workflow thử trigger lỗi thật tại `contracts-workflow.e2e-spec.ts:187`, sau đó kiểm tra query tiếp tục được.
- Sentinel tại `contracts-workflow.e2e-spec.ts:278` buộc rollback toàn bộ. Dòng 286–308 kiểm tra 13 nhóm fixture không còn và bank/template được khôi phục; không giữ hóa đơn đã trả hoặc payment giả.
- Workflow một connection không chứng minh các request commit độc lập hoặc PostgreSQL concurrency nhiều connection. Lần chạy dev DB thất bại trước khi tạo fixture; kết quả embedded SQL được báo đạt không thay thế dev E2E.

### Đã kiểm

Đọc toàn bộ service tài liệu, renderer/tests, dashboard mới/tests, workflow E2E và savepoint facade/tests; diff controllers/module, seed/tests, fixture dashboard và spec 19/20. Đối chiếu CON-16/22, NOTI-06, SCOPE-02/03/04, Q-15 và các helper liên quan.

Chỉ review read-only; không chạy DB/test, đọc env/secrets/dependencies hoặc sửa file.
