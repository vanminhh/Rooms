# Phase Extra · Home101 – sửa lại phần Phase 1, Phase 2 và UI đã làm

Nguồn: [home101-adoption-brief.md](../home101-adoption-brief.md) (`BRIEF-H101-01`) và câu trả lời của chủ dự án ngày 12/11/2026. Các quyết định đã ghi vào spec thành `D-23..D-34` ([00-overview.md](../spec/00-overview.md)); file này chỉ trỏ tới mã luật trong spec, không lặp lại nội dung.

**Phạm vi.** Phase Extra chỉ sửa những gì Phase 1, Phase 2 và đợt UI đã xây theo luật cũ. Phase 3 trở đi chưa làm nên chỉ sửa spec tại chỗ (mục 8).

**Trạng thái:** đã chia thành 9 phần, mỗi phần một file task `feature_ex-*.md` (mục 5). Tiến trình thật: [PROGRESS.md](PROGRESS.md).

**Sửa đổi cùng ngày 12/11/2026.** Sau lượt trả lời đầu, chủ dự án đổi lại bốn điểm để không tốn phí SMS và để khách đặt được ngay: xác minh tài khoản bằng **email** (không SMS, không Zalo); khung giờ theo **từng giờ** chọn trên lịch; đặt xong là **giữ chỗ ngay**, quản lý gọi điện hoặc gửi email để xác nhận; **bỏ** đề xuất giờ hai chiều, hộp thư và nhắc lịch cho khách. Bảng dưới đây là bản cuối. Phần EX-1 đã làm theo bản đầu (mã SMS) nên có thêm ba task chuyển sang email.

## 1. Câu trả lời đã chốt

| Câu hỏi | Chủ dự án chọn (bản cuối) | Quyết định |
|---|---|---|
| Q-H101-01 Mô hình | Giữ chuỗi hiện tại, 3 lối vào: Tìm phòng / Tôi đang thuê / Quản lý tòa nhà | D-23 |
| Q-H101-02 Màn chào | Lớp chào lần đầu trên `/`, ghi nhớ trên trình duyệt, có chọn lại, link phòng đi thẳng; có video + ảnh tĩnh dự phòng | D-24 |
| Q-H101-03 Đăng ký | Họ tên, số điện thoại, **email**, mật khẩu; xác minh bằng mã 6 số gửi qua email; đăng nhập vẫn bằng số điện thoại; quên mật khẩu qua link email. Không SMS, không Zalo | D-25 |
| Q-H101-04 Danh tính | Một tài khoản liên tục từ khách sang người thuê và sau khi rời đi | D-26 |
| Q-H101-05 Ngôn ngữ | Việt + Anh cho trang công khai, khu khách, khu người thuê; nhân sự và hợp đồng tiếng Việt; chỉ VND | D-27 |
| Q-H101-06 Đặt lịch | Xem phòng không cần đăng nhập. GUEST đặt bằng email đã xác minh; TENANT cần email nhưng không cần xác minh (B, 15/11/2026). Lịch cũ và lịch nhân sự nhập tay không gắn vào tài khoản nào | D-28 |
| Q-H101-07 Giờ hẹn | Giờ tròn 8:00–19:00, cả tuần, tương lai đến ngày 30. Tối đa 3 khách khác số điện thoại/tòa/giờ, tính chung WEB/MANUAL; cùng khách thêm phòng cùng tòa không chiếm thêm chỗ. Khách hoặc người phụ trách không giữ hai tòa cùng giờ; một lịch mở/tài khoản/phòng; tối đa 3 lượt WEB/tài khoản/ngày | D-29 |
| Q-H101-08 Xác nhận / hủy | Đặt thành công giữ chỗ ngay và hiện liên hệ. Nhân sự xác nhận PHONE/EMAIL, được xác nhận muộn; không lưu phương thức/thời điểm xác nhận. Sau giờ bắt đầu, NEW/CONFIRMED → DONE hoặc CANCELLED; khách không đến dùng Hủy, không NO_SHOW. Khách tự hủy trước giờ; đổi giờ thống nhất qua điện thoại | D-30 |
| Q-H101-09 Điều phối | Quản lý tòa tự dẫn xem (Boss khi tòa không có quản lý). **Không** có tài khoản người dẫn xem riêng, **không** điều phối theo khu vực / kỹ năng / giờ rảnh | D-31 |
| Q-H101-10 Bộ lọc | Diện tích, số người, tầng, tiện ích tòa, ban công, cửa sổ, nuôi thú cưng, loại phòng. Không lọc theo nội thất | D-32 |
| Q-H101-11 Đánh giá | Không đánh giá buổi xem phòng. Chỉ đánh giá "dịch vụ tại nhà" – trong Rooms là việc sửa chữa sự cố (Phase 5) | D-33 |
| Q-H101-12 Thông báo | Chỉ hai email: email báo lịch mới gửi ngay cho quản lý tòa (Boss nhận khi tòa không có quản lý hoặc quản lý chưa có email); email xác nhận quản lý bấm gửi cho khách. Không hộp thư cho khách, không nhắc lịch, không SMS / Zalo | D-34 |

