# PLAN · P2-6 Backend API công khai, lịch hẹn, "Việc hôm nay" (BE-P2-29..35)

Gốc: `8bec6ab`. Draft: `Source/backend/artifact_BE/2026-11-05-BE-P2-29-35/` (đường dẫn trong draft mirror từ `Source/backend/`).

## 1. Mục tiêu và phạm vi

**Trong phạm vi**

| Task | Nội dung | Spec |
|---|---|---|
| BE-P2-29 | `GET /public/locations`, `GET /public/rooms`, `GET /public/featured-rooms` | PUB-01, ROOM-05, BLD-05, API-02 |
| BE-P2-30 | `GET /public/rooms/:id`, `GET /public/buildings/:id` | PUB-02..04, ROOM-08, BLD-04, A-05 |
| BE-P2-31 | `POST /public/viewings` | VIEW-01, 02, 08, 11, 12, A-03 |
| BE-P2-32 | `GET /viewings`, `POST /viewings`, `PATCH /viewings/:id` | VIEW-03, 04, 09, 10, SCOPE-02, API-08 |
| BE-P2-33 | `GET /dashboard?buildingId` trong module `notifications` | NOTI-06 (Phase 2), VIEW-07, SCOPE-04, PRC-11 |
| BE-P2-34 | e2e VIEW-13: khóa tòa/phòng, bảo trì không hủy lịch hẹn; lịch hẹn của tòa khóa về Boss | VIEW-13, ROOM-09, BLD-06 |
| BE-P2-35 | `lint`, `test`, `build` xanh; e2e viết xong; liệt kê `[ASSUMPTION]` | A-03 |

**Ngoài phạm vi**: VIEW-05, VIEW-06 (cần `contracts`, Phase 3); các nhóm "Việc hôm nay" khác (hóa đơn, yêu cầu, hợp đồng – Phase 4/5); không ghi `audit_logs` (AUD-01 không liệt kê hành động nào của `viewings`); không thêm cột/migration (bảng `viewings` đã có trong schema và `constraints.sql`).

**Tái sử dụng, không viết lại**: `publicRoomWhere`/`publicBuildingWhere` (`src/common/rooms/public-room.ts`), `ratesAt`/`currentRoomPrice` (`src/common/rates/rates-at.ts`), `todayHanoi`/`addDays`/`compareDates`/`formatDateOnly`/`parseDateOnly`/`hasSlotStarted`/`SLOT_START_MINUTES`/`TimeSlot` (`src/common/date/today.ts` – đã có sẵn đúng cho VIEW-08), `PaginationQuery`/`pageParams`/`paginated`, `BuildingContactService` (BLD-04), `RateLimiter` (`src/modules/auth/rate-limiter.ts`), `scopeWhere`, `ErrorCode`/`ERRORS` (không thêm mã lỗi mới).

## 2. Kiến trúc

```
        /public/*  (@Public, không auth)                 /viewings, /dashboard  (JwtAuthGuard + RolesGuard)
┌──────────────────────────────────────────┐      ┌──────────────────────────────────────────────┐
│ rooms/public-rooms.controller            │      │ viewings/viewings.controller                 │
│   GET /public/rooms                      │      │   GET /viewings  POST /viewings              │
│   GET /public/featured-rooms             │      │   PATCH /viewings/:id                        │
│   GET /public/rooms/:id                  │      │ viewings/public-viewings.controller @Public  │
│ buildings/public-buildings.controller    │      │   POST /public/viewings                      │
│   GET /public/locations                  │      │ notifications/dashboard.controller           │
│   GET /public/buildings/:id              │      │   GET /dashboard?buildingId                  │
└───────────────┬──────────────────────────┘      └─────────────────┬────────────────────────────┘
                │                                                   │
   PublicRoomsService / PublicBuildingsService          ViewingsService / DashboardService
                │                                                   │
                └──────────────┬────────────────────────────────────┘
                               ▼  helper dùng chung (thuần, có unit test)
   common/rooms/public-room.ts (ROOM-05)   common/rates/rates-at.ts (+ ratesAfter)
   common/rooms/monthly-estimate.ts (ROOM-08/A-05)   common/rooms/public-price-order.ts (PUB-01 "Mới nhất")
   common/date/today.ts (VIEW-08)   modules/auth/rate-limiter.ts (VIEW-02 per-IP)
                               ▼
                        PrismaService  →  rooms, buildings, room_images, services,
                                          rate_plans(+tiers), room_prices, viewings, contracts
```

Luồng dữ liệu `POST /public/viewings` (VIEW-01/02/11/12):

```
body → ValidationPipe (VIEW-08: visitDate trong [today, today+30], slot hợp lệ)
 → honeypot? ──yes──→ ghi nhận 1 hit IP, KHÔNG ghi DB, trả 201 { received: true }
 → RateLimiter IP (5/giờ) quá hạn → 429 TOO_MANY_REQUESTS
 → prisma.$transaction:
      SELECT pg_advisory_xact_lock(hashtext('viewing-phone:' || phone))
      room = findFirst({ id, ...publicRoomWhere(today) })  → không có → 409 ROOM_NOT_AVAILABLE
      count(viewings where guestPhone, source WEB, createdAt trong hôm nay Hanoi) >= 3 → 429
      create viewing (source WEB, status NEW)
 → 201 { received: true }   (hoàn toàn giống nhánh honeypot – VIEW-12)
```

### 2.1 File thêm / sửa

