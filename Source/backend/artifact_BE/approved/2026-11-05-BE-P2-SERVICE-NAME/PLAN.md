# PLAN — BE-P2-SERVICE-NAME · thêm `serviceName` vào `RatePlanView`

Nguồn: Q-FE8B-7 (`docs/phase-2-rooms/feature_p2-8b-frontend-pricing-viewings.md`, chủ dự án chọn "backend thêm serviceName" 05/11/2026) ·
spec `docs/spec/12-pricing.md` (PRC-10, PRC-12, RATE-01), `docs/spec/11-buildings-rooms.md` (SVC-01..04).
Khuôn mẫu: `Source/backend/artifact_BE/approved/2026-11-05-BE-P2-PRICE-NAMES/` (cùng kiểu "thêm trường qua `include`").
Draft folder: `Source/backend/artifact_BE/2026-11-05-BE-P2-SERVICE-NAME/` (mirror `Source/backend/`).

## 1. Mục tiêu và phạm vi

Trong phạm vi:

- `RatePlanView` thêm `serviceName: string | null` — `services.name` của bảng giá `kind = SERVICE`; `null` cho `ELECTRIC`/`WATER`
  (và `null` khi `serviceId = null`, theo quan hệ `RatePlan.service` là optional trong `schema.prisma`).
- Có trong **mọi** response trả `RatePlanView`: `GET /rate-plans`, `POST /rate-plans` (propose, kể cả nhánh Boss tự duyệt PRC-04),
  `POST /rate-plans/:id/approve`, `POST /rate-plans/:id/reject`.
- Lấy bằng `include: { service: { select: { name: true } } }` thêm vào `RATE_PLAN_INCLUDE` đã có — **không thêm truy vấn nào**
  (DB dev ~0,8 s/truy vấn). `RATE_PLAN_INCLUDE` đang được dùng ở cả 3 nơi dựng row: `listRatePlans.findMany`,
  `ratePlan.create` (propose) và `lockRatePlan.findUnique` (approve/reject), nên một chỗ sửa là đủ.
- Cập nhật fixture rate-plan trong test pricing + thêm test: SERVICE có tên, ELECTRIC/WATER `null`, không thêm truy vấn.
- Một cụm chữ bổ sung vào PRC-12 trong spec 12 (draft spec riêng).

Ngoài phạm vi: không đổi controller / DTO / module / job; không đổi `RoomPriceView`; không đổi nghiệp vụ
(PRC-01..12, RATE-01..06, SVC-04 / Q-P5-8, Q-P5-9 giữ nguyên); không đổi thứ tự hay giá trị các trường cũ;
không thêm filter/sort; không sửa FE; không chạy e2e; không `apply-draft.mjs`.

## 2. Kiến trúc

```
GET /rate-plans ───────> listRatePlans
                           prisma.ratePlan.findMany({ include: RATE_PLAN_INCLUDE })  ← 1 truy vấn: tiers + building + service
POST /rate-plans ──────> proposeRatePlan: tx.ratePlan.create({ include: RATE_PLAN_INCLUDE })
                           (Boss) └─> approveRatePlanInTx ─> lockRatePlan(RATE_PLAN_INCLUDE)
POST …/approve|reject ─> lockRatePlan: tx.ratePlan.findUnique({ include: RATE_PLAN_INCLUDE })
                                 │
                                 └─> toRatePlanView(db, row)
                                       └─> RatePlanView { …, buildingName, serviceName: row.service?.name ?? null }
```

Không N+1: `service.name` đi kèm chính truy vấn `findMany`/`create`/`findUnique` đã có; `approveRatePlanInTx` và
`rejectRatePlan` dùng `{ ...row, … }` nên `row.service` được mang theo, không đọc lại. `tx.service.findUnique` trong
`proposeRatePlan` (kiểm tra SVC-04 / Q-P5-8) **giữ nguyên** `select: { buildingId, isActive }` — không thêm `name` vào đó,
vì tên lấy từ row đã create. `oldRateTiers` giữ `include: { tiers: … }` (không cần tên dịch vụ) — tránh join vô ích.

### File trong draft

