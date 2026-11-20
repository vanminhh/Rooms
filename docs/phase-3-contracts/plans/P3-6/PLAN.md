# P3-6 — Frontend nhân sự: hợp đồng và tra cứu xe

Ngày 20/11/2026. Planner: GPT kế thừa của phiên Codex, không phải Opus 5. Chỉ lập kế hoạch; không chạy kiểm thử hoặc thay đổi mã ứng dụng.

Owner nói **“chốt BE p3 27 làm tiếp”**. Ghi nhận nghiệm thu của owner, tách biệt với kết quả kiểm thử: không có output full backend hoặc E2E dev mới trong lời xác nhận này. HEAD lúc chuyển phần vẫn `b904ece`; bộ thay đổi BE-P3-27 đang chờ commit và đã được owner cho tiếp tục. Không tự tạo commit hoặc coi Git đã sạch. Lượt này main session chỉ triển khai **FE-P3-01**, rồi dừng ở checkpoint của task đó.

## 1. Nguồn và ranh giới

- Quy trình: root `AGENTS.md`/`CLAUDE.md`, `Source/frontend/CLAUDE.md`, `docs/LESSONS.md`, `feature_p3-6-frontend-staff.md`.
- Nghiệp vụ: `docs/spec/14-contracts.md`, phần BIL-10/11 của `16-billing.md`, VIEW-05/06 của `13-viewings.md`, `00-overview.md` D-35..39/D-41/A-18/Q-15/G-01/G-03; `30-frontend.md` và `31-ui-kit.md`.
- Code thật: `src/app/routes.tsx`, layouts, kit exports, `shared/api.ts`, formatters/status-labels/form-errors/i18n, upload phòng, ViewingCard/dashboard, các controllers/DTO/serializers backend contracts/files/billing/viewings.
- UI chỉ dùng kit hiện có, token trong `.rooms-theme`. Không thêm palette, framework hoặc một thư mục component chung khác. Component riêng hợp đồng nằm trong `src/features/contracts/`; component dùng nhiều feature phải theo KIT-07.
- FE hiển thị dữ liệu và lỗi từ API. Không tự tính giá, ngày kết thúc hợp đồng, quyết toán hoặc trạng thái nghiệp vụ. Tiền nguyên đồng; ngày hiển thị qua shared formatter.
- Không làm tenant screens P3-7, renewal, monthly billing, webhook, move-out settlement hoặc backend trong P3-6. Khung route/menu tenant là phần duy nhất FE-P3-01 chuẩn bị cho P3-7.

## 2. FE-P3-01: route và menu của toàn phase

Giữ nguyên bốn nhóm root theo thứ tự public, `/thue`, `/ql`, `/toi`; giữ auth, forced-password và Boss-only guards hiện có. Thêm các children vào đúng nhóm hiện có, không đặt một bản sao route không được bảo vệ ở public.

| URL | Guard/layout đang có | Trang ở FE-P3-01 | Task hoàn thiện |
|---|---|---|---|
| `/ql/hop-dong` | MANAGER/BOSS → StaffLayout | Danh sách hợp đồng, placeholder riêng | FE-P3-03 |
| `/ql/hop-dong/moi` | MANAGER/BOSS → StaffLayout | Tạo hợp đồng, placeholder riêng | FE-P3-04 |
| `/ql/hop-dong/:id` | MANAGER/BOSS → StaffLayout | Chi tiết hợp đồng, placeholder riêng | FE-P3-06/07 |
| `/ql/hop-dong/:id/in` | MANAGER/BOSS → StaffLayout | In hợp đồng, placeholder riêng | FE-P3-05 |
| `/ql/xe` | MANAGER/BOSS → StaffLayout | Tra cứu xe, placeholder riêng | FE-P3-08 |
| `/thue/hop-dong` | TENANT → TenantLayout | Danh sách, VI/EN | FE-P3-12 |
| `/thue/hop-dong/:id` | TENANT → TenantLayout | Chi tiết, VI/EN | FE-P3-12 |
| `/thue/hop-dong/:id/in` | TENANT → TenantLayout | In hợp đồng, khung VI/EN; tài liệu VI | FE-P3-13 |

Mỗi URL có tên trang nhận biết được. Có thể tái sử dụng scaffold nội bộ của feature, nhưng không dùng public home `PlaceholderPage` làm nội dung cho tám URL. Khung chưa triển khai hiển thị tiêu đề và trạng thái đang chuẩn bị bằng kit; không có dữ liệu hợp đồng giả, nút ghi tiền hoặc hành động chưa hoạt động. Chưa gọi API hợp đồng/upload/chứng từ trong FE-P3-01.