| Target (`Source/backend/…`) | Draft (`…/2026-11-05-BE-P2-29-35/`) | Mục đích | CP |
|---|---|---|---|
| `src/common/rooms/public-price-order.ts` | idem | PUB-01 "Mới nhất"/featured: xếp phòng theo `reviewed_at` của giá hiện hành | 1 |
| `src/common/rooms/public-view.ts` | idem | Hàm thuần map room/building/rate → DTO công khai (PUB-04) dùng chung cho 2 service | 1,2 |
| `src/modules/rooms/public-rooms.controller.ts` | idem | 3 route công khai của phòng | 1,2 |
| `src/modules/rooms/public-rooms.service.ts` | idem | Lọc, sắp xếp, phân trang, chi tiết phòng | 1,2 |
| `src/modules/rooms/dto/public-rooms.dto.ts` | idem | `PublicRoomsQueryDto`, `PublicIdParamsDto` | 1,2 |
| `src/modules/rooms/public.types.ts` | idem | `PublicRoomListItem`, `PublicRoomDetail`, `PublicRateView` | 1,2 |
| `src/modules/rooms/rooms.module.ts` | idem | Thêm controller/service, `imports: [BuildingsModule, SettingsModule]` | 1 |
| `src/modules/buildings/public-buildings.controller.ts` | idem | `/public/locations`, `/public/buildings/:id` | 1,2 |
| `src/modules/buildings/public-buildings.service.ts` | idem | Gom district/ward + chi tiết tòa | 1,2 |
| `src/modules/buildings/buildings.module.ts` | idem | Thêm controller/service, export `ServicesService` nếu cần | 1 |
| `src/common/rates/rates-at.ts` | idem | **Sửa, mirror từ main hiện tại**: thêm `ratesAfter(db, buildingId, date)` (PUB-03) | 2 |
| `src/common/rooms/monthly-estimate.ts` | idem | ROOM-08/A-05: hàm thuần tính `deposit`, `monthlyEstimate`, mục "chưa gồm" | 2 |
| `src/modules/auth/rate-limiter.ts` | idem | **Sửa, mirror từ main hiện tại**: thêm tham số constructor `max`, `windowMs` (default = giá trị AUTH-04 hiện tại) | 3 |
| `src/modules/viewings/viewings.module.ts` | idem | Module mới | 3 |
| `src/modules/viewings/public-viewings.controller.ts` | idem | `POST /public/viewings` (`@Public`, `@Ip`) | 3 |
| `src/modules/viewings/viewings.controller.ts` | idem | `GET/POST /viewings`, `PATCH /viewings/:id` | 4 |
| `src/modules/viewings/viewings.service.ts` | idem | Toàn bộ nghiệp vụ VIEW-01..04, 08, 09, 11 | 3,4 |
| `src/modules/viewings/viewing-slot.ts` | idem | VIEW-08: kiểm tra ngày + slot, trả `fields` lỗi | 3 |
| `src/modules/viewings/dto/viewings.dto.ts` | idem | 4 DTO (xem §2.3) | 3,4 |
| `src/modules/viewings/viewings.types.ts` | idem | `ViewingView` | 3 |
| `src/modules/notifications/notifications.module.ts` | idem | Module mới | 5 |
| `src/modules/notifications/dashboard.controller.ts` | idem | `GET /dashboard` | 5 |
| `src/modules/notifications/dashboard.service.ts` | idem | VIEW-07 + PRC-11 | 5 |
| `src/app.module.ts` | idem | **Sửa, mirror từ main hiện tại**: thêm `ViewingsModule`, `NotificationsModule` | 3,5 |
| `test/viewings.e2e-spec.ts` | idem | e2e BE-P2-34 theo khuôn `test/pricing.e2e-spec.ts` | 6 |
| `ref/vitest.preview.config.ts` | chỉ trong draft | Overlay draft-first, copy từ `artifact_BE/approved/2026-11-04-BE-P2-GET-ROOM/ref/` (không áp dụng vào main) | 1 |

Spec test (`*.spec.ts`) do tester viết, đặt cạnh file nó kiểm tra trong draft.

### 2.2 Contract `/public/*` (không auth, không field nội bộ – PUB-04)

Chỉ `data`/`meta` theo API-02; lỗi theo API-03.

```ts
// public.types.ts
interface PublicRoomListItem {
  id: number; code: string; floor: number; areaM2: number;
  price: number;                 // không bao giờ null (ROOM-05)
  maxOccupants: number;
  buildingId: number; buildingCode: string; buildingName: string;
  district: string; ward: string;
  imageUrl: string | null;       // ảnh sort_order nhỏ nhất
}
interface PublicRateTier { tierNo: number; upTo: number | null; unitPrice: number }
interface PublicRateView {
  kind: 'ELECTRIC' | 'WATER' | 'SERVICE';
  serviceId: number | null; serviceName: string | null;
  unit: 'ROOM' | 'PERSON' | 'VEHICLE' | null;   // null cho ELECTRIC/WATER
  effectiveFrom: string;         // YYYY-MM-DD (API-06)
  tiers: PublicRateTier[];
}
interface PublicRoomDetail {
  id: number; code: string; floor: number; areaM2: number; maxOccupants: number;
  furniture: string[]; description: string | null;
  price: number; deposit: number; monthlyEstimate: number;   // đồng nguyên (ROOM-08)
  estimate: {
    items: { label: string; amount: number }[];   // "Giá thuê", "Wifi", "Nước (1 người)", …
    missing: string[];                            // "chưa gồm: <tên> (chưa có giá)"
    meteredNote: string;                          // "chưa gồm điện, nước – tính theo đồng hồ của phòng"
  };
  images: { id: number; url: string; sortOrder: number }[];
  building: PublicBuildingSummary;
  rates: { electric: PublicRateView | null; water: PublicRateView | null; services: PublicRateView[] };
  upcomingRates: PublicRateView[];               // effectiveFrom > today (PUB-03)
  contact: { phone: string; zaloUrl: string | null; facebookUrl: string | null } | null;
}
interface PublicBuildingSummary {
  id: number; code: string; name: string; address: string; district: string; ward: string;
  waterMode: 'PER_M3' | 'PER_PERSON'; amenities: string[]; description: string | null;
}
interface PublicBuildingDetail extends PublicBuildingSummary {
  contact: PublicRoomDetail['contact'];
  rates: PublicRoomDetail['rates'];
  upcomingRates: PublicRateView[];
  rooms: PublicRoomListItem[];   // chỉ phòng public, sort price asc
}
```

