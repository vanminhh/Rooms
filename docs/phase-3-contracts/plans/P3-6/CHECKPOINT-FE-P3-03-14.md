# FE-P3-03..14 — triển khai liên tục và bàn giao kiểm tra Phase3

20/11/2026. Owner cho làm một mạch hết Phase3, tiếp tục sau FE02; không dừng chờ commit giữa task. **Mã đã triển khai, chưa nghiệm thu toàn phase** do các gate kiểm thử/DB/browser dưới đây. HEAD vẫn `b904ece`; BE27/FE01/FE02 và thay đổi lượt này là bộ pending đã biết. Không stage/commit/push, sửa schema/.env/dependency hoặc xóa file.

## Kiểm lại sau khi owner đồng ý tiếp tục chạy test

20/11/2026: owner trả lời “tiếp tục đi” ngay sau câu hỏi cho phép chạy lại các bộ test có cảnh báo telemetry. Phiên chính ghi rõ cách hiểu này trước khi chạy; lần chạy mới được phép và không còn bị auto-review từ chối. Các đoạn blocked bên dưới là lịch sử trước xác nhận này.

| Lệnh và phạm vi | Kết quả mới thực tế |
|---|---|
| Backend `npm test -- --maxWorkers=2` | **113 file / 2633 passed**,0fail,**141,31s**,start20:35:18,exit0 |
| Frontend `npm run test:components` | **981 tests / 981 pass / 0 fail / 0 skip**,**163409,7733ms**,exit0; gồm P3, auth, P2, EX, kit |
| Scoped FE05..07 sau sửa harness | **10/10**,2264,4625ms,exit0; sau đó đã nằm trong full981 |
| Auth-cache sau tăng chất lượng fixture cuối | **1/1**,831,9686ms,exit0; chạy sau full981, không cộng count hoặc gọi là full rerun |
| Frontend lint sau sửa harness | exit0,0error/0warning |
| Source ứng dụng/build | Không đổi source sản phẩm trong lượt kiểm lại; giữ build BE exit0 và FE exit0,Vite7,25s đúng source đã build ở lượt trước |
| DB preflight mới | runtime6543FAILED121ms,direct5432FAILED9ms,exit1; diagnostic an toàn xác nhận PrismaClientInitializationError thuộc nhóm connection, không in URL/credential/error message |

Lượt P3 đầu tiên114/117,65406,2267ms phát hiện ba lỗi harness: thao tác tiếp khi dialog đóng chưa commit, quay lại trước khi detail thực sự unmount và tìm input chỉ theo attribute thay vì DOM property. Đã chờ DOM đúng và giữ nguyên assertion không POST khi đóng, double-click một payment, mất mật khẩu sau rời trang, metadata-only upload; focused10/10 rồi full981/981. Mutation test giữ timer GC sau khi cache clear nên được `destroy()` trong finally; room seed dùng Infinity để không tạo timer60s. Reviewer tiếp tục phát hiện private query seed gcTime0 có thể tự biến mất trước chuyển account; đã giữ seed Infinity và assert query/mutation còn ngay trước chuyển account/scope, rồi scoped1/1 đạt. Không sửa source sản phẩm hoặc nới expected.

**Gate còn lại:** E2E dev/DB checker/cleanup-list chưa chạy vì preflight không kết nối; browser-control không có nên chưa manual desktop/360px/VI-EN/print. Full unit thành công không đóng các gate này hoặc thay owner nghiệm thu/commit. Task tự động đã đạt được đánh[x], task có manual trong Done when vẫn[!].

## Thay đổi

