# BE-P3-26 · Dịch vụ của hợp đồng

20/11/2026. Owner xác nhận BE-P3-25 đã commit; Git xác minh **`4428721`**, workspace sạch trước task. **BE-P3-26 đã triển khai và kiểm chứng, reviewer DUYỆT; chờ owner kiểm A-28 và commit.** Sau commit, tiếp tục BE-P3-27 kiểm tổng thể/E2E P3-5.

## Hành vi đã triển khai

| Route | Hành vi |
|---|---|
| GET `/api/v1/contracts/:id/services` | Staff trong phạm vi tòa, đọc danh sách dịch vụ hợp đồng đã chọn |
| PATCH `/api/v1/contracts/:id/services` | Body `{ serviceIds: number[] }`, thay toàn bộ lựa chọn trên HOLD/ACTIVE |

Chỉ ROOM/PERSON đúng tòa; VEHICLE đi qua đăng ký xe. **Owner chốt Q-P3-22:** dịch vụ thêm mới phải đang hoạt động và có giá SERVICE đã APPROVED, effectiveFrom không sau ngày bắt đầu của HOLD hoặc hôm nay Hà Nội của ACTIVE. Không tự chọn dịch vụ thiếu giá để tính sau.

Response `{ data: [{ id, name, unit, isActive }] }` theo ID tăng dần, `Cache-Control: no-store`. Body bắt buộc có mảng ID duy nhất, nguyên dương trong int32; không cho client gán contractId/buildingId/unit hoặc field nội bộ. TENANT/GUEST nhận FORBIDDEN; manager ngoài tòa OUT_OF_SCOPE; contract không tồn tại NOT_FOUND. Scope kiểm cả request và phân công hiện tại, trạng thái quản lý/tòa.

## A-28 để owner kiểm

**[ASSUMPTION, semantics API]:** PATCH truyền toàn bộ danh sách mong muốn; `[]` bỏ hết các lựa chọn hiện tại. Dịch vụ đã chọn nhưng sau đó bị tắt trong catalog có thể giữ lại; khi thêm mới hoặc chọn lại sau khi bỏ, phải qua điều kiện active/giá duyệt. Đổi thứ tự hoặc giữ nguyên tập ID không ghi change audit. GET đọc lịch sử ENDED/CANCELLED trong scope như contract detail hiện có; PATCH chỉ HOLD/ACTIVE.

Các semantics này được ghi riêng với câu trả lời đã chốt về giá. **Tháng áp dụng phí khi đổi dịch vụ và bộ tính hóa đơn vẫn thuộc Phase 4**; không sửa hóa đơn đã phát hành, giá catalog hay rent của hợp đồng.

## Transaction và lưu lịch sử

Lấy mapping shared → contract FOR SHARE khi đọc/FOR UPDATE khi sửa → kiểm scope/status → khóa các service được chọn bằng FOR SHARE theo thứ tự ID → xác minh loại/tòa/giá → ghi delta membership → một audit `contract.update_services` → commit. Phối hợp với writer đổi quản lý/tắt tòa/tắt manager và tắt service catalog.

`contract_services` chỉ là membership hiện tại, không có cột active hoặc interval lịch sử. API chỉ bỏ các link bị bỏ chọn và thêm link mới của đúng contractId/buildingId; không xóa master Service, rate, invoice hoặc audit. Audit lưu toàn bộ trước/sau `serviceIds`, actor, entity contract và IP, trong cùng transaction để giữ lịch sử lựa chọn. Affected-row count bất thường, lỗi insert hoặc audit đều rollback cả link cũ/mới và audit; lỗi ngoài dự kiến được chuyển thành INTERNAL_ERROR trước logger.

## Tệp thay đổi

- `Source/backend/src/modules/contracts/dto/contract-services.dto.ts`: mảng ID bắt buộc, unique/int32.
- `contract-services.controller.ts`, `contract-services.service.ts`, `contracts.module.ts` cùng module: APIs, scope/rate checks, locking, delta membership và audit.
- `contracts.services.http.spec.ts`: 63 ca HTTP mới qua real AppModule/auth/controller/service/audit, chỉ fake biên Prisma.
- `docs/spec/14-contracts.md`, `00-overview.md`, `20-reports-audit-settings.md`: API, A-28, audit action; Phase 3 README/task/PROGRESS/plan/checkpoint và ghi nhận commit ở checkpoint BE-P3-25.

## Kiểm chứng thực tế

Chạy tại `Source/backend`, source ổn định; không đọc `.env` hoặc gọi dịch vụ/mail/DB dev thật.