| Route | Query / Param | Trả về | Lỗi |
|---|---|---|---|
| `GET /public/locations` | – | `data: { district: string; roomCount: number; wards: { ward: string; roomCount: number }[] }[]`, district A→Z | – |
| `GET /public/rooms` | `district?`, `ward?`, `buildingId?` (int≥1), `minPrice?`/`maxPrice?` (int≥0), `sort?` = `price` \| `-price` \| `newest` (default `price`), `page?`, `limit?` (PaginationQuery) | `data: PublicRoomListItem[]`, `meta: { page, limit, total }` | query sai → 400 `VALIDATION_FAILED` + `fields` |
| `GET /public/featured-rooms` | – | `data: PublicRoomListItem[]` (≤ 6, `newest`) | – |
| `GET /public/rooms/:id` | `id` int≥1 | `data: PublicRoomDetail` | phòng không public hoặc không tồn tại → 404 `NOT_FOUND` |
| `GET /public/buildings/:id` | `id` int≥1 | `data: PublicBuildingDetail` | tòa không public → 404 `NOT_FOUND` |

Quy tắc bắt buộc:
- Mọi truy vấn phòng công khai = `publicRoomWhere(todayHanoi())`; tòa = `publicBuildingWhere(todayHanoi())`. Không viết điều kiện ROOM-05 ở nơi khác.
- `sort=newest` và `/public/featured-rooms`: thứ tự theo giá hiện hành của phòng (`room_prices` APPROVED, `effective_from ≤ today`, cùng ngày thì `reviewed_at` muộn hơn trước) – `reviewed_at desc`, rồi `effective_from desc`, rồi `id desc`. Dùng `public-price-order.ts`: nạp id phòng public + `room_prices` liên quan, sắp xếp trong JS, phân trang trên danh sách id rồi mới `findMany` theo id của trang. `shortcut: sắp xếp trong bộ nhớ, đúng tới cỡ vài nghìn phòng; chuyển sang raw SQL + index khi vượt`.
- `rates` = `ratesAt(prisma, buildingId, today)`; `upcomingRates` = `ratesAfter(...)`; dịch vụ `is_active = false` bị loại hoàn toàn (SVC-04); dịch vụ không có rate không nằm trong `rates.services`, chỉ xuất hiện trong `estimate.missing`.
- `monthlyEstimate` (ROOM-08/A-05) = `price` + mỗi dịch vụ ROOM đang hoạt động có rate + mỗi dịch vụ PERSON × 1 + (nếu `waterMode = PER_PERSON`) đơn giá nước bậc 1 × 1 người. Không cộng điện, không cộng nước PER_M3. `deposit = price`. Tính bằng số nguyên, không float.
- Dịch vụ `unit = VEHICLE` (**Q-P6-4 = A**): không bao giờ vào `monthlyEstimate` (không biết số xe); nếu **chưa có rate** thì tên vẫn hiện trong `estimate.missing` ("chưa gồm: `<tên>` (chưa có giá)") như mọi dịch vụ thiếu giá; nếu **đã có rate** thì chỉ nằm ở `rates.services`, không vào tổng và không vào `missing`.
- `GET /public/contact` đã có trong `settings` – không làm lại.

### 2.3 Contract `/viewings`, `/public/viewings`, `/dashboard`

```ts
// viewings.types.ts
interface ViewingView {
  id: number; roomId: number; roomCode: string;
  buildingId: number; buildingName: string;
  guestName: string; guestPhone: string;
  visitDate: string;                 // YYYY-MM-DD
  timeSlot: 'MORNING' | 'AFTERNOON' | 'EVENING';
  timeSlotLabel: string;             // VIEW-08: "Sáng (8:00–11:00)" | "Chiều (14:00–17:00)" | "Tối (18:00–20:00)"
  note: string | null;
  source: 'WEB' | 'MANUAL';
  status: 'NEW' | 'CONFIRMED' | 'WON' | 'LOST' | 'CANCELLED';
  statusLabel: string;               // VIEW-10
  handledById: number | null; outcomeNote: string | null;
  createdAt: string; updatedAt: string;   // ISO 8601
}
```

DTO:

```ts
class PublicViewingDto {           // POST /public/viewings
  roomId!: number;                 // @Type(Number) @IsInt @Min(1)
  guestName!: string;              // @IsString @Length(2, 100)
  guestPhone!: string;             // @Matches(/^0[0-9]{9}$/)  (viewings_phone_vn)
  visitDate!: string;              // @Matches(/^\d{4}-\d{2}-\d{2}$/)
  timeSlot!: 'MORNING' | 'AFTERNOON' | 'EVENING';  // @IsIn
  note?: string;                   // @IsOptional @MaxLength(500)
  website?: string;                // honeypot (VIEW-02) – @IsOptional @IsString
}
class CreateViewingDto { /* như trên, không có website */ }
class UpdateViewingDto {           // tất cả optional
  status?: ViewingStatus;          // @IsIn(5 giá trị, **gồm cả 'WON' và 'NEW'**) – xem CP-4 Q4-WON
  outcomeNote?: string;            // @IsOptional @MaxLength(500)
  visitDate?: string; timeSlot?: TimeSlot; note?: string;   // @MaxLength(500) cho note
}
class ViewingsQueryDto extends PaginationQuery {
  buildingId?: number; status?: ViewingStatus; from?: string; to?: string;  // from/to lọc visitDate
}
class ViewingIdParamsDto { id!: number }   // @Type(Number) @IsInt @Min(1) @Max(2147483647) – khuôn `RoomIdParamsDto`
```

