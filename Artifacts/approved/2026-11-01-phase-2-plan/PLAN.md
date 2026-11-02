# PLAN – Phase 2 · Rooms (bản 4)

Gốc: f454cb3 · Lập 01/11/2026, rà soát ba lần cùng ngày (thay đổi: mục 7)
Spec: `01-architecture.md#roadmap`, `11-buildings-rooms.md`, `12-pricing.md`, `13-viewings.md`, `30-frontend.md`, `10-auth.md` (AUTH-08), `20-reports-audit-settings.md` (AUD-01), `00-overview.md` (A-03, A-05)

## 1. Mục tiêu và điều kiện thoát phase

Roadmap: **khách tìm được phòng và đặt lịch xem; giá chỉ đổi sau khi Boss duyệt.**

Phase 2 xong khi, trên file chính:

1. Khách chưa đăng nhập lọc phòng (quận, phường, tòa, khoảng giá), mở chi tiết phòng, gửi lịch hẹn; quản lý của tòa (hoặc Boss nếu tòa không có quản lý đang hoạt động) thấy lịch hẹn ở "Việc hôm nay" và xử lý được.
2. Quản lý đề xuất giá phòng / đơn giá → giá công khai **không đổi** cho tới khi Boss duyệt; giá duyệt cho ngày sau được áp lúc 01:00 (hoặc ngay khi server khởi động lại nếu lúc đó server tắt).
3. Mọi case "Acceptance" của spec 11, 12, 13 có test mang mã spec và qua, **trừ** case cần hợp đồng hoặc hóa đơn (spec 11 "HOLD contract removes the room", spec 12 "84 kWh", "0 kWh", spec 13 "HOLD contract cancels viewing B" – Phase 3/4); case spec 12 "20/10 vs 15/10" được kiểm qua helper `ratesAt(buildingId, date)`; BE `lint`, `test`, `test:e2e` và FE `lint`, `build`, `test:components` qua; kiểm DB vẫn 50/50.

Ngoài phạm vi: VIEW-05, VIEW-06 (cần hợp đồng – Phase 3), tính tiền điện/nước trên hóa đơn (Phase 4), "Việc hôm nay" đầy đủ NOTI-06 và thông báo (Phase 5), bộ chọn tòa 3D (`artifact_FE/2026-10-26-building-3d`, `home-3d`, vẫn tạm dừng).

## 2. Hiện trạng code (đọc 01/11/2026)

| Có sẵn | Dùng cho Phase 2 |
|---|---|
| Schema đủ bảng `buildings`, `rooms`, `room_images`, `room_prices`, `services`, `rate_plans`, `rate_tiers`, `viewings`; `constraints.sql`: 1 PENDING mỗi phòng (`room_prices_one_pending`) và mỗi khóa đơn giá (`rate_plans_one_pending`), **1 đơn giá APPROVED mỗi ngày hiệu lực** (`rate_plans_one_per_day`), mã phòng duy nhất trong tòa, quản lý ≤ 2 tòa (trigger), số điện thoại khách hợp lệ, mã tòa `^[A-Z0-9]{2,6}$`. Lưu ý: trigger quản lý chỉ chạy khi **đổi `manager_id`** và **đếm cả tòa đã khóa** vào giới hạn 2 tòa | **Không cần migration** (xem D2-16) |
| `src/common/guards`, `src/common/scope` (`allowedBuildingIds`, `scopeWhere`) | Lọc theo tòa (SCOPE-02) |
| `AuditService`; `ErrorCode` + `AllExceptionsFilter` (**lỗi Prisma đang ra 500**); `ResponseInterceptor` (**chưa có lối ra `meta`** cho danh sách – API-02) | Sửa ở P2-2 |
| `RateLimiter` (bộ nhớ), `SettingsService` (`/public/contact`) | Giới hạn theo IP; liên hệ Boss dự phòng |
| **Không có** hàm "hôm nay theo giờ Hà Nội" và hàm "đơn giá hiện hành" dùng chung | Thêm ở P2-2, dùng ở P2-4..P2-6 (CLAUDE.md BE: ngày tháng chỉ tính ở một helper) |
| Spec 01: danh sách module cố định (`auth`, `buildings`, `rooms`, `pricing`, `viewings`, `notifications`, `files`…), cron ở `src/jobs/`; "Việc hôm nay" = `GET /dashboard?buildingId` thuộc `notifications` (spec 19) | Bản 2 đặt sai (`public`, `staff`, `dashboard`, `/dashboard/today`, job trong `pricing`) → sửa ở P2-3..P2-6 |
| `REQUIRED_ENV` không có `CLOUDINARY_URL` (app chạy khi thiếu) | `/files/sign` phải báo lỗi rõ khi chưa cấu hình |
| Seed: 3 tòa (CG01, DD01 → Quản lý 1; HM01 không quản lý), 7 phòng (CG01/301 không giá; CG01/203 đang có hợp đồng ACTIVE), **mỗi phòng có giá đều có dòng `room_prices` APPROVED**, 4 dịch vụ/tòa, đơn giá đã duyệt (thiếu "Gửi xe điện"), chưa có ảnh | Dữ liệu thử ROOM-05, BLD-05; job giá và "phòng nổi bật" dựa được vào `room_prices` |
| FE `test:components` liệt kê **từng file** test trong `package.json` | Hai bản nháp FE song song cùng sửa `package.json` → xử lý ở P2-8a |
| e2e (`test/*.e2e-spec.ts`) chạy **trên DB dev**, chỉ đặt lại 5 tài khoản bằng `seed()` | Phase 2 e2e sẽ **tạo** tòa/phòng/đề xuất → rác trong DB dev, chạy lần 2 trùng mã → D2-14 |
| FE: `shared/api.ts`, `form-errors.ts`, `formatters.ts`, router 3 layout; kit `RoomSearch`, `RoomAccordion`, `FloorPlan`, `CostBreakdown`, `StatusBadge`, form pieces; `/` và `/phong` là `PlaceholderPage` | P2-8, P2-9 |

## 3. Quyết định đã có (chủ dự án, 01/11/2026)

