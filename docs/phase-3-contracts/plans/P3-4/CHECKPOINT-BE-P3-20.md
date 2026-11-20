# P3-4 · BE-P3-20 · Move-in và mốc điện nước riêng

Ngày 20/11/2026. Chủ dự án giao riêng BE-P3-20. Git xác minh P3-3 đã commit `b4da02b`, workspace sạch trước lượt này.

**BE-P3-20 đã được owner nghiệm thu ngày 20/11/2026; chờ commit.** Owner xác nhận “mình kiểm tra thấy o rồi k lỗi gì chốt BEP320 đi”. Đánh dấu task `[x]`, khép phần chờ kiểm chứng từ máy dự án. Giữ kết quả cục bộ HTTP+mapping 111/111, hồi quy hợp đồng 102/102, DB checker 107/107, SQL/service 8/8, build/lint/typecheck và reviewer DUYỆT. Xác nhận owner không kèm số đếm full suite hoặc log migrate deploy/status, nên chỉ ghi nhận nghiệm thu, không suy đoán output hoặc khẳng định Codex đã tự apply DB. Git HEAD vẫn `b4da02b`; BE-P3-20 chưa commit. Chưa làm BE-P3-21..22; A-24 giữ nguyên.

## Phạm vi đã rõ

Xác minh commit khi bắt đầu BE-P3-21 ngày 20/11/2026: owner báo đã commit, Git có `40747f6`, workspace sạch. Phần chờ commit BE-P3-20 đã khép; các câu chờ commit trong bản báo cáo gốc phản ánh thời điểm trước commit.

- `POST /contracts/:id/move-in` chỉ staff trong scope hiện tại; HOLD đã ký, tiền cọc PAID hoặc deposit = 0; thiếu cọc trả `DEPOSIT_NOT_PAID`. Gia hạn không dùng bước move-in (CON-18).
- Cả điện và nước bắt buộc, kể cả PER_PERSON. Giá trị là số nguyên không âm trong giới hạn PostgreSQL Int. `readOn` là business date; lệch startDate hơn ba ngày cần note, bao gồm cả hai phía; không đổi startDate hoặc lịch tính tiền.
- MTR-04 cần khai báo thay đồng hồ riêng cho điện/nước, có số cuối đồng hồ cũ và số đầu đồng hồ mới. Bổ sung trường tùy chọn để hỗ trợ yêu cầu này, giữ electric/water dạng số như CON-10. Tên/shape field là lựa chọn triển khai; không cần owner chọn tên kỹ thuật.
- Cập nhật ACTIVE và movedInAt, audit `contract.move_in` cùng transaction với các chỉ số. Không cần ảnh, không gọi provider hoặc gửi mail.

## Quy tắc owner chốt ngày 20/11/2026

- Khách cũ ghi chỉ số ở thời điểm kết thúc thuê để chốt hóa đơn.
- Khách mới vào lúc nào thì quản lý nhập điện và nước hiện tại lúc đó làm mốc vào ở của chính hợp đồng mới. Không dùng lại hoặc ghi đè chỉ số chốt khách cũ, kể cả cùng ngày hoặc cùng giá trị.
- Cuối tháng, lượng điện/nước PER_M3 được tính từ mốc vào ở của khách mới; khoảng tiêu thụ khi phòng trống không cộng cho khách cũ/mới. Nước PER_PERSON vẫn theo đầu người, chỉ số giữ cho lịch sử.
- Nếu vào ở đúng ngày cuối tháng, mốc vào ở và số chốt cuối tháng vẫn phải lưu riêng để không mất tiêu thụ trong ngày đó. Tháng sau bắt đầu từ mốc chốt của cùng hợp đồng.

Ví dụ cùng ngày/phòng: chốt khách cũ 1.284, khách mới vào 1.290, chốt tháng khách mới 1.350. Lượng tính cho khách mới là 60 kWh; 6 kWh giữa hai lượt bàn giao không cộng cho khách nào.

Đây là quyết định nghiệp vụ mới thay quy tắc dùng chung một row của MTR-02 cũ; không ghi nhận owner đã chọn mã 1A/2A. Nghiệp vụ sửa chỉ số hồi tố của MTR-12 vẫn ở Phase 4, không mở rộng trong BE-P3-20. `readOn` vẫn là ngày đọc thực tế theo CON-11, không tự đổi ngày để né unique index; tiền thuê vẫn theo startDate.

