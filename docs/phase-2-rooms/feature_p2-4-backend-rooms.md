# Phase 2 · Part 4 – Backend rooms and images (BE-P2-17..21)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified on the main files. Do tasks in order. Every task is drafted in `Source/backend/artifact_BE/` and approved by the owner before it touches main files (root `CLAUDE.md`). All parts and their order: [README.md](README.md).

| | |
|---|---|
| Needs first | Part 3 on the main files |
| Unblocks | Part 5; frontend part 8a |
| Draft folder | `Source/backend/artifact_BE/<YYYY-MM-DD>-BE-P2-17-21/` |
| How | Pipeline |
| Part done when | BE-P2-21 on the main files |

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/backend/CLAUDE.md`
2. `docs/spec/00-overview.md`, `docs/spec/01-architecture.md` (FILE-01, FILE-02)
3. `docs/spec/10-auth.md` – SCOPE-02
4. `docs/spec/11-buildings-rooms.md` – ROOM-01..09, room status table, BLD-07
5. `docs/spec/12-pricing.md` – PRC-07 (expired flag for the grid)
6. Part 2 and 3 code: `src/common/*`, `src/modules/files`, `src/modules/buildings`

## Scope

In: `/rooms`, `/rooms/:id/images`, derived room status, data for the floor grid.
Out: price proposals (part 5), public listing (part 6).

## Tasks

- [x] **BE-P2-17** `GET/POST/PATCH /rooms` in scope (ROOM-01): `price` is never written (ROOM-02); `furniture` is an array of strings; duplicate code text and no create in a locked building (ROOM-06).
  Chủ dự án yêu cầu tiếp tục P2-4 ngày 04/11/2026; mở lượt sửa test mới cho hai ca HTTP PATCH tầng biên còn sai mock `updateMany`, rồi chạy CP-11, CP-12 và review độc lập.
  Chủ dự án chọn Q-P24-11 B (tính người ra ở hết ngày rời theo Hà Nội) và Q-P24-12 A (409 `CONFLICT_STATE`); tiếp tục sửa kiểm sức chứa trong transaction.
  Chủ dự án yêu cầu sửa lỗi `floor` vượt giới hạn Prisma Int và làm tiếp Phase 2; đang sửa DTO tạo/sửa và test HTTP trong cùng draft, chưa áp dụng.
  Reviewer lượt bốn yêu cầu chặn giảm `maxOccupants` thấp hơn số người đang ở trong cùng transaction (DB-B6, CON-13); tiếp tục theo chỉ đạo chốt P2-4.
  Quyết định Q-P24-1/1b: tầng G không có phòng; `rooms.floor` chỉ nhận số nguyên từ 1 trở lên.
  Done when: unit tests ROOM-01, ROOM-02, ROOM-06; manager A → `OUT_OF_SCOPE` on manager B's room (SCOPE-02).
- [x] **BE-P2-18** Maintenance and lock (ROOM-03, ROOM-04, ROOM-09): refused with HOLD/ACTIVE contracts; response gives the count of NEW/CONFIRMED viewings.
  Quyết định Q-P24-1/1b đã rõ; tiếp tục CP-2 sau CP-1.
  Done when: tests on seed CG01/203 (ACTIVE contract) refused; a free room works; count returned.
- [x] **BE-P2-19** `src/modules/rooms/room-status.ts` – derived status by the spec priority (Đang thuê, Đã cọc, Bảo trì, Trống), never stored.
  Done when: unit test for each row and for the priority order.
- [x] **BE-P2-20** Floor-grid list: floor, code, area, price, status, PENDING / expired proposal (PRC-07), image count; `?includeInactive=true` (BLD-07); `meta` paging.
  Chủ dự án yêu cầu sửa lọc `?buildingId=` của Manager và review lại trong cùng draft.
  Done when: unit tests; one query per page (no N+1).
- [x] **BE-P2-21** Images (ROOM-07, FILE-02): add with `publicId` + `version` + `format` only, max 10, order, delete (row then Cloudinary, failure logged). Then `npm run lint`, `test`, `build`, `test:e2e` pass.
  Chủ dự án chọn Q-P24-9 A và cho cài PGlite chỉ trong draft `ref/` theo Q-P24-10. CP-5 schema/migration đã có bằng chứng 4/4 test, `prisma validate` PASS và checker DB 50/50; tiếp tục CP-6..8.
  Reviewer lượt bốn yêu cầu chuyển test migration phụ thuộc `ref/` ra khỏi file áp dụng và giữ test FILE-01 cũ khi thêm test FILE-02; đang sửa trong draft.
  Chủ dự án yêu cầu sửa `publicId` ảnh trùng và review lại trong cùng draft.
  Chủ dự án chọn Q-P24-2 A: ảnh thứ 11 trả HTTP 409 `CONFLICT_STATE`; e2e DB thật vẫn chờ cấu hình môi trường dev.
  Done when: tests: 11th image refused, wrong folder → 400, URL built by the BE, Cloudinary delete failure does not fail the request; all checks pass; list every `[ASSUMPTION]`.

## Questions for the owner

- Q-P24-1 (BE-P2-17/18; ROOM-01): Chủ dự án trả lời ngày 03/11/2026: tầng hầm là “G”, các tầng khác từ 1 trở lên; không dùng tầng âm hay nhãn tầng 0.
- Q-P24-1b: Chủ dự án chọn C ngày 03/11/2026: không tạo phòng ở tầng G. Giữ schema `rooms.floor` là Int, chỉ nhận số nguyên từ 1 trở lên trong API tạo/sửa phòng.
- Q-P24-2 (BE-P2-21; ROOM-07): Chủ dự án chọn A ngày 03/11/2026: ảnh thứ 11 trả HTTP 409 `CONFLICT_STATE`.
- Q-P24-3 (BE-P2-17): CP-1 dừng sau hai vòng sửa vì lỗi môi trường test và assertion; chủ dự án có muốn mở một lượt sửa mới để hoàn tất CP-1 không?
  Chủ dự án chọn tiếp tục sửa CP-1 trong chat ngày 03/11/2026.
- Q-P24-4 (BE-P2-17): Sau khi áp dụng draft env đã duyệt, dùng gate preview 41/41 trong PLAN để tiếp tục CP-2; `npm run test` toàn bộ sẽ kiểm ở CP-5 theo PLAN. Chủ dự án đã yêu cầu tiếp tục sửa CP-1 đến khi hoàn tất trong chat ngày 03/11/2026; không có quyết định nghiệp vụ mới.
- Q-P24-5 (BE-P2-17/20/21): Reviewer độc lập CHẶN ba lỗi tại `rooms.service.ts:170,190,76/125` dù test draft 911/911 PASS. Chủ dự án muốn sửa đúng các lỗi và review lại trong cùng draft, hay có chỉ đạo khác?
  Chủ dự án chọn sửa ba lỗi trong cùng draft và review độc lập lại ngày 03/11/2026.
- Q-P24-6 (BE-P2-17): Sửa test harness HTTP để mô phỏng `$transaction` sau khi production code được khóa tòa đúng spec. Quyết định “sửa và review lại” của chủ dự án cho ba lỗi CHẶN vẫn có hiệu lực, không có quy tắc nghiệp vụ mới cần chọn.
- Q-P24-7 (BE-P2-17): Reviewer lượt hai CHẶN `floor` vượt giới hạn Prisma Int trong DTO, đề nghị sửa cả tạo/sửa và thêm test HTTP trong cùng draft, rồi review độc lập lại. Chờ chủ dự án xác nhận yêu cầu sửa tiếp.
  Chủ dự án yêu cầu sửa lỗi và làm tiếp các phần trong chat ngày 03/11/2026.
- Q-P24-8 (BE-P2-21): Reviewer lượt ba CHẶN race xóa rồi thêm lại cùng `publicId` khi Cloudinary chưa xóa xong. Chỉ đạo “sửa lỗi cho tôi đi xong bắt đầu các phần tiếp” của chủ dự án ngày 03/11/2026 áp dụng cho lượt sửa P2-4 này; không có quyết định nghiệp vụ mới.
- Q-P24-9 (BE-P2-21; ROOM-07, FILE-02): Test race sau sửa chứng minh Cloudinary có thể xử lý destroy muộn sau timeout và xóa asset mới cùng `publicId`. Cần chủ dự án chọn: A lưu và xác minh `asset_id` bất biến của Cloudinary, xóa theo `asset_id` (đổi API FILE-02/schema); B trạng thái xóa bền vững và cấm tái sử dụng `publicId` (đổi schema/flow); C giữ best-effort và chấp nhận race. Chưa có câu trả lời.
  Chủ dự án chọn A trong chat ngày 03/11/2026. Phải xác minh `asset_id` khớp `publicId`/version/format qua Cloudinary trước khi gắn ảnh; xóa theo `asset_id` bất biến, kể cả khi `publicId` được dùng lại.
- Q-P24-10 (BE-P2-21): `@electric-sql/pglite` chưa có trong workspace; cho phép cài chỉ dưới draft `ref/` để test migration và 50/50 mà không sửa dependency main không? Đã hỏi chủ dự án trong chat, chờ trả lời.
  Chủ dự án chọn cho cài trong draft ngày 03/11/2026; không sửa package.json/lockfile chính hoặc ghi DB dev.
- Q-P24-11 (BE-P2-17; DB-B6/CON-13): “Người đang ở” tại ngày nghiệp vụ Hà Nội đếm A: hợp đồng ACTIVE, vào ở <= hôm nay, ra ở NULL hoặc > hôm nay; B: như A nhưng ra ở = hôm nay vẫn tính; C: mọi occupant chưa ra thuộc HOLD/ACTIVE kể cả ngày vào tương lai? Chờ chủ dự án chọn.
  Chủ dự án chọn B ngày 04/11/2026: chỉ hợp đồng ACTIVE, `move_in_date <= today`, `move_out_date IS NULL OR move_out_date >= today`; người ra ở hôm nay vẫn tính trong ngày.
- Q-P24-12 (BE-P2-17; API-03/04, DB-B6): PATCH `maxOccupants` nhỏ hơn số người đang ở trả A: 409 `CONFLICT_STATE`; B: 400 `VALIDATION_FAILED` với `fields.maxOccupants`? Chờ chủ dự án chọn.
  Chủ dự án chọn A ngày 04/11/2026: HTTP 409 `CONFLICT_STATE`.
- Q-P24-13 (BE-P2-17; CP-11): Sau hai vòng sửa, còn hai test HTTP PATCH tầng biên dùng mock `room.update`/`room.updateMany` không phản ánh Prisma; code sức chứa và 112/114 ca đã qua. Chủ dự án cho mở một lượt sửa test mới để sửa mock/assertion, chạy lại CP-11, CP-12 và reviewer không?
  Chủ dự án chọn dừng P2-4 tại đây ngày 04/11/2026, sau đó yêu cầu tiếp tục làm nốt P2-4 và các phần sau trong chat cùng ngày; mở lượt sửa test mới. Chưa duyệt áp dụng draft.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->

- 03/11/2026 · BE-P2-17/18/21 · Planner đã viết PLAN.md CP-1..5 nhưng phát hiện hai quy tắc nghiệp vụ chưa rõ (Q-P24-1, Q-P24-2); orchestrator DỪNG trước khi viết code. Main-files.mjs check: không file chính nào bị đổi. Chờ chủ dự án chọn phương án rồi resume.
- 03/11/2026 · BE-P2-17/18/21 · Chủ dự án chọn ảnh thứ 11 → 409 CONFLICT_STATE, tầng hầm “G”, tầng khác từ 1. Vì floor hiện là Int, đã hỏi thêm Q-P24-1b về biểu diễn “G”; tiếp tục giữ CP-1/2 chờ quyết định, CP-5 đã rõ quy tắc lỗi.
- 03/11/2026 · BE-P2-17/18 · Chủ dự án chọn không tạo phòng ở tầng G; floor chỉ là số nguyên >= 1. Hai câu hỏi P2-4 đã được giải quyết; tiếp tục pipeline từ planner.
- 03/11/2026 · BE-P2-17 · Orchestrator DỪNG sau hai vòng sửa CP-1. Lượt test cuối: 4 suite fail, 9/11 assertion fail; hai suite DTO không chạy vì Reflect metadata, sáu HTTP test EACCES loopback, ba assertion dùng sai dạng response của Nest. Chưa có checkpoint PASS. Main-files.mjs check: không file chính nào đổi. Cần chủ dự án cho lượt sửa mới; trước khi resume phải chạy main-files.mjs save.
- 03/11/2026 · BE-P2-17 · Chủ dự án cho lượt sửa CP-1 mới. Main-files.mjs save đã chạy sau hotfix P2-3 được duyệt và commit; tiếp tục orchestrator từ CP-1.
- 03/11/2026 · BE-P2-17 · Orchestrator DỪNG lần nữa: preview CP-1 41/41 PASS; full suite mặc định 882/883 assertion PASS, 6 suite fail vì import từ draft cần resolver preview, draft env thiếu các file main, và `src/common/env.spec.ts` còn đọc `.env.example`. PLAN CP-1 chỉ yêu cầu preview; draft env đã được duyệt để sửa lỗi file mẫu. Main-files.mjs check: không file chính nào đổi. Tiếp tục sau áp dụng env và lưu mốc.
- 03/11/2026 · BE-P2-17 · Draft env được duyệt/áp dụng; lint/build PASS, unit main 39 file/880 test PASS, e2e 23/23 PASS/CLEANED. Quyết định tiếp tục sửa CP-1 của chủ dự án vẫn còn hiệu lực. Tiếp tục pipeline theo gate preview của PLAN; full suite main+draft sẽ chạy với cấu hình preview trong `ref/` để resolve import draft, không đổi config file chính trước khi duyệt.
- 03/11/2026 · BE-P2-17/20/21 · Pipeline P2-4 XONG: CP-1..5 PASS (41/49/54/67/100), full-preview 911/911, typecheck/lint draft PASS; reviewer CHẶN ba lỗi: Manager lọc `buildingId` chưa áp vào where, create phòng chưa khóa tòa trong transaction, ảnh `publicId` trùng có thể xóa asset còn dùng. Đề nghị bổ sung test DB seed CG01/203 sau áp dụng. Main-files.mjs check ngay sau XONG: không file chính nào đổi. Cần chủ dự án chọn sửa tiếp; chưa được áp dụng draft.
- 03/11/2026 · BE-P2-17/20/21 · Chủ dự án yêu cầu sửa ba lỗi CHẶN trong cùng draft, thêm test độc lập và review lại. Task trở về [~]; chưa áp dụng file chính.
- 03/11/2026 · BE-P2-17 · Orchestrator DỪNG sau hai vòng sửa test: 8/9 suite, 98/101 test PASS; ba test HTTP nhận 500 do mock Prisma ở `rooms.http.spec.ts` thiếu `$transaction` sau khi coder đưa kiểm tòa và tạo phòng vào một transaction. Main-files.mjs check ngay sau DỪNG: không file chính nào đổi. Đây là lỗi harness, không phải quyết định nghiệp vụ; tiếp tục theo yêu cầu sửa và review lại đã có của chủ dự án.
- 03/11/2026 · BE-P2-17/20/21 · Pipeline sửa theo yêu cầu XONG: ba lỗi cũ đã xử lý; CP-1 101/101, CP-4 102/102, CP-5 105/105, full-preview 916/916, typecheck và lint PASS. Reviewer lượt hai CHẶN thêm lỗi `floor` vượt Prisma Int tại DTO tạo/sửa, có thể trả 500 thay vì 400; đề nghị test HTTP. Hai góp ý: test seed CG01/203 sau áp dụng và bỏ helper không dùng. Main-files.mjs check ngay sau XONG: không file chính nào đổi. Chờ chủ dự án yêu cầu sửa tiếp; chưa áp dụng draft.
- 03/11/2026 · BE-P2-17 · Chủ dự án yêu cầu sửa lỗi reviewer lượt hai và làm tiếp Phase 2. Tiếp tục cùng draft P2-4, chưa duyệt áp dụng.
- 03/11/2026 · BE-P2-21 · Pipeline sửa `floor` XONG: CP-1 111/111, full-preview 922/922, typecheck/lint PASS; reviewer lượt ba CHẶN race xóa ảnh rồi thêm lại `publicId` trước khi Cloudinary xóa xong, có thể làm hỏng ảnh mới. Góp ý xóa helper không dùng. Main-files.mjs check ngay sau XONG: không file chính nào đổi. Tiếp tục sửa trong cùng draft theo chỉ đạo sửa lỗi và làm tiếp Phase 2 của chủ dự án; chưa áp dụng.
- 03/11/2026 · BE-P2-21 · Orchestrator DỪNG: test race `rooms.images.spec.ts` 2 PASS/1 FAIL; timeout destroy vẫn có thể xóa asset mới sau khi DB nhả khóa. Coder xác nhận chỉ kéo dài timeout hoặc giữ khóa không bảo đảm an toàn. Main-files.mjs check ngay sau DỪNG: không file chính nào đổi. Cần quyết định Q-P24-9 trước khi tiếp tục; chưa áp dụng draft.
- 03/11/2026 · BE-P2-21 · Chủ dự án chọn lưu/xác minh Cloudinary `asset_id` và xóa theo ID bất biến để giải quyết race. Tiếp tục trong draft; cần draft spec FILE-02 và schema/migration backend, chưa áp dụng file chính.
- 03/11/2026 · BE-P2-21 · Orchestrator DỪNG tại CP-5: `prisma validate` và tạo Prisma Client preview PASS; `rooms.schema.spec.ts` không chạy được test nào vì thiếu `@electric-sql/pglite`. Migration/DB 50/50 chưa được xác minh. DB dev `room_images count: 0` qua truy vấn chỉ đọc. Main-files.mjs check ngay sau DỪNG: không file chính nào đổi. Chờ Q-P24-10; không tự cài gói.
- 03/11/2026 · BE-P2-21 · Chủ dự án cho cài PGlite chỉ dưới draft `ref/` để chạy migration/50-50. Tiếp tục pipeline sau khi cài và lưu mốc main-files.
- 03/11/2026 · BE-P2-21 · Orchestrator DỪNG tại CP-5 sau hai lượt test: lượt cuối `prisma validate` thiếu `DIRECT_URL` vì lệnh không cấp biến giả, chưa chạy acceptance khác. Main-files.mjs check ngay sau DỪNG: không file chính nào đổi. Phiên chính chạy lại với `DATABASE_URL`/`DIRECT_URL` giả (không kết nối DB): Prisma validate PASS; PGlite đúng nhánh spec 0.2.17: migration test 4/4 PASS, checker DB 50/50 PASS. CP-5 được xác minh bằng chính test draft, không mở thêm vòng sửa code; tiếp tục CP-6.
- 04/11/2026 · BE-P2-17/21 · Pipeline Q-P24-9 A XONG: CP1..8 PASS, full-preview 912/912, typecheck/lint PASS, DB 50/50; reviewer độc lập CHẶN ba lỗi: giảm `maxOccupants` thấp hơn số người đang ở, test migration phụ thuộc `ref/` sẽ hỏng sau áp dụng, và test FILE-01 cũ bị thay mất. Main-files.mjs check ngay sau XONG: không file chính nào đổi. Chủ dự án yêu cầu chốt P2-4 và làm tiếp phần sau; sửa trong cùng draft, chưa áp dụng.
- 04/11/2026 · BE-P2-17 · Planner cập nhật PLAN.md CP-9..12 rồi orchestrator DỪNG trước khi code: thiếu định nghĩa đếm người đang ở tại ngày ra và mã lỗi PATCH vượt số đang ở (Q-P24-11/12). Main-files.mjs check ngay sau DỪNG: không file chính nào đổi. Chờ chủ dự án chọn hai quy tắc; chưa áp dụng draft.
- 04/11/2026 · BE-P2-17 · Chủ dự án chọn Q-P24-11 B và Q-P24-12 A; tiếp tục CP-9..12, chưa áp dụng draft.
- 04/11/2026 · BE-P2-17 · Orchestrator DỪNG ở CP-11 sau hai vòng sửa test: preview Rooms 10/11 suite, 112/114 test PASS. Hai test HTTP PATCH floor=1 và floor=2147483647 dùng mock `room.update` trong khi service gọi `room.updateMany`, mock không cập nhật record khi đọc lại. CP-9/10 PASS; CP-12/reviewer chưa chạy. `main-files.mjs check` ngay sau DỪNG: không file chính nào đổi. Chờ Q-P24-13 cho lượt sửa mới, chưa áp dụng draft.
- 04/11/2026 · BE-P2-17 · Chủ dự án trả lời Q-P24-13: dừng P2-4 tại đây. Draft và spec draft giữ ở trạng thái chưa duyệt/chưa áp dụng. P2-5, P2-6, FE8a và các phần sau phụ thuộc P2-4 trên main nên chưa bắt đầu.
- 04/11/2026 · BE-P2-17 · Chủ dự án tiếp tục yêu cầu hoàn tất P2-4 và các phần Phase 2 tiếp theo; mở một lượt sửa mới cho hai mock HTTP còn lỗi, sau đó CP-12/reviewer. Chưa duyệt áp dụng draft.
- 04/11/2026 · BE-P2-17..21 · Chủ dự án duyệt và đã áp dụng riêng draft spec (5 file) và backend (23 file); migration asset_id áp dụng DB dev sau khi xác nhận `room_images=0`. Hotfix ba file test được duyệt/áp dụng vì suite main thiếu `reflect-metadata` và assertion AppModule cũ. Kiểm main sau hotfix: unit 50 file/993 test PASS, lint 0, build PASS, e2e DB dev 3 file/23 test PASS; cleanup list không còn log chưa dọn/bản ghi E2E lạ. Schema/constraints main khớp bản đã kiểm PGlite 50/50. Test ROOM-03/04 trên fixture `203` với HOLD/ACTIVE, phòng trống và số lịch hẹn; không có ca e2e riêng gọi PATCH trên seed CG01/203, đây là giới hạn coverage để kiểm thêm ở P2-10 QA. Đã commit mã/spec `70aa09c` và hotfix test `2fa7acb`.
