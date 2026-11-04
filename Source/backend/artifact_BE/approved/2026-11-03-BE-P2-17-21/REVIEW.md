# P2-4 · Phòng và ảnh

Trạng thái: ĐÃ DUYỆT 04/11/2026
Task / spec: BE-P2-17..21 · ROOM-01..09, FILE-01..02, SCOPE-02, PRC-07, BLD-07
Gốc: 55b3de0

## Làm gì, vì sao
Chuẩn bị P2-4 theo kế hoạch Phase 2 bản 4 đã duyệt: API phòng, trạng thái suy ra, lưới tầng, ảnh và kiểm quyền theo tòa. P2-3 và bản sửa e2e đã áp dụng; e2e main 23/23 PASS trên DB dev. Chủ dự án chọn dùng `asset_id` bất biến để xử lý race xóa ảnh. Ba lỗi reviewer lượt bốn đã sửa trong draft; lượt review cuối DUYỆT, đang chờ chủ dự án duyệt áp dụng.

## File sẽ thêm / sửa / xóa ở bản chính

Đích tính từ `Source/backend/`. `PLAN.md`, `REVIEW.md` và toàn bộ `ref/` chỉ phục vụ draft, không áp dụng.

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `src/app.module.ts` | cùng đường dẫn | Sửa |
| `src/modules/rooms/rooms.module.ts` | cùng đường dẫn | Thêm |
| `src/modules/rooms/rooms.controller.ts` | cùng đường dẫn | Thêm |
| `src/modules/rooms/rooms.service.ts` | cùng đường dẫn | Thêm |
| `src/modules/rooms/rooms.types.ts` | cùng đường dẫn | Thêm |
| `src/modules/rooms/room-status.ts` | cùng đường dẫn | Thêm |
| `src/modules/rooms/dto/rooms.dto.ts` | cùng đường dẫn | Thêm |
| `src/modules/rooms/rooms.cp1.spec.ts` | cùng đường dẫn | Thêm |
| `src/modules/rooms/rooms.capacity.spec.ts` | cùng đường dẫn | Thêm |
| `src/modules/rooms/rooms.building-lock.spec.ts` | cùng đường dẫn | Thêm |
| `src/modules/rooms/rooms.spec.ts` | cùng đường dẫn | Thêm |
| `src/modules/rooms/rooms.http.spec.ts` | cùng đường dẫn | Thêm |
| `src/modules/rooms/rooms.service.spec.ts` | cùng đường dẫn | Thêm |
| `src/modules/rooms/rooms.grid.spec.ts` | cùng đường dẫn | Thêm |
| `src/modules/rooms/rooms.images.spec.ts` | cùng đường dẫn | Thêm |
| `src/modules/rooms/rooms.schema.spec.ts` | cùng đường dẫn | Thêm |
| `src/modules/rooms/room-status.spec.ts` | cùng đường dẫn | Thêm |
| `src/modules/rooms/dto/rooms.dto.spec.ts` | cùng đường dẫn | Thêm |
| `src/modules/files/files.service.ts` | cùng đường dẫn | Sửa |
| `src/modules/files/files.service.spec.ts` | cùng đường dẫn | Sửa |
| `src/modules/files/cloudinary.spec.ts` | cùng đường dẫn | Sửa |
| `prisma/schema.prisma` | cùng đường dẫn | Sửa |
| `prisma/migrations/20261103000000_room_image_asset_id/migration.sql` | cùng đường dẫn | Thêm |

## Cách xem và kiểm tra

Từ `Source/backend`, chạy `npx vitest run --config artifact_BE/2026-11-03-BE-P2-17-21/ref/vitest.preview.config.ts artifact_BE/2026-11-03-BE-P2-17-21/src/modules/rooms`, `npx vitest run --config artifact_BE/2026-11-03-BE-P2-17-21/ref/vitest.full-preview.config.ts`, `npx tsc -p artifact_BE/2026-11-03-BE-P2-17-21/ref/tsconfig.preview.json --noEmit` và `npx oxlint --type-aware artifact_BE/2026-11-03-BE-P2-17-21/src`. Không chép draft vào main để thử. E2E P2-4 trên DB dev chỉ sau khi chủ dự án duyệt và áp dụng.

