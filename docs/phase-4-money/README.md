# Phase 4 · Tiền

Nguồn: dòng "4 · Money" của roadmap (`docs/spec/01-architecture.md#roadmap`), `docs/spec/15-meters.md`, `16-billing.md`, `17-bank.md`, `19-notifications.md` (NOTI-04..07, NOTI-10), `12-pricing.md` (bậc điện), phần quyết toán của `14-contracts.md`, các trang tiền của `30-frontend.md`, và các quyết định D-05, D-09..D-14, D-21, D-38, D-40, D-41, D-42, **D-44** trong `docs/spec/00-overview.md`. Kế hoạch chi tiết: [plans/PHASE/PLAN.md](plans/PHASE/PLAN.md).

**Mục tiêu (roadmap):** hóa đơn ví dụ **3.119.000 đ** (BIL-09) và các tháng lẻ của BIL-22 đạt ở unit test; webhook khớp và không khớp đạt; một lần chạy 00:05 bị bỏ được bù lại (BIL-05, BIL-06). Một tháng vận hành đầy đủ: quản lý chốt chỉ số cuối tháng → mùng 1 phát hành hóa đơn → người thuê quét VietQR → webhook ghi nhận → hóa đơn quá hạn từ ngày đầu tháng kế tiếp được nhắc → trả phòng thì quyết toán và ghi đã trả lại cọc.

**Trạng thái:** chưa bắt đầu (22/11/2026). Tài liệu và câu trả lời đã có; phần tiếp theo là P4-1. Tiến trình: [PROGRESS.md](PROGRESS.md).

**Schema:** dự kiến **không cần migration** (mọi bảng, cột, enum, ràng buộc đã có từ Phase 1–3; xem PLAN §2). Nếu một phần cần đổi schema, phải hỏi chủ dự án trước khi tạo và trước khi áp file migration.

## 1. Quyết định đã chốt