| ID | Nội dung |
|---|---|
| D2-1 | Cài `@nestjs/schedule` cho job 01:00 (PRC-03) |
| D2-2 | Ước tính/tháng (A-05) = giá phòng + dịch vụ ROOM + dịch vụ PERSON × 1 (+ nước 1 người nếu tòa `PER_PERSON`); điện và nước theo m³ **không cộng**, hiện đơn giá kèm "chưa gồm điện, nước – tính theo đồng hồ của phòng" |
| D2-3 | 3 ca xem phòng: "Sáng (8:00–11:00)", "Chiều (14:00–17:00)", "Tối (18:00–20:00)"; lưu `MORNING`/`AFTERNOON`/`EVENING` |
| D2-4 | Duyệt đề xuất có `effective_from` < hôm nay → lỗi; đề xuất hiện "Quá hạn" ở cả Boss và quản lý; quản lý có "Đề xuất lại" |
| D2-5 | Trang Nhân sự = đủ AUTH-08; gán tòa ở trang Tòa nhà (thêm nút ở Nhân sự sau nếu cần, dùng lại API) |
| D2-6 | "Việc hôm nay": thẻ "Lịch hẹn mới" (VIEW-07) và, với Boss, "Giá chờ duyệt" |
| D2-7 | Mockup trước khi code trang công khai, dựng bằng bộ kit |
| D2-8 | Giới hạn lịch hẹn: theo số đếm trong bảng `viewings`; theo IP trong bộ nhớ |
| D2-9 | Khóa quản lý: giữ `manager_id`; trong lúc khóa, liên hệ công khai và việc của tòa chuyển cho Boss; mở khóa → quản lý tiếp; vẫn tính vào giới hạn 2 tòa |
| D2-10 | Seed không có ảnh; hiện khung "Chưa có ảnh" |
| D2-11 | Mã lỗi `PRICE_PROPOSAL_EXPIRED` (409, "Đề xuất đã quá ngày hiệu lực, vui lòng đề xuất lại") |
| D2-12 | "Gửi xe điện" 150.000 đ/xe/kỳ (tạm), seed đơn giá đã duyệt cho 3 tòa |
| D2-13 | Tiền cọc trên trang phòng = giá phòng 1 tháng |
| D2-14 | e2e chạy trên **DB dev**, không schema riêng, không thêm biến kết nối. Dữ liệu thử có tên `[E2E <runId>] …` và mã không trùng; ghi nhật ký lần chạy; cuối test vô hiệu hóa; dọn sót chỉ theo nhật ký và sau khi chủ dự án xem danh sách. Boss dùng tài khoản seed; quản lý do test tự tạo. Chi tiết ở "Bộ chạy e2e" (P2-2) |
| D2-15 | (Q2-8, làm rõ ở bản 4) Duyệt giá mới B (kể cả Boss tự đề xuất – PRC-04) → mọi giá **đã duyệt, chưa tới ngày** (`effective_from` > hôm nay) của cùng phòng / cùng khóa đơn giá (tòa, loại, dịch vụ) có `effective_from` **≥ ngày của B** chuyển `SUPERSEDED` "Đã thay thế", trong cùng transaction và **trước** khi ghi B (tránh `rate_plans_one_per_day`), ghi audit. Ví dụ: A từ 15/11 + B từ 10/11 → A bị thay; A từ 15/11 + B từ 20/11 → giữ cả hai (tăng theo bậc) |
| D2-16 | (Q2-9) Khóa tòa → tự bỏ gán quản lý (`manager_id = null`, audit `building.manager_change`); mở khóa thì Boss gán lại |
| D2-17 | Phòng/tòa ngừng công khai (khóa tòa, khóa phòng, bật bảo trì) khi còn lịch hẹn Mới / Đã xác nhận: **không tự hủy**; hộp xác nhận báo "Còn N lịch hẹn chưa xử lý"; lịch vẫn hiện để nhân viên gọi khách và tự chuyển trạng thái. Tòa đã bỏ gán quản lý (D2-16) → lịch vào thẻ của Boss (R2-11) |
| D2-18 | BLD-04: quản lý đang hoạt động nhưng chưa có `contact_phone` → hiện liên hệ của Boss; không bao giờ lộ số đăng nhập |

## 4. Quy tắc tôi đề xuất để vá chỗ spec chưa nói (duyệt kế hoạch = đồng ý, sửa dòng nào thì báo)

