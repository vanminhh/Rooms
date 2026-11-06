# PLAN · BE-P2-28 · e2e giá (P2-5)

Draft: `Source/backend/artifact_BE/2026-11-04-BE-P2-28-e2e/`
Task: `BE-P2-28` (`docs/phase-2-rooms/feature_p2-5-backend-pricing.md`)
Spec: PRC-01, PRC-02, PRC-03, PRC-06, PRC-07, PRC-09, API-05, API-07, SCOPE-02, G-06, Q-P5-5, Q-P5-6, Q-P5-7

## 1. Mục tiêu và phạm vi

**Trong phạm vi**: thêm đúng **một file** e2e mới chạy trên DB dev thật, phủ Done-when của BE-P2-28:

1. Manager đề xuất giá phòng (PRC-01) → giá công khai của phòng **không đổi** (vẫn `null`).
2. Boss duyệt (PRC-03) → giá công khai đổi ngay khi `effectiveFrom = hôm nay`.
3. Giá hiệu lực **tương lai** → `rooms.price` không đổi; sau khi ngày hiệu lực tới, `RoomPriceSyncJob.sync([roomIds])` mới ghi giá (PRC-06); chạy lần hai không đổi gì.
4. Nhánh quan trọng: `Idempotency-Key` replay (cùng payload → cùng response; khác payload → 409 `CONFLICT_STATE`) (API-05, Q-P5-6); duyệt lần hai → 409 `CONFLICT_STATE` (PRC-09); manager duyệt → 403 `FORBIDDEN` (API-07); phòng/tòa khóa → manager đề xuất 403 `OUT_OF_SCOPE` (Q-P5-7).

**Ngoài phạm vi** (đã có unit test, không lặp lại trong e2e để giữ e2e nhanh và ít rác DB):
`/rate-plans` (RATE-01..06), PRC-04 (Boss tự đề xuất = duyệt ngay), PRC-08 (supersede giá tương lai), PRC-07 `PRICE_PROPOSAL_EXPIRED`, PRC-12 (% so sánh), danh sách PRC-10..12, logic mở khóa phòng/tòa (đã có `rooms.unlock-price.spec.ts`, `buildings.unlock-price.spec.ts`).
**Không sửa code nghiệp vụ.** Nếu e2e phát hiện lỗi thật, tester dừng và báo, không tự sửa `src/`.

**Phân vai (quan trọng)**: `test/pricing.e2e-spec.ts` là **file test**, nên thuộc vai **TESTER**, không phải coder — hook `agent-guard.mjs` chặn coder ghi file test. Kế hoạch này **không có checkpoint coder**: CP-1 và CP-2 đều do tester thực thi (CP-1 tạo file, CP-2 bổ sung `it` vào **cùng** file). `REVIEW.md` do tester/planner cập nhật trong đúng phạm vi của mình.

## 2. Kiến trúc

```
test/pricing.e2e-spec.ts  (vitest + supertest, DB dev thật)
  ├─ beforeAll: AppModule + configureApp → app, PrismaService
  │            login Boss (prisma/seed.ts DEV_ACCOUNTS) ; E2eRun() → runId
  ├─ fixtures: POST /managers → login + change-password → managerSession
  │            POST /buildings (managerId) → POST /rooms × 3 (A, B, C)  [price = null khi tạo]
  ├─ CP-1 tests ── POST /room-prices (manager) ─PENDING→ rooms.price null
  │                POST /room-prices/:id/approve (Boss) ─APPROVED→ rooms.price = giá mới
  │                giá tương lai → job sync([B]) không đổi → lùi effectiveFrom về hôm nay (prisma)
  │                → sync([B]) updated=1 → sync([B]) lần 2 updated=0
  ├─ CP-2 tests ── Idempotency-Key replay / khác payload / duyệt 2 lần / manager duyệt / phòng khóa
  └─ afterAll: cleanupRun(prisma, e2e.log) → e2e.finish('CLEANED') → app.close()
```

### File

| Target | Draft | Việc |
|---|---|---|
| `Source/backend/test/pricing.e2e-spec.ts` | `.../2026-11-04-BE-P2-28-e2e/test/pricing.e2e-spec.ts` | **Thêm**: toàn bộ e2e giá — do **tester** viết |
| `Source/backend/artifact_BE/2026-11-04-BE-P2-28-e2e/REVIEW.md` | như vậy | Cập nhật "Làm gì, vì sao" + danh sách file (CP-2) — tester |

Không thêm/sửa file nào khác. Không `*.spec.ts` (tên `*.e2e-spec.ts` **không** khớp `**/*.spec.ts` của `vitest.config.ts`, nên `npm run test` giữ nguyên 1272 test).

### Hợp đồng phải theo đúng