- StaffLayout thêm **“Hợp đồng” → `/ql/hop-dong`**, **“Tra cứu xe” → `/ql/xe`** cho cả MANAGER/BOSS. Giữ menu Nhân sự/Duyệt giá chỉ Boss và guard trực tiếp theo URL.
- TenantLayout thêm dictionary key `nav.contracts`: VI **“Hợp đồng”**, EN **“Contracts”** → `/thue/hop-dong`. Mọi tiêu đề/copy placeholder tenant lấy từ dictionary; switch ngôn ngữ đổi ngay. Staff luôn VI qua provider hiện có.
- Các trang in sẽ ẩn navigation khi in ở FE-P3-05, không cần thay root routing lần nữa. P3-7 thay nội dung các tenant page exports và dùng chung print renderer; tránh sửa `routes.tsx` hoặc layout/menu trong khi P3-6 còn làm.

## 3. Trạng thái dùng chung (UI-02)

VI dưới đây là đúng nhãn trong spec 14 và 16. EN là bản dịch UI thông thường để dùng tại tenant; spec không có cột EN bắt buộc. Thêm dictionary keys cùng kiểu kiểm tra key hiện có; không hard-code EN ở page. Giữ các map room/viewing/approval cũ.

| Nhóm | Giá trị API | VI từ spec | EN UI | Tone kit đề xuất |
|---|---|---|---|---|
| Contract | HOLD | Giữ chỗ | On hold | reserved |
| Contract | ACTIVE | Đang hiệu lực | In effect | occupied |
| Contract | ENDED | Đã kết thúc | Ended | maintenance |
| Contract | CANCELLED | Đã hủy | Cancelled | maintenance |
| Invoice | DRAFT | Nháp | Draft | maintenance |
| Invoice | UNPAID | Chưa thanh toán | Unpaid | reserved |
| Invoice | PAID | Đã thanh toán | Paid | available |
| Invoice | SETTLED | Đã quyết toán | Settled | occupied |
| Invoice | CANCELLED | Đã hủy | Cancelled | maintenance |
| Invoice, derived label | overdue | Quá hạn | Overdue | reserved |

Tone là lựa chọn trình bày trong bốn tone `available/occupied/reserved/maintenance` của StatusBadge, không phải enum mới hoặc thay đổi trạng thái DB. Hiển thị cả text và màu. `OVERDUE` **không** được thêm vào `InvoiceStatus`: backend lưu năm trạng thái nêu trên; quá hạn là nhãn suy ra. FE-P3-01 chỉ khai báo nhãn/tone cho nó, không tính quá hạn theo ngày ở đây.

Ưu tiên `ContractStatus`/`InvoiceStatus` union và map có type checking trong `shared/status-labels.ts`; hàm hoặc key để dịch theo locale có thể bổ sung tại đó, tránh page tự tạo map khác. Tenant hiển thị nhãn dịch, còn bản in hợp đồng vẫn VI (LOC-06).

## 4. FE-P3-02: client và upload, khớp backend hiện có

Mọi đường dẫn dưới đây được `shared/api.ts` gắn `/api/v1`, Bearer, refresh và Accept-Language. Envelope là `{ data, meta? }`; dùng `listPath` cho endpoint phân trang, không gắn page/limit vào endpoint không nhận chúng. Query keys gồm building selection/id; invalidate các danh sách/detail/dashboard liên quan sau mutation.

