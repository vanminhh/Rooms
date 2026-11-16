# FE-EX-27 — Kiểm tay trên trình duyệt thật

Ngày cập nhật: 16/11/2026. Trạng thái: **chờ kiểm lại bản sửa phương án B**; chủ dự án đã xác nhận backend khởi động trước bản sửa. Khởi động lại backend từ build mới theo nhóm 0, rồi dùng hai phiên G/M. Chủ dự án thao tác và báo kết quả theo từng nhóm. Chưa có ca trình duyệt nào được đánh dấu đạt từ kiểm thử tự động.

**Quyết định 16/11/2026:** Q-EX7-03 đã chọn B: cùng khách được đặt hai tòa cùng giờ sau cảnh báo và bấm tiếp tục; khác quận có lời nhắc di chuyển. Người phụ trách và sức chứa vẫn chặn. Đã bổ sung popup thành công. Q-EX7-02 đã xác định là dấu cách ở SĐT: form đăng nhập/đăng ký/quên mật khẩu tự bỏ khoảng trắng đầu/cuối, mật khẩu giữ nguyên.

## Bằng chứng tại thời điểm chuẩn bị checklist

- Backend trên máy chủ dự án trước bản sửa, nhật ký 16/11/2026: unit **1806/1806, 89 file**; lint **0 lỗi**; build **OK**; e2e DB dev **54/54, 7 file**, gồm **11 ca viewings**. Cleanup không để lại bản ghi của lượt chạy. Đây không phải bằng chứng cho luật B mới. Kết quả mới và sai sót chọn nhầm hai ca HTTP bị EACCES được ghi riêng trong [checkpoint](CHECKPOINT-2026-11-16-booking-feedback.md); không chạy lại HTTP/e2e trong hướng dẫn này.
- Hai Vitest config giữ nguyên `MAIL_PROVIDER: ''` tại commit `8164721`. Cấu hình này chỉ áp dụng khi chạy test; không tự tắt Resend của backend đang phục vụ trình duyệt.
- Frontend: kết quả mới xem [checkpoint](CHECKPOINT-2026-11-16-booking-feedback.md); chưa có kết quả kiểm tay desktop/360 px. Không coi kiểm thử fake DOM là bằng chứng bố cục trên trình duyệt thật.
- Reviewer EX-7 đã duyệt code tại `plans/EX-7/CP-1-2-REVIEW.md`. FE-EX-27 vẫn `[~]` đến khi các nhóm dưới đây có kết quả thực tế hoặc ghi rõ phần chưa kiểm được.

Nguồn kỳ vọng: `docs/spec/13-viewings.md` (VIEW-01/02/02a/03/04/07/08/09/14/15/15a/16/16a/17/18/20/21/22), `30-frontend.md`, `31-ui-kit.md`; task FE-EX-22..27. Các giả định kế thừa: A-03 (quota WEB), A-13 (NEW quá giờ), A-14 (xung đột thật theo luật B). Không thêm luật nghiệp vụ.

## Kiểm lại lỗi SĐT — 16/11/2026

Trạng thái: **OK theo xác nhận riêng của chủ dự án ngày 16/11/2026**. F5 frontend, dùng tài khoản thử có mật khẩu đúng:

1. Nhập đúng SĐT rồi thêm vài dấu cách ở cuối → đăng nhập phải thành công.
2. Đăng xuất, thử có dấu cách cả đầu và cuối SĐT → vẫn đăng nhập được.
3. Đặt dấu cách ở giữa các chữ số hoặc nhập thiếu một số → form báo SĐT không hợp lệ, không gửi đăng nhập. Mật khẩu vẫn được đối chiếu nguyên ký tự.

Báo `AUTH OK` hoặc bước bị lỗi; không gửi mật khẩu. Backend không cần khởi động lại riêng cho sửa auth này. Nhóm 0 bên dưới vẫn yêu cầu restart nếu backend chưa nạp bản sửa booking.

## 0. Chuẩn bị — báo kết quả trước khi đi tiếp

