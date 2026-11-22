# P4-2 · Chỉ số và hóa đơn tháng

P4-1 đã commit ở `bc60df3`. Backend có thể triển khai danh sách cần chốt ngay. Các lựa chọn bên dưới tác động đến việc ghi chỉ số hoặc chuyển hợp đồng và cần được giải quyết trước bước tương ứng.

## Quyết định chủ dự án đã duyệt ngày 22/11/2026

1. Nếu nhiều kỳ cùng hợp lệ, quản lý chọn dòng hóa đơn. Nếu chỉ có một kỳ hợp lệ, hệ thống tự chọn.
2. Khi thiếu hóa đơn kỳ cuối hoặc thiếu chỉ số bàn giao, giữ hợp đồng cũ ACTIVE và hiện việc cần xử lý. Lượt xử lý kế tiếp chuyển gia hạn khi đủ hai điều kiện, kể cả khi hóa đơn chưa thanh toán.

## Xây dựng theo thứ tự

| Task | Thay đổi và cách kiểm |
|---|---|
| BE-P4-06 | Tạo module meters. Chỉ BOSS/MANAGER được đọc. Dùng bộ lọc phạm vi tòa hiện hành trước truy vấn DRAFT MONTHLY. Với kỳ đầu, lấy mốc mở của đúng hợp đồng. Với các kỳ sau, tìm mốc chốt kỳ liền trước của hợp đồng đó. Tính ngày thu từ cuối kỳ cộng một ngày và xếp kỳ đến hạn lâu nhất trước, thêm thứ tự theo id để kết quả ổn định. Kiểm manager không chỉ định tòa, tòa ngoài scope, tenant, nhiều tháng và phòng đổi khách. |
| BE-P4-07 | Giao dịch riêng cho mỗi phần tử theo thứ tự nhập. Trong giao dịch kiểm lại phạm vi, khóa phòng/hóa đơn theo thứ tự thống nhất với luồng hợp đồng, đọc lại mốc và trạng thái, lưu chỉ số hoặc trả lỗi cho phần tử. Dùng index hiện có để giải quyết nhập trùng đồng thời. Test batch có phần tử đúng/sai xen kẽ, thay đồng hồ, mốc mở và chốt cùng ngày, nước PER_PERSON nhập sau khi điện đã phát hành. |
| BE-P4-08..09 | Dùng chung logic tính hóa đơn cho nhập chỉ số và bấm Phát hành. Dùng các hàm P4-1 trong common/date, common/money, common/rates. Đọc giá đầu kỳ, lịch sử người/xe, mốc của đúng hợp đồng. Ghi dòng, metadata, tổng, ngày phát hành, hạn trả và thông báo cùng giao dịch. Gửi email sau commit theo chính sách gửi lại của dự án. MTR-08 cần ba kỳ trước. Bấm phát hành có thể duyệt mức tiêu thụ bất thường, vẫn phải đủ mốc. Test BIL-09, mức đúng ngưỡng và vượt ngưỡng, gửi trùng, giao dịch rollback, quyền ngoài tòa. |
| BE-P4-10 | Theo mẫu room-price-sync.job, dùng lịch Hà Nội 00:05 và lúc khởi động. Dò kỳ hợp đồng bằng hàm P4-1. Tạo đúng ngày kỳ k, xử lý đụng index riêng cho hóa đơn MONTHLY chưa hủy. Test ngày thu, trễ hai ngày, đúng bảy ngày, tám ngày, hai runner cùng tạo. |
| BE-P4-11 | Sau bước tạo draft, xử lý từng cặp gia hạn trong giao dịch, kiểm lại trạng thái, ghi ENDED/ACTIVE và mốc ngày, sao chép người và xe đủ điều kiện, giữ lịch sử. Dựng cặp gia hạn đã ký trong fixture. Kiểm lại lượt chạy thứ hai, uniqueness xe còn hoạt động, chỉ một người ký và cách lấy mốc cho kỳ đầu hợp đồng mới. |
| BE-P4-12 | Dùng chung hàm tạo draft cho cron và endpoint staff, giữ điều kiện BIL-21 và audit invoice.create_missed. Bổ sung các nhóm NOTI-06 vào dashboard, áp dụng cùng phạm vi quản lý và ngày Hà Nội. Test hợp đồng ENDED chưa quyết toán, kỳ 0/quá N, kỳ tương lai, draft trùng, ngày đỏ và ứng xử sau ngày 10. |
| BE-P4-13 | Lint, unit, build, E2E PostgreSQL nhập chỉ số → phát hành và tranh chấp hai kết nối, cleanup LIST theo run id, reviewer cho thay đổi liên quan tiền. Ghi output thực tế vào checkpoint. |

Các bảng hợp đồng, chỉ số, hóa đơn, dòng hóa đơn, thông báo và khóa duy nhất đã có trong schema. Trước khi thêm bất kỳ migration nào cần trình chủ dự án lý do và thay đổi cụ thể. Q-02 về giá điện thực tế và Q-03 về nhà cung cấp ngân hàng dành cho cấu hình vận hành.