## Schema và quyền apply đã duyệt

Owner trả lời “ok” cho yêu cầu sửa schema/tạo migration. Đã thêm `isOpening` mặc định false; một opening cho mỗi contract/kind, các chỉ số thường unique theo contract/room/kind/ngày, chỉ số chưa gắn hợp đồng giữ unique theo room/kind/ngày. Partial index SQL và CHECK opening phải có contract; hai lookup index Prisma. Giữ mọi row/ID/value/date/link cũ; không tự đoán hoặc backfill baseline lịch sử. SQL và snippet Prisma ở [đề xuất đã duyệt](SCHEMA-PROPOSAL-BE-P3-20.md), đã ghi đúng vào schema, constraints và migration thật.

Migration: `Source/backend/prisma/migrations/20261120000000_contract_meter_openings/migration.sql`. SHA-256: `105076495B442D32EF79916B1798021A1D9CAADC602BD9C624373193C7A40BDE`. Owner đã trả lời “ok duyệt” riêng cho apply bản migration này; checksum kiểm lại sau duyệt vẫn khớp. Không yêu cầu duyệt lại khi thử kết nối hoặc chạy tiếp cùng migration.

## Triển khai

- Controller/DTO mỏng, service thực thi nghiệp vụ. Tách move-in service nếu giúp giữ contracts.service dễ đọc; không mở meters module đầy đủ của Phase 4.
- Giữ thứ tự khóa tương thích writer hiện có: shared viewing mapping lock → room FOR UPDATE → contract FOR UPDATE → kiểm lại scope/assignment/trạng thái → đọc invoice và chỉ số dưới cùng transaction. Khóa room bảo vệ cả khi chưa tồn tại row meter. Writer meter tương lai phải giữ cùng quy ước; không thêm thứ tự contract → room gây vòng khóa.
- So chỉ số thường với lịch sử đồng hồ phù hợp; replacement đối chiếu số cuối cũ với mốc trước, không đem số đầu mới so trực tiếp với đồng hồ cũ. Tạo baseline riêng cho contract mới, không sửa/chuyển contractId của row cũ; chỉ số thường cuối tháng không được ghi đè baseline.
- Cập nhật hợp đồng có điều kiện HOLD/đã ký; lỗi bất kỳ, kể cả audit, rollback toàn bộ. Query chỉ lấy trường cần thiết, không đọc/trả CCCD, password hoặc asset riêng tư.
- Đã validate/generate, kiểm migration trên schema đầy đủ và mở rộng DB checker; review rồi xin duyệt apply DB dev. Không dùng DB dev làm shadow database. E2E dev toàn luồng vẫn thuộc BE-P3-22.
- Kiểm HTTP/DTO: scope, vai trò, thiếu cọc, deposit 0, đủ điện/nước PER_PERSON, biên ±3 ngày, thiếu note, số âm/lẻ/quá Int, ngày sai, không nhận photo, cùng ngày có ba mốc, replacement, rollback, hai request move-in song song. Code BE-P3-20 chỉ ghi baseline; tính/thu tiền tháng và chốt khách cũ là Phase 4.
- Trước dừng BE-P3-20: build/lint/test phù hợp và reviewer độc lập, cập nhật kết quả thật/giới hạn trong checkpoint. Chủ dự án kiểm chứng và commit rồi mới BE-P3-21.

## Kiểm tra lượt chuẩn bị

- Git: HEAD `b4da02b`, workspace sạch trước cập nhật tài liệu.
- Đã đọc Before you start của P3-4; rà contracts service/controllers, MeterReading/Settlement, constraints và conventions. Không có meter writer hiện hữu để kế thừa quy tắc còn thiếu.
- Rà trước khi owner chốt từng cho rằng có thể giữ schema nếu dùng chung daily row; quyết định mới yêu cầu baseline riêng nên nhận định đó đã được thay bằng đề xuất migration. Agent rà độc lập thiết kế mới, gồm cả ca vào ở ngày cuối tháng và nguy cơ unique của nhóm contractId null.
- Kiểm mô hình index cô lập bằng PGlite: 8/8 đạt, gồm row cũ nguyên trạng, ba mốc cùng ngày, baseline đúng 60 kWh, duplicate opening/daily bị chặn, nhóm unassigned unique, opening thiếu contract bị chặn, điện/nước tách biệt. Không đọc env, không gọi DB dev, không cài package.
- Tám ca mô hình ban đầu là kiểm thiết kế trước duyệt; bằng chứng cho bản triển khai nằm ở bảng kiểm tra thực tế dưới đây.