| Kiểm tra | Kết quả |
|---|---|
| HTTP mới | **63/63**, 1 file, 7,40s, start 15:32:00, exit 0 |
| Hồi quy liên quan cuối | **642/642**, **17 file**, 20,42s, start **15:32:53**, exit 0 |
| Phạm vi hồi quy | Toàn bộ contracts, DB error mapping, building service HTTP/unit, rates-at helper |
| Service biên dịch + Prisma + PostgreSQL nhúng | **10/10**, 10 migration có sẵn, một connection, exit 0 |
| `npm run build` | exit 0 |
| `npm run lint` | 0 lỗi, 4 warning sort cũ ở dashboard/pricing; 265 file, 3,0s; exit 0 |
| Scoped TypeScript noEmit cho HTTP spec và imports | exit 0 |
| `git diff --check` | đạt |
| Reviewer độc lập | **DUYỆT**, không phát hiện chặn |

Lệnh hồi quy cuối:

```powershell
node .\node_modules\vitest\vitest.mjs run src/modules/contracts src/common/errors/db-errors.spec.ts src/modules/buildings/services.service.spec.ts src/modules/buildings/services.http.spec.ts src/common/rates/rates-at.spec.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=.\node_modules\.cache\rooms-p3-26\regression.json
```

Output thực:

```text
Test Files  17 passed (17)
Tests       642 passed (642)
Start at    15:32:53
Duration    20.42s
```

63 test mới nằm trong 642, không cộng hai số. Các log ERROR cố ý của các test audit/reset/sign/print cũ đều thuộc các ca đã đạt; không có ca bỏ qua hoặc failed/pending trong JSON hồi quy.

SQL smoke lưu ở cache bỏ qua bởi Git: `node_modules/.cache/rooms-p3-26/services-postgres-smoke.mjs`, dùng adapter PostgreSQL có sẵn từ BE-P3-23, không cài dependency. Output thực:

```text
PASS 1: real membership relation SELECT, approved ROOM/PERSON addition and complete before/after audit
PASS 2: replacement and clear affect only current links of that contract; master catalog/rates and other contracts preserved
PASS 3: VEHICLE, foreign, missing, inactive, pending, unpriced, future and rejected services fail before writes
PASS 4: HOLD accepts a rate effective exactly on startDate; ACTIVE checks today rather than original start
PASS 5: retained archived services survive another addition and order-only updates do not audit
PASS 6: audit failure after actual link deletion/insertion restores old membership and the audit table
PASS 7: actual composite foreign key rejects an adversarial cross-building membership
PASS 8: two concurrent service calls retain a complete set and ordered audit chain (one SQL connection)
PASS 9: ENDED selection remains readable while writes are refused
PASS 10: tenant denial, current assignment revocation and Boss history access enforced by real relations
PASS 10/10; 10 existing migrations; isolated embedded PostgreSQL, no dev DB/network
```

HTTP fixture và adapter SQL một connection không chứng minh contention PostgreSQL đa connection. Full-backend chưa có kết quả mới; không retry/bypass bước full đã bị auto-review chặn ở BE-P3-24 do cảnh báo khả năng telemetry ngoài chưa xác minh. Lượt này chạy các hồi quy liên quan với biên DB/provider giả lập và SQL nhúng cô lập. E2E DB dev và đợt kiểm tổng P3-5 ở BE-P3-27.

## Owner kiểm bằng tay

1. Staff đúng tòa GET danh sách. PATCH `{ serviceIds: [...] }` thêm ROOM/PERSON có giá đã duyệt: danh sách trả đúng thứ tự, audit có trước/sau và IP.
2. Chọn dịch vụ tòa khác hoặc VEHICLE: 400 ở serviceIds, lựa chọn cũ còn nguyên. Thêm service bị tắt/chưa giá/PENDING/giá còn tương lai so với ngày tham chiếu cũng bị từ chối.
3. HOLD có giá hiệu lực đúng ngày bắt đầu: thêm được; ACTIVE dùng giá đang có hiệu lực hôm nay, không lấy ngày bắt đầu cũ để chặn giá mới.
4. Kiểm A-28: PATCH thay toàn bộ tập; `[]` bỏ hết link hiện tại; giữ service cũ archived vẫn được; gửi lại cùng tập/đổi thứ tự không thêm audit.
5. Manager tòa khác hoặc đã mất phân công không đọc/sửa được. Tenant/guest không gọi được route này. Hợp đồng ENDED/CANCELLED chỉ đọc.
6. Chạy lại lệnh hồi quy trên nếu cần; nghiệm thu billing riêng khi triển khai Phase 4 và E2E dev ở BE-P3-27.

