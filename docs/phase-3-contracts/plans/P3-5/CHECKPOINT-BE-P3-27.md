# BE-P3-27 · Owner đã nghiệm thu; giữ giới hạn kiểm chứng

20/11/2026. Owner xác nhận BE-P3-26 đã commit; Git sạch **`b904ece`** trước task. Mã QA đã chuẩn bị và reviewer DUYỆT sau sửa P2 và bổ sung race hai connection. Sau báo cáo bị chặn bên dưới, owner chỉ thị **“chốt BE p3 27 làm tiếp”**: ghi nhận nghiệm thu BE-P3-27/P3-5 và chuyển FE-P3-01. Git vẫn `b904ece`, bộ BE-P3-27 chưa commit tại lúc chuyển phần; owner đã yêu cầu tiếp tục với trạng thái này. Không có full-backend/dev-E2E output mới, không chuyển các giới hạn dưới đây thành kết quả pass.

## Giới hạn kiểm chứng của phiên QA

1. **Full backend:** lệnh full bị automatic approval review từ chối với lý do telemetry tới `dc.services.visualstudio.com` có thể xuất metadata/đường dẫn/lỗi test. Trước lượt này đã thêm guard Node trong cache, self-test chặn TCP hostname/IP, DNS, UDP, fetch ngoài, cho loopback HTTP và xác nhận kế thừa ở Node child; full config chỉ thêm assertion guard cho worker, không mock/bỏ test. Tuy vậy lượt full vẫn bị từ chối khi nhận kết quả; không có JSON full hoặc exit code xác minh. Không retry/bypass, không dùng các số baseline/partial để ghi full pass. Guard trong Node không là firewall của hệ điều hành hoặc bằng chứng kiểm soát telemetry của host.
2. **DB dev:** DNS của host cấu hình phân giải được, nhưng Prisma không tới được runtime server. Check-db báo DATABASE_URL cổng6543 FAILED và DIRECT_URL cổng5432 FAILED; lỗi PrismaClientInitializationError/Can't reach database server. Runner mới kiểm runtime DATABASE_URL với connect_timeout fallback30s khi chưa cấu hình và trả exit1: `database preflight failed; no E2E fixtures started`. Không khởi động fixture trên dev DB. DIRECT_URL không phải điều kiện để chạy E2E runtime, không triển khai migration trong task này.

## Owner chạy trên máy dự án

Tại `D:\Rooms\Source\backend`, dùng `.env` hiện có. Block sau tắt cron trong tiến trình test, giữ trạng thái NODE_ENV cũ, dừng nếu full unit lỗi rồi mới chạy E2E:

```powershell
$roomsP327PreviousNodeEnv = $env:NODE_ENV
try {
  $env:NODE_ENV = 'test'
  npm test -- --maxWorkers=2
  if ($LASTEXITCODE -ne 0) { throw "Backend tests failed ($LASTEXITCODE)" }
  node --env-file=.env .\scripts\e2e\verify-contract-registrations.mjs
  if ($LASTEXITCODE -ne 0) { throw "Registration E2E or cleanup verification failed ($LASTEXITCODE)" }
} finally {
  $env:NODE_ENV = $roomsP327PreviousNodeEnv
}
```

Khi bổ sung bằng chứng chạy trên máy dự án, gửi phần **Test Files / Tests / Duration**, dòng **registrations outer rollback verified** và **CLEANED** của run E2E mới. Không cần dán toàn bộ danh sách unlogged cũ. Owner đã chốt task theo xác nhận riêng; chưa có các output này để báo full backend/dev E2E đạt. Xác nhận nghiệm thu hoặc commit không tự tạo ra số liệu kiểm thử.

Runner chỉ SELECT1 preflight, đặt connect_timeout30s trong child khi đang thiếu, giữ giá trị đã cấu hình, tắt gửi mail. Nó chạy hai file với một worker và không file parallelism, rồi gọi cleanup CLI ở **LIST ONLY**, không `--apply` hoặc xử lý unlogged rows. Không sửa `.env`.

