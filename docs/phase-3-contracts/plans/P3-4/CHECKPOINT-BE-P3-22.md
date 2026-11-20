# P3-4 · BE-P3-22 · Kiểm chứng vào ở và hủy sau thu cọc

Ngày 20/11/2026. Bắt đầu từ `7fa1c97` (BE-P3-21, owner báo đã commit, Git sạch). **BE-P3-22 đã xác minh đạt `[x]`; P3-4 hoàn tất kiểm chứng, chờ owner commit.** Owner đã cung cấp E2E dev và cleanup list thành công cho run `20261120T1215-KOQK`. Chưa bắt đầu BE-P3-23. Owner tự commit; agent không stage/commit.

## Kết quả dev đã xác minh từ owner

Owner gửi output ngày 20/11/2026:

```text
BE-P3-22 20261120T1215-KOQK: outer rollback verified; no fixture rows retained (sequences may advance)
Test Files  1 passed (1)
     Tests  1 passed (1)
  Start at  12:15:36
  Duration  114.38s (transform 652ms, setup 0ms, import 1.08s, tests 113.13s, environment 0ms)
```

Test file báo 113130 ms, test case 113128 ms. Một test này bao gồm cả ký → thu cọc → vào ở và ký → thu cọc → hủy, cùng privacy/idempotency/audit rollback và readback 15 nhóm fixture sau outer rollback. Không cộng thành hai test hoặc nhận output do agent tự chạy trên dev.

Cleanup tiếp theo đã trả danh sách với `Nhật ký (không có nhật ký) · CLEANED`, chỉ còn các bản ghi unlogged E2E ngày 03–06/11 đã biết; không có run `20261120T1215-KOQK`. Cùng với assertion rollback của workflow, đã đạt tiêu chí **sạch cho lượt thử này**. Dòng CLEANED tổng hợp không có nghĩa các bản ghi cũ đã bị xóa hoặc DB toàn cục không còn dữ liệu E2E. Không chạy `--apply`, không sửa/xóa các dòng cũ, không để lại nghĩa vụ cọc giả của lượt mới.

Kết quả này khép phần chờ kết nối/workflow/cleanup của BE-P3-22. Lượt cập nhật chỉ sửa tài liệu, không chạy lại test hoặc ghi DB. Thời điểm test thành công sau runner chờ kết nối dài hơn không đủ tự chứng minh timeout là căn nguyên duy nhất; không suy rằng DIRECT_URL hoặc migration status đã được kiểm lại.

## Thay đổi

Mở rộng `Source/backend/test/contracts-workflow.e2e-spec.ts` từ workflow BE-P3-19 thành một test có hai nhánh tuần tự qua HTTP Nest thật:

- Ký → thu cọc → vào ở: chưa trả cọc bị `DEPOSIT_NOT_PAID`, thiếu nước bị validation, đủ hai chỉ số tạo ACTIVE với movedInAt và đúng một audit. Khách cũ chốt điện 1284, khách mới vào ở tại 1290, cùng ngày có closing 1350; cả ba mốc được lưu riêng và lịch sử khách cũ giữ nguyên. Chênh lệch của khách mới là 60, chỉ kiểm phép tính theo baseline, chưa kiểm bộ lập hóa đơn tháng Phase 4.
- Ký → thu cọc → hủy HOLD: dùng lại tài khoản tenant đã kích hoạt, không đổi mật khẩu/khóa tài khoản. Cọc 2.500.000, giữ 1.000.000, settlement net 1.500.000; các khoản khác 0, finalInvoiceId/refundPaidAt null. Lịch sử invoice/payment PAID nguyên vẹn, phòng đáp ứng publicRoomWhere trở lại, token cũ vẫn đọc cả hợp đồng ACTIVE và CANCELLED.
- Gọi AuditService thật rồi ném lỗi sau INSERT audit; cờ đặt ngay sau await INSERT xác nhận đã tới đúng điểm lỗi. Savepoint rollback trả về HOLD, không settlement/audit cancel/cache lỗi; retry cùng key thành công. Sau thành công replay chỉ có một settlement/audit, đổi payload hoặc gọi lại không key trả 409. Manager ngoài scope bị chặn.
- Sau outer rollback: kiểm 15 nhóm dữ liệu bằng 0, gồm meters theo room hoặc contract, settlement theo contract, payment theo invoice. Bank/template được trả về giá trị cũ. Không để lại nghĩa vụ hoàn cọc giả.