| ID | Lỗ hổng | Đề xuất |
|---|---|---|
| R2-1 | ROOM-05 chỉ đòi "tòa active", BLD-05 lại nói tòa chưa công khai khi thiếu phòng công khai / đơn giá điện, nước → có thể có phòng công khai trong tòa không công khai | Phòng công khai **cần thêm**: tòa có đơn giá ELECTRIC và WATER **đang hiệu lực** (APPROVED, `effective_from` ≤ hôm nay). Tòa công khai = tòa active có ≥ 1 phòng công khai |
| R2-2 | "Đơn giá hiện hành" chưa định nghĩa cho trang công khai | Một helper `ratesAt(buildingId, date)` = RATE-04 cho một ngày bất kỳ (Phase 4 gọi với `period_start`); trang công khai gọi với hôm nay: APPROVED có `effective_from` lớn nhất ≤ hôm nay; đơn giá đã duyệt cho tương lai hiện thêm dòng "Từ dd/mm/yyyy: …" |
| R2-3 | Hai giá phòng APPROVED cùng ngày hiệu lực (DB không chặn, khác `rate_plans`); server tắt lúc 01:00 | Giá hiện hành của phòng = APPROVED có `effective_from` lớn nhất ≤ hôm nay, trùng ngày thì `reviewed_at` muộn hơn thắng. Job **đồng bộ**: mỗi phòng, nếu có giá hiện hành và khác `rooms.price` thì ghi; **không bao giờ ghi `null`**; chạy lúc 01:00 giờ Hà Nội **và mỗi lần app khởi động** (server tắt qua đêm không làm sai giá cả ngày); chạy lại không đổi gì |
| R2-4 | Khách chọn ca đã qua trong hôm nay (vd 15:00 chọn "Sáng" hôm nay) | Từ chối ca đã **bắt đầu** trong ngày hôm nay (giờ Hà Nội), lỗi `VALIDATION_FAILED` + `fields.timeSlot` |
| R2-5 | Ngày xem không có giới hạn xa | Tối đa 30 ngày tính từ hôm nay |
| R2-6 | Nhãn tiếng Việt cho trạng thái lịch hẹn và đề xuất chưa có (UI-02 đòi một bảng chung) | Lịch hẹn: Mới · Đã xác nhận · Đã chốt · Không thành · Đã hủy. Đề xuất: Chờ duyệt · Đã duyệt · Từ chối · Đã thay thế · Quá hạn (suy ra). Ghi vào spec 12, 13 ở P2-1 |
| R2-7 | Ảnh: chưa có giới hạn và kiểm nguồn | Tối đa 10 ảnh/phòng. `POST /files/sign` nhận `roomId` và **kiểm phạm vi tòa** (quản lý không xin được chữ ký cho thư mục tòa khác); chữ ký cố định `folder = rooms/<buildingId>/<roomId>`, `allowed_formats = jpg,png,webp` và thu nhỏ khi tải lên (`c_limit`, cạnh dài ≤ 1920 px). 5 MB kiểm ở FE (Cloudinary không ký được giới hạn dung lượng – `shortcut`, chặn thật bằng upload preset nếu cần). API gắn ảnh **chỉ nhận `publicId`** (+ `version`, `format`) đúng thư mục đó; **URL do BE dựng**, không nhận URL từ client. Xóa ảnh: xóa dòng `room_images` (bảng không có lịch sử, không có `is_active`) rồi gọi Cloudinary xóa (ký bằng `node:crypto`, lỗi thì ghi log, không chặn) |
| R2-8 | Khóa tòa chưa có luật | Chỉ Boss; chỉ khi không phòng nào có hợp đồng HOLD/ACTIVE (giống ROOM-04); mở khóa lại được. Quản lý của tòa khi khóa: theo D2-16 |
| R2-9 | Trang chủ "phòng nổi bật" chưa có tiêu chí | 6 phòng công khai có giá được duyệt gần nhất |
| R2-10 | Sắp xếp danh sách tìm phòng | Mặc định giá tăng dần; thêm "Mới nhất" (cùng thứ tự với R2-9: giá hiện hành duyệt gần nhất) |
| R2-11 | Thẻ "Lịch hẹn mới" của Boss đếm gì | Quản lý: lịch hẹn NEW của tòa mình. Boss: lịch hẹn NEW của tòa **không có quản lý đang hoạt động** (việc Boss phải làm); trang Lịch hẹn của Boss vẫn thấy mọi tòa |
| R2-12 | Đề xuất của Boss khi đã có đề xuất PENDING của quản lý | Đề xuất Boss duyệt ngay (PRC-04) và đề xuất PENDING cũ thành "Đã thay thế" trong cùng transaction |
| R2-13 | Đổi giờ/ca lịch hẹn | Chỉ khi trạng thái Mới hoặc Đã xác nhận; ca và ngày theo R2-4, R2-5 |
| R2-14 | Ước tính D2-2 khi một dịch vụ ROOM/PERSON chưa có đơn giá hiện hành, hoặc dịch vụ đã khóa | Dịch vụ đã khóa: bỏ hẳn. Dịch vụ chưa có giá: không cộng, ước tính ghi thêm "chưa gồm: <tên dịch vụ> (chưa có giá)". Đề xuất đơn giá cho dịch vụ đã khóa → `VALIDATION_FAILED` |
| R2-15 | Giới hạn 3 lịch/ngày theo số điện thoại (D2-8) đếm gì | Đếm lịch `source = WEB` của số đó tạo trong **ngày hôm nay giờ Hà Nội**; lịch nhân viên nhập tay và lần gửi bị honeypot bỏ đi không tính. Đếm và ghi trong một transaction có `pg_advisory_xact_lock` theo số điện thoại, để 2 lần gửi cùng lúc không lọt thành 4 |
| R2-16 | Thẻ "Giá chờ duyệt" của Boss (D2-6) có đếm đề xuất quá hạn | Chỉ đếm đề xuất còn hạn; đề xuất "Quá hạn" hiện riêng trên trang Duyệt giá (Boss chỉ từ chối được) và trên lưới phòng / Đơn giá của quản lý (nút "Đề xuất lại") |
| R2-17 | "% thay đổi" trên trang Duyệt giá với giá điện nhiều bậc | Giá phòng, nước, dịch vụ (1 bậc): cũ → mới + %. Điện: bảng từng bậc cũ → mới, mỗi bậc có %; khác số bậc thì chỉ hiện hai bảng, không %. % do BE tính (UI-06), làm tròn 1 chữ số thập phân |
| R2-18 | Mã phòng của phòng đã khóa | Vẫn chiếm mã (DB `UNIQUE` trong tòa); lỗi trùng mã ghi "Mã phòng đã có trong tòa (kể cả phòng đã khóa)". Lưới tầng mặc định ẩn phòng đã khóa, có công tắc "Hiện phòng đã khóa"; danh sách tòa của Boss cũng vậy ("Hiện tòa đã khóa"). Tạo phòng trong tòa đã khóa → `CONFLICT_STATE` |
| R2-19 | VIEW-04 có `WON`, nhưng "Đã chốt" chỉ sinh ra khi tạo hợp đồng (VIEW-05, Phase 3); DB không chặn `WON` thiếu `contract_id` | Phase 2 `PATCH /viewings` chỉ cho: NEW → CONFIRMED; CONFIRMED → LOST (ghi chú bắt buộc); NEW/CONFIRMED → CANCELLED. Không có lối đặt `WON` bằng tay; nút "Chốt" chưa hiện tới Phase 3. Sai luồng → `CONFLICT_STATE` |
| R2-20 | API công khai lộ sự tồn tại của phòng/tòa không công khai; honeypot lộ qua phản hồi khác | `GET /public/rooms/:id`, `/public/buildings/:id` của phòng/tòa không công khai → 404 `NOT_FOUND`. `POST /public/viewings` thành công và honeypot trả **cùng một** body, không có id lịch hẹn |
| R2-21 | Lịch nhân viên nhập tay (VIEW-03) có theo luật ngày/ca không | Cùng R2-4, R2-5 như khách; phòng không cần đang công khai (khách gọi hỏi phòng sắp trống), nhưng phòng phải còn hoạt động và trong phạm vi |

## 5. Các phần và thứ tự

```
P2-0 setup ─► P2-1 spec + file feature ─► P2-2 BE nền ─► P2-3 BE tòa/dịch vụ/nhân sự ─► P2-4 BE phòng + ảnh ─► P2-5 BE giá + job ─► P2-6 BE công khai + lịch hẹn
                     └─► P2-7 mockup (song song với BE)        P2-8a FE tòa/nhân sự/phòng (sau P2-4 và P2-7 duyệt) ─► P2-8b FE giá/lịch hẹn/việc hôm nay (sau P2-6)
                                                               P2-9 FE công khai (sau P2-6 và P2-8a) ──────────────────────────────────────► P2-10 QA + chốt
```

P2-7 phải được duyệt **trước P2-8a** (lưới tầng `/ql/phong` nằm trong mockup), không chỉ trước P2-9.