## Đã kiểm tra

Planner viết PLAN.md với CP-1..5; chủ dự án đã trả lời Q-P24-1/1b/2. CP-1 PASS 41/41, CP-2 PASS 49/49, CP-3 PASS 54/54, CP-4 PASS 67/67, CP-5 PASS 100/100; tester làm fail-proof và khôi phục kỳ vọng ở từng checkpoint. Full-preview main + draft 45 file/911 test PASS. Typecheck draft PASS; lint draft 15 file, 0 cảnh báo/lỗi. Các lượt sandbox đầu có EACCES loopback/EPERM cache, chạy lại với quyền loopback và thư mục cache trong `ref/` thì các gate trên PASS. E2E P2-4 chưa chạy vì draft chưa áp dụng; e2e main hiện 23/23 PASS. `main-files.mjs check` ngay sau XONG: không có file chính nào đổi.

**Báo cáo reviewer độc lập — CHẶN** (15 file áp dụng, +1611/-1 dòng):

1. Lỗi chặn tại `src/modules/rooms/rooms.service.ts:170`: Manager gửi `?buildingId=` hợp lệ nhưng truy vấn vẫn trả phòng của mọi tòa được giao, trái API-08. Cần đưa ID đã chọn vào `where` và kiểm thử quản lý có hai tòa.
2. Lỗi chặn tại `src/modules/rooms/rooms.service.ts:190`: kiểm tòa đang mở và `room.create` nằm ở hai thao tác riêng; tòa có thể bị khóa ở giữa, trái ROOM-06. Cần khóa/kiểm tòa rồi tạo phòng trong một transaction.
3. Lỗi chặn tại `src/modules/rooms/rooms.service.ts:76` và `:125`: cho thêm trùng `publicId`; xóa một row sẽ gọi Cloudinary xóa asset còn được row khác dùng, trái ROOM-07. Cần từ chối `publicId` trùng trong phòng và test thêm lặp rồi xóa.

**Nên sửa:** `src/modules/rooms/rooms.service.spec.ts:90` mới kiểm ACTIVE bằng dữ liệu giả lập; tiêu chí BE-P2-18 yêu cầu phòng seed CG01/203. Thêm kiểm thử tích hợp khi chạy DB sau áp dụng.

Reviewer chỉ đọc, không chạy build/test. Reviewer đã xem toàn bộ 15 file áp dụng, quy tắc repo/backend, feature P2-4, schema/helper liên quan, spec 00/01/02/10/11/12 và VIEW-13; không thấy test skip/focus hoặc `[ASSUMPTION]` mới trong file áp dụng. Đây là khuyến nghị độc lập; chủ dự án quyết định yêu cầu sửa hoặc duyệt.

**Lượt sửa theo yêu cầu chủ dự án 03/11/2026:** Ba lỗi CHẶN cũ đã được sửa trong draft và tester độc lập kiểm. CP-1 101/101, CP-4 102/102, CP-5 105/105 PASS; CP-2 49/49 và CP-3 54/54 PASS từ lượt đầu. Full-preview main + draft 46 file/916 test PASS, typecheck PASS, lint draft 16 file với 0 cảnh báo/lỗi. Tester đã làm fail-proof và phục hồi kỳ vọng. E2E của mã draft chưa thể chạy trước áp dụng; e2e main 23/23 PASS. `main-files.mjs check` ngay sau XONG: không có file chính nào đổi.

**Báo cáo reviewer độc lập lượt hai — CHẶN** (16 file áp dụng, +1812/-1 dòng):

1. Lỗi chặn tại `src/modules/rooms/dto/rooms.dto.ts:83`: `floor` tạo/sửa chỉ chặn dưới 1, không chặn vượt giới hạn `Int` của schema. `2147483648` qua DTO rồi lỗi Prisma thành HTTP 500 thay vì 400 `VALIDATION_FAILED` (ROOM-01, API-04). Cần giới hạn cả hai DTO và test HTTP cho số vượt giới hạn.