| Đích (main) | Draft | Mục đích | Mirror từ |
|---|---|---|---|
| `src/modules/pricing/pricing.types.ts` | `src/modules/pricing/pricing.types.ts` | thêm 1 trường vào `RatePlanView` | **bản main hiện tại** `Source/backend/src/modules/pricing/pricing.types.ts` (đã có `roomCode`/`buildingName`, chưa commit) |
| `src/modules/pricing/pricing.service.ts` | `src/modules/pricing/pricing.service.ts` | `RATE_PLAN_INCLUDE` + `RatePlanRow` + `toRatePlanView` | **bản main hiện tại** `Source/backend/src/modules/pricing/pricing.service.ts` (đã có `RATE_PLAN_INCLUDE`, `buildingName`) |
| — (chỉ để chạy test) | `ref/vitest.preview.config.ts` | overlay draft-first | copy y nguyên `artifact_BE/approved/2026-11-05-BE-P2-PRICE-NAMES/ref/vitest.preview.config.ts`, chỉ sửa danh sách `exclude` |
| `src/modules/pricing/pricing.list.spec.ts` | cùng đường dẫn | fixture `service` + test list/propose | **bản main hiện tại** (đã có test `roomCode`/`buildingName`) |
| `src/modules/pricing/pricing.review.spec.ts` | cùng đường dẫn | fixture `service` + test approve/reject | **bản main hiện tại** |
| `docs/spec/12-pricing.md` | `Artifacts/2026-11-05-BE-P2-SERVICE-NAME/docs/spec/12-pricing.md` (draft spec riêng, `REVIEW.md` do phiên chính tạo) | bổ sung `serviceName` vào câu hợp đồng response ở PRC-12 | **bản main hiện tại** `docs/spec/12-pricing.md` (dòng 30 đã có câu `roomCode`/`buildingName` của PRICE-NAMES) |

Quan trọng: mọi file mirror từ bản **main hiện tại** (change roomCode/buildingName đã chép vào main, chưa commit),
**không** lấy từ `HEAD` và **không** lấy từ thư mục `approved/2026-11-05-BE-P2-PRICE-NAMES/`.

### Overlay vitest (draft-first)

`ref/vitest.preview.config.ts` giống hệt bản PRICE-NAMES (root = `Source/backend`, plugin `draftFirstFallback`,
`cacheDir = ref/vite-cache`, `include` thêm `<draft>/src/**/*.spec.ts`). Chỉ thay `exclude` bằng đúng những spec main bị
draft ghi đè cùng đường dẫn, nếu không vitest chạy cả hai bản:

```ts
exclude: [
  'src/modules/pricing/pricing.list.spec.ts',
  'src/modules/pricing/pricing.review.spec.ts',
],
```

Nếu CP-2 phải copy thêm spec nào vào draft thì thêm đúng đường dẫn đó vào `exclude`.

### Hợp đồng (chỉ kiểu, không thân hàm)

`pricing.types.ts` — thêm ở **cuối** interface để thứ tự trường cũ không đổi:

```ts
export interface RatePlanView {
  // … các trường hiện có, giữ nguyên thứ tự, tới buildingName: string;
  serviceName: string | null; // Q-FE8B-7: services.name khi kind = SERVICE, null cho ELECTRIC/WATER
}
```

`pricing.service.ts`:

```ts
// Tiers, building name and service name come with the plan in the same query (Q-FE8B-2, Q-FE8B-7).
const RATE_PLAN_INCLUDE = {
  tiers: { orderBy: { tierNo: 'asc' } },
  building: { select: { name: true } },
  service: { select: { name: true } },
} as const;

type RatePlanRow = RatePlan & {
  tiers: RateTier[];
  building: { name: string };
  service: { name: string } | null; // optional relation: null khi serviceId = null
};
```

`toRatePlanView` trả thêm, ở **cuối** object literal, ngay sau `buildingName`:

```ts
serviceName: row.service?.name ?? null,
```

Dùng `?.` ở đây là đúng (không phải shortcut): quan hệ `RatePlan.service` là `Service?` trong `schema.prisma`
(`@relation(fields: [serviceId, buildingId], …)`), Prisma trả `service: null` cho ELECTRIC/WATER.

Chữ bổ sung vào PRC-12 (draft spec): thêm vào cuối câu hiện có, không viết lại câu, ví dụ
"… a rate plan carries `buildingName`, plus `serviceName` (`services.name`) when `kind = SERVICE` and `null` for ELECTRIC/WATER."

DB chỉ đọc thêm `services.name` (`VarChar`), không đọc `services.is_active` vào view. Không lộ trường nội bộ
(`isActive` của room/building/service chỉ dùng trong logic).

## 3. Câu hỏi bỏ ngỏ

