# Phase 5 · Vận hành — tiến trình

File này giúp người hoặc agent mới vào biết ngay phase đang ở đâu. Trạng thái từng task nằm trong file task của phần (`[ ]` / `[~]` / `[x]` / `[!]`). Ở đây chỉ ghi theo **điểm dừng ⏸**.

**Cách cập nhật.** Ở mỗi điểm dừng ⏸, trước khi báo cáo, agent sửa file này:
- đổi dòng của phần mình trong bảng;
- thêm một dòng vào nhật ký.

Cột "Commit" ghi hash do chủ dự án báo lại sau khi commit. Agent chỉ điền hash sau khi đã kiểm bằng `git log`.

Trạng thái:
- `chưa làm`
- `đang làm`
- `chờ commit`: đã dừng ở ⏸, chờ chủ dự án kiểm chứng
- `xong`
- `kẹt`: ghi lý do

## Bảng tổng

| Phần | Trạng thái | Điểm dừng gần nhất đã xong | Commit | Việc tiếp theo | Ghi chú |
|---|---|---|---|---|---|
| P5-0 Chủ dự án | đang làm | Q-P5-1..16 đã trả lời (D-45) | – | Duyệt M1/M2/M3 khi tới phần; duyệt gói biểu đồ | Không chặn M1 |
| P5-1 Thông báo chung (BE) | chưa làm | – | – | BE-P5-01 | |
| P5-2 Gia hạn (BE) | chưa làm | – | – | planner `plans/P5-2/PLAN.md` | migration M1 |
| P5-3 Yêu cầu (BE) | chưa làm | – | – | planner `plans/P5-3/PLAN.md` | |
| P5-4 Đánh giá sửa chữa (BE) | chưa làm | – | – | – | migration M2 |
| P5-5 Báo cáo, nhật ký, cài đặt (BE) | chưa làm | – | – | – | migration M3 |
| P5-6 FE nhân sự: vận hành | chưa làm | – | – | planner `plans/P5-6/PLAN.md` | khung route của cả phase |
| P5-7 FE nhân sự: quản trị | chưa làm | – | – | – | gói biểu đồ |
| P5-8 FE người thuê | chưa làm | – | – | – | song ngữ |
| P5-9 QA | chưa làm | – | – | – | |

## Lộ trình mốc

Mỗi **mốc** kết thúc ở một điểm dừng ⏸. Ở đó:
1. Agent báo cáo.
2. Chủ dự án kiểm chứng và commit.
3. Agent ghi hash vào cột "Commit".
4. Agent chuyển sang mốc kế.

Làm các mốc theo thứ tự từ trên xuống. Ký hiệu: ✅ xong (đã commit) · ▶ đang làm · ⬜ chưa làm · ⛔ kẹt.

| | Mốc | Task | Cần trước | Trước khi code phải hỏi chủ dự án | Kiểm ở ⏸ | Commit |
|---|---|---|---|---|---|---|
| ▶ | M0 Soạn Phase 5 | README, PLAN, PROGRESS, 9 file task, D-45 | Phase 4 xong | Q-P5-1..16 (đã trả lời 24/11/2026) | link, ma trận luật → phần | |
| ⬜ | M1 Thông báo chung (P5-1) | BE-P5-01..04 | M0 | – | unit, lint, build, reviewer | |
| ⬜ | M2 Gia hạn (P5-2) | BE-P5-05..09 | M1 | planner `plans/P5-2/PLAN.md`; **duyệt tạo và áp migration M1** | + check-constraints (số thật), e2e tạo → ký → chuyển ca, cleanup list, reviewer | |
| ⬜ | M3 Yêu cầu (P5-3) | BE-P5-10..18 | M1, M2 | planner `plans/P5-3/PLAN.md` | + e2e sự cố → RESOLVED → cron đóng; MOVE_OUT → duyệt, reviewer | |
| ⬜ | M4 Đánh giá sửa chữa (P5-4) | BE-P5-19..21 | M3 | **duyệt tạo và áp migration M2** | + check-constraints, reviewer | |
| ⬜ | M5 Báo cáo, nhật ký, cài đặt (P5-5) | BE-P5-22..27 | M3 | **duyệt tạo và áp migration M3** | + check-constraints, e2e báo cáo một tháng, reviewer | |
| ⬜ | M6 FE nhân sự: vận hành (P5-6) | FE-P5-01..05 | M1..M4 | planner `plans/P5-6/PLAN.md` | FE lint, build, test:components | |
| ⬜ | M7 FE nhân sự: quản trị (P5-7) | FE-P5-06..10 | M5, M6 | **duyệt cài gói biểu đồ** | FE lint, build, test:components, kiểm tay 360 px | |
| ⬜ | M8 FE người thuê (P5-8) | FE-P5-11..16 | M4, M5, M6 | – | FE lint, build, test:components, kiểm tay 360 px vi/en | |
| ⬜ | M9 QA + chốt phase (P5-9) | QA-P5-01..06 | M1..M8 | `cleanup.mjs --apply` (chỉ khi đồng ý) | acceptance, check-constraints, e2e dev từng file, 2 ca đua, hồi quy, đi tay | |

### Một vòng mốc (lặp lại cho mọi mốc)

1. Chạy `git status`; chỉ được còn thay đổi của mốc đang làm. Có thay đổi lạ thì báo chủ dự án và chờ.
2. Mở file task của phần, đọc mục "Before you start". Mốc có planner thì chạy planner trước và hỏi một lượt các câu hỏi của nó.
3. Làm từng task: đánh `[~]`, viết code và test (tên test có mã spec), kiểm "Done when", rồi đánh `[x]`.
4. Hỏi trước mỗi lần áp migration lên DB, xóa file hay cài thư viện mới. `.env*` do chủ dự án điền.
5. Cuối mốc chạy lint, test, build của app đã sửa, cộng e2e hoặc check-constraints nếu mốc có ghi. Mốc có reviewer thì chạy reviewer rồi sửa các lỗi chặn.
6. Cập nhật file này: dấu ở bảng mốc, dòng ở "Bảng tổng", một dòng nhật ký. Lỗi nào tốn một lần làm lại thì thêm một dòng vào `docs/LESSONS.md`.
7. ⏸ Báo cáo: file đã đổi, output thật, cách kiểm tay, `[ASSUMPTION]`, thông điệp commit gợi ý kèm mã task và mã spec.
8. Chủ dự án commit và báo lại. Agent kiểm `git log`, ghi hash, chuyển ▶ sang mốc kế.

### Vào lại giữa chừng (phiên mới)

1. Đọc dòng **▶** ở bảng trên.
2. Mở file task của phần đó. Tìm task `[~]` đầu tiên; nếu không có thì lấy task `[ ]` đầu tiên.
3. Chạy `git status` và đối chiếu với nhật ký dưới đây trước khi code tiếp.

## Nhật ký điểm dừng

- 24/11/2026 · M0 · Planner viết `plans/PHASE/PLAN.md`. Chủ dự án trả lời Q-P5-1..16: mọi câu theo đề xuất, trừ Q-P5-8 chọn thư viện biểu đồ; Q-P5-7 chọn cột mới (migration M3). Ghi vào spec thành D-45; Q-13 và A-17 đã chốt; `30-frontend.md` bỏ công tắc webhook. Đã tạo README, PROGRESS và 9 file task. Chưa có code.
