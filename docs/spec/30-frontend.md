# 30 · Frontend

App: `Source/frontend` (React 19 + Vite + TS). Every page is built from the official UI kit in `src/components/` ([31-ui-kit.md](31-ui-kit.md)): wrap pages in `.rooms-theme`, use `RoomsHeader`/`RoomsFooter` in layouts, `StatusBadge` for statuses, `formatMoney` for money.

## Apps and layouts

| App | Layout | Base route | Who |
|---|---|---|---|
| Công khai | `PublicLayout` – top menu: "Tìm phòng" → `/phong`, "Khu vực" → `/#khu-vuc`, "Liên hệ" → footer `#lien-he`, button "Lên lịch xem" → `/phong`, "Đăng nhập" (or "Trang của tôi" when logged in); 4-column footer with Boss contact (owner, 08/11/2026) | `/` | everyone |
| Khách có tài khoản | `GuestLayout` – mobile-first bottom nav: "Lịch hẹn", "Thông báo", "Tài khoản"; link "Tìm phòng" back to `/phong` (owner 12/11/2026, Phase Extra EX-2) | `/toi` | GUEST, TENANT |
| Người thuê | `TenantLayout` – mobile-first bottom nav, room switcher when the tenant has several contracts; link "Lịch hẹn xem phòng" to `/toi` | `/thue` | TENANT |
| Nhân sự | `StaffLayout` – side nav, building selector (Boss: all + "Tất cả tòa"; manager: own), Boss-only items | `/ql` | MANAGER, BOSS |

Route guard: not logged in → `/dang-nhap?next=...`; wrong role → own home (AUTH-06); `must_change_password` → `/doi-mat-khau`; phone not verified after sign-up → `/xac-minh-so` (AUTH-12).

The public, guest and tenant layouts have the language switch "Tiếng Việt / English" (LOC-03, UI-12).

> Changed 12/11/2026 (owner, D-23..D-34): the entry screen, sign-up, the guest area, the room filters, the booking panel and the staff viewing page below are built in Phase Extra; until then the pages work as Phase 1 and 2 left them.

## Pages (37)

### Public (9)

| Route | Page | Spec |
|---|---|---|
| `/` | Trang chủ (Stitch layout): hero with illustration photo and "Còn N phòng trống", 3 counts from `/public/locations`, search bar (district, price) → `/phong`; "Vì sao chọn ROOMS?"; featured public rooms; districts with counts (`#khu-vuc`, illustration photo per district when available); 3 steps; contact block leading to `/phong` (no separate quick-contact form). "Mô hình 3D" is hidden until after Phase 5. On the first visit the entry screen covers it (UI-11) | BLD, ROOM-05, KIT-12, KIT-13, UI-11 |
| `/phong` | Tìm phòng: filters district, ward, building, price range, and (D-32) area, max occupants, floor, building amenities, balcony, window, pets allowed, room type; options from `/public/filters`; every filter in the URL query so the link can be shared; "Xóa bộ lọc"; empty state "Không có phòng phù hợp" with the button to clear | ROOM-05, PUB-06 |
| `/toa/:id` | Chi tiết tòa: info, rates (electric tiers, water, services), contact, public rooms | BLD-04, RATE |
| `/phong/:id` | Chi tiết phòng: photos ("Chưa có ảnh" when none), price, furniture, min term 3 months, deposit (1 month), monthly estimate (ROOM-08), contact, viewing form with the 3 slots. Stitch layout: breadcrumb (Trang chủ › quận › tòa › phòng), room code + status, share button, gallery for 0 / 1 / 2–4 / ≥ 5 photos with a large-photo view, facts strip (area, max occupants, floor, furniture), booking panel (sticky on desktop): price, deposit, "Tối thiểu 3 tháng", date shortcuts "Hôm nay" / "Ngày mai" / "Chọn ngày khác", then the start times of that day from `/public/rooms/:id/viewing-times` (D-29; before: the 3 slots). Not logged in: the panel shows "Đăng nhập để đặt lịch" and comes back to this room after login or sign-up; phone not verified: "Xác minh số điện thoại để đặt lịch". After booking: link to `/toi/lich-hen/:id` | VIEW-01, VIEW-08, ROOM-07 |
| `/dang-nhap` | Đăng nhập: phone, password, "Ghi nhớ đăng nhập", "Quên mật khẩu?", note "Chưa có tài khoản? Đăng ký" → `/dang-ky` + Boss contact + link "Xem phòng trống". Layout of the owner's auth mockups (`Artifacts/layout_rooms/2026-10-26-stitch-mockups/2026-10-28-auth-layouts/ref/`): illustration photo + slogan on the left (hidden on narrow screens), form card on the right; the same frame for `/quen-mat-khau` and `/doi-mat-khau` | AUTH-01, AUTH-10 |
| `/dang-ky` | Đăng ký: full name, phone, password; then the code step. Same frame as `/dang-nhap`; link "Đã có tài khoản? Đăng nhập" | AUTH-11 |
| `/xac-minh-so` | Xác minh số điện thoại: 6-digit code, "Gửi lại mã" with a 60 s countdown, errors of AUTH-13; used after sign-up and from the account page | AUTH-12, AUTH-13 |
| `/quen-mat-khau` | Quên mật khẩu; with `?token=` from the email link it shows the new-password form; for a verified phone it asks for the SMS code and the new password | AUTH-07 |
| `/doi-mat-khau` | Đổi mật khẩu (forced on first login) | AUTH-05 |

### Guest (4, GUEST + TENANT)