Không có câu hỏi nghiệp vụ mở: Q-FE8B-7 đã chốt cả tên trường lẫn nguồn dữ liệu, kiểu `string | null` do schema quyết định.

`[ASSUMPTION]` cần nêu lại trong `REVIEW.md`:

- A1: `serviceName` là `services.name` trần, không ghép tên tòa; FE tự ghép nếu muốn.
- A2: Trường mới ở **cuối** interface và cuối object literal → thứ tự JSON của các trường cũ không đổi.
- A3: Bảng giá SERVICE của một dịch vụ đã khóa (`services.is_active = false`) vẫn trả `serviceName` bình thường
  (Q-P5-9 A: plan cũ vẫn duyệt được); không thêm cờ `serviceActive`.
- A4: Dùng `row.service?.name ?? null` thay vì thêm `service` vào mọi fixture bắt buộc — fixture rate-plan cũ thiếu
  `service` sẽ cho `null` chứ không ném lỗi (khác A3 của PRICE-NAMES, vì ở đó quan hệ `building` là bắt buộc).
  Đổi lại, CP-2 phải có test khẳng định SERVICE **có** tên, để `null` âm thầm không lọt qua.

## 4. Checkpoints

### CP-1 — coder: `serviceName` trong view + include (BE-P2-SERVICE-NAME-1)

Task: Q-FE8B-7 · spec PRC-10, PRC-12, RATE-01, SVC-01, API-02.

Files (trong draft):

- `src/modules/pricing/pricing.types.ts` — mirror main hiện tại + 1 trường
- `src/modules/pricing/pricing.service.ts` — mirror main hiện tại + `service` trong `RATE_PLAN_INCLUDE`, `RatePlanRow`, `toRatePlanView`
- `ref/vitest.preview.config.ts` — copy bản PRICE-NAMES, `exclude` như §2
- `Artifacts/2026-11-05-BE-P2-SERVICE-NAME/docs/spec/12-pricing.md` — mirror main hiện tại, bổ sung cụm chữ ở PRC-12
  (không `REVIEW.md`: phiên chính tạo). Nếu agent-guard không cho ghi ra ngoài draft folder, **dừng và báo** phiên chính,
  không tự đổi phạm vi.

Coder **không** viết/sửa test ở CP-1 (việc của tester ở CP-2). Không sửa controller, DTO, module, job, `room-price-sync.ts`.
Nếu overlay fail vì fixture thiếu `service`, coder **không** thêm `?.` hay `any` ở test — ghi lại và để CP-2 xử lý
(theo A4 thì không nên fail).

**Done when** (chạy từ `Source/backend`):

- `npx vitest run --config artifact_BE/2026-11-05-BE-P2-SERVICE-NAME/ref/vitest.preview.config.ts src/modules/pricing`
  → toàn bộ test pricing PASS qua overlay (overlay nạp `pricing.service.ts`/`pricing.types.ts` bản draft).
- `npx vitest run --config artifact_BE/2026-11-05-BE-P2-SERVICE-NAME/ref/vitest.preview.config.ts`
  → toàn bộ unit test PASS qua overlay.
- `npx oxlint src/modules/pricing artifact_BE/2026-11-05-BE-P2-SERVICE-NAME/src` → 0 lỗi.
  (Giới hạn: vitest không typecheck; coder tự đối chiếu `RatePlanRow` với mọi lời gọi `toRatePlanView`, gồm hai chỗ
  `{ ...row, status: … }` trong `approveRatePlanInTx` / `rejectRatePlan`.)

### CP-2 — tester: fixture + test `serviceName` (BE-P2-SERVICE-NAME-2)

Files: copy vào draft **chỉ** `src/modules/pricing/pricing.list.spec.ts` và `src/modules/pricing/pricing.review.spec.ts`
(mirror bản main hiện tại); thêm `pricing.rate-proposal.spec.ts` / `pricing.supersede.spec.ts` / `pricing-idempotency.spec.ts`
chỉ khi overlay run thật sự fail. Mỗi file copy thêm phải được thêm vào `exclude` của overlay config.

Sửa fixture tại đúng chỗ đang dựng object, **không viết lại harness**:

- `pricing.list.spec.ts`: rows của `makeListHarness` (block `listRatePlans`, các row `id 1..5`) thêm
  `service: { name: … }` cho row `kind: 'SERVICE'` (`serviceId: 301`, `302`) và `service: null` cho ELECTRIC/WATER;
  `makeTxRatePlanHarness` (interface `RatePlanRowFixture` + chỗ map ra row, dòng ~584-604) thêm `service` suy ra từ
  `serviceId` (null → `null`); `fakePrisma` của block HTTP nếu cần.
