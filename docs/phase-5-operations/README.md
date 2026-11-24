# Phase 5 · Vận hành

Nguồn: dòng "5 · Operations" của roadmap (`docs/spec/01-architecture.md#roadmap`), `docs/spec/18-requests.md`, `19-notifications.md` (NOTI-01..03, NOTI-06), `20-reports-audit-settings.md`, `14-contracts.md` (CON-17..21), `16-billing.md` (BIL-06), `17-bank.md` (BANK-05/06), các trang Phase 5 của `30-frontend.md`, và các quyết định D-13, D-14, D-15, D-33, D-34, D-44, **D-45** trong `docs/spec/00-overview.md`. Kế hoạch chi tiết: [plans/PHASE/PLAN.md](plans/PHASE/PLAN.md).

**Mục tiêu (roadmap):** Boss so sánh được các tòa trong báo cáo. Vòng vận hành đầy đủ gồm:
1. Người thuê gửi yêu cầu: sự cố, trả phòng, gia hạn, cập nhật xe hoặc báo lỗi thanh toán.
2. Nhân sự xử lý trên bảng `/ql/yeu-cau`.
3. Sự cố sửa xong thì người thuê đánh giá.
4. Hợp đồng sắp hết hạn được gia hạn, và job 00:05 chuyển ca.
5. Boss đọc báo cáo và nhật ký, sửa cài đặt.
6. Thông báo chung tới hộp thư người thuê.

**Trạng thái ngày 24/11/2026.** P5-1 đã commit ở `9b67fa3`. Chủ dự án sẽ kiểm tay cùng đợt sau. P5-2 Gia hạn đã kiểm migration M1 offline và đang chờ duyệt áp lên DB dev. Xem [PROGRESS.md](PROGRESS.md).

**Schema: ba migration**, mỗi migration phải được duyệt hai lần (tạo file, rồi áp lên DB dev):
- M1: nới index phòng (P5-2)
- M2: cột đánh giá trên `requests` (P5-4)
- M3: cột "Cất" trên `invoices` (P5-5)

**Thư viện mới:** một gói biểu đồ (P5-7). Phải hỏi tên gói, phiên bản và chờ duyệt trước khi cài.

## 1. Quyết định đã chốt

Quyết định cũ vẫn áp dụng:
- D-13: không hóa đơn sau `end_date`.
- D-14: dọn đi sớm vẫn trả đủ tiền phòng.
- D-15: chủ trả chi phí sửa.
- D-33: chỉ đánh giá sửa chữa.
- D-34: khách không có hộp thư.
- D-44: Phase 4. Riêng Q-P4-11 (không có công tắc webhook) vẫn giữ.
- Q-P3-18 và Q-P3-20: cách đếm người và xe.

Chủ dự án trả lời ngày 24/11/2026 và đã ghi vào spec thành **D-45**. Mọi câu chọn theo đề xuất, trừ Q-P5-8.

