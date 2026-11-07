# Kế hoạch áp mockup vào giao diện (bản 2, đã rà soát)

Ngày: 08/11/2026 · Gốc: 2450365 · Trạng thái: ĐÃ DUYỆT 08/11/2026
Danh sách task để đánh dấu: `docs/phase-ui/feature_ui-mockup.md` (trong bản nháp này).

## 1. Rà soát bản 1: lỗ hổng và cách sửa

| # | Lỗ hổng ở bản 1 | Sửa ở bản 2 |
|---|---|---|
| 1 | Menu Stitch có "Khu vực & Tòa nhà", "Đặt lịch xem", "Liên hệ", "Mô hình 3D" nhưng spec không có trang nào cho chúng | Trỏ vào chỗ đã có: Tìm phòng → `/phong`; Khu vực → mục khu vực trên trang chủ; Liên hệ → chân trang; nút "Lên lịch xem" → `/phong`; ẩn Mô hình 3D (chủ dự án 08/11) |
| 2 | Header Stitch có avatar "Tài khoản" cho cả khách, nhưng khách không có tài khoản (D-02) | Khách thấy "Đăng nhập"; đã đăng nhập thấy "Trang của tôi" như hiện tại |
| 3 | Thẻ trên ảnh hero ghi "Còn 03 studio" và số liệu "04+ quận" cần loại phòng, không có trong DB | Tính từ dữ liệu thật: "Còn N phòng trống", "N quận" từ `/public/locations`; câu chữ nào khác phải qua bảng duyệt câu chữ (UI-02) |
| 4 | Ô chọn ngày Stitch "Hôm nay / Ngày mai / Cuối tuần": "Cuối tuần" không rõ ngày nào, và VIEW-08 cho chọn tới +30 ngày | "Hôm nay", "Ngày mai" và "Chọn ngày khác" (lịch tới +30 ngày); khung đã bắt đầu hôm nay bị khóa (VIEW-08) |
| 5 | Ảnh Stitch ghi "Cọc 1 tháng · HĐ 6-12T", sai spec (tối thiểu 3 tháng, CON-01) | Lấy cọc và thời hạn tối thiểu từ API, chữ theo `30-frontend.md` |
| 6 | Gallery 1 lớn + 4 nhỏ, nhưng phòng có 0–10 ảnh (ROOM-07) | Bố cục cho 0 ("Chưa có ảnh"), 1, 2–4 và ≥ 5 ảnh |
| 7 | Bản 1 cho "nâng kit" tạo cả thẻ khu vực, thẻ bước… dù chỉ một trang dùng; trái KIT-07 | Kit chỉ nhận token và phần dùng chung (nút, thẻ, chip, header, footer, nhãn ảnh minh họa). Khối riêng của trang nằm cùng trang đó |
| 8 | Ngày 26/10 chủ dự án đã quyết "giữ kit An Lâm, không restyle"; agent sau đọc spec cũ sẽ từ chối đổi | Ghi quyết định mới vào `31-ui-kit.md` (KIT-11) trước khi đổi code |
| 9 | Chuyển ảnh sang WebP nhưng máy không có công cụ (không có `sharp`, Python chưa cài) | Chủ dự án tự chuyển bằng squoosh.app theo bảng thông số (UI-03), không cài gói |
| 10 | "Song song Phase 3" nhưng làm trong một phiên, không subagent | Làm xen kẽ: không mở hai bản nháp cùng sửa `routes.tsx`, `layouts/`, `rooms.css`. `apply-draft` đã tự chặn khi file đích đổi sau commit `Gốc` |
| 11 | Đổi `rooms.css` có thể làm đỏ test: `tests/form-fields.test.mjs`, `tests/p2/qa-fixes.test.mjs` đọc thẳng file CSS; nhiều test `tests/p2/` kiểm cấu trúc trang | Mỗi task sửa test bị ảnh hưởng ngay trong bản nháp đó; không task nào xong khi `test:components` còn đỏ |
| 12 | Bản 1 không nói chủ dự án "kiểm tay" bằng cách nào trước khi chép | Mỗi bản nháp có `preview.html` mở trang nháp với API thật qua Vite proxy; mỗi task ghi URL và những gì cần nhìn |
| 13 | Câu cam kết để tới Đợt 2 mới duyệt thì Đợt 2 bị chặn giữa chừng | Duyệt câu chữ ở Đợt 0 (UI-02) |
| 14 | Font: chỉ nạp Taviraj 200/300/400 (KIT-02), tiêu đề 500 sẽ bị trình duyệt giả đậm | Thêm 500 vào link font ở `index.html` và `components.html` (UI-10) |
| 15 | Logo: kit chỉ hiện biểu tượng (KIT-10), ảnh có chữ "ROOMS / APARTMENTS HANOI" | Thêm chữ bằng HTML cạnh biểu tượng (chủ dự án 08/11) |
| 16 | Ảnh AI phòng có thể bị hiểu là ảnh phòng thật | Ảnh AI chỉ dùng cho hero, khu vực, màn đăng nhập, luôn có nhãn "Ảnh minh họa"; thẻ phòng chỉ dùng ảnh thật từ API |