BE chạy **lần lượt** (mỗi phần sửa `app.module.ts`, mà `apply-draft.mjs` chặn khi file đích đổi sau commit gốc). FE: **P2-8a dựng sẵn khung** – mọi route và mục menu Phase 2 trỏ tới trang tạm "Đang làm", và `test:components` thêm một mục `tests/p2/*.test.mjs` – nên P2-8b và P2-9 chỉ sửa file riêng của mình, chạy **song song** được mà không phải gộp. Song song được: **P2-8a ∥ P2-5/P2-6** và **P2-8b ∥ P2-9**. Thành phần kit mới (`src/components/`, `index.ts`) chỉ thêm ở P2-8a; nếu P2-8b hoặc P2-9 cần thêm kit thì dừng và hỏi, vì hai bên sẽ cùng sửa `index.ts`. Khi chạy song song: `main-files.mjs save` một lần trước khi giao cả hai, `check` sau mỗi lần một orchestrator trả lời. Giữa các phần: duyệt → chép → kiểm trên file chính → **commit** → dọn `approved/`.

### P2-0 · Setup (tay)

- **Mục tiêu:** đủ tài khoản, biến môi trường, gói.
- **File:** `Source/backend/.env` (chủ dự án), `package.json` + lock (cài thẳng).
- **Việc:** commit trạng thái hiện tại (bản agent mới đã vào `f454cb3`); tạo Cloudinary, điền `CLOUDINARY_URL`; `npm install --save-exact @nestjs/schedule@<bản tương thích Nest 12, kiểm lúc cài>`. Không thêm biến kết nối nào cho e2e (D2-14).
- **Kiểm tra:** `npm run build`, `npm run test` qua; `.env` không trong `git status`.
- **Hoàn thành khi:** đủ các mục trên.

### P2-1 · Spec và file feature (bản nháp `Artifacts/`, không pipeline)

- **Mục tiêu:** spec khớp D2-x và R2-x trước khi agent đọc; có file task cho từng phần.
- **File:** `docs/spec/00-overview.md` (A-03, A-05), `11-buildings-rooms.md` (R2-1, R2-7, R2-8, R2-14, R2-18, R2-20, D2-16, D2-17, D2-18, `monthlyEstimate`), `12-pricing.md` (D2-4, R2-2, R2-3, R2-6, R2-12, R2-16, R2-17, D2-15), `13-viewings.md` (D2-3, D2-8, R2-4, R2-5, R2-6, R2-11, R2-13, R2-15, R2-19, R2-21), `10-auth.md` (D2-9; `/managers` trong module `auth`; việc tồn AUTH-T3 "các phiên khác"), `01-architecture.md` (`PRICE_PROPOSAL_EXPIRED`, `UPLOAD_NOT_CONFIGURED` 503 "Chưa cấu hình tải ảnh"; dòng cron 01:00 thêm "và khi khởi động"; bỏ `OUT_OF_SCOPE` cho người thuê), `19-notifications.md` (Phase 2 chỉ trả 2 nhóm của D2-6), `30-frontend.md` (`/ql` hai thẻ), `docs/phase-1-foundation/feature_p1-1-backend-foundation.md` (lệnh kiểm DB `… . prisma`); mới: `docs/phase-2-rooms/README.md` + `feature_p2-<n>-*.md` (task `BE-ROOM-xx` / `FE-ROOM-xx`, mỗi task có "Done when").
- **Kiểm tra:** diff từng file; link trong spec còn đúng; mỗi luật mới có ID.
- **Hoàn thành khi:** chủ dự án duyệt, bản nháp được chép và commit.

### P2-2 · BE nền dùng chung (pipeline)

- **Mục tiêu:** gom mọi thứ các phần sau cùng cần, để không phần nào tự viết lại.
- **File dự kiến:** `src/common/errors/{all-exceptions.filter,error-code}.ts`; `src/common/response.interceptor.ts` (`{ data, meta }`); `src/common/date/today.ts` (hôm nay giờ Hà Nội, so sánh ngày); `src/common/rates/rates-at.ts` (`ratesAt(buildingId, date)`, giá phòng hiện hành R2-2, R2-3); `src/common/rooms/public-room.ts` (điều kiện ROOM-05 + R2-1 dạng Prisma `where`); `src/modules/files/*` (`POST /files/sign`, xác minh URL/`publicId` của Cloudinary – R2-7; thiếu `CLOUDINARY_URL` → `UPLOAD_NOT_CONFIGURED`, app vẫn chạy); `prisma/seed.ts` (D2-12); `test/e2e-run.ts` (bộ chạy e2e bên dưới); `test/e2e-cleanup.mjs`; `.gitignore` (`test/e2e-runs/`); `.env.example`. Không sửa spec (đã xong ở P2-1).
- **Việc:** ánh xạ lỗi Prisma/Postgres theo tên ràng buộc (`users_phone_key` → `PHONE_TAKEN`, trùng mã phòng → `VALIDATION_FAILED` + `fields.code`, `rate_plans_one_per_day` và `*_one_pending` → `CONFLICT_STATE`, trigger `MANAGER_MAX_2_BUILDINGS`); thêm `PRICE_PROPOSAL_EXPIRED`; lối ra `meta` (`page`, `limit`, `total`); các helper trên; chữ ký tải ảnh; seed "Gửi xe điện"; bộ chạy e2e (D2-14).
- **Bộ chạy e2e (D2-14), dùng cho mọi e2e từ P2-3:**
  - **Mã lần chạy** `runId` (ngày giờ + 4 ký tự ngẫu nhiên), **một `runId` và một nhật ký cho mỗi file e2e** (vitest có thể chạy các file song song). Tên mọi bản ghi thử bắt đầu bằng `[E2E <runId>]` (tòa, quản lý, khách xem phòng; dịch vụ dùng `[E2E] …` vì tên tối đa 50 ký tự).
  - **Mã không trùng:** mã tòa `E2` + 4 ký tự `A-Z0-9` ngẫu nhiên (đúng 6 ký tự, vd `E2A1B2`), kiểm trước trong DB, trùng thì sinh lại. Mã phòng chỉ cần không trùng trong tòa thử. Số điện thoại quản lý thử và khách thử: `09` + 8 số ngẫu nhiên, kiểm trước, trùng thì sinh lại. Mật khẩu quản lý thử sinh ngẫu nhiên, chỉ giữ trong bộ nhớ.
  - **Tài khoản:** Boss = tài khoản seed hiện có (không sửa). Quản lý = do test tạo qua API, không dùng Quản lý 1 / Quản lý 2 của dev. Test không sửa tòa, phòng, đơn giá dev; chỉ đọc chúng (vd CG01/203 không công khai).
  - **Nhật ký** `test/e2e-runs/<runId>.json` (không commit): `runId`, giờ bắt đầu/kết thúc, trạng thái `RUNNING` → `CLEANED` hoặc `FAILED_CLEANUP`, và ID theo bảng (`buildings`, `rooms`, `services`, `users`, `room_prices`, `rate_plans`, `viewings`, `room_images`) kèm mã tòa. Ghi thêm **ngay sau mỗi lần tạo**, nên lần chạy bị ngắt vẫn để lại dấu. Không ghi mật khẩu, token, cookie, chuỗi kết nối.
  - **Cuối test (`afterAll`), chỉ đụng ID trong nhật ký:** lịch hẹn NEW/CONFIRMED → `CANCELLED` (ghi chú "[E2E] dọn dữ liệu thử"); đề xuất giá/đơn giá PENDING → `REJECTED` (cùng ghi chú); phòng, dịch vụ, tòa → `is_active = false`; quản lý thử → `is_active = false` và thu hồi phiên. Bản ghi đã duyệt (giá, đơn giá) và ảnh giữ nguyên làm lịch sử; không xóa cứng gì.
  - **Không đụng dữ liệu dev qua đường vòng:** job giá (R2-3) trong e2e chạy với bộ lọc `roomIds` của phòng thử; giới hạn theo IP (bộ nhớ) được đặt lại giữa các test, nếu không lần gửi lịch thứ 6 trong một lần chạy sẽ bị 429. Test đọc seed (CG01/203 có hợp đồng, CG01/301 không giá) dựa vào `seed()` mà e2e Phase 1 đã gọi; không sửa chúng.
  - **So sánh trong test** chỉ trên dữ liệu của lần chạy (lọc theo ID tòa thử) hoặc so trước/sau, vì DB dev thay đổi (vd số đếm "Việc hôm nay", 6 phòng nổi bật).
  - **Dọn sót** `node test/e2e-cleanup.mjs`: mặc định chỉ **liệt kê** – đọc mọi nhật ký chưa `CLEANED`, đối chiếu từng ID với DB (còn hoạt động không, có hợp đồng/hóa đơn dính vào không), và liệt kê riêng bản ghi có tên `[E2E` mà **không có trong nhật ký nào** (chỉ báo, không bao giờ tự xử lý). `--apply <runId>` chỉ vô hiệu hóa ID của nhật ký đó, chỉ chạy bởi phiên chính sau khi chủ dự án xem danh sách và đồng ý.
