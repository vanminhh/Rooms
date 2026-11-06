# P2-3 · Tòa nhà, dịch vụ và quản lý viên

Trạng thái: ĐÃ DUYỆT 03/11/2026
Task / spec: BE-P2-11..16 · BLD-01..07, SVC-01..05, AUTH-08, SCOPE-02/04, AUD-01, VIEW-13
Gốc: c2408e7

## Làm gì, vì sao
Thực hiện P2-3 theo kế hoạch Phase 2 bản 4 đã duyệt: API tòa nhà, dịch vụ và quản lý viên. P2-2 đã có trên file chính; BE-P2-09 còn chờ bằng chứng runner e2e Phase 2, cần kiểm chứng trong phần này.

## File sẽ thêm / sửa / xóa ở bản chính
Đích tính từ Source/backend/. Có 24 file thêm, 4 file sửa và 35 file dependency mirror byte-identical với file chính. Những file mirror này không đổi nội dung đích khi áp dụng, nhưng vẫn nằm trong draft để kiểm thử đúng module.

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| PLAN.md, REVIEW.md, ref/ | Không áp dụng | Hồ sơ và output kiểm nháp |
| src/modules/buildings/{building-contact.service.ts,building-contact.service.spec.ts,building-write.guard.ts,building-write.guard.spec.ts,buildings.controller.ts,buildings.http.spec.ts,buildings.module.ts,buildings.service.ts,buildings.service.spec.ts,buildings.types.ts,manager-assignment.ts,services.controller.ts,services.http.spec.ts,services.service.ts,services.service.spec.ts} | Cùng đường dẫn dưới Source/backend/ | Thêm |
| src/modules/buildings/dto/{buildings.dto.ts,buildings.dto.spec.ts,services.dto.ts} | Cùng đường dẫn dưới Source/backend/ | Thêm |
| src/modules/auth/{managers.controller.ts,managers.http.spec.ts,managers.service.ts,managers.service.spec.ts} và src/modules/auth/dto/managers.dto.ts | Cùng đường dẫn dưới Source/backend/ | Thêm |
| test/buildings.e2e-spec.ts | Source/backend/test/buildings.e2e-spec.ts | Thêm; chỉ chạy với DB sau duyệt và áp dụng |
| src/app.module.ts | Source/backend/src/app.module.ts | Sửa: đăng ký BuildingsModule |
| src/common/prisma/prisma.service.spec.ts | Source/backend/src/common/prisma/prisma.service.spec.ts | Sửa: kiểm imports AppModule |
| src/modules/auth/auth.module.ts | Source/backend/src/modules/auth/auth.module.ts | Sửa: đăng ký API quản lý |
| src/modules/settings/settings.module.ts | Source/backend/src/modules/settings/settings.module.ts | Sửa: export SettingsService |
| 35 file dependency mirror trong src/ và scripts/e2e/run.ts, liệt kê tại PLAN.md | Cùng đường dẫn dưới Source/backend/ | Sao y byte, không đổi nội dung |

## Cách xem và kiểm tra
Đọc PLAN.md, rồi chạy tại `Source/backend` để kiểm trực tiếp bản nháp, không chép vào main:

```powershell
npx vitest run artifact_BE/2026-11-02-BE-P2-11-16
npx tsc -p artifact_BE/2026-11-02-BE-P2-11-16/ref/tsconfig.preview.json --noEmit
npm run lint -- artifact_BE/2026-11-02-BE-P2-11-16/src artifact_BE/2026-11-02-BE-P2-11-16/test artifact_BE/2026-11-02-BE-P2-11-16/scripts
npm run build -- --path artifact_BE/2026-11-02-BE-P2-11-16/ref/tsconfig.build.json
npm run test
```

Build output nằm ở `ref/build/` và không được áp dụng. `test/buildings.e2e-spec.ts` đã được typecheck trong draft, nhưng e2e dùng DB thật chỉ chạy sau khi chủ dự án duyệt và áp dụng vì cấu hình e2e loại trừ `artifact_BE/`.

Kiểm sau áp dụng ngày 03/11/2026: `npm run lint` PASS, 99 file, 0 cảnh báo/lỗi; `npm run build` PASS; `npm run test` PASS, 39 file/884 test. `npm run test:e2e` FAIL trước khi kết nối vì thiếu `DATABASE_URL` (không có `.env` trong backend hay biến môi trường); 2 suite DB thất bại, 15 test bị skip, 8 test không dùng DB qua. Nhật ký `test/e2e-runs/20261103T1003-8Y2Y.json` ghi `FAILED_CLEANUP` với toàn bộ danh sách ID rỗng; lượt này không tạo dữ liệu thử. Cần cấu hình DB dev rồi chạy lại e2e, xác nhận run log CLEANED và BE-P2-09/16 trước khi đánh task hoàn tất.

