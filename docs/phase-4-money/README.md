# Phase 4 · Tiền

Nguồn: dòng "4 · Money" của roadmap (`docs/spec/01-architecture.md#roadmap`), `docs/spec/15-meters.md`, `16-billing.md`, `17-bank.md`, `19-notifications.md` (NOTI-04..07, NOTI-10), `12-pricing.md` (bậc điện), phần quyết toán của `14-contracts.md`, các trang tiền của `30-frontend.md`, và các quyết định D-05, D-09..D-14, D-21, D-38, D-40, D-41, D-42, **D-44** trong `docs/spec/00-overview.md`. Kế hoạch chi tiết: [plans/PHASE/PLAN.md](plans/PHASE/PLAN.md).

**Mục tiêu (roadmap):** hóa đơn ví dụ **3.119.000 đ** (BIL-09) và các tháng lẻ của BIL-22 đạt ở unit test; webhook khớp và không khớp đạt; một lần chạy 00:05 bị bỏ được bù lại (BIL-05, BIL-06). Một tháng vận hành đầy đủ: quản lý chốt chỉ số cuối tháng → mùng 1 phát hành hóa đơn → người thuê quét VietQR → webhook ghi nhận → hóa đơn quá hạn từ mùng 10 được nhắc → trả phòng thì quyết toán và ghi đã trả lại cọc.

**Trạng thái:** chưa bắt đầu (22/11/2026). Tài liệu và câu trả lời đã có; phần tiếp theo là P4-1. Tiến trình: [PROGRESS.md](PROGRESS.md).

**Schema:** dự kiến **không cần migration** (mọi bảng, cột, enum, ràng buộc đã có từ Phase 1–3; xem PLAN §2). Nếu một phần cần đổi schema, phải hỏi chủ dự án trước khi tạo và trước khi áp file migration.

## 1. Quyết định đã chốt

Quyết định cũ vẫn áp dụng: D-05, D-09 (đơn giá theo ngày bắt đầu kỳ), D-10 (không trả một phần), D-11, D-12, D-13, D-14, D-21, D-38 (không ảnh đồng hồ), D-40 (kỳ theo tháng dương lịch, phát hành mùng 1, hạn mùng 9), D-41 (tháng lẻ theo số ngày thực), D-42 (mail Boss thiếu chỉ số từ mùng 2 tới mùng 10), và câu trả lời Phase 3: Q-P3-3 (ghi "đã trả lại tiền" ở Phase 4), Q-P3-12/13 (mốc đầu riêng của từng hợp đồng), Q-P3-18 (người ở mới tính một đơn vị trong tháng vào ở), Q-P3-20 (xe ngừng giữa tháng vẫn thu tháng đó).

Chủ dự án trả lời ngày 22/11/2026 (tất cả theo đề xuất), đã ghi vào spec thành **D-44**:

| Mã | Câu hỏi | Trả lời | Ghi vào | Phần |
|---|---|---|---|---|
| Q-P4-1 | Thông báo người thuê khi có hóa đơn, đã nhận tiền, nhắc nợ | Ghi dòng `notifications` **và** gửi email; trang hộp thư ở Phase 5 | D-44 | P4-2..P4-5 |
| Q-P4-2 | Nhà cung cấp webhook | Làm khung adapter + **adapter giả** cho test; chọn nhà cung cấp thật (Q-03) trước khi lên production | D-44, Q-03 | P4-5 |
| Q-P4-3 | Job đối chiếu giao dịch bỏ sót (BANK-08) | Không làm ở Phase 4 | D-44, Q-04 | P4-5 |
| Q-P4-4 | Lượt nhắc 08:00 bị bỏ | Bù **một lần** lúc khởi động nếu hôm nay chưa gửi; không gửi bù các ngày đã mất | D-44, Q-06, NOTI-05 | P4-3 |
| Q-P4-5 | Cảnh báo tiêu thụ bất thường khi chưa đủ 3 kỳ | Không cảnh báo, hóa đơn tự phát hành | D-44, MTR-08 | P4-1, P4-2 |
| Q-P4-6 | Lập lại hóa đơn được sửa gì | Chỉ chỉ số của kỳ đó (kể cả thay đồng hồ); BE tính lại toàn bộ | D-44, BIL-12 | P4-4 |
| Q-P4-7 | Nút "Nhắc thanh toán" | Gửi lại email + thông báo cho hóa đơn UNPAID, tối đa 1 lần/hóa đơn/ngày | D-44 | P4-4 |
| Q-P4-8 | Ghi "đã trả lại tiền cọc" | `{ method, paidAt?, note? }`, ghi một lần, không hoàn tác | D-44 | P4-6 |
| Q-P4-9 | Sửa chỉ số nhập sai | Không có route sửa; lập lại hóa đơn | D-44, MTR-12 | P4-2 |
| Q-P4-10 | Ngày dọn đi khi quyết toán | Từ ngày bắt đầu hợp đồng đến hôm nay | D-44 | P4-6 |
| Q-P4-11 | Công tắc bật/tắt webhook | Không có; muốn tắt thì đổi secret | D-44 | P4-5 |
| Q-P4-12 | Hạn trả hóa đơn FINAL | Hôm nay + 7 ngày | D-44, BIL-18 | P4-6 |
| Q-P4-13 | Nước PER_PERSON trong tháng lẻ | Không nhân tỉ lệ ngày: số người × giá nước đủ tháng | D-44, BIL-07, D-41 | P4-1 |

