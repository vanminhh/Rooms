# P3-7 — Hợp đồng của người thuê (FE-P3-10..14)

20/11/2026. Planner GPT kế thừa của phiên Codex, không phải Opus 5. Chỉ lập kế hoạch; không code, chạy test/network hoặc commit.

Owner yêu cầu làm một mạch phần còn lại Phase 3, sau đó nói “tiếp tục đi”. Các checkpoint vẫn ghi kết quả nhưng không dừng chờ commit từng task trong lượt này. Git pending đã biết không phải blocker mới. Giữ nguyên A-25..28; không coi nghiệm thu BE-P3-27 là output full backend/dev E2E mới. Main làm staff trước rồi tenant, không triển khai tenant song song với các file shared đang thay đổi.

## Nguồn và cấu trúc

Theo `feature_p3-7-frontend-tenant.md` và Before you start: root/app instructions, LESSONS, spec14 CON-09/13/15/16/22, spec16 BIL-10, spec30 UI-01/03/07/12, spec01 LOC-01..06 và overview D-26/35..37/40/A-16/G-01/G-03. Backend được đối chiếu tại `contracts.service.ts`, `me-contracts.controller.ts`, `contract-occupants.controller.ts`/service, `contract-documents.service.ts`, `files.controller.ts`/service và auth decorators.

- Dùng ba route wrappers tenant FE-P3-01 đã chuẩn bị; không sửa lại `routes.tsx`/menu khi chỉ thay nội dung.
- Tái sử dụng `features/contracts/api.ts`, `types.ts` của FE-P3-02; hiện chúng mới có API staff. Thêm các hàm `/me` rõ ràng, không truyền cờ giả vai trò hoặc gọi nhầm `/contracts` từ tenant.
- Dùng print renderer, deposit display và component không chứa staff mutation của P3-6. Nếu component có controls staff thì tách phần hiển thị trước khi reuse, tránh chỉ ẩn bằng CSS.
- Mọi fixed copy tenant vào dictionary VI/EN. Text hợp đồng do người dùng nhập và tài liệu in giữ nguyên tiếng Việt; tiền/ngày dùng formatter chung, không đổi tiền tệ theo ngôn ngữ.

## API và quyền truy cập thực tế

`shared/api.ts` đã cung cấp `apiRequest`, `apiRequestPage`, `listPath`, Bearer/refresh và Accept-Language. Query keys phải phân biệt tenant/session và contract id; dữ liệu tenant cũ không được xuất hiện khi đổi tài khoản hoặc đổi hợp đồng.

| Hàm cần thêm | Endpoint hiện có | Dữ liệu/quyền |
|---|---|---|
| listMyContracts | `GET /me/contracts?page=&limit=` | ContractSummary[], meta phân trang; tenant_id từ session, không nhận tenantId query |
| getMyContract | `GET /me/contracts/:id` | ContractDetail; người khác hoặc id không tồn tại đều 404 |
| getMyContractPrint | `GET /me/contracts/:id/print` | `{content,isDraft}` đã được BE điền; không HTML từ mẫu |
| getMyContractScan | `GET /me/contracts/:id/scan` | `{url,expiresAt}`, chỉ fetch khi bấm xem, URL tối đa300s |
| createMyOccupant | `POST /me/contracts/:id/occupants` | CreateOccupantInput được allowlist như occupantBody; không gửi isSigner, tenantId, contractId trong body |

Các GET `/me/contracts` dùng TENANT-only decorator; GUEST không được đọc. `getMine` chỉ tìm `tenantId=actor.id`. Detail trả dates dạng YYYY-MM-DD, signedAt/movedInAt nullable, services, vehicles và depositInvoice nullable. Serializer **chỉ giữ CCCD last4 của signer**; last4 roommate luôn null. Không có full CCCD, ảnh private, mật khẩu cũ hoặc asset refs trong read model.

POST roommate có fullName và moveInDate bắt buộc; phone/dateOfBirth/idNumber/idFront/idBack/moveOutDate tùy chọn theo DTO hiện có. Owner đã chốt thêm trực tiếp không cần duyệt; HOLD/ACTIVE-only và capacity inclusive từ backend A-25/26 giữ nguyên. Tenant không có quyền PATCH occupant, sửa xe, đổi dịch vụ, ký hợp đồng hoặc ghi tiền cọc.

### Khoảng trống upload ảnh roommate cần hoàn thiện

Đã kiểm source: `POST /files/sign` hiện chỉ BOSS/MANAGER; `signContractUpload` chỉ kiểm building scope, chưa kiểm tenant ownership. Vì vậy frontend tenant không thể dùng endpoint staff hiện tại để lấy signature ID_PHOTO, dù POST roommate đã nhận metadata tùy chọn.