- FE03/04: danh sách/filter/phân trang/bốn trạng thái, Chốt đúng viewing state, prefill qua navigation state và fresh scope room GET; RHF+zod tạo hợp đồng, mặc định cọc theo giá phòng, dịch vụ, ngày kết thúc từ backend; xác nhận guest account và người ký khác owner, resend đúng payload.
- FE05..07: print renderer dùng chung và CSS in; upload scan private, ký, mật khẩu tạm/copy; QR và ghi thu cọc có xác nhận/idempotency; chỉ số điện/nước đầu và thay đồng hồ; cancel-preview/confirm; reset password; người ở/CCCD signed view, xe và dịch vụ full set.
- FE08: lookup active/inactive đúng API, literal plate/pagination; dashboard cọc chưa thu và khách cần gọi, action Đã gọi/refetch.
- FE10..13: API `/me`, dictionary VI/EN, overview/chọn phòng/lịch sử/list/detail/print; xe readonly, signer last4, roommate không last4; thêm roommate trực tiếp với ID/ảnh tùy chọn; không mở request Phase5 hoặc tính phí tháng tại FE.
- Backend tích hợp tối thiểu: GET end-date dùng chung D-41 validation với create; POST cancel-preview dùng chung payment validation/math, cancel kiểm expectedDepositReceived trong lock và idempotent hash; tenant-only ID_PHOTO signature own HOLD/ACTIVE; progress số từ helper ngày BE. Spec14 API table đã cập nhật, không đổi nghiệp vụ cọc/CCCD/lifecycle/capacity đã chốt.
- Sửa P1 cache: scope key chứa account/role/buildings; AuthProvider clear cả query+mutation cache trước expose identity/scope mới, remount local state; signed-out boot không xóa query public.
- Tests mới và hồi quy loader/menu/placeholder/auth/tenant/dashboard được cập nhật. Test logic dùng client/component thật, DOM/fetch/DB/provider là boundary fixtures; không skip/only.

Files chính: `Source/frontend/src/features/contracts/`, năm staff pages và ba tenant pages, TenantHome/StaffHome, auth-context/AuthProvider, upload/dashboard/i18n, `tests/p3/` và affected auth/EX/P2 tests; backend contracts/date/files và specs liên quan. Danh sách pending thực xem `git status --short`; các file BE27 cũ giữ trong checkpoint riêng.

## Kết quả trước lượt kiểm chứng mới

| Kiểm tra | Output đã xác minh |
|---|---|
| Backend focused | 6 file,**304 passed**,0failed,6,53s,start19:13:09,exit0; contracts.service/read/cancel/occupants +files.service +period |
| Backend i18n | 1 file,**19 passed**,4,12s,start19:17:25,exit0 |
| Backend build | `npm run build`,exit0 |
| Backend scoped noEmit | read/cancel/date specs và imports,exit0 |
| Backend lint | exit0;4warning comparator cũ trong dashboard/pricing specs |
| Frontend lint/build cuối | **Lint exit0,0error/0warning; build exit0,Vite7,25s,759modules**, sau sửa validation locale/print selector/picker lock; cảnh báo chunk>500kB vẫn có |
| Frontend parser | 15test/helper file,exit0; đây chỉ là syntax check, không thực thi test |
| Diff whitespace | `git diff --check`,exit0 tại lượt rà cuối source |
| DB preflight mới | SELECT1 runtime6543 FAILED147ms;direct5432 FAILED8ms;exit1; không fixtures/cleanup/dbchecker |

Lượt scoped frontend mới `node --test tests/p3/auth-cache-privacy.test.mjs tests/p3/fe03-list-viewing.test.mjs tests/ex/ex7-guest.test.mjs` bắt đầu nhưng bước lấy output bị **automatic approval review từ chối**: cảnh báo telemetry tới endpoint Visual Studio không đáng tin, có thể lộ đường dẫn, metadata test, errors hoặc fixture. Không có kết quả xác minh; không retry, không đọc log hoặc thực thi gián tiếp để vòng qua. Các bộ test FE04/05..08/10..13 được viết sau đó chưa chạy. Full FE/BE đã bị chặn ở các checkpoint trước cũng không được chạy lại.

Static review/parser/lint/build và HTTP scoped **không** là full test pass. Kết quả FE03 cũ60/60 trước P1, FE02 cũ107/107 và owner full879/877/2 đều có phạm vi riêng, không được ghép thành con số full mới. Chưa có browser, desktop/360px, print preview hay E2E dev mới. Không đặt Phase3done tại root/spec.

## Kiểm trực tiếp và lựa chọn trình bày

Danh sách bước/kỳ vọng/lệnh kiểm: [p3-8-qa-checklist.md](../../p3-8-qa-checklist.md). Cần owner xác minh workflow tạo→in→scan→ký→thu cọc→nhận phòng; workflow thứ hai thu cọc→hủy/hoàn; lần đầu TENANT đổi password; quyền/riêng tư/VI-EN/mobile/print. Cleanup chỉ LIST, không xử lý unlogged cũ hoặc APPLY ngoài quyết định owner.

