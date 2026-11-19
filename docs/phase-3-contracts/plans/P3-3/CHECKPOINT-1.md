# P3-3 — Checkpoint 1 — BE-P3-13..15

Ngày 19/11/2026, bắt đầu từ commit `b6c7ff6` đã được chủ dự án xác nhận. Chưa commit các thay đổi ở checkpoint này.

Cập nhật 19/11/2026: ảnh kết quả trên máy chủ dự án xác nhận bộ backend chuẩn đạt **99/99 file, 1961/1961 test**, thời lượng **90,01 giây** (bắt đầu 08:42:54). Đã đủ kết quả test cho checkpoint BE-P3-13..15; đang chờ chủ dự án kiểm tra và commit. Kết quả này không thay thế E2E trên DB dev.

## Hành vi

- `POST /contracts/:id/sign` nhận metadata phẳng `{ assetId, publicId, version, format }`. Chỉ Boss hoặc quản lý hiện tại của tòa được ký hợp đồng HOLD chưa ký. Metadata được kiểm bằng helper private `CONTRACT_SCAN` của P3-1; không lưu URL công khai.
- Sau IO với provider, giao dịch khóa mapping, hợp đồng và tài khoản rồi đọc lại scope, trạng thái và marker chờ ký. Ghi `signedAt`, private asset ID, kích hoạt tài khoản nếu cần, hóa đơn cọc và audit trong cùng giao dịch. Lỗi cấu hình ngân hàng hoặc audit rollback toàn bộ.
- Tài khoản mới nhận mật khẩu ngẫu nhiên 10 ký tự một lần sau commit, được lưu dưới dạng Argon2id và phải đổi trước khi dùng tenant API. Tài khoản đã dùng, kể cả guest đã xác minh, giữ hash hiện tại. Tài khoản thường bị nhân sự khóa không tự mở lại. Response ký có `Cache-Control: no-store`; không lưu response vào kho idempotency.
- Cọc dương tạo một hóa đơn `DEPOSIT`, một dòng cọc, `UNPAID`, ngày phát hành hôm nay và hạn `max(today, startDate)`. Cọc 0 hoặc gia hạn không tạo cọc mới.
- Hóa đơn chưa thanh toán có VietQR từ `settings.bank_account`, số tiền bằng tổng hóa đơn, nội dung `TT{id}` và `qrImageUrl`. Các trạng thái khác không có yêu cầu chuyển khoản. Dùng chung serializer cho response ký và chi tiết staff/tenant.
- Bổ sung `GET /me/contracts` và `GET /me/contracts/:id` để BE-P3-15 trả QR cho người thuê. Tenant khác nhận 404; guest bị từ chối; last4 của người cùng ở được che. Scan, print và dashboard còn ở BE-P3-18.

## Tệp thay đổi

| Nhóm | Tệp |
|---|---|
| Ký và trả dữ liệu | `Source/backend/src/modules/contracts/contracts.service.ts`, `contracts.controller.ts`, `contracts.module.ts` |
| Route và helper mới | `Source/backend/src/modules/contracts/me-contracts.controller.ts`, `deposit-invoice.ts`, `dto/sign-contract.dto.ts` |
| Test mới | `Source/backend/src/modules/contracts/contracts.sign.http.spec.ts`, `deposit-invoice.spec.ts` |
| Spec, kế hoạch và tiến trình | `docs/spec/00-overview.md`, `14-contracts.md`; `docs/phase-3-contracts/feature_p3-3-backend-sign-deposit.md`, `PROGRESS.md`, `plans/P3-3/PLAN.md`, file này; ghi nhận commit vào `plans/P3-2/CHECKPOINT-BE-P3-12.md`; `docs/LESSONS.md` |

Không đổi schema, migration, dependency hoặc `.env`. Không gửi email thực và không ghi DB dev.

## Kiểm tra thực tế