Để hoàn thiện đúng luồng CON-13/15 đã được owner chốt, cần một endpoint ký **ID_PHOTO-only** cho tenant, ví dụ `POST /me/contracts/:id/id-photo-sign`, hoặc một nhánh tương đương có cùng kiểm soát:

- TENANT-only; own contract theo tenantId từ auth và status HOLD/ACTIVE trước khi ký; foreign/not-found trả404.
- Purpose cố định ID_PHOTO; không cho tenant ký ROOM_IMAGE hoặc CONTRACT_SCAN, không nhận asset folder/publicId tùy ý từ client.
- Reuse policy/signature helper sau khi kiểm ownership, không dùng buildingIds rỗng để giả staff scope. Metadata sau upload vẫn được BE xác minh purpose/folder/contract như hiện tại.
- Mở rộng API client/upload hiện có và test backend authorization/namespace trước khi mở hai input ảnh trên tenant form. Không có schema/dependency/env change.

Đây là gap kỹ thuật trong luồng đã được cho phép, không phải lựa chọn phí/approval mới. Main xử lý trong phạm vi Phase3; nếu chưa triển khai được thì báo phần upload chưa hoàn tất, không fake signature hoặc gọi staff route rồi coi form đã xong.

## Thứ tự thực hiện

| Task | Triển khai | Bằng chứng cần có |
|---|---|---|
| FE-P3-10 | Thêm API `/me` và dictionary cho overview/list/detail/roommate/print shell; status dùng shared map/tone và dịch VI/EN từ FE01 | route/payload/query tests; Accept-Language/errors; dictionary keys đầy đủ và scan file mới |
| FE-P3-11 | TenantHomePage thành overview thực; query danh sách và detail đang chọn; room switcher nếu nhiều hợp đồng | trước/ sau move-in, hai hợp đồng, chỉ history, none; pending/error+retry/data; format tiền/ngày giống VI/EN |
| FE-P3-12 | Danh sách current/past, detail, term/deposit/occupants/vehicles/services, scan click, print link; form roommate optional identity/photos | foreignid404, read-only controls, privacy/scope, capacity/lifecycle errors, successful add invalidates đúng contract/list |
| FE-P3-13 | Wrapper tenant gọi myPrint và dùng shared renderer P3-6; shell VI/EN, tài liệu VI, draft banner | populated/draft/error404 và không HTML injection; print preview chỉ ghi pass khi thực sự xem |
| FE-P3-14 | Lint/build/test:components toàn frontend; tenant flow theo dữ liệu staff tạo, forced first-password, deposit/move-in | desktop/360px VI/EN; thiếu browser/DB ghi giới hạn thực trong QA cuối, không đổi thành pass |

### Overview và danh sách

- Dùng status từ BE: HOLD/ACTIVE là current, ENDED/CANCELLED là history; tenant chỉ history vẫn có trang dùng được theo D-26/A-16.
- Danh sách có pagination/meta đúng API; room switcher không được coi một page20 mặc định là toàn bộ hợp đồng. Có thể tải các page cần thiết bằng meta hoặc cho người dùng phân trang chọn, không âm thầm bỏ room ngoài page đầu.
- HOLD chưa movedInAt: hiển thị ngày vào ở, tình trạng ký/cọc và invoice nếu BE có. UNPAID dùng đúng total/dueDate/vietqr/qrImageUrl/content của BE; copy đúng nội dung đã trả. PAID không dựng QR mới. Unsigned/deposit0 khi invoice=null không giả lỗi hay hóa đơn0.
- ACTIVE/movedInAt có summary hợp đồng; ENDED/CANCELLED không gọi “đang thuê”. Đổi selection phải đổi detail/loading/error theo id, tránh giữ thông tin phòng trước dưới tiêu đề phòng mới.
- Term hiển thị start/end/termMonths/status API. Hiện read model chưa có percent/remainingDays: không tự tạo công thức thời hạn ở FE. Nếu cần progress số, bổ sung read-only BE read field/preview dùng date helper theo kế hoạch toàn Phase3; không invent ngày/điểm bắt đầu khác D-41.

### Detail và roommate

