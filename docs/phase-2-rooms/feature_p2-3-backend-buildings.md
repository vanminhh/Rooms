# Phase 2 · Part 3 – Backend buildings, services, managers (BE-P2-11..16)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified on the main files. Do tasks in order. Every task is drafted in `Source/backend/artifact_BE/` and approved by the owner before it touches main files (root `CLAUDE.md`). All parts and their order: [README.md](README.md).

| | |
|---|---|
| Needs first | Part 2 on the main files |
| Unblocks | Part 4 |
| Draft folder | `Source/backend/artifact_BE/<YYYY-MM-DD>-BE-P2-11-16/` |
| How | Pipeline |
| Part done when | BE-P2-16 on the main files |

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/backend/CLAUDE.md`
2. `docs/spec/00-overview.md`, `docs/spec/01-architecture.md`
3. `docs/spec/10-auth.md` – AUTH-08, SCOPE-02, SCOPE-04
4. `docs/spec/11-buildings-rooms.md` – BLD-01..07, SVC-01..05
5. `docs/spec/20-reports-audit-settings.md` – AUD-01
6. Part 2 code: `src/common/{errors,date,rates,rooms}`, `test/e2e-run.ts`

## Scope

In: `/buildings`, `/services`, `/managers`.
Out: rooms (part 4), rate plans and their approval (part 5), public endpoints (part 6).

## Tasks

- [~] **BE-P2-11** `GET/POST/PATCH /buildings` in `src/modules/buildings`: Boss creates and edits every field (BLD-01, BLD-06 code format); managers edit only `amenities` (array of strings) and `description` of their own buildings, any other field → 403 (BLD-02); list in scope with `?includeInactive=true` (BLD-07).
  P2002 trùng mã tòa đã có kiểm thử cho cả hai dạng metadata; reviewer mới đề nghị bổ sung kiểm meta.total của danh sách không rỗng.
  Done when: unit tests BLD-01, BLD-02, BLD-06 code; acceptance spec 11 "Manager cannot change code/address/manager_id (403)".
- [~] **BE-P2-12** Assign / unassign a manager on `PATCH /buildings/:id` (BLD-03): active MANAGER with fewer than 2 buildings; audit `building.manager_change`.
  Quyết định Q-P23-2: xét trạng thái cuối; tòa còn khóa không được gán quản lý, mở khóa và gán được trong cùng PATCH.
  Done when: tests: third building → `MANAGER_MAX_2_BUILDINGS`; inactive or non-manager → `VALIDATION_FAILED`.
- [~] **BE-P2-13** Lock / unlock a building (BLD-06): Boss only; refused with HOLD/ACTIVE contracts (`CONFLICT_STATE`); locking sets `manager_id = null` + audit; response includes the count of NEW/CONFIRMED viewings (VIEW-13).
  Quyết định Q-P23-2: xét trạng thái cuối; tòa còn khóa không được gán quản lý, mở khóa và gán được trong cùng PATCH.
  Done when: tests for the three cases; after locking, the old manager can be assigned another building.
- [~] **BE-P2-14** Public contact resolver `buildingContact(building)` (BLD-04): active manager with `contact_phone` → theirs; otherwise `settings.default_contact`; never the login phone. Used by part 6.
  Done when: tests: no manager, inactive manager, manager without `contact_phone`, normal case; acceptance spec 11 "Building with manager deactivated shows Boss's contact".
- [~] **BE-P2-15** `GET/POST/PATCH /services` (SVC-01, SVC-02, SVC-04): GET staff in scope with "has a rate in effect" flag; POST/PATCH Boss; lock instead of delete.
  Test trùng tên dịch vụ khi tạo và đổi tên đã PASS; reviewer vòng ba DUYỆT. Chờ chủ dự án duyệt draft và kiểm sau áp dụng trước khi đánh dấu hoàn tất.
  Quyết định Q-P23-1: unit cố định từ lúc tạo; PATCH chỉ sửa tên và khóa/mở.
  Done when: unit tests; duplicate name in a building → `VALIDATION_FAILED`.
- [!] **BE-P2-16** `GET/POST/PATCH /managers` in `src/modules/auth/managers.*` (AUTH-08): create returns the temporary password once; deactivate revokes sessions and keeps `manager_id`; reactivate; audit `manager.create`, `manager.deactivate`. Then `npm run lint`, `test`, `build`, `test:e2e` (BE-P2-09 runner) pass.
  Đã áp dụng draft được duyệt; lint/build/unit trên file chính PASS. E2E chưa chạy được vì môi trường thiếu DATABASE_URL và Source/backend/.env; chờ cấu hình DB dev để xác minh và dọn dữ liệu thử.
  Done when: acceptance spec 10 new manager forced to change password, deactivated manager's refresh fails, building shows Boss's contact while the manager is inactive; all checks pass; list every `[ASSUMPTION]`.

## Questions for the owner

- Q-P23-1 (BE-P2-15 / CP-5): Chủ dự án chọn A ngày 02/11/2026: unit cố định từ lúc tạo; PATCH chỉ sửa name và khóa/mở; buildingId giữ cố định.
- Q-P23-2 (BE-P2-12/13 / CP-2/CP-3): Chủ dự án chọn A ngày 02/11/2026: xét trạng thái cuối; còn khóa + managerId khác null thì 409 CONFLICT_STATE; cho phép mở khóa và gán trong cùng PATCH.
- CP-1 mirror hash: không cần quyết định nghiệp vụ của chủ dự án; sửa byte dư trong draft và tiếp tục kiểm tra.
- CP-1 BLD-02: Chủ dự án đã đồng ý thêm một vòng sửa test và tiếp tục P2-3 trong chat ngày 02/11/2026.
- E2E sau áp dụng P2-3: máy hiện không có `Source/backend/.env`, `DATABASE_URL` hoặc `DIRECT_URL`. Chủ dự án có thể cung cấp cấu hình kết nối DB dev qua kênh bí mật hoặc chỉ dẫn môi trường dev đã chuẩn bị ở đâu để chạy `npm run test:e2e` không? Không gửi bí mật vào chat.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->

- 02/11/2026 · BE-P2-12/13/15 · Planner phát hiện hai quy tắc nghiệp vụ chưa có trong spec; tạm dừng pipeline để chủ dự án chọn Q-P23-1 và Q-P23-2. Không sửa file chính.
- 02/11/2026 · BE-P2-12/13/15 · Chủ dự án đã chọn A cho cả Q-P23-1 và Q-P23-2 trong chat; tiếp tục pipeline với quy tắc đã ghi ở trên.
- 02/11/2026 · BE-P2-11 / CP-1 · Orchestrator DỪNG: build, typecheck, lint draft qua nhưng 16 dependency mirror chưa byte-identical với main; main-files.mjs check xác nhận không file chính nào đổi. Đã xác định 15 file có byte dư cuối file và runner e2e lệch một byte khác; yêu cầu coder sửa draft rồi tester kiểm độc lập.
- 02/11/2026 · BE-P2-11 / CP-1 · Coder đã sửa mirror, hash mismatchCount=0; build/typecheck/lint draft PASS. Tester sau 2 vòng sửa còn 7/43 test FAIL vì assertion kiểm `response` dạng chuỗi, trong khi raw ForbiddenException có `response.message = 'FORBIDDEN'`. Pipeline DỪNG theo giới hạn 2 vòng; main-files.mjs check xác nhận không file chính nào đổi. Cần chủ dự án cho phép một vòng tester nữa.
- 02/11/2026 · BE-P2-11 / CP-1 · Chủ dự án cho phép thêm một vòng sửa test trong chat; tiếp tục pipeline từ tester CP-1.
- 03/11/2026 · BE-P2-11 / review P2-3 · Sáu checkpoint PASS, nhưng reviewer CHẶN tại buildings.service.ts:33: P2002 meta.target = ['code'] có thể thành 500 thay vì VALIDATION_FAILED. Đề nghị bổ sung test gán ID Boss/Tenant tại managers.service.spec.ts:67. Theo yêu cầu làm tiếp Phase 2, sửa trong draft rồi review lại; main-files.mjs check không file chính nào bị đổi.
- 03/11/2026 · BE-P2-15 / review vòng 2 · Đã sửa lỗi trùng mã tòa, thêm test Boss/Tenant; 887/887 test backend PASS. Reviewer vẫn CHẶN tại services.service.spec.ts:23 vì thiếu kiểm trùng tên dịch vụ cùng tòa khi tạo/đổi tên. Đề nghị thêm meta.total của danh sách tòa có dữ liệu tại buildings.http.spec.ts:27. Sửa test trong draft rồi review lại; main-files.mjs check không file chính nào bị đổi.
- 03/11/2026 · BE-P2-11..16 / review vòng 3 · Đã thêm test trùng tên dịch vụ và meta.total; 104/104 test draft, 891/891 test backend, build/typecheck/lint PASS, reviewer DUYỆT không lỗi chặn. E2E DB thật chưa chạy được trong draft, sẽ kiểm sau khi chủ dự án duyệt và áp dụng. Main-files.mjs check không file chính nào đổi; task giữ [~] chờ duyệt.
- 03/11/2026 · BE-P2-16 / BE-P2-09 · Chủ dự án duyệt P2-3, apply-draft.mjs chép 63 file. Lint main 99 file 0 lỗi/cảnh báo, build PASS, unit main 39 file/884 test PASS. `npm run test:e2e` FAIL trước khi dùng DB vì thiếu DATABASE_URL; log `20261103T1003-8Y2Y.json` có status FAILED_CLEANUP nhưng mọi ID rỗng. Chưa xác minh e2e/CLEANED; cần DB dev, không đánh [x].
