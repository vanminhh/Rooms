# P5-2 · Gia hạn hợp đồng (backend)

## 1. Mục tiêu và phạm vi

BE-P5-05..09 triển khai M1, tạo, in, ký và hủy gia hạn, chặn quyết toán khi còn gia hạn đã ký, kiểm lại chuyển ca và nhắc hết hạn. Nguồn chính: D-13, D-45 (1), (9), (10), CON-06/08/12/17..22, BIL-03..06/13/17/21, DB-07/DB-B1/DB-B5/DB-B7/DB-B8, NOTI-05/06 và AUD-01/03. REQ-04 và liên kết `requests.payload.contractId` thuộc P5-3; giao diện thuộc P5-6. D-45 và các câu Q-P5-1..16 đã chốt. Chủ dự án chọn phương án A cho Q-P5-17 về điều khoản bổ sung.

P5-1 có commit `9b67fa3` tại thời điểm lập kế hoạch. M1 trong tài liệu này là **migration index**. Điểm dừng **M2** trong `PROGRESS.md` là nghiệm thu cả P5-2. Chủ dự án đã duyệt tạo M1 và kiểm offline. Trình tự là tạo M1 và kiểm offline → trình kết quả và xin lượt duyệt áp M1 riêng → áp lên dev và kiểm lại → BE-P5-06, 07, 08 → BE-P5-09/reviewer → chủ dự án kiểm và commit → P5-3.

## 2. Kiến trúc

~~~mermaid
flowchart LR
  subgraph API["API nhân sự"]
    Create["Tạo, in, ký, hủy"]
    Settle["Quyết toán"]
  end
  subgraph Jobs["Tác vụ theo ngày Hà Nội"]
    Monthly["Hóa đơn tháng và chuyển ca"]
    Expiry["Dashboard và nhắc hết hạn"]
  end
  Create --> Contracts["Hợp đồng và dữ liệu liên quan"]
  Settle --> Contracts
  Monthly --> Contracts
  Contracts --> Expiry
~~~

Các đường dẫn dưới đây tính từ `Source/backend/` trừ khi ghi rõ.

| Tệp | Việc dự kiến |
|---|---|
| `prisma/constraints.sql`, `prisma/migrations/<timestamp>_renewal_open_room/migration.sql`, `prisma/check-constraints.mjs` | Thay đúng predicate của index phòng và kiểm các ca DB-07. Migration thay index trong cùng transaction. |
| `src/modules/contracts/contracts.controller.ts`, `contracts.service.ts`, `dto/renew-contract.dto.ts` | Route gia hạn mỏng, tạo bản HOLD từ hợp đồng nguồn, chặn tạo hợp đồng mới khi phòng còn HOLD gia hạn và phối hợp khóa cho ký. Dùng lại serializer, mã `HD`, ngày nghiệp vụ và ghi audit `contract.create` trong transaction. |
| `src/modules/contracts/contract-documents.service.ts` | Bản in dùng người ký của hợp đồng gốc trong khi gia hạn chưa có người ký trong `occupants`. Giữ kiểm tra quyền trên hợp đồng gia hạn và chỉ đưa bốn số cuối CCCD vào bản in. |
| `src/modules/contracts/contract-cancel.service.ts`, `src/modules/billing/settlement.service.ts` | Xem trước và hủy gia hạn HOLD với số cọc nhận bằng 0. Guard quyết toán dùng chung cho xem trước và ghi thật. |
| `src/common/errors/all-exceptions.filter.ts` và spec liên quan | Bộ lọc hiện dựng `error.message` từ mã lỗi. Truyền thông báo riêng của guard qua trường được kiểm soát và chỉ nhận từ lỗi ứng dụng tin cậy. Kiểm qua HTTP để bảo đảm thông báo `CONFLICT_STATE` thông thường vẫn dùng catalog. |
| `src/modules/billing/renewal-switch.ts`, `src/jobs/monthly-invoice.job.ts` | Kiểm lại BIL-06 qua luồng thật. Giữ thứ tự tạo DRAFT rồi mới chuyển. Với switch, kiểm thứ tự khóa và ca dữ liệu CON-19 trước khi sửa, đồng bộ khóa khi tái hiện lỗi. |
| `src/modules/notifications/dashboard.service.ts`, `src/jobs/invoice-reminder.job.ts` | Dùng chung điều kiện vắng gia hạn đang có hiệu lực nghiệp vụ cho các nhóm hết hạn và lời nhắc 30/7. Giữ điều kiện riêng của `renewalsWaiting`. |
| `src/modules/contracts/contracts.renewal.http.spec.ts`, `contracts.service.spec.ts`, `contracts.documents.http.spec.ts`, `contracts.sign.http.spec.ts`, `contracts.cancel.http.spec.ts`, `src/modules/billing/{renewal-switch,settlement.service}.spec.ts`, `src/modules/notifications/dashboard.money.spec.ts`, `src/jobs/invoice-reminder.job.spec.ts`, `test/contracts-renewal.e2e-spec.ts` | Kiểm các hợp đồng API và đường đi qua DB/Postgres thật. Cập nhật các fixture đã kiểm điều kiện cũ. |
| `docs/phase-5-operations/{feature_p5-2-backend-renewal.md,PROGRESS.md,plans/PHASE/PLAN.md}`, `docs/LESSONS.md` | Đồng bộ tên route theo bảng API của spec. Ghi trạng thái task, các lần dừng duyệt, kết quả thật và bài học nếu có lần làm lại. |

