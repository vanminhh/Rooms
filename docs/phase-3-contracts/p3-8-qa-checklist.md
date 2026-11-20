# Phase 3 — Hồ sơ kiểm tra chung

20/11/2026. **Mã triển khai đã có; chưa nghiệm thu đóng Phase 3.** Chủ dự án cho làm liên tục, bỏ các lần dừng chờ commit giữa task. Git vẫn có các thay đổi BE-P3-27/FE-P3-01..14 đã biết; agent không stage/commit/push.

`CHỜ` là chưa có bằng chứng kiểm trực tiếp. Một bài kiểm thử HTTP hoặc source review không thay cho thao tác trên trình duyệt/DB dev. Không cộng các lượt scoped thành kết quả full.

## Cập nhật mới nhất sau xác nhận chạy lại test

Owner nói “tiếp tục đi” sau câu hỏi quyền chạy lại test có cảnh báo telemetry. Lượt mới đã chạy được:

| Kiểm tra | Output thực tế |
|---|---|
| Full backend | **113 file / 2633 test passed**,0fail,141,31s,exit0 |
| Full frontend | **981/981**,0fail/skip,163409,7733ms,exit0 |
| Frontend lint sau sửa harness | exit0,0error/0warning |
| Auth-cache strengthened fixture sau full | **1/1**,831,9686ms,exit0; không cộng vào981 và không nhận đã full rerun trên fixture cuối |
| Build source ứng dụng | Giữ BEbuild0,FEbuild0,Vite7,25s; lượt kiểm lại chỉ sửa test/docs, không đổi source ứng dụng |
| DB preflight mới | Ảnh owner: runtime 6543 **OK 1975ms**, direct 5432 **OK 2490ms**. Agent vẫn FAILED 139ms/11ms; chưa chạy E2E từ phiên agent |

Ba lỗi trong lượt P3 đầu114/117 đã được sửa ở harness đồng bộ DOM/input và focused10/10 rồi full981/981. Reviewer DUYỆT các sửa cuối; assertion private query/mutation còn trước account/scope switch đã được tăng cường và scoped1/1. Các hàng bị chặn dưới đây giữ lịch sử trước xác nhận, **không phải trạng thái full test hiện tại**.

**Còn cần owner:** kết quả E2E/cleanup trên dev và kiểm trực tiếp browser/360px/VI-EN/print theo các bảng bên dưới; chưa đóng phase. Các lệnh lint/build/full dưới đây để tái hiện, không cần chạy lại chỉ để thay kết quả full đã có.

## QA-P3-02 — sửa lỗi checker thiếu cột

Owner gửi lỗi `errorMissingColumn` khi chạy checker. Đã tái hiện cụ thể `42703: column "called_by_id" does not exist`: `prisma/schema.sql` là snapshot cũ trong khi `constraints.sql` đã có các cột/ràng buộc Phase3. Hướng dẫn trước thiếu bước đồng bộ snapshot và đã nhầm checker này với kiểm DB dev.

Đã sửa checker tự sinh SQL từ `schema.prisma` hiện tại bằng Prisma CLI cục bộ rồi áp `constraints.sql` trên **PGlite nhúng**. Child CLI dùng URL giả và `migrate diff --from-empty ... --script`; không dùng Supabase, không apply migration hoặc sửa `.env`/model/constraints/snapshot. Sinh SQL lỗi thì dừng, không fallback sang snapshot cũ. Thư mục chỉ có SQL vẫn được hỗ trợ khi được chỉ định rõ.

Lượt thực tế mới: **107/107 tình huống DB đạt,exit0**; test hồi quy loader **8/8,386ms,exit0**. Đây là bằng chứng offline, không chứng minh migration trên dev đã áp. Full BE2633/FE981 phía trên vẫn là các lượt trước sửa verifier; không cộng8 thành full backend2641.

**Xác nhận của chủ dự án 20/11/2026:** đã chạy lại lệnh checker và báo kết quả đúng như mong đợi; ghi nhận **107/107** trên máy owner. Đây là xác nhận cho riêng checker; hai lệnh E2E và cleanup cần kết quả riêng. Không cần chạy lại checker chỉ để bổ sung bằng chứng này.