Không sửa product code, schema, migration, dependency, `.env` hoặc chức năng hoàn tiền thực tế. Cập nhật task/progress, ghi commit BE-P3-21 trong checkpoint cũ và bài học exit code PowerShell. Sau khi owner gửi lỗi kết nối dev, bổ sung `Source/backend/scripts/e2e/check-db.mjs`: chỉ chạy SELECT 1 riêng bằng hai URL cấu hình nguyên bản, không ghi DB, không in credential/full URL/error thô; luôn disconnect. Phát hiện biến môi trường kế thừa khác `.env` bằng phép so sánh giá trị, không in hai giá trị.

## Cập nhật lỗi kết nối từ máy owner

Các bước dưới đây là lịch sử xử lý trước output dev thành công ở trên; các phần từng ghi chờ owner đã được khép bởi kết quả mới.

Ảnh tiếp theo của owner: chạy lại workflow lúc 12:06:23 vẫn `Test Files 1 failed (1)`, `Tests 1 failed (1)`, test 5021 ms, duration 6,55 giây; lỗi khởi tạo trước callback tại dòng 83 như cũ. Guard sau đó không chạy cleanup. Việc DATABASE_URL probe từng thành công không chứng minh kết nối ở lượt mới ổn định; không tiếp tục yêu cầu chạy lại nguyên lệnh chưa thay đổi.