| Mã | Câu hỏi | Trả lời | Ghi vào | Phần |
|---|---|---|---|---|
| Q-P5-1 | Index `contracts_one_open_per_room` chặn gia hạn HOLD cạnh hợp đồng ACTIVE | Nới thành `WHERE status='ACTIVE' OR (status='HOLD' AND previous_contract_id IS NULL)` (migration M1). BE chặn thêm ca: hợp đồng cũ đã kết thúc mà gia hạn HOLD còn lại | D-45 (1) | P5-2 |
| Q-P5-2 | Q-13: xác nhận A-17 và cột đánh giá | Đúng A-17 (1–5 sao, nhận xét tùy chọn, một lần, sửa trong 7 ngày, ẩn phải có lý do). Thêm 7 cột `review_*` trên `requests` (migration M2) | D-45 (2), A-17, Q-13 | P5-4 |
| Q-P5-3 | Ảnh người thuê gửi kèm yêu cầu | Mục đích upload `REQUEST_PHOTO`, chỉ TENANT, tối đa 5 ảnh, lưu như ảnh phòng | D-45 (3) | P5-3 |
| Q-P5-4 | Email cho thông báo chung và `REQUEST_UPDATED` | **Chỉ trong ứng dụng**, không email | D-45 (4) | P5-1, P5-3 |
| Q-P5-5 | Công tắc webhook trên trang Cài đặt | Không có công tắc. Hiện chỉ-đọc kèm hướng dẫn tắt bằng cách đổi secret; đã sửa `30-frontend.md` | D-45 (5), Q-P4-11 | P5-5, P5-7 |
| Q-P5-6 | Xe đăng ký giữa tháng | Thu đủ tháng đăng ký, giống người ở và xe ngừng | D-45 (6) | P5-3 |
| Q-P5-7 | Lưu hành động "Cất" của Boss | Cột `invoices.archived_at` + `archived_by_id` (migration M3) | D-45 (7) | P5-5, P5-7 |
| Q-P5-8 | Biểu đồ báo cáo và điện nước 6 kỳ | **Thư viện biểu đồ** (khác đề xuất SVG tự vẽ). Hỏi tên gói và duyệt trước khi cài; đề xuất `recharts` | D-45 (8) | P5-7, P5-8 |
| Q-P5-9 | Quyết toán hợp đồng đã có gia hạn đã ký | `CONFLICT_STATE` "Hợp đồng đã có gia hạn, hãy hủy gia hạn trước" | D-45 (9) | P5-2 |
| Q-P5-10 | Hủy gia hạn chưa chuyển ca | Dùng `POST /contracts/:id/cancel` hiện có: CANCELLED, không quyết toán, không hoàn cọc, có audit | D-45 (10) | P5-2 |
| Q-P5-11 | Sửa hoặc xóa bản tin đã gửi | Không sửa, không xóa; muốn đính chính thì gửi bản tin mới | D-45 (11) | P5-1 |
| Q-P5-12 | Ai tạo được INCIDENT | Chỉ người thuê | D-45 (12) | P5-3 |
| Q-P5-13 | Khoảng thời gian của `/reports/revenue` | Tối đa 24 tháng, mặc định 12 tháng gần nhất | D-45 (13) | P5-5 |
| Q-P5-14 | Khóa nào sửa được ở Cài đặt | Đủ 5 khóa của 20-reports. Mẫu hợp đồng giữ cờ nháp cho tới khi có bản chính thức (Q-15) | D-45 (14) | P5-5, P5-7 |
| Q-P5-15 | Duyệt RENEW (REQ-04) | Duyệt chỉ đặt APPROVED và mở form gia hạn điền sẵn. Khi tạo gia hạn thì ghi `payload.contractId`. Yêu cầu APPROVED chưa có hợp đồng hiện ở "Việc hôm nay" | D-45 (15) | P5-3, P5-6 |
| Q-P5-16 | Trước/sau ở `/ql/nhat-ky` | Hiện đủ cho Boss. BE lọc bỏ hash, mật khẩu tạm và số CCCD đầy đủ | D-45 (16) | P5-5, P5-7 |
| Q-P5-17 | Điều khoản bổ sung khi gia hạn | Mặc định sao chép điều khoản cũ và cho nhân sự sửa hoặc xóa khi tạo bản gia hạn | D-46 | P5-2, P5-6 |

`[ASSUMPTION]` dùng trong phase, phải nêu lại ở mỗi ⏸ có liên quan:
- **A-P5-1:** job đóng sự cố chạy 08:00, như hai job sẵn có.
- **A-P5-2:** "3 ngày" đếm theo ngày Hà Nội. Sự cố RESOLVED ngày 1 thì đóng ngày 4.
- **A-P5-3:** yêu cầu chỉ gửi được trên hợp đồng ACTIVE, trừ `PAYMENT_ISSUE` trên hóa đơn cọc của hợp đồng HOLD (REQ-01).

## 2. Câu hỏi còn mở

| Mã | Câu hỏi | Đề xuất | Chặn |
|---|---|---|---|
| Q-15 | Mẫu hợp đồng chính thức | Giữ bản nháp | Go-live (không chặn code) |
| Q-03 | Nhà cung cấp webhook thật | Chọn trước khi lên production | Go-live |
| Q-04 | BANK-08 đối chiếu giao dịch bỏ sót | Hoãn (D-44) | Không thuộc Phase 5 |
| Q-01 | Giảm tiền phòng khi phòng được cho thuê lại | BIL-15 vẫn thu đủ | Không thuộc Phase 5 |
| Q-02 | Bảng bậc điện thật | Dùng giá seed | Không chặn code |

