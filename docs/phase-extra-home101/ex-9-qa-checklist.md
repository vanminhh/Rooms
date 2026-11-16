# EX-9 — Hồ sơ nghiệm thu Phase Extra

**Đã đóng theo xác nhận chủ dự án ngày 16/11/2026.** Mã nguồn được nghiệm thu hiện ở commit `c5adfde`; git sạch trước lượt cập nhật hồ sơ này.

Chủ dự án xác nhận: “mấy phần 6,7,8,9, kia đã nghiệm thu là ok nhé” và “kiểm lại lỗi SĐT, popup thành công và cảnh báo trùng giờ; mấy cái này cũng ok nhé”. Đây là nghiệm thu ở mức phần/phase. Bảng dưới tổng hợp lại các tiêu chí đã có trong spec và checklist FE-EX-27; không phải một lượt test mới hoặc nhật ký từng ca do agent thực hiện.

**NT** = nằm trong phạm vi chủ dự án đã nghiệm thu. Không bổ sung tài khoản, thời điểm, screenshot hoặc số lần chạy chưa được cung cấp. **Ngoài phạm vi** = chức năng chưa thuộc Phase Extra, không đánh dấu đã kiểm. Mọi thao tác mô tả dưới đây là cách đối chiếu tiêu chí; không yêu cầu chạy lại sau khi đã nghiệm thu.

## Bằng chứng tự động giữ nguyên

| Bằng chứng | Kết quả đã có | Phạm vi |
|---|---|---|
| Backend trên host, 16/11 | 1806/1806, 89 file; lint 0 lỗi, build OK | Trước thay đổi guest-overlap B |
| E2E DB dev trên host, 16/11 | 54/54, 7 file; viewings 11/11 | Trước thay đổi guest-overlap B; cleanup lượt đó không còn bản ghi |
| Backend offline sau B | 169/169, 10 file; lint 0 lỗi/4 cảnh báo cũ, build OK | Có test warning/ack/hard limits; không thay cho log HTTP/e2e mới |
| Frontend sau B và sửa SĐT | 864/864, 0 fail/skip; 157260.7201 ms; lint sạch, build OK | Bản source hiện được nghiệm thu |
| DB checker gần nhất | 82/82 ngày 15/11; migration replay 3 PASS | Bằng chứng schema đã ghi trong PROGRESS, không chạy lại ở lượt đóng phase |

Xác nhận nghiệm thu EX-6/EX-9 của chủ dự án đóng các gate còn mở. Không có output HTTP/e2e mới được gửi kèm lời xác nhận, nên không tạo thêm số liệu hoặc đổi nhãn kết quả cũ thành kết quả của luật B. Hai Vitest config giữ `MAIL_PROVIDER: ''`. Lượt cập nhật này chỉ sửa tài liệu, không chạy HTTP/e2e, ứng dụng, migration, seed, cleanup DB hoặc gửi email.

## Tiêu chí từ spec

### AUTH — [10-auth.md](../spec/10-auth.md)

