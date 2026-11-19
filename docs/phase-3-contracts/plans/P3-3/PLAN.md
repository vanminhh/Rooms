# P3-3 — Ký hợp đồng, tài khoản và tiền cọc

## Phạm vi và điểm xuất phát

Kế hoạch cho BE-P3-13..19, dựa trên P3-2 đã được chủ dự án xác nhận commit `b6c7ff6`. Dòng P3-2 trong `PROGRESS.md` còn phản ánh lần kiểm tra trước; không coi trạng thái cũ hoặc lỗi mạng trước đây là điều kiện phải duyệt lại. Lượt lập kế hoạch chỉ viết file này, không sửa mã nguồn, `.env`, schema, DB, dependency hay trạng thái task.

Đã đọc các mục Before you start của `feature_p3-3-backend-sign-deposit.md`: hai `CLAUDE.md`, `LESSONS.md`, spec 00/14/16/01/02/10/20/19 và mã nguồn liên quan. Đã đọc câu hỏi bàn giao nhiều HOLD trong `plans/P3-2/PLAN.md`. Spec là nguồn nghiệp vụ; hướng dẫn AGENTS mới nhất của chủ dự án thay cho nội dung AGENTS cũ.

Mốc đầu kết thúc BE-P3-15: ký với scan riêng tư, kích hoạt đúng tài khoản, hóa đơn cọc và VietQR. Mốc sau làm BE-P3-16..19: ghi thu cọc, reset mật khẩu, hoàn thiện tenant/scan/in và nghiệm thu. Chưa làm move-in/cancel, hóa đơn tháng, webhook, inbox, gia hạn hoặc trang chỉnh mẫu. Q-15 đã cho phép bản in nháp, không cần đợi mẫu thật để phát triển.

Cập nhật 19/11/2026: BE-P3-13..15 đã commit `0d50e23`. Chủ dự án giao riêng **BE-P3-16**, vì vậy lượt này dừng ở [checkpoint BE-P3-16](CHECKPOINT-BE-P3-16.md) để kiểm tra và commit, chưa tiếp tục BE-P3-17..19. Phạm vi CP-2 tổng thể bên dưới vẫn giữ làm kế hoạch cho các lượt sau.

## Quyết định, giả định và điểm cần xác nhận

### Cách triển khai BE-P3-13..15

Chủ dự án chưa chọn phương án nhiều HOLD trong lượt hỏi tùy chọn. Main session tiếp tục theo phương án đề xuất dưới nhãn **[ASSUMPTION A-22]**, không ghi thành quyết định owner đã xác nhận. Ký lặp theo yêu cầu cụ thể BE-P3-13/CON-06 trả conflict; chỉ payment dùng response replay của API-05 trong phần này.

| Câu hỏi | Vì sao phải chốt | Lựa chọn cụ thể |
|---|---|---|
| **P3-3-Q1 — Một tài khoản mới có hai HOLD chưa ký: hợp đồng nào cấp mật khẩu?** | CON-07 viết “created for this contract … no other contract”, nhưng P3-2 đã cho phép nhiều phòng cùng dùng một TENANT chờ ký. Không có cột ghi hợp đồng tạo account. Giữ cách hiểu đếm mọi hợp đồng sẽ làm cả hai HOLD không được cấp mật khẩu. | **A, đề xuất:** lần ký hợp lệ đầu tiên của account còn marker chờ ký kích hoạt và cấp đúng một mật khẩu, dù còn HOLD khác; lần ký tiếp giữ mật khẩu. **B:** chỉ hợp đồng tạo account được cấp; cần xác định/lưu nguồn tạo và quy tắc chuyển quyền khi HOLD đó bị hủy, lập phương án bổ sung trước khi thay schema. |
| **Ký lại với cùng Idempotency-Key** | API-05 nói POST đổi tiền replay kết quả đầu trong 24 giờ; CON-09 yêu cầu mật khẩu trả một lần, không lưu clear; BE-P3-13/CON-06 quy định cụ thể ký hai lần trả `CONFLICT_STATE`. Helper replay hiện lưu toàn bộ response trong DB. | **Triển khai theo yêu cầu cụ thể BE-P3-13:** mọi lần ký lại trả `CONFLICT_STATE`; không cache/replay response ký. Ghi thu cọc vẫn replay đầy đủ theo API-05. Ghi rõ cách áp dụng này trong checkpoint; nếu owner muốn biên nhận ký replay sau này phải thiết kế riêng không có password. |

