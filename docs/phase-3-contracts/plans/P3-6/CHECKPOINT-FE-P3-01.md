# FE-P3-01 · Khung route, menu và trạng thái Phase 3

20/11/2026. **Mã đã triển khai và reviewer DUYỆT; chờ full frontend và kiểm tra giao diện của owner.** Final focused84/84, lint/build đạt. Task giữ `[!]` vì lượt full bị automatic approval review từ chối và chưa có browser visual.

**Cập nhật sau output owner:** full frontend đã chạy trên máy owner: **879 tests,877 pass,2 fail,109193.1049ms**. Hai lỗi là expected menu cũ trong `auth-login-flow.test.mjs`, bị bỏ sót ở lượt FE01. Đã sửa đúng menu mới, scoped **2/2**,4528.1554ms,exit0 và lint exit0. Reviewer DUYỆT bản sửa; chưa có full summary sau sửa, giữ task chờ kiểm chứng. Không cộng877+2 thành một kết quả full879/879.

Owner chỉ thị **“chốt BE p3 27 làm tiếp”**: đã ghi nhận nghiệm thu BE-P3-27 và cho phép chuyển phần với thay đổi BE27 còn chờ commit. HEAD vẫn `b904ece`; không coi Git sạch hoặc tự thêm kết quả full backend/dev E2E. Lượt này chỉ thêm khung FE-P3-01, theo [PLAN.md](PLAN.md) do planner GPT kế thừa tạo; không phải Opus5. BE27 source đang chờ từ lượt trước, không sửa backend ở FE01.

## Phạm vi đã làm

| Route | Guard/layout | Nội dung FE-P3-01 |
|---|---|---|
| `/ql/hop-dong` | MANAGER/BOSS, StaffLayout | Hợp đồng |
| `/ql/hop-dong/moi` | MANAGER/BOSS, StaffLayout | Tạo hợp đồng |
| `/ql/hop-dong/:id` | MANAGER/BOSS, StaffLayout | Chi tiết hợp đồng |
| `/ql/hop-dong/:id/in` | MANAGER/BOSS, StaffLayout | In hợp đồng |
| `/ql/xe` | MANAGER/BOSS, StaffLayout | Tra cứu xe |
| `/thue/hop-dong` | TENANT, TenantLayout | Hợp đồng / Contracts |
| `/thue/hop-dong/:id` | TENANT, TenantLayout | Chi tiết hợp đồng / Contract details |
| `/thue/hop-dong/:id/in` | TENANT, TenantLayout | In hợp đồng / Print contract |

Tám trang là placeholder có tiêu đề riêng và thẻ kit báo đang cập nhật. Các form, danh sách dữ liệu, in tài liệu, upload, thu cọc và sửa người/xe sẽ được làm ở đúng task FE-P3-02..09/P3-7. Khung chưa gọi API hợp đồng/private assets hoặc tạo dữ liệu giả. Giữ guard/layout hiện có và thứ tự bốn nhóm root, cả direct print URLs. Các menu nhân sự mới áp dụng cho cả MANAGER/BOSS; tenant dùng dictionary và đổi ngôn ngữ ngay.

Status maps dùng đúng VI từ spec14/16, đầy đủ bản dịch EN, typed unions và bốn tone kit. Contract có HOLD/ACTIVE/ENDED/CANCELLED; invoice có DRAFT/UNPAID/PAID/SETTLED/CANCELLED. “Quá hạn”/Overdue là nhãn hiển thị riêng, không phải trạng thái DB hay phép tính hạn mới ở FE.

Menu Boss tăng8→10, Manager6→8, tenant3→4. Bổ sung class `layout-staff` và `flex-wrap:wrap` cho panel/nav nhân sự từ1121px, giữ menu di động của kit. Đây là xử lý phòng ngừa từ rà source; chưa có bằng chứng browser tái hiện overflow trước sửa hoặc xác nhận bố cục sau sửa.

## File thay đổi trong lượt FE01