| Route | Ai | Hành vi | Lỗi |
|---|---|---|---|
| `POST /public/viewings` | public | Theo sơ đồ §2; 201 `data: { received: true }` cho cả bản lưu và honeypot (VIEW-12) | 400 `VALIDATION_FAILED` (`fields.visitDate` ngoài [today, today+30]; `fields.timeSlot` khi slot hôm nay đã bắt đầu – VIEW-08) · 409 `ROOM_NOT_AVAILABLE` · 429 `TOO_MANY_REQUESTS` |
| `GET /viewings` | BOSS, MANAGER | Lọc `buildingId`/`status`/`from`/`to`; không truyền `buildingId` → tất cả tòa trong scope (API-08); MANAGER dùng `user.buildingIds` (chỉ tòa đang hoạt động). Sắp xếp: xem "Thứ tự slot" dưới bảng. `meta` phân trang | 403 `OUT_OF_SCOPE` nếu `buildingId` ngoài scope |
| `POST /viewings` | BOSS, MANAGER | VIEW-03: phòng phải `is_active = true` và trong scope, **không cần public**; `source = MANUAL`, `status = NEW`, `handledById = user.id`; VIEW-08 như trên; không áp giới hạn chống spam (VIEW-11). **Tòa đã khóa (Q-P6-1 = B)**: BOSS được tạo bình thường; MANAGER → 403 `OUT_OF_SCOPE` (tòa khóa đã gỡ `managerId` nên không còn trong `user.buildingIds`, đi đúng đường scope hiện có, không cần nhánh riêng) | 404 `NOT_FOUND` phòng không tồn tại · 403 `OUT_OF_SCOPE` · 409 `CONFLICT_STATE` phòng đã khóa (`is_active = false`) · 400 như VIEW-08 |
| `PATCH /viewings/:id` | BOSS, MANAGER | Cập nhật có điều kiện `updateMany({ where: { id, status: current } })`, 0 dòng → 409 `CONFLICT_STATE`. Luôn ghi `handledById = user.id`. Chuyển trạng thái cho phép: `NEW→CONFIRMED`, `CONFIRMED→LOST`, `NEW→CANCELLED`, `CONFIRMED→CANCELLED` (VIEW-04); mọi nước đi khác (kể cả `WON`, `NEW→LOST`) → 409 `CONFLICT_STATE`. `status = LOST` thiếu `outcomeNote` → 400 `VALIDATION_FAILED` `fields.outcomeNote`; `status = CANCELLED` **không** bắt buộc `outcomeNote` (Q-P6-3 = A), nếu có thì vẫn lưu. Đổi `visitDate`/`timeSlot` chỉ khi trạng thái hiện tại là NEW/CONFIRMED và theo VIEW-08 (VIEW-09); nếu body chỉ có `timeSlot` thì VIEW-08 áp lên cặp (`visitDate` đang lưu, `timeSlot` mới) → lịch đã quá ngày trả 400 `fields.visitDate` (staff phải gửi kèm ngày mới). Sửa riêng `note` được phép ở mọi trạng thái | 404 · 403 `OUT_OF_SCOPE` · 409 · 400 |
| `GET /dashboard?buildingId` | BOSS, MANAGER | xem dưới | 403 `OUT_OF_SCOPE` |

**Thứ tự slot (trả lời câu 1 của coder, kỹ thuật)**: `time_slot` là `VarChar(20)`, **không** phải enum Postgres, nên `orderBy: { timeSlot: 'asc' }` xếp theo chữ cái (AFTERNOON < EVENING < MORNING) – sai giờ. Danh sách lịch hẹn là danh sách việc theo ngày nên phải đúng giờ. Cách làm (ít code nhất, dùng helper đã có):
- Prisma vẫn `orderBy: [{ visitDate: 'asc' }, { timeSlot: 'asc' }, { id: 'asc' }]` để phân trang ổn định (deterministic, không bỏ/lặp dòng giữa các trang).
- Sau khi lấy trang, sắp lại trong JS bằng `SLOT_START_MINUTES` (`src/common/date/today.ts`): `sort((a, b) => compareDates(a.visitDate, b.visitDate) || SLOT_START_MINUTES[a.timeSlot] - SLOT_START_MINUTES[b.timeSlot] || a.id - b.id)`.
- `shortcut: trang hiện tại luôn đúng giờ; một ngày bị cắt qua 2 trang có thể lệch slot ở mép trang – chuyển sang raw SQL ORDER BY CASE nếu chủ dự án thấy vướng`. `/dashboard` (≤ 5 dòng, không phân trang) dùng cùng hàm sort nên đúng tuyệt đối.

**Khóa dòng phòng ở `POST /viewings` (trả lời câu 5, kỹ thuật)**: **không** khóa. VIEW-13 nói rõ phòng/tòa bị khóa **không** hủy lịch hẹn, staff tự gọi khách và tự đổi trạng thái; nên một lịch hẹn vừa tạo cho phòng vừa bị khóa là trạng thái spec đã cho phép, không phải lỗi dữ liệu. Thêm `FOR UPDATE` chỉ làm chậm và tăng nguy cơ deadlock với `rooms.service`. `POST /public/viewings` vẫn giữ `pg_advisory_xact_lock` theo số điện thoại vì VIEW-11 bắt buộc.

`GET /dashboard` trả về:

```ts
interface DashboardView {
  newViewings: { count: number; items: ViewingView[] };   // items: ≤ 5, visitDate asc
  pendingPrices: { count: number; rooms: number; ratePlans: number } | null;  // null khi không phải BOSS
}
```

- `newViewings` (VIEW-07): đếm **mọi** lịch `status = NEW`, không lọc theo `visit_date` – lịch đã quá ngày vẫn tính và vẫn vào `items` (Q-P6-2 = A). MANAGER → `status = NEW` và `room.buildingId ∈ user.buildingIds`. BOSS → `status = NEW` và tòa **không có quản lý đang hoạt động** (`managerId = null OR manager.isActive = false`, SCOPE-04); tòa đã khóa luôn có `managerId = null` (BLD-06) nên tự động vào thẻ của Boss (VIEW-13). `?buildingId` lọc thêm, ngoài scope → 403.
- `pendingPrices` (PRC-11): BOSS, đếm `room_prices` + `rate_plans` `status = PENDING` và `effective_from ≥ today` (không tính đề xuất đã quá hạn).
- **BOSS truyền `?buildingId` của tòa đang có quản lý hoạt động (trả lời câu 1 của coder – spec đã quyết, không phải câu hỏi mới)**: `newViewings.count = 0`, `items: []`. VIEW-07 định nghĩa tập của thẻ "Việc hôm nay" của Boss là "NEW viewings of buildings without an active manager (SCOPE-04)", và SCOPE-04 nói đúng thẻ này; `?buildingId` theo API-08 chỉ là **bộ lọc thu hẹp**, không mở rộng tập. Chính VIEW-07 tách rõ hai thứ: thẻ của Boss chỉ tòa không có quản lý, còn "Boss's *Lịch hẹn* page still shows every building" – tức muốn xem lịch NEW của tòa có quản lý thì dùng `GET /viewings?buildingId=…&status=NEW` (SCOPE-02, Boss thấy mọi tòa). Về code: không cần nhánh riêng – `where.room = { building: { id: buildingId, ...WITHOUT_ACTIVE_MANAGER } }` đã đúng (AND tự nhiên); `buildingId` không tồn tại cũng cho `0` chứ không 403 (Boss có `buildingIds = null`, không lộ sự tồn tại của tòa).
- **`pendingPrices.rooms` đếm dòng `room_prices` PENDING, không đếm phòng riêng biệt (trả lời câu 3 của coder – đúng, không sửa)**: PRC-11 đếm "PENDING **items**" và trang "Duyệt giá" liệt kê từng đề xuất, nên đơn vị là dòng đề xuất. Thêm nữa PRC-02 bảo đảm mỗi phòng có tối đa **1** dòng PENDING (ràng buộc DB), nên số dòng và số phòng riêng biệt luôn bằng nhau – `distinct` chỉ là code thừa.
- **Lấy `items` (trả lời câu 2 của coder – nhận, tốt hơn PLAN cũ)**: `findMany` các lịch NEW trong scope chỉ với `select { id, visitDate, timeSlot }` → `sort` trong JS bằng `SLOT_START_MINUTES` → lấy 5 `id` đầu → `findMany` lại với `VIEWING_INCLUDE` cho đúng 5 dòng. `count` lấy từ `rows.length` nên không cần query đếm thứ hai, và vì không phân trang nên không có khuyết điểm "lệch slot ở mép trang" của `GET /viewings`. Giữ `shortcut:` comment đã có trong code.