1. Trong terminal đang chạy **backend của Rooms**, nhấn Ctrl+C. Giữ frontend đang chạy.
2. Mở PowerShell tại `D:\Rooms\Source\backend`, dùng bản build đã kiểm tra để chạy backend với email ghi log:

   ```powershell
   @'
   process.env.MAIL_PROVIDER = '';
   process.env.NODE_ENV = 'development';
   await import('./dist/main.js');
   '@ | node --env-file=.env --input-type=module -
   ```

   Dán nguyên khối trên vào PowerShell, giữ nguyên dòng mở `@'` và dòng đóng `'@ | node ...`. Cách truyền qua stdin này tránh lỗi mất dấu nháy của lệnh `node -e` trước đó. Lệnh chỉ đặt biến cho tiến trình này; không sửa `.env`, không đổi Vitest config, không seed/migrate. Trong lượt FE này, nút gửi email ghi nội dung ở terminal; việc nhận email thật đã kiểm ở EX-8. Sau QA, Ctrl+C rồi dùng lệnh khởi động Resend bình thường trong `email-setup.md`.
3. Dùng cùng origin `http://localhost:5173` ở mọi cửa sổ, zoom trình duyệt **100%**. Gọi cửa sổ thường là **G** (tài khoản khách đã xác minh email), cửa sổ ẩn danh hoặc profile riêng là **M** (quản lý, không phải Boss). Hai tab cùng profile không tách phiên đăng nhập; nhiều cửa sổ ẩn danh cũng có thể dùng chung phiên.
4. Kiểm tra đăng nhập G và M đúng vai trò. M mở `/ql/lich-hen`, chọn tòa mình quản lý, trạng thái **Tất cả**, phạm vi ngày chứa ngày thử. Sau đó G đăng xuất để bắt đầu phần xem giờ công khai.
5. Chọn dữ liệu dưới đây bằng UI; không tạo/đổi phân công tòa chỉ để vượt điều kiện kiểm:

   | Ký hiệu | Dữ liệu cần chọn |
   |---|---|
   | A | Tòa do M quản lý, có ít nhất hai phòng công khai đang có thể đặt lịch |
   | A1, A2 | Hai phòng khác nhau của A; chưa có lịch NEW/CONFIRMED thuộc G cho chính các phòng này |
   | PG | Đúng số điện thoại của tài khoản G |
   | P2, P3, P4 | Ba số điện thoại dành cho dữ liệu thử, đúng 10 chữ số bắt đầu bằng 0, khác nhau và khác PG; không dùng số khách thật |
   | D, T | Một ngày/giờ còn ở tương lai, trong 30 ngày, giờ tròn 08:00–19:00; A, M và các số thử chưa có lịch mở gây xung đột ở giờ này |
   | T2 | Một giờ tương lai khác, còn trống, dùng thử đổi giờ |
   | B, nếu có | Tòa thứ hai cũng do M quản lý, có phòng đang hoạt động; dùng kiểm xung đột người phụ trách |
   | C, nếu có | Tòa công khai có người phụ trách khác M, ưu tiên khác quận A; D/T còn chỗ. Dùng kiểm cảnh báo riêng của khách |

6. Mọi ghi chú thử bắt đầu `QA-FE27-16Nov-` và thêm mã bước. Chỉ sửa/hủy các lịch thử đã nhận diện. Tạo MANUAL không gửi email và không tạo tài khoản cho P2/P3/P4.
7. Cần **hai lượt WEB còn lại trong ngày** cho nhóm 2; chấp nhận cảnh báo ở nhóm 3 dùng lượt thứ ba. Nếu làm cả hai nhóm, phần EMAIL muộn ở nhóm 5 cần lịch WEB thử còn NEW đã có sẵn hoặc chờ ngày sau. Quota là 3 lượt tạo WEB/ngày, kể cả đã hủy; đổi ngày hẹn không đặt lại quota. Cảnh báo rồi chọn quay lại không dùng quota. Nếu gặp 429, báo `QUOTA`, không xóa dữ liệu/seed để đặt lại.

