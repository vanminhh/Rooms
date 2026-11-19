# P3-3 — BE-P3-17 — Reset mật khẩu người thuê

Ngày 19/11/2026, bắt đầu từ `449b450` (BE-P3-16 đã được chủ dự án xác nhận test thành công và commit). Ba thay đổi tài liệu có sẵn là bản ghi nghiệm thu của chính lượt trước, được giữ và cập nhật trong lượt này. Chỉ triển khai BE-P3-17; chưa BE-P3-18..19. Chưa commit các thay đổi mới.

## Hành vi

`POST /api/v1/contracts/:id/reset-password`, không cần body, chỉ Boss hoặc quản lý hiện tại của tòa trong phạm vi request. Trả 201 `{data:{temporaryPassword}}` sau khi transaction commit, header `Cache-Control: no-store`. Mật khẩu ngẫu nhiên 10 ký tự, chỉ lưu Argon2id; không có API đọc lại, không lưu response qua idempotency và không đưa password/hash vào audit hoặc log. Gọi reset lại tạo mật khẩu mới và vô hiệu mật khẩu vừa cấp trước đó.

Sau kiểm scope ban đầu, Argon2 được tính trước khi giữ khóa. Trong transaction: mapping shared → contract → khóa phone dùng chung với auth → user; đọc lại assignment và tenant. Chỉ TENANT hợp lệ; guest-only/missing contract trả `NOT_FOUND`, hợp đồng ngoài phạm vi staff trả `OUT_OF_SCOPE`. Đổi password hash, đặt `mustChangePassword=true`, thu hồi mọi refresh session và vô hiệu mọi link recovery chưa dùng cùng audit `user.reset_password_by_staff`. Audit lỗi rollback toàn bộ. `isActive` không thay đổi: tài khoản nhân sự đã khóa không được tự mở lại.

**[ASSUMPTION A-23]** Account còn marker chờ ký trả `CONFLICT_STATE`: ký trước để cấp mật khẩu đầu tiên, reset sau. Đã hỏi lựa chọn tùy chọn nhưng chưa nhận câu trả lời, tiếp tục theo phương án đề xuất. Đây là giả định triển khai được ghi tại spec 00/10, không phải quyết định owner đã xác nhận.

## Thu hồi access JWT và xử lý đồng thời

Thiết kế trước chỉ thu hồi refresh và chặn theo `mustChangePassword`; JWT cũ có thể dùng lại sau khi flag được xóa. Mốc này sửa bằng claim `cv` HMAC-SHA256 có phân miền, ràng buộc user id và salted password hash, khóa bằng `JWT_SECRET`. Guard so với hash hiện tại bằng so sánh thời gian hằng. JWT không chứa password hoặc hash gốc. Đổi hash làm token trước đó vĩnh viễn không hợp lệ, kể cả sau tự đổi mật khẩu hoặc restart app; không cần schema hay kho thu hồi mới.

Token phát từ login/verify-email/refresh dùng snapshot đã xác thực. Không đọc hash mới sau transaction để ký một yêu cầu cũ vừa bị reset. Login đọc lại password hash/active trước tạo session; refresh khóa user rồi kiểm session chưa thu hồi/chưa hết hạn; tự đổi mật khẩu đọc lại hash trước ghi. Recovery issue và consume đều khóa user trước reset-token để không đảo thứ tự khóa với reset staff. Link đã đọc hoặc việc forgot-password đang chờ từ credentials cũ không thể ghi đè reset vừa commit.

Sau tự đổi mật khẩu, current refresh session vẫn giữ theo AUTH-T3, nhưng access JWT cũ hết hiệu lực. Luồng FE hiện hữu tự refresh khi nhận 401 rồi retry; không đổi FE hoặc response change-password. Legacy access token chưa có `cv` nhận 401; refresh cookie còn hợp lệ lấy được token mới. Việc khóa rồi mở lại account mà hash không đổi là hành vi khác ngoài phạm vi reset này; không tuyên bố đã sửa mọi trường hợp deactivation/re-activation bằng `cv`.

## Tệp thay đổi

| Nhóm | Tệp |
|---|---|
| Reset staff | `Source/backend/src/modules/contracts/contract-password.service.ts`, `contracts.controller.ts`, `contracts.module.ts` |
| Credential JWT | `Source/backend/src/common/crypto/credential-version.ts`, `common/guards/jwt-auth.guard.ts`, `modules/auth/token.service.ts` |
| Auth transaction | `Source/backend/src/modules/auth/auth.service.ts` |
| Test mới | `Source/backend/src/modules/contracts/contracts.reset-password.http.spec.ts`, `modules/auth/auth.credential-races.spec.ts` |
| Test/fixture điều chỉnh | `Source/backend/src/common/guards/guards.spec.ts`, `modules/auth/token.service.spec.ts`, `modules/auth/auth.account.spec.ts`, `test/fixtures/auth-scenarios.ts` |
| Spec và hồ sơ | Spec 00/01/10; task, PROGRESS, PLAN, checkpoint BE-P3-16, file này và LESSONS. |