**[ASSUMPTION A-22]** Lần ký hợp lệ đầu tiên của TENANT còn marker chờ ký kích hoạt account và trả đúng một mật khẩu, bất kể các HOLD chưa ký khác. Đây là giả định triển khai của main session, chưa phải xác nhận của owner. Khóa phone/user và conditional update marker bảo đảm đúng một lần khi ký đồng thời. Phương án này và ký lặp conflict không cần migration hoặc dependency mới; có thể làm trọn BE-P3-13..15 cùng kiểm thử ngay.

### Cần giải quyết trước BE-P3-17

**P3-3-Q3 — Reset khi account vẫn đang chờ lần ký đầu?** Reset thông thường thay marker bằng Argon2, nhưng account vẫn inactive; khi ký sau sẽ mất dấu nhận biết account cần kích hoạt. Đề xuất chỉ reset account đã được kích hoạt; account còn marker trả `CONFLICT_STATE`, ký trước để cấp mật khẩu ban đầu. Nếu chủ dự án muốn reset trước ký, cần quy định riêng rằng mật khẩu đó có được sử dụng trước ký và lần ký sau xử lý thế nào. Quyết định này không cản BE-P3-13..15. Với account bị staff khóa, D-26 đã trả lời: reset không tự mở khóa.

Không hỏi lại các điểm spec đã chốt: cọc 0 bỏ hóa đơn; due date theo A-02; tài khoản GUEST đã xác minh giữ password; scan private và link tối đa 300 giây; bản in nháp khi Q-15 còn mở; inbox thông báo thanh toán đợi Phase 5.

## Kiến trúc và mã nguồn dùng lại

Tái sử dụng `ContractsModule` hiện có. Tách các hàm nhỏ cho ký/tài khoản và projection nếu service bắt đầu khó đọc; controller chỉ nhận DTO và gọi service. Phần ghi thu đặt trong module `billing` mới theo cấu trúc spec, với service tiền cọc dùng chung các kiểu invoice và VietQR. Chưa xây module ngân hàng hay bộ tính hóa đơn tháng.

| Đường dẫn dưới `Source/backend/` | Dùng lại hoặc thay đổi dự kiến |
|---|---|
| `src/modules/contracts/contracts.service.ts`, `contracts.controller.ts`, `contracts.module.ts`, `dto/` | Thêm sign/reset; giữ projection select tường minh, mở rộng deposit summary bằng helper chung. Controller tenant riêng `/me/contracts`. |
| `src/modules/contracts/contract-tenant.ts`, `src/common/crypto/password.ts` | Marker `PENDING_TENANT_PASSWORD_HASH = '!pending-contract-tenant'` đã có. Dùng marker, không suy ra từ `lastLoginAt` hoặc `isActive` riêng lẻ. |
| `src/modules/auth/managers.service.ts`, `src/common/crypto/token.ts` | Mẫu hash trước transaction, plaintext chỉ trả sau commit. `randomToken()` hiện dài hơn 10 ký tự; CON-07 cần bộ sinh mật khẩu ngẫu nhiên đúng 10 ký tự bằng Node crypto sẵn có. |
| `src/modules/files/files.service.ts` | `verifyContractAsset(..., 'CONTRACT_SCAN', upload)` kiểm immutable asset ID, folder hợp đồng, purpose prefix, metadata, format và `authenticated`; `signedContractAssetUrl()` trả `{url, expiresAt}` trong 300 giây. |
| `src/common/guards/auth.decorators.ts`, `src/common/scope/scope.ts` | Staff roles và `scopeWhere`; tenant dùng `TenantMeRoles` và `tenantId = actor.id`. Không gọi lại staff `get()` để trả 403 cho tenant khác. |
| `src/common/viewings/viewing-lock.ts`, `src/modules/auth/otp.service.ts` | Mapping lock trước khóa hàng; cùng namespace khóa phone với auth/create khi đồng bộ thay đổi account. |
| `src/modules/pricing/pricing-idempotency.ts` | Dùng parser/hash/transaction replay cho payment. Kho `pricing_idempotency_keys` đã có, không cần đổi schema hay đổi tên bảng. Không truyền response chứa mật khẩu vào helper này. |
| `src/modules/settings/settings.service.ts`, `prisma/seed.ts` | Thêm đọc riêng `bank_account`/`contract_template`, không trả toàn bộ settings. Seed hiện chỉ có bank mẫu `970436 / 0000000000 / TRO THONG MINH`, chưa có `contract_template`. |
| `prisma/schema.prisma`, `prisma/constraints.sql` | Đủ cột scan, invoice/line/payment. `periodNo = 0` cho DEPOSIT. Trigger payment khóa invoice, kiểm UNPAID/exact total rồi tự set PAID. Giữ nguyên schema/constraints cho phương án đề xuất. |
| `src/common/errors/db-errors.ts`, test tương ứng | Bổ sung map trigger `INVOICE_NOT_UNPAID`, `PAYMENT_AMOUNT_MISMATCH`; ErrorCode đã có. Cập nhật test exact-key theo LESSONS. |
| `src/modules/notifications/dashboard.service.ts`, spec 19 | Thêm nhóm `unpaidDeposits` cùng quy tắc scope/fallback Boss và giới hạn 5 item; cập nhật hợp đồng dashboard trong spec. |
| `src/app.module.ts`, test module-list | Đăng ký BillingModule khi BE-P3-16 bắt đầu; cập nhật test module-list cùng thay đổi. |
| `test/contracts.e2e-spec.ts`, `scripts/e2e/run.ts`, `scripts/e2e/cleanup.mjs` | Tái sử dụng fixture/log runner; rà chính sách signed/paid trước E2E, vì cleanup hiện chỉ nhận HOLD chưa ký và không invoice. |