- **Kiểm tra:** unit test mỗi ánh xạ lỗi, mỗi helper (gồm qua nửa đêm giờ Hà Nội, trùng ngày R2-3), chữ ký so với vector mẫu Cloudinary, seed chạy 2 lần; bộ chạy e2e: sinh mã 6 ký tự, trùng thì sinh lại, nhật ký không chứa mật khẩu/token, `afterAll` vô hiệu hóa đúng ID; `e2e-cleanup.mjs` chế độ liệt kê không ghi DB; e2e Phase 1 vẫn 17/17.
- **Hoàn thành khi:** lint, test, build, e2e qua; không lỗi ràng buộc nào ra 500 trong test; chạy e2e 2 lần liên tiếp đều qua và nhật ký cả hai lần là `CLEANED`.

### P2-3 · BE tòa nhà, dịch vụ, nhân sự (pipeline)

- **Mục tiêu:** BLD-01..04, SVC-01..03, AUTH-08, D2-5, D2-9, R2-8.
- **File dự kiến:** `src/modules/buildings/*` (gồm dịch vụ), `src/modules/auth/managers.{controller,service}.ts` (`/managers`, AUTH-08 thuộc module `auth` – không tạo module `staff`), `app.module.ts`.
- **Việc:** `GET/POST/PATCH /buildings` (mã tòa `^[A-Z0-9]{2,6}$`, tự viết hoa; POST, trường gán, khóa: Boss; khóa tòa theo R2-8 + D2-16 + D2-17, `?includeInactive=true` cho Boss (R2-18); quản lý chỉ sửa `amenities` – mảng chuỗi – và `description` tòa mình, sửa trường khác → 403); liên hệ công khai tính lúc đọc (BLD-04 + D2-9 + D2-18); `GET/POST/PATCH /services` (POST/PATCH Boss, khóa thay xóa; dịch vụ chưa có đơn giá hiện "Chưa có giá"); `GET/POST/PATCH /managers` (tạo với mật khẩu tạm trả về một lần, khóa → thu hồi phiên, không đổi `manager_id`); audit `building.manager_change`, `manager.create`, `manager.deactivate`.
- **Kiểm tra:** test mỗi luật mang mã; acceptance spec 11 "Manager cannot change code/address/manager_id (403)", "Building with manager deactivated shows Boss's contact"; quản lý thứ 3 tòa → `MANAGER_MAX_2_BUILDINGS`; khóa tòa → `manager_id = null` và quản lý nhận được tòa khác (D2-16); quản lý không có `contact_phone` → liên hệ Boss (D2-18).
- **Hoàn thành khi:** test, e2e qua.

### P2-4 · BE phòng và ảnh (pipeline)

- **Mục tiêu:** ROOM-01..05, trạng thái phòng suy ra, R2-7.
- **File dự kiến:** `src/modules/rooms/*`, `src/modules/rooms/room-status.ts`.
- **Việc:** `GET/POST/PATCH /rooms` trong phạm vi (không ghi `price`; `furniture` là mảng chuỗi); bảo trì / khóa chỉ khi không HOLD/ACTIVE (ROOM-03/04), trả số lịch hẹn còn treo để FE cảnh báo (D2-17); `/rooms/:id/images` thêm (chỉ `publicId`), xóa, sắp xếp (R2-7); danh sách cho lưới tầng: tầng, mã, diện tích, giá, trạng thái (Đang thuê, Đã cọc, Bảo trì, Trống), đề xuất đang chờ / quá hạn, số ảnh; `?includeInactive=true` cho R2-18; lỗi trùng mã theo R2-18.
- **Kiểm tra:** test ROOM-01..05, thứ tự trạng thái, phạm vi tòa (SCOPE-02), `publicId` sai thư mục → 400, quản lý xin chữ ký cho phòng tòa khác → `OUT_OF_SCOPE`, ảnh thứ 11 → lỗi, tạo phòng trong tòa khóa → `CONFLICT_STATE`.
- **Hoàn thành khi:** test, e2e qua.

### P2-5 · BE giá, duyệt giá, job 01:00 (pipeline)