- `pricing.review.spec.ts`: `makeRatePlanReviewHarness` (dòng ~354) thêm `service` vào row trả về của `ratePlan.findUnique`.
  Giữ nguyên assert hiện có "approve/reject không gọi `service.findUnique`" (regression Q-P5-9 A) — change này không
  thêm truy vấn nên assert đó phải vẫn xanh.

Kịch bản test (tên test ghi kèm spec ID):

| # | Kịch bản | Spec ID | Kết quả mong đợi |
|---|---|---|---|
| 1 | `GET /rate-plans` (Boss), row `kind: SERVICE`, `serviceId: 301`, dịch vụ tên "Rác" | Q-FE8B-7, PRC-12, SVC-01 | row có `serviceName: 'Rác'`; `buildingName`, `serviceId`, `tiers`, `comparison`, `expired` y như trước |
| 2 | `GET /rate-plans` (Boss), row `kind: ELECTRIC` và `kind: WATER` | Q-FE8B-7, RATE-01 | cả hai có `serviceName: null` (khóa `serviceName` **tồn tại**, không `undefined`) |
| 3 | `POST /rate-plans` kind SERVICE (manager đề xuất) | RATE-01, Q-FE8B-7 | response PENDING có `serviceName` của dịch vụ vừa chọn |
| 4 | `POST /rate-plans` kind ELECTRIC (manager đề xuất) | RATE-01 | response có `serviceName: null` |
| 5 | Boss tự đề xuất SERVICE (propose → approve trong 1 transaction) | PRC-04 | response APPROVED vẫn có `serviceName` đúng (nhánh `approveRatePlanInTx`) |
| 6 | `POST /rate-plans/:id/approve` một plan SERVICE | RATE-01, PRC-08 | response APPROVED có `serviceName` đúng; `status`/`reviewedById`/`reviewedAt` như cũ |
| 7 | `POST /rate-plans/:id/reject` một plan SERVICE | RATE-05 | response REJECTED có `serviceName` đúng và `reviewNote` giữ nguyên |
| 8 | Không thêm truy vấn: đếm lời gọi fake Prisma khi list 5 row | API-02 | `ratePlan.findMany` 1 lần, `ratePlan.count` 1 lần, `findFirst` ≤ 1/row (comparison), `service.findUnique` **0 lần** |
| 9 | Hình dạng `include`: `listRatePlans` | API-02, Q-FE8B-7 | `findMany` được gọi với `include: expect.objectContaining({ service: { select: { name: true } } })` (dùng `objectContaining`, không so khớp cả object) |
| 10 | Approve/reject không đọc bảng `services` | Q-P5-9 A | assert cũ `service.findUnique` không được gọi vẫn PASS |
| 11 | Plan SERVICE của dịch vụ đã khóa (`isActive: false`) | Q-P5-9 A, A3 | vẫn trả `serviceName` đúng; response **không** chứa khóa `isActive` nào |
| 12 | Biên: `serviceId` có nhưng fixture `service: null` (dữ liệu lệch) | A4 | `serviceName: null`, không ném lỗi |
| 13 | Biên: list rỗng + plan `tiers: []` | API-08 | `data: []` / `comparison: null`, không lỗi; không đổi hành vi cũ |
| 14 | Manager query `buildingId` ngoài phạm vi | SCOPE-02, API-08 | 403 `OUT_OF_SCOPE`, body lỗi không rò tên tòa/tên dịch vụ |
| 15 | Tenant gọi `GET /rate-plans` | PUB-04, API-07 | 403 `FORBIDDEN`, không truy vấn row nào |

**Done when** (chạy từ `Source/backend`):

- `npx vitest run --config artifact_BE/2026-11-05-BE-P2-SERVICE-NAME/ref/vitest.preview.config.ts`
  → PASS toàn bộ (cả test main không copy vào draft).
- `npm run test` (main, chưa apply) vẫn PASS — draft không làm hỏng test chính.
- `npx oxlint src/modules/pricing artifact_BE/2026-11-05-BE-P2-SERVICE-NAME/src` → 0 lỗi.

Không chạy `npm run test:e2e`, không lệnh ghi DB, không đọc `.env`, không cài gói, không `apply-draft.mjs`,
không ghi file chính.