## 2. Câu hỏi còn mở

| Mã | Câu hỏi | Đề xuất | Chặn |
|---|---|---|---|
| Q-03 | Nhà cung cấp webhook thật (SePay hay Casso) và ngân hàng | Chọn trước khi lên production; thêm adapter thật là một task nhỏ | Go-live (không chặn code) |
| Q-02 | Bảng bậc điện thật của từng tòa | Dùng giá seed (0–50: 3.000 · 51–100: 3.500 · 101+: 4.000; nước 15.000 đ/m³) tới khi chủ dự án đưa số thật | Không chặn code |
| Q-01 | Khách đi sớm vẫn trả tiền phòng tới hết hạn; có giảm khi phòng được cho thuê lại không | BIL-15 vẫn thu đủ; giảm trừ (nếu có) là việc Phase 5 | Không chặn code |

Câu hỏi mới phát sinh khi làm ghi vào mục "Questions for the owner" của file task, rồi chép lên bảng này.

## 3. Các phần và thứ tự

Mỗi ⏸ là điểm dừng: báo cáo, chủ dự án kiểm chứng và commit, rồi mới tiếp (quy trình trong `CLAUDE.md` gốc). Phần ghi "Reviewer: có" chạy reviewer trên thay đổi chưa commit trước khi dừng.

| Phần | File task | Mã task | Cần trước | Planner | Reviewer |
|---|---|---|---|---|---|
| P4-0 | – (việc của chủ dự án, mục 5) | – | – | – | – |
| P4-1 Toán tiền | [feature_p4-1-backend-money-math.md](feature_p4-1-backend-money-math.md) | BE-P4-01..05 | Phase 3 xong | không | **có** |
| P4-2 Chỉ số + hóa đơn tháng | [feature_p4-2-backend-readings-monthly-invoices.md](feature_p4-2-backend-readings-monthly-invoices.md) | BE-P4-06..13 | P4-1 | **có** | **có** |
| P4-3 Mail | [feature_p4-3-backend-mails.md](feature_p4-3-backend-mails.md) | BE-P4-14..17 | P4-2 | không | có |
| P4-4 API hóa đơn + thu tiền | [feature_p4-4-backend-invoices-payments.md](feature_p4-4-backend-invoices-payments.md) | BE-P4-18..23 | P4-2 | không | **có** |
| P4-5 Ngân hàng | [feature_p4-5-backend-bank.md](feature_p4-5-backend-bank.md) | BE-P4-24..28 | P4-4 | **có** | **có** |
| P4-6 Quyết toán | [feature_p4-6-backend-settlement.md](feature_p4-6-backend-settlement.md) | BE-P4-29..33 | P4-4 (không chạy song song với P4-5) | **có** | **có** |
| P4-7 FE nhân sự | [feature_p4-7-frontend-staff.md](feature_p4-7-frontend-staff.md) | FE-P4-01..09 | P4-4 (quyết toán cần P4-6, giao dịch cần P4-5) | **có** | không |
| P4-8 FE người thuê | [feature_p4-8-frontend-tenant.md](feature_p4-8-frontend-tenant.md) | FE-P4-10..14 | FE-P4-01 | không | không |
| P4-9 QA + chốt phase | [feature_p4-9-qa.md](feature_p4-9-qa.md) | QA-P4-01..06 | tất cả | – | – |

```
P4-1 ─► P4-2 ─► P4-3
          └───► P4-4 ─┬─► P4-5 ─┐
                      ├─► P4-6 ─┼─► P4-9
                      └─► P4-7 ─┤
                           └─► P4-8
```

Mỗi phần bắt đầu với `git status` sạch. Ma trận luật → phần: PLAN §5.

## 4. Ngoài Phase 4

Module yêu cầu (báo lỗi thanh toán BANK-06, REQ-07), hộp thư trong ứng dụng `/thue/thong-bao` và thông báo chung (NOTI-01..03), tạo hợp đồng gia hạn (CON-17..19; Phase 4 chỉ làm bước chuyển ca BIL-06), báo cáo, nhật ký, trang Cài đặt: **Phase 5**. Job đối chiếu giao dịch (BANK-08): hoãn (D-44).

## 5. Việc của chủ dự án

- Trước khi lên production: chọn nhà cung cấp webhook (Q-03), điền `BANK_WEBHOOK_SECRET` trong `.env`, điền `settings.bank_account` thật.
- Khi có: bảng bậc điện và giá nước thật của từng tòa (Q-02).
- Ở mỗi ⏸: kiểm chứng, commit và báo lại.
