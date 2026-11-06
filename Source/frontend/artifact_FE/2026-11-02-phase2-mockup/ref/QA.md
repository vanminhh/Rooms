# P2-MOCK-01 · Kiểm tra bản mẫu

Ngày kiểm tra: 02/11/2026. Chưa đủ điều kiện hoàn tất P2-MOCK-01 vì chưa kiểm tra bằng trình duyệt và chưa có ảnh chụp.

## Đã chạy

Chạy trong `C:\Users\Nguyen Danh Toan\Rooms\Source\frontend`:

| Lệnh | Kết quả thực tế | Phạm vi |
|---|---|---|
| `npx tsc -p artifact_FE/2026-11-02-phase2-mockup/ref/tsconfig.mockup.json --noEmit` | PASS, exit 0 | Kiểm tra sample.tsx, entry.tsx và các import; không emit, không sửa config chính |
| `npm run lint` | PASS, exit 0 | ESLint kiểm cả draft; không auto-fix |
| `npm run test:components` | PASS, 234/234, 0 skipped, exit 0 | Bộ kit/auth hiện tại; không chứng minh giao diện draft đã render đúng |
| `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort` | Vite v8.3.4 báo ready | Server đã dừng bằng Ctrl+C trước khi bàn giao |

Lần lint đầu phát hiện quy tắc Fast Refresh vì mount React trong file component. Đã tách entry.tsx và chạy lint lại thành công.

## QA trình duyệt bị chặn

- IAB visible=true: `IAB visibility is not supported in a subagent thread`.
- IAB visible=false, URL loopback: `net::ERR_CONNECTION_TIMED_OUT`.
- Khi chọn Cốc Cốc trên Windows, CUA trả: `Computer Use has been stopped for this turn because browser URL policy enforcement is not yet supported for the current Windows browser. Stop your work and send a final message noting why Computer Use ended.`
- Đã dừng mọi thao tác Computer Use sau thông báo này. Không dùng cơ chế browser/automation khác để vượt chặn.
- **Chưa có ảnh 360 px/desktop. Chưa xác nhận mở được, không tràn ngang hoặc đi hết bàn phím. Không ghi QA PASS.**
- Các declaration viewport-fit, safe-area, input 16 px, hover theo capability và focus-visible đã chuẩn bị trong code. Cảm giác chạm, bàn phím ảo, safe-area và thanh trình duyệt cần điện thoại thật.

## Mở lại

```powershell
Set-Location 'C:\Users\Nguyen Danh Toan\Rooms\Source\frontend'
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

URL: `http://127.0.0.1:5173/artifact_FE/2026-11-02-phase2-mockup/preview.html`

Bộ chọn đầu trang mở sáu màn hình. Có thể thêm `?screen=home`, `rooms`, `building`, `room`, `grid`, `approval`. Bộ chọn trạng thái danh sách có Có dữ liệu / Đang tải / Trống / Lỗi. Các link tìm phòng dùng query trên preview.html, không tạo route của app chính.

## Phạm vi mẫu và các khác biệt cần biết

| Mục | Khác biệt so với sản phẩm đầy đủ |
|---|---|
| Routes / API / UI-09 | Dùng query để đổi màn và dữ liệu cố định; chưa router, TanStack Query, react-hook-form/zod hoặc API thật. Gửi lịch và duyệt/từ chối chỉ hiện thông báo xem thử, không tạo lịch hay đổi giá. Các lỗi 429/ROOM_NOT_AVAILABLE và phân quyền cần kiểm ở phần triển khai. |
| Ngày giờ / VIEW-08 | Snapshot cố định 02/11/2026, 15:00 Hà Nội; khoảng ngày 02/11–02/12. Chọn ngày 02/11 thì Sáng và Chiều bị vô hiệu hóa. Không dùng đồng hồ hiện tại hoặc thay BE validation. |
| Dữ liệu công khai | 5 phòng theo seed. CG01/203 đang thuê và CG01/301 chưa có giá không xuất hiện công khai. Thứ tự duyệt gần đây được minh họa, không phải query thật. |
| Ảnh và nội thất | Chỉ dùng ảnh Hà Nội hiện có; cùng một ảnh được dùng cho nhiều phòng để xem bố cục. CG01/204 minh họa Chưa có ảnh. Tiện ích, nội thất và mô tả là ví dụ trình bày, chưa phải thông tin được xác thực của tòa/phòng. |
| ROOM-08 / UI-06 | Giá trị ước tính, cọc, phần trăm đều là snapshot hằng số đóng vai kết quả BE; không tính tiền trong FE. CG01/204: 2.530.000 đ/tháng cho 1 người, cọc 2.400.000 đ. Dịch vụ Vệ sinh hành lang chưa có giá là ví dụ để xem câu chưa gồm; không phải seed thực tế. |
| Nước PER_PERSON | Checkbox ngoài nội dung chính của khối chi phí cho xem thêm trường hợp 80.000 đ/người/kỳ, tổng 2.610.000 đ. Đây dữ liệu minh họa; seed hiện tại tất cả tòa PER_M3. |
| PUB-03 / PRC-12 | Giá tương lai Wifi 120.000 đ từ 15/11 và các đề xuất là dữ liệu minh họa. Điện 3→3 có phần trăm theo bậc; điện 3→2 hiển thị hai bảng không %. Giá lần đầu dùng Giá mới không %. |
| Lưới phòng | Chỉ dựng chi tiết tòa CG01. Phòng 203, 204, 301 theo seed; 302, 401, 402 bổ sung để xem Đã cọc, Bảo trì, Đã khóa. Có Hiện phòng đã khóa và Đề xuất lại ở phòng 204 quá hạn. Tạo/sửa/đề xuất chỉ mở lời nhắc mẫu. |
| Duyệt giá | Mẫu có 5 đề xuất còn hạn và 1 quá hạn. Đề xuất quá hạn tách riêng, chỉ Từ chối. Hộp duyệt có số tiền/bảng bậc và cảnh báo thay giá đã duyệt khác. Lý do từ chối bắt buộc bằng HTML; chưa xử lý đồng thời hoặc lỗi từ BE. |
| StaffLayout | Chỉ đưa hai mục liên quan Phòng và Duyệt giá để chủ dự án xem bố cục, chưa toàn bộ menu 13+5 trang. Chọn tòa lọc các đề xuất; lưới minh họa CG01. |

Không có giả định nghiệp vụ mới. Giá điện thật vẫn theo câu hỏi Q-02 của spec; mẫu dùng ba bậc seed cho hiện tại và các đề xuất minh họa rõ ràng.

## Cần kiểm khi trình duyệt sẵn sàng

1. Mở cả sáu màn tại 360 px và desktop, chụp ảnh thật vào ref/; kiểm không có thanh cuộn ngang và nội dung không bị cắt.
2. Dùng Tab/Shift+Tab qua picker, menu mobile (Escape trả focus), bộ lọc, các card, form ba ca, checkbox khóa, lưới phòng, duyệt/từ chối và dialog (Escape trả focus).
3. Chọn ngày 02/11 so với 03/11; xem PER_M3/PER_PERSON; bật Hiện phòng đã khóa; mở điện đổi số bậc, Giá mới và đề xuất quá hạn.
4. Kiểm tra dữ liệu/tải/trống/lỗi và các nút Thử lại/Xem tất cả. Kiểm số lượng/bộ lọc sau chọn tòa.
5. Kiểm cảm ứng, input zoom, safe-area, bàn phím ảo trên điện thoại thật.
