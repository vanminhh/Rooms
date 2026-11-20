# BE-P3-24 · Xem ảnh CCCD riêng tư

**Cập nhật sau checkpoint:** owner báo đã commit; Git xác minh `ee0e891` cùng workspace sạch trước BE-P3-25. Không suy ra kết quả full suite mới từ xác nhận commit; phần dưới lưu kết quả tại điểm dừng BE-P3-24.

20/11/2026. BE-P3-23 đã commit `ab5ebac`, Git sạch trước lượt này. **BE-P3-24 đã triển khai, kiểm chứng các tiêu chí CON-16 / DB-B9 và được reviewer DUYỆT; chờ owner kiểm/commit.** Lượt full backend bị automatic approval review chặn, chưa có kết quả full suite mới.

## Kết quả chức năng

`GET /api/v1/contracts/:id/occupants/:oid/id-photos` dành cho BOSS hoặc MANAGER đang phụ trách tòa. Service kiểm quyền staff lần nữa trước transaction, không chỉ dựa vào route guard. Occupant phải thuộc đúng contract. Tenant/guest nhận `403 FORBIDDEN`; manager ngoài tòa nhận `403 OUT_OF_SCOPE`; không có route ảnh tương ứng ở `/me`.

Response có hai trường `front` và `back`, mỗi trường là `{ url, expiresAt }` hoặc null khi chưa có ảnh mặt đó. Các URL dùng helper Cloudinary private hiện có, cùng thời điểm ký, hết hạn sau tối đa 300 giây, header `Cache-Control: no-store`. Thiếu cả hai ảnh, không có occupant hoặc ghép oid của hợp đồng khác trả `404 NOT_FOUND`. Staff vẫn đọc được lịch sử HOLD/ACTIVE/ENDED/CANCELLED trong phạm vi hiện tại.

Transaction lấy mapping shared → contract `FOR SHARE` → kiểm scope hiện tại → đọc hai asset ID → ký link → ghi một audit `occupant.view_id` → commit rồi mới trả response. Khóa phối hợp với writer chuyển quản lý/tắt tòa/tắt manager và writer sửa ảnh người ở. Một request có hai ảnh vẫn chỉ ghi một audit; gọi lại ghi thêm một audit. Bản ghi chứa actor, entity `occupant`, occupant ID và IP, không chứa ảnh, URL, số CCCD hoặc ciphertext. Khi audit/read/signing thất bại, không trả link và không commit audit; lỗi ngoài dự kiến được chuyển thành INTERNAL_ERROR để logger không in raw dữ liệu riêng tư.

Các list/detail hiện có vẫn chỉ trả cờ có ảnh và last4 theo quyền. Endpoint mới không giải mã CCCD, không sửa account/session/người ký/hóa đơn.

## Tệp thay đổi

- `Source/backend/src/modules/contracts/contract-occupants.controller.ts`: route staff + no-store.
- `Source/backend/src/modules/contracts/contract-occupants.service.ts`: kiểm scope, đọc ảnh, ký URL và audit atomic.
- `Source/backend/src/modules/contracts/contracts.occupants.http.spec.ts`: 34 ca mới trên AppModule, auth/controller/service/signing/audit thật; chỉ giả lập biên Prisma/provider.
- `docs/spec/14-contracts.md`: ghi rõ response và lỗi thiếu ảnh cho frontend.
- `docs/phase-3-contracts/feature_p3-5-backend-occupants-vehicles.md`, `PROGRESS.md`, plan/checkpoint BE-P3-24, ghi nhận commit ở checkpoint BE-P3-23 và `docs/LESSONS.md`.

## Kiểm chứng thực tế

Chạy tại `Source/backend`; không đọc `.env`, không gọi Cloudinary hoặc DB dev.