Mẫu báo chuẩn bị: `0 OK | A=… | A1=… | A2=… | D/T=… | T2=… | có B: có/không | có C: có/không | quota còn: …/chưa rõ`. Không gửi mật khẩu, key hoặc mã xác minh.

## 1. Desktop — giờ công khai và 1/2/3/4 khách

Để G chưa đăng nhập; M đăng nhập ở cửa sổ riêng. Desktop rộng khoảng 1280 px trở lên.

Sau thay đổi từ M, cửa sổ G cần tải lại để lấy dữ liệu mới. Giờ công khai có cache 60 giây: nếu vẫn thấy dữ liệu cũ, đợi hết thời gian cache rồi tải lại trước khi kết luận lỗi. Không yêu cầu cập nhật trực tiếp giữa hai cửa sổ.

| ID | Thao tác | Kết quả cần thấy |
|---|---|---|
| D1 | G mở phòng A1, chọn ngày D. Xem ngày quá khứ, giới hạn ngày +30, các nút giờ; dùng Tab/Enter chọn ngày và giờ. | Xem phòng không cần đăng nhập. Có chú thích Còn chỗ/Không đặt được/Đã chọn. Chỉ giờ tròn 08–19; giờ đã bắt đầu và ngày ngoài khoảng không chọn được. Có nút Đăng nhập để đặt lịch. |
| D2 | M → Thêm lịch hẹn: A1, tên `QA-G-manual`, điện thoại PG, D/T, ghi chú mã `MG`. | Một lịch NEW/Chờ xác nhận, nguồn nhân viên thêm. G tải lại: T vẫn có thể chọn (khách thứ nhất). Không có log gửi thư cho MANUAL. |
| D3 | M thêm A1, điện thoại P2, cùng D/T, ghi chú `P2`. | T vẫn có thể chọn công khai (khách thứ hai). |
| D4 | M thêm A1, điện thoại P3, cùng D/T, ghi chú `P3`. | G tải lại sau cache: T bị vô hiệu hóa (đủ 3 khách). M không thấy Trùng giờ cho nhóm hợp lệ này. |
| D5 | M thử thêm A1, P4, cùng D/T. Sau khi bị từ chối, đổi sang D/T2 và lưu mã `P4`. Từ lịch P4 thử Đổi ngày/giờ về D/T. | Tạo khách thứ tư tại T bị từ chối bằng lỗi giờ đã hết chỗ/xung đột; không có bản ghi thứ tư ở T. P4 tạo được tại T2; đổi về T bị từ chối và vẫn giữ T2. |

Ghi số NEW trên dashboard M trước/sau nếu không có thao tác khác xen vào: ba lần thêm thành công D2–D4 tăng ba lịch NEW; lần tạo/đổi giờ thất bại không tăng. P4 tạo ở T2 tăng thêm một. Dashboard đếm lịch, không phải số điện thoại khác nhau.

**Dừng nhóm 1:** báo `D1–D5 OK`, hoặc ID bị lỗi, kỳ vọng và thực tế.

## 2. Khách đã có chỗ MANUAL thêm phòng WEB — desktop và 360 px

Giữ nguyên các lịch ở nhóm 1. Tại T có đúng ba số PG/P2/P3.