Import **sao y header** của `test/buildings.e2e-spec.ts` (đường dẫn tương đối tính từ `test/` sau khi apply — trong draft chúng chưa resolve, xem §5):

```ts
import { configureApp } from '../src/app.setup.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { RoomPriceSyncJob } from '../src/jobs/room-price-sync.job.js';
import { addDays, formatDateOnly, todayHanoi } from '../src/common/date/today.js';
import { cleanupRun, E2eRun, uniqueBuildingCode, uniquePhone } from '../scripts/e2e/run.js';
if (existsSync('.env')) process.loadEnvFile('.env');
vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });
```

- `send(app, method, path, body?, session?)`, `cookieOf`, `sessionOf`: copy nguyên từ `buildings.e2e-spec.ts` (thêm `'patch'` vào union method; prefix `/api/v1`).
- Job: `app.get(RoomPriceSyncJob)` (Nest tìm toàn container, provider của `PricingModule`), gọi `await job.sync([roomId])`; trả về `{ scanned, updated, unchanged, withoutApprovedPrice }`.
- Ngày: `const today = formatDateOnly(todayHanoi())`, `const tomorrow = formatDateOnly(addDays(todayHanoi(), 1))`.

Route và kết quả mong đợi (`{ data }` bọc ngoài, lỗi `{ error: { code, fields? } }`):

| Request | Status | `data` / `error.code` |
|---|---|---|
| `POST /room-prices` `{ roomId, price, effectiveFrom, reason? }` (staff) | 201 | `{ id, roomId, buildingId, price, effectiveFrom, status: 'PENDING', expired: false, comparison }` |
| `POST /room-prices/:id/approve` (Boss) | 201 | `status: 'APPROVED'`, `reviewedById` = Boss id |
| lần hai trên cùng id (key khác/không key) | 409 | `CONFLICT_STATE` |
| cùng `Idempotency-Key` + cùng payload | 201 | body **giống hệt** lần đầu (cùng `id`) |
| cùng `Idempotency-Key` + payload khác | 409 | `CONFLICT_STATE` |
| manager gọi `/approve` | 403 | `FORBIDDEN` |
| manager đề xuất cho phòng đã khóa | 403 | `OUT_OF_SCOPE` |
| `GET /room-prices?roomId&status=PENDING` | 200 | `{ data: [...], meta: { total } }` |

DB đọc trực tiếp: `prisma.room.findUnique({ where: { id }, select: { price: true } })`; `prisma.roomPrice.update(...)` chỉ ở bước "giả lập ngày hiệu lực đã tới".

Dọn dữ liệu: ghi nhật ký mọi bản ghi tạo được — `e2e.record('users'|'buildings'|'rooms'|'room_prices', id)`, `e2e.recordBuildingCode(code)` — **ngay sau khi tạo thành công, trước các assert khác** (như buildings e2e), để `afterAll` dọn được cả khi test fail. Tên dữ liệu luôn có `[E2E ${e2e.runId}]`.

## 3. Câu hỏi bỏ ngỏ

Không có câu hỏi chặn (Q-P5-1..9 đã được chủ dự án trả lời). Các `[ASSUMPTION]` dùng trong plan:

- **[ASSUMPTION A1]** Chưa có endpoint công khai (`GET /public/rooms/:id` thuộc phần sau của Phase 2; hiện chỉ có `/public/settings`). "Giá công khai" trong e2e = cột `rooms.price` (đúng nguồn mà PRC-03/PRC-06 ghi và `publicRoomWhere` lọc), kiểm tra qua `prisma.room` **và** `GET /rooms?buildingId=…`. File ghi comment `shortcut: dùng rooms.price vì chưa có /public/rooms/:id, đổi sang endpoint công khai khi nó tồn tại`.
- **[ASSUMPTION A2]** Không "du hành thời gian" được trong e2e, nên nhánh job được dựng bằng: duyệt giá hiệu lực **ngày mai** → `sync` không đổi gì → `prisma.roomPrice.update({ effectiveFrom: hôm nay })` (giả lập ngày hiệu lực đã tới / server tắt lúc 01:00) → `sync` ghi giá. Có comment giải thích.
- **[ASSUMPTION A3]** Nhánh "tòa khóa" được test bằng **phòng khóa** (`PATCH /rooms/:id { isActive: false }`): khóa tòa (BLD-06) tự bỏ gán manager nên 403 khi đó chỉ chứng minh scope, không chứng minh nhánh khóa. Cùng mã lỗi `OUT_OF_SCOPE`, cùng nhánh `assertRoomScope`.
- **[ASSUMPTION A4]** Mốc nửa đêm: test tính `today` một lần ở đầu run (như các e2e hiện có); nếu run vắt qua 00:00 Hà Nội có thể flaky — rủi ro chấp nhận, không thêm cơ chế chống.
- **[ASSUMPTION A5]** Nhánh biên của job được chốt bằng `job.sync([room.c])` khi C **chưa có giá APPROVED** → mong đợi `withoutApprovedPrice === 1` (`updated === 0`), thay vì chỉ `sync([])`. Đây là suy luận từ tên trường trả về của `RoomPriceSyncJob`, không có trong spec → **phải liệt kê trong báo cáo cuối**.