## 3. Câu hỏi bỏ ngỏ

Không còn câu hỏi bỏ ngỏ. Bốn câu đã chốt (nguồn: **chủ dự án trả lời**, đã ghi vào feature file – không còn là `[ASSUMPTION]`):

- **Q-P6-1 = B** · Lịch hẹn thủ công cho phòng thuộc tòa đã khóa: chỉ BOSS được `POST /viewings`; MANAGER bị chặn 403 `OUT_OF_SCOPE` theo convention scope (tòa khóa đã gỡ manager). → §2.3, CP-4.
- **Q-P6-2 = A** · Thẻ "Lịch hẹn mới" của `GET /dashboard` đếm mọi lịch `NEW`, kể cả đã quá `visit_date`. → §2.3, CP-5.
- **Q-P6-3 = A** · `CANCELLED` không bắt buộc `outcomeNote`; chỉ `LOST` bắt buộc. → §2.3, CP-4.
- **Q-P6-4 = A** · Dịch vụ `VEHICLE` trong ước tính ROOM-08: chưa có giá → vẫn hiện "chưa gồm: `<tên>` (chưa có giá)"; có giá → không cộng vào `monthlyEstimate`. → §2.2, CP-2.

### `[ASSUMPTION]` dùng trong PLAN (kỹ thuật, trong phạm vi draft)

1. Tên field honeypot là `website`; non-empty → 201 `{ received: true }`, không ghi DB, nhưng **vẫn** tính 1 hit cho giới hạn IP (chống spam). FE part 8b phải dùng đúng tên này.
2. Thân phản hồi của `POST /public/viewings` là `{ received: true }` (VIEW-12 chỉ yêu cầu hai nhánh giống nhau và không có id); văn bản tiếng Việt do FE hiển thị.
3. `sort` của `/public/rooms`: `price` (default, PUB-01), `-price`, `newest`. Spec chỉ nêu `price` tăng và "Mới nhất"; `-price` thêm vào vì gần như không tốn gì.
4. Hình dạng `GET /public/locations`: district lồng ward, kèm `roomCount` ở cả hai mức.
5. Khóa theo số điện thoại: `SELECT pg_advisory_xact_lock(hashtext('viewing-phone:' || <phone>))` trong cùng transaction với `count` + `create` (VIEW-11).
6. Giới hạn IP: dùng lại `RateLimiter` của `auth` với `new RateLimiter(5, 3_600_000)`; thêm tham số constructor có default = giá trị AUTH-04 hiện tại nên mọi caller cũ không đổi. `shortcut: bộ nhớ trong một tiến trình (VIEW-11 cho phép)`.
7. `GET /viewings` không có khoảng ngày mặc định (không truyền `from`/`to` → tất cả), sắp xếp `visitDate asc`.
8. `/dashboard` trả tối đa 5 lịch hẹn mẫu cùng với `count` (NOTI-06 "counts + lists").
9. Nước PER_PERSON trong `monthlyEstimate` lấy đơn giá bậc 1 của rate WATER (rate nước theo người chỉ có 1 bậc trong seed).
10. Văn bản tiếng Việt của message/label mới là đề xuất (như các part trước), chủ dự án có thể sửa.
11. (câu 2 của coder) `outcomeNote` và `note` tối đa 500 ký tự. Cột DB là `text` không giới hạn, nhưng mọi input ở biên tin cậy cần một giới hạn; 500 bằng với `note` của khách. Thuần kỹ thuật, chủ dự án có thể nâng/bỏ.
12. (câu 3 của coder) PATCH chỉ gửi `timeSlot` cho lịch đã quá `visit_date` → 400 `fields.visitDate`. Suy ra từ VIEW-09 + VIEW-08 (ngày+slot kết quả phải nằm trong `[today, today+30]`), không phải quy tắc nghiệp vụ mới. Sửa riêng `note` (không đụng ngày/slot/trạng thái) được phép ở mọi trạng thái vì VIEW-09 chỉ giới hạn ngày và slot.
13. (câu 4 của coder) `ViewingIdParamsDto` được thêm vào `dto/viewings.dto.ts` (thành 5 DTO) theo khuôn `RoomIdParamsDto`/`PricingIdParamsDto`. Thuần kỹ thuật.
14. (câu 1 của coder) Thứ tự slot: sắp lại trang trong JS bằng `SLOT_START_MINUTES`, xem §2.3.
15. (câu 5 của coder) `POST /viewings` không khóa dòng phòng, xem §2.3.
16. (CP-5, câu 2 của coder) `GET /dashboard` nạp `{ id, visitDate, timeSlot }` của mọi lịch NEW trong scope, sắp trong JS, rồi nạp lại 5 dòng đầy đủ. Thuần kỹ thuật, xem §2.3.
17. (CP-5, câu 3 của coder) `pendingPrices` có cả `rooms` và `ratePlans` ngoài `count` (FE hiện tách hai mục); đếm theo dòng đề xuất. Thuần kỹ thuật, xem §2.3.
18. (CP-5) `dashboard.service.ts` import `VIEWING_INCLUDE`, `ViewingRecord`, `toView` từ `viewings/viewings.service.ts` (export-only, không đổi hành vi). **Chấp nhận, không cần đổi**: đúng tiền lệ đang có trong main – `rooms.service.ts` import `verifyRoomImage`, `destroyRoomImageByAssetId` từ `files/files.service.ts`. Để `toView` cạnh nghiệp vụ của nó, không cần `NotificationsModule` import `ViewingsModule` hay thêm file map riêng.