**Nên sửa:** `src/modules/rooms/rooms.service.spec.ts:91` chỉ kiểm hợp đồng ACTIVE qua mock, chưa kiểm trực tiếp seed CG01/203 theo BE-P2-18; bổ sung test DB dev sau áp dụng. `src/modules/rooms/rooms.service.ts:315` có `assertBuildingAccess` không được gọi; nên xóa.

Reviewer xác nhận ba lỗi cũ về lọc `buildingId`, khóa tòa khi tạo phòng và `publicId` ảnh trùng đã có xử lý trong draft. Reviewer chỉ đọc, không chạy build/test; đã đọc 16 file đích, diff `app.module.ts`, quy tắc repo/backend, feature P2-4, spec 00/01/02/10/11/12, schema và helper/module liên quan. Không có giả định nghiệp vụ mới. Chờ chủ dự án yêu cầu sửa tiếp; chưa được áp dụng.

**Lượt sửa `floor` theo yêu cầu chủ dự án 03/11/2026:** DTO tạo/sửa đã chặn `floor` ngoài Int32 và có test HTTP POST/PATCH cho 1, 2147483647, 2147483648. CP-1 111/111 PASS; CP-2 49/49, CP-3 54/54, CP-4 102/102, CP-5 105/105 PASS. Full-preview main + draft 46 file/922 test PASS; typecheck PASS; lint draft 16 file, 0 cảnh báo/lỗi. Tester đã chạy fail-proof và phục hồi kỳ vọng. E2E draft chưa chạy trước áp dụng. `main-files.mjs check` ngay sau XONG: không file chính nào đổi.

**Báo cáo reviewer độc lập lượt ba — CHẶN** (16 file áp dụng, +1864/-1 dòng):

1. Lỗi chặn tại `src/modules/rooms/rooms.service.ts:141`: `deleteImage` commit xóa dòng trước khi gọi Cloudinary. Trong khoảng này, `addImage` có thể thêm lại cùng `publicId`; lệnh Cloudinary sau đó xóa asset của ảnh mới (ROOM-07). Cần ngăn tái sử dụng `publicId` trong suốt quá trình xóa asset và test hai yêu cầu xóa/thêm đồng thời.

**Nên sửa:** `src/modules/rooms/rooms.service.ts:315` có `assertBuildingAccess` không dùng; nên xóa. Reviewer xác nhận giới hạn `floor` Int32, lọc `buildingId` của Manager và khóa dòng tòa khi tạo phòng phù hợp với spec. Reviewer chỉ đọc 16 file mã/test, đối chiếu `app.module.ts`, helper auth/scope/files/buildings/date/pagination/error, schema và spec 00/01/02/10/11/12; không chạy build/test/e2e; không có `[ASSUMPTION]` mới. Chủ dự án đã yêu cầu sửa lỗi và làm tiếp Phase 2 trong chat, nên tiếp tục sửa cùng draft; chưa được áp dụng.

**Lượt kiểm race ảnh 03/11/2026 — DỪNG:** Coder chuyển Cloudinary destroy vào trong transaction có khóa phòng, đặt timeout 5 giây cho fetch và 10 giây cho transaction; bỏ helper không dùng. Tester bổ sung test đồng thời: 2 PASS, 1 FAIL. Trường hợp Cloudinary xử lý destroy muộn sau timeout vẫn xóa asset mới đã gắn lại cùng `publicId`, nên CP-5 chưa đạt. Không chạy full-preview/typecheck/lint sau test FAIL này. `main-files.mjs check` ngay sau DỪNG: không file chính nào đổi. Cần quyết định Q-P24-9 trong feature P2-4 trước khi sửa tiếp. Tài liệu Cloudinary xác nhận `asset_id` là bất biến và Upload API hỗ trợ destroy bằng `asset_id`; nếu chọn hướng này phải xác minh `asset_id` gắn đúng `publicId` và cập nhật FILE-02/schema có draft riêng hoặc trong draft hiện tại.