### Hợp đồng API

Mọi đường dẫn có tiền tố `/api/v1`. Dùng hash/idempotency hiện có ở luồng hủy và quyết toán theo API-05. Các route nhân sự yêu cầu BOSS hoặc MANAGER trong phạm vi tòa và kiểm phân công hiện tại; sai vai trò 403 `FORBIDDEN`, MANAGER ngoài phạm vi 403 `OUT_OF_SCOPE`, ID không có 404 `NOT_FOUND`, chưa đăng nhập 401 `UNAUTHENTICATED`.

| Điểm vào | Yêu cầu và kết quả |
|---|---|
| `POST /contracts/:id/renew` | `id` là hợp đồng nguồn. DTO `{ termMonths: number, terms?: string \| null }`. Theo D-46 (Q-P5-17), bỏ qua `terms` thì sao giá trị từ hợp đồng nguồn, chuỗi hợp lệ thay nội dung và `null` xóa nội dung. Giữ quy ước kiểm tra trường hợp đồng hiện có cho chuỗi và trả 400 `VALIDATION_FAILED` cho kiểu khác. `termMonths` là số nguyên ≥ 3. BE tính ngày bắt đầu, ngày kết thúc, tiền phòng, cọc, người thuê, phòng, tòa và liên kết nguồn. 201 `{ data: ContractSummary & { previousContractId: number } }`, ngày theo `YYYY-MM-DD`. 400 `CONTRACT_TERM_TOO_SHORT` nếu số nguyên dưới 3. 400 `VALIDATION_FAILED` cho sai kiểu, giới hạn hoặc ngày kết thúc vượt giới hạn. 409 `CONFLICT_STATE` khi nguồn khác ACTIVE hoặc đã có bản gia hạn, kể cả bản đã hủy. Đường dẫn đã đồng bộ với bảng API trong `docs/spec/14-contracts.md`. |
| `POST /contracts` | Dùng DTO hiện tại. Trả 409 `ROOM_NOT_AVAILABLE` khi có hợp đồng ACTIVE hoặc HOLD ở phòng, kể cả HOLD gia hạn có hợp đồng nguồn đã ENDED. Kiểm trước side effect như tạo người thuê hoặc đổi lịch xem. |
| `GET /contracts/:id/print`, `GET /me/contracts/:id/print` | CON-22, 200 `{ data: { content, isDraft } }` và no-store. Người thuê đọc hợp đồng của mình, hợp đồng người khác trả 404. Dùng mẫu hiện có và đúng CCCD đã rút gọn. |
| `POST /contracts/:id/sign` | Dùng `SignContractDto` hiện tại gồm `assetId`, `publicId`, `version`, `format`. 201 như luồng ký hiện tại, gia hạn vẫn HOLD, có `signedAt`, `depositInvoice: null`, không có `temporaryPassword`. 409 `CONFLICT_STATE` nếu đã ký/đã hủy hoặc nguồn đã rời ACTIVE. Giữ lỗi xác minh scan và bảo vệ tài khoản hiện có. `POST /contracts/:id/move-in` giữ guard từ chối gia hạn với 409. |
| `POST /contracts/:id/cancel-preview`, `POST /contracts/:id/cancel` | Dùng `CancelContractDto` hiện tại: `{ reason, depositKept?, expectedDepositReceived? }`, với `expectedDepositReceived` dùng cho ghi. Gia hạn HOLD ký hoặc chưa ký có preview `depositReceived: 0, depositKept: 0, refund: 0, createsSettlement: false`. Cancel trả `status: CANCELLED`, `depositInvoice: null`, `settlement: null` trong response hiện tại. `depositKept > 0` trả 400 `VALIDATION_FAILED`; số cọc kỳ vọng khác 0 hoặc trạng thái đã chuyển ca trả 409 `CONFLICT_STATE`. Giữ lý do hủy, audit và lịch sử liên kết. |
| `POST /contracts/:id/settlement?dryRun=true/false` | Dùng `SettlementDto` hiện tại. Cả hai chế độ trả 409 `CONFLICT_STATE` với `error.message` chính xác **Hợp đồng đã có gia hạn, hãy hủy gia hạn trước** nếu bản kế tiếp là HOLD đã ký. Với HOLD chưa ký hoặc CANCELLED, áp các điều kiện quyết toán BIL-13 thông thường. |
| `GET /dashboard` và job 08:00 | Giữ DTO và cấu trúc các nhóm hiện tại. Các nhóm CON-20/21 và lời nhắc áp cùng tiêu chí. Dashboard chứa hợp đồng ACTIVE chưa quyết toán khi bản kế tiếp vắng hoặc CANCELLED; nhóm sắp hết hạn tính cả hôm nay và +30, quá hạn từ ngày sau `endDate`. Job chỉ nhắc đúng +30/+7, theo người nhận, kênh và cơ chế chống trùng hiện tại. |