Đã dọn 03/11/2026 sau commit `3ffebb9`: xóa bản sao code/test trong `src/`, `test/`, `scripts/`, PLAN.md và output/config kiểm nháp trong `ref/` của thư mục approved. Nội dung đã áp dụng nằm tại `Source/backend/` trong commit `3ffebb9`; giữ `REVIEW.md` làm hồ sơ duyệt và kết quả kiểm. Không xóa file chính.

## Đã kiểm tra
Orchestrator đã gộp hai đáp án A/A vào PLAN.md và hoàn tất sáu checkpoint. CP-1 43/43 test, CP-2 18/18, CP-3 21/21, CP-4 8/8, CP-5 10/10; CP-6 kiểm toàn draft 97/97 test. Toàn backend sau CP-6: 40 file, 884/884 test PASS. Build draft, typecheck và lint PASS; lint draft 137 file, 0 cảnh báo/lỗi. Tester đã chứng minh từng assertion có thể đỏ khi cố ý đổi kỳ vọng, sau đó khôi phục và chạy lại PASS. 35 dependency mirror khớp hash với file chính. Vitest trong sandbox Windows từng gặp EPERM khi đổi tên cache; các lượt chạy lại có quyền được cấp đã qua. Phiên chính chạy main-files.mjs check sau các phản hồi orchestrator: không file chính nào bị đổi.

Reviewer độc lập ngày 03/11/2026: **CHẶN**. Lỗi chặn tại `src/modules/buildings/buildings.service.ts:33`: nhận diện P2002 trùng mã tòa chỉ chấp nhận `buildings_code_key`, bỏ sót `meta.target = ['code']`; trường hợp này có thể thành 500 INTERNAL_ERROR thay vì lỗi validation theo API-04/BLD-06. Đề nghị tại `src/modules/auth/managers.service.spec.ts:67`: test tên “không phải MANAGER” mới dùng ID không tồn tại, cần thêm ID Boss/Tenant. Reviewer đã đọc spec 00/01/10/11/12/13/20, task, schema, service/controller/DTO/guard và test; reviewer không chạy test. Đang sửa draft và sẽ rà soát lại trước khi xin duyệt.

Vòng sửa review: test HTTP xác nhận cả P2002 `meta.target = "buildings_code_key"` và `["code"]` trả HTTP 400 `VALIDATION_FAILED`, `fields.code`, không tạo bản ghi; 11/11 test HTTP tòa PASS. Test quản lý bổ sung ID Boss/Tenant, xác nhận 404 và không ghi user/session/audit; 5/5 test riêng PASS. Toàn backend 887/887 test PASS; typecheck và lint PASS, fail-proof hai assertion đã đỏ đúng khi cố ý đổi kỳ vọng rồi khôi phục PASS.

Reviewer độc lập vòng 2 ngày 03/11/2026: **CHẶN**. Lỗi chặn tại `src/modules/buildings/services.service.spec.ts:23`: mock `service.create` luôn thành công; chưa có test trùng tên dịch vụ trong cùng tòa khi tạo và đổi tên, chưa kiểm `VALIDATION_FAILED` cùng `fields.name` theo Done when BE-P2-15. Đề nghị tại `src/modules/buildings/buildings.http.spec.ts:27`: mock `building.count` trả 0 dù danh sách Boss có dữ liệu, nên chưa kiểm `meta.total`; cần mock theo `where` và assert tổng khác 0. Reviewer đã đọc hướng dẫn repo/staging, feature BE-P2-11..16, spec 00/01/10/11/13/20, schema/helper và diff code/test; không chạy test. Đang bổ sung kiểm thử trong draft rồi rà soát lại.

Vòng sửa review 2: test HTTP kiểm POST trùng tên dù dịch vụ cũ đã khóa và PATCH đổi tên sang tên đã có: trả HTTP 400 `VALIDATION_FAILED` với `fields.name`; cùng tên ở tòa khác được phép. Test danh sách Boss có một tòa khẳng định `meta.total = 1` và vẫn giữ ca trang rỗng. Các lượt fail-proof đổi kỳ vọng đều đỏ đúng assertion rồi khôi phục. Thêm `test/buildings.e2e-spec.ts` và đưa file vào typecheck nháp; e2e DB thật và fail-proof của hai assertion e2e chưa thể chạy trước khi áp dụng. Kiểm cuối: `npx vitest run artifact_BE/2026-11-02-BE-P2-11-16` qua 10 file/104 test; `npm run test` qua 40 file/891 test; typecheck và build draft PASS; lint draft 138 file, 0 cảnh báo/lỗi. Lượt Vitest trong sandbox từng gặp EPERM cache trước khi chạy test, lần chạy lại có quyền đã qua.