| Client | API hiện có | Hợp đồng dữ liệu quan trọng |
|---|---|---|
| List staff | `GET /contracts` | query `buildingId?`, `status?`, `q?`, `sort=createdAt|-createdAt`, `page/limit`; meta phân trang |
| Detail staff | `GET /contracts/:id` | summary + terms/signedAt/movedInAt; occupants, vehicles, services và `depositInvoice` |
| Create | `POST /contracts` | roomId, signer, startDate, termMonths, deposit?, serviceIds[], terms?, viewingId?, confirmedGuestAccountId?, confirmDifferentViewingOwner? |
| Sign | `POST /contracts/:id/sign` | `{assetId, publicId, version, format}`; returns summary/signedAt/depositInvoice và optional `temporaryPassword` |
| Print | `GET /contracts/:id/print` | `{content: string, isDraft: boolean}`; plain text đã được BE điền/định dạng |
| Scan | `GET /contracts/:id/scan` | signed `{url, expiresAt}`; fetch khi người dùng bấm xem |
| Password reset | `POST /contracts/:id/reset-password` | `{temporaryPassword}` một lần; pending account có thể CONFLICT_STATE |
| Move-in | `POST /contracts/:id/move-in` | electric, water, readOn, note?; electricReplacement?/waterReplacement? có oldMeterFinal |
| Cancel | `POST /contracts/:id/cancel` | reason, depositKept?; Idempotency-Key; status/depositInvoice/settlement từ BE |
| Occupants | `GET/POST /contracts/:id/occupants`, `PATCH /contracts/:id/occupants/:oid` | create fullName/moveInDate, optional phone/dateOfBirth/idNumber/idFront/idBack/moveOutDate; không gửi isSigner |
| ID photos | `GET /contracts/:id/occupants/:oid/id-photos` | chỉ staff trong scope, URL ≤300s, audit mỗi lần; không preload |
| Contract vehicles | `GET/POST /contracts/:id/vehicles`, `PATCH /contracts/:id/vehicles/:vid` | plate/type/serviceId/registeredAt?; stop bằng isActive:false và removedAt?, đăng ký lại bằng POST mới |
| Vehicle lookup | `GET /vehicles?plate=&isActive=&page=&limit=` | chỉ kết quả trong scope; không tự thêm buildingId vì DTO lookup hiện không nhận |
| Contract services | `GET/PATCH /contracts/:id/services` | PATCH `{serviceIds:number[]}` là full set, gồm [] để bỏ hết; ROOM/PERSON cùng tòa, rate đã duyệt |
| Deposit payment | `POST /invoices/:id/payment` | method CASH/BANK_TRANSFER/CARD/OTHER, paidAt?, note?; Idempotency-Key; không gửi số tiền do BE lấy invoice total |
| Dashboard | `GET /dashboard?buildingId=` | giữ các trường cũ; thêm `depositCancelledViewings:{count,items}`, `unpaidDeposits:{count,items}` |
| Called | `POST /viewings/:id/called` | đánh dấu đã gọi, rồi invalidate dashboard/viewings |

Nguồn exact DTO/response: `Source/backend/src/modules/contracts/{contracts.controller,me-contracts.controller,contract-occupants.controller,contract-services.controller,contract-vehicles.controller,contracts.service,contract-documents.service,contract-cancel.service,contract-password.service,deposit-invoice}.ts`, thư mục `dto/`; `billing/invoices.controller.ts`, `notifications/dashboard.service.ts`, `viewings/viewings.controller.ts`.

Detail/summary không có full CCCD, asset references private hoặc mật khẩu cũ. Tenant detail ẩn last4 của roommate theo serializer; không cố khôi phục từ field khác. Payment/deposit QR dùng đúng `depositInvoice.vietqr` và `qrImageUrl` của BE; không tính lại `TT{id}` hoặc bank/amount ở component.

API tenant P3-7 dùng `GET /me/contracts`, `GET /me/contracts/:id`, `GET /me/contracts/:id/print|scan`, `POST /me/contracts/:id/occupants`; FE-P3-02 có thể cung cấp types/functions dùng chung nếu thuận tiện nhưng không dựng tenant nghiệp vụ ở P3-6.

### Upload

Mở rộng `src/features/rooms/upload.ts` với purpose có type, vẫn giữ lời gọi và hành vi ROOM_IMAGE hiện có. Không sửa flow phòng thành private.

- ROOM_IMAGE ký `{purpose:'ROOM_IMAGE', roomId}` và giữ transformation/giới hạn ảnh hiện tại.
- CONTRACT_SCAN/ID_PHOTO ký `{purpose, contractId}`; response private có `type:'authenticated'`, `publicId` và các tham số đã ký, không được bỏ chúng khi tạo FormData. Không thêm roomId vào private request.
- Scan nhận jpg/png/webp/pdf, ID_PHOTO nhận jpg/png/webp. Lấy size policy/field signature từ backend files code khi triển khai, không suy ra limit PDF từ ROOM_IMAGE.
- Upload trực tiếp Cloudinary không Bearer/cookie, rồi chỉ gửi assetId/publicId/version/format về BE. Không gửi delivery URL, không tự ký URL hoặc lưu khóa/CCCD/plaintext vào storage/log.