## 2. Quyết định đã chốt (chủ dự án, 08/11/2026)

1. Phong cách mới cho **cả 3 app**.
2. Hero theo **ảnh Stitch**.
3. Loại phòng, giường, WC, ban công, hướng: **bỏ ở Đợt 2**, làm ở Đợt 4.
4. Câu cam kết, số liệu: **chủ dự án duyệt từng câu** (UI-02).
5. Nhận xét cư dân: **Đợt 4**.
6. Form "đăng ký xem nhanh": **dẫn về form đặt lịch VIEW-01**.
7. Khung giờ: **giữ 3 khung Sáng/Chiều/Tối** (VIEW-08).
8. Mô hình 3D: **sau Phase 5**, ẩn menu.
9. Ảnh: **ảnh AI tạm**, WebP, nhãn "Ảnh minh họa".
10. Làm **ngay, xen kẽ Phase 3**.
11. Bộ ảnh auth của chủ dự án: **làm chuẩn cho Đợt 3**.
12. Menu: **trỏ vào chỗ đã có** (mục 1, dòng 1–2).
13. WebP: **chủ dự án tự chuyển** bằng squoosh.app.
14. Logo: **thêm chữ** "ROOMS / APARTMENTS HANOI".
15. Cách làm: **phiên chính, không subagent, không pipeline**; mỗi task một bản nháp, chủ dự án kiểm tay rồi duyệt.

## 3. Các đợt

| Đợt | Task | Đụng BE |
|---|---|---|
| 0 · Chuẩn bị | UI-01 spec · UI-02 duyệt câu chữ · UI-03 ảnh WebP | Không |
| 1 · Kit | UI-10 token và font · UI-11 header, footer · UI-12 thành phần dùng chung · UI-13 rà màn quản lý và người thuê | Không |
| 2 · Trang công khai | UI-20, UI-21 trang chủ · UI-22 tìm phòng · UI-23, UI-24 chi tiết phòng · UI-25 chi tiết tòa | Không |
| 3 · Màn auth | UI-30 đăng nhập · UI-31 quên mật khẩu · UI-32 đổi mật khẩu · UI-33 trang tài khoản | Không |
| Kết thúc | UI-40 kiểm toàn bộ, cập nhật Status | Không |

```
UI-01 ─► UI-10 ─► UI-11 ─► UI-12 ─► UI-13 ─┬─► UI-20..25 (cần UI-02, UI-03) ─┬─► UI-40
UI-02, UI-03 (chủ dự án làm, song song)    └─► UI-30..33 ─────────────────────┘
```

## 4. Đợt 4 (chưa có task, lập plan riêng khi tới)

Thuộc tính phòng và bộ lọc; ảnh đại diện tòa; hotline/email/địa chỉ trong `settings`; nhận xét cư dân; bản đồ. Mỗi mục: spec → migration (DB check 50/50) → BE → FE.
Sau Phase 5: mô hình 3D (`artifact_FE/2026-10-26-building-3d/`).