## E2E dev — owner báo chạy ổn, chờ tổng kết chi tiết

Sau khối lệnh chạy lại registrations rồi workflow khi registrations thành công, owner phản hồi **“ok rồi”**. Ghi nhận xác nhận chung này, chưa có số Test Files/Tests hoặc nội dung cleanup để chép vào hồ sơ. Không yêu cầu chạy lại một lượt đã hoàn tất; có thể bổ sung các dòng tổng kết trước khi đóng phase. Bước tiếp theo là kiểm trực tiếp các bảng acceptance bên dưới.

Ảnh tiếp theo của owner cho thấy đã chạy đúng `node --env-file=.env .\scripts\e2e\verify-contract-registrations.mjs`, nhưng runner báo `database preflight failed; no E2E fixtures started`. Chưa chạy test hoặc cleanup; workflow thứ hai cũng chưa chạy vì exit code của lệnh đầu khác 0. Không ghi đây là assertion E2E thất bại hoặc E2E đã đạt. Bước chẩn đoán trên máy owner: `node --env-file=.env .\scripts\e2e\check-db.mjs`; chỉ cần output host/port/kết quả/mã lỗi, không cần nội dung `.env`.

Ảnh chẩn đoán tiếp theo của owner: DATABASE_URL SELECT 1 **OK 1975ms**, DIRECT_URL **OK 2490ms**, summary cả hai OK. Bước chẩn đoán đã xong trên máy owner, sau đó đã hướng dẫn chạy lại hai runner và nhận phản hồi nêu trên. Không suy ra nguyên nhân cụ thể của lỗi preflight trước đó.

Probe lại từ agent vẫn thất bại ở cả runtime và direct URL (139ms/11ms, exit1), nên chưa chạy E2E hoặc tạo fixture từ phiên này. Checker nhúng 107/107 giữ kết quả riêng.

## Bằng chứng trước khi owner cho chạy lại test

| Kiểm tra | Kết quả thật | Phạm vi và giới hạn |
|---|---|---|
| Backend contracts create/read/cancel/occupants, files, date | **304/304**,6 file,6,53s,exit0 | Sau API preview, tenant signature và progress; API thật qua Nest với boundary DB/provider fixtures; không phải DB dev |
| Backend i18n | **19/19**,1 file,4,12s,exit0 | Kiểm catalog/ngôn ngữ riêng; không cộng vào304 để gọi full |
| Backend build | exit0 | `npm run build` |
| Backend type check | exit0 | Scoped noEmit cho read/cancel/date specs và source được import |
| Backend lint | exit0,4 cảnh báo cũ | Các cảnh báo sort comparator ở pricing/dashboard test cũ; không phải lỗi mới |
| Frontend lint/build cuối | **Lint exit0,0error/0warning; build exit0,Vite7,25s** |759modules; build có cảnh báo chunk>500kB; không phải bằng chứng UI/browser |
| Frontend source test syntax | 15 file test/helper,exit0 ở lượt parser đã ghi | `node --check`, **không chạy kiểm thử**, không phải15 test pass |
| Frontend scoped mới | **Chưa có kết quả xác minh** | Lượt auth-cache/FE03/EX7 bị automatic approval review từ chối vì cảnh báo telemetry Visual Studio; không retry hoặc đọc log qua ngả khác. Các test mới tiếp theo được viết nhưng chưa thực thi |
| Full frontend/backend mới | **CHỜ** | Full đã bị auto-review chặn; full owner cũ879/877/2 không phải kết quả của mã mới |
| DB preflight mới | **FAILED cả hai URL**,exit1 | `SELECT1` trên runtime6543 và direct5432; chỉ in host/port/mã lỗi, không lộ credentials; không khởi tạo fixtures |
| E2E dev, cleanup-list mới | **CHỜ kết quả owner** | Agent không chạy khi preflight thất bại; không sửa `.env`, migration hoặc dữ liệu thử cũ |
| Offline DB checker mới | **107/107**,exit0 | Sau sửa loader tự sinh từ model hiện tại; độc lập với runtime/direct URL |
| Browser/print/mobile | **CHỜ** | Không có browser-control khả dụng; chưa có thao tác/screenshot/print preview mới |