[ASSUMPTION — trình bày] Progress là số ngày trọn đã qua từ ngày bắt đầu, tính cả ngày cuối trong tổng thời hạn, percent nguyên làm tròn xuống và clamp0..100; tính ở BE, không dùng để tính tiền. Giữ nguyên A-25..28 và Q-15 mẫu thật còn mở, bản in vẫn có banner nháp. Bộ lọc xe chỉ active/inactive vì BE không có giá trị All; đây là khớp API hiện có.

Commit gợi ý sau khi owner nghiệm thu: `feat(contracts): complete staff and tenant workflows (FE-P3-03..14, CON-01..16, CON-22)`. BE-P3-27/FE01/FE02 pending trước lượt này có thể tách theo checkpoint đã có; agent không tự stage/commit.

## Toàn văn reviewer nhóm auth/FE03/04

**DUYỆT source nhóm auth-cache / FE-P3-03 / FE-P3-04 / end-date preview sau sửa P1. Không còn phát hiện source chặn trong phạm vi đã rà.**

Reviewer GPT kế thừa, chỉ đọc; không chạy test/mạng hoặc sửa file.

1. **P1 cache khác tài khoản — đã sửa.** `authScopeKey` gồm user ID, role và danh sách building ID được sắp xếp. List hợp đồng dùng scope trong cả query key và remount key. Hai quản lý cùng `selection=null` vì thế không dùng chung cache. Regression mới giữ cùng QueryClient và trì hoãn response của account/scope tiếp theo, đúng tình huống phát hiện ban đầu.

2. **AuthProvider cô lập dữ liệu và state trước khi đổi quyền.** Các đường login, acceptSession, refreshMe, logout và signed-out handler đi qua `replaceUser`; query/mutation cache được clear trước `setUser` khi scope đổi. Provider có key theo scope để loại state cục bộ của màn hình cũ, gồm dữ liệu nhạy cảm trong form. Ref ban đầu đã dùng `authScopeKey(null)`, nên boot signed-out → signed-out không xóa các public query đang chạy chỉ vì giá trị ref khác key. Cập nhật locale không làm thay đổi scope hoặc xóa form vô cớ.

3. **Yêu cầu QueryClientProvider được đáp ứng ở các nơi đã rà.** AppProviders thực đã bọc AuthProvider bằng QueryClientProvider. Standalone harness của EX-7 và auth-cache test đã được bổ sung wrapper phù hợp. Không thấy vòng phụ thuộc hoặc thay thứ tự guard đăng nhập.

4. **FE-P3-03 — phù hợp.** Bộ lọc, phân trang, bốn trạng thái danh sách và shared formatting giữ đúng API. “Chốt” chỉ cho CONFIRMED/DONE, chưa ghi WON; navigation state dùng dữ liệu tài khoản hiện tại khi có và không đưa PII vào query string. Card không tự tính nghiệp vụ.

5. **FE-P3-04 bảo vệ personal prefill.** Query room/options có scope riêng; CreateForm chứa tên, SĐT, email chỉ xuất hiện sau room GET thành công, đã fetch sau mount và hết fetching. Không dùng cached `isSuccess` đơn thuần để xác nhận quyền. Đổi account/scope/room remount form; viewing prefill chỉ gắn vào đúng phòng của viewing.

6. **Xác nhận tài khoản/người đặt lịch — đúng source hiện có.** PHONE_TAKEN có guestAccountId mở hộp xác nhận với tên/email; chỉ resend khi nhân sự bấm tiếp tục. Nhánh signer khác viewing owner dùng xác nhận riêng và giữ các flag đã xác nhận cần thiết. Đóng hộp thoại không tự resend. Lỗi còn lại được chuyển tới field/form; ref busy chống gửi lặp trong cùng form. Full CCCD chỉ ở state form/request, không có lưu storage/query key/log mới.

7. **Date preview ở backend — đúng ranh giới.** `GET /contracts/end-date` là staff-only, no-store, đặt trước route `:id` và không đọc/ghi hợp đồng. Preview và create dùng chung hàm validation/D-41, giữ minimum term, ngày không quá khứ và giới hạn ngày kết thúc. Frontend chỉ hiển thị `endDate` trả về. `mode:'onChange'` cùng preview field errors cạnh startDate/termMonths xử lý các trường hợp submit đang bị khóa mà người dùng cần biết lỗi.

