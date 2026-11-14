# FE-COLOR-TOOL · Công cụ chỉnh màu trang chủ

## Chọn trực tiếp và chọn qua danh sách · 14/11/2026

- [x] Rê chuột có viền nét đứt và tên mục; bấm chọn phần tử gần điểm bấm nhất. Bấm nền trong tab chữ tự chuyển sang chỉnh màu nền.
- [x] Viền xanh liền theo đúng mục đang chỉnh; chọn mục bên phải cập nhật viền và cuộn đến phần tử bên trái. Các phần tử cùng selector dùng chung kiểu như trước.
- File trong checkpoint: `editor.js`, `color-core.js`, `index.html`, `tests.test.cjs`, `README.md`, `PROGRESS.md`, `preview.jpg`. Giữ phần chỉnh chữ trước đó và các thay đổi ứng dụng ngoài công cụ.
- Kết quả: **11 tests, 11 pass, 0 fail, 0 skipped**; kiểm tra cú pháp exit 0; ESLint công cụ **0 errors**. Trên trình duyệt: bấm chữ nhấn chọn đúng “Chữ nhấn trong tiêu đề”; chọn “Mô tả” từ danh sách đánh dấu đúng `.public-hero-intro`; cơ chế rê chuột tạo thuộc tính viền và cập nhật thanh hướng dẫn.
- [ASSUMPTION] Bấm nền chọn màu nền, bấm chữ giữ chế độ màu/chữ đang dùng. Chọn không tự đổi các giá trị đã lưu.
- Tự kiểm tra: mở công cụ, rê và bấm một dòng chữ bên trái; xem mục bên phải đổi theo. Sau đó chọn “Mô tả” bên phải để thấy viền và vị trí cuộn bên trái đổi theo.
- Chỉ kiểm tra công cụ; không chạy lại frontend chính. Không commit.
- Commit gợi ý: `feat(FE-COLOR-TOOL): sync pointer and panel selection (UI-08)`.

## Bổ sung cỡ chữ và phông · 14/11/2026

- [x] Thêm tab **Cỡ chữ & phông** cho từng nhóm chữ và các tiêu đề/đoạn văn chung. Thanh kéo và ô số 8–160 px; 7 lựa chọn phông; đặt lại riêng cỡ hoặc toàn bộ chữ đang chọn.
- [x] CSS/lệnh xuất chung màu, `font-size`, `font-family`. Tự lưu, so sánh gốc, JSON v2 chứa cả màu và chữ; nạp được JSON v1 cũ.
- Chỉ sửa trong tool độc lập đã được chủ dự án cho phép: `catalog.js`, `color-core.js`, `editor.js`, `editor.css`, `index.html`, `tests.test.cjs`, `README.md`, `PROGRESS.md`, `preview.jpg`. Các thay đổi auth/i18n đang có trong working tree được giữ nguyên. Không thêm dependency; không commit.
- Kiểm tra: Node tests **10 tests, 10 pass, 0 fail, 0 skipped**; `node --check editor.js` exit 0; ESLint của frontend chạy riêng trên 3 file JS công cụ với `no-undef`/`no-unused-vars`: **Tool lint: 0 errors**. `git diff --check` không có lỗi whitespace.
- Trình duyệt: tiêu đề Arial 48 px đổi trực tiếp; kéo lên 48.1 px cập nhật CSS; nhập 200 bị từ chối và giữ giá trị hợp lệ. Màu nền và kiểu chữ cùng tồn tại. So sánh gốc bỏ toàn bộ override tạm thời. Cỡ gốc bỏ size nhưng giữ phông. Đổi điện thoại giữ đúng cỡ đã đặt. Tải lại giữ thiết lập. Lưu JSON v2 thực tế chứa màu nền và Georgia 48 px; đặt lại chữ giữ màu, rồi nạp file phục hồi đúng cả hai thuộc tính chữ.
- Không chạy lại bộ test/build của ứng dụng chính trong lần bổ sung này vì chỉ sửa công cụ độc lập; các kết quả frontend bên dưới thuộc checkpoint 13/11.
- [ASSUMPTION] Cỡ chữ đặt theo px dùng chung cho máy tính/điện thoại. Cỡ gốc khôi phục quy tắc responsive ban đầu. Phông trên máy có thể dùng fallback; không tải thêm phông hoặc chỉnh nội dung ảnh/logo.
- Tự kiểm tra: mở công cụ → Banner · Đầu trang → **Cỡ chữ & phông** → Tiêu đề → nhập 48, chọn Arial → xem CSS phía dưới; thử **Cỡ gốc** và **Lưu/Nạp bộ chỉnh**.
- Commit gợi ý: `feat(FE-COLOR-TOOL): add font and text size controls (KIT-02, UI-08)`.

## Checkpoint ban đầu · 13/11/2026

- Chủ dự án cho phép tạo tool độc lập trong `Artifacts/ui-color-tool/` khi workspace có thay đổi khác chưa commit (13/11/2026).
- Phạm vi: bản sao trang chủ hiện tại, chỉnh bảng màu chung và từng phần, xuất CSS/ghi chú, lưu để dùng lại. KIT-01, KIT-09, UI-08.
- [x] Snapshot từ component hiện tại, 7 stylesheet gốc và 7 ảnh tại máy; không gọi API.
- [x] 10 nhóm, 94 mục màu; bảng màu chung và màu riêng; HEX, bảng chọn màu, HSL và độ trong suốt.
- [x] Chọn trực tiếp trên UI, so sánh bản gốc, máy tính/điện thoại, xuất CSS/lệnh, sao chép, tự lưu, lưu/nạp JSON và khôi phục.
- [x] Mở nhanh, hướng dẫn, kiểm tra logic và kiểm tra trình duyệt hoàn tất. Chờ chủ dự án kiểm tra và tự commit.

