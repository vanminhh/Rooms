# Phase 4 · Part 5 – Backend: bank webhook and transactions (BE-P4-24..28)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P4-4 committed |
| Unblocks | FE-P4-07 |
| How | planner writes `plans/P4-5/PLAN.md` → main session builds → reviewer before the stop (money + security) |
| Part done when | BE-P4-28 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md` or `Source/frontend/CLAUDE.md`, `docs/LESSONS.md`
2. [README.md](README.md) of this phase (owner answers Q-P4-1..12) and `docs/spec/00-overview.md` – D-05, D-09..D-14, D-21, D-35, D-38, D-40, D-41, D-42, **D-44**, A-01, A-04, A-06, A-09, A-10, A-21
3. [plans/PHASE/PLAN.md](plans/PHASE/PLAN.md) – §2 (what exists, schema), §3 (architecture), §7 (risks and test strategy), §8 (rights)
4. `docs/spec/17-bank.md` – all; `docs/spec/00-overview.md` – Q-03, Q-04 (D-44)
5. Code: `src/app.setup.ts` (body parser), `src/modules/billing/billing.service.ts`

## Scope

In: adapter interface + a fake adapter for tests (D-44; the real provider Q-03 is plugged in before go-live), `POST /webhooks/bank`, matching `TT{id}`, Boss assign / mark refunded.
Out: reconciliation job BANK-08 (D-44), "Báo lỗi thanh toán" BANK-06 (Phase 5), a webhook on/off switch (D-44).

## Tasks

- [ ] **BE-P4-24** Adapter `BankWebhookAdapter` (17-bank) với `verify` so sánh hằng thời gian bằng `BANK_WEBHOOK_SECRET` và `parse` nhiều giao dịch; chỉ xử lý giao dịch **ghi có** vào số tài khoản trong `settings.bank_account`; nhà cung cấp theo Q-P4-2; nếu cần raw body thì chỉ cho route này.
  Done when: chữ ký sai → 401 `WEBHOOK_SIGNATURE_INVALID`, không ghi dòng nào; giao dịch ghi nợ hoặc sai số tài khoản → bỏ qua; `BANK_WEBHOOK_SECRET` trống → route trả 503 và app vẫn khởi động.
- [ ] **BE-P4-25** `POST /webhooks/bank` (BANK-01, BANK-02): mỗi giao dịch một DB transaction, chèn `bank_transactions` trước, trùng UK `(provider, provider_tx_id)` → bỏ qua; luôn trả 200 nhanh khi chữ ký đúng; `raw` được lưu, bí mật không bao giờ vào DB (BANK-07).
  Done when: cùng webhook gửi hai lần → một dòng giao dịch, một `payments`; một webhook chứa 3 giao dịch được xử lý độc lập, một lỗi không cuốn hai cái còn lại.
- [ ] **BE-P4-26** Khớp (BANK-03, BANK-04): tìm `/TT(\d+)/i` trong `content`; chỉ khớp khi hóa đơn tồn tại, `UNPAID` và `total = amount` → `MATCHED` + `payments` (`source = WEBHOOK`, `method = BANK_TRANSFER`, `bank_transaction_id`) → trigger PAID + thông báo; còn lại `UNMATCHED`.
  Done when: 4 ca nghiệm thu của 17-bank ("TT1523 P203" đúng tổng → PAID; thiếu 1 đ → UNMATCHED và hóa đơn vẫn UNPAID; chuyển lần hai cho hóa đơn đã PAID → UNMATCHED; chữ ký sai → 401 không có dòng).
- [ ] **BE-P4-27** `GET /bank-transactions?status&from&to`, `POST /bank-transactions/:id/assign { invoiceId }`, `POST /bank-transactions/:id/mark-refunded { note }` — **chỉ BOSS** (BANK-05, API-07): gán khi hóa đơn UNPAID và `total = amount`, trạng thái `ASSIGNED`, `payments.source = ASSIGNED`, `recorded_by_id` = Boss; audit.
  Done when: MANAGER gọi → `FORBIDDEN`; gán sai số tiền → `PAYMENT_AMOUNT_MISMATCH`; đã gán rồi → `CONFLICT_STATE`; đánh dấu đã hoàn cần `note`.
- [ ] **BE-P4-28** ⏸ lint + test + build + e2e webhook (khớp và không khớp); reviewer. Ghi rõ BANK-08 chưa làm (Q-P4-3).

## Questions for the owner

<!-- Q-P4-1..12 were answered on 22/11/2026 (README.md, D-44). New questions go here and in the README table. -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