**Kiểm chứng và giới hạn:** `git diff --check` trong phạm vi rà đạt. Phiên chính báo backend read/period **27/27**, build frontend exit0 **5,93s** ở lượt đã nêu. Lượt scoped auth/list/EX-7 mới bị automatic approval review từ chối khi lấy kết quả; không có kết quả xác minh và không được coi bộ test mới đã pass. Chưa xác minh runtime các nhánh form FE04 hoặc browser/DB dev. Các branch CON-07, prefill ngoài scope, preview field errors và regression auth-cache cần có output thật trước nghiệm thu kiểm thử chung. Report này không bao gồm cancel-preview hoặc tenant upload signature đang viết tiếp.

## Toàn văn reviewer nhóm FE05..08/tenant/backend tích hợp

**DUYỆT source FE-P3-05..08, các trang tenant FE-P3-10..13 và các bổ sung backend liên quan sau sửa các phát hiện. Không còn source blocker trong phạm vi đã rà; QA Phase 3 vẫn thiếu bằng chứng chạy đầy đủ.**

Reviewer GPT kế thừa, chỉ đọc source/spec/test; không sửa file, chạy test, gọi mạng, upload hoặc commit.

1. **Các phát hiện đã sửa.**
   - Tra cứu xe chỉ còn hai lựa chọn có đúng nghĩa API: đang gửi/ngừng gửi; không còn “Tất cả” nhưng thực tế chỉ trả active.
   - Tắt tùy chọn thay đồng hồ xóa giá trị/lỗi chỉ số cũ, tránh field ẩn chặn nhận phòng.
   - Sửa xe giữ nguyên dịch vụ cũ bằng cách bỏ `serviceId` khỏi PATCH khi không đổi, nên dịch vụ đã ngừng hoạt động không vô tình chặn việc sửa biển số.
   - OccupantForm dùng `useValidationLanguage`, giữ input khi đổi VI/EN và dịch lại client validation.
   - CSS in đã ẩn thêm bộ chọn tòa của StaffLayout, bên cạnh header/menu/toolbar.

2. **Ký và mật khẩu tạm — phù hợp.** Scan được upload private trước khi ký; action có xác nhận và chống gửi lặp. Mật khẩu ký/reset chỉ đi vào state của detail đang mount, không qua query/mutation cache hoặc storage. Scope/contract đổi sẽ remount; reload/rời trang không khôi phục mật khẩu. Copy chỉ thực hiện khi người dùng bấm.

3. **Ghi thu và hủy — đúng ranh giới tiền.** Hộp ghi thu nêu số tiền invoice từ BE, không cho client tự đặt amount. Cancel-preview dùng chung phép tính với cancel thật, không ghi hợp đồng/invoice/settlement/audit. Cancel thật so `expectedDepositReceived` với payment đã khóa trước khi ghi; thay đổi tiền cọc sau preview trả conflict để nhân sự xem lại. Optional field được đưa vào request hash khi có, giữ tương thích request cũ. Idempotency key được giữ cho cùng thao tác/body.

4. **Nhận phòng và registrations — phù hợp.** Form gửi điện/nước và replacement metadata theo DTO, không gửi ảnh đồng hồ. Sai chỉ số/cọc/chú thích đi về field hoặc thông báo API. Người ở/xe/dịch vụ chỉ có UI sửa với HOLD/ACTIVE; lịch sử vẫn xem được. Cập nhật services là full set, giữ lựa chọn archived và không tính phí tháng tại FE.

5. **Tenant ID signature — được giới hạn đúng.** Endpoint tenant cố định ID_PHOTO, không nhận purpose do tenant chọn. Khóa và lookup đều ràng buộc `tenant_id`; foreign contract trả not-found, lifecycle dùng cùng guard HOLD/ACTIVE. Factory tiếp tục ký authenticated, purpose prefix, folder và overwrite=false. Tenant không được mở quyền CONTRACT_SCAN của staff.

6. **Private documents và CCCD — phù hợp.** Scan/ảnh CCCD chỉ yêu cầu signed view khi bấm, không preload hoặc đưa URL vào QueryClient/storage. URL ở state của viewer, có xử lý hết hạn và bỏ response đến muộn sau unmount. Tenant không có nút đọc ảnh CCCD; read chỉ hiện last4 người ký, không hiện last4 roommate. Số/ảnh mới vẫn tùy chọn khi thêm roommate; payload chỉ gồm metadata được phép.

7. **Tenant và ngôn ngữ — phù hợp.** Overview có cọc trước nhận phòng, chọn phòng khi nhiều hợp đồng và summary/lịch sử. Danh sách/detail/print dùng `/me` và scope cache theo account; foreign ID có not-found state. Xe chỉ đọc, roommate thêm trực tiếp, không dựng request Phase 5. Nội dung/nhãn/validation tenant dùng dictionary; hợp đồng in và cảnh báo nháp giữ tiếng Việt. Tiền/ngày dùng formatter chung.

