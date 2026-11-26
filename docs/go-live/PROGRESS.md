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
| GL-B Vá code | agent | chưa làm | - | - | GL-02 DEP-04 | Làm được ngay |
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
