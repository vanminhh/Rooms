# PLAN — BE-P2-PRICE-NAMES · thêm `roomCode` / `buildingName` vào API giá

Nguồn: Q-FE8B-2 (P2-8b, chủ dự án chọn phương án C ngày 05/11/2026) · spec `docs/spec/12-pricing.md` (PRC-10, PRC-12) ·
`docs/phase-2-rooms/feature_p2-5-backend-pricing.md`.
Draft folder: `Source/backend/artifact_BE/2026-11-05-BE-P2-PRICE-NAMES/` (mirror `Source/backend/`).

## 1. Mục tiêu và phạm vi

Trong phạm vi:

- `RoomPriceView` thêm `roomCode: string` (đúng giá trị `rooms.code` mà API phòng đang trả, ví dụ `203`) và `buildingName: string` (`buildings.name`).
- `RatePlanView` thêm `buildingName: string`.
- Mọi response đang trả hai view đó: `GET /room-prices`, `GET /rate-plans`, `POST /room-prices`, `POST /room-prices/:id/approve|reject`,
  `POST /rate-plans`, `POST /rate-plans/:id/approve|reject` (controller không đổi, chỉ view đổi).
- Lấy dữ liệu bằng `include/select` Prisma có sẵn (join cùng truy vấn), không thêm truy vấn nào — DB dev ~0,8 s/truy vấn.
- Cập nhật fake Prisma trong test pricing nếu cần `room.code` / `building.name`; thêm test cho hai trường mới.
- Một dòng hợp đồng response trong spec 12 (PRC-12), đặt ở draft spec riêng `Artifacts/2026-11-05-BE-P2-PRICE-NAMES/`.

Ngoài phạm vi: không đổi nghiệp vụ (PRC-01..12, RATE-01..06 giữ nguyên), không đổi thứ tự/giá trị các trường hiện có,
không thêm filter/sort mới, không sửa FE, không chạy e2e, không sửa `room-price-sync.ts` (job không dựng view).

## 2. Kiến trúc

```
GET /room-prices ──> PricingService.listRoomPrices
                       prisma.roomPrice.findMany({ include: ROOM_PRICE_INCLUDE })   ← 1 truy vấn, join room + building
                       └─> toView(db, row, row.room)  ──> RoomPriceView { …, roomCode, buildingName }

POST /room-prices ──> proposeRoomPrice: tx.room.findUnique({ select: { …, code, building: { name } } })
                       └─> toView(tx, row, room)
POST …/approve|reject ─> lockRoomPrice (ROOM_PRICE_INCLUDE) └─> toView(tx, row, row.room)

GET /rate-plans ───> listRatePlans: prisma.ratePlan.findMany({ include: RATE_PLAN_INCLUDE })  ← tiers + building.name
POST /rate-plans ──> ratePlan.create({ include: RATE_PLAN_INCLUDE })
POST …/approve|reject ─> lockRatePlan ({ include: RATE_PLAN_INCLUDE })
                       └─> toRatePlanView(db, row) ──> RatePlanView { …, buildingName: row.building.name }
```

Không có N+1: `room.code`, `room.building.name` và `ratePlan.building.name` đi kèm chính truy vấn `findMany`/`findUnique`/`create`
đã có. `oldRoomPrice` / `oldRateTiers` giữ nguyên (vẫn là shortcut 1 truy vấn/row như hiện tại, không thuộc task này).

### File trong draft

| Đích (main) | Draft | Mục đích |
|---|---|---|
| `src/modules/pricing/pricing.types.ts` | `src/modules/pricing/pricing.types.ts` | thêm 3 trường vào 2 interface |
| `src/modules/pricing/pricing.service.ts` | `src/modules/pricing/pricing.service.ts` | include/select + 2 mapper |
| — (chỉ dùng để chạy test) | `ref/vitest.preview.config.ts` | overlay draft-first, copy từ `artifact_BE/approved/2026-11-05-BE-P2-6-main-fixes/ref/vitest.preview.config.ts`, bỏ `exclude` không cần |
| `src/modules/pricing/*.spec.ts` (chỉ file nào thật sự fail / cần assert mới) | cùng đường dẫn trong draft | fixture `code`/`name` + test trường mới |
| `docs/spec/12-pricing.md` | `Artifacts/2026-11-05-BE-P2-PRICE-NAMES/docs/spec/12-pricing.md` (draft spec riêng, có `REVIEW.md` riêng) | 1 dòng hợp đồng response ở PRC-12 |

Lưu ý: mirror từ **bản main hiện tại** của từng file (P2-5/P2-6 đã chép vào main nhưng chưa commit), không dùng bản ở HEAD.

### Hợp đồng (chỉ kiểu, không thân hàm)

`pricing.types.ts` — thêm vào **cuối** mỗi interface để thứ tự trường cũ không đổi:

```ts
export interface RoomPriceView {
  // … các trường hiện có, giữ nguyên thứ tự, tới comparison: PriceChange;
  roomCode: string;     // Q-FE8B-2: rooms.code, như API phòng trả ("203")
  buildingName: string; // buildings.name
}

export interface RatePlanView {
  // … các trường hiện có, tới comparison: RatePlanComparison | null;
  buildingName: string;
}
```