## Mã đã chuẩn bị

| Tệp | Thay đổi |
|---|---|
| `Source/backend/test/contracts-registrations.e2e-spec.ts` | Workflow thật qua Nest/auth/Prisma: người ở, giới hạn/ngày ra, tenant self-add, CCCD encrypted/private photo/audit, dịch vụ, xe/ngừng/đăng ký lại, hủy HOLD, lỗi audit và outer rollback |
| `Source/backend/test/contracts.e2e-spec.ts` | Hai Prisma client/Nest app riêng, mỗi pool một connection; hai transaction phải cùng tới barrier trước INSERT với hai `pg_backend_pid()` khác nhau. Cùng biển số chuẩn hóa chỉ một 201/một400 và một vehicle/audit; hủy hai HOLD bằng route thật rồi cleanup mềm có bảo vệ |
| `Source/backend/scripts/e2e/run.ts` | Biển số synthetic E2 tối đa14 ký tự và kiểm chưa active; contract fixture phải chứng minh cả vehicle prefix/building/service thuộc run, stop đúng xe fixture; linkedRows bảo vệ service qua cả membership và vehicle, kể cả lịch sử |
| `Source/backend/scripts/e2e/run.spec.ts` | Thêm unique plate/cleanup protection tests; sửa cách khai báo fixture/spy để scoped noEmit giữ đúng Prisma delegate types |
| `Source/backend/scripts/e2e/verify-contract-registrations.mjs` | Preflight + sequential E2E + LIST-only cleanup, không lộ URL/credential trong lỗi |
| `Source/backend/scripts/e2e/verify-contract-registrations.spec.ts` | Kiểm env chỉ áp child, timeout cấu hình, không khởi động khi preflight lỗi, không cleanup-list sau E2E lỗi |
| Tài liệu | Task/PROGRESS/plan/checkpoint này, ghi nhận commit BE-P3-26, LESSONS |

Không đổi production API của BE-P3-23..26, schema/migration, dependency hoặc `.env`. Không stage/commit/push. Fixture chính dùng outer rollback, chỉ sequence có thể tăng. Race độc lập phải commit route transactions mới kiểm được unique-index loser; các fixture đó được ghi journal và retire mềm, giữ lịch sử. Không hard-delete hoặc tác động dữ liệu ngoài run.

## Kết quả thực tế phiên này

| Kiểm tra | Kết quả |
|---|---|
| Helper + runner ban đầu | 46/46, 2 file,0,636s,start16:03:47; trước sửa P2 |
| Sau sửa P2: helper/runner/rollback-facade | **58/58**,3 file,**1,68s**,start**16:19:16**,exit0 |
| Trong 58 | run.spec41, runner7, rollback-prisma10 |
| Workflow E2E replay trên PostgreSQL nhúng | **1/1**,7,91s,start**16:07:26**,run`20261120T1607-DVO5`,exit0; không phải dev DB |
| SQL cleanup helper thật sau P2 | **3/3**,10 migration có sẵn trên DB nhúng cô lập,exit0 |
| `npm run build` | exit0 |
| Lint cuối sau bổ sung race hai connection | 0 lỗi,4 warning sort cũ;268 file,1,7s,exit0 |
| Scoped noEmit E2E/helpers/runner sau bổ sung race hai connection | exit0 |
| `git diff --check` | đạt |
| Review | DUYỆT mã sau sửa P2; chưa đủ đóng task |
| Full backend | bị auto-review chặn, không có kết quả xác minh |
| Dev E2E và race hai transaction | chưa chạy; runtime preflight exit1 trước fixture |

58 không cộng với46 vì bộ sau bao gồm bộ đầu và thêm các ca mới. Không coi642/572 từ các checkpoint trước là kết quả full hiện tại. Không có skip/only trong test mới.

Lệnh scoped cuối (guard và config cache chỉ phục vụ phiên QA, không yêu cầu ở máy owner):

