# Giao diện · Áp mockup (UI-01..40)

Status legend: `[ ]` chưa làm · `[~]` đang làm · `[?]` AI làm xong, chờ chủ dự án kiểm tay · `[x]` đã duyệt, đã chép vào file chính · `[!]` lỗi / bị chặn (ghi lý do ở dòng dưới).
Kế hoạch và lý do: `Artifacts/approved/2026-11-08-UI-MOCKUP-PLAN/PLAN.md` (sau khi duyệt). Quyết định của chủ dự án ghi ở mục "Quyết định" bên dưới.

| | |
|---|---|
| Phạm vi | Chỉ FE (`Source/frontend`). BE, database, luồng nghiệp vụ giữ nguyên |
| Cách làm | Phiên chính, **không subagent, không pipeline** (chủ dự án 08/11/2026). Mỗi task một bản nháp riêng |
| Bản nháp | `Source/frontend/artifact_FE/<YYYY-MM-DD>-UI-<số>/` (spec: `Artifacts/…`) |
| Mockup | Trang chủ, chi tiết phòng: `Artifacts/layout_rooms/2026-10-26-stitch-mockups/public-home_*.png`, `public-room-detail_*.png` · Màn auth: `…/2026-10-28-auth-layouts/ref/01..07` |
| Xen kẽ Phase 3 | Không mở hai bản nháp cùng sửa `src/app/routes.tsx`, `src/layouts/*`, `src/components/rooms.css` |

## Vòng làm một task

1. AI đặt task `[~]`, tạo bản nháp + `REVIEW.md` (ghi `Gốc` = commit hiện tại).
2. AI làm, rồi tự chạy trong bản nháp: `npm run lint`, `npm run build`, `npm run test:components` (test bị ảnh hưởng sửa ngay trong bản nháp). Có `preview.html` để xem.
3. AI đặt task `[?]` và **báo lại**: đường dẫn bản nháp, kết quả lệnh, URL xem, danh sách "Bạn kiểm tay" của task. **Dừng, không làm task sau.**
4. Chủ dự án kiểm tay. Có lỗi → nói lỗi, AI sửa trong cùng bản nháp, quay lại bước 3.
5. Chủ dự án nói "duyệt" → AI đổi `REVIEW.md` thành ĐÃ DUYỆT, chạy `apply-draft.mjs`, chạy lại 3 lệnh trên file chính → đặt `[x]`, ghi ngày dưới task.
6. Commit khi chủ dự án bảo (mỗi task một commit, message có mã task).

**Chuẩn bị để kiểm tay** (một lần mỗi phiên): `npm run start:dev` trong `Source/backend` (DB dev), `npm run dev` trong `Source/frontend`, mở `http://localhost:5173/artifact_FE/<bản nháp>/preview.html`. Tài khoản dev: `prisma/seed.ts` (Boss 0900000001…). Kiểm điện thoại: DevTools chế độ 360 px.

**Mọi task giao diện phải đạt** (ngoài "Xong khi" riêng): chữ tiếng Việt đúng spec; tiền qua `formatMoney`; 4 trạng thái tải / trống / lỗi / có dữ liệu (UI-03); 360 px không cuộn ngang; Tab đi tới mọi nút, có viền focus; tắt chuyển động khi hệ điều hành bật "giảm chuyển động" (KIT-05); không có lỗi trong Console.

## Quyết định (chủ dự án, 08/11/2026)

Cả 3 app · hero theo Stitch · loại phòng/giường/WC/hướng để Đợt 4 · câu cam kết duyệt từng câu (UI-02) · nhận xét cư dân Đợt 4 · form "xem nhanh" dẫn về VIEW-01 · giữ 3 khung Sáng/Chiều/Tối · 3D sau Phase 5 (ẩn menu) · ảnh AI tạm có nhãn "Ảnh minh họa", chỉ ở hero/khu vực/màn đăng nhập · làm ngay, xen kẽ Phase 3 · ảnh auth là chuẩn Đợt 3 · menu trỏ vào chỗ đã có · chủ dự án tự chuyển WebP · logo thêm chữ "ROOMS / APARTMENTS HANOI" · không subagent.

---

## Đợt 0 · Chuẩn bị