**Lượt Q-P24-9 A 03/11/2026 — DỪNG tại CP-5:** Planner cập nhật PLAN.md thành 8 checkpoint. Coder chuẩn bị `asset_id` trong schema và migration dừng an toàn nếu có row cũ thiếu ID; `prisma validate` và Prisma Client preview PASS. Tester chưa chạy được `rooms.schema.spec.ts` (0 test) vì workspace thiếu `@electric-sql/pglite`; do đó migration và DB 50/50 chưa được xác nhận. Truy vấn chỉ đọc DB dev cho `room_images count: 0`; không suy ra DB khác cũng rỗng. `main-files.mjs check` ngay sau DỪNG: không file chính nào đổi. Chủ dự án đang được hỏi Q-P24-10 về cài PGlite chỉ trong draft `ref/`; không tự cài gói.

Chủ dự án đã cho cài `@electric-sql/pglite` chỉ dưới draft `ref/` ngày 03/11/2026. Không sửa dependency main hoặc ghi DB dev để kiểm migration. Tiếp tục CP-5 sau khi cài.

PGlite 0.5.15 đã được cài dưới `ref/node_modules` bằng manifest `ref/package.json` (đều bị `apply-draft` loại trừ). npm ban đầu tự tìm manifest cha và cài nhầm vào `Source/backend/node_modules`; đã gỡ gói khỏi đó, rồi kiểm `ref` có PGlite, backend không còn PGlite, `Source/backend/package.json`/`package-lock.json` không đổi và `main-files.mjs check` không có file chính đổi. Test draft cần alias/import trỏ tới `ref/node_modules` vì Node không tự tìm thư mục con này.

**CP-5 xác minh lại trong phiên chính:** spec `02-database.md` chỉ định PGlite nhánh 0.2; đã ghim `ref/package.json` vào 0.2.17. Với 0.5.15 checker chỉ đạt 49/50 do thông báo FK khác phiên bản; với 0.2.17 lệnh `node prisma/check-constraints.mjs artifact_BE/2026-11-03-BE-P2-17-21/ref artifact_BE/2026-11-03-BE-P2-17-21/ref` đạt **50/50**. `npx prisma validate --schema artifact_BE/2026-11-03-BE-P2-17-21/prisma/schema.prisma` với `DATABASE_URL`/`DIRECT_URL` giả đạt PASS, không kết nối DB. `npx vitest run --config artifact_BE/2026-11-03-BE-P2-17-21/ref/vitest.preview.config.ts artifact_BE/2026-11-03-BE-P2-17-21/src/modules/rooms/rooms.schema.spec.ts` đạt **4/4 PASS** với quyền cho cache tạm; sandbox mặc định từng báo EPERM khi rename cache trước khi chạy test. Trước đó orchestrator DỪNG vì lệnh validate thiếu `DIRECT_URL`; `main-files.mjs check` ngay sau DỪNG không có file chính đổi. Không sửa code ở lượt xác minh này; CP-5 có đủ bằng chứng để tiếp tục CP-6.

**Lượt Q-P24-9 A, CP-6..8 và review độc lập 04/11/2026:** CP-1 111/111, CP-2 49/49, CP-3 54/54, CP-4 102/102, CP-5 4/4, CP-6 21/21, CP-7 105/105, CP-8 draft 126/126 PASS; tester làm fail-proof từng checkpoint. Full-preview main + draft 48 file/912 test PASS, chỉ loại test FILE-02 cũ ở main được bản draft mirror; typecheck PASS; lint draft 20 file, 0 cảnh báo/lỗi; DB checker 50/50. E2E code draft chưa chạy trước áp dụng. DB dev `room_images count: 0` qua truy vấn chỉ đọc. `main-files.mjs check` ngay sau XONG: không file chính nào đổi.

**Báo cáo reviewer độc lập lượt bốn — CHẶN** (22 file áp dụng, +2247/-314 dòng):

