# Phase 3 · Part 3 – Backend: sign, temporary password, deposit invoice and payment, print (BE-P3-13..19)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P3-2 committed |
| Unblocks | P3-4, P3-5, P3-6, P3-7 |
| How | planner writes `plans/P3-3/PLAN.md` → main session builds → reviewer before the last stop (money + accounts) |
| Part done when | BE-P3-19 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md`, `docs/LESSONS.md`
2. `docs/spec/00-overview.md` – D-01, D-04, D-10, D-11, D-35, D-36, D-37, A-02, Q-15, G-01, G-09
3. `docs/spec/14-contracts.md` – CON-06..09, CON-16 (scan), CON-22, API table, Acceptance
4. `docs/spec/16-billing.md` – "Invoice types and statuses", BIL-07, BIL-10, BIL-11; `docs/spec/01-architecture.md` – API-05, API-07, error codes; `docs/spec/02-database.md` – the invoice and payment rules, DB-B4
5. `docs/spec/10-auth.md` – AUTH-05, AUTH-07, AUTH-T3, SCOPE-03; `docs/spec/20-reports-audit-settings.md` – AUD-01, settings `bank_account`, `contract_template`; `docs/spec/19-notifications.md` – NOTI-06
6. Code: `src/modules/auth/managers.service.ts` (temporary password pattern), `src/common/crypto/`, `src/common/guards/auth.decorators.ts` (`TenantMeRoles`), `src/modules/pricing/` (how `Idempotency-Key` is handled), `src/modules/settings/`, `prisma/seed.ts` (`bank_account`), the P3-1 upload helpers and the P3-2 contracts service

## Scope

In: `POST /contracts/:id/sign`, the account activation at signing, the deposit invoice, VietQR for it, recording the deposit payment by hand, staff reset of a tenant password, the tenant's own contract routes, the print data, the signed scan view, the "unpaid deposits" task.
Out: payments for any other invoice type, the bank webhook, monthly invoices (Phase 4); move-in and cancel (P3-4); a settings page to edit the template (Phase 5).

## Tasks

- [x] **BE-P3-13** `POST /contracts/:id/sign` (CON-06, CON-07 "sign", CON-09, D-37): HOLD and not yet signed; the scan is a verified private `CONTRACT_SCAN` asset of this contract; a pending tenant account gets a random temporary password on its first successful signature (A-22), `must_change_password = true`, `is_active = true`, returned **once** and never stored in clear or logged; an account that existed before keeps its password and no password is returned; `signed_at` set; audit `contract.sign`.
  Done when: tests `CON-06`, `CON-07`, `CON-09: …`: signing twice → `CONFLICT_STATE`; a public asset → refused; the temporary password logs in and is forced to `/doi-mat-khau` (AUTH-05); a reused guest account logs in with its old password.
- [x] **BE-P3-14** Deposit invoice (CON-08, A-02, DB-B4): created in the sign transaction, one `DEPOSIT` line, `issue_date` today, `due_date` = max(today, `start_date`), status `UNPAID`; skipped when deposit = 0.
  Done when: tests: totals equal the line, deposit 0 creates nothing, the DB rule "one non-cancelled invoice per contract, type, period" holds.
- [x] **BE-P3-15** ⏸ VietQR for the deposit invoice (BIL-10, G-09): staff contract detail and the tenant's routes include `vietqr` (bank from `settings.bank_account`, amount = total, content `TT{id}`) and `qrImageUrl`.
  Done when: test with the seed `bank_account`: amount and content match the invoice; no VietQR for a paid or cancelled invoice. Stop and report BE-P3-13..15.
- [x] **BE-P3-16** Record the deposit by hand (BIL-11 for `DEPOSIT` only, D-11, API-05): `POST /invoices/:id/payment { method, paidAt?, note? }` by staff in scope, amount = invoice total, `Idempotency-Key` honoured; any other invoice type → `CONFLICT_STATE` until Phase 4; DB trigger errors mapped (`INVOICE_NOT_UNPAID`, `PAYMENT_AMOUNT_MISMATCH`); audit `payment.record`.
  Done when: tests: two parallel payments → one succeeds, the other `INVOICE_NOT_UNPAID`; the same key twice → same result, one payment row; a manager of another building → `OUT_OF_SCOPE`.
- [x] **BE-P3-17** `POST /contracts/:id/reset-password` (AUTH-07, AUTH-T3): staff in scope reset the tenant's password to a new temporary one, returned once, `must_change_password = true`, all sessions revoked; audit (password reset by staff, AUD-01).
  Done when: tests: old sessions stop working; the new password logs in and must be changed; a guest-only account (no contract in scope) → `NOT_FOUND`.
- [x] **BE-P3-18** Tenant routes and print (SCOPE-03, CON-16, CON-22, D-36): `GET /me/contracts`, `/me/contracts/:id` (with the deposit invoice and VietQR), `/me/contracts/:id/scan`, `/me/contracts/:id/print`; staff `GET /contracts/:id/scan`, `/contracts/:id/print`. Print returns the filled template (draft text while Q-15 is open, with the draft flag), CCCD as last 4 digits only. Scan views write `contract.view_scan`. Also the "Việc hôm nay" group of unpaid deposits (NOTI-06).
  Done when: tests: another tenant's id → 404; a GUEST → `FORBIDDEN`; money and dates in the print data use the spec formats; the audit row exists for each scan view; dashboard spec updated.
- [x] **BE-P3-19** ⏸ `npm run lint`, `npm run test`, `npm run build`, e2e (create → sign → pay deposit on the dev DB). Run the reviewer on the uncommitted changes and put its full report in the checkpoint report.
  Verified: on 20/11/2026 the owner confirmed “pass hết r nhé”, closing the full-backend check on this revision without supplying a unit count or duration. The owner's screenshot confirms dev E2E `2 passed` files / `5 passed` tests in 164.71s, including BE-P3-12 `CLEANED` and BE-P3-19 verified outer rollback; the cleanup list also passes. Build/lint and focused checks pass; reviewer approved, with the full report in the [BE-P3-18..19 checkpoint](plans/P3-3/CHECKPOINT-BE-P3-18-19.md). P3-3 awaits the owner's commit; no test rerun is needed.
  Done when: all pass with real output quoted; no password or CCCD value appears in any log or response body except the one-time temporary password; list the `[ASSUMPTION]`s used (A-02).

## Questions for the owner

- A-22 hiện là giả định triển khai: nếu nhiều HOLD dùng chung tài khoản chờ ký, lần ký thành công đầu tiên kích hoạt tài khoản và cấp một mật khẩu. Những lần sau giữ mật khẩu đó. Chưa ghi nhận owner xác nhận phương án này.
- A-23 hiện là giả định triển khai BE-P3-17: tài khoản còn marker chờ ký trả `CONFLICT_STATE`, cần ký để cấp mật khẩu đầu tiên trước khi reset. Chưa ghi nhận owner xác nhận phương án này; reset tài khoản bị khóa vẫn giữ trạng thái khóa theo D-26.

## Issues log

- 20/11/2026 · BE-P3-19 · Chủ dự án xác nhận “pass hết r nhé”, khép phần chờ full backend trên revision BE-P3-18..19. Không có số đếm/thời lượng unit nên không ghi số suy đoán. Build/lint, reviewer DUYỆT, E2E dev 5/5 và cleanup đã đạt: đổi `[!]` thành `[x]`, P3-3 chờ commit. Không phát sinh thay đổi code hoặc giả định nghiệp vụ mới.
- 20/11/2026 · BE-P3-19 · Ảnh chủ dự án xác nhận E2E DB dev đạt 2/2 file, 5/5 test trong 164,71 giây; BE-P3-12 dọn tự động `CLEANED`, BE-P3-19 kiểm outer rollback không giữ fixture. Lỗi đỏ simulated audit failure là ca rollback đã pass. Khép lỗi kết nối DB dev; ảnh unit test trước chưa có tổng kết nên BE-P3-19 giữ `[!]` chờ xác nhận full suite, sau đó chủ dự án commit.
- 19/11/2026 · BE-P3-18..19 · [Checkpoint](plans/P3-3/CHECKPOINT-BE-P3-18-19.md): scan/in riêng tư, signer snapshot, bản nháp Q-15, unpaidDeposits và workflow E2E rollback đã triển khai; reviewer DUYỆT. Dashboard/lịch xem 79/79, scan/in cuối 64/64, seed 39 và savepoint 10 đạt; workflow PostgreSQL nhúng 1/1, rollback kiểm không còn fixture. DB dev thất bại ngay tại mở outer transaction trước ghi dữ liệu; full backend trên revision mới còn chờ máy dự án. BE-P3-19 giữ `[!]`.
- 19/11/2026 · BE-P3-17 · Chủ dự án xác nhận pass hết và commit; Git xác minh `11379c8`, workspace sạch trước BE-P3-18. Không cung cấp số lượng/thời lượng nên chỉ ghi nhận pass, không suy đoán số đếm.
- 19/11/2026 · BE-P3-17 · [Checkpoint BE-P3-17](plans/P3-3/CHECKPOINT-BE-P3-17.md): reviewer DUYỆT; reset/race 30/30, token 37/37, guard 65/65, build/lint và smoke PostgreSQL nhúng đạt. Hồi quy auth rộng bị automatic approval review chặn telemetry Visual Studio chưa rõ payload; cần `npm run test` trên máy dự án trước nghiệm thu/commit. A-23 là giả định, chưa phải quyết định owner. Không đánh dấu BE-P3-19 hoàn tất.
- 19/11/2026 · BE-P3-16 · Đã giải quyết phần chờ test/commit: chủ dự án xác nhận test thành công và đã commit; Git xác minh `449b450`. Không cung cấp số lượng test/thời lượng nên chỉ ghi nhận kết quả pass. Chưa triển khai BE-P3-17..19; E2E DB dev vẫn chờ riêng.
- 19/11/2026 · BE-P3-16 · [Checkpoint BE-P3-16](plans/P3-3/CHECKPOINT-BE-P3-16.md): reviewer DUYỆT, 62/62 test tập trung, build/lint và smoke PostgreSQL nhúng đạt. Bộ backend đầy đủ trên bản mới chưa có kết quả vì automatic approval review chặn telemetry Visual Studio chưa rõ payload; cần chạy `npm run test` trên máy dự án trước nghiệm thu/commit. Không dùng kết quả 1961 test của mốc trước thay kết quả BE-P3-16. E2E dev chờ giai đoạn BE-P3-19.
- 19/11/2026 · BE-P3-13..15 · Đã giải quyết phần chờ full suite: ảnh chủ dự án xác nhận 99/99 file và 1961/1961 test đạt, 90,01 giây. Checkpoint 1 chờ kiểm tra và commit. E2E DB dev và cleanup list của P3-2 vẫn chờ riêng; BE-P3-19 chưa hoàn tất.
- 19/11/2026 · BE-P3-13..15 · Mã và kiểm tra theo từng luồng đã hoàn tất; [Checkpoint 1](plans/P3-3/CHECKPOINT-1.md) lưu kết quả và review đầy đủ. Full suite trên bản cuối chưa hoàn tất vì automatic approval review chặn telemetry Visual Studio. Cần chạy `npm run test` trên máy dự án trước khi nghiệm thu. DB dev từ phiên Codex vẫn `P1001`; không đánh dấu BE-P3-12 hoặc BE-P3-19 đạt E2E dev.

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