| ID | Cách đối chiếu | Kỳ vọng từ spec | Trạng thái |
|---|---|---|---|
| AUTH-01 | Đăng nhập lần lượt GUEST, TENANT, MANAGER, BOSS. | Each of the 4 roles logs in and lands on its home route. | NT |
| AUTH-02 | Đăng ký khách; thử đăng nhập trước và sau xác minh mã email. | A visitor signs up, cannot log in before the email code (`EMAIL_NOT_VERIFIED`), and is logged in right after it (AUTH-11, AUTH-12). | NT |
| AUTH-03 | Thử đăng ký bằng SĐT/email đã xác minh, tài khoản nhân sự và khách chưa xác minh. | Signing up with a verified account's phone, a manager's phone or a tenant's phone returns `PHONE_TAKEN`; with another verified account's email `EMAIL_TAKEN`; with a never-verified self-registered phone or email it replaces that account (AUTH-11). | NT |
| AUTH-04 | Dùng các fixture mã sai/hết hạn/đã dùng, vượt hạn mức và mailer lỗi. | The 6th wrong code, an expired code and a used code all return `OTP_INVALID`; the 6th code to one address in a day returns 429; a failing mailer at sign-up returns `MAIL_UNAVAILABLE` (AUTH-13). | NT |
| AUTH-05 | Khách mở lịch của tài khoản khác; quyền hợp đồng chuyển cùng module Phase 3. | A GUEST gets `FORBIDDEN` on `/me/contracts` and 404 on another guest's viewing (SCOPE-03). | NT |
| AUTH-06 | GUEST đổi/xóa email tài khoản; đối chiếu TENANT đổi email. | A GUEST sending `email` (a new address or null) to `PATCH /auth/me` gets `FORBIDDEN` and keeps the verified address; a tenant still changes theirs (AUTH-09). | NT |
| AUTH-07 | Chọn English và thử lỗi đăng nhập; đối chiếu màn nhân sự. | With `Accept-Language: en`, `/auth/login` with a wrong password answers in English; a staff route answers in Vietnamese (LOC-02). | NT |
| AUTH-08 | Đăng nhập tài khoản phải đổi mật khẩu; thử đi tiếp trước khi đổi. | A new tenant is forced to `/doi-mat-khau` and no other API works until changed. | NT |
| AUTH-09 | Quản lý mở/sửa phòng ngoài tòa được giao; module hợp đồng/hóa đơn/yêu cầu kiểm ở phase tương ứng. | Manager A gets `OUT_OF_SCOPE` for any id in manager B's building (rooms, contracts, invoices, requests). | NT |
| AUTH-10 | Đối chiếu quyền hóa đơn khi module hóa đơn được triển khai. | Tenant X gets 404 for tenant Y's invoice id. | Ngoài phạm vi — module tương ứng |
| AUTH-11 | Dùng phiên của quản lý đã bị vô hiệu hóa và thử refresh. | Deactivated manager's refresh token stops working immediately. | NT |
| AUTH-12 | Tạo quản lý thử qua UI/API đã có; kiểm hiển thị mật khẩu tạm và bắt đổi lần đầu. | A new manager's temporary password is in the create response only; the manager is forced to `/doi-mat-khau` on first login. | NT |
| AUTH-13 | Vô hiệu hóa rồi kích hoạt lại quản lý thử, đối chiếu liên hệ tòa. | Deactivating a manager keeps `manager_id`; their building shows Boss's contact; reactivating restores theirs. | NT |

### ROOM — [11-buildings-rooms.md](../spec/11-buildings-rooms.md)

| ID | Cách đối chiếu | Kỳ vọng từ spec | Trạng thái |
|---|---|---|---|
| ROOM-01 | Mở danh sách công khai với phòng chưa nhập giá. | A room with `price = null` never appears in `/public/rooms`. | NT |
| ROOM-02 | Kiểm giữ phòng bằng hợp đồng HOLD khi triển khai Phase 3. | Creating a HOLD contract removes the room from public lists in the same transaction. | Ngoài phạm vi — module tương ứng |
| ROOM-03 | Quản lý thử thay mã, địa chỉ hoặc phân công của tòa. | Manager cannot change a building's `code`, `address` or `manager_id` (403). | NT |
| ROOM-04 | Xem liên hệ công khai của tòa có quản lý bị vô hiệu hóa. | Building with manager deactivated shows Boss's contact publicly. | NT |
| ROOM-05 | Đối chiếu tòa thiếu giá điện hoặc nước hiệu lực với danh sách phòng công khai. | A building without an ELECTRIC or WATER rate in effect has no public rooms (ROOM-05). | NT |
| ROOM-06 | Khóa tòa thử; kiểm manager_id và khả năng phân công tòa khác. | Locking a building sets `manager_id = null`; that manager can then be assigned another building (BLD-06). | NT |
| ROOM-07 | Thử quyền chữ ký upload ngoài tòa và publicId ngoài thư mục phòng. | A manager cannot get an upload signature for a room in another building (FILE-01); a `publicId` outside the room's folder is rejected (FILE-02). | NT |
| ROOM-08 | Tính tay ước tính tháng cho hai kiểu giá nước và đối chiếu UI. | `monthlyEstimate` for a PER_M3 and a PER_PERSON building matches ROOM-08 by hand. | NT |
| ROOM-09 | Kết hợp ban công/diện tích, dữ liệu chưa nhập và phân trang. | `/public/rooms?balcony=true&minArea=25` returns only public rooms with a balcony and ≥ 25 m²; a room with "chưa nhập" balcony is not returned; `meta.total` counts after filtering (PUB-06). | NT |
| ROOM-10 | Kết hợp bộ lọc với phòng không công khai; thử mã tiện ích không hợp lệ. | A filter never returns a non-public room, and an unknown amenity code returns `VALIDATION_FAILED` (PUB-06, ROOM-05). | NT |
| ROOM-11 | Mở/sửa tòa còn tiện ích tự do cũ; đối chiếu bộ lọc. | A building's old free-text amenities are still shown to staff and are not used by the filter (BLD-08). | NT |