| ID | Cửa sổ/cỡ | Thao tác và kết quả cần thấy |
|---|---|---|
| D6 | G/desktop | Bấm Đăng nhập để đặt lịch tại A1 và đăng nhập G. Quay về đúng A1; T giờ chọn được vì PG đã có chỗ MANUAL. Vào `/toi` kiểm tra lịch MG không tự trở thành lịch của G, rồi quay về A1. |
| D7 | G/desktop | Chọn D/T, nhập ghi chú `QA-FE27-16Nov-G1`, đổi VI→EN→VI: ghi chú còn nguyên. Gửi một lần. Popup “Đặt lịch thành công” nhắc đang chờ xác nhận, quản lý sẽ liên hệ; đúng phòng/giờ/liên hệ. Header phải nằm dưới lớp che và không bấm được. Tab/Shift+Tab đi qua các link liên hệ và hai nút, không thoát popup. Bấm Đóng: kết quả inline vẫn còn và nhận focus; mở link chi tiết, ghi lại G1. M tải lại thấy đúng một lịch WEB mới; terminal ghi email tới người phụ trách. |
| M1 | G/360 px | F12 → Ctrl+Shift+M → Responsive → rộng **360**, cao khoảng **800**, zoom 100%. Chọn English, mở A2, chọn cùng D/T và tạo `QA-FE27-16Nov-G2`. Lịch tháng đủ 7 cột, không cuộn ngang. Popup “Booking successful” và lời nhắc chờ liên hệ hiển thị đủ; bấm View appointment đi đúng G2, trạng thái vẫn chờ xác nhận. |
| M2 | G/360 rồi desktop | Vào `/toi` và chi tiết G1/G2. Có hai lịch WEB của G, không có MG/P2/P3/P4; phòng/tòa/địa chỉ/giờ/trạng thái/liên hệ đúng. Có “Muốn đổi giờ? Gọi quản lý”; không có nút tự đổi giờ. Kiểm VI/EN ở cả hai cỡ màn. |
| D8 | M/desktop | Tại T hiện có MG, P2, P3, G1, G2: **5 lịch nhưng chỉ 3 số điện thoại**, hợp lệ, không có cờ Trùng giờ. Trước giờ bắt đầu, NEW/CONFIRMED chưa có nút Đã xem hoặc Không thành; không có Không đến/NO_SHOW hay thông tin phương thức/thời điểm xác nhận. |

Nếu cần kiểm UI không tìm thấy: dùng ID của lịch thử MG từ phản hồi tạo lịch trong Network của M, mở `/toi/lich-hen/<ID-MG>` bằng G. Phải báo không tìm thấy dù MG dùng cùng PG. Đây là kiểm quyền với lịch MANUAL; không ghi thành đã kiểm một tài khoản khách thứ hai.

**Dừng nhóm 2:** báo `D6–D8, M1–M2 OK`, kèm các link G1/G2 và tên tòa/phòng, không kèm token.

## 3. Xung đột hai tòa — làm khi G1/G2 vẫn mở tại A/T

| ID | Điều kiện/thao tác | Kết quả cần thấy |
|---|---|---|
| X1 | Có tòa B cũng do M quản lý: M thử thêm một lịch ở B, dùng P4, cùng D/T. | Bị từ chối dù B chưa đủ 3 khách, vì M đã phụ trách A tại T. Dùng P4 để tránh nhầm đây chỉ là xung đột của PG. |
| X2a | G/desktop mở phòng của C, chọn đúng D/T, nhập ghi chú `QA-FE27-16Nov-G3`, bấm Gửi yêu cầu. | T chọn được nếu C còn chỗ. Hiện “Lưu ý lịch xem cùng giờ”; khác quận nhắc cân nhắc thời gian di chuyển. Chưa có popup thành công, chưa thêm lịch hoặc gửi email. Header không nhận thao tác ngoài popup. |
| X2b | G dùng Tab/Shift+Tab, Escape; gửi lại, bấm Chọn giờ khác. | Cả hai cách đều đóng cảnh báo, giữ nội dung form, trả focus về vùng chọn giờ; không tự gửi lại hoặc tiêu quota. Nếu muốn đối chiếu, mở `/toi` ở tab cùng phiên và kiểm chưa có G3. |
| X2c | Chuyển G sang 360 px, gửi lại rồi bấm Vẫn đặt. | Cảnh báo không cắt chữ/nút. Chỉ sau xác nhận mới thêm đúng một G3 và mở popup thành công; Xem lịch hẹn đi đúng G3, vẫn NEW. G thấy G1/G2/G3; M chỉ thấy lịch trong tòa mình. Không coi trùng khách đã đồng ý là cờ Trùng giờ. |
| X3 | M/desktop thêm MANUAL A1, PG, D/T, ghi chú `QA-FE27-16Nov-MG-overlap` khi G3 còn mở. Chọn Chọn giờ khác, sau đó gửi lại và Vẫn đặt. | Cảnh báo vì PG có C/T; lần quay lại không lưu, trả focus về form. Lần đồng ý lưu một lịch MANUAL, không gửi email. Hủy riêng lịch MG-overlap ngay sau khi kiểm với ghi chú cleanup, giữ MG ban đầu. |
| X4 | M/360 px tạo MANUAL A1, PG, D/T2, mã `QA-FE27-16Nov-MG-reschedule`. Đổi giờ về T: đóng cảnh báo bằng Escape, kiểm giờ vẫn T2; thử lại và chọn Vẫn đổi giờ. | Warning giữ giờ cũ đến khi đồng ý, trả focus về form khi đóng. Xác nhận mới chuyển sang T. Hủy riêng MG-reschedule với ghi chú cleanup ngay sau kiểm. |