- **Mục tiêu:** PRC-01..05, RATE-01..05, D2-1, D2-4, R2-3, R2-12, R2-14 (dịch vụ khóa), R2-16, R2-17, D2-15.
- **File dự kiến:** `src/modules/pricing/*`, `src/jobs/room-price-sync.job.ts` (theo spec 01: cron ở `src/jobs/`), `app.module.ts` (`ScheduleModule`, tắt trong test).
- **Việc:** đề xuất giá phòng / đơn giá (`effectiveFrom` ≥ hôm nay, thay thế PENDING cũ trong một transaction); Boss đề xuất → duyệt luôn (R2-12); duyệt/từ chối bằng cập nhật có điều kiện `status = PENDING` (0 dòng → `CONFLICT_STATE`, chặn hai Boss bấm cùng lúc), ghi chú bắt buộc khi từ chối; duyệt khi `effective_from` < hôm nay → `PRICE_PROPOSAL_EXPIRED`; danh sách trả cờ `expired`; "Đề xuất lại"; RATE-02 kiểm bậc; duyệt giá phòng có `effective_from` = hôm nay → đồng bộ `rooms.price` ngay trong cùng transaction; giá đã duyệt chưa tới ngày theo D2-15; job R2-3 (01:00 + khi khởi động, nhận bộ lọc `roomIds` cho test); audit `price.propose/approve/reject`; endpoint trang Duyệt giá theo R2-17 (giá cũ null → "Giá mới", không %).
- **Kiểm tra:** test PRC-01..05, RATE-01..05, acceptance spec 12 "Two quick proposals → exactly one PENDING", "Rate approved effective 20/10 does not apply to a period starting 15/10" (qua `ratesAt`), duyệt quá hạn, duyệt hai lần cùng lúc, D2-15 cả hai ví dụ (B 10/11 thay A 15/11; B 20/11 giữ A) cho giá phòng và cho đơn giá, job idempotent, job không ghi `null`, job khi khởi động sửa giá của ngày đã lỡ.
- **Hoàn thành khi:** test, e2e qua; giá công khai không đổi trước khi duyệt.

### P2-6 · BE công khai, lịch hẹn, việc hôm nay (pipeline)

- **Mục tiêu:** VIEW-01..04, VIEW-07, BLD-05, ROOM-05 qua API công khai, D2-2, D2-3, D2-6, D2-8, R2-1, R2-4, R2-5, R2-9..R2-11, R2-13..R2-16, R2-19..R2-21.
- **File dự kiến:** controller công khai đặt trong module sở hữu dữ liệu (không tạo module `public`): `src/modules/buildings/public-buildings.controller.ts` (`/public/locations`, `/public/buildings/:id`), `src/modules/rooms/public-rooms.controller.ts` (`/public/rooms`, `/public/rooms/:id`, `/public/featured-rooms`); `src/modules/viewings/*`; `src/modules/notifications/dashboard.{controller,service}.ts` (`GET /dashboard`, spec 19; Phase 5 thêm phần còn lại vào đây).
- **Việc:** `GET /public/locations`, `/public/rooms` (lọc, sắp xếp R2-10, `meta`), `/public/rooms/:id` (ảnh, giá, nội thất, tiền cọc D2-13, liên hệ, đơn giá hiện hành + sắp tới, `monthlyEstimate` D2-2 + R2-14), `/public/buildings/:id`, `/public/featured-rooms` (R2-9); `POST /public/viewings` (honeypot → 200 bỏ qua; giới hạn D2-8 + R2-15 → 429; phòng không công khai → `ROOM_NOT_AVAILABLE`); `GET/POST/PATCH /viewings` (luồng R2-19 bằng cập nhật có điều kiện, `handled_by_id`, LOST cần ghi chú; nhập tay theo R2-21); 404 / body chung theo R2-20; `GET /dashboard?buildingId` (R2-11, R2-16). Không trả trường nội bộ (id người dùng, ghi chú nội bộ) ra API công khai.
- **Kiểm tra:** acceptance spec 11 "price = null never appears", spec 13 "non-public room → ROOM_NOT_AVAILABLE", "4th submission same phone → 429"; test D2-2 cho tòa PER_M3 và PER_PERSON, R2-14 (dịch vụ chưa có giá, dịch vụ khóa); R2-15 (lịch tay không tính; 2 lần gửi song song khi đã có 2 lịch → chỉ 1 lọt); R2-19 (không đặt được `WON`, NEW → LOST bị chặn); R2-20 (phòng không công khai → 404, honeypot cùng body); e2e trên seed: CG01/203 và CG01/301 không xuất hiện.
- **Hoàn thành khi:** test, e2e qua.

### P2-7 · Mockup (bản nháp `artifact_FE/…-phase2-mockup`, không pipeline)

- **Mục tiêu:** chủ dự án duyệt bố cục trước khi code.
- **File:** `preview.html` + `.tsx` mẫu trong thư mục nháp, chỉ dùng bộ kit, dữ liệu giống seed; ảnh chụp 360 px và máy tính trong `ref/`.
- **Việc:** 4 trang công khai (`/`, `/phong`, `/toa/:id`, `/phong/:id` có form 3 ca, ước tính D2-2, cọc D2-13, khung "Chưa có ảnh") + **2 màn hình nhân sự khó hình dung**: lưới tầng `/ql/phong` và `/ql/duyet-gia` (cũ → mới, %, "Quá hạn"). Ghi rõ chỗ lệch spec.
- **Kiểm tra:** mở được, không tràn ngang 360 px, bàn phím đi hết.
- **Hoàn thành khi:** chủ dự án duyệt (mockup không chép vào file chính).

### P2-8a · FE tòa nhà, nhân sự, phòng (pipeline, sau P2-4)