Câu hỏi mới phát sinh khi làm: ghi vào mục "Questions for the owner" của file task, rồi chép lên bảng này.

## 3. Các phần và thứ tự

Mỗi ⏸ là điểm dừng: báo cáo, chủ dự án kiểm chứng và commit, rồi mới tiếp (quy trình trong `CLAUDE.md` gốc). Phần ghi "Reviewer: có" chạy reviewer trên thay đổi chưa commit trước khi dừng.

| Phần | File task | Mã task | Cần trước | Planner | Reviewer |
|---|---|---|---|---|---|
| P5-0 | – (việc của chủ dự án, mục 5) | – | – | – | – |
| P5-1 Thông báo chung (BE) | [feature_p5-1-backend-announcements.md](feature_p5-1-backend-announcements.md) | BE-P5-01..04 | M0 | không | **có** |
| P5-2 Gia hạn (BE) | [feature_p5-2-backend-renewal.md](feature_p5-2-backend-renewal.md) | BE-P5-05..09 | M0; duyệt M1 | **có** | **có** |
| P5-3 Yêu cầu (BE) | [feature_p5-3-backend-requests.md](feature_p5-3-backend-requests.md) | BE-P5-10..18 | P5-1, P5-2 | **có** | **có** |
| P5-4 Đánh giá sửa chữa (BE) | [feature_p5-4-backend-repair-review.md](feature_p5-4-backend-repair-review.md) | BE-P5-19..21 | P5-3; duyệt M2 | không | **có** |
| P5-5 Báo cáo, nhật ký, cài đặt (BE) | [feature_p5-5-backend-reports-audit-settings.md](feature_p5-5-backend-reports-audit-settings.md) | BE-P5-22..27 | P5-3; duyệt M3 | không | **có** |
| P5-6 FE nhân sự: vận hành | [feature_p5-6-frontend-staff-operations.md](feature_p5-6-frontend-staff-operations.md) | FE-P5-01..05 | P5-1..P5-4 | **có** | không |
| P5-7 FE nhân sự: quản trị | [feature_p5-7-frontend-staff-admin.md](feature_p5-7-frontend-staff-admin.md) | FE-P5-06..10 | P5-5, FE-P5-01; duyệt gói biểu đồ | không | không |
| P5-8 FE người thuê | [feature_p5-8-frontend-tenant.md](feature_p5-8-frontend-tenant.md) | FE-P5-11..16 | FE-P5-01, P5-4, P5-5 | không | không |
| P5-9 QA + chốt phase | [feature_p5-9-qa.md](feature_p5-9-qa.md) | QA-P5-01..06 | tất cả | – | – |

```
P5-1 ─┐
P5-2 ─┴─► P5-3 ─┬─► P5-4 ─┬─► P5-6 ─┬─► P5-7 ─┐
                └─► P5-5 ─┘         └─► P5-8 ─┴─► P5-9
```

Backend làm nối tiếp P5-1 → P5-5, không chạy song song (các phần cùng sửa `contracts` và `notifications`). P5-7 và P5-8 chỉ bắt đầu sau khi khung route của FE-P5-01 đã commit. Mỗi phần bắt đầu với `git status` sạch. Ma trận luật → phần: PLAN §5.

## 4. Ngoài Phase 5

Không làm trong Phase 5:
- BANK-08 (Q-04)
- adapter webhook thật (Q-03)
- Zalo/SMS và chữ ký điện tử (D-20)
- đánh giá bất cứ thứ gì khác ngoài sửa chữa
- giảm tiền khi phòng được cho thuê lại (Q-01)
- xuất Excel/PDF
- mô hình 3D trên trang chủ

## 5. Việc của chủ dự án

- Duyệt từng migration hai lần: tạo file, rồi áp lên DB dev. M1 ở P5-2, M2 ở P5-4, M3 ở P5-5.
- Duyệt gói thư viện biểu đồ trước khi cài (P5-7).
- Khi có: mẫu hợp đồng chính thức (Q-15), nhà cung cấp webhook (Q-03), bậc điện thật (Q-02).
- Ở mỗi ⏸: kiểm chứng, commit và báo lại.
