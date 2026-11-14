# FE-EX-12 — Nội dung Việt–Anh chờ duyệt

Ngày lập: 14/11/2026. Spec: KIT-13, LOC-01, LOC-04, LOC-05.

**Trạng thái: ĐÃ ĐƯỢC CHỦ DỰ ÁN DUYỆT ngày 14/11/2026 (KIT-13).** Đây là bản chép nguyên văn từ `Source/frontend/src/shared/i18n/vi.ts` và `en.ts` tại commit `e95efad`; chưa thay đổi nội dung giao diện.

## Cách duyệt

Đọc hai cột Việt–Anh bên cạnh nhau; có thể duyệt toàn bộ hoặc chỉ rõ khóa và câu muốn sửa. Các khóa kỹ thuật giúp áp dụng đúng vị trí trong từ điển. Bản tiếng Anh chưa được duyệt không đưa lên production (KIT-13, OQ-1). Không thêm cờ build hay cấu hình môi trường.

Các đoạn hero khi ghép lại:

| Vị trí | Tiếng Việt | Tiếng Anh |
|---|---|---|
| Trang chủ | Một nơi ở vừa vặn giữa phố. | A place that fits you in the city. |
| Tìm phòng | Tìm phòng vừa vặn với bạn | Find a room that fits you |

**Nội dung tạm về đặt lịch:** `home.reasons.2.note` và `home.steps.2.body` đang mô tả chọn buổi Sáng/Chiều/Tối; EX-6/EX-7 sẽ thay bằng chọn từng giờ (D-29). `home.reasons.2.body` cũng nhắc buổi xem và cần cập nhật cùng luồng mới. Các câu này phản ánh giao diện hiện tại, không phải cam kết về luồng mới. Form đặt lịch công khai cũ vẫn tiếng Việt theo OQ-2.

Giữ nguyên tham số `{count}`, `{amount}`, `{district}`, `{phone}`; số liệu lấy từ API. A-12: không dịch nội dung người dùng nhập. Các nhãn, trạng thái và chữ hỗ trợ truy cập được liệt kê cùng để đối chiếu đầy đủ.

## Trang chủ (73 khóa)

