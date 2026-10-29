# BE-LOGIN-02: sửa đường dẫn tài liệu khi chuyển schema sang `Source/backend/prisma/`

Trạng thái: ĐÃ DUYỆT 29/10/2026 (chủ dự án: "Duyệt cả hai")
Task / spec: BE-LOGIN-02 (`docs/phase-1-foundation/feature_p1-1-backend-foundation.md`)
Gốc: 5c11740

## Làm gì, vì sao

BE-LOGIN-02 chuyển `schema.prisma`, `constraints.sql`, `check-constraints.mjs` từ `docs/database/` sang `Source/backend/prisma/` (bản nháp backend `Source/backend/artifact_BE/2026-10-29-BE-LOGIN-01-08/`). Mọi chỗ trỏ tới `docs/database/` phải đổi theo, nếu không link và lệnh kiểm DB sẽ hỏng.

Task chỉ nêu `02-database.md` và `CLAUDE.md` gốc; bản nháp sửa thêm 5 file cũng trỏ tới đường dẫn cũ (bỏ file nào thì báo):

- `docs/spec/02-database.md`: 3 link ở đầu file; mục "Run the DB check" chạy từ `Source/backend` (prisma đã là dev dependency, chỉ cài tạm `pglite`).
- `CLAUDE.md` gốc: dòng "Source of truth", bản đồ repo (bỏ `docs/database/`, thêm `prisma/` dưới `Source/backend/`), lệnh kiểm DB.
- `docs/spec/README.md`: 3 link "Schema files".
- `docs/spec/01-architecture.md`: bảng tầng DB, cây thư mục. Dòng roadmap Phase 1 ("Move `docs/database/*` …") giữ nguyên vì là mô tả việc của Phase 1. Thêm dòng `INTERNAL_ERROR | 500` vào bảng mã lỗi (chủ dự án chọn ở Q4 ngày 29/10/2026; code BE-LOGIN-08 đã dùng mã này).
- `.gitignore` gốc: file sinh ra `schema.sql` nay nằm ở `Source/backend/prisma/schema.sql`.
- `Artifacts/README.md`: ví dụ lệnh kiểm DB.
- `Source/backend/CLAUDE.md`: dòng `prisma/` trong sơ đồ thư mục; thêm theo nhận xét của reviewer BE-LOGIN-01..08: dòng `main.ts` (cấu hình nay ở `app.setup.ts`) và bỏ dòng nhắc gỡ `ObserveModule` (BE-LOGIN-01 đã gỡ).

Lệnh kiểm DB mới, chạy trong `Source/backend`: `node prisma/check-constraints.mjs . prisma` (`.` = nơi có `node_modules/@electric-sql/pglite`, `prisma` = nơi có `schema.sql` và `constraints.sql`).

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `docs/spec/02-database.md` | cùng đường dẫn | Sửa |
| `CLAUDE.md` | cùng đường dẫn | Sửa |
| `docs/spec/README.md` | cùng đường dẫn | Sửa |
| `docs/spec/01-architecture.md` | cùng đường dẫn | Sửa |
| `.gitignore` | cùng đường dẫn | Sửa |
| `Artifacts/README.md` | cùng đường dẫn | Sửa |
| `Source/backend/CLAUDE.md` | cùng đường dẫn | Sửa |
| – | `docs/database/schema.prisma`, `constraints.sql`, `check-constraints.mjs` | Xóa (bằng tay, sau khi bản nháp backend đã chép `prisma/` và chủ dự án đồng ý) |

Chép bản nháp này **cùng lúc** với bản nháp backend BE-LOGIN-01..08, không chép trước.

## Cách xem và kiểm tra

Với mỗi file: `git diff --no-index <đích> Artifacts/2026-10-29-BE-LOGIN-02-doc-paths/<đích>`

## Đã kiểm tra

29/10/2026:

- Mỗi chỗ thay chỉ khớp đúng 1 lần (script thay chuỗi có kiểm số lần khớp); trong bản nháp không còn đường dẫn `docs/database/` hay `../database/`, trừ dòng roadmap cố ý giữ.
- Lệnh kiểm DB mới chạy thử trên bản sao trong scratchpad (cấu trúc giống `Source/backend`: `prisma/` chứa 3 file hiện tại của `docs/database/`): `npm i --no-save @electric-sql/pglite@0.2`, `prisma migrate diff … -o prisma/schema.sql`, `node prisma/check-constraints.mjs . prisma` → **50/50 tình huống đúng như mong đợi**.
- File đích không đổi so với `5c11740`.

## Giả định hoặc câu hỏi cho chủ dự án

- "Done when" của BE-LOGIN-04 và dòng "Part done when" trong `feature_p1-1-backend-foundation.md` ghi `node prisma/check-constraints.mjs . .`; lệnh đúng là `… . prisma` (tham số thứ hai là thư mục chứa `schema.sql`). File feature chỉ được sửa dấu trạng thái, nên chưa sửa; anh/chị muốn sửa luôn trong một bản nháp không?

Đã chép vào file chính 29/10/2026 bằng apply-draft.mjs: 7 file.

Đã dọn 29/10/2026 (theo luật dọn `approved/` trong `Artifacts/README.md`): xóa bản sao `.gitignore`, `CLAUDE.md`, `Artifacts/README.md`, `Source/backend/CLAUDE.md`, `docs/spec/01-architecture.md`, `docs/spec/02-database.md`, `docs/spec/README.md` (lúc dọn, cả 7 trùng khớp với file cùng đường dẫn ở gốc repo). Giữ `REVIEW.md`. Mã commit: 99a97a5.
