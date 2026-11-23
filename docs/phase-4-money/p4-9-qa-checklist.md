# P4-9 · Checklist nghiệm thu Phase 4

Ngày kiểm 23/11/2026. M1–M8 đã commit. M9 đã nghiệm thu ngày 24/11/2026 (commit `8c5e12f`).

## Đối chiếu Acceptance

Mỗi dòng dẫn tới test tương ứng. Bằng chứng chạy trên DB dev được ghi riêng phía dưới.

### 15-meters

| Ca nghiệm thu | Test và phạm vi |
|---|---|
| Same room/day: old tenant closes electric at 1.284, new tenant opens at 1.290, new tenant closes at 1.350. All three records remain separate; new tenant's usage is 60 kWh, and the 6 kWh between handovers is not added to either tenant's invoice. Repeat for water under PER_M3; PER_PERSON retains readings for history. | contracts-workflow.e2e-spec.ts (ba bản ghi điện), contracts.move-in.http.spec.ts (hai ca cùng ngày), money.spec.ts (MTR-02), issue-monthly.spec.ts và meters-billing.e2e-spec.ts. issue-monthly.spec.ts kiểm cùng ngày với nước chủ cũ 100, khách mới mở 105 và chốt 110. Hóa đơn PER_M3 ghi 5 m³, PER_PERSON thu theo người. Đây là test lớp phát hành với dữ liệu mô phỏng. |
| Reading 1.250 after 1.284 without replacement → `METER_VALUE_DECREASED`. | save-reading.spec.ts — rejects a decrease from 1284 to 1250. |
| Replacement on 20/09 (old final 1.300, new start 0), closing 40 on 15/10, opening 1.284 → 16 + 40 = 56 kWh. | money.spec.ts — MTR-04/05, thay đồng hồ từ 1.300 về 0. |
| Submitting the electric reading for a PER_PERSON building issues the invoice; for a PER_M3 building it waits for the water reading. | issue-monthly.spec.ts — issues with the required readings / waits for missing metered water; meters-billing.e2e-spec.ts. |

### 16-billing

| Ca nghiệm thu | Test và phạm vi |
|---|---|
| BIL-09 example computes 3.119.000 đ with the listed lines. | money.spec.ts — BIL-09, 7 dòng tổng 3.119.000 đ. |
| Period dates and amounts for BIL-01, BIL-02 and BIL-22 match exactly (unit test on the date helper, including leap year 2028). | period.spec.ts — BIL-01, BIL-02, BIL-22 và tháng 2 năm nhuận. |
| Cron run twice on the same day creates one DRAFT. | monthly-drafts.spec.ts — no run on 01/10 and 02/10; meters-billing.e2e-spec.ts — the job creates p(1) once. |
| BIL-05 catch-up: server off from 23:50 30/09 to 01:00 01/10/2026 → the start-up run creates the period-1 DRAFT of the BIL-01 contract with period 01/09–30/09. | monthly-drafts.spec.ts — off from 23:50 30/09 to 01:00 01/10. |
| BIL-05 catch-up: no run on 01/10 and 02/10 → the run on 03/10 creates that DRAFT once; running again creates nothing. | monthly-drafts.spec.ts — the 03/10 run creates it once. |
| BIL-05 limit: a period whose billing date was 8 days ago with no invoice is not created; it is counted in the summary line and shown in "Việc hôm nay". | monthly-drafts.spec.ts — 7 days / 8 days; dashboard.money.spec.ts — periods over 7 days old. |
| BIL-21: server off from 30/09 to 11/10/2026 → no automatic DRAFT for period 1 of the BIL-01 contract; "Việc hôm nay" shows it red; "Tạo hóa đơn kỳ này" creates it with period 01/09–30/09; pressing again → `CONFLICT_STATE`. | monthly-drafts.spec.ts, dashboard.money.spec.ts và meters-billing.e2e-spec.ts — staff create p(2), refusals as specified. |
| BIL-21: `periodNo` whose billing date is in the future → `CONFLICT_STATE`; a manager of another building → `OUT_OF_SCOPE`. | meters-billing.e2e-spec.ts — BIL-21 refusals (manager khác tòa và kỳ tương lai). |
| A-10: settlement of a contract with a missing period → `CONFLICT_STATE`; after the button creates it, settlement works. | settlement.e2e-spec.ts — A-10, kiểm 409 rồi tạo kỳ bằng API và quyết toán. |
| BIL-06 catch-up: a renewal whose switch day was missed is switched by the next run, after the old contract's period-N DRAFT was created. | renewal-switch.spec.ts — a missed switch day is switched by the next run. |
| Rate change effective 20/10 leaves the October period (01/10–31/10) on the old rate; November uses the new one (D-09). | rates-at.spec.ts — a price effective 20/10 is not applied to 01/10–31/10. |
| An occupant moving in on 20/10 counts once for per-person charges in the 01/10–31/10 period (Q-P3-18), billed in November. | money.spec.ts — Q-P3-18, người vào giữa hoặc cuối kỳ được tính một lần trong kỳ vào. |
| A move-in on 20/03 is charged 12/31 of the rent and of each fixed service in its first invoice, issued 01/04 (D-41). | money.spec.ts — move-in 20/03, 12/31 of rent and of every fixed service. |
| A monthly invoice unpaid at the end of its due date shows "Quá hạn" in red to the tenant and the responsible manager from the following day (Asia/Ho_Chi_Minh) (D-40). | invoice-queries.service.spec.ts (so hạn theo ngày Hà Nội), issue-monthly.spec.ts, dashboard.money.spec.ts, fe02-04-meters-invoices.test.mjs và fe10-14-tenant-invoices.test.mjs (ngày, truy vấn và nhãn giao diện). Đã sửa tone màu vàng và kiểm tra nhãn của hai vai trò mang lớp rooms-status--overdue có chữ đỏ #912828 trong CSS. |
| Early move-out on 25/11/2026 for BIL-01 contract (deposit 2.500.000): j = 3 (November), remaining_rent = 3 × 2.500.000 (December to February), net negative → FINAL invoice total = −net. | settlement-calc.spec.ts — BIL-18 early move-out, remaining rent 3 × 2.500.000. |
| Reissue keeps exactly one non-cancelled invoice for the period. | invoices-payments.e2e-spec.ts (lập lại hóa đơn), check-constraints.mjs (tính duy nhất). |

