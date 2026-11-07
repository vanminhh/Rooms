# Spec: checklist đưa lên production (xử lý tài khoản dev)

Trạng thái: ĐÃ DUYỆT 08/11/2026 (chủ dự án: "Duyệt, áp vào")
Task / spec: SPEC-GO-LIVE · DEP-07..09, AUTH-08
Gốc: 2450365

## Làm gì, vì sao

Chủ dự án quyết định (08/11/2026): **không** chặn seed bằng code; khi deploy thì đổi Boss và vô hiệu các tài khoản dev. Ghi quyết định đó và các bước vào spec để không quên.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `docs/spec/01-architecture.md` | `docs/spec/01-architecture.md` | Sửa: thêm mục "Go-live checklist" DEP-07..09 (sau DEP-06) |
| `docs/spec/10-auth.md` | `docs/spec/10-auth.md` | Sửa: AUTH-08 thêm một vế "trên production sửa Boss có sẵn, không tạo lại" |

Không sửa code.

## Cách xem và kiểm tra

```bash
git diff --no-index docs/spec/01-architecture.md Artifacts/2026-11-08-SPEC-GO-LIVE/docs/spec/01-architecture.md
```

## Đã kiểm tra

- Các ID tham chiếu (BLD-06, ROOM-05, AUTH-09, G-05, DEP-05) có trong spec hiện tại.
- Không chạy được test (chỉ là tài liệu).

## Giả định hoặc câu hỏi cho chủ dự án

- Bước 3 ghi "khóa, không xóa" vì G-05; xóa hẳn chỉ khi database chưa có dữ liệu thật và khóa ngoại cho phép. Tôi chưa thử xóa thật trên database nào.
- Bước 4: tôi viết "xóa dữ liệu mẫu hoặc khóa tòa mẫu"; chọn cách nào là quyết định lúc deploy.

Đã chép vào file chính 08/11/2026 bằng apply-draft.mjs: 2 file.
