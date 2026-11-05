# PLAN · BE-P2-GET-ROOM · `GET /rooms/:id`

Draft: `Source/backend/artifact_BE/2026-11-04-BE-P2-GET-ROOM/`
Spec draft kèm theo: `Artifacts/2026-11-04-BE-P2-GET-ROOM-spec/` (CP-1)
Task liên quan: `BE-P2-21` (ROOM-07 ảnh), `BE-P2-19`/`ROOM-09` · FE cần: `FE-P2-07` (Q-FE8A-2 B, Q-FE8A-3 A, chủ dự án 04/11/2026)

## 1. Mục tiêu và phạm vi

Trong phạm vi:

- Thêm một route đọc `GET /rooms/:id` cho staff trong phạm vi tòa (`SCOPE-02`), trả **đúng** `RoomView` mà `POST /rooms` và `PATCH /rooms/:id` đang trả (gồm `images` theo `sort_order`, `ROOM-07`) **cộng** `pendingViewingCount` = số `viewings` trạng thái `NEW`/`CONFIRMED` của phòng (`ROOM-09`, `VIEW-13`).
- Thêm một dòng vào bảng API của `docs/spec/11-buildings-rooms.md` qua bản nháp spec riêng.
- Test unit cho route mới, chạy cùng toàn bộ unit test của bản chính bằng overlay vitest.

Ngoài phạm vi (không làm trong draft này):

- Không đổi `GET /rooms` (grid), không đổi `PATCH /rooms/:id`, không đổi logic ảnh, không đổi `rooms.types.ts` (trường `pendingViewingCount?: number` đã có sẵn trong `RoomView`).
- Không thêm route `GET /rooms/:id/images` (Q-FE8A-3 đã chọn A).
- Không đổi schema, không migration, không đụng `/public/rooms/:id` (`PUB-02` là route công khai khác).
- Không đụng FE (`artifact_FE/2026-11-04-FE-P2-01-08` tự dùng endpoint sau khi áp dụng).

## 2. Kiến trúc

```
GET /api/v1/rooms/:id
  │  JwtAuthGuard → MustChangePasswordGuard → RolesGuard(@Roles('BOSS','MANAGER'))
  ▼
RoomsController.get(user, RoomIdParamsDto)      ← thin: 1 DTO, 1 lời gọi service
  ▼
RoomsService.get(user, id)
  ├─ assertStaff(user)                          → 403 FORBIDDEN
  ├─ prisma.room.findUnique({ where:{id}, include: ROOM_INCLUDE })
  │     ROOM_INCLUDE (đã có): images orderBy [sortOrder asc, id asc] + contracts{status}
  ├─ !room                                      → 404 NOT_FOUND
  ├─ assertRoomScope(user, room)                → 403 OUT_OF_SCOPE
  ├─ view = this.toView(room)                   ← dùng lại, không viết mapper mới
  └─ view.pendingViewingCount =
        prisma.viewing.count({ roomId, status: { in: ['NEW','CONFIRMED'] } })   (PENDING_VIEWING_STATUSES đã có)
  ▼
{ data: RoomView & { pendingViewingCount: number } }   (response interceptor của app.setup)
```

Không cần `$transaction`: chỉ hai truy vấn đọc, không có tiền, không đổi trạng thái (`CLAUDE.md` chỉ buộc transaction cho luồng nhiều bước/tiền).

### File thêm / sửa

| Đường dẫn bản chính | Đường dẫn draft | Việc |
|---|---|---|
| `docs/spec/11-buildings-rooms.md` | `Artifacts/2026-11-04-BE-P2-GET-ROOM-spec/docs/spec/11-buildings-rooms.md` | thêm 1 dòng bảng API cho `GET /rooms/:id` (CP-1) |
| — | `Artifacts/2026-11-04-BE-P2-GET-ROOM-spec/REVIEW.md` | REVIEW riêng của draft spec (CP-1) |
| `Source/backend/src/modules/rooms/rooms.service.ts` | `.../2026-11-04-BE-P2-GET-ROOM/src/modules/rooms/rooms.service.ts` | **mirror từ bản main HIỆN TẠI** rồi thêm `get()` (CP-2) |
| `Source/backend/src/modules/rooms/rooms.controller.ts` | `.../src/modules/rooms/rooms.controller.ts` | mirror hiện tại + `@Get(':id')` (CP-2) |
| — | `.../ref/vitest.preview.config.ts` | overlay config để chạy test (CP-2, không áp dụng vào main) |
| `Source/backend/src/modules/rooms/rooms.detail.spec.ts` | `.../src/modules/rooms/rooms.detail.spec.ts` | test mới (CP-3) |

**Cảnh báo cho coder (quan trọng):** `rooms.service.ts` trên main đã được P2-5 sửa (gọi `syncRoomPrices(tx, [id])` khi mở khóa phòng, dòng có comment `Q-P5-5 A`), `buildings.service.ts` cũng vậy. Trước khi tạo file draft, **đọc bản main hiện tại và copy nguyên văn**, chỉ thêm phần mới. Không dùng bản cũ trong `artifact_BE/approved/**` làm gốc. Không tạo draft cho `buildings.service.ts` (không cần sửa).