```powershell
node --require .\node_modules\.cache\rooms-p3-27\loopback-only.cjs .\node_modules\vitest\vitest.mjs run scripts/e2e/run.spec.ts scripts/e2e/verify-contract-registrations.spec.ts test/fixtures/rollback-prisma.spec.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=.\node_modules\.cache\rooms-p3-27\focused-final.json
```

Output thực:

```text
scripts/e2e/run.spec.ts (41 tests)
scripts/e2e/verify-contract-registrations.spec.ts (7 tests)
test/fixtures/rollback-prisma.spec.ts (10 tests)
Test Files  3 passed (3)
Tests       58 passed (58)
Start at    16:19:16
Duration    1.68s
```

Replay workflow dùng cache config thay **Prisma backend** bằng actual PrismaClient/adapter PostgreSQL nhúng với 10 migration hiện có và một Boss fixture. Controller/service/guards/audit/SQL/constraints chạy thật; provider metadata/mail giả lập như trong E2E source. Không đọc `.env` hoặc chạm dev DB, không tạo journal chứa ID nhúng tại thư mục E2E dev. Output:

```text
BE-P3-27 20261120T1607-DVO5: registrations outer rollback verified; no fixture rows retained (sequences may advance)
Test Files  1 passed (1)
Tests       1 passed (1)
Duration    7.91s
```

SQL cleanup helper thực (`node_modules/.cache/rooms-p3-27/cleanup-postgres-smoke.mjs`):

```text
PASS 1: proven owned synthetic registrations retire softly; contract, vehicle and catalog history remain
PASS 2: ordinary plate prevents fixture retirement and protects its parking service and linked resources
PASS 3: even an inactive historical vehicle on an outside contract protects a logged parking service
PASS 3/3; 10 existing migrations; isolated embedded PostgreSQL only
```

Runtime runner dev thực:

```text
BE-P3-27: connect_timeout=30s when unset; child processes only; mail delivery disabled.
BE-P3-27: database preflight failed; no E2E fixtures started. Check runtime DB access.
exit 1
```

## Privacy, assumptions và giới hạn

Workflow dùng khóa JWT/CCCD/Cloudinary test trong tiến trình rồi khôi phục; Boss thực chỉ đọc ID làm FK. Metadata ảnh fake, không upload/download ảnh thật; mail override. Mỗi response/log/audit được kiểm private keys và full synthetic CCCD/hash/ciphertext bằng boolean để lỗi assertion không in nguyên giá trị. Signed-photo URLs chỉ ở staff view đã được audit, TTL300s; tenant detail không có private references.

Giữ các `[ASSUMPTION]` đã triển khai: **A-25** người ở chỉ sửa HOLD/ACTIVE; **A-26** capacity theo giao nhau ngày inclusive, gồm HOLD và guard room/move-in; **A-27** ngày đăng ký/ngừng xe mặc định hôm nay, không tương lai, giữ interval cũ; **A-28** dịch vụ PATCH full set/empty clear/retained archived/no-op/read history. Không suy ra owner đã trả lời riêng từng chi tiết từ các commit, không mở lại chúng để chặn phần code QA. Các câu trả lời Q-P3-18..22 vẫn giữ nguyên; tính hóa đơn tháng thuộc Phase4.

Outer-rollback/adapter một connection không chứng minh independent commits hoặc tranh chấp khóa nhiều connection. Source race dùng hai client/Nest app và barrier trước INSERT, kiểm hai backend PID khác nhau để không nhầm hai request bị pool một connection tuần tự hóa là concurrency. Chỉ trì hoãn điểm ghi DB thật, không giả kết quả truy vấn hoặc service. Barrier timeout45s, transaction120s, test300s; giữ nguyên `.env` và chỉ áp connection_limit=1 cho từng client của ca này. Ca đó chưa chạy trên dev; nếu server không cấp hai backend đồng thời thì phải báo fail thay vì ghi concurrency pass. Chưa kiểm delivery/expiry trên Cloudinary thật. Full/DB dev đều cần bằng chứng riêng trước khi đóng BE-P3-27.