| Nhóm | File |
|---|---|
| Route/menu | `src/app/routes.tsx`, `src/layouts/StaffLayout.tsx`, `TenantLayout.tsx`, `layouts.css` |
| Staff placeholders | `src/pages/staff/ContractsPage.tsx`, `ContractCreatePage.tsx`, `ContractDetailPage.tsx`, `ContractPrintPage.tsx`, `VehiclesPage.tsx` |
| Tenant placeholders | `src/pages/tenant/TenantContractsPage.tsx`, `TenantContractDetailPage.tsx`, `TenantContractPrintPage.tsx` |
| Nhãn/dịch | `src/shared/status-labels.ts`, `src/shared/i18n/vi.ts`, `en.ts` |
| Test và script | `tests/p3/fe01-skeleton.test.mjs`, `tests/auth-guards.test.mjs`, `tests/auth-login-flow.test.mjs`, `tests/p2/cp1-routes.test.mjs`, `cp2-staff-layout.test.mjs`, `package.json` |
| Tài liệu | PLAN, checkpoint này, featureP3-6, PROGRESS; cập nhật owner acceptance trong feature/checkpoint/plan BE27 |

Các path source/test ở trên tính từ `Source/frontend`. Không cài dependency hoặc sửa lockfile, API, schema, database hay `.env`; không stage/commit/push.

## Kết quả thực tế

| Kiểm tra | Kết quả |
|---|---|
| Targeted trước responsive | 84/84,3755.8628ms,exit0 |
| Targeted cuối sau responsive | **84/84**,**3062.4857ms**,exit0;0 failed/skipped/todo |
| Test P3 mới trong84 | 15 ca:8route/guard,3menu/locale/navigation,2status,2placeholder |
| Guard/menu/i18n hồi quy | 69 ca còn lại trong84; không cộng thành bộ riêng |
| `npm run lint` sau responsive | exit0, không có lỗi lint |
| `npm run build` sau responsive | exit0; TypeScript đạt,745modules, Vite7.51s |
| Build warning | Có cảnh báo chunk>500kB và plugin timing; không phải build error |
| Reviewer | DUYỆT source và responsive addendum, báo cáo đầy đủ dưới đây |
| Full `npm run test:components` trong môi trường agent | Bị auto-review từ chối, chưa có kết quả hoàn tất được xác minh |
| Full owner cung cấp trước sửa expected menu | **879 tests / 877 pass / 2 fail**,109193.1049ms |
| Sau sửa hai test menu | **2/2**,4528.1554ms,exit0;0 fail/skipped/todo; lint exit0 |
| Full sau sửa hai test menu | Chưa có output mới |
| Browser desktop/360px | Chưa kiểm được; Browser js/CUA control không có trong tool registry |

Lệnh targeted cuối từ `Source/frontend`:

```powershell
node --test tests/p3/*.test.mjs tests/auth-guards.test.mjs tests/p2/cp1-routes.test.mjs tests/p2/cp2-staff-layout.test.mjs tests/ex/ex3-i18n.test.mjs
```

Output cuối:

```text
tests 84
pass 84
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 3062.4857
```

Full command đã được khởi động nhưng khi chờ kết quả thì automatic approval review từ chối do cảnh báo outbound telemetry tới `dc.services.visualstudio.com`, có nguy cơ xuất metadata/paths/errors của test. Không có exit code/full summary được xác minh; không retry, đọc kết quả qua đường khác hoặc ghép các lượt scoped thành full. Lượt targeted chạy lại chỉ để kiểm source responsive vừa sửa, không thay thế full suite. Các số864/864 trong lịch sử không phải kết quả lượt này.

Lượt full owner gửi sau đó có hai failure tại `auth-login-flow.test.mjs:728/741`. Menu sản phẩm đúng FE-P3-01; các test này vẫn kỳ vọng tenant3/manager6/Boss8. Chỉ sửa tên test và expected arrays sang tenant4/manager8/Boss10, giữ `deepEqual` toàn bộ menu, đủ bốn session staff và các assertion logo/theme/footer/building. Source sản phẩm và số lượng test không đổi. Không chạy lại build vì chỉ sửa test/tài liệu; kết quả build source ở bảng trên giữ nguyên.

Lệnh xác minh bản sửa:

```powershell
node --test --test-name-pattern='(?:TenantLayout|StaffLayout) menu' tests/auth-login-flow.test.mjs
```

```text
tests 2
pass 2
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 4528.1554
```

## Owner kiểm chứng

Tại `D:\Rooms\Source\frontend`:

```powershell
npm run test:components
```

Gửi summary cuối `tests / pass / fail / duration_ms`. Sau đó kiểm trên dev app:

1. MANAGER và BOSS mở menu **Hợp đồng**, **Tra cứu xe**; mở trực tiếp năm staff URLs trong bảng. Trang hiện đúng tiêu đề và thông báo đang cập nhật.
2. TENANT mở ba tenant URLs và đổi VI↔EN; menu Hợp đồng/Contracts và nội dung placeholder đổi ngay. Nhân sự giữ VI.
3. Signed-out mở URL mới phải tới đăng nhập với next URL; sai role về home tương ứng; tài khoản bắt buộc đổi mật khẩu phải tới trang đổi mật khẩu.
4. Kiểm menu Boss tại1121/1200px và desktop rộng: đủ10mục cùng Đăng xuất, xuống hàng khi thiếu chỗ; tại360px mở menu di động, các link dùng được bằng chạm/bàn phím, không tràn ngang.

Các bước browser trên là hướng dẫn còn chờ owner, không phải kiểm thủ công đã hoàn tất. Chưa có assumption nghiệp vụ mới. Bản dịch EN và tone trạng thái là lựa chọn trình bày của PLAN; giữ nguyên các assumption backend đã ghi, không coi owner chốt BE27 là câu trả lời riêng cho A-25..28. Hai khoảng trống preview ngày kết thúc/refund được ghi cho đúng FE-P3-04/07 trong PLAN, không giải quyết bằng phép tính FE ở FE01.

## Báo cáo reviewer đầy đủ

**DUYỆT mã FE-P3-01; không có phát hiện source chặn đã xác minh.**

Reviewer: GPT kế thừa của phiên Codex, không phải Sonnet 5. Chỉ đọc source/spec/diff; không sửa file, chạy test, gọi mạng hoặc commit.

1. **Routes và phân quyền — đạt khi rà source.** Đủ năm route nhân sự và ba route người thuê, đặt trong đúng `RequireAuth` và layout hiện có. Các URL in trực tiếp vẫn nằm sau guard. Giữ nguyên bốn nhóm root, các route đăng nhập/tài khoản, forced-password flow và nhóm Boss-only. Route tĩnh `hop-dong/moi` có page riêng; không dùng chung component với `:id`.

2. **Menu và ngôn ngữ — đạt.** MANAGER/BOSS đều có “Hợp đồng” và “Tra cứu xe”; Nhân sự/Duyệt giá vẫn chỉ Boss. Tenant có `nav.contracts` đúng đường dẫn, lấy chữ từ dictionary VI/EN. Các placeholder tenant dùng `useI18n`, còn staff giữ tiếng Việt.

3. **Trạng thái — khớp spec.** `ContractStatus` có bốn giá trị, `InvoiceStatus` có năm giá trị lưu DB. Nhãn Việt khớp bảng của spec 14/16. “Quá hạn” được tách thành nhãn hiển thị suy ra, không thêm `OVERDUE` vào enum hoặc tính hạn theo ngày trong FE. Tone đều thuộc bốn tone kit; dictionary hai ngôn ngữ đầy đủ cho các khóa mới.

4. **Placeholder và phạm vi — phù hợp checkpoint.** Tám trang có tiêu đề nhận biết được và dùng `SectionHeading`/`ElevatedCard` trong theme của layout. Không có dữ liệu hợp đồng giả, truy vấn private, hành động tiền hoặc upload mới. Chưa triển khai chức năng FE-P3-02..09 và không coi trang in placeholder là chức năng in hoàn chỉnh.

5. **Kiểm thử — thiết kế phù hợp.** Test mới chạy route source thật với `matchRoutes` thật, kiểm guard chain và `guardRedirect` thật cho từng vai trò, signed-out next URL và forced password. Page/layout/kit/hooks là các biên được stub, không thay unit đang kiểm. Expected URL/role/nhãn được viết từ spec/task. Các loader cũ đã bổ sung import mới; cập nhật số menu mà giữ các assertion bảo vệ cũ. Không thấy `.skip`/`.only` trong test mới.

6. **Tích hợp — đúng phạm vi.** `test:components` thêm glob P3 và giữ toàn bộ danh sách cũ. Không sửa guard implementation, API, schema, dependency hoặc môi trường. `git diff --check -- Source/frontend` đạt; các cảnh báo CRLF không phải lỗi whitespace.