## Báo cáo reviewer đầy đủ

**DUYỆT BE-P3-26 — không có phát hiện chặn trong source đã review.**

Reviewer: GPT của phiên Codex, model kế thừa; không chạy Sonnet 5. Review độc lập, chỉ đọc; không sửa file, chạy migration, gọi dịch vụ ngoài hoặc commit.

1. **Quyền và scope — đạt.** Controller và service cùng chặn tenant/guest. Service kiểm scope của request và phân công hiện tại dưới khóa mapping; manager/tòa bị vô hiệu hoặc đổi phân công không đọc/sửa được selection. Các truy vấn và mutation của membership đều gắn đúng contractId/buildingId.
2. **Loại dịch vụ và giá duyệt — đạt.** Selection mới chỉ nhận ROOM/PERSON đúng tòa. Dịch vụ thêm mới phải active, có rate kind SERVICE, status APPROVED và effectiveFrom không sau ngày tham chiếu. HOLD dùng startDate; ACTIVE dùng hôm nay Hà Nội, đúng Q-P3-22. Việc giữ dịch vụ đã chọn nhưng bị ngừng trong catalog được ghi riêng dưới A-28.
3. **Transaction và concurrency — đạt khi rà source.** `contract-services.service.ts:40` dùng contract FOR SHARE cho đọc; dòng 51 dùng FOR UPDATE cho sửa, sau mapping shared. Các service được khóa SHARE theo thứ tự ID trước validation/write. Writer đổi quản lý/tắt tòa/tắt manager dùng mapping exclusive; catalog update dùng row UPDATE nên phối hợp được với service SHARE. Chưa thấy chu trình khóa mới với các writer hiện có.
4. **Thay selection và giữ lịch sử — đạt trong phạm vi A-28.** Chỉ thêm/bỏ các liên kết hiện tại của contract_services; không xóa master service, rate, invoice hoặc audit. Full before/after serviceIds được lưu trong cùng transaction. Empty set, retained archived selection và no-op/order-only được ghi rõ là mặc định API, không tự suy ra tháng tính phí.
5. **Audit và rollback — đạt.** `contract-services.service.ts:82–90` kiểm affected-row counts, thêm/bỏ membership rồi ghi một `contract.update_services` với actor/entity/IP và hai tập ID. Lỗi delete/create/audit rollback cả thay đổi; no-op không tạo change audit. Lỗi ngoài dự kiến được chuyển thành INTERNAL_ERROR trước logger.
6. **DTO và privacy — đạt.** Body bắt buộc có mảng ID duy nhất, số nguyên dương trong int32; field nội bộ bị từ chối qua validation toàn cục. Response chỉ có id/name/unit/isActive và no-store; không trả CCCD, private assets, tài khoản hoặc dữ liệu review giá.
7. **Kiểm thử — phù hợp.** Đã đọc các ca về scope, sai loại/tòa, giá pending/rejected/future, biên ngày HOLD/ACTIVE, thay/clear/no-op, archived selection, rollback/count conflict và DTO. Đọc `focused.json` xác nhận **63 passed, 0 failed, 0 pending**. Tôi không tự chạy suite/build/lint; `git diff --check` đạt.

**Ghi chú P3, không chặn:** dòng mô tả BE-P3-25 trong `feature_p3-5-backend-occupants-vehicles.md` vẫn ghi chờ owner review/commit. Khi chốt checkpoint, cập nhật thành đã commit `4428721` cho khớp PROGRESS và baseline.

**Giới hạn:** HTTP fixture tuần tự hóa transaction, chưa chứng minh tranh chấp khóa PostgreSQL đa connection. SQL smoke và hồi quy rộng cần ghi theo output thực của phiên chính. Chưa kiểm DB dev hoặc full-backend suite. Đây là API quản lý selection, chưa phải bộ tính hóa đơn tháng; A-28 cần được nêu rõ cho owner nghiệm thu.

**Xử lý ghi chú:** đã cập nhật task và ghi nhận commit `4428721` ở checkpoint BE-P3-25; source không cần sửa sau review. Hồi quy 642 và SQL10 ghi từ output thực phiên chính ở trên. Không phát sinh lỗi cần retry nên không thêm bài học một lần vào LESSONS.

## Commit đề xuất

```text
feat(contracts): manage selected services (BE-P3-26, D-07, DB-B5)
```

Phiên này không stage/commit/push, schema/migration/dependency/env hoặc DB dev changes. Owner kiểm A-28 và commit, rồi tiếp tục BE-P3-27.
