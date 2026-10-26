# 00 · Overview

## Product

Trọ Thông Minh manages a chain of mini apartment buildings (chung cư mini) for rent in Hà Nội. One owner (Boss) employs managers; each manager runs up to 2 buildings. Guests find rooms and book viewings without an account; a tenant account is created only when a contract is signed. Rent is collected monthly via VietQR bank transfer confirmed automatically by a bank webhook.

## Roles

| Role | `users.role` | Scope | Has account |
|---|---|---|---|
| Khách (guest) | – | Public pages only | No |
| Người thuê (tenant) | `TENANT` | Own contracts only (may rent several rooms) | Yes, created at contract signing |
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
| Khách | guest | – |
| Người thuê | tenant | `TENANT` |
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
- **G-03** Every UI text is Vietnamese. Money displays as `2.984.000 đ`, dates as `dd/mm/yyyy`.
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
| D-01 | Tenant account belongs to the signer (phone), created when the contract is signed; manager hands over a temporary password; first login forces password change. One person may rent several rooms |
| D-02 | No public sign-up page. Login page shows "Chưa có tài khoản? Tài khoản được cấp khi ký hợp đồng" with contact info |
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

## Assumptions (not yet confirmed — implement, keep easy to change)

- **A-01** [ASSUMPTION] On early move-out, services (wifi, rác, parking) are charged in full for the current period; remaining periods charge rent only.
- **A-02** [ASSUMPTION] Deposit invoice due date = contract `start_date` (or issue date if later). Move-in is blocked until it is paid.
- **A-03** [ASSUMPTION] Rate limits on the public viewing form: 5 per hour per IP, 3 per day per phone.
- **A-04** [ASSUMPTION] Abnormal consumption warning when a period's kWh or m³ is more than 2× the average of the previous 3 periods.
- **A-05** [ASSUMPTION] Public "ước tính chi phí/tháng" = room price + services with unit ROOM + per-person services and water for 1 person (electricity excluded, shown as "chưa gồm điện").
- **A-06** [ASSUMPTION] Days a tenant stays after `end_date` without renewal are not charged automatically; staff may add them to the settlement as damages with a note.
- **A-07** [ASSUMPTION] Login without "Ghi nhớ đăng nhập" keeps the session until the browser closes, max 12 hours.

## Open questions (do not implement until answered)

- **Q-01** [OPEN] While an early-leaving tenant is still paying rent until the end date, may the room be rented to someone else? If yes, is the old tenant's overlapping rent reduced?
- **Q-02** [OPEN] Real electric tier table (kWh bounds and prices) per building. Use seed values from [12-pricing.md](12-pricing.md) until then.
- **Q-03** [OPEN] Webhook provider (SePay or Casso) and bank. Implement behind one adapter interface.