8. **Print/progress — đúng lớp xử lý.** Print render nội dung BE như text, không diễn giải HTML; có cảnh báo nháp và `window.print()`. Progress được tính tại helper ngày trung tâm ở BE và chỉ hiển thị tại FE, không thay phép tính kỳ/tiền.

9. **CreateForm cuối — phù hợp sau điều chỉnh.** Picker khóa khi pending hoặc đang xác nhận. Form chỉ nhận prefill sau fresh room authorization cho scope hiện tại; đổi scope/id remount. Background refetch thành công không tự làm mất dữ liệu đang nhập. Các xác nhận guest account/người ký khác owner vẫn cần thao tác rõ ràng trước resend.

10. **Test logic và hồi quy — đã rà source.** Các test placeholder cũ đã chuyển sang mount màn thật; auth/tenant fixtures đã thêm endpoint mới và provider cần thiết. Case list `/me/contracts` có metadata phân trang. Các bộ mới bao phủ form branches, tiền, private upload/view, password, scope/cache và VI/EN bằng component/client thật với DOM/fetch giả. Không thấy skip/only trong bộ P3. `git diff --check` trong phạm vi rà đạt.

**Bằng chứng và giới hạn:** phiên chính báo backend **304/304 trong 6 file (6,53s)**, i18n **19/19 (4,12s)**, build BE và scoped noEmit exit0. FE lint/build exit0 **10,88s** được báo trước hai sửa cuối; cần ghi kết quả cuối đúng phiên bản. Test syntax 15 file exit0 không thay kết quả chạy test. Full và scoped FE đã bị automatic approval review từ chối vì cảnh báo telemetry; không có kết quả mới được xác minh. DB SELECT1 thất bại trước E2E, browser/manual print/360px chưa được kiểm. Không coi source DUYỆT hoặc các con số scoped là toàn Phase 3 đã pass.

## Toàn văn reviewer sửa test cuối sau lượt full

**DUYỆT các sửa test/harness cuối; không còn phát hiện chặn trong bốn file đã rà.**

Reviewer GPT kế thừa, chỉ đọc; không chạy test, mạng hoặc sửa file.

- **Đồng bộ DOM:** chờ hộp xác nhận biến mất trước khi mở lại; chờ màn hình đích xuất hiện trước khi quay lại detail. Các bước này xác nhận thao tác đóng/unmount thực sự diễn ra, giữ nguyên kiểm tra không ghi tiền khi hủy, chống double click và mật khẩu mất sau khi rời trang.
- **File input:** lookup vẫn yêu cầu đúng INPUT dạng file có PDF trong accept, chỉ hỗ trợ cả DOM property và attribute của harness. Luồng upload/ký, metadata và kiểm tra không cache mật khẩu vẫn chạy thật.
- **Auth-cache:** `gcTime: Infinity` giữ query seed tồn tại; các assertion mới chứng minh private query/mutation còn ngay trước đổi account và query còn trước đổi scope. Kiểm tra cache rỗng sau chuyển đổi vì vậy không còn có thể pass nhờ GC tự xóa. `mutation.destroy()` và `client.clear()` chỉ chạy trong finally sau assertions.
- **Cached room:** Infinity chỉ áp cho seed của ca kiểm fresh permission, không đổi cấu hình sản phẩm. Test vẫn chứng minh cached room không đủ để hiện personal prefill khi request quyền mới chưa hoàn tất.
- **Harness:** giữ client/router/provider thật, fake DOM/fetch ở biên; không thay unit đang kiểm, không nới expected hay thêm skip/only.

Phiên chính báo **full backend 113 file/2633 test pass (141,31s)** và **full frontend 981/981, 0 fail/skip (163409,7733ms)** trước lần tăng chất lượng auth-cache fixture. Ghi kết quả scoped auth-cache sau sửa riêng từ output thực; không cộng test count hoặc tuyên bố đã chạy lại full suite trên fixture cuối. Giới hạn browser và dev DB/E2E vẫn giữ nguyên.

Main addendum: scoped auth-cache cuối **1/1,831,9686ms,exit0**. Product source giữ nguyên; không chạy lại full chỉ để đổi timestamp sau một thay đổi fixture đã được kiểm riêng.