Lịch sử BE-P3-27, FE-P3-01 và FE-P3-02 giữ trong từng checkpoint. Kết quả FE02 **107/107** chỉ ứng với mã ở thời điểm FE02, trước các API/client/UI bổ sung của lượt này.

## Acceptance hợp đồng và vòng tiền cọc

Hai cửa sổ/browser: MANAGER ở tòa A, TENANT của hợp đồng vừa ký. Dùng dữ liệu thử nhận biết được; giữ journal/run ID khi chạy E2E. Người kiểm ghi ngày, kết quả và ID fixture thực tế sau mỗi hàng.

| Luật | Các bước kiểm trực tiếp | Kỳ vọng từ spec | Trạng thái |
|---|---|---|---|
| CON-01/02/03, VIEW-05 | Mở lịch CONFIRMED/DONE → Chốt → xem phòng/người ký/dịch vụ → tạo; thử NEW/WON/LOST/CANCELLED | Chốt chỉ hiện ở hai trạng thái cho phép; GET phòng xác minh scope trước prefill; tạo HOLD, mã HD, phòng không còn public | CHỜ |
| CON-06/09, BIL-10, D-35 | In bản nháp, ký bản thử, upload scan → xác nhận ký tài khoản mới | Account TENANT, mật khẩu tạm hiện lần này; DEPOSIT UNPAID đúng tổng/VietQR, nội dung TT{id}; leave/reload không thấy mật khẩu cũ | CHỜ |
| CON-10, D-35 | Chưa thu cọc → nhập đủ điện/nước → nhận phòng | DEPOSIT_NOT_PAID, hợp đồng vẫn HOLD | CHỜ |
| CON-07 | Tạo/ký phòng thứ hai bằng SĐT TENANT đã có | Dùng lại account/password; không cấp lại mật khẩu | CHỜ |
| CON-07 | Nhập SĐT quản lý/chủ nhà làm người ký | PHONE_TAKEN; không chuyển vai trò nhân sự | CHỜ |
| CON-07, A-18, D-26 | Dùng GUEST đã xác minh email; đóng xác nhận rồi thử lại và xác nhận đúng người | Hiện tên/email để staff xác nhận; chỉ resend khi bấm tiếp; cùng account thành TENANT, giữ password và lịch xem; không trả mật khẩu tạm | CHỜ |
| CON-12, D-26 | Hủy HOLD dùng guest đã kích hoạt; đối chiếu HOLD tài khoản mới chưa từng kích hoạt | Account đã active giữ lịch xem/quyền hợp lệ; pending account vẫn inactive, không cấp quyền nhờ hủy | CHỜ |
| CON-07 | Dùng GUEST chưa xác minh của cùng SĐT; thử password cũ; đối chiếu nhánh verified chưa xác nhận | Password cũ của account chưa xác minh không truy cập hợp đồng; verified guest chưa được xác nhận bị PHONE_TAKEN | CHỜ |
| BIL-11, API-05, UI-04 | Ghi thu cọc: chọn phương thức → đóng dialog → mở lại và bấm xác nhận hai lần | Dialog ghi đúng tổng; đóng không POST; cùng thao tác dùng Idempotency-Key; chỉ một payment; thu lại trả INVOICE_NOT_UNPAID | CHỜ |
| CON-10/11, D-38 | Sau thu cọc: nhập điện+nước hiện tại, ngày đọc; thử lệch hơn3ngày và giảm số | Cả hai chỉ số bắt buộc, kể cả nước theo người; không yêu cầu ảnh; note khi lệch; lỗi hiển thị đúng field. Thay đồng hồ cần chỉ số cuối cũ; bỏ toggle không giữ lỗi input ẩn | CHỜ |
| CON-12, BIL-17, D-35 | Hợp đồng thứ hai cọc2.500.000 → nhập giữ1.000.000 → xem trước → xác nhận hủy | BE preview hoàn1.500.000; preview không ghi gì; cancel lưu settlement net1.500.000, giữ lịch sử payment, phòng public lại | CHỜ |
| CON-12/UI-04 | Preview trước khi có payment, thu cọc ở cửa sổ khác rồi xác nhận hủy | expectedDepositReceived không còn khớp →CONFLICT_STATE trước ghi; bắt xem lại tiền, không âm thầm hủy với refund khác | CHỜ |
| CON-12 | Hủy HOLD chưa có payment | Refund0; không giữ tiền chưa nhận; invoice UNPAID thành CANCELLED, không tạo settlement giả | CHỜ |

