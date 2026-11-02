# P2-2 · Backend nền dùng chung (BE-P2-01..10)

Trạng thái: ĐÃ DUYỆT 02/11/2026
Task / spec: BE-P2-01..10 (`docs/phase-2-rooms/feature_p2-2-backend-foundation.md`) · API-02, error codes, FILE-01/02, ROOM-05, BLD-05, PRC-06, RATE-04/06, SVC-05, VIEW-08
Gốc: b020c48

## Làm gì, vì sao

Gom mọi thứ các phần BE sau (P2-3..P2-6) cùng cần, để không phần nào tự viết lại: ánh xạ lỗi DB → mã lỗi spec, `meta` cho danh sách, helper "hôm nay" giờ Hà Nội, `ratesAt` / giá phòng hiện hành, điều kiện phòng công khai, `/files/sign` + kiểm ảnh, seed "Gửi xe điện", bộ chạy e2e trên DB dev (D2-14). Kế hoạch chi tiết: `PLAN.md` (thư mục này).

## File sẽ thêm / sửa / xóa ở bản chính

Đích tính từ `Source/backend/`. Không xóa file nào. Không migration.

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `src/common/errors/error-code.ts` | cùng đường dẫn | Sửa: +`PRICE_PROPOSAL_EXPIRED`, `UPLOAD_NOT_CONFIGURED` |
| `src/common/errors/db-errors.ts` (+ `.spec.ts`) | cùng đường dẫn | Thêm: ánh xạ ràng buộc/trigger → mã lỗi |
| `src/common/errors/all-exceptions.filter.ts` (+ `.spec.ts`) | cùng đường dẫn | Sửa / Thêm test |
| `src/app.setup.spec.ts` | cùng đường dẫn | Sửa: bảng mã +2 dòng, 23 → 25 (chủ dự án chọn A, 01/11) |
| `src/app.setup.ts` | cùng đường dẫn | Sửa: `ValidationPipe` thêm `transform: true` |
| `src/common/response.interceptor.ts` (+ `.spec.ts`) | cùng đường dẫn | Sửa: lối ra `{ data, meta }` |
| `src/common/pagination.ts` (+ `.spec.ts`) | cùng đường dẫn | Thêm |
| `src/common/date/today.ts` (+ `.spec.ts`) | cùng đường dẫn | Thêm |
| `src/common/rates/rates-at.ts` (+ `.spec.ts`) | cùng đường dẫn | Thêm |
| `src/common/rooms/public-room.ts` (+ `.spec.ts`) | cùng đường dẫn | Thêm |
| `src/modules/files/{cloudinary,files.service,files.controller,files.module}.ts`, `dto/sign.dto.ts` (+ 3 `.spec.ts`) | cùng đường dẫn | Thêm |
| `src/app.module.ts` | cùng đường dẫn | Sửa: +`FilesModule` |
| `prisma/seed.ts`, `prisma/seed.spec.ts` | cùng đường dẫn | Sửa: +"Gửi xe điện" 150.000 đ cho mỗi tòa; test số đếm mới |
| `scripts/e2e/run.ts`, `scripts/e2e/cleanup.mjs`, `scripts/e2e/run.spec.ts` | cùng đường dẫn | Thêm (chủ dự án chọn `scripts/e2e/`, 02/11) |
| `package.json` | cùng đường dẫn | Sửa: chỉ `lint` thêm `scripts/` |
| `.gitignore` | cùng đường dẫn | Sửa: +`/test/e2e-runs/` |
| `src/common/errors/validation.ts`, `src/main.ts` | cùng đường dẫn | Bản sao y nguyên (chỉ để nháp chạy được), chép không đổi gì |

Tổng 35 file.

## Cách xem và kiểm tra

```bash
cd Source/backend
npx vitest run artifact_BE/2026-11-01-BE-P2-01-10
```

Diff từng file: `git diff --no-index <file chính> artifact_BE/2026-11-01-BE-P2-01-10/<file>`.

## Đã kiểm tra

