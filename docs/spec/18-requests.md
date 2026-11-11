# 18 · Requests and incidents

Module: `requests`. Table: `requests` (+ writes to `contracts`, `occupants`, `vehicles` on approval).

## Types and statuses

| Type | Vietnamese | Allowed statuses (DB CHECK) | `payload` |
|---|---|---|---|
| `INCIDENT` | "Sự cố" | PENDING → IN_PROGRESS → RESOLVED → CLOSED; CANCELLED | – (photos in `photos`) |
| `MOVE_OUT` | "Báo trả phòng" | PENDING → APPROVED / REJECTED; CANCELLED | `{ plannedMoveOutDate }` |
| `RENEW` | "Xin gia hạn" | same | `{ termMonths }` |
| `OCCUPANT_CHANGE` | "Cập nhật người ở" | same | `{ add: [{ fullName, phone?, dateOfBirth?, idNumber?, moveInDate }], remove: [{ occupantId, moveOutDate }] }` |
| `VEHICLE_CHANGE` | "Cập nhật xe" | same | `{ add: [{ plate, type, serviceId }], remove: [{ vehicleId, removedAt }] }` |
| `PAYMENT_ISSUE` | "Báo lỗi thanh toán" | PENDING → ESCALATED → RESOLVED; PENDING → RESOLVED / REJECTED; CANCELLED | `{ invoiceId, transferredAt, amount }` + receipt in `photos` |

Status labels: PENDING "Chờ xử lý", IN_PROGRESS "Đang xử lý", RESOLVED "Hoàn thành", CLOSED "Đã đóng", APPROVED "Đã duyệt", REJECTED "Từ chối", ESCALATED "Đã chuyển Boss", CANCELLED "Đã rút".

## Rules

- **REQ-01** Tenants create requests only for their own ACTIVE contracts (HOLD allowed for PAYMENT_ISSUE on the deposit invoice). Tenants may cancel their own PENDING requests.
- **REQ-02** At most one PENDING `MOVE_OUT` or `RENEW` per contract (`PENDING_REQUEST_EXISTS`).
- **REQ-03** Approving `MOVE_OUT`: set `contracts.move_out_notice_date` = request `created_at` date and `planned_move_out_date`. If before `end_date`, the approval screen and the tenant's request page show "Dọn trước hạn: vẫn tính tiền phòng đến {end_date}" with the amount (D-14). Settlement itself happens on the move-out day ([16-billing.md#settlement](16-billing.md#settlement)).
- **REQ-04** Approving `RENEW`: staff then creates the renewal contract prefilled (CON-17). The request links to the new contract in `payload.contractId`.
- **REQ-05** Approving `OCCUPANT_CHANGE` / `VEHICLE_CHANGE` applies the payload in the same transaction (rules CON-13, CON-14). Effects count from the next period (BIL counting rules).
- **REQ-06** `INCIDENT`: staff moves it IN_PROGRESS → RESOLVED, recording `cost` (owner pays, D-15). Tenant confirms → CLOSED, or "Chưa ổn" → IN_PROGRESS. RESOLVED for 3 days → CLOSED by cron.
- **REQ-07** `PAYMENT_ISSUE`: manager may resolve directly (e.g. records a manual payment, BIL-11) or reject with reason; otherwise escalates (`escalated_at`) → Boss resolves via [17-bank.md](17-bank.md) BANK-05 and sets RESOLVED.
- **REQ-08** Every status change notifies the tenant (`REQUEST_UPDATED`). REJECTED needs `decision_note`.
- **REQ-09** Repair review (owner 12/11/2026, D-33; Phase 5; details to confirm: Q-13). After an `INCIDENT` is `CLOSED`, the tenant who created it may rate the repair [ASSUMPTION A-17]: 1–5 stars and an optional comment, once per incident, editable for 7 days after the first rating. Only staff in scope read reviews; nothing is shown publicly. Staff may hide a comment with a reason; the review and the hide are kept and audited. A review is separate from "Đã sửa xong" (REQ-06): a low rating does not reopen the incident, change its `cost` (D-15) or cause any refund. Incidents closed by the 3-day cron can be reviewed too. No other thing is reviewed (not viewings, rooms, buildings or staff).

## API

| Method | Path | Who |
|---|---|---|
| GET/POST | `/me/requests` | tenant |
| POST | `/me/requests/:id/confirm` · `/reopen` · `/cancel` | tenant |
| PUT | `/me/requests/:id/review` `{ rating, comment? }` | tenant – REQ-09 |
| POST | `/requests/:id/review/hide` `{ reason }` | staff – REQ-09 |
| GET | `/requests?buildingId&type&status` | staff |
| PATCH | `/requests/:id` (incident status, cost) | staff |
| POST | `/requests/:id/approve` · `/reject` · `/escalate` | staff |

## Acceptance

- [ ] Second MOVE_OUT while one is pending → `PENDING_REQUEST_EXISTS`.
- [ ] Approving a VEHICLE_CHANGE adding a plate already active elsewhere fails and leaves the request PENDING.
- [ ] Incident RESOLVED on day 1 is CLOSED by cron on day 4.
- [ ] A review on an incident that is not CLOSED, a second review, an edit on day 8, and a review by another tenant are all refused (REQ-09).
- [ ] A 1-star review leaves the incident CLOSED and its `cost` unchanged (REQ-09).
