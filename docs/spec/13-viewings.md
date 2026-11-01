# 13 · Viewings (lịch hẹn xem phòng)

Module: `viewings`. Table: `viewings`.

## Rules

- **VIEW-01** Guests submit `{ roomId, guestName, guestPhone, visitDate, timeSlot, note }` from the room page. Room MUST be public (ROOM-05), else `ROOM_NOT_AVAILABLE`; date and slot follow VIEW-08.
- **VIEW-02** Anti-spam: hidden honeypot field (non-empty → 200 but discarded), rate limit [ASSUMPTION A-03] 5/hour per IP and 3/day per phone → 429 (counting: VIEW-11).
- **VIEW-03** Staff MAY add a viewing manually for guests who called or messaged (`source = MANUAL`). The room must be active and in scope but need not be public (a guest may ask about a room that becomes free soon); date and slot follow VIEW-08.
- **VIEW-04** Status flow: `NEW` → `CONFIRMED` → `WON` | `LOST`; `NEW`/`CONFIRMED` → `CANCELLED`. Every change records `handled_by_id`; LOST needs `outcome_note`. `WON` is set **only** by contract creation (VIEW-05, Phase 3); `PATCH /viewings` cannot set it. Other moves → `CONFLICT_STATE` (conditional update on the current status).
- **VIEW-05** "Chốt" on a CONFIRMED viewing opens contract creation prefilled (room, guest name, phone). Creating the contract sets the viewing `WON` and `contract_id`.
- **VIEW-06** When a HOLD contract is created for a room, all other NEW/CONFIRMED viewings of that room become `CANCELLED` with note "Phòng đã có người đặt cọc", and the manager gets a task to call those guests.
- **VIEW-07** The building's manager (or Boss if none) sees new viewings in "Việc hôm nay": a manager counts NEW viewings of their buildings; Boss counts NEW viewings of buildings without an active manager (SCOPE-04). Boss's "Lịch hẹn" page still shows every building.
- **VIEW-08** Time slots (owner 01/11/2026): `MORNING` "Sáng (8:00–11:00)", `AFTERNOON` "Chiều (14:00–17:00)", `EVENING` "Tối (18:00–20:00)". `visitDate` is from today to today + 30 days. A slot that has already started today (Asia/Ho_Chi_Minh) is rejected: `VALIDATION_FAILED` with `fields.timeSlot`.
- **VIEW-09** Date and slot may be changed only while NEW or CONFIRMED, with the VIEW-08 rules.
- **VIEW-10** Labels (UI-02): NEW "Mới", CONFIRMED "Đã xác nhận", WON "Đã chốt", LOST "Không thành", CANCELLED "Đã hủy".
- **VIEW-11** The per-phone limit counts `source = WEB` viewings of that phone created today (Asia/Ho_Chi_Minh), from the `viewings` table; manual viewings and honeypot submissions do not count. Count and insert run in one transaction under `pg_advisory_xact_lock` on the phone, so parallel submissions cannot pass the limit. The per-IP limit is kept in memory (owner 01/11/2026).
- **VIEW-12** `POST /public/viewings` returns the same body for a saved submission and a honeypot one, without the viewing id.
- **VIEW-13** When a room stops being public by maintenance or lock, or its building is locked, NEW/CONFIRMED viewings are **not** cancelled; staff see "Còn N lịch hẹn chưa xử lý" before confirming, call the guests and change the status themselves (owner 01/11/2026). A locked building has no manager (BLD-06), so its viewings go to Boss (VIEW-07).

## API

| Method | Path | Who |
|---|---|---|
| POST | `/public/viewings` | public |
| GET | `/viewings?buildingId&status&from&to` | staff |
| POST | `/viewings` | staff (manual) |
| PATCH | `/viewings/:id` | staff – status, note, date/slot |

## Acceptance

- [ ] Submitting for a non-public room returns `ROOM_NOT_AVAILABLE`.
- [ ] The 4th submission from the same phone in a day returns 429.
- [ ] Creating a HOLD contract from viewing A cancels viewing B of the same room.
- [ ] At 15:00 a guest cannot book "Sáng" or "Chiều" today; "Tối" today and any slot tomorrow work (VIEW-08).
- [ ] `PATCH /viewings/:id` with `status: WON` returns `CONFLICT_STATE`; NEW → LOST also does (VIEW-04).
- [ ] Two parallel submissions from a phone that already has 2 today save only one (VIEW-11).
- [ ] A honeypot submission returns the same body as a real one and saves nothing (VIEW-12).
