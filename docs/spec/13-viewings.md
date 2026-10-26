# 13 · Viewings (lịch hẹn xem phòng)

Module: `viewings`. Table: `viewings`.

## Rules

- **VIEW-01** Guests submit `{ roomId, guestName, guestPhone, visitDate, timeSlot, note }` from the room page. Room MUST be public (ROOM-05) and `visitDate` ≥ today.
- **VIEW-02** Anti-spam: hidden honeypot field (non-empty → 200 but discarded), rate limit [ASSUMPTION A-03] 5/hour per IP and 3/day per phone → 429.
- **VIEW-03** Staff MAY add a viewing manually for guests who called or messaged (`source = MANUAL`).
- **VIEW-04** Status flow: `NEW` → `CONFIRMED` → `WON` | `LOST`; `NEW`/`CONFIRMED` → `CANCELLED`. Every change records `handled_by_id`; LOST needs `outcome_note`.
- **VIEW-05** "Chốt" on a CONFIRMED viewing opens contract creation prefilled (room, guest name, phone). Creating the contract sets the viewing `WON` and `contract_id`.
- **VIEW-06** When a HOLD contract is created for a room, all other NEW/CONFIRMED viewings of that room become `CANCELLED` with note "Phòng đã có người đặt cọc", and the manager gets a task to call those guests.
- **VIEW-07** The building's manager (or Boss if none) sees new viewings in "Việc hôm nay".

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