## Tệp và hành vi API

| Nhóm | Tệp chính |
|---|---|
| Endpoint | `Source/backend/src/modules/contracts/contract-move-in.service.ts`, `dto/move-in-contract.dto.ts`, contracts controller/module |
| HTTP | `Source/backend/src/modules/contracts/contracts.move-in.http.spec.ts` |
| DB | `prisma/schema.prisma`, `constraints.sql`, migration và `check-constraints.mjs` dưới backend |
| Lỗi DB | `src/common/errors/db-errors.ts`, `db-errors.spec.ts` dưới backend |
| Spec/bàn giao | Spec 00/02/14/15/16, task P3-4, README, PROGRESS, LESSONS và checkpoint; tài liệu P3-3 ghi nhận commit `b4da02b` |

Body: `{electric,water,readOn,note?,electricReplacement?:{oldMeterFinal},waterReplacement?:{oldMeterFinal}}`. Numbers thật, số nguyên 0..2.147.483.647; ngày thực YYYY-MM-DD; optional null/unknown keys/photo bị từ chối. Note được trim, tối đa 2.000 ký tự, không NUL. Thiếu nước vẫn lỗi ở PER_PERSON. Lệch quá 3 ngày cả hai hướng cần note.

Response `{id,code,status,movedInAt,readings:{electric:{id,value,readOn},water:{id,value,readOn}}}`; no-store. Audit chỉ gồm trạng thái/mốc thời gian/IDs reading; không SELECT mật khẩu, scan, CCCD hoặc sửa tenant account.

## Kiểm tra thực tế

| Phép kiểm | Kết quả |
|---|---|
| Prisma validate/generate | Exit 0, Client 6.19.3; DMMF isOpening Boolean default false. Bản schema temp với generator/output tuyệt đối và URL giả; không dùng DB dev |
| DB checker | `107/107 tình huống đúng như mong đợi`, từ schema mới + constraints; 97 ca cũ và 10 ca meter mới |
| Full-schema migration | PGlite: áp 9 migration cũ rồi migration thứ 10; snapshot chính xác 28 bảng (trừ cột mới false), tất cả sequences và FK meter giữ nguyên; 4 reading lịch sử giữ ID/value/date/contract/photo/note/createdAt. Invoice PAID/payment giữ nguyên |
| Cùng ngày/đúng baseline | Old closing 1.284, new opening 1.290, new closing 1.350 cùng tồn tại; usage mới 60 |
| Service + Prisma + SQL thực | Smoke PGlite 8/8, exit 0, 3,35 giây, qua đủ 10 migration và compiled ContractMoveInService/AuditService/Prisma: PAID trigger, baseline mới giữ số cũ, own closing cùng ngày/usage 60, ACTIVE+audit, cọc 0, thiếu cọc, giảm số, replacement, lặp/đã có opening và rollback lỗi sau khi đã INSERT audit. Một session, không phải kiểm tranh chấp nhiều connection |
| HTTP mới, lượt cuối | Native HTTP 82/82 ở lượt riêng 4,22 giây; lượt kết hợp cuối cùng với DB errors: `Test Files 2 passed (2)`, `Tests 111 passed (111)`, 6,06 giây, bắt đầu 08:07:14 |
| Hồi quy hợp đồng/room | `Test Files 6 passed (6)`, `Tests 102 passed (102)`, 18,18 giây; create/service, sign, read, reset, documents, room capacity. Log lỗi audit/INTERNAL_ERROR là các ca rollback/validation cố ý đã pass |
| Lint cuối | `Found 4 warnings and 0 errors.`, exit 0, 246 file, 1,9 giây; chỉ 4 cảnh báo sort cũ dashboard/pricing |
| Typecheck test | Scoped noEmit cho hai test mới/sửa: 0 diagnostics, exit 0. Helper Supertest unknown-body đã sửa bằng type assertion chỉ trong test; không thay runtime |
| Build cuối | `npm run build` exit 0 sau cập nhật DTO NUL và mapping DB; comment/type assertion test sửa sau đó không đổi runtime |
| Reviewer | DUYỆT, không còn lỗi chặn; đầy đủ report bên dưới. Dùng reviewer Codex do Sonnet không có trong model catalog của phiên này |
| DB dev / nghiệm thu owner | Lượt Codex trước: status P1001, kết nối ứng dụng không đọc được lịch sử; không deploy/ghi DB từ Codex. Sau hướng dẫn migration/test, owner báo kiểm tra không lỗi và yêu cầu chốt BE-P3-20. Ghi nhận nghiệm thu này, không tự thêm log deploy/status chưa được cung cấp |
| Full backend / nghiệm thu owner | Owner đã kiểm tra và chốt task trên revision BE-P3-20; không cung cấp tổng kết Test Files/Tests hoặc thời lượng nên không ghi số đếm/pass count suy đoán. Đây là xác nhận nghiệm thu của owner, không phải output full suite do Codex chạy; không yêu cầu chạy lại để chốt task |
| Diff | `git diff --check` đạt; kiểm lại trước báo cáo cuối |