## Hợp đồng API

Tất cả route dưới `/api/v1`; envelope `{data}` và phân trang `{data, meta}` như API-02. Id hợp lệ là số nguyên dương trong Int4. Không gửi plaintext password/CCCD, hash hoặc scan asset trong danh sách/chi tiết/in/audit. Ngoại lệ duy nhất cho password là response của đúng thao tác vừa tạo mật khẩu.

| Route | Request và response dự kiến |
|---|---|
| `POST /contracts/:id/sign` staff | Body `{assetId, publicId, version, format}` từ metadata upload. Chỉ HOLD chưa ký. Trả `{...ContractSummary, signedAt, depositInvoice, temporaryPassword?}`; bỏ hẳn key mật khẩu khi reuse. Response sau commit. Ký lặp trả CONFLICT_STATE theo BE-P3-13. |
| `GET /contracts/:id` staff; `GET /me/contracts/:id` tenant | `ContractDetail` hiện có; `depositInvoice` thêm `code: 'TT'+id`, `vietqr`, `qrImageUrl`. QR chỉ có trên UNPAID; các trạng thái khác dùng null. Không đưa payment/QR vào contract list nếu không cần. |
| `GET /me/contracts` tenant | Danh sách có phân trang và thứ tự ổn định; truy vấn chỉ tenantId hiện tại, giữ lịch sử HOLD/ACTIVE/ENDED/CANCELLED. Triển khai phần list/detail tối thiểu trong BE-P3-15 để VietQR có mặt trên tenant route; BE-P3-18 bổ sung scan/in và nghiệm thu ownership đầy đủ. |
| `POST /invoices/:id/payment` staff | `{method: CASH|BANK_TRANSFER|CARD|OTHER, paidAt?: ISO timestamp có offset, note?: string}`. Không nhận amount/source/recordedBy từ client. Trả payment projection `{id, invoiceId, amount, method, source, paidAt, note, recordedById}`; HTTP status thống nhất với POST hiện có. `paidAt` bỏ trống dùng thời điểm ghi thu, không tự thêm hạn chế ngày tương lai/quá khứ ngoài spec. |
| `POST /contracts/:id/reset-password` staff | Không cần body; trả `{temporaryPassword}` một lần. Account được xác định từ contract có scope, không từ số điện thoại tự do. Q3 quyết định pending; không tự mở khóa account. |
| `GET /contracts/:id/scan`; `GET /me/contracts/:id/scan` | `{url, expiresAt}` qua helper 300 giây; không có scan trả `NOT_FOUND`; mỗi lần cấp link thành công ghi `contract.view_scan`. |
| `GET /contracts/:id/print`; `GET /me/contracts/:id/print` | `{content, isDraft}` với nội dung đã điền từ settings; contract documents luôn tiếng Việt. Placeholder chỉ lấy từ projection cho phép, CCCD chỉ last4. Không thực thi template như mã hoặc HTML tùy ý. |
| `GET /dashboard?buildingId` | Thêm `unpaidDeposits: {count, items}`; item gồm invoice id/code/total/dueDate, contract id/code và room/building/tenant đủ cho thẻ công việc. Đếm đầy đủ, tối đa 5 item, dueDate rồi id để ổn định. |

