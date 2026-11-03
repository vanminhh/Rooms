# P2-7 · Mockup Phase 2

Trạng thái: ĐÃ DUYỆT 03/11/2026
Task / spec: P2-MOCK-01..02 · UI-01..08, KIT-01..08, ROOM-08, PUB-01..03, PRC-07/12, VIEW-08
Gốc: c2408e7

## Làm gì, vì sao
Bản xem trước bằng UI kit cho sáu màn hình: trang chủ, tìm phòng, chi tiết tòa, chi tiết phòng, lưới tầng quản lý phòng và duyệt giá. Theo D2-7, mockup này không bao giờ chép vào file chính.

## File sẽ thêm / sửa / xóa ở bản chính
Không thay đổi file chính.

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| preview.html | Không áp dụng | Điểm vào bản xem trước |
| entry.tsx, sample.tsx, sample.css | Không áp dụng | Sáu màn và bộ chọn trạng thái danh sách |
| ref/tsconfig.mockup.json | Không áp dụng | TypeScript chỉ kiểm draft, không emit |
| ref/QA.md | Không áp dụng | Kết quả kiểm tra, khác biệt spec, checklist còn thiếu |

## Cách xem và kiểm tra
Từ Source/frontend chạy npm run dev -- --host 127.0.0.1 --port 5174 --strictPort rồi mở http://127.0.0.1:5174/artifact_FE/2026-11-02-phase2-mockup/preview.html. Ngày 03/11/2026, cổng 5173 đã có tiến trình khác; máy chủ Vite bản xem trước đang chạy ở cổng 5174 và đường dẫn preview trả HTTP 200.

Bộ chọn đầu trang chuyển giữa sáu màn. Có trạng thái Có dữ liệu / Đang tải / Trống / Lỗi. Server đã dừng trước bàn giao; cần chạy lại để xem.

## Đã kiểm tra
Baseline ngày 02/11/2026: npm run test:components trên file chính qua 234/234 test, không bỏ qua test (39,90 giây). Đã phục hồi dependency đúng package-lock, không thêm gói hoặc sửa cấu hình.

Kết quả trên draft ngày 02/11/2026:
- npx tsc -p artifact_FE/2026-11-02-phase2-mockup/ref/tsconfig.mockup.json --noEmit: PASS, exit 0; kiểm sample.tsx, entry.tsx và import.
- npm run lint: PASS, exit 0, không auto-fix; bao phủ draft. Đã tách entry để sửa lỗi Fast Refresh.
- npm run test:components: PASS 234/234, 0 skipped. Đây bộ kit/auth hiện có, không chứng minh giao diện draft đã render đúng.
- Vite v8.3.4 khởi động được và đã dừng bằng Ctrl+C.

Chưa đạt Done when: chưa có ảnh thật desktop/360 px, chưa xác nhận cuộn ngang hoặc bàn phím. IAB không mở được loopback; Computer Use khi chọn Cốc Cốc trên Windows đã yêu cầu dừng vì URL policy enforcement chưa được hỗ trợ. Đã dừng và không dùng automation khác để vượt chặn. Giới hạn và checklist tiếp theo ghi đầy đủ trong ref/QA.md. Chưa được đánh P2-MOCK-01 hoặc P2-MOCK-02 hoàn tất.

## Giả định hoặc câu hỏi cho chủ dự án
Dùng dữ liệu minh họa kiểu seed; chưa kết nối API. Ước tính, tiền cọc và phần trăm là giá trị mẫu có sẵn, không tính nghiệp vụ trong FE. Ngày giờ snapshot cố định 02/11/2026 lúc 15:00 Hà Nội. Có ví dụ PER_PERSON, giá tương lai và ba phòng bổ sung để xem đủ trạng thái; chưa phải dữ liệu thật. Sáu màn chỉ mô phỏng tương tác; ảnh Hà Nội dùng lại. Mọi khác biệt ghi tại ref/QA.md.

Không bổ sung giả định nghiệp vụ. Chưa kiểm cảm ứng, bàn phím ảo hoặc safe-area trên điện thoại thật. Chủ dự án đã duyệt bố cục sáu màn trong chat ngày 03/11/2026 để làm chuẩn P2-8a/P2-9; mockup này không chép vào file chính. Giới hạn kiểm trình duyệt 360 px và bàn phím vẫn được ghi trong ref/QA.md.