| Route | Page | Spec |
|---|---|---|
| `/toi` | Lịch hẹn của tôi: viewings that wait for the guest's answer first, then upcoming, then past; each with room, time in effect, status, "Chờ bạn phản hồi" / "Chờ quản lý phản hồi"; card "Bạn có N lịch hẹn cũ theo số điện thoại này" → confirm to claim; empty state with "Tìm phòng" | VIEW-20, VIEW-21 |
| `/toi/lich-hen/:id` | Chi tiết lịch hẹn: room and building, time in effect, pending proposal with "Đồng ý" / "Từ chối" / "Đề xuất giờ khác", "Hủy lịch" (confirm dialog; hidden after the start time), contact of the person responsible, history | VIEW-14..20, VIEW-22 |
| `/toi/thong-bao` | Thông báo: inbox, unread dot, mark all read | NOTI-01, NOTI-08 |
| `/toi/tai-khoan` | Tài khoản: name, email, language, change password, verify phone (accounts created by staff) | AUTH-09, AUTH-12, AUTH-15 |

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
| `/ql` | Việc hôm nay: task groups with counts (NOTI-06), occupancy ring, collected vs outstanding bar; red card "Kỳ chưa có hóa đơn" lists each missed period (room, tenant, period dates) with the button "Tạo hóa đơn kỳ này" (confirm dialog, then opens "Chốt chỉ số"). Phase 2: only the cards "Lịch hẹn mới" and (Boss) "Giá chờ duyệt" | NOTI-06, BIL-21, RPT |
| `/ql/toa-nha`, `/ql/toa-nha/:id` | Tòa nhà: manager edits amenities/description; Boss creates, assigns manager, services, locks (confirm dialog: manager will be unassigned, N open viewings) | BLD, SVC |
| `/ql/phong` | Phòng: floor grid colored by derived status, "Hiện phòng đã khóa"; create/edit, photos; "Đề xuất giá", "Quá hạn" + "Đề xuất lại" | ROOM, PRC-01, PRC-07 |
| `/ql/lich-hen` | Lịch hẹn: by date and time; add manual; call/Zalo buttons; "Xác nhận" or "Đề xuất giờ khác" on a request; answer to the guest's proposal; "Ghi nhận qua điện thoại" (note required); "Đã xem" / "Khách không đến" after the start time; marks "Quá giờ, chưa xác nhận" and "Trùng giờ"; history; other status changes per VIEW-04; "Chốt" → contract form (from Phase 3) | VIEW |
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
| `/ql/duyet-gia` | Duyệt giá: pending room prices and rate plans, old → new, % change, approve/reject with note; expired ones apart, reject only | PRC-03, PRC-07, PRC-12, RATE-01 |
| `/ql/nhan-su` | Nhân sự: create (temporary password shown once), deactivate/reactivate managers, their buildings; buildings are assigned on `/ql/toa-nha/:id` (owner 01/11/2026) | AUTH-08, BLD-03 |
| `/ql/cai-dat` | Cài đặt: bank account, webhook toggle, contract template, email templates, default contact | settings |
| `/ql/nhat-ky` | Nhật ký thao tác | AUD-04 |

## UI rules

- **UI-01** Text is Vietnamese; the public, auth, guest and tenant pages also have English (LOC-01); the staff app is Vietnamese only. Money `Intl.NumberFormat('vi-VN')` + " đ" and dates `dd/mm/yyyy` in both languages (LOC-05). One shared formatter in `shared/`.
- **UI-02** Status is always text + color, never color alone. Use the labels defined in each module spec (contract 14, invoice 16, request 18, viewing 13, approval 12) from one shared map.
- **UI-03** Every list has 4 states: loading, empty (with the next action), error (with retry), data.
- **UI-04** Money actions (manual payment, reissue, assign transaction, settlement, approve price) show a confirm dialog stating the amount.
- **UI-05** Show API `error.message` to the user; map `error.fields` onto form fields.
- **UI-06** No business calculation in FE. Totals, estimates, settlement previews come from the API (`dryRun`).
- **UI-07** Tenant app, "Chốt chỉ số" and manual payment are designed for 360 px width first.
- **UI-08** Accessible: labels on every input, focus visible, buttons are `<button>`, images have `alt`.
- **UI-09** Server state via TanStack Query; invalidate the affected lists after every mutation. Forms via react-hook-form + zod mirroring BE validation.
- **UI-11** Entry screen (owner 12/11/2026, D-23, D-24; Phase Extra EX-4). On the first visit to `/` an overlay offers three choices: "Tìm phòng" → closes onto `/` (or `/phong`), "Tôi đang thuê" → `/thue` (login first if needed), "Quản lý tòa nhà" → `/ql` (login first if needed). The choice is remembered in the browser; the header has "Chọn lại" to open the overlay again. It appears only on `/`: a shared room link, `/dang-nhap`, and a link from a notification or an email open their page directly. A logged-in user who picks an area their role cannot use lands on their own home (AUTH-06); the choice grants nothing (SCOPE-05). Background: the Rooms video (Q-08) with a still image when the video is missing, fails or is slow, and with reduced-motion (KIT-05); the page stays usable by keyboard and touch and has no horizontal overflow at 360 px. Built from the kit only.
- **UI-12** Language (D-27; Phase Extra EX-3). All texts of the translated areas come from one dictionary per language; no text is hard-coded in a page. The switch changes the page at once, without reload and without losing form input. API errors arrive already in the chosen language (LOC-02). A missing English text shows the Vietnamese one (LOC-04).
- **UI-10** Uploads: request a signature from `POST /files/sign` and upload directly to Cloudinary. For room images, send only the Cloudinary response fields `assetId`, `publicId`, `version`, and `format` to the API (FILE-02); never send a delivery URL. Other upload purposes follow their module spec.