| Khóa | Tiếng Việt | Tiếng Anh |
|---|---|---|
| `home.hero.eyebrow` | Phòng thuê tại Hà Nội | Rooms for rent in Hanoi |
| `home.hero.leading` | Một nơi ở  | A place that  |
| `home.hero.highlight` | vừa vặn | fits you |
| `home.hero.trailing` |  giữa phố. |  in the city. |
| `home.hero.intro` | Khám phá phòng thuê tại Hà Nội với thông tin rõ ràng về giá, diện tích và tiện ích. Chọn phòng phù hợp và đặt lịch xem trực tiếp. | Explore rooms for rent in Hanoi with clear prices, sizes and amenities. Find a room that suits you and book a viewing. |
| `home.findVacant` | Tìm phòng trống | Find available rooms |
| `home.stats.label` | Số liệu phòng trống | Available room statistics |
| `home.stats.rooms` | Phòng · Đang trống | Rooms · Available now |
| `home.stats.districts` | Quận · Đang có phòng cho thuê | Districts · With rooms for rent |
| `home.stats.wards` | Phường · Đang có phòng cho thuê | Wards · With rooms for rent |
| `home.hero.imageAlt` | Tòa nhà minh họa cho phòng thuê ROOMS tại Hà Nội | Illustration of a ROOMS rental building in Hanoi |
| `home.illustration` | Ảnh minh họa | Illustration |
| `home.hero.updating` | Đang cập nhật | Updating |
| `home.hero.available` | Còn {count} phòng trống | Available rooms: {count} |
| `home.hero.source` | Thông tin từ danh sách phòng công khai | Based on the public room listings |
| `home.search.district` | Quận / Khu vực | District / Area |
| `home.search.budget` | Khoảng giá | Price range |
| `home.search.submit` | Lọc phòng trống | Filter available rooms |
| `home.search.allDistricts` | Tất cả quận | All districts |
| `home.search.allBudgets` | Tất cả mức giá | All price ranges |
| `home.budget.upTo` | Đến {amount} | Up to {amount} |
| `home.budget.from` | Từ {amount} | From {amount} |
| `home.reasons.eyebrow` | Thông tin để bạn chủ động lựa chọn | Information to help you choose |
| `home.reasons.title` | Vì sao chọn ROOMS? | Why choose ROOMS? |
| `home.reasons.intro` | Tìm phòng, xem thông tin và đặt lịch trên cùng một nơi. | Find a room, check the details and book a viewing in one place. |
| `home.reasons.1.title` | Thông tin giá rõ ràng | Clear pricing |
| `home.reasons.1.body` | Xem giá thuê, chi phí ước tính và đơn giá công khai trước khi đặt lịch. | See rent, estimated monthly costs and published rates before booking a viewing. |
| `home.reasons.1.note` | Xem chi phí trước khi đặt lịch | Check costs before you book |
| `home.reasons.2.title` | Đặt lịch xem thuận tiện | Convenient viewings |
| `home.reasons.2.body` | Chọn ngày và buổi xem phù hợp; yêu cầu được gửi tới quản lý tòa nhà để xác nhận. | Choose a suitable day and time; your request goes to the building manager for confirmation. |
| `home.reasons.2.note` | Chọn Sáng, Chiều hoặc Tối | Choose morning, afternoon or evening |
| `home.reasons.3.title` | Thông tin theo từng phòng | Room-specific details |
| `home.reasons.3.body` | Xem ảnh phòng, diện tích, sức chứa, nội thất và chi phí của từng phòng. | See each room’s photos, size, capacity, furniture and costs. |
| `home.reasons.3.note` | Dữ liệu riêng cho từng phòng | Details for each room |
| `home.reasons.4.title` | Liên hệ thuận tiện | Easy to get in touch |
| `home.reasons.4.body` | Xem địa chỉ tòa nhà và liên hệ trực tiếp với người quản lý phụ trách. | See the building address and contact the manager directly. |
| `home.reasons.4.note` | Gọi điện hoặc liên hệ Zalo | Call or message on Zalo |
| `home.featured.label` | Phòng nổi bật | Featured rooms |
| `home.featured.eyebrow` | Phòng vừa cập nhật | Recently updated rooms |
| `home.featured.description` | Những phòng trống có giá vừa được duyệt gần đây. | Available rooms with recently approved prices. |
| `home.featured.all` | Xem tất cả phòng trống | View all available rooms |
| `home.featured.viewing` | Đặt hẹn xem phòng | Book a room viewing |
| `home.areas.label` | Khu vực | Areas |
| `home.areas.eyebrow` | Khu vực có phòng trống | Areas with available rooms |
| `home.areas.description` | Số phòng được cập nhật từ danh sách công khai. | Room counts come from the public listings. |
| `home.areas.title` | Chọn khu vực phù hợp | Choose an area that suits you |
| `home.district.imageAlt` | Khu vực minh họa tại {district} | Illustration of the {district} area |
| `home.district.noImage` | Chưa có ảnh minh họa | No illustration yet |
| `home.district.availableCount` | {count} phòng trống | {count} available rooms |
| `home.district.availableCount.one` | {count} phòng trống | {count} available room |
| `home.district.availableCount.other` | {count} phòng trống | {count} available rooms |
| `home.district.view` | Xem phòng tại khu vực | View rooms in this area |
| `home.process.eyebrow` | Các bước xem phòng | How to view a room |
| `home.process.title` | Tìm và xem phòng trong 3 bước | Find and view a room in 3 steps |
| `home.process.intro` | Từ danh sách phòng trống đến lịch hẹn xem trực tiếp. | From available rooms to an in-person viewing. |
| `home.steps.1.title` | Chọn phòng phù hợp | Choose a room that suits you |
| `home.steps.1.body` | Xem ảnh, giá, diện tích, nội thất và chi phí ước tính của phòng. | Check the room photos, rent, size, furniture and estimated costs. |
| `home.steps.2.title` | Đặt lịch xem trực tiếp | Book an in-person viewing |
| `home.steps.2.body` | Chọn ngày, buổi xem và để lại thông tin liên hệ. Quản lý tòa nhà sẽ xác nhận lịch hẹn. | Choose a day and time and leave your contact details. The building manager will confirm the appointment. |
| `home.steps.3.title` | Đến xem phòng theo lịch hẹn | Visit at the arranged time |
| `home.steps.3.body` | Kiểm tra phòng thực tế và trao đổi trực tiếp với quản lý tòa nhà. | See the room in person and speak directly with the building manager. |
| `home.contact.eyebrow` | Đặt lịch xem phòng | Book a room viewing |
| `home.contact.title` | Chọn phòng phù hợp với bạn | Choose a room that suits you |
| `home.contact.intro` | Xem danh sách phòng trống, chọn phòng và gửi yêu cầu đặt lịch. | Browse available rooms, choose one and send a viewing request. |
| `home.contact.loading` | Đang tải thông tin liên hệ | Loading contact details |
| `home.contact.error` | Chưa tải được thông tin liên hệ. | Could not load contact details. |
| `home.contact.empty` | Thông tin liên hệ đang được cập nhật. | Contact details are being updated. |
| `home.contact.call` | Gọi {phone} | Call {phone} |
| `home.contact.zalo` | Liên hệ Zalo | Contact on Zalo |
| `home.contact.viewing` | Xem phòng trống | View available rooms |
| `home.contact.filterHint` | Chọn theo khu vực và khoảng giá phù hợp. | Choose a suitable area and price range. |
| `home.notFound.title` | Không tìm thấy trang | Page not found |
| `home.notFound.back` | Về trang chủ | Back to home |