- **Mục tiêu:** quản lý / Boss dựng dữ liệu tòa và phòng trên trình duyệt.
- **File dự kiến:** `src/pages/staff/{BuildingsPage,BuildingDetailPage,StaffListPage,RoomsPage}.tsx`, `src/features/{buildings,staff,rooms,uploads}/*`, `src/app/routes.tsx`, `src/layouts/StaffLayout.tsx` (menu theo vai trò, bộ chọn tòa: Boss có "Tất cả tòa", nhớ lựa chọn trong phiên), `src/shared/status-labels.ts` (R2-6), kit mới nếu dùng chung (`ConfirmDialog` UI-04, `ImageUploader`) theo KIT-07.
- **Việc:** **khung Phase 2 trước**: mọi route Phase 2 (`/ql/don-gia`, `/ql/duyet-gia`, `/ql/lich-hen`, `/toa/:id`, `/phong/:id`…) và mục menu trỏ tới file trang riêng, tạm hiện "Đang làm"; `package.json` `test:components` thêm `tests/p2/*.test.mjs` (Node ≥ 22 tự mở glob) để P2-8b, P2-9 chỉ thêm file test vào `tests/p2/`. Sau đó: `/ql/toa-nha` + `/:id` (Boss tạo, gán quản lý, dịch vụ, khóa có hộp xác nhận D2-16 + D2-17; quản lý sửa tiện ích/mô tả), `/ql/nhan-su` (D2-5), `/ql/phong` (lưới tầng theo mockup, R2-18, tạo/sửa, hộp xác nhận D2-17 khi khóa / bảo trì, tải ảnh thẳng lên Cloudinary qua `/files/sign`, `UPLOAD_NOT_CONFIGURED` hiện chữ của API); mỗi danh sách đủ 4 trạng thái (UI-03).
- **Kiểm tra:** test Node mang mã spec (menu theo vai trò, form, lỗi API vào ô); `preview.html`; sau khi chép: thử tay với API thật.
- **Hoàn thành khi:** lint, build, `test:components` qua (chạy script của **bản nháp**).

### P2-8b · FE giá, lịch hẹn, việc hôm nay (pipeline, sau P2-6)

- **Mục tiêu:** luồng đề xuất → duyệt giá và xử lý lịch hẹn.
- **File dự kiến:** `src/pages/staff/{RatesPage,PriceApprovalPage,ViewingsPage}.tsx`, `StaffHomePage.tsx`, `src/features/{pricing,viewings,dashboard}/*`, `RoomsPage.tsx` (nút "Đề xuất giá", "Quá hạn", "Đề xuất lại"), `tests/p2/*`. Không sửa `routes.tsx`, `package.json` (khung P2-8a).
- **Việc:** `/ql/don-gia`, `/ql/duyet-gia` (Boss, hộp xác nhận số tiền UI-04, báo khi duyệt sẽ thay giá đã duyệt khác theo D2-15), `/ql/lich-hen` (theo ngày, thêm tay, nút gọi / Zalo, đổi trạng thái theo R2-19, chưa có nút "Chốt"), `/ql` hai thẻ (D2-6).
- **Kiểm tra / hoàn thành:** như P2-8a; luồng "quản lý đề xuất → Boss duyệt → giá đổi" chạy trên trình duyệt.

### P2-9 · FE công khai (pipeline, sau P2-6 và P2-7 duyệt)

- **Mục tiêu:** khách tìm phòng và đặt lịch.
- **File dự kiến:** `src/pages/public/{HomePage,RoomSearchPage,BuildingPage,RoomPage}.tsx` (file đã có từ khung P2-8a), `src/features/public-rooms/*`, `PublicLayout.tsx` (menu "Tìm phòng"), `tests/p2/*`. Không sửa `routes.tsx`, `package.json`.
- **Việc:** theo mockup đã duyệt; bộ lọc lưu trên URL; form lịch hẹn (zod giống BE, honeypot ẩn, lỗi 429 / `ROOM_NOT_AVAILABLE` hiện chữ của API); ước tính lấy từ API (UI-06); ảnh có `alt` (UI-08).
- **Kiểm tra:** test Node bộ lọc ↔ URL, form, ước tính; xem 360 px.
- **Hoàn thành khi:** lint, build, `test:components` qua; khách đặt được lịch trên trình duyệt với API thật.

### P2-10 · QA và chốt (tay)

- **Mục tiêu:** điều kiện thoát (mục 1).
- **File:** `docs/phase-2-rooms/feature_p2-10-qa.md`, "Status" trong `CLAUDE.md` và `docs/spec/README.md` (bản nháp).
- **Việc:** danh sách kiểm tay tiếng Việt từng bước; acceptance spec 11, 12, 13; 360 px, bàn phím; kiểm DB 50/50; dọn dữ liệu thử.
- **Hoàn thành khi:** mọi bước đạt; "Status" chuyển sang Phase 3 · Contracts.

## 6. Cách chạy pipeline

Như Phase 1: thư mục nháp + `REVIEW.md`, task `[~]`, `main-files.mjs save`, orchestrator **mới cho mỗi phần** (dùng model trong `.claude/agents/`), kèm ràng buộc: `REVIEW.md` do phiên chính giữ; chỉ ghi DB dev qua `npm run test:e2e` (bộ chạy D2-14), không chạy `e2e-cleanup.mjs --apply`, không đọc `.env`; gói mới phải hỏi; tester chạy `test:components` với `package.json` của bản nháp và tắt dev server trước khi báo cáo; chữ hiển thị theo spec; spec không trả lời → hỏi. Sau mỗi phần: `check`, tự chạy lại test, trình duyệt, chép, kiểm trên file chính, commit, dọn `approved/`.

## 7. Thay đổi (lỗ hổng đã vá)

### Bản 4 so với bản 3

1. **Có thể "Đã chốt" lịch hẹn mà không có hợp đồng:** VIEW-04 cho `WON`, DB không chặn thiếu `contract_id`, mà hợp đồng là Phase 3 → R2-19 (Phase 2 không có lối đặt `WON`; LOST chỉ từ Đã xác nhận).
2. **D2-15 xóa mất lịch tăng giá theo bậc** (duyệt B 20/11 sẽ thay cả A 15/11) → làm rõ: chỉ thay giá có ngày ≥ ngày của B; thay trước khi ghi B để không vướng `rate_plans_one_per_day`.
3. **Lịch hẹn treo khi phòng/tòa ngừng công khai** chưa có luật → D2-17 (không tự hủy, cảnh báo).
4. **Quản lý chưa có số liên hệ** thì BLD-04 không rõ, có thể lộ số đăng nhập → D2-18.
5. **Ảnh – lỗ hổng phạm vi:** `/files/sign` không kiểm tòa, nên quản lý xin được chữ ký cho thư mục tòa khác; client gửi URL tùy ý; giới hạn 5 MB không ký được → R2-7 viết lại (kiểm phạm vi, chỉ nhận `publicId`, BE dựng URL, thu nhỏ khi tải lên).
6. **Giới hạn 3 lịch/số lọt khi gửi song song** (đếm rồi ghi) → khóa `pg_advisory_xact_lock` theo số (R2-15).
7. **API công khai lộ phòng/tòa ẩn và lộ honeypot** qua phản hồi khác nhau → R2-20.
8. **Lịch nhập tay** chưa rõ có theo luật ngày/ca và có cần phòng công khai → R2-21.
9. **Thứ tự sai:** P2-8a dựng lưới tầng nhưng chỉ P2-9 chờ mockup → P2-7 phải duyệt trước P2-8a.
10. **Còn một chỗ xung đột FE:** kit `index.ts` → chỉ P2-8a thêm kit; song song thì `save` một lần, `check` sau mỗi lần trả lời.
11. **e2e song song nhiều file** dùng chung nhật ký → một `runId` cho mỗi file.
12. **Gốc cũ** (`eac272b`, trước commit agent `f454cb3`) → cập nhật Gốc; bỏ bước commit bản nháp agent ở P2-0. Thêm "Hiện tòa đã khóa", chặn tạo phòng trong tòa khóa, % làm tròn ở BE.