`pricing.service.ts`:

```ts
const ROOM_PRICE_INCLUDE = {
  room: {
    select: {
      buildingId: true,
      code: true,
      isActive: true,
      building: { select: { isActive: true, name: true } },
    },
  },
} as const;

type LockedRoomPrice = RoomPrice & {
  room: { buildingId: number; code: string; isActive: boolean; building: { isActive: boolean; name: string } };
};

// tiers + tên tòa trong cùng một truy vấn; dùng cho listRatePlans, lockRatePlan và ratePlan.create
const RATE_PLAN_INCLUDE = {
  tiers: { orderBy: { tierNo: 'asc' } },
  building: { select: { name: true } },
} as const;

type RatePlanRow = RatePlan & { tiers: RateTier[]; building: { name: string } };

private async toView(
  db: Prisma.TransactionClient,
  row: RoomPrice,
  room: { buildingId: number; code: string; building: { name: string } },
): Promise<RoomPriceView>;

private async toRatePlanView(db: Prisma.TransactionClient, row: RatePlanRow): Promise<RatePlanView>;
private async lockRatePlan(tx: Prisma.TransactionClient, id: number): Promise<RatePlanRow>;
```

Điểm sửa cụ thể (tham chiếu theo bản main hiện tại):

1. `proposeRoomPrice`: `tx.room.findUnique` select thêm `code: true` và `building: { select: { isActive: true, name: true } }`;
   lời gọi cuối đổi `this.toView(tx, row, room.buildingId)` → `this.toView(tx, row, room)`.
2. `approveRoomPriceInTx`, `rejectRoomPrice`: đổi tham số thứ 3 từ `row.room.buildingId` → `row.room`.
3. `listRoomPrices`: `include: ROOM_PRICE_INCLUDE` giữ nguyên (đã đủ sau khi mở rộng); mapper gọi `this.toView(this.prisma, row, row.room)`.
4. `proposeRatePlan`: `tx.ratePlan.create({ …, include: RATE_PLAN_INCLUDE })`; `tx.building.findUnique` giữ nguyên select
   (`id`, `isActive`) — tên tòa lấy từ row đã create, không thêm truy vấn.
5. `listRatePlans` và `lockRatePlan`: dùng `RATE_PLAN_INCLUDE` thay cho `{ tiers: … }`.
6. `toView` trả thêm `roomCode: room.code`, `buildingName: room.building.name`; `toRatePlanView` trả thêm
   `buildingName: row.building.name`. Hai trường nằm cuối object literal.
7. `oldRateTiers` giữ `include: { tiers: … }` (không cần tên tòa) — tránh join vô ích.

Trường nội bộ không lộ: `isActive` của room/building chỉ dùng trong logic (G-06, Q-P5-7), tuyệt đối không đưa vào view.
DB chỉ đọc `rooms.code` (`VarChar(10)`, unique theo `(building_id, code)`) và `buildings.name` (`VarChar(100)`).

## 3. Câu hỏi bỏ ngỏ

Không có câu hỏi nghiệp vụ mở: phương án C đã chốt cả tên trường lẫn nguồn dữ liệu.

`[ASSUMPTION]` cần nêu lại trong REVIEW.md:

- A1: `roomCode` là mã trần `rooms.code` (`203`), không ghép tên tòa; FE tự ghép nếu muốn hiển thị `CG01-203`.
- A2: Hai trường mới được thêm ở **cuối** interface/object literal, nên thứ tự JSON của các trường cũ không thay đổi.
- A3: Fixture rate-plan cũ không có object `building`, nên `row.building.name` trong `toRatePlanView` **ném TypeError**
  (không phải trả `undefined`). Tester thêm `building: { name }` vào fake rate-plan và `code`/`name` vào fixture
  phòng/tòa, **chỉ trong file test** (bản copy spec pricing trong draft); service **không** thêm `?.` — phương án (a),
  chủ dự án chốt 05/11/2026.

## 4. Checkpoints

### CP-1 — coder: view + include/select (BE-P2-PRICE-NAMES-1)

Task: Q-FE8B-2 phương án C · spec PRC-10, PRC-12, RATE-01, API-02/08.

Files (trong draft):