### 17-bank

| Ca nghiệm thu | Test và phạm vi |
|---|---|
| Content "TT1523 P203" with exact total → invoice 1523 PAID, tenant notified. | match-invoice.spec.ts và bank-webhook.e2e-spec.ts — TT matching và tenant notice. |
| Same webhook delivered twice → one transaction row, one payment. | bank-webhook.e2e-spec.ts — same webhook again; money-races.e2e-spec.ts (đồng thời). |
| Amount 1 đ less → UNMATCHED, invoice stays UNPAID. | bank-webhook.e2e-spec.ts — 1 đ short, UNMATCHED. |
| Second transfer for an already-paid invoice → UNMATCHED (Boss refunds). | bank-webhook.e2e-spec.ts — second transfer for the PAID invoice. |
| Bad signature → 401, no row. | bank-webhook.e2e-spec.ts — wrong signature, 401 and no row. |

### 14-contracts

| Ca nghiệm thu | Test và phạm vi |
|---|---|
| Guest signs: tenant account exists, temporary password shown once, deposit invoice UNPAID with VietQR. | contracts-workflow.e2e-spec.ts và contracts.sign.http.spec.ts (ký, VietQR). |
| Move-in before deposit paid → `DEPOSIT_NOT_PAID`. | contracts-workflow.e2e-spec.ts — beforePayment / DEPOSIT_NOT_PAID. |
| Cancel after deposit paid with 1.000.000 kept from 2.500.000 → settlement net 1.500.000, room public again. | contracts-workflow.e2e-spec.ts — depositKept 1.000.000, net 1.500.000. |
| Renewal switches on `start_date` without a new deposit invoice; tenant keeps one account and sees both contracts. | renewal-switch.spec.ts — chuyển hợp đồng; contracts.sign.http.spec.ts — CON-08 không thu cọc mới khi gia hạn. Đã kiểm phần tiền trong phạm vi M9. Toàn bộ luồng tạo gia hạn và xem hai hợp đồng trên dev thuộc Phase 5 (giới hạn hợp đồng mở đã ghi ở M2). |

## Kết quả kiểm chứng

- QA-P4-02 đạt 110/110 trên PostgreSQL nhúng.
- QA-P4-03/04: đạt 75/75 ca trong 16/16 file trên DB dev, mã thoát 0 (log bayo6alxe.output).
- QA-P4-05: cả 9 nhật ký ngày 23/11 ghi CLEANED, gồm lượt cuối 20261123T2245-RCP3. Sau hồi quy, cleanup ở chế độ list thoát 1 tại bảng buildings vì phiên QA không kết nối được Supabase qua cổng 6543. Ngày 24/11/2026 chủ dự án xác nhận kết quả list là CLEANED.
- QA-P4-06: đã lập checklist và cập nhật Status, LESSONS, PROGRESS. Đã chốt M9 ngày 24/11/2026.
- Bộ test cục bộ sau sửa: backend 137 file, 2.837/2.837 đạt; frontend 1.017/1.017 đạt. Frontend build thành công, lint hai ứng dụng thoát 0 (backend có 4 cảnh báo).

## Rà soát QA-P4-01

Reviewer DUYỆT phạm vi tiền sau khi chạy lại 9/9 test backend và 13/13 test giao diện liên quan. Ca bàn giao nước cùng ngày dùng dữ liệu mô phỏng ở lớp phát hành, xác nhận 105 đến 110 tính 5 m³ với PER_M3 và tính người với PER_PERSON. Nhãn “Quá hạn” của khách và quản lý gắn lớp rooms-status--overdue, màu chữ #912828. Truy vấn ngày được đối chiếu với invoice-queries.service.spec.ts. Kết quả này đóng hai phát hiện ban đầu; hồi quy trên dev và cleanup thuộc các mục riêng.

## Kết quả E2E theo file

| File E2E | Ca đạt |
|---|---:|
| app | 8 |
| auth | 10 |
| bank-webhook | 1 |
| buildings | 6 |
| contracts-registrations | 1 |
| contracts-workflow | 1 |
| contracts | 5 |
| files | 6 |
| guest-signup | 7 |
| invoices-payments | 1 |
| meters-billing | 3 |
| money-races | 1 |
| pricing | 10 |
| public-filters | 3 |
| settlement | 1 |
| viewings | 11 |
| **Tổng** | **75/75** |

Commit M9 `8c5e12f`

test(phase-4): verify money workflows and overdue invoice alerts (QA-P4-01..06, BIL-08, MTR-02, D-40)