## 4. Checkpoints

Cả hai checkpoint do **tester** thực thi (file e2e là file test). Không có việc cho coder.

### CP-1 · (tester) Fixtures + luồng chính PRC-01/03/06
Task: `BE-P2-28` · Spec: PRC-01, PRC-02, PRC-03, PRC-06, G-06, A1, A2
Agent: **tester** · File: `test/pricing.e2e-spec.ts` (**tạo mới**, `describe` + `beforeAll`/`afterAll` + fixtures + 3 `it`)

Nội dung:
- `beforeAll`: dựng app, login Boss từ seed, `E2eRun`.
- `it` fixtures: tạo manager (`POST /managers` → login tạm → `POST /auth/change-password`), tòa `[E2E …]` gán manager, 3 phòng A/B/C (`POST /rooms`, `price` không có trong DTO nên mặc định `null`). Assert `price === null` cho cả 3.
- `it('PRC-01, PRC-02: manager đề xuất → giá công khai chưa đổi')`
- `it('PRC-03, G-06: Boss duyệt giá hiệu lực hôm nay → rooms.price đổi trong cùng transaction')`
- `it('PRC-06: giá hiệu lực tương lai chỉ được job ghi, chạy lại không đổi')`
- `afterAll`: `cleanupRun` + `expect(skipped).toEqual([])` + `finish('CLEANED')` + `app.close()` (copy từ buildings e2e).

**Done when** (chạy từ `C:\Users\Nguyen Danh Toan\Rooms\Source\backend`):
- `npx oxlint --type-aware "C:\Users\Nguyen Danh Toan\Rooms\Source\backend\artifact_BE\2026-11-04-BE-P2-28-e2e\test\"` → 0 warning/error. Đây là bước lint **duy nhất** phủ file draft, vì `npm run lint` **không quét** `artifact_BE/`. Không chạy `tsc`.
- `npm run lint` → 0 lỗi (phần không đổi); `npm run test` → vẫn **1272 test PASS** (file `*.e2e-spec.ts` không bị `vitest.config.ts` gom vào).
- **Không** chạy `npm run test:e2e` (phiên chính chạy sau khi duyệt).

**Kịch bản test** (tester viết các `it` này; không chạy e2e thật trong phiên draft):
| # | Kịch bản | Spec | Kết quả mong đợi phải có trong file |
|---|---|---|---|
| 1 | Manager `POST /room-prices` phòng A, `effectiveFrom = today`, `price = 3_000_000` | PRC-01 | 201, `status: 'PENDING'`, `expired: false`, `comparison` bằng `{ oldValue: null, newValue: 3_000_000, changePercent: null, label: 'Giá mới' }` (tên trường đúng là `oldValue`, xem `src/modules/pricing/price-comparison.ts` + `pricing.types.ts`); `prisma.room(A).price === null`; `GET /rooms` cũng `price: null` |
| 2 | Manager đề xuất lần hai cho A (`price = 3_200_000`, key khác) | PRC-02 | 201; `GET /room-prices?roomId=A&status=PENDING` → `meta.total === 1`, đúng id mới; bản cũ `status: 'SUPERSEDED'` |
| 3 | Boss `POST /room-prices/:id/approve` (đề xuất mới nhất của A) | PRC-03, G-06 | 201, `status: 'APPROVED'`, `reviewedById` = Boss; `prisma.room(A).price === 3_200_000` **ngay**, chưa chạy job |
| 4 | `job.sync([A])` sau khi duyệt | PRC-06 | `updated === 0`, `unchanged === 1`, giá A không đổi |
| 5 | Boss đề xuất+duyệt cho phòng B với `effectiveFrom = tomorrow` (hoặc manager đề xuất rồi Boss duyệt), `price = 4_000_000` | PRC-03, PRC-06 | 201 `APPROVED`; `prisma.room(B).price === null`; `job.sync([B])` → `updated === 0`, `withoutApprovedPrice === 1` |
| 6 | Lùi `effectiveFrom` của bản APPROVED của B về `today` qua prisma, rồi `job.sync([B])` | PRC-06, A2 | `updated === 1`; `prisma.room(B).price === 4_000_000` |
| 7 | `job.sync([B])` lần hai | PRC-06 | `updated === 0`, `unchanged === 1`, giá giữ nguyên (job không bao giờ ghi `null`) |
| 8 | Biên: `job.sync([])`, rồi `job.sync([room.c])` khi C **chưa có giá APPROVED** | PRC-06, A5 | `sync([])` không ném lỗi, `scanned === 0`, `updated === 0`; `sync([room.c])` → `updated === 0` và **`withoutApprovedPrice === 1`** ([ASSUMPTION A5] — liệt kê trong báo cáo cuối) |

