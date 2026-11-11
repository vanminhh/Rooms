# Phase Extra · Home101 – sửa lại phần Phase 1, Phase 2 và UI đã làm

Nguồn: [home101-adoption-brief.md](../home101-adoption-brief.md) (`BRIEF-H101-01`) và câu trả lời của chủ dự án ngày 12/11/2026. Các quyết định đã ghi vào spec thành `D-23..D-34` ([00-overview.md](../spec/00-overview.md)); file này chỉ trỏ tới mã luật trong spec, không lặp lại nội dung.

**Phạm vi.** Phase Extra chỉ sửa những gì Phase 1, Phase 2 và đợt UI đã xây theo luật cũ. Phase 3 trở đi chưa làm nên chỉ sửa spec tại chỗ (mục "Không thuộc Phase Extra" bên dưới).

**Trạng thái:** kế hoạch chờ chủ dự án duyệt. Chưa có dòng code, schema hay dependency nào thay đổi.

## 1. Câu trả lời đã chốt

| Câu hỏi | Chủ dự án chọn | Quyết định |
|---|---|---|
| Q-H101-01 Mô hình | Giữ chuỗi hiện tại, 3 lối vào: Tìm phòng / Tôi đang thuê / Quản lý tòa nhà | D-23 |
| Q-H101-02 Màn chào | Lớp chào lần đầu trên `/`, ghi nhớ trên trình duyệt, có chọn lại, link phòng đi thẳng; có video + ảnh tĩnh dự phòng | D-24 |
| Q-H101-03 Đăng ký | Số điện thoại Việt Nam + mật khẩu, xác minh và khôi phục bằng SMS OTP | D-25 |
| Q-H101-04 Danh tính | Một tài khoản liên tục từ khách sang người thuê và sau khi rời đi | D-26 |
| Q-H101-05 Ngôn ngữ | Việt + Anh cho trang công khai, khu khách, khu người thuê; nhân sự và hợp đồng tiếng Việt; chỉ VND | D-27 |
| Q-H101-06 Đặt lịch | Xem phòng không cần đăng nhập; đặt lịch cần tài khoản đã xác minh; lịch cũ chỉ nhận sau khi xác minh số và bấm xác nhận | D-28 |
| Q-H101-07 Giờ hẹn | Giờ cụ thể, 30 phút, đệm 15 phút, trong 30 ngày | D-29 |
| Q-H101-08 Đổi / hủy | Gói A: khách hủy ngay trước giờ hẹn; đổi giờ cần bên kia đồng ý; đề xuất tự hết hạn; ghi vắng mặt, không phạt; ghi nhận qua điện thoại | D-30 |
| Q-H101-09 Điều phối | Quản lý tòa tự dẫn xem; bận thì tự hẹn lại giờ với khách. **Không** có tài khoản người dẫn xem riêng, **không** điều phối theo khu vực / kỹ năng / giờ rảnh | D-31 |
| Q-H101-10 Bộ lọc | Diện tích, số người, tầng, tiện ích tòa, ban công, cửa sổ, nuôi thú cưng, loại phòng. Không lọc theo nội thất | D-32 |
| Q-H101-11 Đánh giá | Không đánh giá buổi xem phòng. Chỉ đánh giá "dịch vụ tại nhà" – trong Rooms là việc sửa chữa sự cố (Phase 5) | D-33 |
| Q-H101-12 Thông báo | Trong tài khoản + email; nhắc trước 24 giờ và 2 giờ; không SMS / Zalo | D-34 |

## 2. Câu hỏi còn mở (chặn phần ghi ở cột cuối)