- Thông tin signer hiển thị last4 đã mask; roommate không hiện last4 dù dữ liệu fixture vô tình có giá trị. Vehicles chỉ xem, gồm trạng thái và lịch sử ngày. Không nút “Cập nhật xe”, gia hạn, trả phòng hoặc approval requests Phase5.
- Scan chỉ fetch URL khi click. Không gọi staff id-photo endpoint hoặc render ảnh CCCD của bất kỳ người ở nào trên tenant detail. Không cache URL private vào storage, log, permalink hoặc dữ liệu lâu dài; lỗi/expired thì xin URL mới khi user chủ động xem lại.
- Form roommate dùng RHF/zod mirror DTO; idNumber nhập mới được giữ tạm trong form để gửi, không lấy số cũ từ API, không echo lên summary. Clear/reset full CCCD và metadata ảnh sau thành công/đổi contract/rời page. Hai ảnh là upload optional, không phải viewer của ảnh đã lưu.
- Không có ảnh/CCCD vẫn thêm được người. Không tạo xe tự động từ roommate. Không tính thêm tiền tháng ở FE; hiển thị validation/lifecycle/capacity từ BE bằng error.message và field mapping theo locale.
- Sau mutation invalidate myDetail và các myList/overview phù hợp; không lưu response form identity trong query cache rộng hơn. Tenant nhận hasIdFront/hasIdBack không phải quyền xem lại ảnh.

## Kiểm thử và hồi quy cụ thể

Thêm Node tests trong `tests/p3/` bằng harness hiện có, không cài jsdom/framework. Reuse `tests/p2/public-dom.mjs` và cách thiết lập page/i18n/auth trong `tests/ex/ex3-auth-pages.test.mjs`; kiểm export helpers thực tế trước import, không tạo harness mới khi chỉ cần thêm fixture.

- Client tests: toàn bộ `/me` URLs, pagination query, allowlist occupant metadata, không gửi role/tenantId/cross-contract field; không gọi staff API.
- Page tests: overview before/after, deposit UNPAID/PAID/null, switch room, only history/none, pending/error retry; list/current/past/pagination; foreignid404 không rơi vào crash chung.
- Tenant privacy: không full stored CCCD/asset refs/photo URLs trong DOM; signerlast4 thôi, roommate khônglast4; chỉ scan click gọi signed endpoint; readonly vehicle không POST/PATCH. Không assert full CCCD nguyên văn khi failure có thể in assertion values; dùng boolean leak checks.
- Roommate: không identity vẫn thành công, optional numbers/photos, wrong type/format/too large bị chặn trước upload, foreign/ended/capacity errors, reset sensitive inputs, no approval request hoặc fee math. Private-sign endpoint backend phải có allowedown/foreign404/GUEST403/HOLD-ACTIVE vs history cases.
- UI-12 scan `tests/ex/ex3-i18n.test.mjs` dùng danh sách file tĩnh: thêm mọi tenant page/feature/schema mới, không chỉ dựa dictionary equality. Shared display dùng trong tenant cũng phải dịch text, trừ nội dung hợp đồng BE có chủ ý giữ VI.
- `tests/auth-guards.test.mjs` dòng test TenantHomePage đang khẳng định “greets ... shows nothing else” bằng loader tối giản. Thay expectation và loader cho overview thực; giữ ý nghĩa greeting/auth ở test thích hợp, không skip.
- `tests/auth-login-flow.test.mjs` fakeFetch dùng tenant home/greeting: trả `/me/contracts` và detail cần thiết hoặc empty list, không để request mới rơi vào generic []/đếm calls auth cũ. Giữ forced-password/login behavior.
- `tests/ex/ex3-auth-pages.test.mjs` hiện render GuestHomePage + TenantHomePage trong cùng fragment với user guest: tách test theo đúng role hoặc cung cấp auth phù hợp để tenant page gọi `/me/contracts` hợp lệ; không coi GUEST được đọc hợp đồng. Cập nhật dictionary/harness fixture, không nới permission thật.
- Print tests cùng renderer P3-6, endpoint tenant và isDraft/content exact; manual preview/360px cần công cụ/thao tác thật mới ghi pass.

Lệnh từ `Source/frontend`: scoped `node --test tests/p3/*.test.mjs` khi source ổn định, rồi `npm run lint`, `npm run build`, `npm run test:components`. Chỉ báo counts/duration/exitcode output thật. Không suy từ full run cũ hoặc đổi test thành skip/only. Lượt backend full bị auto-review chặn trước đây không phải bằng chứng frontend fail/pass; mọi từ chối mới nếu có phải xử lý đúng lý do, không vòng qua.

## Nghiệm thu và câu hỏi

Không có business choice mới chặn P3-7: owner đã chốt roommate trực tiếp/optional identity, xe chỉ xem và billing ở Phase4. Q-15 mẫu thật vẫn nháp, banner bắt buộc. Giữ A-25..28 như lịch sử, không biến thành lựa chọn mới hoặc mở lại câu hỏi đã được giải quyết.

Owner cho làm một mạch: main tiếp tục P3-8 sau phần triển khai tenant, cập nhật task/PROGRESS/checkpoint với kết quả thật và giới hạn browser/DBdev nếu còn. Endpoint upload tenant động đến authorization cần reviewer đọc source và tests đúng AGENTS. Không tự commit/push hoặc ghi manual/dev thành công khi chưa chạy.
