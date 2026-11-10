# UI-01 · Spec theo giao diện Stitch đã làm

Trạng thái: ĐÃ DUYỆT 10/11/2026 (chủ dự án: "Duyệt cả hai")
Task / spec: UI-01 · KIT-02, KIT-10, KIT-11..13, 30-frontend (PublicLayout, `/`, `/phong/:id`, `/dang-nhap`)
Gốc: ff78ce5

## Làm gì, vì sao

Giao diện Stitch đã được merge từ nhánh `tquynh` (commit `ab287b9`) thẳng vào file chính, nhưng spec vẫn tả kiểu An Lâm cũ (góc vuông 2 px, tiêu đề Taviraj 300, logo chỉ có biểu tượng). Agent đọc spec sau này có thể "sửa ngược" giao diện. Bản nháp này ghi lại đúng những gì đã làm và các quyết định của chủ dự án ngày 08/11 và 10/11/2026.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `docs/spec/31-ui-kit.md` | `docs/spec/31-ui-kit.md` | Sửa: đoạn "Visual direction", KIT-02 (font 500), KIT-10 (chữ logo, tên ROOMS), thêm KIT-11 (token bo góc), KIT-12 (FilterChip, ElevatedCard, IllustrationLabel, quy tắc ảnh minh họa), KIT-13 (câu quảng cáo phải được duyệt) |
| `docs/spec/30-frontend.md` | `docs/spec/30-frontend.md` | Sửa: menu `PublicLayout`, bố cục `/`, `/phong/:id`, `/dang-nhap` |

## Cách xem và kiểm tra

`git diff --no-index docs/spec Artifacts/2026-11-10-UI-01-spec/docs/spec` (dòng `/dev/null` là file không có trong bản nháp, bỏ qua).

## Đã kiểm tra

- Token ghi trong KIT-11 khớp `Source/frontend/src/components/rooms.css` dòng 12–15, 24; font KIT-02 khớp `index.html` dòng 9; tên 3 thành phần KIT-12 khớp `SharedPrimitives.tsx`.
- Menu ghi trong 30-frontend khớp `PublicLayout.tsx` (Tìm phòng, Khu vực `/#khu-vuc`, Liên hệ `/#lien-he`, "Lên lịch xem" → `/phong`).
- KIT-13 trỏ tới `approved/2026-11-10-UI-02-copy/`: chỉ đúng sau khi bản nháp UI-02 được duyệt; nên duyệt hai bản nháp cùng lúc.

## Giả định hoặc câu hỏi cho chủ dự án

Không có. Chưa ghi các lỗi P2/P3 của review 10/11 vào spec (chúng là việc sửa code, không đổi quy tắc).

Đã chép vào file chính 10/11/2026 bằng apply-draft.mjs: 2 file.