### Bản 3 so với bản 2

1. **Sai cấu trúc so với spec 01:** bản 2 tạo module `public`, `staff`, `dashboard`, job trong `pricing` và đường dẫn `/dashboard/today`. Spec có danh sách module cố định, cron ở `src/jobs/`, "Việc hôm nay" là `GET /dashboard?buildingId` của `notifications`. Đã sửa ở P2-3..P2-6.
2. **Server tắt lúc 01:00 làm sai giá cả ngày:** bản 2 chỉ bù ở lần 01:00 kế tiếp → job đồng bộ chạy thêm **khi khởi động** và không bao giờ ghi `null` (R2-3).
3. **Giá đã duyệt cho ngày tương lai không hủy được:** quy tắc "thay thế" chỉ áp cho PENDING → D2-15.
4. **Tòa đã khóa vẫn chiếm chỗ trong giới hạn 2 tòa** (trigger đếm cả tòa khóa), trong khi quản lý không còn thấy tòa đó (SCOPE-02 bỏ tòa khóa) → D2-16.
5. **Duyệt hai lần cùng lúc** (hai tab, bấm đúp) có thể ghi đè: thêm cập nhật có điều kiện `status = PENDING` → `CONFLICT_STATE` (P2-5, P2-6).
6. **Ước tính khi dịch vụ chưa có giá hoặc đã khóa** chưa có luật → R2-14.
7. **Giới hạn 3 lịch/ngày/số** đếm cả lịch nhập tay và chưa rõ "ngày" theo múi giờ nào → R2-15.
8. **Thẻ "Giá chờ duyệt" đếm cả đề xuất quá hạn** mà Boss không duyệt được nữa → R2-16. **"% thay đổi" của giá điện nhiều bậc** không định nghĩa → R2-17.
9. **e2e chạm dữ liệu dev qua đường vòng:** job giá chạy trên mọi phòng; giới hạn IP trong bộ nhớ làm lần gửi thứ 6 bị 429 → job có bộ lọc `roomIds`, giới hạn IP đặt lại giữa các test.
10. **FE song song vẫn xung đột** ở `routes.tsx` và danh sách file test trong `package.json` → P2-8a dựng khung route + glob `tests/p2/`; P2-8b ∥ P2-9 không phải gộp.
11. **Thiếu `CLOUDINARY_URL`** (không bắt buộc khi khởi động) làm `/files/sign` lỗi 500 → `UPLOAD_NOT_CONFIGURED` 503.
12. **Helper đơn giá chỉ cho "hôm nay"** thì Phase 4 phải viết lại → `ratesAt(buildingId, date)` dùng chung; điều kiện thoát ghi rõ case acceptance nào để Phase 3/4.

### Bản 2 so với bản 1

1. **e2e làm bẩn DB dev:** Phase 2 e2e tạo dữ liệu (không được xóa cứng) → chạy lần 2 trùng mã. Chủ dự án chọn D2-14 (DB dev + dữ liệu `[E2E]` + nhật ký + vô hiệu hóa); bộ chạy ở P2-2.
2. **Code dùng chung bị viết hai lần ở hai phần song song** (điều kiện phòng công khai, đơn giá hiện hành, "hôm nay" giờ Hà Nội, `meta`): dồn hết vào P2-2.
3. **Song song bị `apply-draft.mjs` chặn:** P2-5 ∥ P2-6 cùng sửa `app.module.ts`, P2-8 ∥ P2-9 cùng sửa `routes.tsx` → chạy lần lượt, chỉ song song BE ∥ FE.
4. **P2-8 quá lớn (7 trang):** tách P2-8a (sau P2-4, bắt đầu sớm hơn) và P2-8b.
5. **Thiếu luật** cho 13 chỗ spec im lặng (R2-1..R2-13), trong đó R2-1 (phòng công khai trong tòa chưa công khai), R2-3 (hai giá cùng ngày), R2-4 (chọn ca đã qua), R2-7 (kiểm nguồn ảnh – lỗ hổng bảo mật) là lỗi logic thật.
6. **Job 01:00 chỉ áp "hôm nay":** server tắt qua đêm thì bỏ lỡ → job chạy bù mọi ngày đã lỡ.
7. **Mockup thiếu màn hình khó nhất** (lưới tầng, Duyệt giá) → thêm vào P2-7.
8. **"Lịch hẹn mới" của Boss** trùng việc với quản lý → R2-11.

## 8. Câu hỏi còn mở

Q2-7 đã trả lời (D2-14, 01/11/2026). Q2-8 → D2-15, Q2-9 → D2-16; bản 4: làm rõ D2-15, thêm D2-17, D2-18 (01/11/2026). Không còn câu hỏi mở.

## 9. Rủi ro

- Thiếu `CLOUDINARY_URL` thật: chữ ký vẫn tính được (test chạy), nhưng chưa thử tải ảnh thật. Ảnh tải lên mà không gắn vào phòng (đóng trang giữa chừng) nằm lại trên Cloudinary – chấp nhận ở Phase 2.
- Lúc QA tay qua Vite, mọi lần gửi lịch chung một IP → lần thứ 6 trong giờ bị 429; khởi động lại BE là reset (giới hạn trong bộ nhớ).
- Giới hạn theo IP trong bộ nhớ; sau proxy phải bật `trust proxy`. Khi dev qua Vite, mọi khách chung một IP.
- e2e trên DB dev (D2-14): tòa/phòng thử đã vô hiệu hóa vẫn nằm trong DB và chiếm mã `E2xxxx` (≈1,7 triệu mã, đủ dùng); trong lúc test chạy, phòng thử có thể hiện trên trang công khai dev vài giây; e2e Phase 1 vẫn gọi `seed()` đặt lại 5 tài khoản dev như cũ.
- Boss sửa `water_mode` của tòa sau khi đã có hóa đơn (Phase 4) có thể làm lệch tiền nước – Phase 2 cho sửa, ghi chú để Phase 4 xử lý.