### Hợp đồng API (coder phải theo đúng)

```
GET /api/v1/rooms/:id            @Roles('BOSS','MANAGER')
params: RoomIdParamsDto          // đã có trong dto/rooms.dto.ts, không tạo DTO mới
200 { data: RoomView }           // RoomView hiện có + pendingViewingCount luôn có mặt
400 VALIDATION_FAILED            // :id không phải số nguyên dương
401 UNAUTHORIZED                 // không có/ hết hạn token
403 FORBIDDEN                    // TENANT / role khác staff
403 OUT_OF_SCOPE                 // MANAGER, phòng thuộc tòa ngoài user.buildingIds (SCOPE-02)
404 NOT_FOUND                    // không có phòng id đó
```

Chữ ký cần thêm (không thân hàm):

```ts
// rooms.service.ts
async get(user: AuthUser, id: number): Promise<RoomView>

// rooms.controller.ts
@Roles('BOSS', 'MANAGER')
@Get(':id')
get(@CurrentUser() user: AuthUser, @Param() params: RoomIdParamsDto): Promise<RoomView>
```

Hình dạng `images` (giữ y như sau `POST /rooms/:id/images`, `UI-10`/`FILE-02`): `{ id, roomId, publicId, url, sortOrder }[]`, thứ tự `sortOrder` tăng rồi `id` tăng. Không trả `assetId`, `version`, `format` ra ngoài (FE chỉ gửi vào lúc tạo).

Bảng/cột dùng: `rooms` (toàn bộ cột `toView` đang đọc), `room_images (id, room_id, public_id, url, sort_order)`, `contracts (status)`, `viewings (room_id, status)`. Không ghi gì.

Dòng spec sẽ thêm vào bảng API của `11-buildings-rooms.md`, ngay dưới dòng `/rooms`:

```
| GET | `/rooms/:id` | staff in scope – chi tiết phòng: như `/rooms` + `furniture`, `description`, `images` (ROOM-07) và `pendingViewingCount` (ROOM-09, VIEW-13) |
```

## 3. Câu hỏi bỏ ngỏ

Không có câu hỏi phải DỪNG. Hai điểm spec im lặng, xử lý theo route đã có nên không phải quy tắc nghiệp vụ mới:

- `[ASSUMPTION]` Phòng đã khóa (`is_active = false`) vẫn trả về 200 cho staff trong phạm vi, vì FE cần chi tiết phòng để mở khóa và `PATCH /rooms/:id` cũng đã cho phép tác động lên phòng đã khóa. Lọc `includeInactive` chỉ là quy tắc của danh sách (`BLD-07`), không áp cho route chi tiết.
- Tòa bị khóa: `BLD-06` xóa `manager_id` khi khóa tòa, nên `user.buildingIds` của manager không còn chứa tòa đó → tự nhiên ra 403 `OUT_OF_SCOPE` qua `assertRoomScope`, không cần kiểm tra `building.isActive` riêng. Boss vẫn xem được (giống `PATCH`).

## 4. Checkpoints

### CP-1 · Bản nháp spec (dòng API)

- Task/spec: `ROOM-07`, `ROOM-09`, `VIEW-13`, Q-FE8A-2/3.
- File: tạo `Artifacts/2026-11-04-BE-P2-GET-ROOM-spec/REVIEW.md` và `Artifacts/2026-11-04-BE-P2-GET-ROOM-spec/docs/spec/11-buildings-rooms.md` = **copy nguyên văn bản main hiện tại** + đúng 1 dòng bảng API ở mục 2. Không sửa chữ nào khác trong file spec. REVIEW.md theo mẫu `Artifacts/README.md` (Trạng thái: ĐANG LÀM, task/spec, gốc `2fa7acb`, mục "File sẽ thêm / sửa / xóa ở bản chính" liệt kê `docs/spec/11-buildings-rooms.md`).
- Done when: `git diff --no-index` giữa file main và file draft chỉ hiện 1 dòng thêm vào (`git --no-pager diff --no-index -- "docs/spec/11-buildings-rooms.md" "Artifacts/2026-11-04-BE-P2-GET-ROOM-spec/docs/spec/11-buildings-rooms.md"` → đúng một dòng `+`).
- Kịch bản test: không có test tự động (tài liệu). Tester chỉ xác nhận dòng mới khớp hợp đồng ở mục 2 và vị trí nằm trong bảng API.

### CP-2 · Code draft: service `get()` + route controller

- Task/spec: `ROOM-07`, `ROOM-09`, `VIEW-13`, `SCOPE-02`.
- File draft (cả hai mirror từ main hiện tại, xem cảnh báo P2-5):
  - `src/modules/rooms/rooms.service.ts` – thêm `get()` đúng chữ ký trên; dùng lại `ROOM_INCLUDE`, `toView`, `assertStaff`, `assertRoomScope`, `PENDING_VIEWING_STATUSES`; không viết mapper/kiểu/DTO mới.
  - `src/modules/rooms/rooms.controller.ts` – thêm `@Get(':id')` sau `@Get()`; controller mỏng, chỉ gọi `this.rooms.get`.
  - `ref/vitest.preview.config.ts` – copy từ `Source/backend/artifact_BE/approved/2026-11-04-BE-P2-5-main-test-fix/ref/vitest.preview.config.ts` (đổi tên plugin thành `get-room-test-main-fallback`, giữ nguyên `exclude`).