## Báo cáo reviewer đầy đủ

**DUYỆT mã BE-P3-27 sau sửa P2; chưa đủ điều kiện đóng BE-P3-27/P3-5.**

Reviewer: GPT của phiên Codex, model kế thừa; không chạy Sonnet 5. Review độc lập, chỉ đọc; không sửa file, chạy test, gọi mạng, migration hoặc commit.

1. **P2 về bảo vệ parking service — đã sửa.** Ban đầu `linkedRows` chỉ xét `contract_services`, nên có thể tắt dịch vụ VEHICLE đang được xe của hợp đồng protected sử dụng. Bản sửa tại `scripts/e2e/run.ts:281` bổ sung truy vấn `vehicle.serviceId` với `protectedContract`, giữ cả xe lịch sử do không lọc `isActive`. Hai ca mới kiểm tra service không bị tắt và chỉ loại trừ các hợp đồng đã chứng minh là retired. Không còn phát hiện source chặn ở nhánh này; kết quả kiểm SQL/bộ test cuối do phiên chính ghi từ output thực.
2. **Workflow rollback — đạt khi rà source.** `contracts-registrations.e2e-spec.ts` dùng một outer transaction, savepoint theo route và rollback cuối. Các fixture được theo dõi bằng ID; sau rollback kiểm 15 nhóm dữ liệu không còn bản ghi. Test bao phủ giới hạn/ngày ra của người ở, tenant self-add, ảnh CCCD, audit xem ảnh, dịch vụ, xe và hủy HOLD. Source phân biệt rõ luồng tuần tự này với kiểm concurrency độc lập.
3. **Privacy và dịch vụ ngoài — đạt.** Workflow dùng JWT/CCCD/Cloudinary test trong tiến trình và khôi phục sau chạy. Chỉ metadata provider và mail được thay thế; không upload/download ảnh thật hoặc gửi email. Response, log và audit được kiểm bằng boolean để tránh assertion in nguyên CCCD/hash/ciphertext. Boss hiện có chỉ được đọc ID làm khóa tham chiếu.
4. **Plate race và retirement — phù hợp.** Ca mới trong `contracts.e2e-spec.ts` gửi hai request độc lập cho cùng biển số đã chuẩn hóa, yêu cầu một 201 và một lỗi thân thiện 400, rồi kiểm một registration/audit thành công. Hai HOLD được hủy bằng route thật; lỗi test và lỗi retirement được giữ cùng nhau, không bị throw trong `finally` che mất. Ca này chưa chạy trên DB dev; chưa có bằng chứng về concurrency hoặc số connection thực tế.
5. **Cleanup mềm — đạt sau sửa.** Hợp đồng fixture phải khớp run log, tên/code/terms, người tạo/người thuê, phòng/tòa, trạng thái chưa ký/không hóa đơn, service và xe synthetic thuộc phạm vi run. Chỉ ngừng xe active khớp điều kiện; giữ lịch sử. `linkedRows` hiện bảo vệ cả membership service và service qua vehicle trước khi cleanup các master fixture. Không thêm hard delete hoặc tự xử lý unlogged rows.
6. **Runner — đạt.** Preflight chỉ `SELECT 1`; thất bại thì không khởi động fixture. Timeout fallback chỉ áp vào child environment, giữ giá trị cấu hình sẵn, mail bị tắt. Chỉ chạy hai file E2E xác định với một worker và không file parallelism; cleanup CLI sau thành công chỉ chạy chế độ list, không có `--apply`.
7. **Bằng chứng và giới hạn.** Tôi đã đọc report ban đầu **46 passed/0 failed** và replay workflow trên PostgreSQL nhúng **1/1 passed**. Các kết quả này không thay thế DB dev hoặc full-backend result. Phiên chính báo full-run bị automatic approval review chặn và dev preflight không tới được DB; vì vậy phải giữ task blocked/chưa nghiệm thu. Guard mạng là lớp bảo vệ trong tiến trình Node, không phải bằng chứng full suite đã hoàn thành hay firewall của cả hệ điều hành.

