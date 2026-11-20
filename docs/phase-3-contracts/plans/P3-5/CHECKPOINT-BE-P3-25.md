# BE-P3-25 · Đăng ký và tra cứu xe

20/11/2026. Owner báo BE-P3-24 đã commit; Git xác minh **`ee0e891`**, workspace sạch trước task. **BE-P3-25 đã triển khai và kiểm chứng, reviewer DUYỆT; chờ owner nghiệm thu A-27 và commit.** Phạm vi checkpoint gồm phần xe sau BE-P3-23/24 đã commit; chưa mở BE-P3-26.

## Nghiệp vụ owner đã chốt

- **Q-P3-19:** chỉ thêm/sửa/ngừng đăng ký xe trên hợp đồng HOLD/ACTIVE; ENDED/CANCELLED vẫn xem lịch sử.
- **Q-P3-20:** phí gửi xe theo tháng; ngừng giữa tháng vẫn thu tháng đó, từ tháng sau không thu. Đã ghi vào spec CON-14 và billing; **bộ tính hóa đơn tháng vẫn Phase 4**. Lưu removedAt không phải bằng chứng đã tính phí. Giữ D-41 cho tháng lẻ của chính hợp đồng và không sửa hóa đơn đã phát hành.
- **Q-P3-21:** khi hủy HOLD, tự ngừng các đăng ký xe còn hoạt động, giữ lịch sử và giải phóng biển số trong cùng transaction.

## Hành vi và API

| Route | Hành vi |
|---|---|
| GET `/contracts/:id/vehicles` | Staff trong scope; gồm xe đang gửi và lịch sử đã ngừng |
| POST `/contracts/:id/vehicles` | `{ plate, type, serviceId, registeredAt? }`; tạo interval mới |
| PATCH `/contracts/:id/vehicles/:vid` | Sửa xe đang gửi hoặc `{ isActive: false, removedAt? }`; không xóa row |
| GET `/vehicles?plate=...` | Tra cứu từng phần biển số, pagination page/limit, mặc định xe đang hoạt động; `isActive=false` xem lịch sử |

Các route nằm dưới `/api/v1`. Chỉ BOSS/MANAGER, có kiểm staff ở cả controller và service. TENANT/GUEST bị FORBIDDEN; không có route tự sửa xe ở `/me` (các request thay đổi xe thuộc Phase 5). Sai tòa OUT_OF_SCOPE; ghép vid khác hợp đồng NOT_FOUND. BOSS xem được mọi tòa; manager chỉ thấy dữ liệu thuộc request scope và phân công đang còn hiệu lực.

Biển số uppercase, bỏ whitespace, giữ dấu chấm/gạch theo dữ liệu được nhập; tối đa 15 ký tự theo cột DB, không NUL. Type dùng enum VehicleType có sẵn. Dịch vụ mới/chuyển sang phải đang hoạt động, unit VEHICLE và đúng tòa; ROOM/PERSON, tòa khác, bị tắt hoặc không tồn tại đều từ chối với cùng thông báo. Vẫn ngừng được xe đang gắn dịch vụ vừa bị tắt.

Đăng ký trùng biển số đang hoạt động trả `400 VALIDATION_FAILED`, fields.plate = “Biển số đang được đăng ký gửi xe”, không lộ hợp đồng/tòa khác. Dùng partial unique index DB có sẵn, không dựa vào precheck thiếu bảo vệ race. Hỗ trợ Prisma báo tên index hoặc cột plate. Biển số đã ngừng đăng ký lại bằng POST mới; interval cũ được giữ.