| Kiểm tra | Kết quả |
|---|---|
| HTTP cuối, source/test đã ổn định | **139/139**, 2 file, 4,47 giây; start 14:35:45; exit 0 |
| `contracts.occupants.http.spec.ts` | **113/113**, gồm 79 ca BE-P3-23 và 34 ca BE-P3-24 |
| `contracts.documents.http.spec.ts` | **26/26** hồi quy scan/print |
| Service biên dịch + Prisma + PostgreSQL nhúng | **7/7**, exit 0; áp dụng 10 migration có sẵn vào DB test cô lập |
| `npm run build` | exit 0 |
| `npm run lint` cuối | 0 lỗi, 4 warning sort cũ ở dashboard/pricing; 257 file, 1,3 giây; exit 0 |
| Scoped TypeScript noEmit cho HTTP spec và imports | exit 0 |
| `git diff --check` | đạt |
| Review độc lập, chỉ đọc | **DUYỆT**, không phát hiện chặn |
| Full backend hiện tại | **Bị auto-review chặn**, không có JSON/exit code xác nhận kết quả; không suy ra từ 2405 test của BE-P3-23 |

Lệnh HTTP cuối:

```powershell
node .\node_modules\vitest\vitest.mjs run src/modules/contracts/contracts.occupants.http.spec.ts src/modules/contracts/contracts.documents.http.spec.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=.\node_modules\.cache\rooms-p3-24\http-final.json
```

Output thực:

```text
✓ src/modules/contracts/contracts.documents.http.spec.ts (26 tests) 1695ms
✓ src/modules/contracts/contracts.occupants.http.spec.ts (113 tests) 1900ms
Test Files  2 passed (2)
Tests       139 passed (139)
Start at    14:35:45
Duration    4.47s
```

Các log ERROR cố ý của `contracts.documents.http.spec.ts` là ca audit/template lỗi có sẵn; 26 ca vẫn đạt. Các ca lỗi BE-P3-24 dùng logger capture và kiểm không lộ số CCCD/asset ID.

SQL smoke cô lập nằm trong cache bỏ qua bởi Git (`node_modules/.cache/rooms-p3-24/id-photos-postgres-smoke.mjs`), dùng adapter PostgreSQL nhúng sẵn từ BE-P3-23, không cài dependency. Output thực:

```text
PASS 1: real service + Prisma + PostgreSQL locks, photo SELECT and one audit insert
PASS 2: repeated views create a second audit row
PASS 3: tenant and out-of-scope manager cannot obtain links or commit audits
PASS 4: cross-contract occupant lookup is denied by the real SQL predicate
PASS 5: outer transaction rolls back an actual audit insert on a later failure
PASS 6: one optional image is supported; no images returns NOT_FOUND without an audit
PASS 7: current assignment revokes a manager even with stale buildingIds
PASS 7/7; 10 existing migrations; isolated embedded PostgreSQL only
```

Full-suite attempt used the standard Vitest runner with maxWorkers=2. The initial call returned a session ID, but automatic approval review rejected the result-wait operation over potential unverified telemetry to `dc.services.visualstudio.com`. No full-suite JSON was produced. Static search found no telemetry destination in backend src/test/scripts, but that does not establish the origin or payload of the flagged traffic. The blocked action was not retried or bypassed; completed the scoped HTTP checks with verified fake DB/provider edges instead. This is an environment verification limit, not a passing full-suite result or an asserted product failure.

## Owner kiểm chứng

1. Dùng token staff đúng tòa, gọi route với contract/occupant có ảnh: response 200, no-store, hai URL hoặc một mặt null, expiresAt không quá 5 phút từ lúc ký; audit_logs thêm một dòng `occupant.view_id` đúng actor và occupant.
2. Gọi lại: thêm một audit nữa, không dùng response cache. Không ghi URL hoặc số CCCD vào audit.
3. Token manager tòa khác: `403 OUT_OF_SCOPE`; token tenant: `403 FORBIDDEN`; oid hợp đồng khác: `404 NOT_FOUND`; các ca này không có audit xem ảnh thành công.
4. Người ở chưa có ảnh: 404; có một ảnh: 200 với mặt còn lại null. List/detail thông thường vẫn không có URL ảnh/full CCCD.
5. Chạy bộ backend đầy đủ trên máy owner để bổ sung kết quả mà phiên này bị chặn:

```powershell
npm test -- --maxWorkers=2
```

## Giả định và giới hạn