Gia hạn CON-17..19 và expiry CON-20/21 không thuộc nghiệm thu Phase3. Hóa đơn tháng, phí theo người/xe, webhook, quyết toán trả phòng thuộc Phase4–5; FE chỉ hiển thị dữ liệu BE.

## Riêng tư, người ở, xe, dịch vụ và ngày

| Luật | Các bước kiểm trực tiếp | Kỳ vọng | Trạng thái |
|---|---|---|---|
| CON-16, D-37, AUD-01 | Trước/sau bấm Xem ảnh CCCD; đối chiếu audit và mở lại sau5phút; thử audit failure bằng fixture được phép | Không preload; staff trong scope nhận signed URL≤300s, no-store; mỗi lượt xem commit audit trước trả link; lỗi audit không trả link; viewer xóa link khi hết hạn | CHỜ |
| CON-16, D-37 | Staff/tenant bấm scan; tenant khác gõ ID; GUEST mở hợp đồng | Staff đúng scope và own tenant xem scan có audit; tenant khác404, guest403; không trả private asset refs/full CCCD/mật khẩu cũ | CHỜ |
| CON-04/13/15/16 | Tenant detail, roommate form; thêm không CCCD/ảnh, rồi có ảnh optional; thử hợp đồng khác/đã đóng | Chỉ signer last4; roommate không có last4/ảnh đã lưu; thêm trực tiếp own HOLD/ACTIVE, ID_PHOTO signature cố định purpose, không staff purpose; capacity/lifecycle từ BE | CHỜ |
| CON-13, A-25/26 | Staff sửa người ở/ngày ra; thêm người giữa tháng | Không đổi signer flag; giữ lịch sử và capacity; chưa tính phí ở FE. Tháng áp phí theo owner/rule BE Phase4 | CHỜ |
| CON-14, A-27 | Đăng ký/sửa/ngừng xe; thử biển trùng; sửa plate khi parking service cũ đã archived; lookup active/inactive | Xe có lịch sử, đăng ký đã ngừng readonly; giữ serviceId khi không đổi; không có bộ lọc All giả; literal search/phân trang, dữ liệu trong scope | CHỜ |
| D-07, A-28, DB-B5 | Chọn/bỏ ROOM/PERSON services, giữ/bỏ archived, bỏ hết; thử khác tòa/chưa có giá | Full set PATCH gồm[]; BE xác minh scope/rate/lifecycle; không tính giá tháng ở UI | CHỜ |
| D-39, VIEW-06, NOTI-06 | Hợp đồng làm hủy viewing khác → dashboard → Đã gọi | Count từ BE; called ghi một lần và task biến mất sau refetch; unpaid deposit card dẫn hợp đồng để thu cọc | CHỜ |
| D-41, BIL-02 | Form ngày31/01/2027,3tháng | Preview BE và hợp đồng trả29/04/2027 | CHỜ |
| D-41, BIL-22 | Form ngày20/03/2027,6tháng | Preview BE và hợp đồng trả19/09/2027 | CHỜ |
| CON-22, D-36, Q-15 | Staff và tenant mở print, xem preview/PDF | Values đã điền, text được escape; chỉ last4CCCD; không header/menu/Tòa/controls; giữ banner BẢN NHÁP – chưa dùng để ký; tài liệu VI cả khi controls EN | CHỜ |
| UI-12, LOC-01/05 | Tenant đổi VI↔EN ở overview/detail/roommate lỗi validation | Labels/error client đổi, giữ input/API error; tiền/ngày không đổi, không lộ raw dictionary keys | CHỜ |
| SCOPE-02/03 | Cùng tab/query client đổi MANAGER A→B, mỗi người2tòa/selection All; đổi phạm vi cùng account | Không hiện data/password/form cũ trong render đầu của scope mới; query+mutation cache clear, local state remount; pending B không thấy contact A | CHỜ |