- [x] **UI-01** Bản nháp spec `Artifacts/<ngày>-UI-01-spec/`:
  Xong 10/11/2026: chủ dự án duyệt, đã chép `31-ui-kit.md` (KIT-02, KIT-10..13) và `30-frontend.md`; lịch sử `Artifacts/approved/2026-11-10-UI-01-spec/`.
  - `docs/spec/31-ui-kit.md`: KIT-11 (phong cách Stitch cho cả 3 app, thay quyết định 26/10/2026: bo góc thẻ ~14 px, nút bo tròn, tiêu đề Taviraj 500, nhãn "Ảnh minh họa"); sửa KIT-02 (thêm Taviraj 500 và 500 nghiêng), KIT-10 (logo + chữ "ROOMS / APARTMENTS HANOI").
  - `docs/spec/30-frontend.md`: menu công khai (Tìm phòng → `/phong`, Khu vực → mục trên trang chủ, Liên hệ → chân trang, nút "Lên lịch xem" → `/phong`, "Đăng nhập"/"Trang của tôi"); bố cục `/` và `/phong/:id` theo Stitch với các điểm "giữ theo spec" của PLAN mục 1 (dòng 3–6); quy tắc ảnh AI (dòng 16).
  - Đổi `REVIEW.md` của bộ ảnh auth (`Artifacts/layout_rooms/2026-10-26-stitch-mockups/2026-10-28-auth-layouts/`) thành ĐÃ DUYỆT làm chuẩn tham khảo (ảnh không chép vào app).
  Xong khi: chủ dự án duyệt, `apply-draft` chép 2 file spec.
  Bạn kiểm tay: đọc diff 2 file spec; xem có điều nào trái ý.

- [x] **UI-02** Bảng duyệt câu chữ (AI soạn, chủ dự án quyết): `Artifacts/<ngày>-UI-02-copy/REVIEW.md` liệt kê **mọi câu** lấy từ ảnh Stitch và ảnh auth sẽ hiện trên web: nhãn nhỏ đầu hero, tiêu đề, đoạn giới thiệu, 3 số liệu hero, 4 thẻ "Vì sao chọn ROOMS?" (tiêu đề, đoạn, dòng nhỏ), 3 bước thuê, khối liên hệ cuối trang, chân trang, dòng cam kết ở khung đặt lịch, câu chào ở màn đăng nhập. Mỗi dòng: câu gốc · đề xuất của AI (sửa nếu sai sự thật hoặc trái spec) · cột "Giữ / Sửa thành… / Bỏ" để chủ dự án điền.
  Xong 10/11/2026: chủ dự án duyệt 9 câu, đã chép; build, lint, `test:components` 731/731 trên file chính; xem trên `/phong/7`. Lịch sử `Source/frontend/artifact_FE/approved/2026-11-10-UI-02-copy/`.
  Xong khi: mọi dòng đã có quyết định; bảng chép thành hằng chữ dùng ở UI-20, UI-21, UI-24, UI-30.
  Bạn kiểm tay: điền cột quyết định; câu nào chưa chắc đúng thực tế thì chọn "Bỏ".