- Không sửa `rooms.types.ts`, `dto/rooms.dto.ts`, `rooms.module.ts`.
- Done when: `cd Source/backend && npx tsc -b --noEmit` không lỗi (hoặc `npm run lint` xanh) và `npx vitest run --config artifact_BE/2026-11-04-BE-P2-GET-ROOM/ref/vitest.preview.config.ts` giữ nguyên số test pass như trước khi sửa (chưa có test mới).

### CP-3 · Test draft

- Task/spec: `ROOM-07`, `ROOM-09`, `VIEW-13`, `SCOPE-02`.
- File draft: `src/modules/rooms/rooms.detail.spec.ts` (một file; tên test có spec ID, ví dụ `it('ROOM-09: GET /rooms/:id trả pendingViewingCount ...')`). Mock Prisma ở mức delegate như `rooms.http.spec.ts`/`rooms.images.spec.ts` đang làm; không chạm DB thật.
- Kịch bản test (mỗi mục ghi spec ID, kết quả mong đợi lấy từ spec):
  1. `ROOM-09`/`VIEW-13` happy path – Boss, phòng có 3 lịch `NEW`/`CONFIRMED` → 200, `pendingViewingCount = 3`, `viewing.count` được gọi với `{ roomId: id, status: { in: ['NEW','CONFIRMED'] } }`; lịch `DONE`/`CANCELLED` không được tính.
  2. `ROOM-09` biên 0 – phòng không có lịch chờ → `pendingViewingCount = 0` (có mặt trong response, không phải `undefined`).
  3. `ROOM-07` ảnh – phòng có nhiều ảnh → `images` theo `sortOrder` tăng rồi `id` tăng (kiểm tra `include.images.orderBy`), mỗi phần tử đúng 5 trường `{ id, roomId, publicId, url, sortOrder }`, **không** có `assetId`/`version`/`format`.
  4. `ROOM-07` biên – phòng không có ảnh → `images = []`.
  5. Trạng thái dẫn xuất (`Room status`, 11-buildings-rooms) – phòng có contract `ACTIVE` → `status = 'Đang thuê'`; phòng `underMaintenance` không contract → `'Bảo trì'`; không gì → `'Trống'`.
  6. `SCOPE-02` khác tòa – Manager với `buildingIds = [10]`, phòng thuộc tòa 11 → 403 `OUT_OF_SCOPE` (ném `ForbiddenException`, message `OUT_OF_SCOPE`), và **không** gọi `viewing.count`.
  7. `SCOPE-02` trong tòa – Manager với `buildingIds = [10]`, phòng tòa 10 → 200.
  8. Role – user `TENANT` → 403 `FORBIDDEN` (route cũng có `@Roles('BOSS','MANAGER')`).
  9. Không tồn tại – `room.findUnique` trả `null` → 404 `NOT_FOUND`, không gọi `viewing.count`.
  10. `[ASSUMPTION]` phòng đã khóa – `isActive = false`, staff trong phạm vi → 200, `isActive: false` trong response.
  11. Định tuyến – một test supertest nhỏ (mẫu `rooms.http.spec.ts`) gọi `GET /api/v1/rooms/7` để chắc `@Get(':id')` không bị `@Get()` (list) hay `:id/images` chiếm: body là object chi tiết, không phải `{ items, meta }`; `GET /api/v1/rooms/abc` → 400 `VALIDATION_FAILED`.
- PASS: `cd Source/backend && npx vitest run --config artifact_BE/2026-11-04-BE-P2-GET-ROOM/ref/vitest.preview.config.ts` → 0 failed, mọi test cũ của main vẫn xanh, và các test mới ở trên đều pass. Thêm `npm run lint` xanh.

## 5. Ràng buộc cho mọi agent trong draft này

- **Không** chạy `npm run test:e2e`, không lệnh nào ghi DB (`prisma migrate`, `db push`, `seed`), không đọc/ghi `.env*`, không `npm install`/thêm package, không chạy `node .claude/scripts/apply-draft.mjs`.
- Chỉ ghi file trong `Source/backend/artifact_BE/2026-11-04-BE-P2-GET-ROOM/` và `Artifacts/2026-11-04-BE-P2-GET-ROOM-spec/`. Không sửa file chính (hook chặn).
- Test draft chạy bằng overlay `ref/vitest.preview.config.ts` (chạy cùng toàn bộ unit test của main); không sửa `vitest.config.ts` hay `package.json` của main.
- Nếu phát hiện spec thiếu hoặc một quy tắc nghiệp vụ chưa rõ: DỪNG và hỏi chủ dự án, không tự quyết.