## 5. Các checkpoint sau FE-P3-01

| Task/checkpoint | Màn hình/thành phần và hành vi | Kiểm chứng bắt buộc |
|---|---|---|
| FE-P3-01 ⏸ | 8 route, 3 menu links, status/dictionary maps, thêm `tests/p3/*.test.mjs` vào script | wiring + guards + menus VI/EN + labels; lint/build/full frontend components; dừng owner kiểm/commit |
| FE-P3-02 | `features/contracts/api.ts` và types; mở rộng upload theo purpose | từng route/payload/header/query/normalization; hồi quy room upload |
| FE-P3-03 | Contracts list: tòa, status, search name/phone/room; loading/empty/error+retry/data; ViewingCard Chốt cho CONFIRMED/DONE | list states, selection/query, prefill identity/room/viewing từ dữ liệu có sẵn; không bật NEW/WON/LOST/CANCELLED |
| FE-P3-04 ⏸ | Form create RHF+zod; room/signers/dates/term/deposit/services; xử lý các nhánh tài khoản và owner của viewing | field errors, PHONE_TAKEN guest confirmation, account locked/staff phone, confirmDifferentViewingOwner; desktop manual; chốt FE01..04 |
| FE-P3-05 | Print renderer riêng feature dùng chung staff/tenant; render plain text, draft banner, In/Lưu PDF; @media print từ token | filled content/isDraft, no HTML injection/evaluation; browser print preview |
| FE-P3-06 | Sign/upload scan, temporary password trong local component state, copy; deposit QR và payment confirm | không storage/query cache password, route leave/reload xóa; pending+ref chống double click, cùng idempotency key cho retry cùng operation; API error message |
| FE-P3-07 ⏸ | Move-in/cancel/reset; occupants/photos; vehicles/services; scan view | move-in DEPOSIT_NOT_PAID/METER_VALUE_DECREASED, note >3 ngày, scope/capacity; private assets fetched chỉ click; tiền refund từ BE; chốt FE05..07 |
| FE-P3-08 | Vehicles lookup, thêm hai card dashboard cọc chưa thu/khách cần gọi, Đã gọi | phân trang/scope/literal plate, loading/error/empty/data; update API fixture và `fe12-dashboard.test.mjs` |
| FE-P3-09 ⏸ | Toàn bộ P3-6 | lint/build/full components thật; manual hai workflow dev và print, deposit/move-in 360px; dừng nghiệm thu part |

Giữ A-18 (xác nhận guest account) và các defaults backend A-22..28 như lịch sử đã ghi. Không suy ra lời chốt BE27 là câu trả lời riêng cho từng assumption. Occupant PERSON fee, parking monthly charge và tháng lẻ vẫn thuộc Phase 4, không tính trong các form.

## 6. Kiểm thử FE-P3-01 và hồi quy

Test mới trong `Source/frontend/tests/p3/`, chạy Node test runner + TypeScript transpile loader hiện có; không cài framework/dependency. Expected statuses/URLs/roles dựa spec/task, không import expected từ map đang kiểm.

1. Compile route source không đổi, stub các page/layout ngoài biên; chứng minh đủ tám path dưới đúng RequireAuth + layout. Kiểm guest/tenant không vào staff và staff/guest không vào tenant bằng guard thật; signed-out next URL, forced password, Boss-only pages không bị mất.
2. Route `moi` không bị mất bởi `:id`; kiểm đủ đường dẫn in. Không thêm root group làm đổi `routes[0..3]`.
3. Compile/render layout thật với auth/router/kit edges như test cũ: cả MANAGER/BOSS có Hợp đồng/Tra cứu xe; tenant có Contracts đúng href khi EN và Hợp đồng khi VI. Staff text không đổi sang EN. Kiểm click navigation nội bộ theo helper hiện có.
4. Render placeholder exports hoặc dùng DOM harness cho tiêu đề/copy đúng locale, có `.rooms-theme` ở layout, không phát sinh API private/mutation trong skeleton. Không cần kiểm demo data hay viết test trùng markup chi li.
5. Status maps có đúng bốn contract/five invoice states, exact VI labels, dictionary EN đầy đủ; tone thuộc bốn tone kit; overdue tách khỏi stored enum và chỉ có label.
6. Thêm glob `tests/p3/*.test.mjs` vào `package.json` **test:components**, giữ toàn bộ danh sách cũ.

Loader hồi quy cần sửa đồng thời:

- `tests/auth-guards.test.mjs` và `tests/p2/cp1-routes.test.mjs` có dictionary stub page imports tường minh. Thêm tất cả import page mới vào đúng loader; giữ assertions cũ, không bỏ/skip để qua test.
- `tests/auth-login-flow.test.mjs` có kit/layout loader riêng; nếu import mới ở layout thì bổ sung stub cần thiết (LESSONS LanguageSwitch). Hạn chế đưa page import hoặc feature API vào layout.
- `tests/p2/public-dom.mjs` fake DOM dùng cho trang về sau; nếu test form numeric select cần đúng type/select behavior, không sửa shared DOM chỉ để chữa một test. Bộ FE01 có thể test JSX/wiring mà không thêm fetch vào harness.
- Dictionary typed `en: Record<keyof typeof vi,string>`: thêm đầy đủ hai ngôn ngữ một lượt và chạy existing i18n tests.

Lệnh từ `Source/frontend` sau implementation ổn định:

```powershell
node --test tests/p3/*.test.mjs tests/auth-guards.test.mjs tests/p2/cp1-routes.test.mjs
npm run lint
npm run build
npm run test:components
```

Chỉ ghi counts/duration/exit code từ output thực. Các con số 864/864 cũ hoặc BE27 scoped58 không phải kết quả FE-P3-01. Không skip/only/mock unit under test. Nếu có block môi trường thì ghi đúng block và làm phần xác minh độc lập còn được phép, không vòng qua rejection.

Manual FE01: Boss/Manager mở menu và năm staff URLs; TENANT VI/EN mở ba tenant URLs; guest/signed-out/wrong role gõ thẳng URL phải theo guard; kiểm keyboard và menu trên 360px. Placeholder không chứng minh backend workflow đã chạy.

## 7. Câu hỏi và khoảng trống cần giải quyết đúng checkpoint

**Không có câu hỏi nghiệp vụ chặn FE-P3-01.** Routes/menu/status label đã được task/spec xác định; không cần hỏi owner chọn lại.

Các vấn đề phần sau cần hỏi trước khi tự phát minh cách làm:

1. **Trước FE-P3-04 — ngày kết thúc trên form.** Task yêu cầu hiện ngày BE tính; controller hiện chỉ có POST create rồi trả endDate, chưa có preview/dryRun trước lưu. UI-06 cấm FE tự viết lại phép tính D-41. Cần owner chọn hiển thị endDate sau create, hoặc cho phép bổ sung backend preview trong task riêng. Không tự tạo endpoint hoặc tính FE tại FE01.
2. **Trước FE-P3-07 — refund trước khi xác nhận hủy.** Backend POST cancel hiện tính net và ghi cancellation/settlement cùng lúc; chưa có cancel-preview. `GET /contracts/:id` trả deposit invoice nhưng không có breakdown theo depositKept dự kiến. Cần quyết định API preview riêng để đáp ứng UI-04/UI-06 hoặc điều chỉnh UX với owner. Không gọi POST cancel để “preview”, không tự trừ tiền nghiệp vụ ở FE rồi coi đó là số BE duyệt.
3. **Q-15 — mẫu thật** vẫn mở nhưng không chặn code: dùng draft và banner bắt buộc; chỉ owner cung cấp nội dung thật sau. Không bỏ banner hoặc coi tài liệu nháp là đã ký thật.

Nếu phát hiện khác biệt response với plan tại bước triển khai sau, đọc serializer/DTO/test backend hiện tại và cập nhật contract trước; không tạo trường/API giả từ spec roadmap. Mọi thay đổi schema/dependency/env vẫn theo thẩm quyền riêng, không nằm trong việc lập plan này.

## 8. Báo cáo và trạng thái

Tại FE-P3-01, main session cập nhật feature task/PROGRESS/checkpoint với files, output thật, manual checks, assumptions trình bày nếu có và commit gợi ý `feat(contracts): add phase routes and menus (FE-P3-01, UI-02, AUTH-06)`. Không tự stage/commit/push. Reviewer đọc độc lập trước checkpoint nếu thay đổi authorization hoặc được AGENTS yêu cầu; full report ghi trong checkpoint, model thực ghi đúng khả năng phiên.

Sau FE01 được owner kiểm/commit, P3-7 có thể bắt đầu nội dung tenant theo ownership file đã phân định. Lượt hiện tại dừng tại FE01, không tự làm FE02..09 hoặc claim toàn P3-6 xong.