## 4. Checkpoints

### CP-1 · BE-P2-29 – danh sách công khai
Files: `src/common/rooms/public-price-order.ts`, `src/common/rooms/public-view.ts`, `src/modules/rooms/{public-rooms.controller,public-rooms.service,public.types,rooms.module}.ts`, `src/modules/rooms/dto/public-rooms.dto.ts`, `src/modules/buildings/{public-buildings.controller,public-buildings.service,buildings.module}.ts`, `ref/vitest.preview.config.ts`.
**Done when**: `npx vitest run --config "artifact_BE/2026-11-05-BE-P2-29-35/ref/vitest.preview.config.ts"` (chạy trong `Source/backend`) xanh, bao gồm toàn bộ unit test của main; `npx tsc -b --noEmit` không lỗi ở file draft.
**Kịch bản test**
- PUB-01/ROOM-05 happy: `GET /public/rooms` trả phòng public, mỗi item có `price` là số (không null), kèm `meta.total`.
- ROOM-05: phòng `price = null`, phòng đang bảo trì, phòng đã khóa, phòng có hợp đồng HOLD/ACTIVE, phòng của tòa khóa → đều vắng mặt (acceptance 11 "price = null never appears").
- ROOM-05: tòa thiếu rate ELECTRIC hoặc WATER có hiệu lực hôm nay → không có phòng nào trong danh sách.
- PUB-01: `sort` default = giá tăng; `sort=newest` xếp theo `reviewed_at` của giá hiện hành giảm; cùng `effective_from` thì `reviewed_at` muộn hơn đứng trước.
- PUB-01: `/public/featured-rooms` trả đúng ≤ 6 item, cùng thứ tự `newest`.
- Biên: `page` = trang cuối thiếu dòng; `limit=100` ok, `limit=101` → 400 `fields.limit`; `minPrice > maxPrice` → danh sách rỗng, `total = 0`; `minPrice = 0`; không có phòng public nào → `data: []`, `meta.total = 0`, `/public/locations` → `[]`.
- PUB-04: không có `managerId`, `proposedById`, `reviewNote`, `price` nội bộ nào ngoài hợp đồng §2.2 trong body.
- Quyền: `/public/*` trả 200 khi không có token và khi `Authorization` rác (route `@Public`).
- BLD-05: `/public/locations` chỉ chứa district/ward của tòa có ≥ 1 phòng public, `roomCount` khớp tổng ward.

### CP-2 · BE-P2-30 – chi tiết công khai + ROOM-08
Files: `src/common/rates/rates-at.ts` (thêm `ratesAfter`), `src/common/rooms/monthly-estimate.ts`, `public-rooms.service.ts`, `public-buildings.service.ts`, `public.types.ts` (mở rộng), `rooms.module.ts` (import `BuildingsModule` để dùng `BuildingContactService`).
**Done when**: lệnh overlay ở CP-1 xanh; unit test ROOM-08 tính tay khớp cho 1 tòa PER_M3 và 1 tòa PER_PERSON.
**Kịch bản test**
- ROOM-08 PER_M3: `monthlyEstimate = price + Σ(dịch vụ ROOM) + Σ(dịch vụ PERSON × 1)`; `deposit = price`; `estimate.meteredNote` có mặt; điện và nước m³ không được cộng.
- ROOM-08 PER_PERSON: cộng thêm nước × 1 người; con số khớp phép tính tay (acceptance 11 cuối).
- SVC-04: dịch vụ đang hoạt động nhưng không có rate hiệu lực → không cộng vào tổng, tên nằm trong `estimate.missing`; dịch vụ `is_active = false` → không xuất hiện ở bất kỳ đâu (không trong `rates.services`, không trong `missing`, không trong tổng).
- ROOM-08 (**Q-P6-4 = A**) dịch vụ `unit = VEHICLE`: (a) VEHICLE đang hoạt động **chưa có rate** → tên nằm trong `estimate.missing` dạng "chưa gồm: `<tên>` (chưa có giá)", không vào tổng; (b) VEHICLE đang hoạt động **có rate** → có trong `rates.services`, **không** vào `monthlyEstimate` và **không** trong `missing` (so sánh tổng với cùng dữ liệu nhưng bỏ dịch vụ VEHICLE: hai tổng bằng nhau); (c) VEHICLE `is_active = false` → không xuất hiện ở đâu.
- PUB-03: rate có `effective_from` tương lai nằm trong `upcomingRates` với `effectiveFrom` đúng, và **không** nằm trong `rates`; rate hôm nay nằm trong `rates`.
- BLD-04: tòa có quản lý active + `contactPhone` → contact của quản lý; quản lý bị vô hiệu hóa, quản lý không có `contactPhone`, hoặc `managerId = null` → contact mặc định của Boss; không có số điện thoại đăng nhập của quản lý trong body.
- PUB-02: `GET /public/rooms/:id` cho phòng không public (từng điều kiện ROOM-05) và id không tồn tại → 404 `NOT_FOUND`, body giống nhau; `GET /public/buildings/:id` cho tòa khóa / tòa không có phòng public → 404.
- Biên: `:id = 0`, `:id = abc` → 400 `VALIDATION_FAILED`; phòng không có ảnh → `images: []`, `imageUrl = null`; `furniture`/`amenities` rỗng → `[]`.
- PUB-04: body chi tiết không chứa `reviewNote`, `proposedById`, `reviewedById`, `handledById`, id người dùng.