Lookup escape `%`, `_`, `\` theo literal, có pagination và no-store. SELECT chỉ trả thông tin xe và hợp đồng/phòng/tòa/liên hệ tối thiểu cần cho staff; không đọc CCCD, private assets, password hay session. Các ngày trả YYYY-MM-DD.

## Transaction và audit

Vehicle write: mapping shared → contract FOR UPDATE → scope/status hiện tại → service FOR SHARE khi gán/chuyển dịch vụ → ghi xe → audit trong cùng transaction. Writer đổi quản lý/tắt tòa/tắt manager dùng mapping exclusive; cancellation cũng khóa contract nên phối hợp với thêm/sửa/ngừng xe.

Create/update/remove ghi `vehicle.create`, `vehicle.update`, `vehicle.remove`, có actor/entity/IP và safe snapshot. Patch rỗng không ghi audit sai. Lỗi audit rollback xe; lỗi ngoài dự kiến được thay bằng INTERNAL_ERROR trước logger.

Hủy HOLD bulk-update đúng xe còn active của hợp đồng thành isActive=false, removedAt=hôm nay Hà Nội. Không đụng xe hợp đồng khác hoặc ghi đè ngày của lịch sử đã ngừng. `contract.cancel` audit có vehiclesRemoved khi có xe được ngừng; response hủy và cơ chế idempotency giữ nguyên. Replay không cập nhật/ghi audit lại. Lỗi audit rollback hợp đồng, xe, quyết toán và idempotency.

## Tệp thay đổi

- `Source/backend/src/modules/contracts/dto/vehicles.dto.ts`: DTO/normalization/validation và query lookup.
- `contract-vehicles.controller.ts`, `contract-vehicles.service.ts`, `contracts.module.ts` cùng thư mục: APIs, scope, locking, audit và unique mapping.
- `contracts.vehicles.http.spec.ts`: 91 ca HTTP mới, real AppModule/guards/service/audit, giả lập biên DB.
- `contract-cancel.service.ts`, `contracts.cancel.http.spec.ts`: ngừng xe cùng hủy; 2 ca mới, suite cancellation hiện 81 ca.
- `Source/backend/src/common/errors/db-errors.ts` và spec: map partial index, 2 ca mới; suite hiện 31 ca.
- Spec overview/contracts/billing, Phase 3 README/task/PROGRESS, plan/checkpoint này và ghi nhận commit ở checkpoint BE-P3-24.

## Kiểm chứng thực tế

Tất cả tại `Source/backend`, source ổn định. Không đọc `.env` hoặc gọi DB dev/dịch vụ ảnh/mail thật.

| Kiểm tra | Kết quả |
|---|---|
| Bộ tập trung đầu | 3 file, **203/203**, 8,01s, start 15:10:19, exit 0 |
| Hồi quy liên quan cuối | **15 file, 572/572**, 17,99s, start **15:11:55**, exit 0 |
| Vehicle HTTP | **91/91**, nằm trong 572 |
| Cancellation HTTP | **81/81**, nằm trong 572 |
| DB mapping | **31/31**, nằm trong 572 |
| Các hồi quy khác | Toàn bộ contracts folder và service HTTP/unit của building, nằm trong 572 |
| Services biên dịch + Prisma + PostgreSQL nhúng | **11/11**, 10 migration có sẵn, một connection, exit 0 |
| `npm run build` | exit 0 |
| `npm run lint` | 0 lỗi, 4 warning sort cũ ở dashboard/pricing, 261 file, 2,2s, exit 0 |
| Scoped noEmit cho HTTP xe/hủy và imports | exit 0 |
| `git diff --check` | đạt |
| Reviewer độc lập | **DUYỆT**, không phát hiện chặn |

Lệnh hồi quy cuối:

```powershell
node .\node_modules\vitest\vitest.mjs run src/modules/contracts src/common/errors/db-errors.spec.ts src/modules/buildings/services.service.spec.ts src/modules/buildings/services.http.spec.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=.\node_modules\.cache\rooms-p3-25\regression.json
```

Output thực:

```text
Test Files  15 passed (15)
Tests       572 passed (572)
Start at    15:11:55
Duration    17.99s
```

Các ERROR cố ý của ca audit/reset/sign/print cũ nằm trong các test đã đạt; không phải lỗi của endpoint xe. Không cộng 203 vào 572 vì bộ đầu là tập con.

SQL smoke cache bỏ qua bởi Git: `node_modules/.cache/rooms-p3-25/vehicles-postgres-smoke.mjs`, dùng adapter có sẵn từ BE-P3-23, không cài dependency. Output thực:

```text
PASS 1: normalization, same-building VEHICLE FK, real insert and atomic vehicle.create audit
PASS 2: actual partial unique index rejects an active plate in another building
PASS 3: foreign/ROOM/inactive/missing service rejected before SQL insertion
PASS 4: nested Prisma service update preserves same-building FK and records vehicle.update
PASS 5: stopping preserves its billing-month interval; a new registration keeps the old row
PASS 6: real SQL literal partial-plate lookup, relation SELECT, scope and pagination
PASS 7: real audit insert failure rolls back vehicle creation and its audit
PASS 8: two concurrent service calls share the actual index: one commit, one friendly rejection (single SQL connection)
PASS 9: HOLD cancellation atomically stops vehicles, preserves history, replays once and releases the plate
PASS 10: audit failure restores the HOLD, vehicle active flag, audit and idempotency row in actual SQL
PASS 11: tenant denial, foreign ID, current reassignment and scoped lookup remain enforced by real relations
PASS 11/11; 10 existing migrations; isolated embedded PostgreSQL, no dev DB/network
```

Không chạy lại bước full-backend đã bị auto-review chặn ở BE-P3-24 vì cảnh báo khả năng telemetry tới `dc.services.visualstudio.com`. Lượt này xác minh 15 file liên quan với các biên DB/provider giả lập, không tuyên bố toàn bộ backend đã pass. Việc owner báo commit cũng không là bằng chứng một full-suite result mới. E2E occupants/vehicles trên DB dev và đợt kiểm toàn P3-5 ở BE-P3-27.

## A-27 để owner nghiệm thu

**[ASSUMPTION]** API mặc định registeredAt/removedAt là hôm nay Hà Nội; quản lý có thể nhập ngày thực tế cũ, không nhập tương lai, ngày ngừng không trước ngày đăng ký. Lịch sử đã ngừng chỉ đọc; đăng ký lại dùng POST mới để giữ interval cũ. Đây là mặc định triển khai tách riêng với các câu trả lời owner về phí tháng, không coi là owner đã chọn từng chi tiết ngày.

Chưa tính tiền tháng, chưa áp giá theo ngày đăng ký/ngừng hoặc sửa hóa đơn đã phát hành. Q-P3-20 chỉ chốt tháng ngừng; quy tắc phí cho đăng ký lại/chuyển dịch vụ trong cùng tháng và công thức riêng cho ngày xe mới vào cần được chốt khi triển khai Phase 4. A-25/26 người ở không bị coi là đã được trả lời riêng bởi câu trả lời về xe.

## Owner kiểm bằng tay

1. Staff đúng tòa tạo xe bằng biển có chữ thường/khoảng trắng và dịch vụ VEHICLE: thấy chữ hoa/bỏ whitespace, ngày mặc định hôm nay, có audit `vehicle.create`.
2. Chọn ROOM/PERSON/dịch vụ tòa khác: bị từ chối. Tạo biển đang active ở nơi khác: thông báo chung ở ô biển số.
3. Ngừng xe: row cũ còn với removedAt; đăng ký lại cùng biển tạo interval mới. Ngày ngừng giữa tháng giữ lại để Phase 4 thu đủ tháng đó, không coi isActive=false là miễn phí tháng đang dừng.
4. Tra cứu một phần biển số: manager chỉ thấy tòa đang phụ trách; BOSS xem được mọi tòa; tenant không gọi được APIs xe. Dùng isActive=false để xem lịch sử đã ngừng.
5. Hủy HOLD có xe còn đăng ký: xe tự ngừng, lịch sử còn, biển có thể đăng ký sang hợp đồng khác. Gọi lại cùng Idempotency-Key không thêm audit hoặc đổi removedAt.
6. Kiểm A-27 về ngày và interval cũ, chạy lại test liên quan theo lệnh trên nếu cần; kiểm đầy đủ E2E dev ở BE-P3-27.

## Báo cáo reviewer đầy đủ

**DUYỆT BE-P3-25 — không có phát hiện chặn trong source đã review.**

Reviewer: GPT của phiên Codex, model kế thừa; không chạy Sonnet 5. Review độc lập, chỉ đọc; không sửa file, chạy migration, gọi dịch vụ ngoài hoặc commit.

1. **Quyền và phạm vi — đạt.** Controller và service đều chặn tenant/guest. Các thao tác theo hợp đồng kiểm cả scope lúc request bắt đầu và phân công hiện tại dưới khóa mapping. Lookup cũng lọc quản lý/tòa đang hoạt động. Update ràng buộc đồng thời `vehicle.id` và `contractId`, không cho ghép ID xe từ hợp đồng khác.
2. **Dịch vụ và biển số — đạt.** Chỉ nhận dịch vụ VEHICLE đang hoạt động của đúng tòa; khóa `FOR SHARE` phối hợp với việc tắt dịch vụ. Ngừng xe vẫn được thực hiện khi dịch vụ cũ đã tắt. Biển số được chuẩn hóa uppercase, bỏ whitespace; index `vehicles_plate_active` bảo vệ trùng đồng thời. Cả tên index và dạng cột `plate` đều được ánh xạ thành thông báo chung, không tiết lộ hợp đồng/tòa khác.
3. **Transaction và concurrency — đạt khi rà source.** `contract-vehicles.service.ts:142` lấy contract `FOR UPDATE` sau mapping shared. Cancellation cũng khóa contract trước khi ngừng xe, nên phối hợp với việc thêm/sửa/ngừng đăng ký. Writer đổi quản lý/tắt tòa/tắt manager lấy mapping exclusive. Không thấy thứ tự khóa mới gây chu trình với các writer hiện có.
4. **Hủy HOLD và idempotency — đạt.** `contract-cancel.service.ts:96` chỉ ngừng xe đang hoạt động của đúng hợp đồng, giữ nguyên lịch sử đã ngừng và xe hợp đồng khác. Thao tác nằm trong transaction/idempotency hiện có, trước audit. Audit ghi số xe đã ngừng; replay không ngừng hoặc ghi audit lần nữa. Lỗi audit rollback cả xe, hợp đồng, quyết toán và idempotency.
5. **Privacy, tìm kiếm và audit — đạt.** SELECT rõ trường; lookup chỉ trả thông tin xe và liên hệ tối thiểu cần cho staff. Không đọc/trả CCCD, private asset, password hay session. `%`, `_`, `\` được escape để tìm literal; có pagination và no-store. Create/update/remove ghi audit cùng transaction; lỗi ngoài dự kiến của service xe được chuyển thành INTERNAL_ERROR trước logger.
6. **Nghiệp vụ tháng — đúng phạm vi.** Đã ghi nhận riêng các câu trả lời Q-P3-19/20/21. BE-P3-25 giữ registration/removal history phục vụ chốt tháng, chưa thực hiện bộ tính tiền Phase 4. A-27 về ngày mặc định, cấm ngày tương lai và lịch sử đăng ký đã ngừng chỉ đọc vẫn cần được nêu rõ cho owner nghiệm thu; không coi đó là câu trả lời đã xác nhận về phí tháng.
7. **Kiểm thử — phù hợp.** Đã đọc các ca mới về DTO, scope, dịch vụ, duplicate, re-registration, lookup literal/pagination, audit rollback và cancellation. Report `focused.json` xác nhận **203 passed, 0 failed**: vehicle 91, cancellation 81, DB mapping 31. Tôi không tự chạy suite/build/lint; `git diff --check` đạt.

**Ghi chú P3, không chặn:** `docs/phase-3-contracts/feature_p3-5-backend-occupants-vehicles.md:33` vẫn ghi BE-P3-24 “awaiting owner review/commit”. Cập nhật thành đã commit `ee0e891` khi chốt checkpoint.

**Giới hạn:** HTTP fake tuần tự hóa transaction, chưa chứng minh tranh chấp khóa PostgreSQL đa connection. SQL smoke và hồi quy mở rộng phải ghi theo output thực của phiên chính. Chưa kiểm DB dev; không xác nhận full-backend suite đã đạt, và test lưu `removedAt` không phải bằng chứng bộ tính phí tháng đã hoàn thành.

**Xử lý ghi chú:** đã cập nhật task và ghi nhận commit BE-P3-24 `ee0e891` ở checkpoint cũ. Không có phát hiện source cần sửa sau review. Kết quả hồi quy 572 và SQL11 lấy từ output phiên chính ở trên. HTTP/adapter một connection không chứng minh contention đa connection thực.

## Commit đề xuất

```text
feat(contracts): manage vehicle registrations and lookup (BE-P3-25, CON-14, DB-B5)
```

Phiên này không stage/commit/push hoặc sửa schema/dependency/env/DB dev. Owner kiểm và commit checkpoint này, sau đó tiếp tục BE-P3-26 (dịch vụ hợp đồng).