## 2. Câu hỏi còn mở (chặn phần ghi ở cột cuối)

Còn mở: `Q-08`, `Q-13` trong [00-overview.md](../spec/00-overview.md#open-questions-do-not-implement-until-answered).

| Mã | Cần chủ dự án trả lời | Đề xuất | Chặn |
|---|---|---|---|
| Q-08 | File video nền của màn chào | Chủ dự án cung cấp; chưa có thì dùng ảnh tĩnh | Chỉ phần video của EX-4 |
| Q-13 | Xác nhận: chỉ đánh giá sửa chữa sự cố, theo giá trị ở A-17 | Đồng ý như A-17 | Phase 5 (không chặn Phase Extra) |

Đã trả lời ngày 12/11/2026, đã ghi vào spec:

| Mã | Câu trả lời | Luật |
|---|---|---|
| Q-07 | Đóng: không dùng mã SMS hay Zalo nên không cần nhà gửi SMS | D-25 |
| Q-14 | Resend gửi thật khi đủ `MAIL_PROVIDER=resend`, `MAIL_API_KEY`, `MAIL_FROM`, kể cả development (chủ dự án chốt 15/11/2026). Thiếu cấu hình: development/test ghi log, production báo lỗi gửi. Chủ dự án tự điền `.env` | D-25, D-34 |
| Q-09 | "Cho nuôi thú cưng" đặt theo phòng | ROOM-10 |
| Q-10 | Loại phòng: Studio · Có gác xép · 1 phòng ngủ · 2 phòng ngủ | ROOM-10 |
| Q-11 | Tiện ích tòa: Thang máy · Chỗ để xe · Bảo vệ · Camera · Máy giặt chung · Sân phơi · Khóa vân tay · Giờ giấc tự do | BLD-08 |
| Q-12 | Giờ bắt đầu đúng giờ từ 8:00 đến 19:00 mỗi ngày (buổi cuối kết thúc 20:00); không nhập ngày nghỉ | VIEW-08 |

Giả định đã ghi trong spec, cần bạn xem: `A-03` (sửa), `A-11..A-18`. Riêng `A-18` (khi ký hợp đồng, nhân sự xác nhận tài khoản khách đúng là của người ký rồi mới dùng lại) là phương án tôi đề xuất, bạn chưa chọn.

Câu hỏi nhỏ phát sinh khi chia task (ghi trong file task của phần đó; trả lời trước khi agent tới task ghi trong ngoặc):

| Mã | Câu hỏi | Đề xuất |
|---|---|---|
| Q-EX4-1 (FE-EX-16) | Ảnh tĩnh của màn chào dùng ảnh nào? | Ảnh hero trang chủ hiện tại |
| Q-EX6-1 (BE-EX-19) | Một tài khoản có được giữ nhiều lịch đang mở cho cùng một phòng? | Không, mỗi phòng một lịch đang mở |
| Q-EX6-2 (BE-EX-23) | Tài khoản người thuê do nhân sự tạo có thể không có email: nút "Gửi email xác nhận" khi đó ẩn, quản lý chỉ xác nhận bằng gọi điện. Đồng ý? | Đồng ý |
| Q-EX8-2 (BE-EX-29) | Địa chỉ người gửi và tên hiển thị của thư? | "ROOMS" + địa chỉ `no-reply@` trên tên miền của bạn |

## 3. Ma trận yêu cầu

| Mã brief | Luật spec | Phần | Phase gốc bị sửa |
|---|---|---|---|
| H101-ENTRY-01..04 | D-23, D-24, UI-11, SCOPE-05 | EX-4 | UI, Phase 1 (điều hướng) |
| H101-ACCOUNT-01, 02 | D-25, AUTH-06, 07, 10..15, SCOPE-03 | EX-1, EX-2 | Phase 1 |
| H101-ACCOUNT-03 | `/toi` trong [30-frontend.md](../spec/30-frontend.md), VIEW-20 | EX-2, EX-7 | Phase 1, 2 |
| H101-ACCOUNT-04 | D-26, CON-07, CON-12, A-16, A-18 | Spec Phase 3 | – (chưa làm) |
| H101-LOCALE-01, 02 | D-27, G-03, LOC-01..06, UI-01, UI-12, KIT-04, API-03 | EX-3 | Phase 1, 2, UI |
| H101-VIEW-01..06 | D-28..D-30, VIEW-01..22. Phần đề xuất giờ hai chiều trên web **không làm**: thống nhất qua điện thoại | EX-6, EX-7 | Phase 2 |
| H101-DISPATCH-01..05 | D-31, VIEW-07, VIEW-16, VIEW-22: quản lý tòa dẫn xem, mỗi giờ một lịch. Phần khu vực / kỹ năng / nhận việc **không làm** | EX-6 | Phase 2 |
| H101-SEARCH-01, 02 | D-32, BLD-08, ROOM-10, PUB-06 | EX-5 | Phase 2 |
| H101-REVIEW-01, 02 | D-33, REQ-09, A-17 | Spec Phase 5 | – (chưa làm) |
| H101-NOTIFY-01 | D-34, VIEW-15, VIEW-19, NOTI-08. Hộp thư và nhắc lịch cho khách **không làm** | EX-6, EX-8 | Phase 2 |

## 4. Quyền theo đối tượng

| Việc | Khách chưa đăng nhập | GUEST | TENANT | MANAGER (tòa của mình) | BOSS |
|---|---|---|---|---|---|
| Xem phòng, lọc, xem giờ còn trống | ✔ | ✔ | ✔ | ✔ | ✔ |
| Đăng ký, xác minh email | ✔ | – | – | – | – |
| Đặt lịch xem | ✘ (phải đăng nhập) | ✔ | ✔ | thêm tay cho khách | thêm tay cho khách |
| Xem và hủy lịch của mình | ✘ | ✔ | ✔ | – | – |
| Xác nhận (gọi điện hoặc gửi email), sửa giờ, ghi "Đã xem" / "Khách không đến" | ✘ | ✘ | ✘ | ✔ | ✔ (mọi tòa) |
| Hợp đồng, hóa đơn, yêu cầu của mình | ✘ | ✘ (`FORBIDDEN`) | ✔ | – | – |
| Dữ liệu của người khác | ✘ | 404 | 404 | `OUT_OF_SCOPE` ngoài tòa | ✔ |

Chọn lối vào ở màn chào không thay đổi dòng nào trong bảng này (SCOPE-05).

## 5. Các phần và thứ tự

Mỗi phần có các điểm dừng ⏸: làm tới đó thì dừng, báo cáo, chủ dự án kiểm chứng và commit (quy trình trong `CLAUDE.md` gốc). Phần nào có đổi schema, xóa file hoặc cài gói thì hỏi riêng trước bước đó.

| Phần | Việc | Sửa của | Cần xong trước | Đổi schema / gói |
|---|---|---|---|---|
| EX-0 | Chủ dự án: tạo tài khoản Resend, xác thực tên miền gửi, điền `MAIL_*` (Q-14); đưa file video (Q-08) | – | – | – |
| EX-1 | BE tài khoản khách: role `GUEST`, đăng ký có email, mã xác minh qua email, quên mật khẩu qua link email, `users.locale`, quyền `/me/*` | Phase 1 | – | thêm một migration cho xác minh email (migration `guest_accounts` đã chạy vào DB dev); xóa module `sms` |
| EX-2 | FE tài khoản khách: `/dang-ky`, `/xac-minh-email`, sửa `/dang-nhap`, `GuestLayout` + `/toi/tai-khoan`, route guard 4 vai trò | Phase 1 | EX-1 | – |
| EX-3 | Đa ngôn ngữ: từ điển Việt / Anh cho trang công khai, auth, khu khách; nút đổi ngôn ngữ trong kit; BE trả lỗi theo `Accept-Language` | Phase 1, 2, UI | EX-2 | có thể cần một gói i18n (planner đánh giá) |
| EX-4 | Màn chào: lớp phủ 3 lựa chọn, ghi nhớ, "Chọn lại", video + ảnh tĩnh | UI | EX-3 | – |
| EX-5 | Bộ lọc phòng: thuộc tính phòng, danh mục tiện ích, form nhân sự, `/public/rooms` + `/public/filters`, giao diện lọc ở `/phong` | Phase 2 | – | migration `rooms` |
| EX-6 | BE lịch xem: đặt theo tài khoản, giờ theo từng giờ, tối đa 3 khách/tòa/giờ và không trùng hai tòa cho khách/người phụ trách, giờ còn trống, xác nhận bằng gọi điện hoặc email không lưu cách/thời điểm, `DONE` hoặc hủy, email báo lịch mới; bỏ `POST /public/viewings` | Phase 2 | EX-1 | migration `viewings` |
| EX-7 | FE lịch xem: lịch chọn ngày giờ ở `/phong/:id`, màn hình đặt thành công, `/toi`, `/toi/lich-hen/:id`, trang `/ql/lich-hen` mới, thẻ "Việc hôm nay" | Phase 2 | EX-2, EX-6 | – |
| EX-8 | Gửi email thật: nối dịch vụ gửi email, mẫu thư (mã xác minh, lịch mới, xác nhận lịch) | Phase 1, 2 | EX-6, tài khoản Resend của chủ dự án | không cần gói mới nếu gọi thẳng API HTTPS của Resend |
| EX-9 | QA: kiểm tay, hồi quy Phase 1–2, kiểm DB, chốt Phase Extra | – | tất cả | – |

```
EX-0 ─┬─► EX-1 ─► EX-2 ─► EX-3 ─► EX-4 ───────────────┐
      │      └────────────► EX-6 ─► EX-7 ─► EX-8 ─────┼─► EX-9
      └─► EX-5 (độc lập, làm lúc nào cũng được) ──────┘
```

- **Phase 3 (Hợp đồng) chỉ cần EX-1 xong trước**, vì `CON-07` tìm và tái dùng tài khoản khách. Các phần còn lại có thể làm trước hoặc xen kẽ với Phase 3; chủ dự án quyết định thứ tự.
- **EX-6 và EX-7 phải lên production cùng nhau**: EX-6 gỡ API của form đặt lịch cũ, EX-7 mới thay giao diện.

### File task của từng phần

| Phần | File task | Mã task | Số điểm dừng ⏸ | Planner | Reviewer |
|---|---|---|---|---|---|
| EX-1 | [feature_ex-1-backend-guest-accounts.md](feature_ex-1-backend-guest-accounts.md) | BE-EX-01..09, BE-EX-33..35 | 4 | có (đã viết, cần cập nhật) | có |
| EX-2 | [feature_ex-2-frontend-guest-accounts.md](feature_ex-2-frontend-guest-accounts.md) | FE-EX-01..07 | 2 | không | không |
| EX-3 | [feature_ex-3-languages.md](feature_ex-3-languages.md) | FE-EX-08..13, BE-EX-10..11 | 4 | có | không |
| EX-4 | [feature_ex-4-entry-screen.md](feature_ex-4-entry-screen.md) | FE-EX-14..17 | 2 | không | không |
| EX-5 | [feature_ex-5-room-filters.md](feature_ex-5-room-filters.md) | BE-EX-12..16, FE-EX-18..21 | 3 | có | có |
| EX-6 | [feature_ex-6-backend-viewings.md](feature_ex-6-backend-viewings.md) | BE-EX-17..24 | 3 | có | có |
| EX-7 | [feature_ex-7-frontend-viewings.md](feature_ex-7-frontend-viewings.md) | FE-EX-22..27 | 2 | có | không |
| EX-8 | [feature_ex-8-viewing-notifications.md](feature_ex-8-viewing-notifications.md) (giữ tên file cũ; nội dung nay là gửi email thật) | BE-EX-28..30 | 2 | không | không |
| EX-9 | [feature_ex-9-qa.md](feature_ex-9-qa.md) | QA-EX-01..06 | làm cùng chủ dự án | – | – |

Mã không còn dùng sau lần sửa đổi (đề xuất giờ, hộp thư, nhắc lịch bị bỏ): `BE-EX-25..27`, `BE-EX-31..32`, `FE-EX-28..30`. Không dùng lại các mã này.

Mỗi file tự đủ để một agent bắt đầu: danh sách phải đọc trước, phạm vi trong / ngoài, task theo thứ tự kèm "Done when", các điểm dừng ⏸, câu hỏi cho chủ dự án, nhật ký lỗi. Khi phần ghi "Planner: có", agent chạy planner viết `plans/EX-n/PLAN.md` trong thư mục này trước khi code.

### Tiến trình và bài học

- [PROGRESS.md](PROGRESS.md): bảng tổng 10 phần và nhật ký theo điểm dừng ⏸. Agent cập nhật trước mỗi lần báo cáo; người hoặc agent mới đọc file này để biết đang ở đâu.
- [../LESSONS.md](../LESSONS.md): lỗi đã từng mắc trong dự án, mỗi lỗi một dòng kèm quy tắc tránh. Agent đọc trước task đầu tiên và thêm dòng mới khi một lỗi làm tốn một vòng sửa.

### Cách giao cho agent

Câu lệnh mẫu, thay `EX-n` và tên file:

> Làm phần EX-1 của Phase Extra theo `docs/phase-extra-home101/feature_ex-1-backend-guest-accounts.md`. Đọc hết mục "Before you start" trước, làm task theo thứ tự, dừng ở mỗi điểm ⏸ để báo cáo và chờ tôi commit.

Quy tắc chạy:

- **Thứ tự an toàn nhất, một agent một lúc:** EX-1 → EX-2 → EX-5 → EX-3 → EX-4 → EX-6 → EX-7 → EX-8 → EX-9.
- **Chạy hai agent cùng lúc** chỉ khi hai phần không sửa chung file và không cùng có migration. Cặp được phép: EX-6 (backend) cùng lúc với EX-3 rồi EX-4 (frontend), sau khi EX-2 đã commit. Hai agent dùng chung một thư mục làm việc thì mỗi agent chỉ báo cáo file của phần mình, và bạn commit riêng từng phần.
- **Không chạy cùng lúc:** hai phần có migration (EX-1, EX-5, EX-6 – migration phải nối tiếp nhau); EX-3 với EX-5 hoặc EX-7 (cùng sửa các trang công khai); EX-5 với bất kỳ phần nào khác (nó sửa cả backend lẫn frontend).
- Mỗi agent bắt đầu bằng `git status` sạch (quy trình trong `CLAUDE.md` gốc); nếu còn thay đổi của phần khác chưa commit thì agent dừng và hỏi.

## 6. Dữ liệu cũ và chuyển đổi

| Dữ liệu | Xử lý | Luật |
|---|---|---|
| Tài khoản BOSS / MANAGER / TENANT đang có | Không đổi; không cần xác minh email, đăng nhập như cũ | AUTH-12 |
| Lịch xem đã có (theo buổi, không có tài khoản) | Giữ nguyên ngày + buổi và nhãn cũ; không tự suy ra giờ; không giữ chỗ khung giờ nào; có giờ cụ thể khi nhân sự đặt giờ | VIEW-08, VIEW-16 |
| Lịch do nhân sự nhập tay | Không thuộc tài khoản nào, không gửi email | VIEW-03 |
| Số điện thoại hoặc email trùng khi đăng ký | Của tài khoản đã xác minh hoặc do nhân sự tạo → `PHONE_TAKEN` / `EMAIL_TAKEN`; của tài khoản tự đăng ký chưa từng xác minh → bị thay thế | AUTH-11 |
| Tài khoản bị khóa | Không tự mở lại ở bất kỳ bước nào | D-26, CON-07 |
| Tiện ích tòa đang là chữ tự do | Giữ để nhân sự xem; không tự chuyển sang danh mục; không dùng để lọc | BLD-08 |
| Phòng chưa có thuộc tính mới | "Chưa nhập"; không khớp bộ lọc của trường đó | ROOM-10, PUB-06 |
| Cache công khai 60 giây | Lịch riêng và tài khoản chỉ nằm dưới `/me/*`; giờ còn trống là dữ liệu công khai, có thể cũ tối đa 60 giây, lúc đặt hệ thống kiểm lại | PUB-05, VIEW-16, VIEW-21 |
| Test và giới hạn chống spam của form công khai cũ | Xóa cùng `POST /public/viewings` ở EX-6 (hỏi trước khi xóa file) | VIEW-02, VIEW-11, VIEW-12 |
| Migration `guest_accounts` và code mã SMS của EX-1 | Migration đã chạy vào DB dev nên không sửa lại; thêm một migration mới cho `email_verified_at` và bảng mã theo email. Module `sms` bị xóa sau khi chủ dự án đồng ý | BE-EX-33..35 |

Mỗi migration: hỏi chủ dự án trước, chỉ thêm cột / bảng / giá trị enum, thêm kịch bản vào `check-constraints.mjs`. Quay lại bằng cách về commit trước; migration đã chạy vào DB thì phải viết migration ngược, nên mỗi phần chỉ một migration nhỏ.

## 7. Kiểm thử và nghiệm thu

- Mỗi luật nghiệp vụ có test mang mã của nó; giá trị mong đợi lấy từ spec. Danh sách ca nghiệm thu nằm ở mục "Acceptance" của [10-auth.md](../spec/10-auth.md), [11-buildings-rooms.md](../spec/11-buildings-rooms.md), [13-viewings.md](../spec/13-viewings.md), [14-contracts.md](../spec/14-contracts.md), [18-requests.md](../spec/18-requests.md).
- Ca đồng thời bắt buộc: hai lượt đặt cùng lúc vượt giới hạn ngày (VIEW-02), hai khách đặt cùng một giờ của cùng một quản lý (VIEW-16).
- Hồi quy Rooms (mục 8 của brief): đăng nhập 3 vai trò cũ, giới hạn 2 tòa mỗi quản lý, Boss thay khi tòa không có quản lý, danh sách phòng công khai và điều kiện `ROOM-05`, UI kit và reduced-motion.
- Sau mỗi phần: lint + test của app đã sửa, `npm run build` frontend, e2e liên quan, kiểm DB khi schema đổi (lấy số kịch bản từ checker thực tế).
- Màn chào có video: đo thời gian tải lần đầu trên máy thật và kiểm ảnh tĩnh khi video lỗi.

## 8. Không thuộc Phase Extra

| Việc | Ở đâu | Ghi chú |
|---|---|---|
| Tái dùng tài khoản khách khi ký hợp đồng; không khóa tài khoản đã có khi hủy | Spec Phase 3: `CON-07`, `CON-12`, `VIEW-05` | Đã sửa trong [14-contracts.md](../spec/14-contracts.md); làm cùng Phase 3 |
| Đánh giá sửa chữa sự cố | Spec Phase 5: `REQ-09` | Đã thêm vào [18-requests.md](../spec/18-requests.md); chờ Q-13 |
| Hộp thư thông báo của người thuê, thông báo của nhân sự | Phase 5 như cũ | |
| Dịch khu người thuê `/thue` sang tiếng Anh | Cùng lúc xây các trang đó (Phase 3–5) | Hạ tầng dịch có từ EX-3 |
| Mã xác minh qua SMS hoặc Zalo; xác minh số điện thoại bằng hệ thống | Không làm (D-25) | Số điện thoại do quản lý gọi xác nhận |
| Đề xuất và phản hồi giờ trên web; hộp thư và nhắc lịch cho khách; nhận lịch cũ theo số điện thoại | Không làm (D-28, D-30, D-34) | |
| Nhân sự khóa tài khoản khách hoặc đặt lại mật khẩu cho khách | Không làm | Khách tự khôi phục qua email |
| Tài khoản người dẫn xem, điều phối theo khu vực / kỹ năng / giờ rảnh, kỹ thuật viên, đối tác ngoài | Không làm (D-31) | |
| Đánh giá buổi xem phòng, đánh giá công khai | Không làm (D-33) | |
| Ngoại tệ, chủ nhà bên ngoài, bán dịch vụ, Premium | Không làm (D-23, D-27, mục 6 của brief) | |

## 9. Phần chủ dự án phải làm

- Trả lời Q-08, Q-13 và bốn câu Q-EX (mục 2).
- Tạo tài khoản Resend, xác thực tên miền gửi (thêm các bản ghi DNS Resend yêu cầu), tạo khóa API và điền `MAIL_*` vào `.env` (không ai khác điền file này). Gói miễn phí có giới hạn số thư mỗi ngày: mỗi lượt đăng ký và mỗi lượt đặt lịch đều tốn một thư, nên xem giới hạn hiện hành trên trang giá của Resend trước khi lên production.
- Bảo các quản lý điền email trong trang tài khoản của họ; quản lý chưa có email thì thư báo lịch mới sẽ về Boss.
- Cung cấp video nền của Rooms (và ảnh tĩnh nếu muốn khác ảnh trang chủ hiện tại).
- Duyệt chữ tiếng Anh của trang công khai trước khi lên production (KIT-13 áp dụng cho cả bản dịch khẩu hiệu).