## Giới hạn và assumption

A-24: nếu một ngày biên có nhiều giá trị khác nhau và có thay đồng hồ, data chỉ có ngày nên không xác định được thứ tự đồng hồ vật lý. Trả `CONFLICT_STATE` với yêu cầu kiểm lịch sử, không đoán bằng id/createdAt hoặc tự chỉnh số. Đây là giới hạn triển khai, chưa được owner duyệt như quy tắc nghiệp vụ; một mốc replacement rõ ràng hoặc replacement khai trực tiếp khi move-in vẫn được hỗ trợ. Chưa có luồng sửa lịch sử meter ở BE-P3-20 (Phase 4).

Kiểm HTTP concurrency dùng Prisma fake tuần tự hóa transaction; PGlite một connection cũng không chứng minh tranh chấp nhiều connection. Row lock và unique index là bảo vệ production. Không claim native PostgreSQL dev E2E từ các kết quả offline.

Smoke service có thể chạy lại từ backend bằng `node .\node_modules\.cache\rooms-p3-3\move-in-postgres-smoke.mjs` khi script tạm còn tồn tại; không đọc env/kết nối DB thật. Lượt đầu helper đọc nhầm Nest getResponse().message thay vì .code, đã sửa assertion ở harness rồi lượt cuối 8/8; không sửa service để khớp test.

## Nghiệm thu và lệnh tham khảo

Q-P3-15 đã được owner duyệt bằng “ok duyệt” ngày 20/11/2026; sau đó owner báo kiểm tra ổn, không lỗi và yêu cầu chốt BE-P3-20. Phần yêu cầu kiểm chứng đã khép, không yêu cầu thêm kết quả hoặc chạy lại bước đã nghiệm thu. Các đoạn review/nhật ký cũ là lịch sử và không tạo điều kiện duyệt lại. Những lệnh dưới chỉ lưu tham khảo cho môi trường chưa áp dụng migration; không có lệnh cần chạy lại để chốt task này:

```powershell
cd D:\Rooms\Source\backend
npx prisma migrate status
```

Nếu chỉ đúng migration đã kiểm chờ apply, dùng:

```powershell
npx prisma migrate deploy
if ($LASTEXITCODE -eq 0) {
    npx prisma migrate status
    if ($LASTEXITCODE -eq 0) {
        npx prisma generate
    }
}
```

Khi dùng lại các lệnh ở môi trường khác: nếu danh sách có migration khác hoặc checksum khác, kiểm lại trước deploy. Không dùng migrate reset/dev/db push, không chạy seed. Với nghiệm thu hiện tại chỉ còn chủ dự án commit BE-P3-20, sau đó mới làm BE-P3-21; không coi toàn bộ P3-4 đã xong khi BE-P3-21..22 còn chưa làm.

Kiểm tay trên hợp đồng thử: signed+PAID hoặc deposit 0; POST move-in với đủ điện/nước, thấy ACTIVE và hai baseline mới giữ số cũ. UNPAID trả 409 DEPOSIT_NOT_PAID; thiếu nước hoặc note ở ±4 ngày trả 400; gọi lại không tạo thêm reading/audit. Không cần upload ảnh.

Commit gợi ý sau nghiệm thu:

```text
feat(contracts): record move-in meter baselines (BE-P3-20, CON-10/11, MTR-02/03/04/06)
```