| Kiểm tra | Kết quả và giới hạn |
|---|---|
| `npm run build` | Exit 0 trên bản mã cuối. |
| `npm run lint` | Exit 0, `Found 4 warnings and 0 errors.` Bốn cảnh báo sort không có comparator nằm trong các test cũ của dashboard/pricing. |
| Lượt test tập trung trước ba ca race cuối | `151 passed (151)`, 9 file. Transport dùng HTTP trong bộ nhớ vì giới hạn loopback của môi trường. Sau đó bổ sung ba ca: ký cùng hợp đồng đồng thời, hai HOLD cùng pending tenant, và `signedAt` đổi trong lúc provider kiểm metadata. Bộ backend chuẩn trên máy chủ dự án sau đó đạt toàn bộ 1961 test, bao gồm ba ca bổ sung. |
| Smoke PostgreSQL nhúng trên mã build cuối | Exit 0. Gọi Nest/HTTP thật với Prisma và schema/constraints hiện tại: tạo hai HOLD cùng tenant; ký cả hai chỉ cấp một mật khẩu; hai hóa đơn và hai audit; ký lại 409; mật khẩu tạm đăng nhập được; tenant API bị chặn trước đổi mật khẩu; đổi mật khẩu rồi đọc hợp đồng và QR; guest đã xác minh giữ hash cũ và đăng nhập được sau ký. Cloudinary metadata được giả lập, không upload thực. |
| Toàn bộ backend trên bản cuối | Ảnh kết quả chủ dự án gửi ngày 19/11/2026: `Test Files 99 passed (99)`, `Tests 1961 passed (1961)`, `Duration 90.01s`, bắt đầu 08:42:54. Đây là kết quả bộ chuẩn trên máy dự án, không phải lượt chạy trong Codex. Các lượt Codex trước đó không hoàn tất vì automatic approval review chặn telemetry Visual Studio. |
| DB dev | Lượt đọc Prisma status vẫn `P1001`. E2E và cleanup list của BE-P3-12 còn chờ trên máy kết nối được DB dev; không dùng smoke nhúng thay thế kết quả đó. |
| Review | DUYỆT; addendum DUYỆT sau khi đọc ba ca test mới. Báo cáo đầy đủ ở dưới. |

Output smoke cuối:

```text
CON-07/A-22: two HOLD signatures activate one pending account and issue one temporary password
AUTH-05/BIL-10: password logs in, forces change, then tenant reads own contract and deposit QR
CON-07/D-26: verified guest keeps original password and logs in after signing
```

Smoke dùng một session PostgreSQL nhúng và tuần tự hóa quyền sở hữu transaction. Fake Prisma trong HTTP spec cũng xếp hàng toàn bộ giao dịch. Cả hai kiểm tra hành vi và atomicity trong môi trường đó, chưa chứng minh tranh chấp khóa trên nhiều connection PostgreSQL. Kiểm chứng concurrency DB dev còn chờ; không đánh dấu BE-P3-19 hoàn tất.

## Giả định và cách áp dụng spec

- **A-02**: hạn cọc `max(today, startDate)`; không thay giả định đã có.
- **A-22 — giả định triển khai mới, chưa được owner xác nhận**: nhiều HOLD dùng cùng tài khoản chờ ký thì lần ký thành công đầu tiên kích hoạt và cấp mật khẩu; những lần sau giữ mật khẩu đó. Đã hỏi tùy chọn nhưng không nhận lựa chọn, tiếp tục theo phương án đề xuất và ghi rõ là giả định, không ghi thành quyết định owner.
- Ký lặp trả `CONFLICT_STATE` theo yêu cầu cụ thể BE-P3-13. Không replay mật khẩu hoặc lưu plaintext theo quy tắc tổng quát API-05. Payment BE-P3-16 sẽ dùng idempotency/replay riêng.
- Reset tài khoản còn chờ ký cần xử lý trước BE-P3-17. Chưa triển khai reset hoặc ghi thu cọc ở checkpoint này.

## Kiểm chứng trên máy dự án

Trong PowerShell:

```powershell
cd D:\Rooms\Source\backend
npm run test
```

Bộ test đầy đủ đã pass theo ảnh chủ dự án gửi ngày 19/11/2026, không cần chạy lại vì thay đổi tài liệu này. Tiếp tục E2E P3-2 và cleanup list theo hướng dẫn tại `plans/P3-2/CHECKPOINT-BE-P3-12.md`; không tự áp dụng cleanup cho hợp đồng đã ký hoặc đã có hóa đơn.

Kiểm tra API khi có tài khoản staff và fixture đúng phạm vi:

1. Tạo HOLD, xin upload `CONTRACT_SCAN` qua luồng P3-1 và tải scan riêng tư lên; gửi bốn metadata thật tới `POST /api/v1/contracts/:id/sign`.
2. Nhận 201, `signedAt`, hóa đơn cọc và QR. Tài khoản mới có mật khẩu 10 ký tự; giữ mật khẩu trong lúc kiểm tra, không đưa vào log hoặc commit.
3. Ký lại nhận 409 `CONFLICT_STATE`; GET chi tiết không trả mật khẩu hoặc private asset ID. Tài khoản cũ không nhận mật khẩu mới.
4. Đăng nhập tài khoản mới: phải đổi mật khẩu trước khi dùng `/me/contracts`. Sau đổi, chỉ đọc được hợp đồng của mình và QR cọc đúng tổng tiền/nội dung. Tenant khác nhận 404.

Thông tin ngân hàng phải đúng trong `settings.bank_account`. Phần FE ký/in/thu cọc chưa được triển khai ở checkpoint này.

Commit gợi ý sau kiểm chứng:

```text
feat(contracts): sign HOLD contracts and issue deposits (BE-P3-13..15, CON-06..09, BIL-10, A-22)
```

## Báo cáo reviewer đầy đủ

### Lượt chính