Nếu thiếu B hoặc C/giờ đối chứng còn trống, ghi `X1/X2/X3/X4 CHƯA KIỂM — thiếu dữ liệu …`. Không đổi phân công tòa, tạo thêm tài khoản hoặc coi ca thiếu dữ liệu là đạt. Hai tài khoản vẫn đủ để thao tác nếu các tòa thử đã có. Nếu có tòa C cùng quận A, kiểm X2a/b ở đó: thông báo chung hỏi có tiếp tục, không khẳng định khác quận; chưa cần tạo thêm WEB. Không nói hai tòa cách xa bao nhiêu vì hệ thống chỉ so sánh quận.

Ghi lại G3, rồi G hủy G3 khi còn trước giờ hẹn; đừng hủy G1/G2 trước nhóm 4. Hủy G3 không trả lượt quota đã dùng. Nếu đã tạo G1/G2/G3 cùng ngày, nhóm 5 cần lịch WEB thử sẵn có hoặc chờ ngày sau.

## 4. PHONE/EMAIL, đổi giờ, hủy và trả chỗ cuối

| ID | Cửa sổ/cỡ | Thao tác | Kết quả cần thấy |
|---|---|---|---|
| S1 | M/desktop | Lịch G1 → Xác nhận. | CONFIRMED/Đã xác nhận; PHONE không gửi log email. G tải lại thấy cùng trạng thái. |
| S2 | M/360 px | Lịch G2 → Gửi email xác nhận. | Nút/bố cục không tràn; gửi xong chuyển CONFIRMED; terminal có nội dung thư xác nhận. Không đòi thư thật trong chế độ ghi log. |
| S3 | M/desktop và 360 | G2 → Đổi ngày/giờ. Thử 10:30 hoặc giờ ngoài 08–19, rồi đổi hợp lệ sang T2, cuối cùng đưa về T. Đây là lịch QA, giả lập đã thỏa thuận. | Giá trị sai bị chặn, không đổi lịch; giá trị hợp lệ cập nhật đúng giờ Hà Nội. G tải lại thấy thay đổi; trạng thái CONFIRMED được giữ. Không tạo thêm lượt WEB. |
| S4 | M/desktop | Hủy **MG** trước: thử Lưu khi Lý do hủy trống, sau đó điền `QA-FE27 cleanup MG` và Lưu. | Bắt buộc lý do; MG thành Đã hủy. G1/G2 vẫn giữ chỗ PG, T vẫn đủ 3 số. **Bắt buộc đóng MG trước khi kiểm chỗ cuối.** |
| S5 | G/desktop | G1 → Hủy lịch. Đóng bằng Giữ lịch; kiểm vẫn CONFIRMED. Mở lại và xác nhận Hủy lịch. | Chỉ lần xác nhận thứ hai mới hủy. Chi tiết/danh sách G cập nhật. G2 vẫn mở. |
| S6 | M/desktop | Thử đưa P4 từ T2 về T lần nữa. | Vẫn bị từ chối: PG vẫn còn G2. Không báo chỗ trống chỉ vì đã hủy G1. |
| S7 | G/360 px | G2 → Hủy lịch; kiểm dialog không bị cắt và Tab/focus nằm trong dialog; xác nhận. | G2 thành Đã hủy, không còn lịch mở nào của PG ở A/T. Không có nút hủy tiếp. |
| S8 | M/360 px | Đưa P4 từ T2 về T. | Lần này thành công: P2/P3/P4 là ba số ở T. T2 không còn lịch P4. Việc hủy phòng cuối mới trả chỗ PG. |