Quyết định cũ vẫn áp dụng: D-05, D-09 (đơn giá theo ngày bắt đầu kỳ), D-10 (không trả một phần), D-11, D-12, D-13, D-14, D-21, D-38 (không ảnh đồng hồ), D-40 (kỳ theo tháng dương lịch, phát hành mùng 1, hạn cuối tháng thu), D-41 (tháng lẻ theo số ngày thực), D-42 (mail Boss thiếu chỉ số từ mùng 2 tới mùng 10), và câu trả lời Phase 3: Q-P3-3 (ghi "đã trả lại tiền" ở Phase 4), Q-P3-12/13 (mốc đầu riêng của từng hợp đồng), Q-P3-18 (người ở mới tính một đơn vị trong tháng vào ở), Q-P3-20 (xe ngừng giữa tháng vẫn thu tháng đó).

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
| Q-P4-16 | Nhớ "hôm nay job mail đã chạy" | Một dòng `settings` khóa `job_state` (JSON ngày chạy gần nhất của từng job), tự tạo ở lần chạy đầu; không migration, không đổi seed | NOTI-10, NOTI-05, Q-P4-4 | P4-3 |
| Q-P4-17 | Nhắc "đến hạn ngày mai" | Chỉ email; quá hạn và hợp đồng sắp hết hạn ghi cả thông báo + email | NOTI-05 | P4-3 |
| Q-P4-18 | Nhắc nhân sự | **Hộp thư nhân sự** (Boss + quản lý) trên web, kiểu chuông Facebook: chấm đỏ + số chưa đọc, danh sách thả xuống, đã đọc thì mờ nhưng vẫn giữ. Tách hẳn với email: đọc mail không làm thư trong app thành đã đọc. Không push, chỉ thấy khi đăng nhập. Sự kiện: hợp đồng sắp hết hạn 30/7 ngày, hóa đơn quá hạn, đã nhận tiền (cho quản lý tòa, Boss nếu tòa không có quản lý), thiếu chỉ số mùng 2→10 (Boss). BE ở M3, chuông ở M7 | NOTI-01, NOTI-05, NOTI-10 | P4-3, P4-7 |
| Q-P4-19 | Nhắc hết hạn cho hợp đồng đã gia hạn / đã quyết toán | Không nhắc, giống CON-20 | NOTI-05, CON-20 | P4-3 |
| Q-P4-20 | Bấm vào thư nhân sự | Bấm chuông mở popup nhỏ thả xuống như Facebook web. Hành vi khi bấm từng thư chốt ở M7; BE vẫn lưu `link` trang nhân sự (`/ql/hoa-don/{id}`, `/ql/hop-dong/{id}`, `/ql/chi-so`) [ASSUMPTION] | NOTI-11 | P4-3, P4-7 |
| Q-P4-21 | Loại thư "thiếu chỉ số" | Dùng lại `ANNOUNCEMENT` (`announcement_id` null), không migration | NOTI-11, NOTI-10 | P4-3 |
| Q-P4-22 | Mail "sắp hết hạn" cho nhân sự | Một mail gộp mỗi quản lý (hoặc Boss) mỗi ngày; thư trong app vẫn một thư mỗi hợp đồng | NOTI-05, NOTI-11 | P4-3 |
| Q-P4-23 | Nhắc áp cho loại hóa đơn nào | Mọi hóa đơn UNPAID có hạn: DEPOSIT, MONTHLY, FINAL | NOTI-05 | P4-3 |
| Q-P4-24 | Lập lại kèm sửa chỉ số | Sửa tại chỗ trên dòng chỉ số, gắn sang hóa đơn mới; giá trị cũ/mới ghi trong audit `invoice.reissue`; hóa đơn cũ giữ dòng tiền cũ; không migration | BIL-12, Q-P4-6, Q-P4-9 | P4-4 |
| Q-P4-25 | Loại hóa đơn được lập lại | Chỉ MONTHLY; DEPOSIT, FINAL → `CONFLICT_STATE` | BIL-12 | P4-4 |
| Q-P4-26 | Giới hạn nút "Nhắc thanh toán" | Chỉ đếm nhắc tay (audit `invoice.remind` trong ngày Hà Nội); nhắc tự động 08:00 không tính | Q-P4-7, NOTI-05 | P4-4 |
| Q-P4-27 | Thư nhân sự khi ghi thu tay | Luôn ghi thư `PAYMENT_RECEIVED` cho người phụ trách tòa, kể cả khi chính họ ghi | NOTI-11, BIL-11 | P4-4 |
| Q-P4-28 | Adapter giả | Header `X-Webhook-Secret` so sánh hằng thời gian với `BANK_WEBHOOK_SECRET`; ghi `provider = SEPAY`; không migration, không raw body | D-44, Q-P4-2, BANK-01 | P4-5 |
| Q-P4-29 | Tiền vào số tài khoản khác `settings.bank_account` | Vẫn lưu `UNMATCHED` để Boss thấy; `bank_account` trống/sai định dạng → 503, không ghi gì | 17-bank Adapter | P4-5 |
| Q-P4-30 | Mã TT đúng nhưng lệch tiền / hóa đơn đã trả | `UNMATCHED` kèm lý do tiếng Việt trong `note` | BANK-04 | P4-5 |
| Q-P4-31 | Thư nhân sự khi webhook khớp | Có, giống thu tay (Q-P4-27) | NOTI-11, BANK-03 | P4-5 |
| Q-P4-32 | Cọc trả qua webhook | Không gì thêm: PAID + thông báo | BIL-11, D-35 | P4-5 |
| Q-P4-33 | Giờ không có múi giờ từ nhà cung cấp | Hiểu là giờ Asia/Ho_Chi_Minh | G-02 | P4-5 |
| Q-P4-34 | `mark-refunded` áp cho trạng thái nào | Chỉ `UNMATCHED`; còn lại `CONFLICT_STATE` | BANK-05 | P4-5 |
| Q-P4-35 | Mã lỗi khi `BANK_WEBHOOK_SECRET` trống | Thêm `WEBHOOK_NOT_CONFIGURED` (503) | BANK-01 | P4-5 |
| Q-P4-36 | Kỳ trước kỳ dọn đi còn DRAFT | Thu đủ tiền phòng + dịch vụ/xe của mọi kỳ chưa phát hành ≤ j (tháng lẻ chia ngày); điện nước gộp một khoảng | BIL-14 | P4-6 |
| Q-P4-37 | Tháng lẻ khi quyết toán | Chia tỉ lệ ngày từng kỳ (D-41), làm tròn một lần mỗi kỳ; mỗi kỳ còn lại một dòng REMAINING_RENT | BIL-15, D-41 | P4-6 |
| Q-P4-38 | Dịch vụ/xe/nước PER_PERSON kỳ dọn đi chưa phát hành | Thu đủ kỳ (A-01); nước PER_PERSON = số người × giá đủ tháng | BIL-14, A-01, Q-P4-13 | P4-6 |
| Q-P4-39 | Đơn giá phần quyết toán | Giá hiệu lực tại period_start của kỳ j; bậc điện một lần trên tổng kWh của cả khoảng | RATE-04, D-09 | P4-6 |
| Q-P4-40 | Cọc của chuỗi gia hạn | Tiền thực thu của hóa đơn DEPOSIT PAID trong chuỗi; không có → 0 | BIL-17 | P4-6 |
| Q-P4-41 | Nợ hợp đồng trước trong chuỗi | Gộp hóa đơn UNPAID của cả chuỗi vào previous_debt và SETTLED | BIL-16 | P4-6 |
| Q-P4-42 | Quyết toán hợp đồng ENDED chưa quyết toán | Không: chỉ ACTIVE; còn lại CONFLICT_STATE (HOLD dùng CON-12) | BIL-13 | P4-6 |
| Q-P4-43 | Chỉ số cuối | read_on = moveOutDate, invoice_id null; trùng ngày/loại → CONFLICT_STATE | MTR, BIL-19 | P4-6 |
| Q-P4-44 | Chỉ số cuối nhỏ hơn mốc trước | METER_VALUE_DECREASED; thay đồng hồ thì nhập qua POST /meter-readings trước | MTR-03, MTR-04 | P4-6 |
| Q-P4-45 | Hư hỏng và cọc giữ lại | damages ≥ 0; depositForfeit 0..cọc đã nhận; note bắt buộc khi có một trong hai; nhãn dòng theo PLAN P4-6 | BIL-18, BIL-20 | P4-6 |
| Q-P4-46 | Thông báo khi quyết toán | net < 0: INVOICE_ISSUED + mail VietQR; net ≥ 0: ANNOUNCEMENT "Đã quyết toán… Hoàn lại…" + mail; cả hai thêm thư nhân sự tòa | BIL-19, NOTI-11 | P4-6 |
| Q-P4-47 | Ngày đi của người ở và xe | Chỉ dòng còn trống: max(moveOutDate, ngày vào); xe đang hoạt động ngừng từ max(moveOutDate, ngày đăng ký) | BIL-19 | P4-6 |
| Q-P4-48 | Khóa tài khoản người thuê (xung đột BIL-19 ↔ D-26/A-16) | Giữ tài khoản, không thu hồi session; sửa BIL-19 | D-26, A-16, BIL-19 | P4-6 |
| Q-P4-49 | Lưu cách trả lại cọc | Audit settlement.refund_paid + nối một câu vào settlements.note; không migration | Q-P4-8 | P4-6 |
| Q-P4-50 | Đã có hóa đơn kỳ sau ngày dọn đi | CONFLICT_STATE "Còn hóa đơn của kỳ sau ngày dọn đi, hãy hủy hoặc lập lại hóa đơn đó trước" | BIL-15 | P4-6 |

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

Owner decisions (22/11/2026): Q-P4-14 selects the invoice row for ambiguous readings (MTR-11). Q-P4-15 waits for the final invoice and handover readings before switching a renewal, independently of payment (BIL-06).
