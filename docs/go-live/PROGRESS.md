# Go-live — tiến trình

File này giúp người hoặc agent mới vào biết ngay go-live đang ở đâu. Trạng thái từng task nằm trong [feature_go-live.md](feature_go-live.md) (`[ ]` / `[~]` / `[x]` / `[!]`). Ở đây chỉ ghi theo **điểm dừng ⏸**.

**Cách cập nhật.** Ở mỗi điểm dừng ⏸, trước khi báo cáo, agent sửa file này:
- đổi dòng của phần mình trong bảng;
- thêm một dòng vào nhật ký.

Cột "Commit" ghi hash do chủ dự án báo lại sau khi commit. Agent chỉ điền hash sau khi đã kiểm bằng `git log`.

Trạng thái: `chưa làm` · `đang làm` · `chờ commit` (đã dừng ở ⏸, chờ chủ dự án kiểm chứng) · `xong` · `kẹt` (ghi lý do) · `chờ quyết định` (cần câu trả lời Q-GL).

## Bảng tổng

| Phần | Ai làm | Trạng thái | Điểm dừng gần nhất | Commit | Việc tiếp theo | Ghi chú |
|---|---|---|---|---|---|---|
| GL-A Quyết định | chủ dự án | chưa làm | - | - | Trả lời Q-GL-1..10 | README.md §3 |
| GL-B Vá code | agent | kẹt | GL-04 | - | Kiểm tra toàn bộ test backend trên máy dev | Q-GL-6 chọn A. |
| GL-C Webhook thật | agent | chờ quyết định | - | - | Cần Q-GL-3 | |
| GL-D File deploy | agent | chờ quyết định | - | - | Cần Q-GL-1, Q-GL-5 | |
| GL-E Hạ tầng | chủ dự án | chưa làm | - | - | Sau GL-A, GL-D | Tạo tài khoản, điền env |
| GL-F DB production | chủ dự án + agent | chưa làm | - | - | Sau GL-E | Hỏi trước mỗi thao tác trên DB |
| GL-G Chạy thử | agent + chủ dự án | chưa làm | - | - | Sau GL-C, GL-F | Có 1 lần chuyển khoản thật |
| GL-H Go-live, tháng đầu | chủ dự án + agent | chưa làm | - | - | Sau GL-G | |

## Nhật ký

| Ngày | Phần | Việc | Kết quả |
|---|---|---|---|
| 26/11/2026 | - | Lập kế hoạch và file task | README.md, feature_go-live.md, PROGRESS.md |
| 26/11/2026 | GL-B | GL-02 / DEP-04 | Build pass. Lint 0 lỗi, 4 cảnh báo ngoài phần sửa. Env 41/41. Hai test HTTP gặp EACCES trước khi tới API. Chờ kết quả toàn bộ test backend trên máy dev. |
| 26/11/2026 | GL-B | Hoàn tất GL-02 / DEP-04 | Ảnh kết quả từ chủ dự án: 145/145 file, 2911/2911 test pass trong 149,90 giây trên máy dev. |
| 26/11/2026 | GL-B | GL-04 / DEP-10 | Đã thêm health check. Build pass, lint 0 lỗi và 4 cảnh báo cũ. Kiểm tra qua Nest trong tiến trình trả đúng 200 và 503, cả hai có no-store. Supertest qua TCP bị EACCES trước khi tới API. Chờ kết quả chạy đầy đủ trên máy dev. |
| 26/11/2026 | GL-B | Sửa test GL-04 | Máy dev đạt 2912/2913, chỉ file prisma.service.spec.ts lỗi. Đã cập nhật assertion danh sách controller theo DEP-10, chạy lại file đạt 7/7. Chờ lượt toàn bộ sau sửa. |
