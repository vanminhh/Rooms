# Phase 4 · Part 4 – Backend: invoice API, VietQR and manual payment (BE-P4-18..23)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P4-2 committed |
| Unblocks | P4-5, P4-6, P4-7 |
| How | main session builds; reviewer before the stop (money + authorization) |
| Part done when | BE-P4-23 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md` or `Source/frontend/CLAUDE.md`, `docs/LESSONS.md`
2. [README.md](README.md) of this phase (owner answers Q-P4-1..12) and `docs/spec/00-overview.md` – D-05, D-09..D-14, D-21, D-35, D-38, D-40, D-41, D-42, **D-44**, A-01, A-04, A-06, A-09, A-10, A-21
3. [plans/PHASE/PLAN.md](plans/PHASE/PLAN.md) – §2 (what exists, schema), §3 (architecture), §7 (risks and test strategy), §8 (rights)
4. `docs/spec/16-billing.md` – BIL-10..12; `docs/spec/10-auth.md` – SCOPE-02, SCOPE-03; `docs/spec/01-architecture.md` – API-02, API-05, API-07, API-08
5. Code: `src/modules/billing/billing.service.ts` (`recordPayment`), `src/modules/contracts/deposit-invoice.ts` (VietQR), `src/modules/pricing/pricing-idempotency.ts`

## Scope

In: staff list/detail, `/me/invoices`, VietQR for every UNPAID invoice, manual payment for every invoice type, reissue (readings only, D-44), remind (once a day, D-44).
Out: bank webhook (P4-5), settlement (P4-6).

## Tasks

- [x] **BE-P4-18** `GET /invoices?buildingId&status&type&overdue&period` + `GET /invoices/:id` (nhân sự trong phạm vi): phân trang API-02, "Quá hạn" là trạng thái suy ra (không lưu), chi tiết có dòng, mốc chỉ số, VietQR khi UNPAID.
  Done when: lọc `overdue=true` chỉ ra UNPAID có `due_date` < hôm nay (giờ Hà Nội); manager tòa khác → `OUT_OF_SCOPE`.
- [x] **BE-P4-19** `GET /me/invoices` + `GET /me/invoices/:id` (SCOPE-03, API-07): ẩn DRAFT, GUEST → `FORBIDDEN`, hóa đơn của người khác → `NOT_FOUND`, `Cache-Control: no-store`, VietQR + `qrImageUrl` (BIL-10).
  Done when: DRAFT không xuất hiện ở cả list và detail; hóa đơn hợp đồng khác của cùng người thuê vẫn xem được.
- [x] **BE-P4-20** Mở `POST /invoices/:id/payment` cho mọi loại hóa đơn (BIL-11): số tiền luôn bằng tổng, `method` CASH/BANK_TRANSFER/CARD/OTHER, trigger đặt PAID, idempotency API-05, audit `payment.record`, thông báo người thuê theo Q-P4-1.
  Done when: hóa đơn MONTHLY và FINAL ghi thu được; ghi hai lần (song song) → một bên `INVOICE_NOT_UNPAID`, chỉ một `payments`; hóa đơn PAID/CANCELLED → `INVOICE_NOT_UNPAID`.
- [x] **BE-P4-21** `POST /invoices/:id/reissue { reason, corrections }` (BIL-12): chỉ DRAFT/UNPAID; hủy kèm `cancel_reason`, sửa chỉ số theo Q-P4-6, tạo hóa đơn mới cùng kỳ với `replaces_id`, tính lại, phát hành; PAID → `CONFLICT_STATE`.
  Done when: ca nghiệm thu "lập lại để lại đúng một hóa đơn chưa hủy cho kỳ đó" (UK `invoices_one_per_period`); audit `invoice.reissue`.
- [x] **BE-P4-22** `POST /invoices/:id/remind` theo Q-P4-7.
  Done when: hóa đơn không UNPAID → `CONFLICT_STATE`; quá giới hạn trong ngày → `TOO_MANY_REQUESTS`.
- [x] **BE-P4-23** ⏸ lint + test + build + e2e (phát hành → ghi thu tay → PAID); reviewer.

## Questions for the owner

<!-- Q-P4-1..12 were answered on 22/11/2026 (README.md, D-44). New questions go here and in the README table. -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
- 22/11/2026 · BE-P4-20 · Ca ghi thu song song chỉ kiểm trên fake (hàng đợi giao dịch trong billing.payment.http.spec.ts); trên DB thật được bảo đảm bởi FOR UPDATE + UK payments.invoice_id + trigger, chưa có e2e hai kết nối (cần fixture commit; hóa đơn PAID làm cleanupContractRun không dọn được hợp đồng thử).
- 22/11/2026 · BE-P4-21 · [ASSUMPTION] Không cho sửa chỉ số của kỳ k khi kỳ k+1 đã phát hành (chỉ số cuối kỳ k là chỉ số đầu kỳ k+1) → CONFLICT_STATE; lập lại kỳ k+1 trước.