### CP-3 · BE-P2-31 – `POST /public/viewings`
Files: `src/modules/viewings/{viewings.module,public-viewings.controller,viewings.service,viewing-slot,viewings.types}.ts`, `src/modules/viewings/dto/viewings.dto.ts`, `src/modules/auth/rate-limiter.ts` (thêm tham số), `src/app.module.ts`.
**Done when**: lệnh overlay ở CP-1 xanh (gồm cả test `rate-limiter.spec.ts` cũ của main, không được đổi hành vi mặc định).
**Kịch bản test**
- VIEW-01 happy: phòng public + ngày/slot hợp lệ → 201 `{ received: true }`, có đúng 1 dòng `viewings` `source = WEB`, `status = NEW`, không có id trong body.
- VIEW-01: phòng không public (bảo trì / khóa / `price = null` / có HOLD / tòa khóa) → 409 `ROOM_NOT_AVAILABLE` (acceptance 13 dòng 1); phòng không tồn tại → cũng 409 `ROOM_NOT_AVAILABLE` (không tiết lộ tồn tại).
- VIEW-08 biên: `visitDate` = hôm nay ok; = today + 30 ok; = today + 31 → 400 `fields.visitDate`; = hôm qua → 400; `2026-02-30` → 400; slot lạ → 400 `fields.timeSlot`.
- VIEW-08 giờ Asia/Ho_Chi_Minh: giả lập 15:00 → `MORNING`/`AFTERNOON` hôm nay → 400 `fields.timeSlot`, `EVENING` hôm nay ok, mọi slot ngày mai ok (acceptance 13 dòng 4). Giả lập 07:59 → `MORNING` hôm nay ok; 08:00 đúng điểm → từ chối.
- VIEW-11: phone đã có 3 lịch WEB hôm nay → 429 `TOO_MANY_REQUESTS` (acceptance 13 dòng 2); 3 lịch của **hôm qua** (theo Asia/Ho_Chi_Minh, kể cả dòng tạo lúc 23:30 hôm qua) → vẫn cho qua; lịch `source = MANUAL` không tính.
- VIEW-11 song song: 2 request đồng thời khi phone đã có 2 lịch → chỉ 1 lưu, cái còn lại 429; kiểm tra `pg_advisory_xact_lock` được gọi trong cùng transaction với `count` và `create` (acceptance 13 dòng 6).
- VIEW-02 IP: request thứ 6 trong 1 giờ từ cùng IP → 429; sau khi cửa sổ trôi qua → lại cho qua; giới hạn đăng nhập AUTH-04 (5/15 phút) không bị ảnh hưởng.
- VIEW-12 honeypot: `website = "x"` → 201 với body **byte-for-byte** giống nhánh thật, `viewing.create` không được gọi (acceptance 13 dòng 7).
- Quyền: route không cần token; gửi kèm token TENANT vẫn 201 (route `@Public`).

### CP-4 · BE-P2-32 – API lịch hẹn cho staff
Files: `src/modules/viewings/viewings.controller.ts`, `viewings.service.ts` (mở rộng), `dto/viewings.dto.ts` (mở rộng).
**Done when**: lệnh overlay ở CP-1 xanh.
**Kịch bản test**
- VIEW-03 happy: MANAGER tạo lịch thủ công cho phòng **active nhưng không public** (đang bảo trì / `price = null`) trong tòa của mình → 201, `source = MANUAL`, `handledById = user.id`.
- VIEW-03: phòng `is_active = false` → 409 `CONFLICT_STATE`; phòng tòa khác (MANAGER) → 403 `OUT_OF_SCOPE`; phòng không tồn tại → 404 `NOT_FOUND`.
- VIEW-03 + BLD-06 (**Q-P6-1 = B**): phòng active trong tòa đã khóa → BOSS 201 (`source = MANUAL`, `handledById` = Boss); MANAGER (quản lý cũ của tòa đó) → 403 `OUT_OF_SCOPE`.
- VIEW-03/08: ngày/slot áp đúng VIEW-08 (lặp lại biên today, today+30, slot đã bắt đầu).
- VIEW-04 (**Q4-WON**, sửa so với bản PLAN trước): `status = WON` → **409 `CONFLICT_STATE`**, không phải 400. Acceptance của `docs/spec/13-viewings.md` ghi thẳng "`status: WON` returns `CONFLICT_STATE`", nên `WON` (và `NEW`) **phải** nằm trong enum của `UpdateViewingDto` và bị bảng chuyển trạng thái của service từ chối. `NEW → LOST` → 409 `CONFLICT_STATE`; `CONFIRMED → LOST` thiếu `outcomeNote` → 400 `fields.outcomeNote`; `CONFIRMED → LOST` có note → 200; `NEW → CONFIRMED` → 200, `handledById` = người gọi; `CANCELLED → CONFIRMED` → 409; `WON → …` → 409.
- VIEW-04 (**Q-P6-3 = A**): `NEW → CANCELLED` và `CONFIRMED → CANCELLED` **không** kèm `outcomeNote` → 200, `outcomeNote` giữ `null`; kèm `outcomeNote` → 200 và được lưu.
- VIEW-09: đổi `visitDate`/`timeSlot` khi NEW và khi CONFIRMED → 200; khi `WON`/`LOST`/`CANCELLED` → 409 `CONFLICT_STATE`; đổi sang ngày today+31 → 400.
- VIEW-09 ([ASSUMPTION] 12): lịch NEW có `visit_date` = hôm qua, PATCH chỉ `{ timeSlot: 'EVENING' }` → 400 `fields.visitDate`; cùng lịch đó PATCH `{ visitDate: hôm nay, timeSlot: 'EVENING' }` (giả lập 15:00) → 200; PATCH chỉ `{ note: 'khách gọi lại' }` trên lịch `LOST` → 200 (không áp VIEW-08).
- Thứ tự slot ([ASSUMPTION] 14): 3 lịch cùng `visitDate` với slot EVENING/MORNING/AFTERNOON (tạo theo thứ tự đó) → `GET /viewings` trả MORNING → AFTERNOON → EVENING; lịch của ngày sớm hơn luôn đứng trước bất kể slot; cùng ngày cùng slot → `id` tăng.
- `outcomeNote` 501 ký tự → 400 `fields.outcomeNote`; 500 ký tự → 200 ([ASSUMPTION] 11).
- `ViewingIdParamsDto`: `/viewings/abc` → 400 `fields.id`; `/viewings/0` → 400; `/viewings/2147483648` → 400 ([ASSUMPTION] 13).
- Xung đột trạng thái: `updateMany` trả 0 dòng (ai đó vừa đổi trạng thái) → 409 `CONFLICT_STATE`.
- SCOPE-02/API-08: MANAGER `GET /viewings` không truyền `buildingId` → chỉ lịch của 2 tòa mình; `?buildingId=<tòa khác>` → 403 `OUT_OF_SCOPE`; `PATCH` lịch của tòa khác → 403; BOSS thấy mọi tòa, kể cả tòa đã khóa (VIEW-13).
- Lọc/biên: `from`/`to` lọc theo `visitDate` bao gồm hai đầu; `from > to` → `data: []`; `status=NEW`; `from` sai định dạng → 400; phân trang `meta`.
- VIEW-10: `statusLabel`/`timeSlotLabel` đúng chữ tiếng Việt của spec.
- Quyền: TENANT → 403 `FORBIDDEN`; không token → 401 `UNAUTHENTICATED`.