Không thêm giả định nghiệp vụ mới. A-25/26 của BE-P3-23 được giữ như lịch sử mặc định triển khai; endpoint đọc ảnh không sửa policy mutation/capacity và không coi commit là câu trả lời riêng Q-P3-16/17. Chưa kiểm tải ảnh/hết hạn với Cloudinary thật hoặc chạy E2E trên DB dev; E2E toàn P3-5 thuộc BE-P3-27. PostgreSQL nhúng dùng một connection, xác minh SQL/rollback nhưng không chứng minh tranh chấp khóa đa connection.

## Báo cáo reviewer đầy đủ

**DUYỆT BE-P3-24 — không có phát hiện chặn trong source đã review.**

Reviewer: GPT của phiên Codex, model kế thừa; không chạy Sonnet 5. Review độc lập, chỉ đọc; không sửa file, chạy migration, gọi dịch vụ ngoài hoặc commit.

1. **Quyền và phạm vi — đạt.** Controller chỉ cho BOSS/MANAGER; service kiểm staff lần nữa trước transaction. Sau khóa mapping, service kiểm lại quản lý hiện tại, trạng thái tòa và quản lý. `oid` được truy vấn cùng `contractId`, chặn việc ghép người ở của hợp đồng khác. Tenant/guest không đọc được ảnh qua route staff; không mở route ảnh trong `/me`.
2. **Giao dịch và concurrency — đạt khi rà source.** `contract-occupants.service.ts:98–110` dùng mapping shared → contract `FOR SHARE` → kiểm scope → đọc ảnh → ghi audit trong một transaction. Writer đổi quản lý/tắt tòa và tắt manager lấy mapping exclusive; cập nhật người ở lấy contract `FOR UPDATE`. Thứ tự này bảo vệ scope hiện tại và ảnh đọc được.
3. **URL và dữ liệu riêng tư — đạt.** Chỉ chọn hai asset ID, dùng helper ký hiện có với cùng thời điểm và TTL 300 giây; trả `Cache-Control: no-store`. Không giải mã hay trả CCCD đầy đủ. Thiếu một mặt trả null; thiếu cả hai trả NOT_FOUND.
4. **Audit và lỗi — đạt.** Mỗi request thành công ghi đúng một `occupant.view_id`, entity người ở, actor và IP. Audit không chứa asset ID, URL hoặc CCCD. Transaction phải commit trước khi service trả link. Lỗi ký/đọc/audit không trả link; lỗi ngoài dự kiến được thay bằng INTERNAL_ERROR trước global logger.
5. **Kiểm thử — phù hợp phạm vi.** Đọc 34 ca mới, bao phủ chữ ký/TTL, lặp request, ảnh tùy chọn, các trạng thái hợp đồng, tenant/guest/anonymous, sai tòa, chuyển quản lý, vô hiệu manager sau guard, oid khác hợp đồng, validation, thiếu cấu hình và rollback audit. Dùng controller/service/auth/signing thật; chỉ mock biên DB/provider.

**Ghi chú P3, không chặn:** `docs/phase-3-contracts/feature_p3-5-backend-occupants-vehicles.md:30` vẫn mô tả BE-P3-23 “awaiting owner review/commit”. Khi chốt BE-P3-24, cập nhật thành đã commit `ab5ebac` để khớp PROGRESS/plan.

**Giới hạn:** reviewer không tự chạy suite. `git diff --check` đạt. HTTP dùng transaction fixture có tuần tự hóa, nên không chứng minh tranh chấp khóa PostgreSQL thật. Chưa xác minh tải ảnh/hết hạn với Cloudinary thật hoặc DB dev; các kết quả full suite/SQL smoke cần ghi từ output của phiên chính.

**Xử lý ghi chú tài liệu:** đã sửa trạng thái BE-P3-23 trong task và thêm ghi nhận commit `ab5ebac` ở checkpoint cũ; giữ đầy đủ lịch sử giả định. Không có phát hiện source cần sửa sau review.

## Commit đề xuất

```text
feat(contracts): audit private occupant ID photo views (BE-P3-24, CON-16, DB-B9)
```

Owner kiểm rồi commit; phiên này không stage/commit/push. Sau xác nhận commit, tiếp tục BE-P3-25 (xe).