### Dữ liệu và khóa

- **Index phòng** trên `contracts(room_id)` có predicate `WHERE status = 'ACTIVE' OR (status = 'HOLD' AND previous_contract_id IS NULL)`. Khóa duy nhất `contracts_previous_contract_id_key` trên `previous_contract_id` giữ tính duy nhất suốt đời của bản kế tiếp. Sau hủy vẫn giữ `previous_contract_id`, `cancel_reason` và lịch sử ký. Điều kiện hết hạn phải phân biệt `nextContract = null` hoặc `nextContract.status = CANCELLED` với bản kế tiếp còn HOLD; chữ ký chỉ là điều kiện của switch, `renewalsWaiting` và guard quyết toán. Thêm ca thử tạo lại sau hủy, tách riêng với ca dashboard/nhắc trở lại.
- **Tạo gia hạn** dùng `contracts` và `contract_services`: cùng `room_id`, `building_id`, `tenant_id`, `rent` và `deposit` của nguồn, `start_date = end_date` nguồn + 1 ngày, `end_date` theo D-41. Giữ khả năng ký muộn theo A-09, tránh dùng nguyên guard `startDate >= today` của tạo mới. Sao các liên kết dịch vụ, sửa qua `PATCH /contracts/:id/services` hiện tại. Lưu `contracts.terms` theo Q-P5-17 và dùng đúng nội dung đã lưu trong bản in gia hạn. In trước khi chuyển ca cần đọc người ký nguồn qua liên kết; danh sách `occupants` được sao khi chuyển ca để tránh nhân đôi người ký. Khi tạo, ký hoặc hủy gia hạn, nguồn cọc vẫn thuộc chuỗi hợp đồng, không tạo hóa đơn `DEPOSIT` hay dòng hoàn cọc.
- **Thứ tự khóa** cho luồng nhân sự là khóa advisory phân công đang dùng → hàng phòng → các hàng hợp đồng theo ID tăng dần → tài nguyên phụ theo thứ tự sẵn có của luồng. Tạo mới giữ khóa phòng khi kiểm mọi HOLD/ACTIVE. Tạo gia hạn kiểm lại phạm vi, ACTIVE và bản kế tiếp sau khi khóa phòng + nguồn. Ký gia hạn xác minh asset ngoài transaction, sau đó khóa phòng và cả cặp, đọc lại nguồn ACTIVE và đích unsigned HOLD rồi ghi. Ký hợp đồng mới giữ luồng cũ. Preview/cancel và quyết toán dùng cùng khóa phòng để tuần tự hóa với ký/chuyển ca. Switch hiện khóa hai hợp đồng trước khi chèn `meter_readings` có FK đến phòng; khi một transaction giữ khóa phòng rồi chờ hợp đồng, FK có thể tạo vòng chờ. Đưa việc khóa phòng trước cặp hợp đồng vào ca đối chứng song song và đồng bộ thứ tự nếu tái hiện. Đọc lại điều kiện sau khóa, giữ thứ tự chuyển nguồn ENDED trước đích ACTIVE và audit trong cùng transaction.
- **Cổng chuyển ca** do BIL-06, Q-P4-15 quyết định: nguồn còn ACTIVE, đích HOLD đã ký, hôm nay từ ngày bắt đầu, hóa đơn `MONTHLY` kỳ N không CANCELLED và đủ chỉ số cuối điện/nước của kỳ đó, kể cả PER_PERSON. Khi thiếu dữ liệu, `switchRenewal` trả `WAITING_FINAL_INVOICE` hoặc `WAITING_HANDOVER_READINGS`, còn `switchDueRenewals` tăng `waiting`. Khi đủ, đặt `moved_in_at = start_date` của đích, sao mốc mở đầu và người còn ở/xe đang hoạt động, giữ lịch sử của nguồn và ghi `contract.renew`. Kiểm riêng người có ngày rời chuyển tiếp bằng mốc ngày nghiệp vụ và kiểm đúng một người ký. D-13 vẫn chặn sinh kỳ ngoài ngày kết thúc của nguồn.
- **Hủy và quyết toán đồng thời**: kiểm lại điều kiện sau khi khóa. Nếu ký giành khóa trước, quyết toán nhận lỗi D-45 (9). Nếu quyết toán hợp lệ hoàn tất trước, ký nhận trạng thái nguồn đã ENDED; HOLD còn lại do nhân sự hủy theo D-45 (10), và vẫn giữ phòng tới khi hủy. Nếu switch hoàn tất trước, hủy thất bại vì bản gia hạn đã ACTIVE. Nếu hủy trước, switch bỏ qua vì bản gia hạn đã CANCELLED. Hủy không thay đổi trạng thái nguồn; nếu nguồn còn ACTIVE, phòng vẫn đang thuê. Nếu nguồn đã ENDED và không còn hợp đồng mở khác, phòng có thể cho thuê lại theo các điều kiện công khai sẵn có.