### VIEW — [13-viewings.md](../spec/13-viewings.md)

| ID | Cách đối chiếu | Kỳ vọng từ spec | Trạng thái |
|---|---|---|---|
| VIEW-01 | Thử TENANT có email chưa xác minh, thiếu email; đối chiếu GUEST chưa xác minh. | A TENANT with an unverified email may book; without email, booking returns fields.email and creates no viewing. GUEST still requires verified email (VIEW-01, owner option B). | NT |
| VIEW-02 | Thử đặt phòng không công khai và đặt khi chưa đăng nhập. | Booking for a non-public room returns `ROOM_NOT_AVAILABLE`; booking without login is refused (VIEW-01). | NT |
| VIEW-03 | Đối chiếu giới hạn lượt WEB trong ngày, kể cả hai yêu cầu đồng thời ở lượt cuối. | The 4th booking of one account in a day returns 429; two parallel bookings of an account that already has 2 today save only one (VIEW-02). | NT |
| VIEW-04 | Kiểm hủy lịch khác cùng phòng khi tạo HOLD ở Phase 3. | Creating a HOLD contract from viewing A cancels viewing B of the same room (VIEW-06). | Ngoài phạm vi — module tương ứng |
| VIEW-05 | Chọn các giờ biên 07/08/19/20, phút 30, quá khứ và quá 30 ngày. | A start time in the past, more than 30 days ahead, at 7:00, at 20:00 or at 10:30 is rejected with `fields.visitAt`; 8:00 and 19:00 are accepted (VIEW-08). | NT |
| VIEW-06 | Thử chuyển trạng thái trước/sau giờ, lý do hủy/LOST và cấm PATCH WON. | PATCH cannot set WON. NEW/CONFIRMED → DONE before start returns CONFLICT_STATE; after start either may become DONE directly. NEW/CONFIRMED → LOST is refused; DONE → LOST requires outcome_note. Staff cancellation requires a note (VIEW-04). | NT |
| VIEW-07 | Hai khách tranh chỗ thứ ba; khách thứ tư; cùng SĐT thêm phòng cùng tòa. | Two guests simultaneously request the last place of a building/hour already holding 2 distinct phones: one succeeds, the other gets VIEWING_TIME_TAKEN. A fourth distinct guest is refused; a second room for an existing phone is allowed without increasing the count (VIEW-16). | NT |
| VIEW-08 | Đối chiếu giờ rảnh sau 1/2/3 khách và giữa các tòa cùng/khác người phụ trách. | With 1 or 2 distinct guests, the hour stays publicly available in that building; at 3 it disappears. Another building of the same responsible person is unavailable as soon as the first building has an open viewing; an unrelated manager/building remains available (VIEW-16, VIEW-21). | NT |
| VIEW-09 | Đặt WEB với quản lý có email/không có email; mô phỏng mailer lỗi. | A booking sends exactly one email, to the building's manager; to Boss when the building has no active manager or the manager has no email; a failing mailer still saves the booking (VIEW-19). | NT |
| VIEW-10 | Xác nhận PHONE/EMAIL trước và sau giờ; kiểm thất bại email. | PHONE confirmation sets CONFIRMED; EMAIL sends the email then sets CONFIRMED, or stays NEW on failure. Both allow late confirmation, set handled_by_id, and save no method/timestamp (VIEW-15). | NT |
| VIEW-11 | Khách hủy trước/đúng giờ; nhân sự hủy có note; hủy phòng cuối cùng của một SĐT. | Guest cancellation one minute before start succeeds and clears handled_by_id, including after staff confirmation; at/after start it is refused. Staff cancellation records their id. With multiple rooms for one phone, only closing the last open row releases that guest's place (VIEW-18). | NT |
| VIEW-12 | Khách mở ID lịch của người khác; kiểm response giờ rảnh không chứa thông tin khách. | Guest X gets 404 for guest Y's viewing; `viewing-times` contains no name, phone or email (VIEW-20, VIEW-21). | NT |
| VIEW-13 | Xem lịch cũ theo buổi, xác nhận/hủy rồi đổi sang giờ cụ thể. | A viewing made before the change still shows "Chiều (14:00–17:00)", can be confirmed and cancelled, and gets an exact hour when staff set one (VIEW-08, VIEW-09). | NT |
| VIEW-14 | Cùng SĐT WEB/MANUAL và hai tòa: cảnh báo, quay lại, Vẫn đặt; giữ hard limits/quota. | WEB and MANUAL with the same phone count once. The same phone at the same hour in another building with a different manager receives VIEWING_OVERLAP_WARNING first and may proceed with acceptOverlap: true; a shared responsible person still prevents it. Account/room duplicates still return CONFLICT_STATE, and each WEB room creation counts toward the daily limit (VIEW-02, VIEW-02a, VIEW-16). | NT |
| VIEW-15 | Đối chiếu các ca đồng thời WEB/MANUAL, khác tòa và đổi giờ theo cùng giao thức khóa. | Parallel manual creation and WEB booking cannot exceed 3; concurrent same-phone requests to different buildings without acknowledgement save one first and warn the other; an explicitly acknowledged retry may then succeed if hard limits pass. Rescheduling obeys the same locks and excludes only its own row from capacity checks (VIEW-16). | NT |
| VIEW-16 | Khách đã có chỗ MANUAL ở giờ đầy thêm phòng; đối chiếu cache công khai và quyền sở hữu. | At full capacity a signed-in guest with the same phone as an existing WEB or MANUAL place can select that hour for another room in the same building through the no-store availability route, even with no account-owned viewing yet. The same phone in another building remains selectable when hard limits pass, with a warning on submission. Public availability is identical regardless of login and both routes return only dates/hours; MANUAL rows remain unreadable through /me/viewings (VIEW-20, VIEW-21). | NT |
| VIEW-17 | Đổi người phụ trách trong dữ liệu thử; chỉ đánh dấu xung đột thật, không gắn cờ guest overlap đã được phép. | After reassignment, only actual capacity or responsible-person cross-building conflicts are marked; accepted guest-only overlaps are not flagged; up to 3 distinct guests and several rooms for the same guest within one building are not flagged (VIEW-22). | NT |