1. `src/modules/rooms/rooms.service.ts:306`: `PATCH /rooms/:id` giảm `maxOccupants` mà không kiểm số người đang ở; phòng seed CG01/203 có hai người vẫn đổi giới hạn xuống một, trái DB-B6 và CON-13. Kiểm số người đang ở, từ chối giá trị thấp hơn trong cùng transaction cập nhật.
2. `src/modules/rooms/rooms.schema.spec.ts:3`: test nhập PGlite và Prisma Client từ `ref/`, bị loại khi áp dụng; backend chính không có `Source/backend/ref/` hoặc dependency PGlite. Chuyển test migration chỉ phục vụ draft vào `ref/`, hoặc dùng phụ thuộc chạy được trên main; giữ test phù hợp ở bản chính.
3. `src/modules/files/files.service.spec.ts:31` và `src/modules/files/cloudinary.spec.ts:16`: draft thay test FILE-01 cũ bằng test FILE-02 mới, khiến sau áp dụng mất kiểm chữ ký upload, scope tòa, folder, định dạng và transformation. Giữ các test FILE-01 hiện có, thêm test `asset_id`.

Không có mục “nên sửa” riêng. Reviewer chỉ rà tĩnh, không chạy build/test/migration; đã đọc 22 file áp dụng, đối chiếu 5 file đích hiện có, CLAUDE/README backend, feature P2-4, spec 00/01/02/10..14, guard/helper/schema/seed. Migration dừng nếu DB có ảnh cũ; điều kiện DB dev rỗng đã được phiên chính kiểm riêng. Reviewer đối chiếu API Cloudinary chính thức. Đây là khuyến nghị độc lập, chủ dự án quyết định áp dụng; chỉ đạo “chốt P2-4” ngày 04/11/2026 là yêu cầu sửa tiếp, nên đang làm cùng draft.

**Lượt sửa reviewer 04/11/2026 — DỪNG trước code:** Planner cập nhật PLAN.md với CP-9..12 nhưng DB-B6/CON-13 chưa định nghĩa cách tính người đang ở tại ngày ra; API-03/04 chưa chọn mã lỗi khi giảm `maxOccupants` dưới số đang ở. Hai câu Q-P24-11/12 đã ghi trong feature P2-4 và hỏi chủ dự án. `main-files.mjs check` ngay sau DỪNG: không file chính nào đổi. Chưa chạy checkpoint mới, chưa áp dụng draft.

Chủ dự án trả lời ngày 04/11/2026: Q-P24-11 B — chỉ đếm occupant thuộc hợp đồng ACTIVE, đã vào ở, chưa rời trước hôm nay; `move_out_date = today` vẫn tính hết ngày theo Hà Nội. Q-P24-12 A — PATCH giảm `maxOccupants` dưới số đang ở trả HTTP 409 `CONFLICT_STATE`. Tiếp tục CP-9..12 và chuẩn bị cập nhật spec tương ứng trong draft chung.

**Lượt kiểm CP-9..11 ngày 04/11/2026 — DỪNG:** CP-9 tách test migration dùng PGlite sang `ref/`, test áp dụng trên main không còn import `ref/`; hai suite 2/2 PASS, checker DB 50/50. CP-10 khôi phục test FILE-01 cùng FILE-02: files 37/37 PASS, full-preview 926/926 PASS, typecheck PASS, lint 0. CP-11 đã thêm kiểm sức chứa theo ngày Hà Nội trong transaction; các ca giảm 2→1 trả 409 và HTTP loopback đã chạy qua, nhưng preview Rooms cuối còn 2/114 test FAIL (10/11 suite PASS): hai mock HTTP PATCH tầng biên dùng `room.update` thay vì `room.updateMany`, không cập nhật bản ghi cho lần đọc lại. Hai vòng sửa đã hết; chưa có CP-11 PASS, chưa chạy CP-12 hoặc reviewer độc lập. `main-files.mjs check` ngay sau DỪNG: không có file chính nào đổi. Chờ Q-P24-13 cho lượt sửa test mới; chưa xin áp dụng draft.

Chủ dự án chọn **dừng P2-4 tại đây** ngày 04/11/2026 theo Q-P24-13. Không mở lượt sửa mới, không chạy CP-12/reviewer và không áp dụng bản nháp backend hoặc spec vào file chính.