## 3. Giả định và điều kiện còn chờ

Việc áp M1 lên DB dev vẫn chờ duyệt riêng sau khi có kết quả kiểm offline.

`[ASSUMPTION]` **A-09** cho phép switch muộn không giới hạn 7 ngày; hóa đơn kỳ N vẫn theo BIL-05/BIL-21. **A-06** giữ cách xử lý ngày ở quá hạn khi không có gia hạn: không tự sinh tiền/hóa đơn cho những ngày đó, nhân sự có thể ghi khoản bồi thường có ghi chú khi quyết toán theo spec. Không đưa các giả định của P5-3/P5-4 vào phần này. Q-15 về mẫu hợp đồng thật chỉ chặn dùng để ký thật; test tiếp tục với mẫu nháp.

## 4. Checkpoints

Chạy các lệnh từ `Source/backend`, trừ `git status`/tiến trình chạy ở gốc. CP-1 và CP-2 là điểm dừng duyệt riêng của M1. CP-3 và CP-4 kiểm từng task theo thứ tự; điểm dừng nghiệm thu cả nhóm trong tiến trình là CP-5 (M2).

### CP-1 · Tạo và kiểm migration offline — BE-P5-05

- Điều kiện bắt đầu đã xác nhận: P5-1 đã commit; chủ dự án đã duyệt tạo file migration M1, cập nhật constraint và kiểm offline. Tệp: SQL migration, `constraints.sql`, `check-constraints.mjs`.
- Done when: `node prisma/check-constraints.mjs . prisma` thoát 0, in số đếm thật. Sinh SQL schema hiện tại bằng Prisma `migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` offline; do đây là partial index, kiểm SQL migration riêng trong PGlite bằng bootstrap predicate cũ, áp SQL M1, đối chiếu predicate trong catalog và chạy lại các ca index. Kiểm phạm vi diff gồm đúng thay đổi index; checker schema hiện tại tự nó chưa chứng minh migration đã được áp.
- DB-07/D-45 (1): ACTIVE + gia hạn HOLD cùng phòng được phép; tạo hợp đồng mới HOLD cạnh ACTIVE hoặc HOLD mới có sẵn bị index phòng chặn; thêm ACTIVE thứ hai bị chặn; hai bản kế tiếp cùng nguồn bị unique chặn cả khi bản đầu CANCELLED. Ca SQL cần đi qua đúng index được thử, với fixture hợp lệ cho các FK/CHECK còn lại.
- Dừng, báo cáo số chạy thật và trạng thái chưa áp dev; xin lượt duyệt riêng cho việc áp lên dev. Ghi tiến trình trước báo cáo.