- [?] **UI-03** Ảnh WebP (chủ dự án làm bằng https://squoosh.app, AI không cài gói). Nguồn: `Source/frontend/artifact_FE/2026-10-26-hanoi-room-layouts/image_mockup/`. Lưu vào `Source/frontend/artifact_FE/<ngày>-UI-03-images/public/images/`:
  Đã làm thẳng vào file chính (nhánh `tquynh`, commit `ab287b9`, merge `ff78ce5`), không qua bản nháp; chờ chủ dự án kiểm tay. Review 10/11/2026: build, lint sạch.

  | Ảnh gốc | Tên mới | Chiều rộng | Chất lượng | Dùng ở |
  |---|---|---|---|---|
  | `01-hero-exterior.png` | `hero-building.webp` | 1400 px | 75 | Hero trang chủ |
  | `06-lang-ha-neighborhood.png` | `area-lang-ha.webp` | 900 px | 72 | Thẻ khu vực |
  | `07-ba-dinh-neighborhood.png` | `area-ba-dinh.webp` | 900 px | 72 | Thẻ khu vực |
  | `08-cau-giay-neighborhood.png` | `area-cau-giay.webp` | 900 px | 72 | Thẻ khu vực |
  | `03-studio-lang-ha.png` | `auth-room.webp` | 1200 px | 72 | Màn đăng nhập (UI-30) |

  AI kiểm: đủ 5 file, mỗi file ≤ 300 KB, mở được; ghi kích thước vào `REVIEW.md`.
  Xong khi: chủ dự án duyệt, `apply-draft` chép 5 ảnh vào `Source/frontend/public/images/`.
  Bạn kiểm tay: mở 5 ảnh, đủ nét.

## Đợt 1 · Nâng kit (ảnh hưởng cả 3 app)

- [?] **UI-10** Token và font. `src/components/rooms.css`: biến bo góc (thẻ ~14 px, nút và chip bo tròn, ô nhập 10 px), tiêu đề `h1–h3` Taviraj 500, sửa nút dạng liên kết bị `.rooms-theme a { color: inherit }` đè màu. `index.html`, `components.html`: thêm Taviraj 500 và 500 nghiêng. Sửa test đọc `rooms.css` (`tests/form-fields.test.mjs`, `tests/p2/qa-fixes.test.mjs`) nếu cần.
  Đã làm thẳng vào file chính (nhánh `tquynh`, commit `ab287b9`, merge `ff78ce5`), không qua bản nháp; chờ chủ dự án kiểm tay. Review 10/11/2026: build, lint sạch.
  Xong khi: 3 lệnh xanh; `/components.html` hiện nút, ô nhập, thẻ theo kiểu mới.
  Bạn kiểm tay: `/components.html`; mở nhanh `/phong`, `/ql`, `/ql/phong`, `/thue` xem có gì vỡ rõ.

- [?] **UI-11** Header và footer. `RoomsHeader`: logo + chữ "ROOMS / APARTMENTS HANOI", menu, nút chính, mục tài khoản; trên điện thoại gom menu gọn. `RoomsFooter`: 4 cột (giới thiệu, tìm phòng, khu vực, liên hệ từ `/public/contact`). `PublicLayout`: menu theo UI-01. `StaffLayout`, `TenantLayout` chỉ nhận kiểu mới, giữ nguyên mục menu.
  Đã làm thẳng vào file chính (nhánh `tquynh`, commit `ab287b9`, merge `ff78ce5`), không qua bản nháp; chờ chủ dự án kiểm tay. Review 10/11/2026: build, lint sạch.
  Xong khi: 3 lệnh xanh; test layout/auth guard xanh; liên hệ lấy từ API, không có số mẫu.
  Bạn kiểm tay: header/footer ở `/`, `/ql`, `/thue` trên desktop và 360 px; bấm từng mục menu tới đúng chỗ; khách thấy "Đăng nhập", đã đăng nhập thấy "Trang của tôi".

- [?] **UI-12** Thành phần dùng chung mới trong kit (KIT-07, có mẫu trong `/components.html`): chip lọc dạng viên thuốc, thẻ nổi (nền giấy, bo góc, bóng nhẹ), nhãn trạng thái mới cho `StatusBadge`, nhãn "Ảnh minh họa" đặt trên ảnh. Chỉ đưa vào kit thứ được ≥ 2 trang dùng.
  Đã làm thẳng vào file chính (nhánh `tquynh`, commit `ab287b9`, merge `ff78ce5`), không qua bản nháp; chờ chủ dự án kiểm tay. Review 10/11/2026: build, lint sạch.
  Xong khi: 3 lệnh xanh; mỗi thành phần có mẫu và (nếu có logic) test.
  Bạn kiểm tay: mục mới trong `/components.html`, cả bàn phím.

- [?] **UI-13** Rà màn quản lý và người thuê sau UI-10..12: `/ql`, `/ql/toa-nha`, `/ql/toa-nha/:id`, `/ql/phong` (lưới tầng), `/ql/don-gia`, `/ql/duyet-gia`, `/ql/lich-hen`, `/ql/nhan-su`, `/ql/tai-khoan`, `/thue`, `/thue/tai-khoan`, desktop và 360 px. Sửa chỗ vỡ bố cục (chữ tràn, bảng tràn, nút xuống dòng). Không đổi chức năng.
  Đã làm thẳng vào file chính (nhánh `tquynh`, commit `ab287b9`, merge `ff78ce5`), không qua bản nháp; chờ chủ dự án kiểm tay. Review 10/11/2026: build, lint sạch.
  Xong khi: AI ghi bảng "màn · desktop · 360 px · đã sửa gì" vào `REVIEW.md`; 3 lệnh xanh.
  Bạn kiểm tay: đăng nhập Boss và người thuê dev, đi lần lượt các màn trong bảng.

## Đợt 2 · Trang công khai (cần UI-02, UI-03)

- [?] **UI-20** Trang chủ, phần trên: hero 2 cột (nhãn nhỏ, tiêu đề "Một nơi ở *vừa vặn* giữa phố.", đoạn giới thiệu, nút "Tìm phòng trống" → `/phong`; ẩn "Trải nghiệm mô hình 3D"), 3 số liệu theo UI-02 hoặc tính từ `/public/locations`, ảnh `hero-building.webp` + nhãn "Ảnh minh họa" + thẻ "Còn N phòng trống"; thanh lọc dưới hero: Quận/Khu vực, Khoảng giá, nút "Lọc phòng trống" → `/phong?district=&minPrice=&maxPrice=`.
  Đã làm thẳng vào file chính (nhánh `tquynh`, commit `ab287b9`, merge `ff78ce5`), không qua bản nháp; chờ chủ dự án kiểm tay. Review 10/11/2026: build, lint sạch.
  Xong khi: số liệu và quận lấy từ API; lọc ra đúng URL query của `/phong`; 3 lệnh xanh.
  Bạn kiểm tay: `/` desktop và 360 px; chọn quận + giá rồi bấm lọc.

- [?] **UI-21** Trang chủ, phần dưới: "Vì sao chọn ROOMS?" (4 thẻ, chữ từ UI-02); phòng nổi bật (`/public/featured-rooms`, ảnh thật hoặc "Chưa có ảnh", giá, diện tích, tầng, nút "Đặt hẹn xem phòng" → `/phong/:id`); khu vực (`id="khu-vuc"`, thẻ quận có số phòng từ `/public/locations`, ảnh `area-*.webp` + nhãn "Ảnh minh họa", bấm → `/phong?district=`); 3 bước thuê; khối liên hệ cuối trang (nút dẫn tới `/phong` để đặt lịch, số điện thoại/Zalo từ API).
  Đã làm thẳng vào file chính (nhánh `tquynh`, commit `ab287b9`, merge `ff78ce5`), không qua bản nháp; chờ chủ dự án kiểm tay. Review 10/11/2026: build, lint sạch.
  Xong khi: không còn chữ mẫu Stitch chưa duyệt; 3 lệnh xanh.
  Bạn kiểm tay: cuộn hết trang chủ; bấm thẻ phòng, thẻ khu vực, menu "Khu vực", "Liên hệ".

- [?] **UI-22** `/phong`: thanh lọc kiểu mới (quận, phường, tòa, khoảng giá theo ROOM-05, giữ trong URL), chip quận có số đếm, lưới thẻ phòng kiểu mới, phân trang.
  Đã làm thẳng vào file chính (nhánh `tquynh`, commit `ab287b9`, merge `ff78ce5`), không qua bản nháp; chờ chủ dự án kiểm tay. Review 10/11/2026: build, lint sạch.
  Xong khi: lọc và phân trang như cũ (test `tests/p2/fe-p2-15-search.test.mjs` xanh); 3 lệnh xanh.
  Bạn kiểm tay: lọc vài kiểu, tải lại trang vẫn giữ bộ lọc, trang trống "không có phòng".

- [?] **UI-23** `/phong/:id`, phần thông tin: breadcrumb (Trang chủ › Quận › Tòa › Phòng), mã phòng + nhãn trạng thái, tiêu đề, dòng địa chỉ/tầng; gallery theo số ảnh (0 → "Chưa có ảnh", 1, 2–4, ≥ 5, có xem ảnh lớn); dải thông số (diện tích, số người tối đa, tầng, nội thất); mô tả; bảng chi phí ước tính (ROOM-08) và đơn giá (PUB-03); nút "Chia sẻ" (chia sẻ của trình duyệt, không có thì chép link).
  Đã làm thẳng vào file chính (nhánh `tquynh`, commit `ab287b9`, merge `ff78ce5`), không qua bản nháp; chờ chủ dự án kiểm tay. Review 10/11/2026: build, lint sạch.
  Xong khi: không có thông số ngoài DB (giường, WC, hướng); 3 lệnh xanh.
  Bạn kiểm tay: một phòng nhiều ảnh, một phòng không ảnh; 360 px.

- [?] **UI-24** `/phong/:id`, khung đặt lịch (dính bên phải trên desktop, xuống dưới trên điện thoại): giá niêm yết, cọc và thời hạn tối thiểu từ API; ngày: "Hôm nay", "Ngày mai", "Chọn ngày khác" (tới +30 ngày); 3 khung Sáng/Chiều/Tối, khung đã bắt đầu hôm nay bị khóa (VIEW-08); họ tên, số điện thoại, ghi chú; ô honeypot giữ nguyên; nút "Xác nhận đặt lịch xem phòng <mã>"; dòng cam kết theo UI-02; nút gọi/Zalo từ API. Gửi vẫn là `POST /public/viewings`.
  Đã làm thẳng vào file chính (nhánh `tquynh`, commit `ab287b9`, merge `ff78ce5`), không qua bản nháp; chờ chủ dự án kiểm tay. Review 10/11/2026: build, lint sạch.
  Xong khi: lỗi 400/409/429 hiện đúng chữ spec; test `tests/p2/fe-p2-17-viewing-form.test.mjs`, `fe12-viewing-form` xanh; 3 lệnh xanh.
  Bạn kiểm tay: đặt một lịch thật trên DB dev (xem nó hiện ở `/ql/lich-hen`); thử lúc 15:00 không chọn được "Sáng"; nhập sai số điện thoại.

- [?] **UI-25** `/toa/:id`: cùng ngôn ngữ thẻ; thông tin tòa, liên hệ (BLD-04), bảng đơn giá (bậc điện, nước, dịch vụ), lưới phòng công khai.
  Đã làm thẳng vào file chính (nhánh `tquynh`, commit `ab287b9`, merge `ff78ce5`), không qua bản nháp; chờ chủ dự án kiểm tay. Review 10/11/2026: build, lint sạch.
  Xong khi: test `tests/p2/` liên quan xanh; 3 lệnh xanh.
  Bạn kiểm tay: một tòa có phòng và một tòa không có phòng công khai (404 theo PUB-02).

## Đợt 3 · Màn auth (theo ảnh `2026-10-28-auth-layouts/ref/`, làm xen kẽ Đợt 2)

- [?] **UI-30** `/dang-nhap` (ảnh 01): ảnh `auth-room.webp` + câu chào bên trái (nhãn "Ảnh minh họa", ẩn ảnh ở 360 px), form bên phải (số điện thoại, mật khẩu có nút hiện/ẩn, "Ghi nhớ đăng nhập", "Quên mật khẩu?"), khối "Chưa có tài khoản? Tài khoản được cấp khi ký hợp đồng" với "Liên hệ quản lý", "Xem phòng trống" (AUTH-10). Trạng thái chưa có trong ảnh: sai mật khẩu, tài khoản bị khóa, quá nhiều lần (429), đang gửi, theo chữ AUTH-01..04.
  Đã làm thẳng vào file chính (nhánh `tquynh`, commit `ab287b9`, merge `ff78ce5`), không qua bản nháp; chờ chủ dự án kiểm tay. Review 10/11/2026: build, lint sạch.
  Xong khi: `tests/auth-login-flow.test.mjs`, `auth-guards`, `auth-schemas`, `auth-api` xanh; 3 lệnh xanh.
  Bạn kiểm tay: đăng nhập đúng (Boss, người thuê), sai mật khẩu, tài khoản khóa (0900000005).

- [?] **UI-31** `/quen-mat-khau` (ảnh 02, 03, 04): nhập số điện thoại; sau khi gửi luôn cùng một thông báo (AUTH-07); `?token=`: mật khẩu mới + nhập lại; thêm trạng thái link hết hạn / đã dùng.
  Đã làm thẳng vào file chính (nhánh `tquynh`, commit `ab287b9`, merge `ff78ce5`), không qua bản nháp; chờ chủ dự án kiểm tay. Review 10/11/2026: build, lint sạch.
  Xong khi: test auth xanh; 3 lệnh xanh.
  Bạn kiểm tay: gửi với số có và không có email (thông báo giống nhau); mở link token sai.

- [?] **UI-32** `/doi-mat-khau` (ảnh 05): mật khẩu hiện tại, mới, nhập lại; bắt buộc khi đăng nhập lần đầu (AUTH-05).
  Đã làm thẳng vào file chính (nhánh `tquynh`, commit `ab287b9`, merge `ff78ce5`), không qua bản nháp; chờ chủ dự án kiểm tay. Review 10/11/2026: build, lint sạch.
  Xong khi: test auth xanh; 3 lệnh xanh.
  Bạn kiểm tay: đăng nhập người thuê 0900000004 (bị buộc đổi), đổi xong vào `/thue`. Sau đó chạy lại seed trên DB dev để trả mật khẩu cũ.

- [?] **UI-33** `/thue/tai-khoan` (ảnh 06, ưu tiên 360 px) và `/ql/tai-khoan` (ảnh 07): email, đổi mật khẩu; nhân sự thêm liên hệ công khai (số điện thoại, Zalo, Facebook) tách riêng có xem trước (AUTH-09).
  Đã làm thẳng vào file chính (nhánh `tquynh`, commit `ab287b9`, merge `ff78ce5`), không qua bản nháp; chờ chủ dự án kiểm tay. Review 10/11/2026: build, lint sạch.
  Xong khi: test auth xanh; 3 lệnh xanh.
  Bạn kiểm tay: sửa email, sửa liên hệ công khai rồi xem nó hiện ở trang chủ và màn đăng nhập.

## Kết thúc

- [~] **UI-40** Kiểm toàn bộ trên file chính: `npm run build`, `npm run lint`, `npm run test:components`; đi lại mọi màn công khai, auth, quản lý, người thuê ở desktop và 360 px; Lighthouse trang chủ (ghi điểm hiệu năng và trợ năng). Cập nhật `31-ui-kit.md` mục "Known limits", `CLAUDE.md` mục Status (qua bản nháp). Dọn `approved/` theo `Artifacts/README.md` bước 5.
  10/11/2026: đã chạy review (impeccable audit, 14/20). Còn lỗi P2/P3 ở Nhật ký lỗi; chưa cập nhật Status trong CLAUDE.md.
  Xong khi: chủ dự án duyệt bảng kết quả.

## Câu hỏi cho chủ dự án

Chưa có.

## Nhật ký lỗi

<!-- Khi task [!]: ngày · mã task · lỗi gì · cần gì -->
- 10/11/2026 · UI-03..33 · Giao diện được làm thẳng vào file chính, không có bản nháp và REVIEW.md, spec chưa cập nhật (xử lý ở UI-01). Dấu `[?]` chờ chủ dự án kiểm tay theo mục "Bạn kiểm tay" của từng task.
- 10/11/2026 · UI-24 · Sau 18:00, chọn "Hôm nay" thì cả 3 khung giờ bị khóa, khách không gửi được (`ViewingForm.tsx:84`). Cần khóa nút "Hôm nay" khi không còn khung nào (P2).
- 10/11/2026 · UI-11 · Chữ "APARTMENTS HANOI" 6–7 px (`Navigation.css:140`), nhãn thanh lọc 9 px (`rooms.css:94`), eyebrow 10 px; nên ≥ 11–12 px (P2).
- 10/11/2026 · UI-24 · Trên điện thoại khung đặt lịch nằm cuối trang chi tiết phòng; cần nút "Đặt lịch xem" cố định dẫn xuống form (P2).
- 10/11/2026 · UI-40 · `npm run test:components`: 5/731 test đỏ khi chạy cả bộ (`cp7-rooms`, `fe-p2-14-home`, `fe11-approvals`) nhưng xanh khi chạy riêng: test chập chờn (P2).
- 10/11/2026 · UI-13 · Tải lại trang quản lý: khoảng 8 giây nền trắng với vòng "Đang tải" trước khi hiện trang (P2).
- 10/11/2026 · UI-23/UI-40 · P3: viền dày một bên (`rooms.css:63`, `auth.css:30`, `public-room-detail.css:56`); cột "Khu vực" ở chân trang không có liên kết; khung ảnh lớn hiện nút ‹ › khi chỉ 1 ảnh, không dùng phím mũi tên; giá "Đến 5.000.000" và "Trên 5.000.000" cùng tính 5.000.000.
- 10/11/2026 · dữ liệu dev · Phòng 201 (id 7) trên DB dev dùng ảnh quảng cáo điện thoại; dọn trước khi go-live.