Các thao tác ở cửa sổ đang dùng phải cập nhật đúng dữ liệu sau lưu; cửa sổ tài khoản khác có thể cần F5. Màn quản lý luôn tiếng Việt dù phần khách đã đổi sang English.

**Dừng nhóm 4:** báo `S1–S8 OK`, hoặc đúng bước có lỗi. Đã dùng hai lượt tạo WEB của G, hoặc ba lượt nếu hoàn thành X2c cùng ngày.

## 5. Đến giờ/quá giờ — không giả lập bằng đổi đồng hồ hoặc sửa DB

Ưu tiên các lịch **QA** còn NEW đã đến giờ và có đủ loại WEB/MANUAL. M lọc ngày tương ứng; mặc định trang chỉ lọc từ hôm nay nên lịch hôm qua cần chỉnh Từ ngày.

Nếu chưa có, chọn giờ tròn TL kế tiếp trong 08–19 còn tương lai, chuẩn bị ba lịch thử ở A, cùng giờ TL:

- `L-PHONE`: MANUAL, P2.
- `L-DONE`: MANUAL, P3.
- `L-EMAIL`: WEB thuộc G, email đã có. Đây là lượt WEB thứ ba nếu hôm nay mới tạo G1/G2; nếu đã tạo cả G3 ở X2c thì dùng lịch WEB thử NEW có sẵn hoặc ghi chờ ngày sau.

Ba số khác nhau vừa đủ sức chứa. Ghi lại link L-EMAIL. Đợi thời gian thực đến TL; nếu hiện ngoài khung giờ và không có lịch QA quá giờ, đánh dấu **CHỜ ĐẾN GIỜ**, không đánh dấu đạt và không đụng lịch khách thật.

| ID | Thao tác | Kết quả cần thấy |
|---|---|---|
| L1 | Trước TL mở chi tiết L-EMAIL bằng G; đến TL kiểm lại ở desktop và 360. M xem ba lịch NEW sau TL. | Trước giờ G có Hủy lịch, từ giờ bắt đầu không còn nút. M thấy “Quá giờ, chưa xác nhận”; NEW không tự thành CANCELLED/CONFIRMED. Dashboard phản ánh lịch quá giờ trong trách nhiệm của M. |
| L2 | M xác nhận PHONE muộn cho L-PHONE, sau đó Hủy với lý do `QA-FE27 khách không đến`. | PHONE muộn được phép và giữ giờ hẹn; Hủy cần ghi chú, thành CANCELLED. Không có trạng thái/nút Không đến riêng. |
| L3 | M chọn Đã xem trực tiếp trên L-DONE khi nó còn NEW. Sau đó chọn Không thành, thử để trống ghi chú rồi nhập ghi chú QA. | NEW quá giờ → DONE/Đã xem trực tiếp. Chỉ sau DONE mới có Không thành; LOST cần ghi chú. |
| L4 | M gửi EMAIL xác nhận muộn cho L-EMAIL, rồi chọn Đã xem. | Console ghi thư và trạng thái CONFIRMED, giờ hẹn giữ nguyên; sau đó chuyển DONE được. G tải lại thấy Đã xem, không có Hủy lịch. |

Mỗi màn/card vừa dùng cần xem ở cả desktop và 360; ghi rõ thao tác đã bấm ở cỡ nào. MANUAL không có email tài khoản nên nút EMAIL bị vô hiệu hóa; không dùng MANUAL để thay ca L-EMAIL.

## 6. Kiểm giao diện cuối và dọn lịch thử qua UI

