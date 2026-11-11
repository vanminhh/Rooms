# 00 · Overview

## Product

Trọ Thông Minh manages a chain of mini apartment buildings (chung cư mini) for rent in Hà Nội. One owner (Boss) employs managers; each manager runs up to 2 buildings. Guests browse rooms without an account and sign up (phone + SMS code) to book and follow viewings; the same account gets tenant rights when a contract is signed (D-25, D-26). Rent is collected monthly via VietQR bank transfer confirmed automatically by a bank webhook.

## Roles

| Role | `users.role` | Scope | Has account |
|---|---|---|---|
| Khách (visitor) | – | Public pages only | No |
| Khách có tài khoản (guest) | `GUEST` | Own viewings and notifications (`/toi`) | Yes, self sign-up with a verified phone (D-25) |
| Người thuê (tenant) | `TENANT` | Everything a guest has + own contracts (may rent several rooms) | Yes: the guest account at contract creation, or created at signing when the signer has none (D-01, D-26) |
| Quản lý (manager) | `MANAGER` | Buildings where `buildings.manager_id = user.id` (max 2) | Yes, created by Boss |
| Boss | `BOSS` | Everything. Exactly one Boss exists | Yes, seeded |

Boss uses the same staff app as managers, with all buildings visible plus 5 Boss-only pages. A building without a manager (or whose manager is deactivated) falls back to Boss: Boss's contact is shown publicly and the building's tasks appear for Boss.

## Hierarchy

Boss → Manager (≤ 2 buildings) → Building (address, district, ward in Hà Nội) → Room → Contract (≥ 3 months) → Occupants + Vehicles. The signer of a contract holds the tenant account.

## Glossary (VI → EN → identifier)

| Vietnamese | English | Identifier |
|---|---|---|
| Tòa, chung cư mini | building | `buildings` |
| Phòng | room | `rooms` |
| Khách | visitor (no account) | – |
| Khách có tài khoản | guest | `GUEST` |
| Người thuê | tenant | `TENANT` |
| Đề xuất giờ | time proposal (viewing) | `viewing_proposals` |
| Đánh giá | review (of an incident repair) | REQ-09 |
| Người ở cùng | occupant | `occupants` |
| Quản lý | manager | `MANAGER` |
| Lịch hẹn xem phòng | viewing | `viewings` |
| Hợp đồng | contract | `contracts` |
| Giữ chỗ | hold (signed or not, before move-in) | `HOLD` |
| Hiệu lực | active (moved in) | `ACTIVE` |
| Ngày vào ở | move-in date, contract start | `start_date` |
| Ngày thu | billing day (day of month) | `billing_day` |
| Kỳ | billing period | `period_no`, `period_start`, `period_end` |
| Cọc | deposit | `deposit`, invoice type `DEPOSIT` |
| Hóa đơn | invoice | `invoices` |
| Chốt chỉ số | meter reading | `meter_readings` |
| Đơn giá, bảng giá | rate plan | `rate_plans` |
| Bậc (điện) | tier | `rate_tiers` |
| Dịch vụ | service (wifi, rác, gửi xe...) | `services` |
| Ghi thu tay | manual payment | payment `source = MANUAL` |
| Giao dịch ngân hàng | bank transaction | `bank_transactions` |
| Báo lỗi thanh toán | payment issue | request `PAYMENT_ISSUE` |
| Thanh lý | contract termination | – |
| Quyết toán | settlement | `settlements` |
| Gia hạn | renewal | `previous_contract_id` |
| Yêu cầu | request | `requests` |
| Sự cố | incident | request `INCIDENT` |
| Thông báo | announcement / notification | `announcements`, `notifications` |
| Duyệt giá | price approval | `ApprovalStatus` |
| Việc hôm nay | today's tasks (staff dashboard) | `GET /dashboard` |

## Global rules