Staff thiếu session 401; sai role 403 `FORBIDDEN`; id không có 404; id ngoài tòa 403 `OUT_OF_SCOPE`. Tenant khác id luôn 404 từ chính truy vấn ownership; GUEST bị `FORBIDDEN` ngay trước lookup. `/me/*`, scan, print và response mật khẩu dùng `Cache-Control: no-store`; không cache URL ký.

## Giao dịch ký, hóa đơn và bảo vệ tài khoản

1. Kiểm role/scope/state cơ bản trước provider call. Xác minh scan qua helper P3-1 bên ngoài transaction. Chuẩn bị mật khẩu 10 ký tự và Argon2 ngoài thời gian giữ khóa khi nhánh pending có thể cần; không log dữ liệu này hoặc provider response. Kiểm tra lại toàn bộ điều kiện sau khi có khóa, không tin snapshot ban đầu.
2. Trong transaction lấy mapping shared trước các khóa hàng, giữ thứ tự thống nhất với create: room → contract → khóa phone cùng namespace auth → user. Phân biệt request scope và assignment hiện tại; không để scope mới cấp trong lúc request chạy mở rộng quyền. Các luồng sign/reset sau này phải cùng thứ tự, không user → room. Khóa account hoặc conditional update trên marker để hai HOLD khác phòng không cùng cấp mật khẩu.
3. Đọc lại HOLD, `signedAt = null`, tenant role và trạng thái khóa. Theo Q1-A, chỉ TENANT inactive còn marker được thay bằng hash mới, active=true, mustChangePassword=true. Account đã có hash dùng được giữ password/mustChangePassword/email/locale; inactive với hash dùng được không được tự kích hoạt. Điều kiện cập nhật contract phải gồm HOLD và signedAt null; cập nhật 0 hàng trả `CONFLICT_STATE`.
4. Lưu duy nhất `signedScanAssetId`, `signedAt` và giữ status HOLD. Cùng transaction tạo hóa đơn nếu deposit > 0 và `previousContractId = null`: type DEPOSIT, periodNo 0, status UNPAID; issueDate=todayHanoi, dueDate=max(today,startDate), createdById=actor. Một line DEPOSIT, quantity=1, unitPrice=amount=deposit, total=sum line amounts (G-01, BIL-07, DB-B4). Không tính cọc theo rent hoặc số tháng. Guard renewal để không thu lại cọc dù chưa xây route renewal.
5. Ghi `contract.sign` trong transaction với allowlist trạng thái/ngày/id liên quan; không hash, marker, password, CCCD hoặc scan asset/url. Audit lỗi làm rollback cả account/contract/invoice. Chỉ trả plaintext sau commit thành công. Nếu response bị mất, không có bản clear để đọc lại; ký lại vẫn conflict, reset để cấp mật khẩu khác khi cần.
6. Partial unique index hóa đơn không-cancelled trên contract/type/period là lớp bảo vệ cuối. Ký đồng thời cùng contract chỉ một thành công, một `CONFLICT_STATE`; không chuyển invoice unique conflict thành thành công giả hoặc trả mật khẩu lần hai.

## VietQR, template và dữ liệu riêng tư

Một helper dùng chung staff và tenant tại `contracts/deposit-invoice.ts` dựng `vietqr = {bankBin, accountNo, accountName, amount: invoice.total, content: 'TT'+invoice.id}` và URL đúng BIL-10. Dùng URLSearchParams/encode accountName đúng một lần, không gọi dịch vụ tạo QR, không thêm package. Chỉ đọc key ngân hàng cho invoice UNPAID. Trạng thái PAID/CANCELLED/SETTLED/DRAFT không có QR. Setting thiếu/sai không được dựng tài khoản giả; kiểm cấu hình có kiểm soát trước khi trả projection UNPAID, và trong transaction ký để không trả lỗi sau khi đã commit account/invoice. Kiểm thử rollback khi cấu hình không hợp lệ. Cấu hình seed là giá trị thử, không tự chạy seed hoặc ghi đè bank thật.

`contract_template` chưa có trong seed: chuẩn bị một draft tiếng Việt đơn giản và bộ placeholder cho phép, ghi rõ cờ nháp, có câu “BẢN NHÁP - chưa dùng để ký”. Có thể thêm seed upsert không ghi đè mẫu đã tồn tại và fallback draft khi row chưa có; không cần chạy seed để endpoint hoạt động. Q-15 vẫn mở nên không suy luận một template mới là mẫu thật. Dữ liệu in lấy snapshot signer occupant cho thông tin người ký, không lấy tên profile thay đổi về sau. Ngày `dd/mm/yyyy`, tiền `2.500.000 đ`, CCCD last4; không decrypt CCCD để in. Chỉ thay placeholder văn bản, không eval, không render HTML đầu vào. Chốt allowlist placeholder cùng fixture; fail kiểm soát khi gặp template không hợp lệ thay vì lộ nội dung nội bộ.