## Điều hướng (19 khóa)

| Khóa | Tiếng Việt | Tiếng Anh |
|---|---|---|
| `nav.findRoom` | Tìm phòng | Find a room |
| `nav.myPage` | Trang của tôi | My page |
| `nav.login` | Đăng nhập | Sign in |
| `nav.area` | Khu vực | Areas |
| `nav.contact` | Liên hệ | Contact |
| `nav.bookViewing` | Lên lịch xem | Book a viewing |
| `nav.appointments` | Lịch hẹn | Appointments |
| `nav.viewings` | Lịch hẹn xem phòng | Room viewings |
| `nav.account` | Tài khoản | Account |
| `nav.overview` | Tổng quan | Overview |
| `nav.signOut` | Đăng xuất | Sign out |
| `nav.language` | Ngôn ngữ | Language |
| `nav.vietnamese` | Tiếng Việt | Tiếng Việt |
| `nav.english` | English | English |
| `nav.homeLabel` | Rooms — Trang chủ | Rooms — Home |
| `nav.close` | Đóng | Close |
| `nav.menu` | Menu | Menu |
| `nav.main` | Điều hướng chính | Main navigation |
| `nav.explore` | Khám phá | Explore |

## Chân trang (10 khóa)

| Khóa | Tiếng Việt | Tiếng Anh |
|---|---|---|
| `footer.description` | Chung cư mini cho thuê tại Hà Nội. | Mini apartments for rent in Hanoi. |
| `footer.viewRooms` | Xem phòng trống | View available rooms |
| `footer.viewAreas` | Xem các khu vực | Explore areas |
| `footer.findTitle` | Tìm phòng | Find a room |
| `footer.findDescription` | Xem phòng đang trống và chọn lịch hẹn phù hợp. | Browse available rooms and choose a convenient viewing time. |
| `footer.areaTitle` | Khu vực | Areas |
| `footer.areaDescription` | Khám phá các tòa nhà tại Hà Nội theo khu vực. | Explore apartment buildings across Hanoi by area. |
| `footer.contactTitle` | Liên hệ | Contact |
| `footer.contactEmpty` | Thông tin đang được cập nhật. | Contact details are being updated. |
| `footer.location` | Hà Nội · Việt Nam | Hanoi · Vietnam |

## Lời giới thiệu trang tìm phòng (5 khóa)

| Khóa | Tiếng Việt | Tiếng Anh |
|---|---|---|
| `rooms.page.eyebrow` | Phòng đang sẵn sàng | Rooms ready to rent |
| `rooms.page.description` | Chọn khu vực và khoảng giá phù hợp với bạn. | Choose an area and price range that suit you. |
| `rooms.page.leading` | Tìm phòng  | Find a room that  |
| `rooms.page.highlight` | vừa vặn | fits |
| `rooms.page.trailing` |  với bạn |  you |

## Năm mức giá hiển thị

Nguồn: `PublicHomePage.tsx`, dùng hai khóa `home.budget.upTo` / `home.budget.from` và `formatMoney`. Tiền giữ định dạng Việt Nam ở cả hai ngôn ngữ (LOC-05).

| Mức | Tiếng Việt | Tiếng Anh |
|---|---|---|
| Đến 2.000.000 đ | Đến 2.000.000 đ | Up to 2.000.000 đ |
| Đến 3.000.000 đ | Đến 3.000.000 đ | Up to 3.000.000 đ |
| Đến 4.000.000 đ | Đến 4.000.000 đ | Up to 4.000.000 đ |
| Đến 5.000.000 đ | Đến 5.000.000 đ | Up to 5.000.000 đ |
| Từ 5.000.000 đ | Từ 5.000.000 đ | From 5.000.000 đ |

## Đối chiếu

Đủ 107 khóa: 73 home.*, 19 nav.*, 10 footer.*, 5 rooms.page.*. Mỗi dòng giữ nguyên câu trong hai từ điển; các đoạn ghép và năm mức giá ở trên chỉ giúp đọc trong ngữ cảnh.

## Quyết định của chủ dự án

- 14/11/2026: Chủ dự án trả lời “duyệt hết nhé”, phê duyệt toàn bộ 107 khóa Việt–Anh, các đoạn slogan ghép và năm mức giá trong bảng; không yêu cầu sửa câu nào.
- FE-EX-12 hoàn tất theo KIT-13. Các ghi chú tạm về lịch xem vẫn áp dụng cho đến EX-6/EX-7; phê duyệt này không thay đổi nghiệp vụ.