- `src/modules/pricing/pricing.types.ts`
- `src/modules/pricing/pricing.service.ts`
- `ref/vitest.preview.config.ts`
- `Artifacts/2026-11-05-BE-P2-PRICE-NAMES/docs/spec/12-pricing.md` + `REVIEW.md` của draft spec đó
  (thêm vào PRC-12 đúng **một** dòng, kiểu: "Mỗi dòng danh sách và mỗi response propose/approve/reject trả kèm
  `roomCode` (`rooms.code`) và `buildingName` để trang Duyệt giá nhận diện phòng/tòa; rate plan trả `buildingName`.")

Coder **không** viết và **không** sửa test ở CP-1 (test mới là việc của tester ở CP-2).
Trong CP-1, **tester được phép sửa fixture** trong các file spec pricing được copy vào draft (thêm
`building: { name }`, `code`, `name`) để overlay chạy xanh — chỉ fixture, không thêm assert mới.
Không sửa controller, DTO, module, job.

**Done when** (từ `Source/backend`):

- `npx vitest run --config artifact_BE/2026-11-05-BE-P2-PRICE-NAMES/ref/vitest.preview.config.ts src/modules/pricing`
  → **toàn bộ** test pricing PASS qua overlay (overlay nạp service/types bản draft).
- `npx vitest run --config artifact_BE/2026-11-05-BE-P2-PRICE-NAMES/ref/vitest.preview.config.ts`
  → **toàn bộ** unit test PASS qua overlay.
- `npx oxlint src/modules/pricing artifact_BE/2026-11-05-BE-P2-PRICE-NAMES/src` → 0 lỗi.
  (Giới hạn: vitest không typecheck; coder tự đọc lại kiểu `toView`/`toRatePlanView` cho khớp mọi lời gọi.)

### CP-2 — tester: fixture + test trường mới (BE-P2-PRICE-NAMES-2)

Files: copy vào draft **chỉ** những spec pricing cần sửa (bắt đầu từ `pricing.list.spec.ts` và `pricing.http.spec.ts`;
thêm `pricing.review.spec.ts`, `pricing.room-proposal.spec.ts`, `pricing.rate-proposal.spec.ts`,
`pricing.supersede.spec.ts`, `pricing-idempotency.spec.ts` chỉ khi overlay run báo fail).
Trong các harness, bổ sung `code` cho room và `name` cho building ở đúng chỗ đang dựng object
(`makeListHarness` rows, `makeTxRoomHarness`/`makeTxRatePlanHarness` mapping, `fakePrisma` của block HTTP) —
không viết lại harness.

Kịch bản test (mỗi dòng ghi spec ID trong tên test):

| # | Kịch bản | Spec ID | Kết quả mong đợi |
|---|---|---|---|
| 1 | Happy path `GET /room-prices` (Boss, 1 phòng `203` tòa `Chùa Gà`) | PRC-10, PRC-12, Q-FE8B-2 | mỗi row có `roomCode: '203'`, `buildingName: 'Chùa Gà'`; `comparison`, `status`, `expired` y như trước |
| 2 | Happy path `GET /rate-plans` (Boss) | PRC-10, RATE-01 | mỗi row có `buildingName`, không có `roomCode`, `tiers` giữ thứ tự `tierNo` |
| 3 | `POST /room-prices` (manager đề xuất) | PRC-01, PRC-12 | response PENDING có `roomCode` + `buildingName` của phòng vừa đề xuất |
| 4 | `POST /room-prices/:id/approve` và `/reject` | PRC-03, PRC-08 | cả hai response có `roomCode` + `buildingName` đúng phòng; `status` APPROVED/REJECTED như cũ |
| 5 | `POST /rate-plans` + approve/reject | RATE-01, RATE-05 | cả ba response có `buildingName` đúng tòa |
| 6 | Boss tự đề xuất (propose → approve trong 1 transaction) | PRC-04 | response APPROVED vẫn có đủ hai trường (nhánh `approveRoomPriceInTx` từ propose) |
| 7 | Không N+1: đếm số lần gọi `findMany`/`findUnique` của fake Prisma khi list 3 row | API-02 | số lần gọi không tăng so với trước (chỉ `findMany` + `count` + 1 `findFirst`/row cho comparison) và `findMany` được gọi với `include` chứa `code`/`building.name` (`expect.objectContaining`) |
| 8 | Phòng/tòa đang khóa (`isActive: false`) vẫn trong list cho Boss | Q-P5-5, PRC-10 | có `roomCode`/`buildingName`; response **không** chứa khóa `isActive` nào (assert `toHaveProperty` phủ định) |
| 9 | Manager chỉ thấy tòa trong phạm vi; query `buildingId` ngoài phạm vi | SCOPE-02, API-08 | 403 `OUT_OF_SCOPE`, không rò tên tòa ngoài phạm vi trong body lỗi |
| 10 | Tenant gọi `GET /room-prices` | PUB-04, API-07 | 403 `FORBIDDEN`, không truy vấn row nào |
| 11 | Biên: list trống (`buildingId` không tồn tại, Boss) | API-08 | `data: []`, `meta.total: 0`, không lỗi |
| 12 | Biên: `expired` của đề xuất PENDING có `effectiveFrom` = hôm qua theo `Asia/Ho_Chi_Minh` | PRC-07 | `expired: true` và hai trường mới vẫn đúng (chứng minh không đổi hành vi) |

**Done when** (từ `Source/backend`):

- `npx vitest run --config artifact_BE/2026-11-05-BE-P2-PRICE-NAMES/ref/vitest.preview.config.ts`
  → PASS toàn bộ (cả test main không copy vào draft).
- `npm run test` (main, chưa apply) vẫn PASS — draft không làm hỏng test chính.
- `npx oxlint src/modules/pricing artifact_BE/2026-11-05-BE-P2-PRICE-NAMES/src` → 0 lỗi.

Không chạy `npm run test:e2e`, không chạy lệnh ghi DB, không `apply-draft.mjs`.