AUTH-05 và AUTH-09 chỉ nghiệm thu phần quyền của endpoint/module hiện có; hợp đồng, hóa đơn, yêu cầu tương lai vẫn kiểm cùng phase triển khai chúng. Các thao tác cleanup/phân công ở tiêu chí chỉ áp dụng trên dữ liệu thử đã được nhận diện trong lượt QA của chủ dự án; agent không chạy các thao tác này khi ghi hồ sơ.

## Phạm vi brief Home101 và hồi quy

| Nhóm | Cách đối chiếu và kỳ vọng hiện hành | Trạng thái |
|---|---|---|
| H101-ENTRY | Ba lựa chọn đi đúng luồng; ghi nhớ/Chọn lại; link phòng trực tiếp; chọn nhầm không tăng quyền. Bản ảnh tĩnh đã được chấp nhận, có reduced-motion. | NT |
| H101-ACCOUNT | Đăng ký/xác minh/khôi phục, tài khoản trùng/bị khóa và quyền GUEST theo AUTH. Không nhận lịch cũ theo SĐT; tái dùng tài khoản khi ký/hết hợp đồng chuyển Phase 3. | NT trong phạm vi |
| H101-LOCALE | Public/auth/guest/tenant hiện có: VI/EN, lỗi và fallback; đổi ngôn ngữ giữ dữ liệu nhập, tiền và giờ. Staff giữ tiếng Việt. | NT |
| H101-VIEW | Đặt giờ → quản lý xác nhận PHONE/EMAIL; khách hủy trước giờ; đổi giờ thống nhất qua điện thoại; DONE không tự thành WON. Cảnh báo hai tòa theo VIEW-16a. Luồng đề xuất hai chiều đã bỏ theo quyết định owner. | NT |
| H101-DISPATCH | Không có vai trò điều phối/người dẫn xem riêng; quản lý tòa/Boss phụ trách theo D-31. | Ngoài phạm vi |
| H101-SEARCH | Kết hợp lọc/phân trang, chia sẻ URL, xóa lọc, dữ liệu thiếu và rỗng; giữ ROOM-05. | NT |
| H101-REVIEW | Đánh giá sửa chữa ở Phase 5; không đánh giá buổi xem. | Ngoài phạm vi |
| H101-NOTIFY | Bốn email đúng người/ngôn ngữ/link; retry và quyền; không có inbox/nhắc lịch khách trong đợt này. EX-8 được owner nghiệm thu, đóng câu hỏi Spam cũ; không gửi lại thư. | NT |
| Hồi quy tài khoản | Ba vai trò cũ đăng nhập, thêm GUEST; tài khoản cũ không bị ép xác minh email. | NT |
| Hồi quy quản lý | Một quản lý tối đa hai tòa; ngoài tòa bị chặn; Boss fallback khi không có quản lý hoạt động. | NT |
| Hồi quy public | ROOM-05 vẫn lọc phòng đủ điều kiện; public không có lịch/tài khoản/thông báo riêng. | NT |
| Hồi quy giá | Luồng đề xuất/duyệt giá hiện có giữ quyền và hành vi Phase 2. | NT |
| Hồi quy UI | Desktop/360 px, keyboard/focus, VI/EN, reduced-motion theo phạm vi EX-9 được nghiệm thu. | NT |
| Dữ liệu QA | Giữ bằng chứng cleanup host: lượt e2e đó sạch; bản ghi Phase 2 cũ đã được owner chấp nhận giữ. Không suy ra tổng số bản ghi hiện tại hoặc thực hiện xóa mới. | NT theo EX-9 |