Lựa chọn trình bày: progress hiển thị ngày trọn đã qua, ngày cuối hợp đồng tính inclusive; BE trả số và percent nguyên làm tròn xuống, clamp0..100. Đây là hiển thị thời gian, không dùng làm hệ số tiền phòng.

## Hồi quy và responsive

| Điểm kiểm | Kỳ vọng | Trạng thái |
|---|---|---|
| Bốn vai trò đăng nhập; forced-password lần đầu | Đúng home/guard và đổi password trước dùng API khác | CHỜ lượt mới |
| Guest signup/verify, lịch xem/đổi-hủy/overlap PhaseExtra | Giữ hành vi đã nghiệm thu | CHỜ lượt mới |
| Manager tối đa2tòa; reassignment giữa hai cửa sổ | DB/BE giữ giới hạn, UI/cache theo scope mới | CHỜ lượt mới |
| Giá phòng/đơn giá/duyệt giá | Chỉ giá đã duyệt được dùng; FE không tự chốt giá | CHỜ lượt mới |
| Public ROOM-05 sau HOLD/cancel | HOLD biến khỏi public; cancel đủ điều kiện trở lại; không public payload contract/occupant/invoice | CHỜ lượt mới |
| 360px và desktop | Deposit QR/readings/form/dialog/menu không tràn; keyboard/focus dùng được, Boss10/Manager8/Tenant4 links | CHỜ |
| Cleanup | LIST first; không tự xử lý E2E cũ không journal. APPLY chỉ theo danh sách cụ thể owner chấp thuận | CHỜ kết nối DB + owner |

## Lệnh kiểm trên máy chủ dự án

Tại `D:\Rooms\Source\frontend`:

```powershell
npm run lint
if ($LASTEXITCODE -ne 0) { throw 'Frontend lint failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
npm run test:components
if ($LASTEXITCODE -ne 0) { throw 'Frontend tests failed' }
```

Tại `D:\Rooms\Source\backend`, dùng cấu hình hiện có; không thay `.env`:

```powershell
$roomsPhase3PreviousNodeEnv = $env:NODE_ENV
try {
  $env:NODE_ENV = 'test'
  npm run lint
  if ($LASTEXITCODE -ne 0) { throw 'Backend lint failed' }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Backend build failed' }
  npm test -- --maxWorkers=2
  if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed' }
  node .\prisma\check-constraints.mjs . prisma
  if ($LASTEXITCODE -ne 0) { throw 'Offline database checks failed' }
  node --env-file=.env .\scripts\e2e\check-db.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Database preflight failed' }
  node --env-file=.env .\scripts\e2e\verify-contract-registrations.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Registration E2E/cleanup verification failed' }
  node --env-file=.env .\node_modules\vitest\vitest.mjs run --config .\vitest.config.e2e.ts .\test\contracts-workflow.e2e-spec.ts --maxWorkers=1 --no-file-parallelism
  if ($LASTEXITCODE -ne 0) { throw 'Workflow E2E failed' }
  node --env-file=.env .\scripts\e2e\cleanup.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Cleanup list failed' }
} finally {
  $env:NODE_ENV = $roomsPhase3PreviousNodeEnv
}
```

Các lệnh trên là bước owner chạy và gửi output, không phải bằng chứng đã chạy. Bộ E2E toàn ứng dụng ngoài hai suite hợp đồng vẫn là gate hồi quy cần bổ sung khi chốt QA-P3-02. Q-15 mẫu hợp đồng thật còn mở; không sửa status root/spec thành Phase3done trước khi các gate được nghiệm thu.

Nếu `check-db.mjs` chỉ báo DIRECT_URL thất bại còn DATABASE_URL OK, có thể chạy riêng runner registrations và workflow để lấy bằng chứng E2E runtime; runner tự SELECT1 trước tạo fixtures. **Offline checker không cần cả hai URL** và đã đạt107/107; không coi kết quả offline hoặc E2E runtime là bằng chứng direct/migration URL đã đạt. Môi trường agent hiện cả hai URL đều thất bại.