Sau đó chủ dự án yêu cầu **làm nốt P2-4 rồi các phần Phase 2 tiếp theo** trong chat ngày 04/11/2026. Mở lượt sửa test mới cho hai mock HTTP còn lỗi và tiếp tục CP-11/12/reviewer; yêu cầu này chưa phải duyệt áp dụng draft.

**Kết quả cuối ngày 04/11/2026:** CP-9 migration/schema 4/4 PASS; CP-10 FILE-01/02 37/37 PASS; CP-11 Rooms 114/114 PASS, fail-proof cố ý làm sai assertion thì FAIL và sau khôi phục PASS; CP-12 full-preview 49 file/937 test PASS, typecheck `--noEmit` PASS, oxlint 0 lỗi/cảnh báo trên 21 file, Prisma validate PASS, DB constraints 50/50. Tester độc lập chạy lại và xác nhận các gate. Lần đầu HTTP gặp EACCES loopback trong sandbox; chạy với quyền loopback thì PASS. E2E DB thật **chưa chạy/chưa xác minh trên draft** vì runner loại `artifact_BE/**`; phải chạy sau khi được duyệt và áp dụng. Truy vấn DB dev chỉ đọc đã xác nhận `room_images` có 0 row. `main-files.mjs check` ngay sau orchestrator XONG: không file chính nào đổi.

**Báo cáo reviewer độc lập cuối — DUYỆT** (23 file áp dụng, +2519/-12 dòng):

- Lỗi chặn: không phát hiện.
- Nên sửa: `prisma/migrations/20261103000000_room_image_asset_id/migration.sql:3` chủ động dừng nếu `room_images` đã có dữ liệu. Xác nhận bảng trống ở môi trường áp dụng; nếu có ảnh, chuẩn bị cách điền `asset_id` thật trước khi chạy migration.
- Ghi chú: đây là khuyến nghị cho chủ dự án, chưa phải phê duyệt áp dụng draft. Reviewer chỉ đọc mã và test; không chạy build, test, migration hoặc kiểm tra DB thực. Không dùng `[ASSUMPTION]` mới.
- Đã kiểm: đối chiếu ba file sửa với file đích; đọc 20 file mới, caller và helper liên quan; đọc `CLAUDE.md`, `Artifacts/README.md`, hướng dẫn backend, task BE-P2-17..21 và các spec `00`, `01`, `02`, `10`, `11`, `12`, `14`; kiểm tra scope, sức chứa, ngày Hà Nội, ảnh Cloudinary, schema và assertion test.

## Giả định hoặc câu hỏi cho chủ dự án

- Q-P24-1 / ROOM-01: Chủ dự án trả lời ngày 03/11/2026: tầng hầm là “G”, các tầng khác từ 1 trở lên. Q-P24-1b: chọn không tạo phòng ở tầng G; `rooms.floor` giữ kiểu Int và API tạo/sửa chỉ nhận số nguyên >= 1.
- Q-P24-2 / ROOM-07: Chủ dự án chọn A ngày 03/11/2026: thêm ảnh thứ 11 trả HTTP 409 `CONFLICT_STATE`.

Planner cập nhật PLAN.md theo hai quyết định rồi mới bắt đầu checkpoint. Các `[ASSUMPTION]` và `[OPEN]` trong spec phải được nêu rõ; không tự quyết định quy tắc nghiệp vụ thiếu.

`[ASSUMPTION]` dùng trong draft: A-P2-4-1 mã phòng giữ nguyên chữ nhập; A-P2-4-2 `areaM2` là JSON number với một chữ số thập phân; A-P2-4-3 PATCH rỗng là no-op; A-P2-4-4 sắp ảnh bằng toàn bộ ID từ vị trí 0; A-P2-4-6 mã phòng trùng trả `400 VALIDATION_FAILED`. Kế thừa A2-3 về thông báo phân trang và A2-8 về cạnh dài ảnh tối đa 1920 px.

Đã chép vào file chính 04/11/2026 bằng apply-draft.mjs: 23 file.