### CP-5 · BE-P2-33 – `GET /dashboard`
Files: `src/modules/notifications/{notifications.module,dashboard.controller,dashboard.service}.ts`, `src/app.module.ts`.
**Done when**: lệnh overlay ở CP-1 xanh.
**Kịch bản test**
- VIEW-07 happy: MANAGER → `newViewings.count` = số lịch NEW của các tòa mình, `items` ≤ 5 xếp `visitDate` tăng; lịch CONFIRMED/WON/LOST/CANCELLED không tính.
- VIEW-07/SCOPE-04 Boss: chỉ đếm lịch NEW của tòa có `managerId = null` **hoặc** quản lý `is_active = false`; tòa có quản lý active → không tính.
- VIEW-13: tòa bị khóa (⇒ `managerId = null`) → lịch NEW của nó nằm trong thẻ của Boss và không nằm trong thẻ của quản lý cũ.
- PRC-11: BOSS → `pendingPrices.count` chỉ đếm PENDING với `effective_from ≥ hôm nay`; đề xuất PENDING quá ngày (`effective_from = hôm qua`) không được tính; `rooms` + `ratePlans` cộng lại bằng `count`. MANAGER → `pendingPrices = null`.
- VIEW-07 (**Q-P6-2 = A**): lịch NEW có `visit_date` = hôm qua và = today-30 vẫn được tính vào `count` và vẫn nằm trong `items` (xếp đầu vì `visitDate asc`); không có bộ lọc ngày nào trong truy vấn.
- Biên: không có việc gì → `count = 0`, `items: []`; đúng 5 và 6 lịch NEW → `items` dài 5, `count` = 6; `effective_from = hôm nay` (biên) → được tính.
- VIEW-07/SCOPE-04 Boss + `?buildingId` (§2.3): tòa **có** quản lý hoạt động, có lịch NEW → `count = 0`, `items: []` (không 403); cùng tòa đó sau khi quản lý bị `is_active = false` → lịch NEW xuất hiện; tòa `managerId = null` → `count` = lịch NEW của đúng tòa đó, không lẫn tòa khác; `?buildingId` của tòa không tồn tại → `count = 0`.
- Quyền: `?buildingId` ngoài scope (MANAGER) → 403 `OUT_OF_SCOPE`; TENANT → 403 `FORBIDDEN`; không token → 401.

### CP-6 · BE-P2-34 + BE-P2-35 – e2e VIEW-13 và kiểm tra cuối
Files: `test/viewings.e2e-spec.ts` (khuôn `test/pricing.e2e-spec.ts`: `E2eRun`, `uniqueBuildingCode`, `uniquePhone`, `cleanupRun`, tên khách có tiền tố E2E để `scripts/e2e/cleanup.mjs` nhận ra).
**Done when**: `npm run lint`, `npm run test` (overlay draft-first ở CP-1), `npm run build` đều xanh; file e2e qua `tsc` không lỗi. **Không chạy `npm run test:e2e` trong pipeline** (ghi DB dev); lệnh để chủ dự án chạy sau khi duyệt được ghi trong `REVIEW.md`.
**Kịch bản test (e2e, chạy trên DB dev sau khi duyệt)**
- VIEW-13: tạo tòa + phòng + giá/rate → phòng public → `POST /public/viewings` 2 lần (2 phone khác nhau) → bật `under_maintenance` qua `PATCH /rooms/:id` → 2 lịch vẫn `NEW`, response có `pendingViewingCount = 2` (ROOM-09).
- VIEW-13: khóa phòng (`isActive = false`) → lịch vẫn NEW, `pendingViewingCount = 2`; `GET /public/rooms/:id` → 404.
- VIEW-13/BLD-06: khóa tòa → `managerId = null`, lịch vẫn NEW; `GET /dashboard` của Boss có 2 lịch đó; `GET /viewings` của quản lý cũ không còn thấy chúng; `GET /viewings` của Boss vẫn thấy.
- VIEW-11 thật trên Postgres: 2 request song song cùng phone khi đã có 2 lịch → 1 lưu, 1 trả 429 (kiểm tra `pg_advisory_xact_lock` thực sự chặn).
- PATCH sau khi khóa: Boss đổi `NEW → CANCELLED` cho lịch của tòa đã khóa, **không** gửi `outcomeNote` → 200 (VIEW-13 yêu cầu staff tự xử lý; Q-P6-3 = A).
- `POST /viewings` sau khi khóa tòa (Q-P6-1 = B): Boss tạo lịch thủ công cho phòng active của tòa đã khóa → 201; quản lý cũ → 403 `OUT_OF_SCOPE`.
- Dọn dẹp: `cleanupRun` trả `[]`; không còn dòng E2E nào ở `viewings`, `rooms`, `buildings`, `room_prices`, `rate_plans`.