Reviewer độc lập vòng 3 ngày 03/11/2026: **DUYỆT**, không phát hiện lỗi chặn. Phạm vi 28 file thêm/sửa, +2.462/-28 dòng; đây là khuyến nghị rà soát, không phải phê duyệt áp dụng của chủ dự án. Góp ý tại `src/modules/buildings/services.service.spec.ts:72` và `services.http.spec.ts:104`: hai tên test viện dẫn DB-B5, nhưng DB-B5 nói về loại dịch vụ gắn hợp đồng/xe, không quy định tính bất biến của `unit` hoặc `buildingId`; nên bỏ mã này khỏi tên test. Reviewer chỉ đọc, không chạy build/test/DB; e2e Prisma thật chưa được xác minh. Reviewer đã đối chiếu file thay đổi với đích, đọc controller/service/DTO/guard/helper, test buildings/services/managers/contact và e2e, cùng hướng dẫn repo, feature và spec 00/01/02/10/11/12/20.

Chủ dự án đã duyệt áp dụng chính bản nháp này trong chat ngày 03/11/2026. Tiếp theo phiên chính chạy `apply-draft.mjs`, kiểm lại trên file chính và e2e DB; không coi kết quả draft là Done khi chưa có kiểm sau áp dụng.

Baseline trên file chính ngày 02/11/2026, trước triển khai P2-3:
- Checkout thiếu dependency; đã phục hồi đúng package-lock hiện có bằng npm ci --ignore-scripts, không thêm gói và không đổi file khóa. Sinh Prisma Client 6.19.3 từ schema hiện có, không ghi DB.
- npm run test -- --reporter=dot: 30 file, 787 test qua (15,38 giây).
- npm run lint: 0 cảnh báo, 0 lỗi, 75 file.
- npx --no-install tsc --project tsconfig.build.json --noEmit --incremental false: qua. Đây là baseline file chính, chưa kiểm tra code draft mới.
- main-files.mjs check: không file chính nào bị đổi.
- Vitest trong sandbox Windows gặp EPERM khi đổi tên cache tạm; chạy lại ngoài sandbox được cấp quyền thì qua. Không thay cấu hình dự án để né sandbox.
- Runtime chưa nhận tên custom rooms_*; dùng role tương đương và đọc đúng chỉ dẫn cá nhân. Orchestrator/reviewer dùng gpt-6-sol, coder/tester dùng gpt-6-luna; planner lần đầu kế thừa chat gốc gpt-6.1-sol / ultra, lần tiếp tục theo chat hiện tại gpt-6-sol / high. Không thay file cấu hình agent.

Theo vitest.config.e2e.ts đã duyệt, e2e không chạy trên artifact_BE. Kiểm chứng e2e DB và hai nhật ký CLEANED chỉ thực hiện sau khi chủ dự án duyệt và bản nháp được áp dụng; không được coi là đã qua ở bước draft.

## Giả định hoặc câu hỏi cho chủ dự án
Chủ dự án đã trả lời hai câu hỏi nghiệp vụ ngày 02/11/2026:
- Q-P23-1 / BE-P2-15: chọn A. Unit dịch vụ cố định từ lúc tạo; PATCH chỉ sửa tên và khóa/mở. buildingId giữ cố định.
- Q-P23-2 / BE-P2-12/13: chọn A. Xét trạng thái cuối; tòa còn khóa và managerId khác null thì 409 CONFLICT_STATE; cho phép mở khóa và gán trong cùng PATCH.

Chủ dự án đã cho phép thêm một vòng tester sửa assertion `response.message` và chạy lại CP-1 trong chat ngày 02/11/2026. Reviewer DUYỆT là khuyến nghị; cần chủ dự án duyệt rõ ràng trong chat trước khi áp dụng.

[ASSUMPTION] A-P23-1: câu chữ tiếng Việt cho lỗi validation trùng mã tòa và trùng tên dịch vụ; mã lỗi và trường theo spec. [ASSUMPTION] A-P23-2: thứ tự mặc định và tie-breaker của danh sách có phân trang khi spec không quy định chi tiết. Hai giả định này cần chủ dự án xem khi duyệt draft.

Đã chép vào file chính 03/11/2026 bằng apply-draft.mjs: 63 file.