### CP-2 · (tester) Nhánh idempotency, xung đột, quyền, khóa
Task: `BE-P2-28` · Spec: API-05, API-07, PRC-09, SCOPE-02, Q-P5-6, Q-P5-7, A3
Agent: **tester** · File: `test/pricing.e2e-spec.ts` (**thêm `it` vào cùng file của CP-1**, không tạo file mới), `REVIEW.md` (điền "Làm gì, vì sao" + danh sách file + cách chạy e2e)

**Done when**: cùng bộ lệnh như CP-1 (`npx oxlint --type-aware` trên thư mục draft, `npm run lint`, `npm run test` = 1272 PASS; không `tsc`) và `REVIEW.md` ghi rõ: file thêm vào bản chính, các `[ASSUMPTION]` A1..A5, lệnh phiên chính phải chạy sau khi duyệt (`npm run test:e2e`, rồi `node scripts/e2e/cleanup.mjs` ở chế độ liệt kê).

**Kịch bản test**:
| # | Kịch bản | Spec | Kết quả mong đợi |
|---|---|---|---|
| 1 | Manager `POST /room-prices` phòng C(đang mở) với `Idempotency-Key: e2e-<runId>-1`, gửi **hai lần cùng payload** | API-05, Q-P5-6 | cả hai 201, body lần hai **bằng** lần đầu (cùng `id`, cùng `createdAt`); `GET /room-prices?roomId=C` → chỉ 1 bản ghi |
| 2 | Cùng key `e2e-<runId>-1`, payload khác (`price` khác) | Q-P5-6 | 409, `error.code === 'CONFLICT_STATE'`; vẫn chỉ 1 bản ghi cho C |
| 3 | Boss duyệt đề xuất của C, rồi duyệt **lần hai** (key khác hoặc không key) | PRC-09 | lần một 201 `APPROVED`; lần hai 409 `CONFLICT_STATE`; `rooms.price` của C không đổi sau lần hai |
| 4 | Manager gọi `POST /room-prices/:id/approve` và `/reject` (đề xuất PENDING khác, tạo trên A) | API-07 | 403, `error.code === 'FORBIDDEN'`; bản ghi vẫn `PENDING` trong DB |
| 5 | Quyền/phạm vi: `PATCH /rooms/:id { isActive: false }` (Boss) cho một phòng của tòa đang gán manager, rồi manager đề xuất giá phòng đó | Q-P5-7, SCOPE-02, A3 | 403, `error.code === 'OUT_OF_SCOPE'`; không có bản ghi `room_prices` mới cho phòng đó |
| 6 | Biên dữ liệu: `price = 0` và `effectiveFrom = hôm qua` khi đề xuất | PRC-01 | 400 `VALIDATION_FAILED`, `fields.price` / `fields.effectiveFrom` có thông báo tiếng Việt |
| 7 | Nhật ký run không chứa bí mật (như test cuối của buildings e2e) | BE-P2-09 | `JSON.stringify(e2e.log)` không chứa `password`, `token`, số điện thoại manager; `log.ids.room_prices` chứa mọi id đã tạo |
| 8 | Dọn dữ liệu | BE-P2-09 | `afterAll`: `cleanupRun` trả `[]` skipped; bản PENDING còn lại → `REJECTED` với `reviewNote = '[E2E] dọn dữ liệu thử'`; phòng/tòa/manager `isActive = false` |

## 5. Lưu ý thực thi cho tester

- Trong draft, `../src/…` và `../scripts/…` **chưa** resolve (file nằm ở `artifact_BE/<folder>/test/`); đó là đúng ý: `apply-draft.mjs` sẽ đưa file về `Source/backend/test/`, nơi các đường dẫn này khớp với `buildings.e2e-spec.ts`. Vì vậy **không** đổi import thành đường dẫn "chạy được trong draft", và nếu `oxlint --type-aware` báo không tìm thấy module cho đúng các import này thì bỏ qua (chỉ các cảnh báo khác mới phải sửa).
- Cấm: `npm run test:e2e`, mọi lệnh ghi DB dev, `cleanup.mjs --apply`, đọc `.env`, cài gói, `apply-draft.mjs`.
- Không đụng `src/modules/pricing/**`, `src/modules/rooms/**` (một orchestrator khác đang làm `GET /rooms/:id`); chỉ **đọc** để lấy tên trường/hợp đồng.
- Mọi dữ liệu tạo trong e2e phải gắn `[E2E ${runId}]` và được `e2e.record(...)` ngay sau khi tạo.