Scan chỉ được ký URL sau khi authorize và ghi audit thành công. GET thông thường không select asset/password/ciphertext. Kiểm thử payload response, audit và logger spy, gồm cả validation/DB/provider error; không đưa secret vào thông báo lỗi hoặc báo cáo test.

## Mốc BE-P3-16..19

**Ghi thu:** xác thực scope hiện tại trước khi replay, sau đó dùng `runIdempotent` trong transaction. Payload hash thứ tự cố định gồm invoiceId, method, paidAt chuẩn hóa hoặc null, note hoặc null; khi thiếu paidAt không hash timestamp mới của mỗi lần retry. Scope actor+route template+key, TTL 24h giữ nguyên helper; cùng key khác payload conflict, lỗi không lưu. Cùng key song song một payment/một audit/cùng response. Hai key khác hoặc không key song song: khóa invoice, kiểm lại UNPAID rồi INSERT Payment `{amount: total, source:'MANUAL', method, recordedById:actor.id, paidAt, note}`; trigger tự chuyển PAID. Không set PAID trước INSERT. Chỉ DEPOSIT; MONTHLY/FINAL trả `CONFLICT_STATE`. Trigger errors map đúng code; audit `payment.record` trong transaction. Inbox “Đã nhận tiền” đợi Phase 5 theo BIL-11.

**Reset:** theo Q3, hash trước transaction, recheck contract scope và user dưới cùng thứ tự khóa. Chỉ account TENANT gắn contract hợp lệ, guest-only trả 404. Update hash/mustChangePassword và revoke mọi session cùng audit `user.reset_password_by_staff` trong transaction; không ghi password vào audit hoặc replay storage. Giữ `isActive` hiện tại. Rà race với login/refresh/change-password/reset-link: các đường hiện đọc password trước transaction, vì vậy cần conditional writes/recheck hoặc khóa nhất quán để snapshot cũ không tạo session sống sót hay ghi đè mật khẩu mới. Chỉ sửa auth ở mức cần bảo đảm reset.

AUTH-T3 hiện revoke refresh sessions; access JWT chỉ có sub và guard không kiểm session. Kiểm thử rõ old refresh bị từ chối và old access không gọi API nghiệp vụ khi mustChangePassword=true. Không tuyên bố mọi access JWT bị vô hiệu tức thời: sau khi flag được xóa, JWT cũ còn hạn có thể dùng lại với thiết kế hiện hành. Reviewer cần đánh giá yêu cầu “old sessions stop working”; nếu cần session-bound access, lập thay đổi token/guard cụ thể và kiểm hồi quy, không ngầm thêm schema hay nới acceptance.

**Tenant/print/dashboard:** hoàn thiện GET scan/print, audit cho cả staff/tenant; không phát sinh route CCCD photo cho tenant. Danh sách tenant đọc cả hợp đồng cũ sau khi kết thúc/hủy theo A-16. Dashboard unpaidDeposits là query invoice DEPOSIT UNPAID; qua contract building và current responsibility theo SCOPE-04, lọc buildingId trong scope, count/items cùng predicate. Không giới hạn chỉ overdue hoặc nhầm với nhóm viewing bị hủy. Cập nhật spec 19 với shape/order cùng implementation.

## Kiểm chứng theo mốc