## Ba sửa mới được xác nhận riêng

| Sửa | Kỳ vọng | Xác nhận |
|---|---|---|
| AUTH-01/G-04 | Bỏ khoảng trắng đầu/cuối SĐT, vẫn chặn sai định dạng; mật khẩu giữ nguyên. | Owner báo OK 16/11/2026 |
| VIEW-14 | Popup sau khi đặt thành công, chờ quản lý liên hệ; Đóng còn kết quả; mở đúng lịch hẹn. | Owner báo OK 16/11/2026 |
| VIEW-16a | Trùng khách hai tòa hiện cảnh báo; khác quận nhắc di chuyển; Vẫn đặt mới lưu, hard limits vẫn chặn. | Owner báo OK 16/11/2026 |

Chi tiết thao tác đã dùng: [FE-EX-27-MANUAL-CHECKLIST.md](FE-EX-27-MANUAL-CHECKLIST.md). Bằng chứng tự động và reviewer: [CHECKPOINT-2026-11-16-booking-feedback.md](CHECKPOINT-2026-11-16-booking-feedback.md). Lịch sử: [PROGRESS.md](PROGRESS.md).

## Kết quả đóng phase

EX-6/7/8/9 đóng theo nghiệm thu owner; các task EX-1..5 đã hoàn tất trước đó được tổng kết cùng EX-9. Phase Extra hoàn thành trong phạm vi đã thống nhất. Bước phát triển tiếp theo là Phase 3 · Hợp đồng. Tên miền/sender riêng trước khi gửi email rộng rãi, video thay ảnh tĩnh nếu owner bổ sung, và Q-13 cho Phase 5 là việc tiếp theo riêng, không mở lại nghiệm thu local này.

Không có giả định nghiệp vụ mới, không chạy commit/push. Commit tài liệu gợi ý: `docs(qa): close Phase Extra after owner acceptance (BE-EX-24/30, FE-EX-27, QA-EX-01..06)`.