- **G-01** Money is an integer number of đồng (VND). No floats anywhere (DB, BE, FE).
- **G-02** Business dates (move-in, period, due date, reading date) are `date`. Event times are `timestamptz`. All date logic runs in timezone `Asia/Ho_Chi_Minh`.
- **G-03** UI text is Vietnamese by default. Public pages, auth pages, the guest area and the tenant area also have English; the staff app and contract documents are Vietnamese only (D-27, [01-architecture.md](01-architecture.md#languages) LOC-01..06). Money displays as `2.984.000 đ`, dates as `dd/mm/yyyy`, in both languages.
- **G-04** Phone numbers are Vietnamese mobile format `^0[0-9]{9}$` and are the login name.
- **G-05** Nothing that has history is hard-deleted. Buildings, rooms, users, services use `is_active = false`.
- **G-06** Every price change (room price, electric tiers, water, services) is proposed by a manager and approved by Boss. Boss's own changes are approved immediately.
- **G-07** Authorization and all money calculation live in the BE. The FE only hides what a role cannot do.
- **G-08** Room status is never stored; it is derived (see [11-buildings-rooms.md](11-buildings-rooms.md#room-status)).
- **G-09** Invoice code shown to users and used as bank transfer content is `TT` + invoice id (e.g. `TT1523`). It is not stored.
- **G-10** Every money, price, contract or CCCD-view action writes an `audit_logs` row.

## Decisions (confirmed by owner)

| # | Decision |
|---|---|
| D-01 | Tenant account belongs to the signer (phone). If the signer already has an account (guest or tenant) it is reused with its password (D-26); otherwise it is created when the contract is signed, the manager hands over a temporary password and the first login forces a password change. One person may rent several rooms (changed 12/11/2026) |
| D-02 | Replaced 12/11/2026 by D-25: there is a public sign-up page. Before: no sign-up, accounts only at contract signing |
| D-03 | Contract minimum term is 3 months, chosen in whole months |
| D-04 | Deposit is paid at signing through a `DEPOSIT` invoice with VietQR (or recorded manually) |
| D-05 | Billing cycle anchors on the move-in date. **Postpaid**: each period's invoice charges rent + utilities + services of the period just lived |
| D-06 | Every room has its own electric and water meter. Electricity is tiered per building. Water is per m³ or per person, chosen per building |
| D-07 | Services are chosen per contract. Parking is per vehicle; each vehicle type is its own service with its own price |
| D-08 | Contract rent is locked to the approved room price at creation. Renewal keeps the old rent |
| D-09 | A new rate applies from the first period that **starts** on/after its effective date |
| D-10 | All money goes to one Boss bank account. A bank webhook (SePay or Casso) confirms transfers. No partial payments. Late payment: reminders only, no fee |
| D-11 | Manual payment records a method: `CASH`, `BANK_TRANSFER`, `CARD`, `OTHER` |
| D-12 | Wrong transfers: tenant reports a payment issue → manager checks → escalates to Boss → Boss assigns the transaction to an invoice or marks it refunded |
| D-13 | A contract must be renewed or terminated before its end date. No invoice is created for a period beyond the end date; an unresolved expired contract is flagged red |
| D-14 | Moving out early still charges rent until the contract end date, deducted from the deposit; any extra deposit kept is decided by the manager |
| D-15 | Repair cost of incidents is always paid by the owner; it is recorded for reports |
| D-16 | Contract PDF is generated from a template, signed on paper, scan uploaded |
| D-17 | Occupants' CCCD number (encrypted) and both-side photos (private) are stored for residence registration |
| D-18 | Each building has at most 1 manager; each manager at most 2 buildings |
| D-19 | Database: PostgreSQL on Neon or Supabase, Prisma 6, integer auto-increment ids |
| D-20 | Deferred: AI chatbot, Zalo reminders, e-signature |
| D-21 | The monthly invoice cron also runs at app start and catches up missed days: it creates DRAFTs for billing dates in the last 7 days that have none, so a server restart at 00:05 never loses an invoice. Periods missed for more than 7 days show red in "Việc hôm nay", and staff create them with the button "Tạo hóa đơn kỳ này" (owner 04/11/2026, [16-billing.md](16-billing.md) BIL-05, BIL-21) |
| D-22 | Deployment: FE and API on one origin, one always-on BE instance, BE and DB in the same region, `trust proxy` set to the exact proxy count, `NODE_ENV` required, public GETs cached 60 s at the CDN (owner 04/11/2026, [01-architecture.md](01-architecture.md#deployment) DEP-01..06, PUB-05) |

Decisions D-23..D-34 come from the Home101 brief (`docs/home101-adoption-brief.md`, questions `Q-H101-01..12`, owner 12/11/2026). They change rules that Phase 1 and 2 already built; that code is fixed in Phase Extra (`docs/phase-extra-home101/README.md`).

| # | Decision |
|---|---|
| D-23 | Q-H101-01: Rooms stays one chain; no outside landlords. Three entry choices: "Tìm phòng", "Tôi đang thuê", "Quản lý tòa nhà". A choice only navigates; it never creates a role or grants a right (UI-11) |
| D-24 | Q-H101-02: the entry screen is a first-visit overlay on `/`, remembered in the browser, with a way to choose again; links to a room, to login and from notifications go straight to their target. It has a background video of Rooms with a still image as fallback (asset: Q-08) |
| D-25 | Q-H101-03: public sign-up with a Vietnamese mobile number + password, verified by an SMS code; password recovery by SMS code to the verified number (AUTH-11..14). SMS provider: Q-07 |
| D-26 | Q-H101-04: one continuous identity. Signing a contract adds tenant rights to the guest's account; password, viewings and history are kept; after the contract ends or is cancelled the account keeps its guest area. An account locked by staff is never unlocked automatically (CON-07, CON-12) |
| D-27 | Q-H101-05: Vietnamese + English for public pages, the guest area and the tenant area; staff app and contracts Vietnamese only; VND only, no currency choice (LOC-01..06) |
| D-28 | Q-H101-06: browsing needs no login; booking a viewing needs an account with a verified phone. Old viewings and viewings staff entered by hand are linked to an account only after the phone is verified and the user confirms the link (VIEW-01, VIEW-21) |
| D-29 | Q-H101-07: a viewing has an exact start time, lasts 30 minutes, with a 15-minute travel buffer between two viewings of the same person; still at most 30 days ahead; start times 8:00–19:30 every day in 30-minute steps (Q-12). Old viewings keep their slot (VIEW-08, VIEW-16) |
| D-30 | Q-H101-08: the guest cancels at once any time before the start. A time change needs the other side's agreement and the old time stays until then. A proposal expires at the old time or the proposed time, whichever is earlier; silence is never agreement. Staff record a no-show after the start time, no penalty; staff may record an answer given by phone, with source and note (VIEW-14..19) |
| D-31 | Q-H101-09: the building's manager conducts the viewing (Boss when the building has none). No separate guide accounts and no dispatch by area, skill or free time; a busy manager proposes another time to the guest (VIEW-07, VIEW-14). The rest of H101-DISPATCH is not built |
| D-32 | Q-H101-10: room filters added: area, max occupants, floor, building amenities, balcony, window, pets allowed, room type. Furniture is not a filter (ROOM-10, PUB-06). Pets are set per room; the room-type and amenity lists are fixed in ROOM-10 and BLD-08 (Q-09..Q-11) |
| D-33 | Q-H101-11: no review of viewings. Only the "service at home" is reviewed, which in Rooms is the repair of an incident, by the tenant (REQ-09, Phase 5; details Q-13) |
| D-34 | Q-H101-12: notifications in the account + email when the user has one; on every change of a viewing, and reminders 24 h and 2 h before a confirmed viewing. No SMS or Zalo notifications (NOTI-08, NOTI-09; D-20 unchanged) |

## Assumptions (not yet confirmed — implement, keep easy to change)

- **A-01** [ASSUMPTION] On early move-out, services (wifi, rác, parking) are charged in full for the current period; remaining periods charge rent only.
- **A-02** [ASSUMPTION] Deposit invoice due date = contract `start_date` (or issue date if later). Move-in is blocked until it is paid.
- **A-03** [ASSUMPTION] Viewing bookings: 3 per day per account, counted from the `viewings` table ([13-viewings.md](13-viewings.md) VIEW-02). Before 12/11/2026 the public form had 5 per hour per IP and 3 per day per phone; that form is removed (D-28).
- **A-04** [ASSUMPTION] Abnormal consumption warning when a period's kWh or m³ is more than 2× the average of the previous 3 periods.
- **A-05** Confirmed by the owner (01/11/2026), no longer an assumption: public "ước tính chi phí/tháng" = room price + services with unit ROOM + services with unit PERSON × 1 + water for 1 person when `water_mode = PER_PERSON`. Electricity and per-m³ water are not added; their unit prices are shown with "chưa gồm điện, nước – tính theo đồng hồ của phòng". Details: [11-buildings-rooms.md](11-buildings-rooms.md) ROOM-08.
- **A-06** [ASSUMPTION] Days a tenant stays after `end_date` without renewal are not charged automatically; staff may add them to the settlement as damages with a note.
- **A-07** [ASSUMPTION] Login without "Ghi nhớ đăng nhập" keeps the session until the browser closes, max 12 hours.
- **A-08** [ASSUMPTION] Login is also limited to 20 failures per IP per 15 minutes, on top of the 5-per-phone limit ([10-auth.md](10-auth.md) AUTH-04).
- **A-09** [ASSUMPTION] The renewal switch has no 7-day limit: a missed switch, or a renewal signed after its start date, is switched by the next cron run ([16-billing.md](16-billing.md) BIL-06).
- **A-10** [ASSUMPTION] Settlement is refused while the contract still has a billing period without an invoice; staff create it first with "Tạo hóa đơn kỳ này" ([16-billing.md](16-billing.md) BIL-21).
- **A-11** [ASSUMPTION] SMS code: 6 digits, valid 5 minutes, single use, 5 wrong tries per code, resend after 60 s, at most 5 SMS per phone per day and 10 per IP per hour ([10-auth.md](10-auth.md) AUTH-13). Each SMS costs money, so the limits are strict.
- **A-12** [ASSUMPTION] Text typed by people (room and building descriptions, notes, announcements) is not translated; it is shown as typed in both languages (LOC-04).
- **A-13** [ASSUMPTION] A NEW viewing whose requested time has passed without an answer stays NEW and is marked "Quá giờ, chưa xác nhận" for staff; nothing is confirmed or cancelled automatically (VIEW-17).
- **A-14** [ASSUMPTION] When the person responsible for a building changes, open viewings stay as they are; confirmed viewings that now overlap are marked "Trùng giờ" for the new person to rearrange (VIEW-23).
- **A-15** [ASSUMPTION] Notification emails go to `users.email` as typed; there is no email verification step (NOTI-04, NOTI-08).
- **A-16** [ASSUMPTION] A tenant keeps role `TENANT` after all their contracts ended: they still read past contracts and invoices and use the guest area (D-26, CON-12).
- **A-17** [ASSUMPTION] Repair review: 1–5 stars + optional comment, once per incident, editable for 7 days, read by staff in scope only; hiding a comment needs a reason. These are the values the brief proposed for viewing reviews, reused for repairs (REQ-09, Q-13).

## Open questions (do not implement until answered)

- **Q-01** [OPEN] While an early-leaving tenant is still paying rent until the end date, may the room be rented to someone else? If yes, is the old tenant's overlapping rent reduced?
- **Q-02** [OPEN] Real electric tier table (kWh bounds and prices) per building. Use seed values from [12-pricing.md](12-pricing.md) until then.
- **Q-03** [OPEN] Webhook provider (SePay or Casso) and bank. Implement behind one adapter interface. When choosing, check Q-04.
- **Q-04** [OPEN] Missed webhooks: does the chosen provider retry, and does it have an API to list past transactions for a reconciliation job? ([17-bank.md](17-bank.md) BANK-08)
- **Q-05** Answered by the owner (04/11/2026): keep the 7-day limit and add the button "Tạo hóa đơn kỳ này" for older missed periods (D-21, BIL-21).
- **Q-06** [OPEN] Reminders at 08:00 match one exact day (NOTI-05). If that run is missed, should they be sent late on the next run, or skipped?
- **Q-07** [OPEN] SMS provider for sign-up and recovery codes (D-25), and who pays per SMS. Implement behind one adapter interface; in dev the code is written to the server log.
- **Q-08** [OPEN] The background video of the entry screen (D-24): the owner provides the file. Until then the still image is used.
- **Q-09** Answered by the owner (12/11/2026): "Cho nuôi thú cưng" is set per room (ROOM-10).
- **Q-10** Answered by the owner (12/11/2026): room types are "Studio", "Có gác xép", "1 phòng ngủ", "2 phòng ngủ" (ROOM-10).
- **Q-11** Answered by the owner (12/11/2026): building amenities are "Thang máy", "Chỗ để xe", "Bảo vệ", "Camera", "Máy giặt chung", "Sân phơi", "Khóa vân tay", "Giờ giấc tự do" (BLD-08).
- **Q-12** Answered by the owner (12/11/2026): viewings start between 8:00 and 19:30 every day, on the hour or the half hour, so the last one ends at 20:00; managers do not enter days off, a busy manager proposes another time (VIEW-08, D-31).
- **Q-13** [OPEN] Confirm D-33 and A-17: is the repair of an incident the only thing reviewed, with the values of A-17?
