# 30 · Frontend

App: `Source/frontend` (React 19 + Vite + TS). Every page is built from the official UI kit in `src/components/` ([31-ui-kit.md](31-ui-kit.md)): wrap pages in `.rooms-theme`, use `RoomsHeader`/`RoomsFooter` in layouts, `StatusBadge` for statuses, `formatMoney` for money.

## Apps and layouts

| App | Layout | Base route | Who |
|---|---|---|---|
| Công khai | `PublicLayout` – top menu with "Đăng nhập" (or "Trang của tôi" when logged in), footer with Boss contact | `/` | everyone |
| Người thuê | `TenantLayout` – mobile-first bottom nav, room switcher when the tenant has several contracts | `/thue` | TENANT |
| Nhân sự | `StaffLayout` – side nav, building selector (Boss: all + "Tất cả tòa"; manager: own), Boss-only items | `/ql` | MANAGER, BOSS |

Route guard: not logged in → `/dang-nhap?next=...`; wrong role → own home (AUTH-06); `must_change_password` → `/doi-mat-khau`.

## Pages (31)

### Public (7)

| Route | Page | Spec |
|---|---|---|
| `/` | Trang chủ: featured public rooms, districts with counts | BLD, ROOM-05 |
| `/phong` | Tìm phòng: filters district, ward, building, price range; filters in URL query | ROOM-05 |
| `/toa/:id` | Chi tiết tòa: info, rates (electric tiers, water, services), contact, public rooms | BLD-04, RATE |
| `/phong/:id` | Chi tiết phòng: photos, price, furniture, min term 3 months, deposit, monthly estimate (A-05), contact, viewing form | VIEW-01 |
| `/dang-nhap` | Đăng nhập: phone, password, "Ghi nhớ đăng nhập", "Quên mật khẩu?", note "Chưa có tài khoản? Tài khoản được cấp khi ký hợp đồng" + Boss contact + link "Xem phòng trống" | AUTH-01, AUTH-10 |
| `/quen-mat-khau` | Quên mật khẩu; with `?token=` from the email link it shows the new-password form | AUTH-07 |
| `/doi-mat-khau` | Đổi mật khẩu (forced on first login) | AUTH-05 |

### Tenant (6)

| Route | Page | Spec |
|---|---|---|
| `/thue` | Tổng quan: before move-in → deposit invoice + move-in date; after → invoice to pay, next billing date, unread notifications, open requests, 6-period electric/water bar chart | |
| `/thue/hoa-don`, `/thue/hoa-don/:id` | Hóa đơn: list (unpaid/overdue first); detail with lines, tier lines, readings + photos, VietQR image + content `TT{id}` with copy button, auto-refresh status on focus, "Báo lỗi thanh toán" | BIL-10, REQ-07 |
| `/thue/hop-dong`, `/thue/hop-dong/:id` | Hợp đồng: current + past contracts; term progress; deposit; PDF; occupants (CCCD last 4 only); vehicles (read-only); buttons "Báo trả phòng", "Xin gia hạn", "Cập nhật người ở", "Cập nhật xe" | CON, REQ-03 |
| `/thue/yeu-cau`, `/thue/yeu-cau/:id` | Yêu cầu và sự cố: list by type; create incident with photos; status timeline; "Đã sửa xong" / "Chưa ổn" | REQ |
| `/thue/thong-bao` | Thông báo: inbox, unread dot, mark all read | NOTI-01 |
| `/thue/tai-khoan` | Tài khoản: change password, email | AUTH-09 |

### Staff (13, MANAGER + BOSS)

| Route | Page | Spec |
|---|---|---|
| `/ql` | Việc hôm nay: task groups with counts (NOTI-06), occupancy ring, collected vs outstanding bar | NOTI-06, RPT |
| `/ql/toa-nha`, `/ql/toa-nha/:id` | Tòa nhà: manager edits amenities/description; Boss creates, assigns manager, services | BLD, SVC |
| `/ql/phong` | Phòng: floor grid colored by derived status; create/edit, photos; "Đề xuất giá" | ROOM, PRC-01 |
| `/ql/lich-hen` | Lịch hẹn: by date; add manual; call/Zalo buttons; "Chốt" → contract form | VIEW |
| `/ql/hop-dong`, `/ql/hop-dong/:id` | Hợp đồng (also the tenant list): wizard create → PDF → upload scan → show temp password once → move-in readings; occupants with CCCD photos; vehicles; services; reset password; renew; cancel; settlement with dry-run preview | CON, BIL-13..19 |
| `/ql/chi-so` | Chốt chỉ số: mobile-first list of due drafts, number inputs, camera upload, abnormal warning | MTR |
| `/ql/hoa-don`, `/ql/hoa-don/:id` | Hóa đơn: filters; record manual payment (method picker, confirm dialog with amount); reissue; remind; escalate payment issue | BIL-11, BIL-12 |
| `/ql/don-gia` | Đơn giá: current rates per building (tier ladder), history, propose change, proposal status | RATE |
| `/ql/yeu-cau` | Yêu cầu và sự cố: 3-column board (Chờ / Đang xử lý / Hoàn thành); approve/reject change requests; record cost | REQ |
| `/ql/xe` | Tra cứu xe: search by plate | CON-14 |
| `/ql/thong-bao` | Thông báo: send to building or room (Boss: all buildings); read counts | NOTI-02 |
| `/ql/bao-cao` | Báo cáo: monthly revenue bars + profit line; outstanding; occupancy; Boss: building comparison | RPT |
| `/ql/tai-khoan` | Tài khoản: password; public contact (phone, Zalo, Facebook) with preview | AUTH-09 |

### Boss only (5)

| Route | Page | Spec |
|---|---|---|
| `/ql/giao-dich` | Giao dịch ngân hàng: unmatched first; escalated payment issues; assign to invoice / mark refunded | BANK-05 |
| `/ql/duyet-gia` | Duyệt giá: pending room prices and rate plans, old → new, % change, approve/reject with note | PRC-03, RATE-01 |
| `/ql/nhan-su` | Nhân sự: create/deactivate managers, assign buildings (max 2) | AUTH-08, BLD-03 |
| `/ql/cai-dat` | Cài đặt: bank account, webhook toggle, contract template, email templates, default contact | settings |
| `/ql/nhat-ky` | Nhật ký thao tác | AUD-04 |

## UI rules

- **UI-01** All text Vietnamese. Money `Intl.NumberFormat('vi-VN')` + " đ"; dates `dd/mm/yyyy`. One shared formatter in `shared/`.
- **UI-02** Status is always text + color, never color alone. Use the labels defined in each module spec (contract 14, invoice 16, request 18, viewing 13, approval 12) from one shared map.
- **UI-03** Every list has 4 states: loading, empty (with the next action), error (with retry), data.
- **UI-04** Money actions (manual payment, reissue, assign transaction, settlement, approve price) show a confirm dialog stating the amount.
- **UI-05** Show API `error.message` to the user; map `error.fields` onto form fields.
- **UI-06** No business calculation in FE. Totals, estimates, settlement previews come from the API (`dryRun`).
- **UI-07** Tenant app, "Chốt chỉ số" and manual payment are designed for 360 px width first.
- **UI-08** Accessible: labels on every input, focus visible, buttons are `<button>`, images have `alt`.
- **UI-09** Server state via TanStack Query; invalidate the affected lists after every mutation. Forms via react-hook-form + zod mirroring BE validation.
- **UI-10** Uploads: request a signature from `POST /files/sign`, upload directly to Cloudinary, send only the resulting URL/public id to the API.