### CP-2 · Áp M1 và kiểm DB dev — BE-P5-05

- Chờ chủ dự án xác nhận duyệt áp M1 lên đúng DB dev. Dùng env do chủ dự án cấp, kiểm trạng thái các migration trước khi chạy; nếu có migration ngoài phạm vi đang chờ, báo lại trước khi chạy lệnh sẽ áp chúng.
- Kiểm chỉ đọc xem DB dev có bản gia hạn HOLD từ trước hay không. Nếu có, triển khai kiểm tra giữ phòng của D-45 (1) trước khi nới index để luồng tạo hợp đồng mới không mở nhầm phòng trong lúc chuyển đổi.
- Done when: chạy Prisma local `migrate deploy`, `migrate status` với cấu hình dev của repo và kiểm chỉ đọc predicate `contracts_one_open_per_room` cùng unique `contracts_previous_contract_id_key` trên dev. Báo kết quả thật của từng bước. Nếu quyền hoặc kết nối chặn, ghi trạng thái BE-P5-05 và giữ mốc này đến khi có bằng chứng.
- Kiểm D-45 (1): catalog dev có đúng index theo migration và unique lịch sử vẫn tồn tại. Không tạo dữ liệu thật chỉ để thử index; các ca ghi đã chạy offline và sẽ có ca e2e riêng.
- Dừng, ghi tiến trình và báo kết quả áp M1 trước khi chuyển sang code tính năng.

### CP-3 · Tạo, in, ký và chuyển ca — BE-P5-06 rồi BE-P5-07

- Tệp: controller, DTO, service contracts, service in, các spec liên quan và switch khi ca kiểm chứng yêu cầu điều chỉnh. Done when: chạy các spec bằng `npm test -- contracts.service contracts.renewal contracts.documents contracts.sign renewal-switch monthly-invoice` với tên file tương ứng, mã thoát 0; ghi kết quả riêng cho từng task.
- CON-17/DB-B1/DB-B5/DB-B7/D-41: cùng phòng/người thuê và cọc (thử cọc 0 và cọc dương), giá giữ giá hợp đồng cũ dù giá phòng đổi, đúng tập dịch vụ và sửa riêng được ở HOLD, không DEPOSIT. Ngày hết hạn `2028-02-28 → 2028-02-29`, `2028-02-29 → 2028-03-01`; đầu tháng, ngày giữa tháng và ngày đã qua đều theo `end_date + 1`. Thử 2/3 tháng, sai kiểu, kỳ quá lớn tạo ngày kết thúc không hợp lệ.
- CON-17/DB-B8/D-45 (1): BOSS và MANAGER đúng tòa thành công; MANAGER tòa khác, TENANT/GUEST, ID không có, nguồn HOLD/ENDED/CANCELLED và hai lượt tạo cùng nguồn cho đúng mã lỗi. Tạo mới với nguồn ENDED + gia hạn HOLD trả `ROOM_NOT_AVAILABLE` và không đổi lịch xem/tài khoản. Lỗi audit làm rollback các bản ghi liên quan.
- Q-P5-17/CON-22: thử bỏ qua `terms` khi nguồn có nội dung và khi nguồn là `null`, gửi chuỗi thay nội dung, gửi `null` xóa và gửi sai kiểu trả 400. In bản gia hạn phải dùng giá trị đã lưu, hợp đồng nguồn vẫn giữ điều khoản của nó.
- CON-06/08/18/22: in trước ký trả đúng người ký từ nguồn, chỉ lộ bốn số cuối CCCD, đọc chéo sai quyền; ký bản scan riêng tư hợp lệ giữ HOLD, không đổi người dùng, mật khẩu và cọc; lần ký thứ hai hoặc move-in bị chặn.
- BIL-05/06/MTR-02/Q-P4-15/CON-19: job chạy sớm hơn start không chuyển; đúng ngày hoặc quá 7 ngày vẫn chuyển khi đủ điều kiện; thiếu/hủy kỳ N hoặc thiếu một số bàn giao thì chờ và lần sau thử lại; kỳ N DRAFT đủ điều kiện, không chờ PAID. Thử mốc 00:00 Hà Nội, nước PER_PERSON, đúng hai reading mở đầu, đúng một người ký, người còn ở và xe đang hoạt động chuyển đúng một lần. Hai job song song cho đúng một chuyển ca và một audit.

### CP-4 · Hủy, guard quyết toán, dashboard và nhắc — BE-P5-08