**Điểm cần kiểm tra giao diện, chưa phải lỗi đã tái hiện:** menu Boss tăng từ 8 lên 10 mục. Header hiện dùng hàng flex, link `white-space: nowrap`, gap tới 30px và chỉ chuyển sang menu thu gọn ở ≤1120px (`Navigation.css:199`). Cần kiểm tra độ rộng khoảng **1121–1279px**, ngoài desktop rộng và 360px, để xác nhận không tràn ngang; tôi chưa chạy browser nên không khẳng định đã có overflow.

**Giới hạn:** chưa xác nhận kết quả lint/build/test đang chạy ở phiên chính hoặc kiểm tra trực quan. Phiên chính cần ghi số liệu thực vào checkpoint. BE-P3-27 được owner nghiệm thu riêng; review này không bổ sung kết quả full backend/dev E2E còn thiếu.

### Addendum responsive

**DUYỆT phần bổ sung responsive của FE-P3-01; không có phát hiện source chặn.**

Reviewer GPT kế thừa, chỉ đọc; không sửa file, chạy test hoặc gọi mạng.

1. `StaffLayout` thêm `layout-staff` trên cùng phần tử `.rooms-theme`, giữ `lang="vi"`, menu, provider, Outlet và xử lý liên kết hiện có.
2. Quy tắc `flex-wrap: wrap` giới hạn ở `.rooms-theme.layout-staff` và viewport từ **1121px**. Hàng menu nhân sự có thể xuống dòng khi thiếu chỗ; không ẩn link hoặc nút đăng xuất.
3. Selector không áp dụng cho public/tenant; breakpoint menu di động hiện có không bị thay đổi. Khi `.rooms-nav` dùng `display: contents`, việc wrap diễn ra ở `.rooms-header-panel`; khai báo wrap cho nav cũng hỗ trợ cách bố trí flex cũ.
4. Assertion class của test staff đã cập nhật; assertion theme của tenant vẫn giữ nguyên.

**Giới hạn kiểm chứng:** chưa có browser visual để khẳng định bố cục thực tế tại 1121/1200/360px. Phiên chính đã báo targeted **84/84**, lint/build exit0 trước bản sửa responsive; cần ghi kết quả chạy lại sau sửa từ output thực. Full frontend bị automatic approval review từ chối vì cảnh báo telemetry Visual Studio, nên chưa có kết quả full được xác minh. Không retry hoặc coi scoped tests là full pass.

**Xử lý phiên chính:** đã thêm desktop wrap staff-only theo source review; final84/84,lint0/build0 sau sửa như bảng trên. Full/frontend visual còn thiếu; giữ task chờ kiểm chứng thay vì ghi toàn bộ suite pass.

### Addendum sửa hai expected menu từ kết quả full owner

**DUYỆT bản sửa hai test menu trong `auth-login-flow.test.mjs`; không có phát hiện chặn.**

- Expected tenant thêm đúng “Hợp đồng” → `/thue/hop-dong`.
- Expected staff thêm “Hợp đồng” và “Tra cứu xe”, đúng 8 mục cho manager và 10 mục cho Boss.
- Vẫn dùng `deepEqual` toàn bộ menu và kiểm đủ bốn session staff; không nới lỏng assertion hoặc bỏ kiểm tra theme/logo/footer/building hiện có.
- Chỉ sửa tên test và expected theo FE-P3-01; không sửa sản phẩm, mock unit đang kiểm hoặc thêm skip/only.

Reviewer chỉ đọc diff, không chạy test. Kết quả full owner cung cấp vẫn là **879 test, 877 pass, 2 fail trước sửa**. Kết quả scoped sau sửa phải ghi riêng; chưa đủ bằng chứng ghi full 879/879 pass hoặc đóng FE-P3-01.

**Xử lý phiên chính:** scoped2/2 và lint0 đã lấy từ output thực sau sửa. Thêm LESSONS về việc tìm tất cả exact-menu assertions, bao gồm bộ mount auth-login-flow. Chờ owner full mới và kiểm menu theo hướng dẫn trên.

## Commit đề xuất sau nghiệm thu

```text
feat(contracts): add phase routes and menus (FE-P3-01, UI-02, AUTH-06)
```

BE27 và FE01 đang cùng uncommitted theo yêu cầu tiếp tục của owner; không tự tạo hai commit hoặc stage file thay owner. Dừng checkpoint FE-P3-01, bước tiếp theo sau owner kiểm/commit là FE-P3-02.