Giả thuyết đang kiểm: connection timeout mặc định quá ngắn với đường kết nối dev không ổn định. Prisma 6 mặc định `connect_timeout=5`, khác với timeout/maxWait của interactive transaction. [Prisma 6 PostgreSQL arguments](https://www.prisma.io/docs/orm/v6/overview/databases/postgresql#arguments) và [Supabase Prisma troubleshooting](https://supabase.com/docs/guides/database/prisma/prisma-troubleshooting) xác nhận tham số và đề xuất thử `connect_timeout=30` cho lỗi không tới DB. Mốc lỗi khoảng 5 giây và probe OK trước đó phù hợp giả thuyết, chưa chứng minh căn nguyên là timeout/cold start hoặc DB đã khỏe.

Đã bổ sung `scripts/e2e/verify-contract-workflow.mjs`: clone môi trường cho process con, chỉ thêm `connect_timeout=30` nếu DATABASE_URL chưa có tham số đó; giữ nguyên timeout đã cấu hình kể cả 0/5/60. URL/auth/host/port/database và tham số hiện có không đổi nghĩa, DIRECT_URL giữ nguyên; không ghi `.env` hoặc thay PrismaService/transaction timeout. Chạy đúng workflow bằng Node và mảng arguments `shell:false`, một worker; chỉ khi E2E exit 0 mới chạy cleanup list bằng cùng môi trường. Giữ mã lỗi Vitest/cleanup, signal/start failure trả lỗi và không chạy cleanup tiếp. Không retry hay tự đổi cổng.

Lệnh tiếp theo từ `Source/backend`:

```powershell
node --env-file=.env .\scripts\e2e\verify-contract-workflow.mjs
```

Đã kiểm cú pháp và 8/8 ca trực tiếp trên wrapper thật với edge spawn thay thế: thêm timeout/giữ nguyên input; giữ timeout explicit 0/5/60; URL thiếu/sai không lộ private input; success gọi đúng cleanup list dùng cùng child env; workflow fail giữ exit/không cleanup; cleanup fail giữ exit; signal và lỗi spawn đều thất bại. Scoped lint 0 warning/0 error (445 ms). Các ca này không kết nối DB, không chạy child test hay cleanup thật và không cộng vào 2297 test full backend. CLI entrypoint với input sai trả exit 1, không lộ sentinel và không chạy workflow. E2E business source giữ nguyên từ lượt nhúng đạt 1/1 trước đó; chưa nhận kết quả dev cho wrapper mới.

Review read-only đầy đủ cho runner bổ sung:

> **KẾT LUẬN: DUYỆT**
>
> Phạm vi: `scripts/e2e/verify-contract-workflow.mjs`. Không có lỗi chặn.
>
> - Sao chép môi trường; chỉ thêm timeout khi thiếu, giữ giá trị `0/5/60` đã cấu hình và nguyên `DIRECT_URL`.
> - Không in URL/credentials/lỗi gốc; chạy Node bằng arguments cố định, `shell:false`.
> - Truyền mã thoát; test lỗi hoặc bị signal thì bỏ qua cleanup. Cleanup chỉ chạy list, cùng môi trường; lỗi cleanup trả mã thất bại.
> - Không sửa `.env`, mã sản phẩm, migration hoặc tự động retry.
>
> Review chỉ đọc, không chạy mạng. Kết quả kiểm tra helper chưa chứng minh E2E DB dev đạt; vẫn chờ owner chạy wrapper.

Ảnh diagnostic trước lượt 12:06:23: `DATABASE_URL` cổng 6543 `OK`, `ms:7765`; `DIRECT_URL` cổng 5432 `FAILED`, code `CONNECTION_CHECK_FAILED`, `ms:5011`. Không có warning shell env khác dotenv trong ảnh. Đã chứng minh một truy vấn runtime kết nối được tại thời điểm probe, không chứng minh DIRECT_URL đã hoạt động hoặc workflow/cleanup đạt. E2E và cleanup dùng runtime DATABASE_URL, không chạy migration, nên DIRECT_URL lỗi không phải điều kiện chặn riêng của lượt E2E này. Ở lượt đó đã yêu cầu chạy lại lệnh gốc và chưa sửa timeout/env; sau khi lượt 12:06:23 tiếp tục lỗi mới bổ sung runner kiểm giả thuyết timeout nêu trên. Không kết luận timeout/cold start là nguyên nhân đã xác minh.

20/11/2026, owner chạy đúng khối PowerShell đã hướng dẫn trước khi thêm runner mới: `Test Files 1 failed (1)`, `Tests 1 failed (1)`, bắt đầu 11:50:46, duration 6,35 giây, test 5,03 giây. Prisma báo không tới được Supabase:6543 ngay tại outer `$transaction` dòng 83, trước callback tạo fixture. Wrapper lần này throw đúng `Workflow E2E failed (1)`; cleanup **chưa chạy** vì guard dừng sau E2E thất bại. Đây chưa phải lỗi assertion move-in/cancel, và không có fixture được ghi bởi lượt này.

Đã kiểm an toàn trên cấu hình local: DATABASE_URL dùng transaction pooler 6543 với pgbouncer=true; DIRECT_URL dùng cùng host/user/password/database qua session pooler 5432. Đây là cấu trúc dự án yêu cầu, không kết luận cổng 6543 sai chỉ vì migration trước đây dùng 5432 thành công. DNS trong môi trường agent đã resolve được; TCP tới cả hai endpoint cấu hình bị EACCES của môi trường hạn chế, nên không dùng kết quả đó kết luận firewall hoặc DB máy owner.

Chạy chẩn đoán trên máy owner, từ `Source/backend`:

```powershell
node --env-file=.env .\scripts\e2e\check-db.mjs
```

Lệnh giữ nguyên timeout/URL và chỉ in nhãn, host/port, thời gian và mã lỗi Prisma an toàn. Không thay DATABASE_URL bằng DIRECT_URL cho ứng dụng và không sửa `.env`. Nếu DATABASE_URL fail/DIRECT_URL OK, cần kiểm đường transaction pooler/runtime; nếu cả hai fail, kiểm endpoint từ Connect dialog, trạng thái dự án, mạng và error code; khi DATABASE_URL OK, chạy lại workflow để phân biệt lỗi kết nối tạm thời với lỗi trong giao dịch, kể cả DIRECT_URL vẫn fail. Script tổng hợp trả exit 1 nếu một URL fail, nên phải đọc từng nhãn thay vì dùng exit code diagnostic làm điều kiện chạy E2E. Không tự suy rằng password sai, project paused hoặc migration thiếu từ P1001.

Đã kiểm `node --check` và hai ca thiếu URL/URL sai cấu trúc: exit 1 đúng dự kiến, không in sentinel mật khẩu giả. Đây là kiểm tra script chẩn đoán, không cộng vào full backend hoặc coi là kết nối dev thành công.

Scoped lint helper đạt 0 warning/0 error (293 ms); diff check đạt. Reviewer read-only của phần bổ sung kết luận đầy đủ:

> **DUYỆT — không có blocker.**
>
> Helper dùng đúng API Prisma 6, giữ nguyên URL và tham số, chỉ chạy `SELECT 1`, đóng từng client trong `finally`. Không ghi DB/file, không in credentials, URL đầy đủ hay lỗi thô; mã lỗi được giới hạn `P####`. Kết quả tách riêng hai URL nên không đánh đồng migration thành công với runtime thành công. Không chạy thêm kết nối.

## Kết quả thực tế

| Phép kiểm | Kết quả |
|---|---|
| Full backend | `Test Files 108 passed (108)`, `Tests 2297 passed (2297)`, 129,25 giây, bắt đầu 11:25:15; exit 0 |
| Lint mới nhất sau hai script | `Found 4 warnings and 0 errors.`, 251 file, 1,1 giây; exit 0. Bốn warning sort cũ tại dashboard.service.spec.ts và pricing.list.spec.ts |
| Build | `npm run build` → `nest build`, exit 0 |
| Scoped noEmit | Workflow E2E và các import của nó; exit 0, không diagnostic |
| E2E cục bộ cuối | HTTP TCP nguyên bản + Prisma + PostgreSQL nhúng PGlite, nạp đủ 10 migration thực: `Test Files 1 passed (1)`, `Tests 1 passed (1)`, 5,44 giây, bắt đầu 11:33:14; exit 0 |
| E2E DB dev mới nhất | Output owner: `Test Files 1 passed (1)`, `Tests 1 passed (1)`, start 12:15:36, total 114,38 giây, test 113130 ms; run `20261120T1215-KOQK` rollback/readback sạch. Các lỗi kết nối trước đó lưu ở lịch sử, không còn chặn nghiệm thu |
| Cleanup list DB dev mới nhất | Output owner: `(không có nhật ký) · CLEANED`, không có fixture run mới; chỉ báo unlogged cũ 03–06/11. Đạt scoped cleanup, không khẳng định dữ liệu cũ đã được xử lý |
| Reviewer | DUYỆT mã, không có finding chặn; đầy đủ báo cáo bên dưới. Bằng chứng dev mới đã khép điều kiện từng chờ trong report |
| Diff | `git diff --check` đạt |

Full backend chạy bằng `node .\node_modules\vitest\vitest.mjs run --maxWorkers=2`, tương đương runner của `npm run test` với giới hạn worker. Không chạy lại full suite sau thay đổi chỉ ở E2E ngoài unit include; không nhận kết quả cũ của owner như kết quả mới. Các lần E2E nhúng trước 5,12/5,43 giây là chẩn đoán/trước bổ sung cờ audit; dòng 5,44 giây là source cuối.

Lượt gọi dev dùng wrapper PowerShell đã vô tình trả exit 0 sau khi phục hồi NODE_ENV, trong khi Vitest ghi rõ 1 test failed. Không coi exit wrapper là pass; bảng ghi đúng thất bại. Lệnh chạy tiếp bên dưới kiểm exit code ngay sau Node. Lượt dev chưa vào callback nên chưa tạo fixture; không suy đoán migration đã/ chưa apply từ lỗi mạng, không yêu cầu duyệt lại bước BE-P3-20 owner đã nghiệm thu.

Runner PGlite và tsconfig tạm nằm dưới ignored `Source/backend/node_modules/.cache/rooms-p3-22/`, chỉ là kiểm chứng phụ của phiên, không phải dependency hoặc test runner mới của dự án. Nó không đọc `.env`, nạp chuỗi 10 migration vào DB cô lập và seed một Boss giả. Không dùng snapshot schema cũ hoặc fake HTTP transport. Chưa chạy cleanup.mjs trên DB nhúng như bằng chứng dev; cleanup 15 nhóm là assertion của workflow.

## Lệnh kiểm lại và commit

Đã kiểm đạt trên máy owner, không cần chạy lại để chốt BE-P3-22. Khi cần hồi quy sau thay đổi mới, từ `D:\Rooms\Source\backend` dùng runner dưới đây. Runner đặt NODE_ENV=test và connect_timeout=30 mặc định chỉ trong child env của Vitest và cleanup, không sửa file env hoặc môi trường shell cha:

```powershell
node --env-file=.env .\scripts\e2e\verify-contract-workflow.mjs
```

Đạt khi một test workflow pass (trong đó đã chạy cả hai luồng), có log `BE-P3-22 <runId>: outer rollback verified; no fixture rows retained (sequences may advance)`, và cleanup list không có fixture của runId đó. Các mục unlogged E2E cũ 03–06/11 đã được báo riêng ở BE-P3-19, không cần xóa để chạy test này; không dùng `--apply` hoặc hard-delete lịch sử có tiền. Workflow rollback không tạo journal cần dọn, nên dùng cả assertion 15 nhóm và list/readback thay vì chỉ dựa vào “không có nhật ký”.

Runner chỉ chạy một test workflow BE-P3-19/22, không chạy toàn bộ E2E. File hồi quy BE-P3-12 `test/contracts.e2e-spec.ts` có 4 test và journal cleanup riêng, không cộng vào một test workflow đã báo ở trên và không phải điều kiện mới để nghiệm thu BE-P3-22.

Output dev đã đạt; task `[x]`, P3-4 `chờ commit`. Owner commit trước BE-P3-23. Gợi ý commit: `test(contracts): verify paid move-in and cancellation workflows (BE-P3-22, CON-10..12, MTR-02, BIL-17)`.

## Giới hạn và [ASSUMPTION]

Không thêm giả định nghiệp vụ mới. Giữ A-02 (hạn invoice cọc và chặn move-in chưa thu), A-16 (tenant giữ role/quyền đọc lịch sử), A-22 (kích hoạt lần đầu và mật khẩu dùng lại) và A-23 (reset không kích hoạt pending account). A-23 không phải nhánh mới được E2E này chứng minh. A-24 là giới hạn đã ghi của BE-P3-20 khi có nhiều giá trị và thay đồng hồ cùng ngày: chưa có owner xác nhận thành chính sách nghiệp vụ; test này dùng đồng hồ không thay, không mở rộng kết luận.

Một transaction/connection thật, savepoint theo request, chạy tuần tự; không chứng minh commit độc lập từng request hoặc cạnh tranh nhiều connection. Sequence PostgreSQL có thể tăng dù rollback. Mailer/provider metadata được thay thế có chủ đích, không gửi email hoặc upload thật. Không phát hành invoice tháng hoặc thực trả tiền hoàn, không ghi refundPaidAt. Outer timeout 420 giây nhỏ hơn test/hook timeout 600 giây.

## Báo cáo reviewer đầy đủ

Báo cáo nguyên văn từ reviewer read-only trên diff và các nguồn đã nêu; reviewer có sẵn trong phiên, không tự nhận model Sonnet khác catalog:

> **DUYỆT về mã; chưa đủ điều kiện nghiệm thu BE-P3-22 trên DB dev.** Không phát hiện lỗi chặn trong các thay đổi đã rà soát. Đây là phê duyệt mã nguồn, không thay thế kết quả E2E dev và cleanup bắt buộc.
>
> Phạm vi review: diff của `Source/backend/test/contracts-workflow.e2e-spec.ts`, tài liệu tiến độ/task, cùng schema, constraints, rollback facade, service move-in/cancel/sign, xác minh metadata Cloudinary và các yêu cầu CON-10..12, MTR-02, BIL-17, API-05.
>
> Các điểm đã xác minh:
>
> - Fixture hợp đồng ENDED đáp ứng schema và trigger: người thuê có role TENANT, thời hạn hợp lệ, không chiếm partial unique của HOLD/ACTIVE. Mã `E2EOLD${room.id}` nằm trong giới hạn 20 ký tự với PostgreSQL Int.
> - Move-in kiểm tra chưa trả cọc → `409 DEPOSIT_NOT_PAID`, thiếu nước → `400`, thành công → ACTIVE và có `movedInAt`. Hai opening thuộc hợp đồng mới; dữ liệu khách cũ giữ nguyên.
> - Các mốc điện 1284, 1290, 1350 tồn tại riêng cùng ngày. Kết quả 60 là phép tính từ baseline của khách mới; chú thích không nhận là bằng chứng của bộ tính hóa đơn Phase 4.
> - Nhánh hủy dùng cùng tài khoản đã kích hoạt, không trả lại temporary password. Settlement đúng cọc 2.500.000, giữ 1.000.000, hoàn 1.500.000; các khoản khác bằng 0, `refundPaidAt` và `finalInvoiceId` null.
> - Invoice/payment PAID giữ nguyên sau lỗi audit và sau hủy thành công. Retry cùng key trả cùng kết quả; đổi body hoặc gọi lại không key trả 409. Chỉ còn một settlement và một audit thành công.
> - Tài khoản người thuê không đổi; token hiện tại vẫn đọc được hợp đồng ACTIVE và CANCELLED. Room hủy đáp ứng predicate public. E2E kiểm tra manager ngoài phạm vi; trường hợp mất scope trước replay đã có test riêng tại `contracts.cancel.http.spec.ts:440`.
> - Hook audit gọi service thật rồi mới ném lỗi, được khôi phục trong `finally`. Các route transaction chạy tuần tự qua savepoint.
> - Metadata của scan thứ hai khớp folder, publicId, version, format, resource type và authenticated type. Không upload thật hoặc gửi email thật.
> - Sau outer rollback, cleanup đếm meter theo room **hoặc** contract, settlement theo contract; payment theo invoice. Có kiểm tra 15 nhóm dữ liệu bằng 0 và khôi phục giá trị bank/template. Không có thao tác commit fixture PAID.
>
> Một cải thiện nhỏ, không chặn: đặt cờ ngay sau `await realAudit(...args)` rồi assert cờ sau response 500. Điều này chứng minh rõ request đã vượt qua INSERT audit trước lỗi mô phỏng, thay vì chỉ suy từ HTTP 500 và dữ liệu rollback.
>
> Kết quả kiểm tra do phiên chính cung cấp:
>
> | Kiểm tra | Kết quả |
> |---|---|
> | Full unit | 108 file, 2297 test pass; 129,25 giây |
> | Lint | 0 lỗi, 4 warning cũ; 249 file |
> | Build | Exit 0 |
> | Workflow HTTP trên PostgreSQL nhúng, đủ 10 migration | 1/1 pass; 5,43 giây |
> | E2E DB dev | Thất bại trước callback outer transaction: không kết nối được Supabase cổng 6543 |
> | Cleanup list DB dev | Exit 1 do cùng lỗi kết nối |
> | Scoped typecheck | Đang chạy tại thời điểm báo cáo |
>
> **Phần còn chặn nghiệm thu:** chưa có workflow E2E và cleanup list thành công trên DB dev. Lần chạy dev hiện tại chưa vào callback tạo fixture nên không ghi fixture dev. Kết quả PostgreSQL nhúng chỉ là kiểm chứng cục bộ; không được dùng để đánh dấu BE-P3-22 hoàn tất.
>
> Giới hạn/giả định cần ghi checkpoint: một connection, savepoint theo request, không chứng minh commit độc lập hay concurrency nhiều connection; PostgreSQL sequence có thể tăng dù rollback; metadata provider được thay thế có chủ đích; phép tính usage không bao gồm phát hành hóa đơn hay thực trả tiền hoàn. Giữ BE-P3-22 `[!]` đến khi có output dev và cleanup đạt.

Sau report: đã thêm cờ `cancellationAuditInserted` đúng vị trí reviewer đề nghị, assert true sau response 500; E2E nhúng cuối đạt 1/1 trong 5,44 giây. Scoped noEmit đã đạt, không diagnostic. Không còn finding mã nguồn cần sửa. Sau đó owner cung cấp E2E dev 1/1 và cleanup đạt cho `20261120T1215-KOQK`, khép điều kiện dev từng chờ trong báo cáo; xem output ở đầu checkpoint.