## File thay đổi

Chỉ tạo file trong `Artifacts/ui-color-tool/`, theo phạm vi được chủ dự án cho phép:

- `index.html`, `editor.css`, `editor.js`: giao diện công cụ.
- `catalog.js`, `color-core.js`: ánh xạ phần tử thật và xử lý/xuất màu.
- `snapshot-entry.tsx`, `refresh-snapshot.mjs`, `snapshot.js`, `assets/`: bản sao trang chủ từ code và ảnh gốc.
- `OPEN.cmd`, `serve.mjs`, `.gitignore`: mở công cụ qua localhost, không thêm dependency.
- `tests.test.cjs`, `README.md`, `PROGRESS.md`, `preview.jpg`: kiểm tra, hướng dẫn và ảnh công cụ.

Không sửa source ứng dụng, database, dependency hay các thay đổi của chủ dự án đang có trong working tree. Không commit/push.

## Kết quả kiểm tra ngày 13/11/2026

`node --test Artifacts/ui-color-tool/tests.test.cjs`:

```text
tests 7
pass 7
fail 0
cancelled 0
skipped 0
```

`node --check Artifacts/ui-color-tool/editor.js` và `node --check Artifacts/ui-color-tool/serve.mjs`: exit 0.

Frontend hiện tại:

- `npm run lint`: exit 0.
- `npm run build`: exit 0; 728 modules transformed; built in 6.32s. Có cảnh báo bundle lớn hơn 500 kB.
- `npm run test:components`: exit 1. Bộ test chung chưa xanh; ví dụ `tests/p2/fe11-approvals.test.mjs:484` không tìm thấy “Đề xuất quá hạn”, `:513` không tìm thấy “38 đề xuất chờ duyệt (chỉ còn hạn)”, `:642` thiếu POST mong đợi. Các file ứng dụng/test này nằm ngoài phạm vi công cụ và không được sửa trong task. Không dùng kết quả này để tuyên bố toàn frontend đạt.

Kiểm tra trực tiếp tại `http://127.0.0.1:4783`:

- 94/94 selector tìm được phần tử thật trong bản sao.
- Banner `#ababab` và footer `#110011` hiển thị độc lập, CSS xuất đúng từng selector.
- Biến Ink đổi màu nút chung, giữ các màu riêng đã đặt.
- Thanh độ sáng cập nhật HEX và CSS; HEX sai không đổi màu hợp lệ trước đó.
- Chọn trên tiêu đề và chữ nhấn chọn đúng mục tương ứng.
- Banner liên hệ đổi cả nền và phần tràn toàn chiều ngang.
- Tab lệnh và nút sao chép trả đúng nội dung; đã đọc lại clipboard.
- So sánh bản gốc tạm bỏ CSS override; trở về giữ màu đang chỉnh.
- Tải lại trang giữ 2 màu mẫu; tải JSON, reset về 0, nạp file vừa tải phục hồi đúng 2 màu.
- Chế độ điện thoại rộng 390 px và menu mở được; chuyển lại máy tính 1280 px khung co lại đúng.
- Kết thúc đã khôi phục 0 thay đổi. `preview.jpg` là ảnh công cụ đã mở.

## Tự kiểm tra

Mở `OPEN.cmd` (hoặc dùng địa chỉ localhost nếu đang chạy). Chọn Banner → Nền banner → `#ababab`, rồi Footer → Nền footer → `#110011`. Cuộn phần bên phải xuống “Mã tự cập nhật” để xem cả hai lệnh; lưu bảng màu, khôi phục và nạp lại. Hướng dẫn đầy đủ trong `README.md`.

## Giả định và giới hạn

- [ASSUMPTION] Dùng dữ liệu mẫu về phòng/số lượng/liên hệ để thử màu. Không mô phỏng các nghiệp vụ hay chuyển trang trong preview.
- [ASSUMPTION] Công cụ xuất đề xuất; chỉ áp dụng vào ứng dụng khi chủ dự án quyết định. Biến màu chung chỉ tác động các layout/phần tử thực sự dùng biến đó.
- Snapshot cập nhật thủ công bằng script khi UI thay đổi; tên class đổi cần cập nhật catalog. Font Google cần mạng hoặc cache. Không đổi màu bên trong ảnh/logo.
- Đã kiểm tra cách mở qua localhost; đường `file://` bị công cụ trình duyệt kiểm tra chặn nên không xác nhận cách mở trực tiếp HTML. Nhánh tự mở trình duyệt của `OPEN.cmd` không được tự chạy trong QA; server và URL đã được kiểm tra trực tiếp.

## Bài học trong task

- Khung iframe thu nhỏ cần giữ cuộn trong từng panel, đo lại chiều cao khi đổi điện thoại/máy tính, và đọc màu từ phần tử đang hiển thị; màu viền header phải đọc `border-bottom-color`.
- Chọn màu theo phần tử con gần điểm bấm nhất để chữ nhấn không bị gộp với tiêu đề cha.

Commit gợi ý: `feat(FE-COLOR-TOOL): add standalone homepage color editor (KIT-01, KIT-09, UI-08)`.