KẾT LUẬN: DUYỆT  
Phạm vi: phần BE chưa commit so với `b6c7ff6` — 8 file — +444/-8 dòng; đối chiếu hai thay đổi spec A-22/CON-07.

#### Lỗi chặn

Không phát hiện lỗi chặn trong phần được giao.

#### Nên sửa

1. `Source/backend/src/modules/contracts/contracts.sign.http.spec.ts:74` — Fake `$transaction` xếp hàng toàn bộ giao dịch, còn `$queryRaw` tại dòng 72 không mô phỏng khóa. Các test hiện tại chưa kiểm chứng hai HOLD khác nhau cùng kích hoạt một tenant, hoặc hai lần ký đồng thời trên cùng hợp đồng. Nên bổ sung kiểm thử concurrency có khả năng phát hiện thiếu khóa; không coi hàng đợi fake hiện tại là bằng chứng chống race.
2. `Source/backend/src/modules/contracts/contracts.sign.http.spec.ts:128` — Ca ký lại chỉ chạy sau lần đầu đã hoàn tất. Nên bổ sung trường hợp trạng thái/signedAt thay đổi trong lúc Cloudinary đang xác minh, để bảo vệ lần kiểm tra lại trong transaction tại `contracts.service.ts:283`.

#### Ghi chú

- `contracts.service.ts:270` xác minh asset riêng tư trước transaction; lỗi provider không làm thay đổi tài khoản, hợp đồng hay hóa đơn.
- `contracts.service.ts:272` và `contracts.service.ts:282` khóa mapping rồi kiểm tra người quản lý hiện tại, bổ sung cho scope lấy từ guard.
- `contracts.service.ts:273` và `contracts.service.ts:283` khóa hợp đồng rồi đọc lại điều kiện HOLD/chưa ký; ký lặp không phát lại mật khẩu.
- `contracts.service.ts:277` thật sự SELECT `tenant.phone`, nên đường vào bình thường cung cấp được khóa OTP tại dòng 285.
- `contracts.service.ts:286` đọc tenant sau khóa user; hai HOLD dùng chung tài khoản sẽ thấy hash sau lần kích hoạt đầu. Chỉ nhánh pending tại dòng 292 sinh và trả mật khẩu; lần ký sau giữ mật khẩu hiện tại.
- `contracts.service.ts:301` bỏ qua cọc bằng 0 và gia hạn; ngày đến hạn tại dòng 305 đúng `max(today, startDate)`. Activation, signed state, invoice và audit cùng transaction.
- `contracts.service.ts:132` ràng buộc tenant sở hữu hợp đồng, trả 404 nếu không có; dòng 135 che last4 của người cùng ở.
- A-22 tại `docs/spec/00-overview.md:149` và `docs/spec/14-contracts.md:39` là **giả định triển khai**, chưa phải quyết định owner xác nhận.
- Dữ liệu tài khoản đã tồn tại có hash bình thường được giữ nguyên; tài khoản bị khóa có hash bình thường bị từ chối tại `contracts.service.ts:289`.
- Không chạy test, kết nối mạng/DB, sửa file hoặc commit theo phạm vi read-only.

#### Đã kiểm

- Đọc toàn bộ 8 file BE thay đổi/mới: service, controller, module, tenant controller, Sign DTO, deposit helper và hai file test.
- Đọc liên kết: `contract-tenant.ts`, `files.service.ts`, `viewing-reservations.ts`, `viewing-lock.ts`, `scope.ts`, auth decorators, password helper, schema/constraints và cấu hình bank trong seed.
- Đối chiếu CON-06..09, CON-16, BIL-10, G-09, SCOPE-02/03, A-02 và A-22.

### Addendum sau khi bổ sung test

Bổ sung review: **giữ DUYỆT**, không phát hiện lỗi chặn mới.

- Khuyến nghị về kiểm tra lại `signedAt` đã đáp ứng tại `contracts.sign.http.spec.ts:238`: thay đổi trong lúc xác minh provider dẫn tới 409, không activation hoặc tạo hóa đơn.
- Đã thêm hai tình huống trước đây thiếu: ký đồng thời cùng hợp đồng tại dòng 155; hai HOLD dùng chung tenant pending tại dòng 163. Metadata của hợp đồng 43 có `asset_folder` đúng tại dòng 167; assertions kiểm tra một mật khẩu, một lần cập nhật user và hai hóa đơn.
- Khuyến nghị về **bằng chứng khóa PostgreSQL vẫn còn giới hạn**: `$queryRaw` tại dòng 74 không mô phỏng khóa; `$transaction` tại dòng 77 vẫn tuần tự hóa toàn bộ giao dịch. Những test này kiểm chứng hành vi trong fake, chưa chứng minh concurrency PostgreSQL nhiều connection.
- Scratch PGlite một session, nếu báo cáo, chỉ được gọi là smoke test cục bộ; không phải dev E2E hoặc bằng chứng concurrency nhiều connection.

Chỉ đọc test mới; không chạy test/DB hoặc sửa file.