| Mốc | Thay đổi | Ca kiểm thử bắt buộc và điểm dừng |
|---|---|---|
| **CP-1: BE-P3-13..15** | Sign/activation, invoice DEPOSIT, helper QR và staff/tenant list/detail tối thiểu. | CON-06/07/09: scan image/PDF hợp lệ; public upload, ID_PHOTO, sai contract/folder/prefix/version/format bị từ chối; lỗi provider không đổi DB. Ký lần hai và hai sign song song trả conflict theo BE-P3-13; chỉ một signedAt/invoice/audit. Pending account có hai HOLD theo Q1: chỉ một password 10 ký tự, hai lần ký không reset lẫn nhau. GUEST đã verify và TENANT cũ giữ hash/password/locale; account khóa không tự mở. AUTH-05: password mới login được, cờ change-password và API nghiệp vụ bị chặn trước khi đổi; redirect `/doi-mat-khau` do FE hiện có xử lý, BE không trả redirect. CON-08/A-02/BIL-07/DB-B4: deposit 0 bỏ invoice, >0 đúng line/total/periodNo 0, today trước/bằng/sau startDate; biên ngày Hà Nội; renewal bỏ invoice. Rollback audit/invoice thất bại không để account active. BIL-10/G-09: bank seed và số tiền 2.500.000 từ fixture spec, content TT{id}, URL decode đúng; PAID/CANCELLED không QR. SCOPE-02/03: manager khác tòa 403, tenant khác id 404, GUEST 403, truy vấn tenant luôn có tenantId. Chạy lint/test/build và kiểm PostgreSQL offline bằng tooling sẵn có cho concurrency/constraint nếu có; báo giới hạn môi trường thật. **Dừng ở BE-P3-15 để owner kiểm chứng và commit.** |
| **CP-2: BE-P3-16..19** | Payment, reset, scan/in, dashboard và nghiệm thu toàn phần. | BIL-11/API-05: đủ 4 method, amount luôn total; client amount/source bị validation; loại invoice khác conflict; UNPAID/PAID/CANCELLED; hai payment song song một thành công/một INVOICE_NOT_UNPAID; cùng key tuần tự/song song cùng result/một payment/một audit; khác body/id cùng key conflict; key hết TTL; đổi assignment không được replay ngoài scope; paidAt bỏ trống hash ổn định. AUTH-07/T3: password mới dùng được, cờ bắt đổi, revoke session, guest-only 404, staff lock không mở, pending theo Q3 và race auth. CON-16/22: tenant khác 404, GUEST 403, link <=300 giây, một audit mỗi lần cấp link, audit fail không trả URL; print formatting/draft flag, CCCD chỉ last4, không có ciphertext/asset/password. NOTI-06: manager hiện tại, Boss fallback, inactive manager, buildingId, 5 item/count đầy đủ, PAID/CANCELLED mất khỏi unpaidDeposits. Chạy `npm run lint`, `npm run test`, `npm run build`, E2E create→upload scan→sign→pay→tenant login/change password/read own contract; reviewer uncommitted diff trước dừng BE-P3-19. |

Test unit/HTTP không mock chính unit đang kiểm; fake Prisma phải hỗ trợ transaction và đúng SELECT. Các ca tiền, concurrency và trigger phải có kiểm DB thực/offline, không chỉ fake tuần tự. Khi thêm DB map/module/projection, cập nhật exact-key/module-list/fixtures ngay cùng thay đổi theo LESSONS. Không bịa test count hoặc giá trị hash. Không thêm `.skip`/`.only` hay dependency để có kết quả đẹp.

E2E dev DB chỉ chạy ở giai đoạn nghiệm thu được giao, không thuộc lượt viết kế hoạch này. Theo LESSONS, set NODE_ENV=test trước import AppModule, giữ mail override để không gửi thư thật; command fallback hiện có tại backend là `node --env-file=.env ./node_modules/vitest/vitest.mjs run --config ./vitest.config.e2e.ts` khi script mặc định tìm sai `.env`. Không đọc/in giá trị env trong báo cáo.

Trước E2E, sửa/kiểm chính sách runner và cleanup list cùng nhau: policy hiện chỉ retire unsigned/no-invoice HOLD, nên signed/paid fixtures được bảo vệ và không thể hứa CLEANED. Giữ nguyên financial history, lưu id sở hữu trong run log; không xóa invoice/payment/audit hoặc tự xây settlement trước P3-4 chỉ để dọn thử. Nếu chưa có cách retire signed/paid an toàn trong phạm vi, báo rõ fixture được giữ/protected và trạng thái log, không đánh dấu CLEANED sai. Không để invoice UNPAID thử bị bỏ lại không được báo. Cleanup apply/DB mutation ngoài fixture run đã giao cần đúng phạm vi ủy quyền của chủ dự án.

Mỗi checkpoint cập nhật task/PROGRESS đúng kết quả thật, thêm LESSONS chỉ nếu có lỗi tốn lần thử, ghi assumptions A-02/A-22 riêng với các lựa chọn owner đã xác nhận. Báo files, output thật, giới hạn còn lại, cách kiểm tay, commit gợi ý có BE-P3/spec IDs. Không tự commit. Reviewer cuối phải kiểm riêng tiền/rollback, account takeover/lock, idempotency lưu clear và dữ liệu CCCD/scan; đưa đầy đủ report vào checkpoint.