Còn mở: `Q-07`, `Q-08`, `Q-13` trong [00-overview.md](../spec/00-overview.md#open-questions-do-not-implement-until-answered).

| Mã | Cần chủ dự án trả lời | Đề xuất | Chặn |
|---|---|---|---|
| Q-07 | Nhà gửi SMS OTP nào, ai trả phí theo tin | Chọn một nhà gửi có brandname tại Việt Nam; trong lúc chờ, dev ghi mã ra log | EX-1 chạy thật (code vẫn làm được sau adapter) |
| Q-08 | File video nền của màn chào | Chủ dự án cung cấp; chưa có thì dùng ảnh tĩnh | Chỉ phần video của EX-4 |
| Q-13 | Xác nhận: chỉ đánh giá sửa chữa sự cố, theo giá trị ở A-17 | Đồng ý như A-17 | Phase 5 (không chặn Phase Extra) |

Đã trả lời ngày 12/11/2026 (chủ dự án chọn theo đề xuất), đã ghi vào spec:

| Mã | Câu trả lời | Luật |
|---|---|---|
| Q-09 | "Cho nuôi thú cưng" đặt theo phòng | ROOM-10 |
| Q-10 | Loại phòng: Studio · Có gác xép · 1 phòng ngủ · 2 phòng ngủ | ROOM-10 |
| Q-11 | Tiện ích tòa: Thang máy · Chỗ để xe · Bảo vệ · Camera · Máy giặt chung · Sân phơi · Khóa vân tay · Giờ giấc tự do | BLD-08 |
| Q-12 | Giờ bắt đầu từ 8:00 đến 19:30 mỗi ngày, bước 30 phút (buổi cuối kết thúc 20:00); không nhập ngày nghỉ, quản lý bận thì đề xuất giờ khác | VIEW-08 |

Giả định mới đã ghi trong spec, cần bạn xem: `A-03` (sửa), `A-11..A-17`.

## 3. Ma trận yêu cầu

| Mã brief | Luật spec | Phần | Phase gốc bị sửa |
|---|---|---|---|
| H101-ENTRY-01..04 | D-23, D-24, UI-11, SCOPE-05 | EX-4 | UI, Phase 1 (điều hướng) |
| H101-ACCOUNT-01, 02 | D-25, AUTH-06, 07, 10..15, SCOPE-03 | EX-1, EX-2 | Phase 1 |
| H101-ACCOUNT-03 | `/toi` trong [30-frontend.md](../spec/30-frontend.md), VIEW-20 | EX-2, EX-7 | Phase 1, 2 |
| H101-ACCOUNT-04 | D-26, CON-07, CON-12, A-16 | Spec Phase 3 | – (chưa làm) |
| H101-LOCALE-01, 02 | D-27, G-03, LOC-01..06, UI-01, UI-12, KIT-04, API-03 | EX-3 | Phase 1, 2, UI |
| H101-VIEW-01..06 | D-28..D-30, VIEW-01..23 | EX-6, EX-7 | Phase 2 |
| H101-DISPATCH-01..05 | D-31, VIEW-07, VIEW-16, VIEW-23: quản lý tòa dẫn xem, không trùng giờ. Phần khu vực / kỹ năng / nhận việc **không làm** | EX-6 | Phase 2 |
| H101-SEARCH-01, 02 | D-32, BLD-08, ROOM-10, PUB-06 | EX-5 | Phase 2 |
| H101-REVIEW-01, 02 | D-33, REQ-09, A-17 | Spec Phase 5 | – (chưa làm) |
| H101-NOTIFY-01 | D-34, NOTI-01, NOTI-08, NOTI-09, VIEW-22, AUD-01 | EX-8 | Phase 2 (kéo một phần hộp thư của Phase 5 lên) |

## 4. Quyền theo đối tượng

| Việc | Khách chưa đăng nhập | GUEST | TENANT | MANAGER (tòa của mình) | BOSS |
|---|---|---|---|---|---|
| Xem phòng, lọc, xem giờ còn đặt được | ✔ | ✔ | ✔ | ✔ | ✔ |
| Đăng ký, xác minh số | ✔ | – | xác minh số | – | – |
| Đặt lịch xem (cần số đã xác minh) | ✘ | ✔ | ✔ | thêm tay cho khách | thêm tay cho khách |
| Xem / đổi / hủy lịch của mình | ✘ | ✔ | ✔ | – | – |
| Nhận lịch cũ theo số đã xác minh | ✘ | ✔ | ✔ | – | – |
| Xác nhận, đề xuất giờ, ghi "Đã xem" / "Khách không đến", ghi nhận qua điện thoại | ✘ | ✘ | ✘ | ✔ | ✔ (mọi tòa) |
| Hợp đồng, hóa đơn, yêu cầu của mình | ✘ | ✘ (`FORBIDDEN`) | ✔ | – | – |
| Dữ liệu của người khác | ✘ | 404 | 404 | `OUT_OF_SCOPE` ngoài tòa | ✔ |

Chọn lối vào ở màn chào không thay đổi dòng nào trong bảng này (SCOPE-05).

## 5. Các phần và thứ tự

Mỗi phần là một checkpoint lớn: làm xong thì dừng, báo cáo, chủ dự án kiểm chứng và commit (quy trình trong `CLAUDE.md` gốc). Phần nào có đổi schema hoặc cài gói thì hỏi riêng trước bước đó.

| Phần | Việc | Sửa của | Cần xong trước | Đổi schema / gói |
|---|---|---|---|---|
| EX-0 | Chủ dự án: trả lời Q-07, đưa file video (Q-08), điền `SMS_*` vào `.env` | – | – | – |
| EX-1 | BE tài khoản khách: role `GUEST`, đăng ký, mã SMS (adapter + ghi log ở dev), xác minh số, quên mật khẩu bằng mã, `users.locale`, quyền `/me/*` | Phase 1 | – | migration `users`, `phone_otps`; gói SDK của nhà gửi SMS nếu cần |
| EX-2 | FE tài khoản khách: `/dang-ky`, `/xac-minh-so`, sửa `/dang-nhap` và `/quen-mat-khau`, `GuestLayout` + `/toi/tai-khoan`, route guard 4 vai trò | Phase 1 | EX-1 | – |
| EX-3 | Đa ngôn ngữ: từ điển Việt / Anh cho trang công khai, auth, khu khách; nút đổi ngôn ngữ trong kit; BE trả lỗi theo `Accept-Language` | Phase 1, 2, UI | EX-2 | có thể cần một gói i18n (planner đánh giá: tự viết từ điển nhỏ hay dùng gói) |
| EX-4 | Màn chào: lớp phủ 3 lựa chọn, ghi nhớ, "Chọn lại", video + ảnh tĩnh | UI | EX-3 (để có sẵn chữ hai ngôn ngữ) | – |
| EX-5 | Bộ lọc phòng: thuộc tính phòng, danh mục tiện ích, form nhân sự, `/public/rooms` + `/public/filters`, giao diện lọc ở `/phong` | Phase 2 | – | migration `rooms`, `buildings.amenities` |
| EX-6 | BE lịch xem: đặt lịch theo tài khoản, giờ cụ thể, đề xuất giờ, trạng thái `DONE` / `NO_SHOW`, hủy, chống trùng giờ, nhận lịch cũ, lịch sử; bỏ `POST /public/viewings` | Phase 2 | EX-1 | migration `viewings`, `viewing_proposals`, `viewing_events` |
| EX-7 | FE lịch xem: bảng đặt lịch ở `/phong/:id`, `/toi`, `/toi/lich-hen/:id`, trang `/ql/lich-hen` mới, thẻ "Việc hôm nay" | Phase 2 | EX-2, EX-6 | – |
| EX-8 | Thông báo lịch xem: hộp thư `/me/notifications` cho sự kiện lịch xem, `/toi/thong-bao`, email, job nhắc 24 giờ / 2 giờ | Phase 2 | EX-6, EX-7 | có thể sửa `notifications` |
| EX-9 | QA: kiểm tay theo mục 7, hồi quy Phase 1–2, kiểm DB, chốt Phase Extra | – | tất cả | – |

```
EX-0 ─┬─► EX-1 ─► EX-2 ─► EX-3 ─► EX-4 ───────────────┐
      │      └────────────► EX-6 ─► EX-7 ─► EX-8 ─────┼─► EX-9
      └─► EX-5 (độc lập, làm lúc nào cũng được) ──────┘
```

- **Phase 3 (Hợp đồng) chỉ cần EX-1 xong trước**, vì `CON-07` tìm và tái dùng tài khoản khách. Các phần còn lại của Phase Extra có thể làm trước hoặc xen kẽ với Phase 3; chủ dự án quyết định thứ tự.
- Khi bắt đầu một phần: planner viết `plans/EX-n/PLAN.md` trong thư mục này (kiến trúc, hợp đồng API, tên cột chính xác, checkpoint nhỏ, kịch bản test), sau đó mới tạo file task `feature_ex-n-*.md`. Hai loại file này chưa được tạo.

## 6. Dữ liệu cũ và chuyển đổi

| Dữ liệu | Xử lý | Luật |
|---|---|---|
| Tài khoản BOSS / MANAGER / TENANT đang có | Không đổi; `phone_verified_at` để trống, đăng nhập như cũ; muốn đặt lịch hoặc nhận lịch cũ thì xác minh số ở trang tài khoản | AUTH-12 |
| Lịch xem đã có (theo buổi, không có tài khoản) | Giữ nguyên ngày + buổi và nhãn cũ; không tự suy ra giờ cụ thể; chỉ có giờ khi hai bên thống nhất giờ mới | VIEW-08 |
| Lịch do nhân sự nhập tay | Không có chủ tài khoản cho tới khi khách xác minh đúng số và bấm nhận | VIEW-21 |
| Số điện thoại trùng khi đăng ký | Đã xác minh hoặc do nhân sự tạo → `PHONE_TAKEN`; tự đăng ký nhưng chưa từng xác minh → bị thay thế | AUTH-11 |
| Tài khoản bị khóa | Không tự mở lại ở bất kỳ bước nào | D-26, CON-07 |
| Tiện ích tòa đang là chữ tự do | Giữ để nhân sự xem; không tự chuyển sang danh mục; không dùng để lọc | BLD-08 |
| Phòng chưa có thuộc tính mới | "Chưa nhập"; không khớp bộ lọc của trường đó | ROOM-10, PUB-06 |
| Cache công khai 60 giây | Lịch riêng, tài khoản, thông báo chỉ nằm dưới `/me/*`, không bao giờ dưới `/public/*` | PUB-05 |
| Test và giới hạn chống spam của form công khai cũ | Xóa cùng `POST /public/viewings` ở EX-6 (hỏi trước khi xóa file) | VIEW-02, VIEW-11, VIEW-12 |

Mỗi migration: hỏi chủ dự án trước, chỉ thêm cột / bảng / giá trị enum (không xóa cột cũ trong Phase Extra), thêm kịch bản vào `check-constraints.mjs`. Quay lại bằng cách về commit trước; migration đã chạy vào DB thì phải viết migration ngược, nên mỗi phần chỉ một migration nhỏ.

## 7. Kiểm thử và nghiệm thu

- Mỗi luật nghiệp vụ có test mang mã của nó; giá trị mong đợi lấy từ spec. Danh sách ca nghiệm thu nằm ở mục "Acceptance" của [10-auth.md](../spec/10-auth.md), [11-buildings-rooms.md](../spec/11-buildings-rooms.md), [13-viewings.md](../spec/13-viewings.md), [14-contracts.md](../spec/14-contracts.md), [18-requests.md](../spec/18-requests.md).
- Ca đồng thời bắt buộc: hai lượt đặt cùng lúc vượt giới hạn ngày (VIEW-02), hai lượt chấp nhận trùng giờ một quản lý (VIEW-16), bấm đồng ý trên đề xuất đã cũ (VIEW-15).
- Hồi quy Rooms (mục 8 của brief): đăng nhập 3 vai trò cũ, giới hạn 2 tòa mỗi quản lý, Boss thay khi tòa không có quản lý, danh sách phòng công khai và điều kiện `ROOM-05`, UI kit và reduced-motion.
- Sau mỗi phần: lint + test của app đã sửa, `npm run build` frontend, e2e liên quan, kiểm DB khi schema đổi (lấy số kịch bản từ checker thực tế, hiện là 54).
- Màn chào có video: đo thời gian tải lần đầu trên máy thật và kiểm ảnh tĩnh khi video lỗi.

## 8. Không thuộc Phase Extra

| Việc | Ở đâu | Ghi chú |
|---|---|---|
| Tái dùng tài khoản khách khi ký hợp đồng; không khóa tài khoản đã có khi hủy | Spec Phase 3: `CON-07`, `CON-12`, `VIEW-05` | Đã sửa trong [14-contracts.md](../spec/14-contracts.md); làm cùng Phase 3 |
| Đánh giá sửa chữa sự cố | Spec Phase 5: `REQ-09` | Đã thêm vào [18-requests.md](../spec/18-requests.md); chờ Q-13 |
| Hộp thư cho hóa đơn, hợp đồng, thông báo của nhân sự | Phase 5 như cũ | EX-8 chỉ làm phần sự kiện lịch xem |
| Dịch khu người thuê `/thue` sang tiếng Anh | Cùng lúc xây các trang đó (Phase 3–5) | Hạ tầng dịch có từ EX-3 |
| Tài khoản người dẫn xem, điều phối theo khu vực / kỹ năng / giờ rảnh, kỹ thuật viên, đối tác ngoài | Không làm (D-31) | Muốn làm sau thì mở câu hỏi mới |
| Đánh giá buổi xem phòng, đánh giá công khai | Không làm (D-33) | |
| Ngoại tệ, SMS / Zalo thông báo, chủ nhà bên ngoài, bán dịch vụ, Premium | Không làm (D-23, D-27, D-34, mục 6 của brief) | |

## 9. Phần chủ dự án phải làm

- Trả lời Q-07, Q-08 và Q-13 (mục 2).
- Chọn và đăng ký nhà gửi SMS, điền `SMS_*` vào `.env` (không ai khác điền file này). Chi phí theo tin chưa có căn cứ trong repo.
- Cung cấp video nền của Rooms (và ảnh tĩnh nếu muốn khác ảnh trang chủ hiện tại).
- Duyệt chữ tiếng Anh của trang công khai trước khi lên production (KIT-13 áp dụng cho cả bản dịch khẩu hiệu).
