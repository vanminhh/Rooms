# QA-P3-02 / DB-07 — sửa checker dùng snapshot cũ

20/11/2026. Owner gửi ảnh `errorMissingColumn` khi chạy lệnh kiểm tra DB. Git pending vẫn là bộ BE27/FE01..14 đã biết và được cho tiếp tục; không stage/commit/push.

## Nguyên nhân và sửa

Tái hiện đầu vào `node prisma/check-constraints.mjs . prisma`: PostgreSQL nhúng trả **42703, column "called_by_id" does not exist**,`parse_relation.c/errorMissingColumn`, khớp ảnh. Tracked `prisma/schema.sql` còn `billing_day`/URL private cũ và thiếu các cột viewing-call Phase3; `schema.prisma`/`constraints.sql` đã cập nhật. Hướng dẫn trước thiếu regeneration và đã nhầm checker PGlite này với kiểm DB dev; lỗi ảnh không phải bằng chứng thiếu migration trên Supabase.

- `prisma/check-schema.mjs`: dùng Prisma CLI cục bộ sinh model→SQL trong bộ nhớ bằng `migrate diff --from-empty --to-schema-datamodel ... --script`. URL giả chỉ truyền child env; không ghi `.env` hoặc snapshot, không apply migration. Shellfalse/windowsHide/timeout30s. Generator lỗi/empty thì dừng, không fallback snapshot cũ. Thư mục chỉ có SQL vẫn được hỗ trợ rõ ràng.
- `prisma/check-constraints.mjs`: ưu tiên model hiện tại, nạp constraints vào PGlite, báo lỗi startup ngắn và đóng DB. Không thay đổi107case/expected/ràng buộc.
- `scripts/check-constraints.spec.ts`:8test hồi quy loader; helper thật, subprocess boundary fake; model ưu tiên, child env và command chỉdiff, failclosed, không lộ exception, giữ SQL-only fixtures.
- Sửa spec02, checklist/task/PROGRESS và LESSONS để checker chạy độc lập trước probe DB dev. Không sửa `schema.prisma`, `constraints.sql`, migration, dependency hoặc dữ liệu DB thật.

## Kiểm chứng thực tế

| Lệnh | Kết quả |
|---|---|
| `node prisma/check-constraints.mjs . prisma` | **107/107 tình huống đúng như mong đợi**,exit0; chạy không cần `--env-file` |
| Vitest `scripts/check-constraints.spec.ts` | **8/8**,1file,386ms,start21:47:45,exit0 |
| Backend lint, gồm hai file checker | exit0; 0 lỗi, 4 cảnh báo sort comparator cũ ở pricing/dashboard test |
| TypeScript noEmit cho test loader | exit0, không có lỗi |
| `git -c core.safecrlf=false diff --check` | exit0 |

Các con số full BE2633/FE981 trước đây không phải full rerun sau sửa utility; không cộng8 để nhận full2641. Không cần chạy lại frontend hoặc business API suites vì không đổi mã ứng dụng; verifier được kiểm trực tiếp bằng toàn bộ107case và scoped8test. Không suy offline pass thành migration/dev E2E đã đạt. Không có assumption nghiệp vụ mới.

Owner chạy lại ở `D:\Rooms\Source\backend`:

```powershell
node .\prisma\check-constraints.mjs . prisma
```

Kỳ vọng dòng cuối `107/107 tình huống đúng như mong đợi`. Hai lệnh E2E đã hướng dẫn có kết quả riêng; ảnh của lệnh cuối chưa cung cấp số test E2E nên không tự ghi chúng pass. Commit gợi ý: `fix(qa): generate current schema for offline constraints (QA-P3-02, DB-07)`.

Chủ dự án xác nhận ngày 20/11/2026: lệnh đã chạy ra đúng kết quả mong đợi. Ghi nhận checker **107/107** trên máy owner; không yêu cầu chạy lại. Phạm vi xác nhận chưa gồm hai lệnh E2E, cleanup hoặc nghiệm thu UI.

## Toàn văn reviewer

**DUYỆT QA-P3-02 / DB-07**, không có finding chặn.

- Dùng Prisma CLI đã cài để sinh SQL từ model hiện tại; không apply migration hay kết nối Supabase.
- URL giả chỉ nằm trong môi trường tiến trình con; không sửa `.env`, snapshot hoặc schema.
- Sinh SQL lỗi thì dừng; không quay lại snapshot cũ. Thư mục chỉ có SQL vẫn được hỗ trợ.
- PGlite đóng khi hoàn tất và khi nạp schema/constraints lỗi.
- Test gọi helper thật, chỉ giả lập tiến trình con; không mock phần đang kiểm tra hoặc bỏ qua test.

Kết quả parent cung cấp: checker **107/107**, helper **8/8**. Tôi chỉ đọc mã, không chạy lại.

“Offline” ở đây là độc lập với DB cấu hình; code không thiết lập cơ chế chặn mọi kết nối mạng của Prisma.