- **U1 — desktop/360:** xem lại A1/A2, `/toi`, chi tiết lịch, `/ql/lich-hen` và `/ql`. Không tràn ngang, không bị thanh cố định che nút, nhãn giờ/status đọc được, form lỗi nằm cạnh trường. Public/guest có VI/EN; staff giữ VI.
- **U2 — bàn phím:** Tab tới ngày, giờ, nút gửi và nút hủy; Enter/Space hoạt động. Focus nhìn thấy; dialog không đưa Tab ra phần nền, đóng dialog trả focus hợp lý.
- **U3 — lỗi/tải lại:** chỉ ở trang đọc danh sách, dùng DevTools Network → Offline rồi tải lại để kiểm thông báo lỗi/Thử lại; trả về Online và Thử lại. Không bật Offline giữa thao tác tạo/hủy vì kết quả ghi có thể không rõ. Nếu browser chặn hẳn việc tải trang, trả Online, mở app lại và ghi ca này chưa kiểm được.
- **U4 — giảm chuyển động:** nếu tiện, DevTools Rendering → Emulate CSS media `prefers-reduced-motion: reduce`; lịch/giờ/dialog vẫn dùng được. Không có thay đổi nghiệp vụ khi bật tùy chọn này.
- **U5 — dọn dữ liệu thử:** bằng M, Hủy các lịch NEW/CONFIRMED còn lại có đúng prefix QA của lượt này và lý do dọn kiểm thử. Lịch DONE/LOST/CANCELLED giữ lịch sử. Không xóa cứng, không seed, không dọn bản ghi E2E cũ. Đừng dọn các lịch đang chờ TL trước khi kiểm nhóm 5.

Những ca không tạo được với dữ liệu/quyền hiện có phải ghi rõ, không coi là lỗi giao diện hoặc tự đạt. Không cần lặp lại kiểm gửi bốn email thật của EX-8.

## Phiếu kết quả và điểm dừng ⏸

| Nhóm | Nghiệm thu cuối | Phạm vi chi tiết của nhóm |
|---|---|---|
| 0 — hai phiên, dữ liệu, email ghi log | NT theo xác nhận EX-7/EX-9 của chủ dự án | Tòa/phòng, ngày/giờ, quota, B/C |
| D1–D5 — công khai, sức chứa | NT theo xác nhận EX-7/EX-9 của chủ dự án | Giờ sau khách 1/2/3, lỗi khách 4 |
| D6–D8, M1–M2 — WEB/MANUAL, đặt hai phòng | NT theo xác nhận EX-7/EX-9 của chủ dự án | Link G1/G2, hai cỡ màn, danh sách của G |
| X1-X4 - khác tòa, cảnh báo/đồng ý | NT theo xác nhận EX-7/EX-9 của chủ dự án | Có/thiếu B/C, quận, G3, quay lại/đồng ý, MANUAL/đổi giờ, focus và cleanup |
| S1–S8 — xác nhận, đổi giờ, hủy/trả chỗ | NT theo xác nhận EX-7/EX-9 của chủ dự án | Trạng thái và thời điểm P4 được chuyển sang T |
| L1–L4 — quá giờ | NT theo xác nhận EX-7/EX-9 của chủ dự án | Giờ thật, link L-EMAIL, các chuyển trạng thái |
| U1–U5 — hiển thị/khôi phục/dọn lịch | NT theo xác nhận EX-7/EX-9 của chủ dự án | Desktop/360, lỗi còn lại, lịch QA còn mở |

Xác nhận cuối của chủ dự án đóng các nhóm ở mức nghiệm thu EX-7/EX-9. Không bổ sung link lịch, giờ thử, ảnh hoặc kết quả từng thao tác chưa được cung cấp. Ba sửa mới có xác nhận riêng là SĐT, popup thành công và cảnh báo trùng giờ. Xem [hồ sơ EX-9](ex-9-qa-checklist.md); FE-EX-27 đã đóng, không cần lặp lại checklist nếu không phát sinh lỗi mới.