**Ghi chú P3, không chặn:** cập nhật dòng BE-P3-26 còn ghi chờ commit thành đã xác minh `b904ece` khi hoàn tất checkpoint.

`git diff --check` đạt. Không phát hiện source chặn còn mở sau sửa P2; vẫn thiếu kết quả full backend và E2E/race trên DB dev để đóng task.

**Xử lý:** đã sửa ghi nhận commit BE-P3-26. Kết quả cuối 58/SQL3 ở trên lấy từ output thực phiên chính sau sửa P2; không có source finding còn mở. Thêm LESSONS cho bảo vệ parking service, generic Prisma mocks và tự kiểm Node guard.

### Review bổ sung sau khi tách hai client và thêm barrier

**DUYỆT phần bổ sung plate race; không có phát hiện source chặn.**

Reviewer GPT, chỉ đọc; không chạy test, gọi mạng hoặc sửa file.

1. **Hai giao dịch thực — phù hợp.** Hai PrismaClient có pool riêng, mỗi pool giới hạn một connection. Barrier đặt ngay trước INSERT thật; chỉ mở khi cả hai transaction tới được. Kiểm `pg_backend_pid()` khác nhau loại bỏ khả năng kết quả “race” thực chất chạy tuần tự trên một backend. Bằng chứng này chỉ có hiệu lực sau khi test thực sự pass trên DB dev.

2. **Khóa và proxy — đạt khi rà source.** Mapping shared và service SHARE tương thích giữa hai request; chúng khóa hai contract khác nhau nên không tự chặn trước barrier. Proxy giữ route/service/query thật, chỉ chèn đo PID và chờ tại biên `vehicle.create`; các phương thức khác được bind về client/transaction/delegate gốc.

3. **Timeout — hợp lý.** Barrier 45 giây nằm trong transaction timeout 120 giây; test có 300 giây cho setup, request và retirement. Một bên không tới barrier sẽ làm test thất bại, không tạo kết quả concurrency giả.

4. **Tài nguyên và cleanup — đạt.** Apps/clients được lưu trước bước init có thể lỗi, rồi đóng trong `finally`. Sau đó hủy cả hai HOLD bằng app gốc; lỗi kiểm thử, đóng tài nguyên và retirement đều được gom lại, không che mất lỗi ban đầu. Cleanup fallback theo journal vẫn giữ nguyên.

5. **Phạm vi và dữ liệu — đạt.** URL chỉ được đổi `connection_limit` trong bộ nhớ của ca test; không sửa `.env`. Không in URL/credential hoặc thay kết quả query. Các kiểm tra một registration/audit thành công và thông báo duplicate thân thiện vẫn được giữ.

**Giới hạn giữ nguyên:** tôi chưa chạy bản bổ sung. Cần output noEmit/lint cuối và E2E DB dev thực tế; full backend và dev E2E vẫn blocked theo thông tin phiên chính. Chưa đủ điều kiện đóng BE-P3-27/P3-5.

**Xử lý phiên chính:** scoped noEmit sau sửa race exit0; lint sau sửa race exit0,0 lỗi/4 warning cũ,268 file,1,7s. Dev E2E vẫn chưa chạy, full vẫn không có output xác minh; giữ task blocked.

## Commit đề xuất sau khi có kết quả owner

```text
test(contracts): verify registrations and protect fixture cleanup (BE-P3-27, CON-13..16, DB-B5/B6/B9)
```

Owner đã nghiệm thu BE-P3-27 và yêu cầu tiếp tục FE-P3-01 ngày20/11/2026. Cập nhật output full/E2E dev khi được cung cấp; giữ nguyên kết quả thực tế và các giới hạn đã ghi. BE-P3-27 vẫn chưa commit lúc bắt đầu FE-P3-01; agent không stage/commit/push.
