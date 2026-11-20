# 00 · Overview

## Product

Trọ Thông Minh manages a chain of mini apartment buildings (chung cư mini) for rent in Hà Nội. One owner (Boss) employs managers; each manager runs up to 2 buildings. Guests browse rooms without an account and sign up (phone, email, password; the email is verified by a code) to book, follow and cancel viewings; the building's manager confirms each booking by phone or email; the same account gets tenant rights when a contract is signed (D-25, D-26). Rent is collected monthly via VietQR bank transfer confirmed automatically by a bank webhook.

## Roles

| Role | `users.role` | Scope | Has account |
|---|---|---|---|
| Khách (visitor) | – | Public pages only | No |
| Khách có tài khoản (guest) | `GUEST` | Own viewings (`/toi`) | Yes, self sign-up with a verified email (D-25) |
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
| Đánh giá | review (of an incident repair) | REQ-09 |
| Người ở cùng | occupant | `occupants` |
| Quản lý | manager | `MANAGER` |
| Lịch hẹn xem phòng | viewing | `viewings` |
| Hợp đồng | contract | `contracts` |
| Giữ chỗ | hold (signed or not, before move-in) | `HOLD` |
| Hiệu lực | active (moved in) | `ACTIVE` |
| Ngày vào ở | move-in date, contract start | `start_date` |
| Ngày thu | billing date: the 1st of each month (D-40) | – |
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
| D-05 | Billing by calendar month (D-40): every period runs from the 1st to the last day of the month, and a partial first or last month is prorated (D-41). **Postpaid**: each period's invoice charges rent + utilities + services of the month just lived. Before 16/11/2026 the cycle anchored on each move-in date |
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
| D-16 | Contract is printed from a template, signed on paper, scan uploaded (the "PDF" is the browser's print / save as PDF of the filled template, D-36) |
| D-17 | The contract keeps its signer's CCCD information for residence registration; roommates' CCCD numbers/photos are optional (owner 20/11/2026). When supplied, numbers remain encrypted and photos private. This does not make the optional signer idNumber at initial contract creation newly mandatory (CON-01), expose anyone's full number or delete existing records |
| D-18 | Each building has at most 1 manager; each manager at most 2 buildings |
| D-19 | Database: PostgreSQL on Neon or Supabase, Prisma 6, integer auto-increment ids |
| D-20 | Deferred: AI chatbot, Zalo reminders, e-signature |
| D-21 | The monthly invoice cron also runs at app start and catches up missed days: it creates DRAFTs for billing dates in the last 7 days that have none, so a server restart at 00:05 never loses an invoice. Periods missed for more than 7 days show red in "Việc hôm nay", and staff create them with the button "Tạo hóa đơn kỳ này" (owner 04/11/2026, [16-billing.md](16-billing.md) BIL-05, BIL-21) |
| D-22 | Deployment: FE and API on one origin, one always-on BE instance, BE and DB in the same region, `trust proxy` set to the exact proxy count, `NODE_ENV` required, public GETs cached 60 s at the CDN (owner 04/11/2026, [01-architecture.md](01-architecture.md#deployment) DEP-01..06, PUB-05) |

Decisions D-23..D-34 come from the Home101 brief (`docs/home101-adoption-brief.md`, questions `Q-H101-01..12`, owner 12/11/2026). They change rules that Phase 1 and 2 already built; that code is fixed in Phase Extra (`docs/phase-extra-home101/README.md`). Later the same day the owner replaced the answers behind D-25, D-28, D-29, D-30, D-31 and D-34 to avoid SMS fees and to make booking immediate; the rows below hold the final text ("revised").

| # | Decision |
|---|---|
| D-23 | Q-H101-01: Rooms stays one chain; no outside landlords. Three entry choices: "Tìm phòng", "Tôi đang thuê", "Quản lý tòa nhà". A choice only navigates; it never creates a role or grants a right (UI-11). Since 20/11/2026 a choice can refuse a login of the wrong kind of account (D-43) |
| D-24 | Q-H101-02: the entry screen is a first-visit overlay on `/`, remembered in the browser, with a way to choose again; links to a room, to login and from notifications go straight to their target. It has a background video of Rooms with a still image as fallback (asset: Q-08) |
| D-25 | Q-H101-03, revised: public sign-up with full name, Vietnamese mobile number, email and password. The **email** is verified by a 6-digit code; no SMS or Zalo code is used (cost). Login stays phone + password; password recovery by the email link (AUTH-07, AUTH-11..14). The phone is not verified by the system: the manager confirms it by calling (D-30). Email provider: Resend (Q-14) |
| D-26 | Q-H101-04: one continuous identity. Signing a contract adds tenant rights to the guest's account; password, viewings and history are kept; after the contract ends or is cancelled the account keeps its guest area. An account locked by staff is never unlocked automatically (CON-07, CON-12) |
| D-27 | Q-H101-05: Vietnamese + English for public pages, the guest area and the tenant area; staff app and contracts Vietnamese only; VND only, no currency choice (LOC-01..06) |
| D-28 | Q-H101-06, revised: browsing needs no login; booking needs an account and email. GUEST verifies email; TENANT must have email but need not verify it (owner option B, 15/11/2026; AUTH-12). Resend sends emails; no SMS. Viewings made before the change and viewings staff enter by hand belong to no account and are not linked to one (VIEW-01, VIEW-03) |
| D-29 | Q-H101-07, revised 14/11/2026: choose an exact start hour 8:00–19:00, every day, future through day 30. Each building/hour holds up to 3 distinct guests with NEW/CONFIRMED viewings; multiple rooms for one guest count once. Count stored guest phone across WEB and MANUAL (clarified 15/11/2026). The responsible person cannot hold open viewings in two buildings at the same hour. Owner option B (16/11/2026): a guest may proceed after a cross-building warning and explicit acknowledgement, with a travel reminder for different districts (VIEW-16a). Each account/room has at most one open viewing; each WEB room booking counts toward 3 creations/account/day. Legacy slots remain (VIEW-02, VIEW-02a, VIEW-08, VIEW-16) |
| D-30 | Q-H101-08, revised 14/11/2026: booking succeeds at once when capacity permits, with "Đặt lịch thành công. Vui lòng đợi Rooms xác nhận." and public contacts. Staff confirm by phone or send the confirmation email; late confirmation is allowed, without storing the method or time. After start, NEW or CONFIRMED can become "Đã xem" (DONE) or "Hủy" (CANCELLED); a no-show uses cancellation, with no separate status. NEW → DONE directly was clarified 15/11/2026. Staff agree rescheduling by phone (VIEW-09). Guest cancellation is allowed only before start and clears handled_by_id; staff actions record their id (VIEW-04, VIEW-15..18) |
| D-31 | Q-H101-09: the building's manager conducts the viewing (Boss when the building has none). No separate guide accounts and no dispatch by area, skill or free time (VIEW-07). The rest of H101-DISPATCH is not built |
| D-32 | Q-H101-10: room filters added: area, max occupants, floor, building amenities, balcony, window, pets allowed, room type. Furniture is not a filter (ROOM-10, PUB-06). Pets are set per room; the room-type and amenity lists are fixed in ROOM-10 and BLD-08 (Q-09..Q-11) |
| D-33 | Q-H101-11: no review of viewings. Only the "service at home" is reviewed, which in Rooms is the repair of an incident, by the tenant (REQ-09, Phase 5; details Q-13) |
| D-34 | Q-H101-12, revised: two emails only. (1) Every new booking is emailed at once to the building's manager (to Boss when the building has no active manager or the manager has no email) with the guest's name, phone and email, the room, the building and the time, so the manager can call without opening the site. (2) The confirmation email the manager sends to the guest with a button (D-30). No inbox for guests, no reminders, no SMS or Zalo (VIEW-15, VIEW-19, NOTI-08; D-20 unchanged) |

Decisions D-35..D-37: owner 16/11/2026, before Phase 3 (`docs/phase-3-contracts/README.md`).

| # | Decision |
|---|---|
| D-35 | Phase 3 covers the whole deposit loop: the `DEPOSIT` invoice with VietQR (BIL-10), staff recording the deposit by hand (BIL-11, `DEPOSIT` invoices only until Phase 4), move-in with the first meter readings (CON-10), and cancelling a HOLD contract after the deposit was paid with its settlement (CON-12). The bank webhook, monthly invoices, periodic readings and the move-out settlement stay in Phase 4 |
| D-36 | No PDF library: the contract is a print page of the filled `settings.contract_template`; staff and the tenant print it or save it as PDF from the browser (replaces the "PDF" of D-16; `GET /contracts/:id/pdf` becomes the print page, CON-22) |
| D-37 | The signed contract scan is private like the CCCD photos: a Cloudinary authenticated asset, shown only through a signed URL valid ≤ 5 minutes, to staff in scope and to the contract's tenant (CON-06, CON-16) |
| D-38 | Meters need no photo (Q-P3-2): every meter is outside the room, the manager reads it himself at the end of each month (D-40) and checks it again on site if needed; tenants never declare readings (CON-10, MTR-07) |
| D-39 | The task "call the guests whose viewing was cancelled by a deposit" stays in "Việc hôm nay" until staff press "Đã gọi" (Q-P3-1, VIEW-06) |
| D-40 | Calendar-month billing for the whole chain (Q-16, owner 16/11/2026): every period runs from the 1st to the last day of the month; there is no billing-day setting. Managers enter every reading in time for the invoices to be issued on the **1st** of the next month; the invoice is due on the **9th**, and an invoice not paid by the end of the 9th is overdue (from the 10th). The 10th is the date by which managers must have collected every room |
| D-41 | Partial months (owner 16/11/2026): a contract still ends exactly `term_months` after the move-in date (`end_date` = start + N months − 1 day). The first month (move-in → end of that month) and the last month (1st → `end_date`) are prorated: amount × days in the period ÷ days of that calendar month (28–31). Rent and every fixed service (ROOM, PERSON, VEHICLE) are prorated the same way; electricity and water follow the readings |
| D-42 | Late readings (owner 16/11/2026): if by the end of the 1st some invoices are still waiting for readings, the system emails Boss the list every day at 08:00 from the 2nd to the 10th; after the 10th it stops emailing and the rooms stay red in "Việc hôm nay" for the manager to handle; tenants see nothing until the invoice is issued (NOTI-10) |
| D-43 | Login by entry (owner 20/11/2026): the entry choice also separates the logins. Through "Tôi đang thuê" only a TENANT can log in; through "Quản lý tòa nhà" only a MANAGER or the BOSS. Any other account is refused **by the BE**, no session is created (AUTH-16). There is still one login page `/dang-nhap`; the entry is a query parameter that changes its title. "Tìm phòng", `/dang-nhap` opened directly and every other route keep the login open to every role. The choice still grants nothing (SCOPE-05) |

## Assumptions (not yet confirmed — implement, keep easy to change)

- **A-28** [ASSUMPTION, BE-P3-26 API collection behavior] PATCH contract services supplies the full desired serviceIds set (empty clears current membership); already selected archived services may be retained; unchanged/order-only sets do not create a change audit; GET reads historical ENDED/CANCELLED selections in scope while writes remain HOLD/ACTIVE. Before/after membership is kept in audit history. Q-P3-22 separately confirms approved-rate eligibility for newly added services; no monthly billing effective-date rule is inferred from this API behavior.
- **A-27** [ASSUMPTION, BE-P3-25 technical date-entry default] Vehicle registeredAt/removedAt default to today's Hanoi date; staff may supply an actual date no later than today, with removal on/after registration. Removed registrations remain immutable and a new POST preserves their old interval. Q-P3-19/20/21 separately confirm writable contract statuses, monthly parking departure and automatic vehicle removal on HOLD cancellation.
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
- **A-11** [ASSUMPTION] Email code: 6 digits, valid 5 minutes, single use, 5 wrong tries per code, resend after 60 s, at most 5 codes per email address per day and 10 per IP per hour ([10-auth.md](10-auth.md) AUTH-13). The limits stop the form from being used to flood someone's mailbox.
- **A-12** [ASSUMPTION] Text typed by people (room and building descriptions, notes, announcements) is not translated; it is shown as typed in both languages (LOC-04).
- **A-13** [ASSUMPTION] A viewing still waiting for confirmation when its start time has passed stays as it is and is marked "Quá giờ, chưa xác nhận" for staff; nothing is confirmed or cancelled automatically (VIEW-17).
- **A-14** [ASSUMPTION] Responsibility changes preserve open viewings. Mark "Trùng giờ" for current cross-building conflicts of a responsible person or guest, or a building/hour exceeding 3 distinct guests; several guests/rooms in one building within capacity are valid (VIEW-22).
- **A-15** [ASSUMPTION] A manager's email is used as typed by the manager, without a verification step; only guests verify their email (AUTH-12, VIEW-19).
- **A-18** [ASSUMPTION] At contract creation, when the signer's phone already has a guest account, the staff member (who is with the signer) confirms on the form that the account is the signer's before it is reused; if the signer says it is not theirs, the contract is not created and Boss sorts out the account (CON-07). The owner had no preference on 12/11/2026.
- **A-21** [ASSUMPTION] A prorated amount is rounded to the nearest đồng, half up, once per line (G-01).
- **A-22** [ASSUMPTION] When a new pending tenant account has several unsigned HOLD contracts, the first successfully signed contract activates the account and issues its one temporary password. Later signatures reuse that password. A pending account is identified by its unusable password marker, and first activation is serialized under its user lock.
- **A-23** [ASSUMPTION] Staff password reset is unavailable while a tenant still has the unusable pending-account password marker: sign a contract first to issue the initial password. Reset returns `CONFLICT_STATE` for that pending account and never activates it. Resetting an account locked by staff preserves its locked state (D-26).
- **A-24** [ASSUMPTION, implementation limit of BE-P3-20] If a boundary day contains different meter values and a recorded meter replacement, date-only records cannot identify their physical meter order reliably. Move-in returns `CONFLICT_STATE` for history review instead of guessing from insertion ids/timestamps. A single unambiguous replacement or an explicit replacement at move-in is supported. This is not an owner-confirmed business choice; resolving ambiguous historical meter epochs needs the later meter-history workflow.
- **A-16** [ASSUMPTION] A tenant keeps role `TENANT` after all their contracts ended: they still read past contracts and invoices and use the guest area (D-26, CON-12).
- **A-25** [ASSUMPTION, BE-P3-23 implementation default, Q-P3-16] Occupant additions/edits/move-out dates are writable only for HOLD/ACTIVE contracts; ENDED/CANCELLED occupant history remains readable. The owner requested continuation after these options were presented but has not directly confirmed this individual policy; disclose it at the checkpoint.
- **A-26** [ASSUMPTION, BE-P3-23 implementation default, Q-P3-17] Occupant mutations validate the inclusive overlap peak across the affected stay dates, including planned HOLD occupants. Keep the existing current-day room-limit guard and also protect registered stays from today onward when lowering a room limit or moving in; ignore past peaks for those transitions. These are the proposed defaults used after the continuation request, not an explicit owner answer to this individual policy.
- **A-17** [ASSUMPTION] Repair review: 1–5 stars + optional comment, once per incident, editable for 7 days, read by staff in scope only; hiding a comment needs a reason. These are the values the brief proposed for viewing reviews, reused for repairs (REQ-09, Q-13).

## Open questions (do not implement until answered)

- **Q-01** [OPEN] While an early-leaving tenant is still paying rent until the end date, may the room be rented to someone else? If yes, is the old tenant's overlapping rent reduced?
- **Q-02** [OPEN] Real electric tier table (kWh bounds and prices) per building. Use seed values from [12-pricing.md](12-pricing.md) until then.
- **Q-03** [OPEN] Webhook provider (SePay or Casso) and bank. Implement behind one adapter interface. When choosing, check Q-04.
- **Q-04** [OPEN] Missed webhooks: does the chosen provider retry, and does it have an API to list past transactions for a reconciliation job? ([17-bank.md](17-bank.md) BANK-08)
- **Q-05** Answered by the owner (04/11/2026): keep the 7-day limit and add the button "Tạo hóa đơn kỳ này" for older missed periods (D-21, BIL-21).
- **Q-06** [OPEN] Reminders at 08:00 match one exact day (NOTI-05). If that run is missed, should they be sent late on the next run, or skipped?
- **Q-07** Closed by the owner (12/11/2026): no SMS or Zalo code is used, so no SMS provider is needed (D-25).
- **Q-08** [OPEN] The background video of the entry screen (D-24): the owner provides the file. Until then the still image is used.
- **Q-09** Answered by the owner (12/11/2026): "Cho nuôi thú cưng" is set per room (ROOM-10).
- **Q-10** Answered by the owner (12/11/2026): room types are "Studio", "Có gác xép", "1 phòng ngủ", "2 phòng ngủ" (ROOM-10).
- **Q-11** Answered by the owner (12/11/2026): building amenities are "Thang máy", "Chỗ để xe", "Bảo vệ", "Camera", "Máy giặt chung", "Sân phơi", "Khóa vân tay", "Giờ giấc tự do" (BLD-08).
- **Q-12** Answered by the owner (12/11/2026, revised the same day): viewings start on the hour from 8:00 to 19:00 every day, so the last one ends at 20:00; managers do not enter days off (VIEW-08, D-29).
- **Q-13** [OPEN] Confirm D-33 and A-17: is the repair of an incident the only thing reviewed, with the values of A-17?
- **Q-14** Answered by the owner (12/11/2026), clarified 15/11/2026: use Resend whenever `MAIL_PROVIDER=resend`, `MAIL_API_KEY` and `MAIL_FROM` are all configured, including local development. The owner creates the account, verifies the sending domain and fills `MAIL_*`. Without complete configuration, development/test use the console mailer; production sends fail with `MAIL_UNAVAILABLE` instead of silently logging. Sign-up codes, password links, the new-booking email and the confirmation email all go through it (AUTH-13, NOTI-07).
- **Q-15** [OPEN] The real contract text (D-36): the owner sends it later. Until then `settings.contract_template` holds a draft whose print page says "BẢN NHÁP – chưa dùng để ký"; do not sign real contracts with it.
- **Q-16** Answered by the owner (16/11/2026): calendar-month billing, invoices issued on the 1st, due on the 9th; the manager reads every meter at the end of the month, so MTR-10 holds (D-40, D-41).