- Tệp: cancel/settlement, bộ lọc lỗi nếu cần hợp đồng HTTP, dashboard/reminder và các spec liên quan. Done when: `npm test -- contracts.cancel settlement dashboard.money invoice-reminder all-exceptions.filter` chạy các spec tương ứng, mã thoát 0. Chạy ca song song phù hợp trên PostgreSQL ở CP-5 nếu unit test chỉ kiểm được thứ tự gọi.
- CON-12/D-45 (9)/(10): preview và cancel cho cả HOLD chưa ký và đã ký, lý do bắt buộc, không hoàn cọc/settlement, có audit, retry idempotent sau khi kiểm scope. Hủy ACTIVE sau chuyển ca trả 409. Giữ lịch sử xe và liên kết nguồn; tạo lại từ cùng nguồn sau hủy vẫn 409. Kiểm hủy gia hạn trên nguồn ACTIVE và trên nguồn ENDED, thuê mới được khi nguồn ENDED và gia hạn HOLD đã hủy, theo điều kiện phòng hiện hữu.
- BIL-13/17/D-45 (9): ký song song với quyết toán cho tối đa một luồng thắng. Dry-run và ghi thật bị chặn đều trả đúng câu tiếng Việt trong `error.message`, không ghi settlement/hóa đơn/audit/email. Hủy gia hạn hoặc chỉ có gia hạn chưa ký thì guard này không chặn; các điều kiện BIL-13 khác vẫn kiểm. Ca riêng giữ hành vi quyết toán hợp đồng thường, cọc của chuỗi và thông báo xung đột mặc định.
- CON-20/21/NOTI-05: thử không có kế tiếp, HOLD chưa ký, HOLD đã ký, CANCELLED và đã có settlement. Thử ngày +30, +7, 0, ngày sau khi hết hạn và ngoài cửa sổ, theo Hà Nội. Gia hạn đang HOLD hoặc có settlement loại khỏi danh sách/nhắc; hủy trước giờ job ở mốc hợp lệ thì hiện lại và gửi một lượt đúng người. Không phát bù ngày cũ theo D-44. Xác minh trên fixture tòa ngoài phạm vi; ghi bất kỳ khoảng trống nào còn lại ở báo cáo checkpoint.

### CP-5 · Nghiệm thu M2 — BE-P5-09

- Done when: `npm run lint`, `npm test`, `npm run build`, `node prisma/check-constraints.mjs . prisma` và `npm run test:e2e -- test/contracts-renewal.e2e-spec.ts` có output và mã thoát thật. Chạy e2e từng file; fixture theo mẫu cô lập/rollback hiện có. Khi chạy job thật, giới hạn việc đọc/ghi vào fixture của ca kiểm thử để không xử lý hóa đơn hoặc gia hạn dev ngoài ca.
- E2E CON-17/18/19/BIL-06: tạo → in → ký → job dựng kỳ N → đợi nếu thiếu bàn giao → đủ dữ liệu thì chuyển ca → chạy lại không trùng. Người thuê đọc được hai hợp đồng từ cùng tài khoản; quan sát mốc điện/nước, người ở, xe, cọc và audit. Dùng DB để đối chiếu các cuộc đua tạo/tạo, ký/quyết toán và hủy/chuyển ca bằng dữ liệu thử cô lập.
- Chạy `node --env-file=../.env scripts/e2e/cleanup.mjs` ở chế độ list; kiểm phần của lượt hiện tại. Nếu có dữ liệu cần dọn bằng `--apply`, báo danh sách và xin duyệt riêng trước khi chạy. Reviewer đọc toàn bộ thay đổi chưa commit gồm migration, khóa, scope, tiền và lịch sử; sửa hoặc nêu rõ điểm chặn còn lại, đính toàn văn kết quả.
- Trước điểm dừng, cập nhật tiến trình M2 và trạng thái từng task, nêu kết quả thực, tình trạng M1 trên dev, các khoảng trống BIL-06/CON-20/21 và A-06/A-09. Kiểm tay bằng dữ liệu thử: tạo từ một hợp đồng ACTIVE, mở bản in, ký, kiểm giữ HOLD và không có hóa đơn cọc; sau đó kiểm chuyển ca có bàn giao hoặc hủy để kiểm nhắc và quyền quyết toán. Gợi ý commit `feat(contracts): add renewal workflow (BE-P5-05..09, CON-17..21, BIL-06/13, D-45)`. Chủ dự án kiểm và commit rồi mới chuyển P5-3.