## Báo cáo reviewer đầy đủ

KẾT LUẬN: **DUYỆT**

Phạm vi: thay đổi BE-P3-20 so với `b4da02b`: service move-in, DTO, controller/module, HTTP tests, mapping lỗi DB, schema, migration `20261120000000_contract_meter_openings`, constraints và DB checker; đối chiếu CON-10/11/18, MTR-02/03/04/06, SCOPE-02, AUD-01 và quyết định owner ngày 20/11.

### Lỗi chặn

Không phát hiện lỗi chặn còn tồn tại.

### Nên sửa

Không có đề nghị sửa bắt buộc. Comment tại `contract-move-in.service.ts:32` có thể thu hẹp từ “All room writers” thành các writer hợp đồng/assignment liên quan; một số writer RoomsService chỉ khóa room. Đây là diễn đạt, không ảnh hưởng tính đúng hiện tại.

### Ghi chú

- `contract-move-in.service.ts:31–49`: shared mapping → room `FOR UPDATE` → contract `FOR UPDATE`; scope snapshot và assignment/manager hiện tại đều được kiểm. Reassignment và khóa quản lý lấy exclusive mapping nên không chen vào giữa kiểm tra và ghi.
- Không thấy vòng khóa với create, sign/reset, payment hoặc room updates: sign/reset không quay lại room, payment không khóa contract/room. Invoice `FOR SHARE` trước đọc trạng thái tương thích payment `FOR UPDATE`.
- Dòng 50–65 chỉ nhận signed HOLD chưa move-in, loại renewal; invoice phải PAID và đủ deposit, deposit 0 bỏ bước invoice. Note bắt buộc khi lệch hơn ba ngày ở cả hai hướng.
- Dòng 68–79 ghi hai baseline, chuyển ACTIVE có điều kiện và audit trong cùng transaction. Lỗi reading thứ hai, conflict cập nhật hoặc audit làm rollback toàn bộ. Retry không ghi trùng baseline.
- Dòng 88–117 không cập nhật hoặc chuyển liên kết reading cũ. Baseline thuộc contract mới, có `isOpening=true`; opening và closing cùng ngày được phân biệt theo vai trò.
- Migration thêm default false, thay unique index bằng ba partial unique và hai lookup indexes; không sửa/xóa dữ liệu lịch sử hoặc đổi FK. Nhóm contractId null vẫn được bảo vệ. CHECK opening cần contract phù hợp chính sách giữ lịch sử.
- DTO kiểm số nguyên, giới hạn Int, ngày thực, nested replacement, null, unknown fields và NUL. Service chỉ SELECT dữ liệu cần thiết; response/audit không chứa credential, CCCD ciphertext hoặc scan asset.
- Mapping lỗi xử lý tên index và các dạng column target của Prisma; exact-key test đã cập nhật.

### Giới hạn cần giữ trong bàn giao

A-24 đã được ghi rõ trong overview, CON-10 và checkpoint. Ví dụ old closing 1.284 và replacement 0/oldFinal 1.300 cùng ngày, rồi khách mới đọc 5: dữ liệu chỉ có ngày không đủ xác định thứ tự vật lý, nên service trả 409 để kiểm lịch sử. Đây có thể là lịch sử hợp lệ; không được mô tả 409 như bằng chứng dữ liệu sai hoặc tuyên bố hỗ trợ mọi chuỗi thay đồng hồ cùng ngày. Đây là giới hạn triển khai, không phải lựa chọn nghiệp vụ owner đã xác nhận.

Review này không phê duyệt apply DB dev. Owner mới duyệt tạo schema/migration; bước apply và kết quả full backend mới vẫn cần xử lý theo checkpoint.

### Đã kiểm

Đọc toàn bộ source/DTO/HTTP spec mới, migration, diff schema/constraints/checker/error mapping và các spec liên quan; rà thêm thứ tự khóa của create/sign/reset/payment/assignment/room writers. Rà read-only, không chạy test/DB, không đọc secrets và không sửa file.

Ghi nhận của session chính sau review: đã thu hẹp comment như gợi ý. Scoped noEmit phát hiện helper HTTP nhận unknown không khớp overload Supertest.send; đã thêm type assertion tại test, không đổi JavaScript/runtime. Không có thay đổi hành vi service hoặc SQL sau review.