Không đổi schema, migration, dependency hoặc `.env`; không ghi DB dev, gửi mail thật hoặc xóa dữ liệu. Không thêm màn hình FE reset ở mốc này.

## Kiểm tra thực tế

| Phép kiểm | Kết quả |
|---|---|
| Build | `npm run build`, exit 0 trên mã production cuối. |
| Lint cuối | `Found 4 warnings and 0 errors.`, exit 0, 235 file. Bốn cảnh báo sort cũ của dashboard/pricing. Lượt đầu có 7 lỗi promise setup trong test và 1 cảnh báo method binding mới; đã sửa, không nới rule lint. |
| Token | `37/37` đạt trong lượt tập trung độc lập: claim cv, snapshot, không lộ password/hash, từ chối legacy/malformed claims. |
| Guard | `65/65` đạt trong lượt HTTP tập trung độc lập: role/scope và access cũ vẫn bị từ chối sau khi clear flag. |
| Reset + race mới | Exit 0: `Test Files 2 passed (2)`, `Tests 30 passed (30)`, 7,94 giây. 15 ca reset HTTP và 15 ca race với DB edge lập lịch competing commit; service/Argon2/token/audit thực. HTTP trong bộ nhớ, chặn egress ngoài trong Node. |
| PostgreSQL nhúng | Exit 0, Nest HTTP và Prisma thật trên schema/constraints hiện hữu. Luồng create/sign/pay cũ vẫn qua, tiếp đến staff reset thu hồi access/refresh/link cũ; login bằng mật khẩu tạm bị buộc đổi; tự đổi giữ current refresh, refresh lấy access mới; access trước reset và access mật khẩu tạm tiếp tục 401 sau clear flag; audit không chứa password/hash. |
| Hồi quy rộng/full suite | Chưa có kết quả hoàn tất cho bản BE-P3-17. Lượt 7 file hồi quy auth/contracts/billing và lượt 3 file auth account/reset/session bị automatic approval review chặn do telemetry Visual Studio có payload chưa xác định. Không tính log dở là pass, không gọi đây là full suite đạt. Cần `npm run test` trên máy dự án. |
| E2E DB dev | Chưa chạy ở mốc này; giữ BE-P3-19 và phần chờ E2E/cleanup list P3-2. |
| Review | DUYỆT; báo cáo đầy đủ bên dưới. |
| Diff | `git diff --check` đạt. |

Output smoke BE-P3-17:

```text
AUTH-07/T3: real staff reset revokes access, refresh and recovery link; temporary login forces change; current refresh survives own change
AUTH-T1/T3: old access stays invalid after flag clears; new access succeeds without password material in audit
```

Thông báo lỗi fixture audit ở ca rollback là lỗi chủ động phục vụ test, không phải kết quả thất bại. Không in mật khẩu sinh ra. PGlite chỉ có một session; fake transaction được xếp hàng hoặc lập lịch snapshot. Đây không phải bằng chứng tranh chấp khóa PostgreSQL nhiều connection và không thay thế E2E DB dev.

Rà môi trường chỉ đọc cho thấy PowerShell 7.6.9 đã nạp Application Insights và đọc opt-out tại startup; đây là nguồn telemetry có khả năng liên quan, chưa chứng minh endpoint bị chặn cụ thể. Không đổi cấu hình máy hoặc dùng setter private để vượt auto-review. Đặt opt-out bên trong command không được xem là đã ngăn telemetry của host.

## Kiểm tra trên máy dự án

Chạy bộ backend chuẩn trước nghiệm thu/commit:

```powershell
cd D:\Rooms\Source\backend
npm run test
```

Kiểm tay API bằng tài khoản staff và tài khoản tenant thử đã ký, không dùng account thật đang phục vụ người thuê:

1. Giữ một phiên tenant thử và link recovery thử nếu có; staff gọi `POST /contracts/{id}/reset-password` trong đúng tòa. Nhận duy nhất `temporaryPassword` và header no-store. GET chi tiết hợp đồng không có password.
2. Access và refresh cũ nhận 401, link recovery cũ không dùng được. Đăng nhập mật khẩu tạm thành công, thấy `mustChangePassword=true`; API nghiệp vụ bị chặn `PASSWORD_CHANGE_REQUIRED`.
3. Đổi mật khẩu bằng session mới. Current refresh vẫn dùng được để lấy access mới; access cũ trước reset tiếp tục bị từ chối sau khi flag false. FE có thể đi tiếp qua refresh-on-401 sẵn có.
4. Manager khác tòa bị từ chối; guest-only không có hợp đồng reset hợp lệ; account chờ ký trả conflict theo A-23. Account bị nhân sự khóa vẫn inactive sau reset.

Kiểm tra reset làm mất mật khẩu cũ nên chỉ dùng account thử. Không cần migration hoặc generate Prisma Client. Dừng ở BE-P3-17; BE-P3-18 là phần scan/in/dashboard tiếp theo.

Commit gợi ý sau kiểm chứng:

```text
feat(contracts): reset tenant passwords and revoke stale credentials (BE-P3-17, AUTH-07, AUTH-T3)
```

## Báo cáo reviewer đầy đủ

KẾT LUẬN: DUYỆT  
Phạm vi: BE-P3-17 chưa commit so với `449b450` — 16 file — +767/-29 dòng; loại ba thay đổi tài liệu hoàn tất BE-P3-16. Không xét BE-P3-18..19.

### Lỗi chặn

Không phát hiện lỗi chặn.

### Nên sửa

Không có đề nghị sửa bắt buộc. Kiểm chứng PostgreSQL nhiều connection vẫn nằm ngoài bằng chứng hiện có; test đã ghi rõ giới hạn fake transaction tại `Source/backend/src/modules/contracts/contracts.reset-password.http.spec.ts:75`.

### Ghi chú

- `contract-password.service.ts:19` kiểm tra scope trước Argon2; dòng 29–39 khóa theo thứ tự mapping → contract → phone → user và đọc lại assignment/tài khoản trước thay đổi.
- `contract-password.service.ts:42` từ chối pending marker theo A-23. Dòng 44 chỉ đổi hash và `mustChangePassword`, giữ nguyên `isActive`, kể cả tài khoản bị khóa.
- `contract-password.service.ts:44`–47 đặt đổi mật khẩu, thu hồi session, vô hiệu recovery link và audit trong cùng transaction. Audit chỉ chứa contractId; mật khẩu rõ chỉ trả sau commit tại dòng 49, không lưu replay.
- `credential-version.ts:7`–12 dùng HMAC phân miền, ràng buộc userId và salted hash; không đưa hash vào JWT. Dòng 15–18 kiểm tra định dạng cố định và so sánh thời gian hằng.
- `jwt-auth.guard.ts:43`–46 so `cv` với hash hiện tại từ DB. JWT cũ tiếp tục bị từ chối sau khi cờ đổi mật khẩu được xóa; token thiếu `cv` cũng bị từ chối tại `token.service.ts:44`.
- Ba đường cấp token production ký snapshot đã xác thực: `auth.service.ts:131`, dòng 211 và 271. Vì vậy reset xảy ra sau commit session không khiến token cũ được ký bằng credentials mới.
- Login, refresh và tự đổi mật khẩu đọc lại credentials dưới user lock tại `auth.service.ts:120`, dòng 248 và 341. Refresh kiểm tra lại session chưa thu hồi/chưa hết hạn tại dòng 254.
- Recovery issue và consume đều khóa user trước reset-token tại `auth.service.ts:384` và dòng 420; staff reset cũng ghi reset-token sau user lock. Không thấy thứ tự khóa ngược gây deadlock trong các đường được đọc.
- Tự đổi mật khẩu giữ refresh session hiện tại tại `auth.service.ts:354`. Luồng FE hiện hữu tại `Source/frontend/src/shared/api.ts:153` refresh và retry khi JWT cũ nhận 401.
- Test mới kiểm tra privacy, scope thay đổi, pending/locked, rollback, JWT/refresh/link cũ và stale credential races. Không giả định các fake này chứng minh tranh chấp khóa PostgreSQL thật.
- **A-23 là giả định triển khai**, chưa được owner xác nhận; giữ đúng phân biệt đó trong kết luận.

### Đã kiểm

Đọc toàn bộ service reset, credential helper và hai test mới; diff controller/module, AuthService, TokenService/JwtGuard, các test và fixture điều chỉnh, ba spec AUTH-T1/T3/A-23; đối chiếu helper scope, mapping/OTP lock, audit và luồng refresh FE liên quan.

Chỉ review read-only; không chạy test/DB, đọc env/secrets/dependencies hoặc sửa file. Chưa có kết quả full regression sau lần chạy bị automatic approval review chặn; không coi đó là một lần kiểm thử đạt.