Pipeline (orchestrator → planner → coder/tester theo 8 checkpoint → reviewer), 01–02/11/2026:
- CP-1..CP-8 đều PASS; mỗi checkpoint có fail-proof check (đảo một kỳ vọng thấy đỏ, hoàn nguyên thấy xanh). Bản nháp: 13 file test / 367 test qua. Hai vector chữ ký chính thức của Cloudinary khớp.
- Reviewer: **DUYỆT**, không lỗi chặn. 2 điểm "nên sửa" (không chặn): `cleanup.mjs:42-50` nên kiểm mọi bảng trong `E2E_TABLES` có reader tương ứng; `db-errors.ts:47-49` khớp lỗi theo chuỗi con – nên ghi chú cho người thêm key sau.

Phiên chính chạy lại 02/11/2026 (từ `Source/backend`):
- `npm run test` → 32 file / 959 test qua (gồm spec nháp).
- `npm run lint` → 0 lỗi (52 file); `npx oxlint --type-aware artifact_BE/2026-11-01-BE-P2-01-10/` → 0 lỗi (33 file).
- `npm run build` qua; `npx tsc -p tsconfig.build.json --noEmit` sạch.
- 2 bản sao y nguyên (`validation.ts`, `main.ts`): `git diff --no-index --exit-code` không khác.
- `main-files.mjs check`: không file chính nào bị đổi.
- Diff `package.json`, `.gitignore`, `app.setup.ts`, `app.setup.spec.ts` đúng như bảng trên.

Chưa kiểm (chỉ làm được sau khi chép, vì e2e và seed ghi DB dev): `npm run test:e2e` hai lần liên tiếp (nhật ký `CLEANED`), seed chạy hai lần không trùng. Phiên chính chạy ngay sau khi chép.

Sự cố trong pipeline: coder CP-7 ghi tạm `D:\Rooms\tsc-cp7.txt` bằng chuyển hướng shell (ngoài bản nháp) rồi xóa ngay; file không còn, git chưa từng theo dõi.

## Giả định hoặc câu hỏi cho chủ dự án

Quyết định đã có trong lúc chạy: (A) sửa test 23 → 25 mã (01/11); (b) bản sao y nguyên để nháp chạy được (01/11); bộ chạy ở `scripts/e2e/` (02/11); dòng có hợp đồng/hóa đơn liên kết thì bỏ qua và báo riêng (02/11).

Giả định của pipeline (duyệt bản nháp = đồng ý; muốn đổi dòng nào thì báo):
- A2-1 lỗi gán quản lý: `fields.managerId` "Người được gán phải là quản lý đang hoạt động".
- A2-2 lỗi mã tòa: `fields.code` "Mã tòa gồm 2–6 ký tự A–Z hoặc 0–9".
- A2-3 câu chữ lỗi `page` / `limit`.
- A2-4 hai giá phòng cùng ngày và cùng giờ duyệt → id lớn hơn thắng.
- A2-5 lỗi ảnh ghi vào `fields.publicId` / `fields.format` / `fields.version`.
- A2-6 đơn giá "Gửi xe điện" của seed có hiệu lực từ 01/09/2026.
- A2-7 mã lần chạy e2e dạng `YYYYMMDDThhmm-XXXX`.
- A2-8 giới hạn 1920 px bằng biến đổi `c_limit,w_1920,h_1920`.
- A2-9 `ValidationPipe` bật `transform: true` cho cả app (để số trong query thành số); mọi test Phase 1 vẫn qua.
- A2-10 `package.json` chỉ đổi dòng `lint`.

Còn để phần sau (theo PLAN): helper đặt lại giới hạn IP (P2-6) và chạy job giá theo `roomIds` (P2-5). Sau khi chép: dòng mô tả BE-P2-09 trong file task vẫn ghi `test/e2e-run.ts` – cần một bản nháp nhỏ để sửa thành `scripts/e2e/`.

Đã chép vào file chính 02/11/2026 bằng apply-draft.mjs: 35 file.
