# PLAN · Phase 2 · Phần 2 – BE nền dùng chung (BE-P2-01..10)

Bản nháp: `Source/backend/artifact_BE/2026-11-01-BE-P2-01-10/` · đường dẫn trong bản nháp tính từ `Source/backend/`.
File task: `docs/phase-2-rooms/feature_p2-2-backend-foundation.md` · ràng buộc pipeline: `docs/phase-2-rooms/README.md`.

## 1. Mục tiêu và phạm vi

Gom **mọi thứ các phần P2-3..P2-6 cùng dùng** vào một chỗ, để không phần nào viết lại: ánh xạ lỗi DB → mã lỗi spec, lối ra `meta` cho danh sách, helper ngày giờ Hà Nội, helper đơn giá / giá phòng hiện hành, điều kiện "phòng công khai", chữ ký tải ảnh Cloudinary, seed "Gửi xe điện", bộ chạy e2e.

| | |
|---|---|
| Trong phạm vi | BE-P2-01..10 · API-02, API-03, API-04 · PRC-06, PRC-07, RATE-04, RATE-05, RATE-06 · ROOM-05, ROOM-06, BLD-05, BLD-06, BLD-03, SVC-05 · VIEW-08 (chỉ hàm "ca đã bắt đầu") · FILE-01, FILE-02 · SCOPE-02 (một id) · D2-11, D2-12, D2-14, R2-1, R2-2, R2-3, R2-4 |
| Ngoài phạm vi | Mọi endpoint của `buildings`, `rooms`, `pricing`, `viewings`, `/dashboard` (P2-3..P2-6); job giá 01:00 (P2-5); giới hạn IP của lịch hẹn (P2-6); `?sort=` (mỗi endpoint tự khai trường sắp xếp của nó); tính tiền điện theo bậc (Phase 4); sửa spec hoặc file `feature_*.md` |

**Ràng buộc thực thi (bắt buộc, cho mọi checkpoint)**

1. Chỉ ghi trong thư mục bản nháp. Không sửa `REVIEW.md`, không sửa `docs/spec/`, không sửa `feature_*.md`.

   **Luật đứng (áp cho mọi checkpoint, chốt 02/11/2026)**: **không agent nào được ghi một file nào ở ngoài thư mục bản nháp**, kể cả file tạm, file nháp trung gian, `tsconfig` tạm, file log, và kể cả qua shell (`>`, `>>`, `tee`, `Out-File`, `Set-Content`, `cp`, `mv`, `sed -i`). Kết quả kiểm chỉ nằm trong **output của công cụ** rồi dán vào báo cáo, không ghi ra file. Ngoại lệ duy nhất: thư mục tạm của hệ thống do **mã test** tạo lúc chạy bằng `fs.mkdtemp` và tự dọn (CP-7) – đó là runtime của test, không phải agent ghi file.
2. **Không ghi DB dev**: không chạy seed, không `npm run test:e2e`, không migration, không `node scripts/e2e/cleanup.mjs --apply`. Không đọc `.env`. Không cài gói.
3. Kiểm tra trong bản nháp: `npx vitest run artifact_BE/2026-11-01-BE-P2-01-10` (từ `Source/backend`), rồi `npm run test` (phải xanh, gồm cả test Phase 1) và `npm run lint`.
4. **Luật import trong bản nháp** (quan trọng – nếu sai thì test nháp vỡ): một file nháp chỉ được `import` **giá trị** từ (a) `node_modules` / `node:*`, hoặc (b) file khác **có trong bản nháp này**. File chính không nằm trong bản nháp chỉ được `import type` (bị xóa khi chạy, nên không cần phân giải đường dẫn). Vì vậy `files.service.ts` nhận Prisma qua tham số `Pick<PrismaClient, 'room'>` (đúng kiểu `src/common/scope/scope.ts` đang làm) chứ không `constructor(private prisma: PrismaService)`; `files.controller.ts` / `files.module.ts` / `app.module.ts` được phép import file chính vì **không có spec nào import chúng**.

   **Ngoại lệ duy nhất của luật 4 (chủ dự án chốt 01/11/2026: "Đồng ý (b)") – loại file "Bản sao"**: mọi file chính mà mã/test của bản nháp cần nạp được **chép nguyên vào bản nháp, giống từng byte**, như đã làm ở Phase 1 (BE-LOGIN-09-25). Bản nháp **được phép import giá trị** từ các bản sao này (chúng là "file có trong bản nháp này" theo luật 4b). Danh sách ở mục 2.1a. Một bản sao giữ nguyên trạng **Bản sao (giống từng byte)** cho tới khi có checkpoint thật sự cần đổi nó (ví dụ `response.interceptor.ts` ở CP-2 để thêm `meta`); từ checkpoint đó nó chuyển thành file **Sửa** và nằm trong danh sách file của checkpoint đó, không còn bị kiểm `git diff`.
5. `npm run build` chỉ biên dịch `src/` (`tsconfig.build.json`), `npm run lint` chỉ quét `src/ test/` – nên lỗi kiểu trong bản nháp sẽ **không** bị phát hiện trước khi chép. Coder phải tự đọc lại kiểu dữ liệu cẩn thận.

## 2. Kiến trúc

```
                         ┌──────────────────────────────┐
HTTP  ──► ValidationPipe │ app.setup.ts (transform:true)│
          (DTO)          └──────────────┬───────────────┘
                                        ▼
                         ┌──────────────────────────────┐
                         │ FilesController POST /files/sign │
                         └──────────────┬───────────────┘
                                        ▼  signRoomImageUpload(prisma, user, dto)
          ┌───────────────── src/modules/files ─────────────────┐
          │ files.service.ts  (hàm thuần, nhận db qua tham số)  │
          │ cloudinary.ts     (node:crypto, không I/O)          │
          └──────────────┬──────────────────────────────────────┘
                         ▼ throw HttpException(ErrorCode.…)
   ┌───────────────────────────── src/common ─────────────────────────────┐
   │ errors/error-code.ts        ErrorCode + ERRORS (thêm 2 mã)           │
   │ errors/all-exceptions.filter.ts  Prisma/PG → ErrorCode (P2-01)       │
   │ pagination.ts               PaginationQuery · Paginated · paginated  │
   │ response.interceptor.ts     Paginated → { data, meta }               │
   │ date/today.ts    ──────────┐ hôm nay giờ Hà Nội, so sánh, cộng ngày  │
   │ rates/rates-at.ts  ◄───────┤ ratesAt · currentRoomPrice              │
   │ rooms/public-room.ts ◄─────┘ publicRoomWhere · publicBuildingWhere   │
   └──────────────────────────────────────────────────────────────────────┘
                         ▲ dùng lại bởi P2-3..P2-6

prisma/seed.ts  ──► + dịch vụ "Gửi xe điện" đã có đơn giá 150.000 đ (SVC-05)
scripts/e2e/run.ts ──► runId · sinh mã/sđt không trùng · nhật ký · cleanup
scripts/e2e/cleanup.mjs ──► CLI liệt kê (mặc định) / --apply <runId>
                            (nhật ký chạy: test/e2e-runs/, gitignore)
```

### 2.1 File thêm / sửa

| Đích (tính từ `Source/backend/`) | Thêm/Sửa | Việc |
|---|---|---|
| `src/common/errors/error-code.ts` | Sửa | +`PRICE_PROPOSAL_EXPIRED` (409), +`UPLOAD_NOT_CONFIGURED` (503) |
| `src/common/errors/db-errors.ts` | Thêm | Bảng tên ràng buộc/trigger → `{ code, fields? }` + hàm nhận diện lỗi Prisma |
| `src/common/errors/db-errors.spec.ts` | Thêm | 1 test / 1 ánh xạ |
| `src/common/errors/all-exceptions.filter.ts` | Sửa | Gọi `mapDbError()` trước khi về `INTERNAL_ERROR` |
| `src/common/errors/all-exceptions.filter.spec.ts` | Thêm | Thân body từng mã; lỗi DB lạ → `INTERNAL_ERROR`, không có chữ của DB |
| `src/app.setup.spec.ts` | Sửa | **Chỉ** bảng `EXPECTED` (+2 dòng mới) và số 23 → 25 (xem mục 2.2a) |
| `src/common/pagination.ts` | Thêm | `PaginationQuery` DTO, `ListMeta`, `Paginated`, `paginated()` |
| `src/common/pagination.spec.ts` | Thêm | Validate `page`/`limit`, giá trị mặc định |
| `src/common/response.interceptor.ts` | Sửa | `Paginated` → `{ data, meta }`; còn lại giữ `{ data }` |
| `src/common/response.interceptor.spec.ts` | Thêm | Danh sách và không-danh-sách |
| `src/app.setup.ts` | Sửa | ValidationPipe thêm `transform: true` (để `@Type(() => Number)` của query DTO có tác dụng) |
| `src/common/date/today.ts` + `.spec.ts` | Thêm | BE-P2-04 |
| `src/common/rates/rates-at.ts` + `.spec.ts` | Thêm | BE-P2-05 |
| `src/common/rooms/public-room.ts` + `.spec.ts` | Thêm | BE-P2-06 |
| `src/modules/files/cloudinary.ts` + `.spec.ts` | Thêm | Phân tích `CLOUDINARY_URL`, ký, thư mục, URL phát hành |
| `src/modules/files/dto/sign.dto.ts` | Thêm | `SignUploadDto` |
| `src/modules/files/files.service.ts` + `.spec.ts` | Thêm | `signRoomImageUpload`, `verifyRoomImage` |
| `src/modules/files/files.controller.ts` | Thêm | `POST /files/sign` |
| `src/modules/files/files.module.ts` | Thêm | Nest module |
| `src/app.module.ts` | Sửa | `imports: [… , FilesModule]` |
| `prisma/seed.ts` | Sửa | SVC-05: đơn giá "Gửi xe điện" 150.000 đ; export `BUILDINGS` để test dùng |
| `prisma/seed.spec.ts` | Sửa | Khẳng định có đơn giá "Gửi xe điện" cho cả 3 tòa, chạy 2 lần không trùng |
| `scripts/e2e/run.ts` + `scripts/e2e/run.spec.ts` | Thêm | BE-P2-09 (chốt 01/11/2026: "Đồng ý scripts/e2e" – bộ chạy ra khỏi `test/`) |
| `scripts/e2e/cleanup.mjs` | Thêm | CLI dọn sót |
| `package.json` | Sửa | **đúng một dòng**: `"lint": "oxlint --type-aware src/ test/"` → `"lint": "oxlint --type-aware src/ test/ scripts/"` (mục 2.9a) |
| `.gitignore` | Sửa | + `/test/e2e-runs/` (nhật ký chạy, do bộ chạy ghi lúc runtime – **không** phải agent ghi) |

Không sửa: `.env.example` (đã có `CLOUDINARY_URL`), `src/common/env.ts` (`CLOUDINARY_URL` **không** vào `REQUIRED_ENV` – FILE-01: app vẫn khởi động được khi thiếu).

### 2.1a File "Bản sao" (giống từng byte) – chốt 01/11/2026

Suy ra từ đồ thị import của bản nháp `src/app.setup.spec.ts` (mục 2.2a): nó import giá trị `./app.setup.js` + `./common/errors/error-code.js`, và **đọc `./main.ts` dưới dạng văn bản** (test BE-LOGIN-07). `app.setup.ts` lại import `all-exceptions.filter.js`, `errors/validation.js`, `response.interceptor.js`. `error-code.ts` và `all-exceptions.filter.ts` đã có trong bản nháp (Sửa). Còn lại phải chép:

| Đích (tính từ `Source/backend/`) | Vì sao cần | CP chép | Trạng thái về sau |
|---|---|---|---|
| `src/app.setup.ts` | bản nháp `app.setup.spec.ts` import giá trị `configureApp` | CP-1 | → **Sửa** ở CP-2 (`transform: true`) |
| `src/common/response.interceptor.ts` | `app.setup.ts` import `ResponseInterceptor` | CP-1 | → **Sửa** ở CP-2 (`Paginated` → `{ data, meta }`) |
| `src/common/errors/validation.ts` | `app.setup.ts` import `validationExceptionFactory` | CP-1 | Bản sao đến hết phần (không đổi) |
| `src/main.ts` | bản nháp `app.setup.spec.ts` đọc nội dung file này (`readFileSync(new URL('./main.ts', …))`) | CP-1 | Bản sao đến hết phần (không đổi) |

Không cần chép `src/app.module.ts`, `src/common/env.ts`, `src/common/guards/*`, `src/common/prisma/*`: `main.ts` chỉ bị **đọc như văn bản**, không được nạp, nên các import của nó không cần phân giải. (`app.module.ts` vẫn là file **Sửa** ở CP-5 theo mục 2.1.)

**Coder chỉ chép, không sửa một ký tự nào** ở CP-1. Sau khi coder chép xong, tester **chạy lại CP-1**: bản nháp `src/app.setup.spec.ts` phải nạp được và **xanh với 25 thành viên `ErrorCode`**.

**Lệnh kiểm "giống từng byte"** (chạy từ gốc repo `D:\Rooms`, mỗi file còn mang nhãn Bản sao ở checkpoint đó phải **không in gì** và thoát 0):

```bash
git diff --no-index --exit-code Source/backend/src/app.setup.ts                      Source/backend/artifact_BE/2026-11-01-BE-P2-01-10/src/app.setup.ts
git diff --no-index --exit-code Source/backend/src/common/response.interceptor.ts    Source/backend/artifact_BE/2026-11-01-BE-P2-01-10/src/common/response.interceptor.ts
git diff --no-index --exit-code Source/backend/src/common/errors/validation.ts       Source/backend/artifact_BE/2026-11-01-BE-P2-01-10/src/common/errors/validation.ts
git diff --no-index --exit-code Source/backend/src/main.ts                           Source/backend/artifact_BE/2026-11-01-BE-P2-01-10/src/main.ts
```

Gọi tắt bộ lệnh này là **KIỂM-BẢN-SAO**; từ CP-2 trở đi bỏ hai dòng đầu (`app.setup.ts`, `response.interceptor.ts` đã thành file Sửa), chỉ còn `validation.ts` và `main.ts`.

### 2.2 Hợp đồng · ánh xạ lỗi DB (BE-P2-01, BE-P2-02)

`src/common/errors/db-errors.ts`:

```ts
export interface DbErrorMapping { code: ErrorCode; fields?: Record<string, string> }
// Khóa = tên ràng buộc / index / trigger trong prisma/constraints.sql + migration init.
export const DB_ERROR_MAP: Record<string, DbErrorMapping>;
// Prisma P2002 → meta.target (string | string[]); CHECK và trigger → quét message theo
// đúng các khóa của DB_ERROR_MAP (không bao giờ trả nội dung message ra response).
export function mapDbError(e: unknown): DbErrorMapping | null;
```

| Tên trong DB | Mã lỗi | `fields` |
|---|---|---|
| `users_phone_key` | `PHONE_TAKEN` (409) | – |
| `rooms_building_id_code_key` | `VALIDATION_FAILED` (400) | `code`: "Mã phòng đã có trong tòa (kể cả phòng đã khóa)" (ROOM-06) |
| `room_prices_one_pending` | `CONFLICT_STATE` (409) | – |
| `rate_plans_one_pending` | `CONFLICT_STATE` (409) | – |
| `rate_plans_one_per_day` | `CONFLICT_STATE` (409) | – |
| `MANAGER_MAX_2_BUILDINGS` (trigger) | `CONFLICT_STATE` (409) | – |
| `BUILDING_MANAGER_ROLE` (trigger) | `VALIDATION_FAILED` (400) | `managerId`: "Người được gán phải là quản lý đang hoạt động" [ASSUMPTION A2-1] |
| `buildings_code_format` (CHECK) | `VALIDATION_FAILED` (400) | `code`: "Mã tòa gồm 2–6 ký tự A–Z hoặc 0–9" [ASSUMPTION A2-2] (BLD-06) |
| Khác / không nhận ra | `INTERNAL_ERROR` (500) | – |

Lưu ý `MANAGER_MAX_2_BUILDINGS`: trong `ErrorCode` **đã có** mã cùng tên (409, "Mỗi quản lý chỉ phụ trách tối đa 2 tòa"). Task BE-P2-01 viết "trigger `MANAGER_MAX_2_BUILDINGS` → same code", tức `CONFLICT_STATE` theo câu ngay trước. Spec 01 (bảng Error codes) lại ghi rõ trigger này ra mã riêng `MANAGER_MAX_2_BUILDINGS`. **Spec thắng** (root CLAUDE.md): dùng `ErrorCode.MANAGER_MAX_2_BUILDINGS` (409, thông điệp riêng). Ghi rõ trong báo cáo.

Thêm vào `error-code.ts` (chữ theo spec 01, không được đổi):

```ts
PRICE_PROPOSAL_EXPIRED = 'PRICE_PROPOSAL_EXPIRED'  // 409 'Đề xuất đã quá ngày hiệu lực, vui lòng đề xuất lại'
UPLOAD_NOT_CONFIGURED  = 'UPLOAD_NOT_CONFIGURED'   // 503 'Chưa cấu hình tải ảnh'
```

### 2.2a Sửa `src/app.setup.spec.ts` trong bản nháp (chủ dự án chốt 01/11/2026: "A: sửa test trong nháp")

Test Phase 1 `src/app.setup.spec.ts` khóa cứng danh sách `ErrorCode`, nên thêm 2 mã mới làm nó đỏ. Chủ dự án chọn: **chép file test đó vào bản nháp và sửa tại đó** (đích `Source/backend/src/app.setup.spec.ts`).

Chỉ được đổi đúng hai thứ, không gì khác trong file:

1. Bảng `EXPECTED: [string, number, string][]` (dòng ~757): thêm 2 dòng, câu chữ **lấy đúng từ spec 01**
   - `['PRICE_PROPOSAL_EXPIRED', 409, 'Đề xuất đã quá ngày hiệu lực, vui lòng đề xuất lại']`
   - `['UPLOAD_NOT_CONFIGURED', 503, 'Chưa cấu hình tải ảnh']`
2. Số `23` → `25`: trong `expect(members).toHaveLength(23)` (dòng ~786) **và** trong chữ của tên test ở dòng ~784 ("has exactly 23 members (20 spec codes + …)" → 25 members / 22 spec codes).

Mọi phần còn lại của file (các `it` khác, fixture, import) giữ nguyên từng ký tự.

**Việc này thuộc CP-1 và do tester làm** (tester sở hữu mọi file test trong bản nháp; coder không viết test).

**Đánh giá xanh/đỏ của CP-1 tính trên bản nháp**: bản ở file chính `src/app.setup.spec.ts` vẫn chạy trong `npm run test` cho tới khi bản nháp được chép, nên `npm run test` sẽ **đỏ đúng một test** ("ErrorCode has exactly 23 members") – đó là kết quả **mong đợi**, không phải lỗi. CP-1 xanh khi `npx vitest run artifact_BE/2026-11-01-BE-P2-01-10` xanh và bản nháp của `app.setup.spec.ts` xanh. Mọi "Done when" sau đây có câu "`npm run test` xanh" phải đọc là "xanh trừ đúng một test đã biết ở trên".

`AllExceptionsFilter.catch` đổi đúng một nhánh: khi không phải `HttpException` và không phải http-errors, gọi `mapDbError(exception)`; có kết quả thì lấy `code` + `fields`, không thì giữ `INTERNAL_ERROR` (và vẫn log nguyên lỗi ra server log như hiện nay).

### 2.3 Hợp đồng · danh sách và phân trang (BE-P2-03)

```ts
// src/common/pagination.ts
export const DEFAULT_LIMIT = 20; export const MAX_LIMIT = 100;
export interface ListMeta { page: number; limit: number; total: number }

export class PaginationQuery {
  @Type(() => Number) @IsOptional() @IsInt() @Min(1)              page?: number;   // mặc định 1
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(100)    limit?: number;  // mặc định 20
}
export function pageParams(q: PaginationQuery): { page: number; limit: number; skip: number; take: number };

// Nhãn để interceptor nhận ra danh sách (không đoán theo hình dạng object –
// test Phase 1 đòi object thường phải ra đúng { data: … }).
export class Paginated<T> { constructor(readonly data: T[], readonly meta: ListMeta) {} }
export function paginated<T>(data: T[], page: number, limit: number, total: number): Paginated<T>;
```

`ResponseInterceptor`: `value instanceof Paginated ? { data: value.data, meta: value.meta } : { data: value ?? null }`.
Thông điệp lỗi validate: `page`/`limit` → "Trang không hợp lệ" / "Số dòng mỗi trang phải từ 1 đến 100" [ASSUMPTION A2-3].

### 2.4 Hợp đồng · ngày giờ Hà Nội (BE-P2-04)

Việt Nam cố định UTC+7, không có DST → cộng/trừ offset là đủ, không cần `Intl`. Ngày nghiệp vụ (`@db.Date`) biểu diễn bằng `Date` ở **nửa đêm UTC** của ngày đó (đúng như `prisma/seed.ts` đang làm).

```ts
// src/common/date/today.ts
export const HANOI_OFFSET_MS: number;                       // 7 * 3600_000
export type TimeSlot = 'MORNING' | 'AFTERNOON' | 'EVENING'; // VIEW-08
export const SLOT_START_MINUTES: Record<TimeSlot, number>;  // 8*60 · 14*60 · 18*60

export function todayHanoi(now?: Date): Date;               // nửa đêm UTC của "hôm nay" ở Hà Nội
export function hanoiMinutesOfDay(now?: Date): number;      // số phút từ nửa đêm Hà Nội
export function toDateOnly(d: Date): Date;
export function addDays(d: Date, n: number): Date;
export function compareDates(a: Date, b: Date): -1 | 0 | 1;
export function formatDateOnly(d: Date): string;            // 'YYYY-MM-DD' (API-06)
export function parseDateOnly(s: string): Date | null;      // null khi sai dạng hoặc ngày không tồn tại
export function hasSlotStarted(visitDate: Date, slot: TimeSlot, now?: Date): boolean; // VIEW-08/R2-4
```

`hasSlotStarted`: chỉ `true` khi `visitDate` **đúng là hôm nay** (giờ Hà Nội) và `hanoiMinutesOfDay(now) >= SLOT_START_MINUTES[slot]`; ngày quá khứ / tương lai → `false` (P2-6 tự chặn ngày quá khứ và mốc +30 ngày bằng `compareDates` + `addDays`).

### 2.5 Hợp đồng · đơn giá và giá phòng hiện hành (BE-P2-05)

```ts
// src/common/rates/rates-at.ts
export interface RateTierView { tierNo: number; upTo: number | null; unitPrice: number }
export interface RateView {
  ratePlanId: number; kind: RateKind; serviceId: number | null;
  effectiveFrom: Date; reviewedAt: Date | null; tiers: RateTierView[];
}
export interface RatesAt { electric: RateView | null; water: RateView | null; services: Map<number, RateView> }

// RATE-04 + RATE-06: bản APPROVED có effective_from lớn nhất ≤ date, theo từng khóa (kind, serviceId).
export async function ratesAt(
  db: Pick<PrismaClient, 'ratePlan'>, buildingId: number, date: Date,
): Promise<RatesAt>;

// PRC-06: APPROVED, effective_from lớn nhất ≤ date; trùng ngày thì reviewed_at muộn hơn thắng.
export async function currentRoomPrice(
  db: Pick<PrismaClient, 'roomPrice'>, roomId: number, date: Date,
): Promise<{ id: number; price: number; effectiveFrom: Date; reviewedAt: Date | null } | null>;
```

Truy vấn: `where { buildingId, status: 'APPROVED', effectiveFrom: { lte: date } }`, `orderBy [{ effectiveFrom: 'desc' }, { reviewedAt: 'desc' }, { id: 'desc' }]`, `include { tiers: { orderBy: { tierNo: 'asc' } } }`; lấy bản **đầu tiên** cho mỗi khóa. `ratesAt` **không** ném lỗi khi thiếu đơn giá (trả `null`); `RATE_PLAN_MISSING` là việc của người gọi (Phase 4) – giữ helper thuần để trang công khai dùng được. Không trả về `reviewNote`, `proposedById`, `reviewedById` (PUB-04).
[ASSUMPTION A2-4] hai giá phòng APPROVED cùng `effective_from` **và** cùng `reviewed_at` (DB không chặn) → `id` lớn hơn thắng.

### 2.6 Hợp đồng · phòng công khai (BE-P2-06)

```ts
// src/common/rooms/public-room.ts
export function publicRoomWhere(today: Date): Prisma.RoomWhereInput;      // ROOM-05 + R2-1
export function publicBuildingWhere(today: Date): Prisma.BuildingWhereInput; // BLD-05
```

`publicRoomWhere(today)` =

```ts
{
  isActive: true,
  underMaintenance: false,
  price: { not: null },
  contracts: { none: { status: { in: ['HOLD', 'ACTIVE'] } } },
  building: {
    isActive: true,
    AND: [
      { ratePlans: { some: { kind: 'ELECTRIC', status: 'APPROVED', effectiveFrom: { lte: today } } } },
      { ratePlans: { some: { kind: 'WATER',    status: 'APPROVED', effectiveFrom: { lte: today } } } },
    ],
  },
}
```

`publicBuildingWhere(today)` = `{ isActive: true, rooms: { some: publicRoomWhere(today) } }` (BLD-05). Mọi truy vấn công khai của P2-6 và VIEW-01 phải dùng đúng hai hàm này, không viết lại điều kiện.

### 2.7 Hợp đồng · `POST /files/sign` và `verifyRoomImage` (BE-P2-07)

```ts
// src/modules/files/cloudinary.ts  – thuần, chỉ dùng node:crypto
export interface CloudinaryConfig { cloudName: string; apiKey: string; apiSecret: string }
export function parseCloudinaryUrl(value: string | undefined): CloudinaryConfig | null; // cloudinary://key:secret@cloud
export function signParams(params: Record<string, string | number>, apiSecret: string): string;
export function roomImageFolder(buildingId: number, roomId: number): string;  // `rooms/<buildingId>/<roomId>`
export function deliveryUrl(cloudName: string, publicId: string, version: number, format: string): string;
export const ALLOWED_FORMATS: readonly string[];   // ['jpg','png','webp']  (ROOM-07, FILE-01)
export const INCOMING_TRANSFORMATION: string;      // 'c_limit,w_1920,h_1920'  (FILE-01: cạnh dài ≤ 1920 px)
```

`signParams` = SHA-1 (hex) của các tham số **đã bỏ** `file`, `cloud_name`, `resource_type`, `api_key` và giá trị rỗng, sắp theo tên khóa, nối `k=v` bằng `&`, rồi nối thêm `apiSecret` **không có dấu phân cách** – đúng thuật toán trang chính thức Cloudinary "Authentication signatures" (phiên chính kiểm 01/11/2026). Hai vector thử nằm trong "Done when" của CP-5.
`deliveryUrl` = `https://res.cloudinary.com/<cloudName>/image/upload/v<version>/<publicId>.<format>`.

```ts
// src/modules/files/dto/sign.dto.ts
export class SignUploadDto {
  @IsIn(['ROOM_IMAGE']) purpose: 'ROOM_IMAGE';
  @Type(() => Number) @IsInt() @Min(1) roomId: number;
}

// src/modules/files/files.service.ts – hàm thuần, db qua tham số (mục 1.4)
export interface SignedUpload {
  cloudName: string; apiKey: string; uploadUrl: string; timestamp: number;
  folder: string; allowedFormats: string; transformation: string; signature: string;
}
export async function signRoomImageUpload(
  db: Pick<PrismaClient, 'room'>,
  user: Pick<AuthUser, 'buildingIds'>,      // import type
  dto: SignUploadDto,
  env?: NodeJS.ProcessEnv,                  // mặc định process.env, để test tiêm được
  now?: Date,
): Promise<SignedUpload>;

export async function verifyRoomImage(
  db: Pick<PrismaClient, 'room'>,
  roomId: number,
  image: { publicId: string; version: number; format: string },
  env?: NodeJS.ProcessEnv,
): Promise<{ publicId: string; url: string }>;   // FILE-02
```

Thứ tự kiểm tra của `signRoomImageUpload` (quan trọng – quyết định mã lỗi nào ra trước):

1. `parseCloudinaryUrl(env.CLOUDINARY_URL)` = `null` → 503 `UPLOAD_NOT_CONFIGURED`.
2. `db.room.findFirst({ where: { id: dto.roomId }, select: { id, buildingId, isActive } })`; không có hoặc `isActive = false` → 404 `NOT_FOUND`.
3. SCOPE-02 trên **một** id: `user.buildingIds !== null && !user.buildingIds.includes(room.buildingId)` → 403 `OUT_OF_SCOPE`. (BOSS có `buildingIds = null` → qua.)
4. Ký `{ timestamp, folder, allowed_formats, transformation }`; trả `SignedUpload`, `uploadUrl = https://api.cloudinary.com/v1_1/<cloudName>/image/upload`.
   **Không** trả `apiSecret` dưới bất kỳ dạng nào.

`verifyRoomImage` (thứ tự kiểm **giống hệt** lúc ký – chốt 01/11/2026 bởi phiên chính, theo spec):

1. `parseCloudinaryUrl(env.CLOUDINARY_URL)` = `null` → 503 `UPLOAD_NOT_CONFIGURED` — **trước** khi tra phòng.
2. Tra phòng (`select { id, buildingId }`); không có → 404 `NOT_FOUND`. **Không** kiểm `room.isActive`: ROOM-07/FILE-02 không đòi điều đó. SCOPE-02 **không** làm ở đây (chữ ký hàm không nhận `user`): người gọi ở P2-4 đã lọc phòng theo phạm vi trước khi lưu ảnh.
3. `publicId` phải **bắt đầu đúng** bằng `roomImageFolder(buildingId, roomId) + '/'`, phần còn lại không chứa `/` hay `..`; `format` **hạ chữ thường trước** khi kiểm `∈ ALLOWED_FORMATS` và trước khi dựng URL; `version` là số nguyên > 0.
4. Sai → 400 `VALIDATION_FAILED` với đúng trường tương ứng (UI-05 ánh xạ vào form): `fields.publicId` = "Ảnh không thuộc phòng này", `fields.format` = "Định dạng ảnh không được hỗ trợ", `fields.version` = "Phiên bản ảnh không hợp lệ" [ASSUMPTION A2-5].
5. Đúng → `{ publicId, url: deliveryUrl(cloudName, publicId, version, format.toLowerCase()) }`.

Thông điệp lỗi của `SignUploadDto` viết tiếng Việt, cùng lối viết với `src/modules/auth/dto/auth.dto.ts`.

```ts
// src/modules/files/files.controller.ts
@Controller('files')
export class FilesController {
  @Roles('BOSS', 'MANAGER')
  @Post('sign')
  sign(@CurrentUser() user: AuthUser, @Body() dto: SignUploadDto): Promise<SignedUpload>;
}
```

### 2.8 Seed "Gửi xe điện" (BE-P2-08)

Trong `prisma/seed.ts`: thêm vào mảng `RATES` một dòng `{ kind: 'SERVICE', service: 'Gửi xe điện', tiers: [[null, 150_000]] }` (SVC-05, D2-12). Dịch vụ đã có trong `SERVICES`; vòng lặp `RATES` đã idempotent (`findFirst` theo `(buildingId, kind, serviceId, status, effectiveFrom)` rồi mới `create`), `effectiveFrom = EFFECTIVE_FROM` (2026-09-01) như các đơn giá seed khác [ASSUMPTION A2-6]. Sửa luôn comment ở trên `SERVICES` (câu "has no rate plan until the owner gives its price" đã hết đúng) và `export const BUILDINGS` để test của BE-P2-06/09 đọc được hình dạng seed. Không đổi gì khác trong seed.

### 2.9 Bộ chạy e2e (BE-P2-09)

**Chốt 01/11/2026 (chủ dự án: "Đồng ý scripts/e2e")** – bộ chạy **không** nằm trong `test/` nữa:

| Trước | Nay (đích tính từ `Source/backend/`) |
|---|---|
| `test/e2e-run.ts` | `scripts/e2e/run.ts` |
| `test/e2e-run.spec.ts` | `scripts/e2e/run.spec.ts` (tester viết, chỉ trong bản nháp) |
| `test/e2e-cleanup.mjs` | `scripts/e2e/cleanup.mjs` |
| `test/e2e-runs/` | **giữ nguyên** `test/e2e-runs/` – chỉ là nơi bộ chạy ghi nhật ký lúc runtime, agent không ghi file nào vào đó; `.gitignore` vẫn có `/test/e2e-runs/` |

Đường dẫn import (NodeNext + ESM, `"type": "module"` – phải có đuôi `.js` cho import tương đối, đúng lối `./app.setup.js` của Phase 1):

- file spec e2e trong `test/` → `import { E2eRun } from '../scripts/e2e/run.js';`
- `scripts/e2e/run.spec.ts` → `import … from './run.js';`
- `scripts/e2e/cleanup.mjs` (chạy bằng `node`, dùng type-stripping như `node prisma/seed.ts`) → `import … from './run.ts';` **đuôi `.ts` thật**, vì node phải mở được file; file `.mjs` không đi qua `tsc` nên không vướng luật `.js` của NodeNext. Một dòng comment trong `cleanup.mjs` ghi rõ lý do.

Logic đặt trong `scripts/e2e/run.ts` (TS, test được **không cần DB**), CLI mỏng trong `scripts/e2e/cleanup.mjs` (`import.meta.main` như `prisma/seed.ts`).

```ts
// scripts/e2e/run.ts
export type E2eTable = 'buildings' | 'rooms' | 'services' | 'users'
                     | 'room_prices' | 'rate_plans' | 'viewings' | 'room_images';
export interface E2eRunLog {
  runId: string; startedAt: string; endedAt: string | null;
  status: 'RUNNING' | 'CLEANED' | 'FAILED_CLEANUP';
  buildingCodes: string[]; ids: Record<E2eTable, number[]>;
}
export const E2E_PREFIX = '[E2E';
export const CLEANUP_NOTE = '[E2E] dọn dữ liệu thử';
export const RUNS_DIR = 'test/e2e-runs';

export function newRunId(now?: Date, rand?: () => string): string;   // '20261101T1245-A7KQ'
export function e2eName(runId: string, what: string): string;        // '[E2E <runId>] <what>'
export function e2eServiceName(what: string): string;                // '[E2E] <what>' (tên dịch vụ ≤ 50 ký tự)
export function randomPassword(): string;                            // chỉ trong bộ nhớ, không ghi nhật ký

// Sinh mã không trùng: `exists` do test truyền (truy vấn DB), nên hàm test được bằng fake.
export async function uniqueBuildingCode(exists: (code: string) => Promise<boolean>, rand?: () => string): Promise<string>; // 'E2' + 4 ký tự A-Z0-9
export async function uniquePhone(exists: (phone: string) => Promise<boolean>, rand?: () => string): Promise<string>;        // '09' + 8 số

export class E2eRun {
  constructor(runId?: string, dir?: string);
  readonly runId: string; readonly log: E2eRunLog;
  record(table: E2eTable, id: number): void;      // ghi file nhật ký NGAY sau mỗi lần ghi nhận
  recordBuildingCode(code: string): void;
  finish(status: 'CLEANED' | 'FAILED_CLEANUP'): void;
}
export function logPath(runId: string, dir?: string): string;
export function readLogs(dir?: string): E2eRunLog[];

// afterAll: chỉ đụng id trong nhật ký, không xóa cứng gì.
export async function cleanupRun(db: E2eCleanupDb, log: E2eRunLog): Promise<SkippedRow[]>;
export type E2eCleanupDb = Pick<PrismaClient,
  'viewing' | 'roomPrice' | 'ratePlan' | 'room' | 'service' | 'building' | 'user' | 'session'
  | 'contract' | 'contractService'>;

// Bản ghi có hợp đồng/hóa đơn liên kết → không bao giờ bị cập nhật (mục 2.9b).
export interface SkippedRow { table: E2eTable; id: number; reason: string }
export async function linkedRows(
  db: Pick<PrismaClient, 'contract' | 'contractService'>, log: E2eRunLog,
): Promise<SkippedRow[]>;

// Chế độ liệt kê của cleanup.mjs: thuần, không ghi gì.
export interface CleanupFacts {
  ids: Partial<Record<E2eTable, { id: number; isActive: boolean; linked: string[] }[]>>;
  unlogged: { table: E2eTable; id: number; name: string }[];
}
export function planCleanup(log: E2eRunLog, facts: CleanupFacts): string[];
```

`CleanupFacts` (chốt 01/11/2026, phương án A): `linked` chứa mô tả hợp đồng / hóa đơn đang dính vào bản ghi đó, **cùng chuỗi với `reason` của `SkippedRow`** (nêu **mã** hợp đồng, ví dụ `'hợp đồng HD000001'`, `'hợp đồng HD000001 + 2 hóa đơn'`, không dùng `id` số – chốt 02/11/2026, mục 2.9b) – `planCleanup` in chúng ra để chủ dự án thấy bản ghi nào **không** nên dọn; `unlogged` là bản ghi có tên chứa `[E2E` mà không nằm trong nhật ký nào (chỉ báo). `cleanup.mjs` là chỗ duy nhất truy vấn DB để dựng `CleanupFacts`; `planCleanup` thuần, không I/O.

**Các điểm thiết kế đã chốt 01/11/2026 (coder làm đúng, không tự nghĩ spec ID mới – chỉ dùng các ID đã có trong PLAN):**

1. `cleanupRun` chạy **mọi** bước, **bỏ qua** bước có danh sách id rỗng (không gọi `updateMany` vô ích), gom lỗi của từng bước rồi **ném `AggregateError`** ở cuối; người gọi bắt được thì kết nhật ký bằng `finish('FAILED_CLEANUP')`. Chữ ký trả `Promise<SkippedRow[]>` (đổi từ `Promise<void>` ở bản 01/11 – chủ dự án chốt 02/11/2026, mục 2.9b: người gọi phải báo được bản ghi bị bỏ qua). Khi có lỗi, danh sách bỏ qua đi kèm lỗi: `Object.assign(new AggregateError(errs, '…'), { skipped })`.
2. Bước `users` cập nhật phiên theo **cột `userId`**: `session.updateMany({ where: { userId: { in: … }, revokedAt: null }, data: { revokedAt: now } })` – **không** `where.id.in` (đúng như dòng `users` của bảng dưới).
3. `rand` helper chỉ trả **phần ngẫu nhiên** (4 ký tự `A-Z0-9` cho mã tòa / runId, 8 chữ số cho số điện thoại); tiền tố `E2` / `09` do hàm gọi nối vào. `uniquePhone` **bỏ thẳng** các số seed `0900000001..0900000005` (so sánh trong hàm, **không** gọi `exists`). Cả `uniqueBuildingCode` và `uniquePhone` dừng sau **20 lần thử** rồi ném lỗi rõ ràng.
4. `e2eServiceName(what)` **ném lỗi** nếu tên kết quả dài hơn **50** ký tự (giới hạn `services.name`) – **không** tự cắt chuỗi.
5. `readLogs`: file nhật ký hỏng (JSON không phân tích được hoặc thiếu khóa) → `console.error` nêu đường dẫn, **bỏ qua** file đó và đọc tiếp các file còn lại.

#### 2.9b Bản ghi có hợp đồng/hóa đơn liên kết – **bỏ qua, báo riêng** (chủ dự án chốt 02/11/2026: "A: bỏ qua, báo riêng")

1. **Không bao giờ cập nhật.** Cả `cleanupRun` (dùng ở `afterAll` và ở `--apply`) **không được** `updateMany` lên một bản ghi trong nhật ký nếu bản ghi đó có hợp đồng hoặc hóa đơn liên kết (`linked` không rỗng). `cleanupRun` tự dựng danh sách này bằng `linkedRows(db, log)` **trước** mọi bước ghi, rồi **trừ** các id đó ra khỏi `where.id.in` của từng bước; bước nào hết id sau khi trừ thì bỏ hẳn (không gọi `updateMany`).

   `linkedRows` chỉ cần **hai truy vấn đọc** (hóa đơn luôn treo vào hợp đồng nên "có hóa đơn" ⇒ "có hợp đồng"):
   - `db.contract.findMany({ where: { OR: [ { roomId: { in: rooms } }, { buildingId: { in: buildings } }, { tenantId: { in: users } }, { createdById: { in: users } }, { viewing: { id: { in: viewings } } } ] }, select: { id, code, roomId, buildingId, tenantId, createdById, viewing: { select: { id: true } }, _count: { select: { invoices: true } } } })`
   - `db.contractService.findMany({ where: { serviceId: { in: services } }, select: { serviceId: true, contract: { select: { code: true } } } })`

   **Nhánh `viewing` (chốt 02/11/2026)**: lịch hẹn trong nhật ký bị coi là có liên kết **kể cả khi hợp đồng của nó không nằm trong nhật ký** – đó chính là lý do nhánh này nằm trong cùng truy vấn hợp đồng thay vì đọc `viewing.contractId`. Vẫn **đúng hai truy vấn đọc**. (`Contract.viewing` là quan hệ **một–một tùy chọn** (`Viewing?`), kiểu Prisma là `XOR<ViewingNullableScalarRelationFilter, ViewingWhereInput>` nên viết thẳng `{ viewing: { id: { in: viewings } } }` là hợp kiểu; nếu `--type-aware` báo lỗi thì dùng `{ viewing: { is: { id: { in: viewings } } } }`, không đổi logic.) Chế độ liệt kê và `--apply` phải dùng **cùng** `linkedRows`, nên hai chế độ luôn cho cùng danh sách bỏ qua.

   **Luật cho `users` (chốt 02/11/2026)**: một tài khoản thử trong nhật ký là "có liên kết" khi nó là **bên thuê** (`tenantId`) của một hợp đồng **hoặc** là **người tạo** hợp đồng (`createdById`, phía `User` là quan hệ `contractsCreated`) – quản lý thử chỉ tạo hợp đồng cũng bị **bỏ qua và báo riêng** như mọi bản ghi có liên kết, `session.updateMany` cũng không đụng tới.

   `reason` là chuỗi tiếng Việt nêu **mã hợp đồng** (`contracts.code`, ví dụ `'hợp đồng HD000001'`, `'hợp đồng HD000001 + 2 hóa đơn'`), **không bao giờ** nêu `id` số của hợp đồng – kể cả nhánh `contractService` (lấy `contract.code`, không dùng `contractId`). Giá phòng, đơn giá: giữ nguyên hành vi cũ (không có liên kết hợp đồng/hóa đơn trực tiếp của riêng bản ghi thử).

2. **Chế độ liệt kê** (`node scripts/e2e/cleanup.mjs`, không `--apply`): `planCleanup` in các bản ghi có `linked` không rỗng trong **một mục riêng**, tiêu đề **đúng từng ký tự**:

   ```
   Có hợp đồng/hóa đơn liên kết – không xử lý
   ```

   Các bản ghi còn lại vẫn in như cũ; mục "chỉ báo, không xử lý" của bản ghi `[E2E` không có nhật ký (kịch bản 25) là **mục khác**, không gộp vào mục này.

3. **`--apply` phải báo bản ghi bị bỏ qua**: sau khi `cleanupRun` xong (hoặc ném `AggregateError` có `.skipped`), `cleanup.mjs` in lại đúng mục trên – nhóm theo bảng, **liệt kê id** và `reason` của từng dòng – rồi in một dòng tổng `Bỏ qua N bản ghi`. Không có bản ghi nào bị bỏ qua → không in mục này.

4. **Trạng thái nhật ký khi còn bản ghi bị bỏ qua: `FAILED_CLEANUP`** (phương án (a)).
   Lý do (một dòng): dùng lại đúng một trạng thái đã có nên `readLogs` tiếp tục trả nhật ký đó và chủ dự án vẫn thấy nó ở lần liệt kê sau, trong khi `RUNNING` sẽ nói sai rằng lượt chạy chưa kết thúc.
   **Luật chuyển trạng thái (tường minh)**: `finish('CLEANED')` chỉ được gọi khi **mọi** id trong nhật ký đã `is_active = false` (hoặc `CANCELLED`/`REJECTED` theo bảng dưới) hoặc không còn trong DB, **và** `SkippedRow[]` rỗng, **và** không bước nào ném lỗi. Còn bất kỳ bản ghi bị bỏ qua, hoặc bất kỳ lỗi bước → `finish('FAILED_CLEANUP')`. Không thêm trạng thái mới vào `E2eRunLog['status']`.

#### 2.9c Sáu sai lệch nhỏ của coder – **đã chấp nhận** (kỹ thuật, chốt 02/11/2026)

| # | Sai lệch | Ghi chú |
|---|---|---|
| 1 | Thêm `readAllLogs(dir)`; `readLogs(dir)` = `readAllLogs(dir)` đã lọc bỏ `CLEANED` | Chế độ liệt kê cần cả nhật ký `CLEANED` để đối chiếu |
| 2 | `new E2eRun(runId)` với `runId` đã có file → **nạp** nhật ký cũ, không ghi đè | Cần cho `--apply <runId>` |
| 3 | `export const E2E_TABLES` (thứ tự bảng dùng cho vòng lặp và cho `ids`) | Tránh lặp danh sách bảng ở 3 chỗ |
| 4 | `planCleanup` in `unlogged` **một lần**, nằm dưới nhật ký chưa dọn đầu tiên; không có nhật ký nào thì in dưới tiêu đề giữ chỗ `(không có nhật ký)` | Chỉ là cách trình bày |
| 5 | `room_images` ghi "giữ nguyên" mà không nêu dữ kiện DB | Đúng ý mục 2.9: không đụng tới |
| 6 | `e2eServiceName` đếm **code point** (`Array.from(...).length`) khi kiểm giới hạn 50 | Khớp `VARCHAR(50)` của `services.name` |

Sáu sai lệch trên **vẫn được chấp nhận nguyên trạng** sau các điểm chốt 02/11/2026 ở mục 2.9b. Hai chỗ phải khớp theo: sai lệch #4 (cách in `unlogged`) in mục "Có hợp đồng/hóa đơn liên kết – không xử lý" **riêng**, và chuỗi `linked` của sai lệch #1/#4 dùng **mã hợp đồng** như `reason` (mục 2.9b). `linkedRows` do cả `cleanupRun` (`afterAll`, `--apply`) và chế độ liệt kê gọi, nên không có nhánh logic thứ hai cho riêng một chế độ.

`cleanupRun` chạy đúng các bước sau, mỗi bước `updateMany` với `where: { id: { in: <id trong nhật ký, đã trừ `SkippedRow`> } }`:

| Bảng | Việc |
|---|---|
| `viewings` | `status NEW|CONFIRMED` → `CANCELLED`, `outcomeNote = CLEANUP_NOTE` |
| `room_prices`, `rate_plans` | `status PENDING` → `REJECTED`, `reviewNote = CLEANUP_NOTE` |
| `rooms`, `services`, `buildings` | `isActive = false` |
| `users` (quản lý thử) | `isActive = false` + `session.updateMany({ where: { userId: { in } , revokedAt: null }, data: { revokedAt: now } })` |
| `room_images`, bản ghi đã duyệt | giữ nguyên (lịch sử) |

Quy tắc dữ liệu thử (D2-14): Boss dùng tài khoản seed (không sửa); quản lý thử do test tạo qua `/managers` (P2-3), **không** dùng Quản lý 1/2; tòa, phòng, đơn giá dev chỉ **đọc**. Nhật ký **không bao giờ** chứa mật khẩu, token, cookie, chuỗi kết nối. `.gitignore` += `/test/e2e-runs/`.

`scripts/e2e/cleanup.mjs`: `node scripts/e2e/cleanup.mjs` → đọc mọi nhật ký chưa `CLEANED`, với mỗi id hỏi DB (còn `is_active`? có hợp đồng/hóa đơn dính?), **in** danh sách; thêm một mục riêng cho bản ghi có tên chứa `[E2E` mà không nằm trong nhật ký nào (chỉ báo). `--apply <runId>` → gọi `cleanupRun` cho đúng nhật ký đó, rồi in mục "Có hợp đồng/hóa đơn liên kết – không xử lý" (mục 2.9b điểm 3) và kết nhật ký theo mục 2.9b điểm 4. Đầu file ghi rõ: **chỉ phiên chính chạy `--apply`, sau khi chủ dự án xem danh sách**.

**Hoãn sang phần sau (cố ý, để không viết mã cho thứ chưa tồn tại)** – ghi vào báo cáo:
`scripts/e2e/run.ts` chưa có 2 helper mà BE-P2-09 kể tới vì thứ chúng gọi chưa có: "đặt lại giới hạn IP" (bộ giới hạn IP của lịch hẹn sinh ra ở **P2-6**) và "chạy job giá với `roomIds`" (job sinh ra ở **P2-5**). Hai phần đó tự thêm hàm của mình vào `scripts/e2e/run.ts` (cùng một file dùng chung, không tạo chỗ thứ hai). `RateLimiter.reset(key)` của Phase 1 đã có sẵn nên P2-6 chỉ cần một dòng.

### 2.9a `scripts/` phải được lint + kiểm kiểu, nhưng **không** vào output của `nest build`

Đã kiểm cấu hình thật (01/11/2026) – chỉ **một** thay đổi config là đủ:

| Việc | Hiện trạng | Cần đổi? |
|---|---|---|
| Lint + kiểm kiểu | `package.json` → `"lint": "oxlint --type-aware src/ test/"` (oxlint 1.58 + `oxlint-tsgolint`, lấy kiểu từ `tsconfig.json`) | **Có** – thêm `scripts/`: `"lint": "oxlint --type-aware src/ test/ scripts/"` |
| Phạm vi kiểu của `tsconfig.json` | không có `include`/`exclude` → đã bao cả `scripts/` | **Không** |
| `npm run build` (`nest build`) | dùng `tsconfig.build.json`: `"include": ["src"]`, `"rootDir": "./src"`, `exclude` có `test` | **Không** – `scripts/` đã nằm ngoài; thêm nó vào `exclude` là dư |
| `vitest` | `include: ['**/*.spec.ts']`, `root: './'` → tự nhận `scripts/e2e/run.spec.ts` | **Không** |

**Kiểm chứng `nest build` không sinh output cho `scripts/`** (phiên chính chạy sau khi chép, từ `Source/backend`):

```powershell
npm run build
Test-Path dist/scripts      # phải là False
Test-Path dist/main.js      # phải là True
```

(`nest-cli.json` có `deleteOutDir: true` nên `dist/` luôn sạch trước mỗi lần build; nếu `scripts/` lọt vào thì `rootDir: "./src"` của `tsconfig.build.json` sẽ báo lỗi ngay.)

**Cách sửa `package.json` trong bản nháp**: coder chép `package.json` từ file chính vào bản nháp và đổi **đúng chuỗi của khóa `lint`**, không đổi version, không thêm/bớt gói, không chạy `npm install`. Kiểm: `git diff --no-index Source/backend/package.json Source/backend/artifact_BE/2026-11-01-BE-P2-01-10/package.json` chỉ được hiện **một** dòng `-` và **một** dòng `+`, đều là dòng `"lint"`.
`[ASSUMPTION A2-10]` Một `package.json` lồng trong thư mục bản nháp là vô hại (nội dung giống file chính, vẫn `"type": "module"`). Nếu nó làm test bản nháp vỡ, **dừng và báo** để chủ dự án áp thẳng một dòng `lint` vào file chính (sửa nhỏ, vẫn cần chủ dự án duyệt) thay vì chép cả file.

## 3. Câu hỏi bỏ ngỏ

**Không có câu hỏi nào phải chặn pipeline.** Spec 01/11/12/13 + file task đã trả lời mọi luật nghiệp vụ của phần này. Những chỗ spec không nói là lựa chọn kỹ thuật hoặc câu chữ hiển thị, nêu dưới dạng `[ASSUMPTION]` để chủ dự án sửa lúc duyệt.

**Đã chốt 02/11/2026 (chủ dự án: "A: bỏ qua, báo riêng"):** bản ghi thử có hợp đồng/hóa đơn liên kết **không bị cập nhật**, được báo riêng ở cả chế độ liệt kê và `--apply`; nhật ký để `FAILED_CLEANUP` khi còn bản ghi như vậy. Chi tiết: mục 2.9b. Sáu sai lệch kỹ thuật của coder: **chấp nhận**, mục 2.9c. Phạm vi `tsc`: mục CP-8 điểm 1b. Luật đứng "không ghi file ngoài bản nháp": mục 1 điểm 1.

Bốn điểm chốt thêm cùng ngày 02/11/2026 (áp dụng cùng tinh thần "bỏ qua, báo riêng"):

1. `linkedRows` thêm nhánh thứ tư `{ viewing: { id: { in: viewings } } }` vào **cùng** truy vấn hợp đồng, để lịch hẹn thử có hợp đồng **ngoài nhật ký** vẫn được coi là có liên kết và bị bỏ qua; chế độ liệt kê và `--apply` dùng chung `linkedRows` nên luôn khớp; vẫn **đúng hai truy vấn đọc** (mục 2.9b điểm 1, CP-7 kịch bản 30d/30e/30f).
2. `reason` của dòng dịch vụ nêu hợp đồng bằng **mã** (`contract: { select: { code: true } }`, ví dụ "hợp đồng HD000001"), **không** dùng `id` số; chuỗi `linked` của chế độ liệt kê dùng cùng dạng (mục 2.9b, mục 2.9, CP-7 kịch bản 22b/30c).
3. Tài khoản thử trong nhật ký là "có liên kết" khi là **bên thuê** (`tenantId`) **hoặc người tạo** hợp đồng (`createdById`, quan hệ `contractsCreated`) → bỏ qua và báo riêng như mọi bản ghi có liên kết, `session.updateMany` cũng không đụng tới (mục 2.9b luật cho `users`, CP-7 kịch bản 30d2).
4. Sáu sai lệch ở mục 2.9c giữ nguyên trạng **chấp nhận**, với hai chỗ phải khớp các điểm trên (cách in mục riêng, chuỗi `linked` theo mã hợp đồng).

**Đã chốt 01/11/2026 (chủ dự án trả lời):**

1. Test Phase 1 vỡ vì 2 mã lỗi mới → **sửa test trong bản nháp** (mục 2.2a), không đổi tên mã và không bỏ test.
2. Trigger `MANAGER_MAX_2_BUILDINGS` → **mã lỗi riêng `MANAGER_MAX_2_BUILDINGS` (409)** theo spec 01 dòng 66, **không** phải `CONFLICT_STATE`. Mục 2.2 giữ nguyên.
3. Cách để bản nháp nạp được `configureApp`: **"Đồng ý (b)"** – thêm loại file **Bản sao** (chép giống từng byte) như Phase 1 BE-LOGIN-09-25, thay vì sửa luật import hay bỏ test. Chi tiết và danh sách: mục 2.1a; ngoại lệ của luật import: mục 1.4; lệnh kiểm `git diff --no-index --exit-code` nằm trong "Done when" của mọi checkpoint.
4. **Chỗ đặt bộ chạy e2e: "Đồng ý scripts/e2e"** – `scripts/e2e/run.ts` + `scripts/e2e/cleanup.mjs`, nhật ký vẫn ở `test/e2e-runs/`; `scripts/` vào phạm vi `npm run lint` (một dòng trong `package.json`) và **không** vào output `nest build`. Chi tiết: mục 2.9 + 2.9a.
5. **Kiểu `CleanupFacts`: phương án A** (mục 2.9) – `{ ids: Partial<Record<E2eTable, { id; isActive; linked }[]>>; unlogged: { table; id; name }[] }`, `linked` giữ id hợp đồng/hóa đơn.
6. **Năm điểm thiết kế bộ chạy** (mục 2.9, danh sách 1–5): `AggregateError` cuối `cleanupRun`; bước `users` cập nhật `session` theo `userId`; `rand` chỉ trả phần ngẫu nhiên, `uniquePhone` bỏ sẵn 5 số seed, dừng sau 20 lần thử; `e2eServiceName` ném lỗi khi > 50 ký tự; `readLogs` bỏ qua file hỏng kèm `console.error`. Không đặt thêm spec ID nào cho các điểm này – chúng là lựa chọn kỹ thuật, test đặt tên theo `D2-14`.
7. **CP-5 (phiên chính chốt 01/11/2026, theo spec)**: (a) vector chữ ký cũ sai – thay bằng **hai vector chính thức** trong "Done when" của CP-5, tính lại bằng `node:crypto` từ trang Cloudinary "Authentication signatures"; (b) `verifyRoomImage` kiểm `CLOUDINARY_URL` (503 `UPLOAD_NOT_CONFIGURED`) **trước** khi tra phòng, cùng thứ tự với lúc ký; (c) hạ chữ thường `format` trước khi kiểm danh sách cho phép và trước khi dựng URL; (d) **không** kiểm `room.isActive` trong `verifyRoomImage` (ROOM-07/FILE-02 không đòi) – vẫn 404 khi không có phòng; (e) lỗi `format`/`version` trả `VALIDATION_FAILED` kèm đúng trường `fields.format` / `fields.version` (UI-05 ánh xạ vào form), ngoài `fields.publicId`; (f) thông điệp DTO tiếng Việt theo lối `auth.dto.ts`.

### `[ASSUMPTION]` dùng trong bản nháp

| ID | Giả định |
|---|---|
| A2-1 | `fields.managerId` = "Người được gán phải là quản lý đang hoạt động" (BLD-03 có luật, spec không cho câu chữ) |
| A2-2 | `fields.code` cho `buildings_code_format` = "Mã tòa gồm 2–6 ký tự A–Z hoặc 0–9" (BLD-06) |
| A2-3 | Câu chữ lỗi validate `page`/`limit` |
| A2-4 | Giá phòng APPROVED trùng cả `effective_from` và `reviewed_at` → `id` lớn hơn thắng (PRC-06 chỉ nói tới `reviewed_at`) |
| A2-5 | Câu chữ `fields.publicId` = "Ảnh không thuộc phòng này", `fields.format` = "Định dạng ảnh không được hỗ trợ", `fields.version` = "Phiên bản ảnh không hợp lệ" (FILE-02 có luật, spec không cho câu chữ) |
| A2-6 | Đơn giá seed "Gửi xe điện" dùng `effective_from = 2026-09-01` như các đơn giá seed khác |
| A2-7 | Dạng `runId` = `YYYYMMDDThhmm` + `-` + 4 ký tự `A-Z0-9` (task chỉ nói "timestamp + 4 random chars") |
| A2-8 | `transformation = c_limit,w_1920,h_1920` là cách diễn đạt "cạnh dài ≤ 1920 px" của FILE-01 |
| A2-9 | `transform: true` thêm vào ValidationPipe toàn cục (cần cho query DTO số); phải chạy lại toàn bộ test Phase 1 để chắc không đổi hành vi |
| A2-10 | `package.json` chép vào bản nháp (đổi đúng dòng `lint`) không làm vỡ phân giải module của bản nháp – mục 2.9a |

## 4. Checkpoints

### CP-1 · Ánh xạ lỗi DB + 2 mã lỗi mới (BE-P2-01, BE-P2-02)

File: `src/common/errors/error-code.ts` (sửa), `src/common/errors/db-errors.ts` (+ `.spec.ts`), `src/common/errors/all-exceptions.filter.ts` (sửa) + `all-exceptions.filter.spec.ts`, **`src/app.setup.spec.ts` (sửa, tester làm – mục 2.2a)**.
File **Bản sao** (coder chép, không sửa một ký tự – mục 2.1a): `src/app.setup.ts`, `src/common/response.interceptor.ts`, `src/common/errors/validation.ts`, `src/main.ts`.

**Done when:** **KIỂM-BẢN-SAO** (cả 4 lệnh ở mục 2.1a) không in gì; `npx vitest run artifact_BE/2026-11-01-BE-P2-01-10/src/common/errors` xanh, mỗi dòng bảng 2.2 có đúng một test; bản nháp `artifact_BE/2026-11-01-BE-P2-01-10/src/app.setup.spec.ts` **nạp được và xanh với đúng 25 thành viên `ErrorCode`** (tester chạy lại CP-1 sau khi coder chép xong); `npm run test` xanh **trừ đúng một test đã biết** – bản ở file chính `src/app.setup.spec.ts` ("ErrorCode has exactly 23 members") đỏ cho tới khi bản nháp được chép (mục 2.2a).

Kịch bản test:

| # | Tình huống | Spec | Kết quả mong đợi |
|---|---|---|---|
| 1 | P2002 `meta.target = 'users_phone_key'` (và dạng `['users_phone_key']`) | 01 Error codes | 409 `{ error: { code: 'PHONE_TAKEN', message: 'Số điện thoại đã được sử dụng' } }` |
| 2 | P2002 `rooms_building_id_code_key` | ROOM-06 | 400 `VALIDATION_FAILED`, `fields.code = 'Mã phòng đã có trong tòa (kể cả phòng đã khóa)'` |
| 3 | P2002 `room_prices_one_pending` | PRC-02 | 409 `CONFLICT_STATE` |
| 4 | P2002 `rate_plans_one_pending` | RATE-01 | 409 `CONFLICT_STATE` |
| 5 | P2002 `rate_plans_one_per_day` | D2-15 | 409 `CONFLICT_STATE` |
| 6 | Lỗi không rõ code, message chứa `MANAGER_MAX_2_BUILDINGS: …` | BLD-03 | 409 `MANAGER_MAX_2_BUILDINGS`, message "Mỗi quản lý chỉ phụ trách tối đa 2 tòa" |
| 7 | message chứa `BUILDING_MANAGER_ROLE: …` | BLD-03 | 400 `VALIDATION_FAILED` + `fields.managerId` (A2-1) |
| 8 | message `new row … violates check constraint "buildings_code_format"` | BLD-06 | 400 `VALIDATION_FAILED` + `fields.code` (A2-2) |
| 9 | Lỗi DB lạ: `PrismaClientKnownRequestError` P2003 message `Foreign key constraint failed on the field: 'tenant_id'` | API-04 | 500 `INTERNAL_ERROR`, message "Có lỗi xảy ra, vui lòng thử lại sau"; body **không** chứa `tenant_id`, `constraint`, `relation`, tên bảng |
| 10 | `PrismaClientUnknownRequestError` message dài có cả chuỗi kết nối | API-03 | 500 `INTERNAL_ERROR`; body không có chữ nào của message |
| 11 | `HttpException` sẵn có (401, 403, 404, 409) | API-04 | Giữ nguyên hành vi Phase 1 |
| 12 | `PRICE_PROPOSAL_EXPIRED` | PRC-07, RATE-05 | 409 `{ code, message: 'Đề xuất đã quá ngày hiệu lực, vui lòng đề xuất lại' }` |
| 13 | `UPLOAD_NOT_CONFIGURED` | FILE-01 | 503 `{ code, message: 'Chưa cấu hình tải ảnh' }` |
| 14 | `ERRORS` có đúng một dòng cho mỗi `ErrorCode` | API-03 | Không mã nào thiếu thông điệp tiếng Việt |
| 15 | Bản nháp `app.setup.spec.ts` sau khi sửa (mục 2.2a) | 01 Error codes | `ErrorCode` có đúng **25** thành viên; `EXPECTED` khớp `Object.keys(ErrorCode)` và `Object.keys(ERRORS)`; 2 mã mới đúng status 409/503 và đúng câu chữ spec |
| 16 | Diff của `app.setup.spec.ts` | – | Chỉ 2 dòng `EXPECTED` thêm + số 23→25 ở tên test và `toHaveLength`; không `it` nào khác bị sửa/xóa |

### CP-2 · `{ data, meta }` cho danh sách + DTO phân trang (BE-P2-03)

File: `src/common/pagination.ts` (+ `.spec.ts`), `src/common/response.interceptor.ts` (**Sửa** – từ CP-2 hết là Bản sao: `Paginated` → `{ data, meta }`) + `.spec.ts`, `src/app.setup.ts` (**Sửa** – từ CP-2 hết là Bản sao: ValidationPipe thêm `transform: true`). Cả hai đều đã có trong bản nháp từ CP-1 dưới dạng Bản sao; CP-2 sửa **tối thiểu** đúng hai chỗ trên, phần còn lại giữ nguyên từng ký tự so với file chính.
Còn mang nhãn Bản sao: `src/common/errors/validation.ts`, `src/main.ts`.

**Done when:** **KIỂM-BẢN-SAO** rút gọn (2 lệnh: `validation.ts`, `main.ts`) không in gì; `npx vitest run artifact_BE/2026-11-01-BE-P2-01-10/src/common` xanh **và** `npm run test` xanh toàn bộ (đặc biệt `src/app.setup.spec.ts`: object thường vẫn ra đúng `{ data: … }` – API-02).

Kịch bản test:

| # | Tình huống | Spec | Kết quả mong đợi |
|---|---|---|---|
| 1 | `paginated([{id:1}], 2, 20, 41)` qua interceptor | API-02 | `{ data: [{id:1}], meta: { page: 2, limit: 20, total: 41 } }` – không khóa cấp 1 nào khác |
| 2 | Object thường `{ id: 1, name: 'An' }` | API-02 | `{ data: { id: 1, name: 'An' } }`, **không** có `meta` |
| 3 | Mảng thường `[1,2,3]` | API-02 | `{ data: [1,2,3] }` |
| 4 | `undefined` / `null` | API-02 | `{ data: null }` |
| 5 | Object tình cờ có khóa `data` và `meta` nhưng không phải `Paginated` | API-02 | Bọc nguyên: `{ data: { data: …, meta: … } }` (không nhận nhầm) |
| 6 | Danh sách rỗng, `total = 0` | API-02 | `{ data: [], meta: { page: 1, limit: 20, total: 0 } }` |
| 7 | Query không truyền gì | API-02 | `page = 1`, `limit = 20` |
| 8 | `?page=0`, `?page=-1`, `?page=abc` | API-04 | `VALIDATION_FAILED` + `fields.page` |
| 9 | Biên `?limit=1` và `?limit=100` | API-02 | Hợp lệ |
| 10 | `?limit=0`, `?limit=101` | API-04 | `VALIDATION_FAILED` + `fields.limit` |
| 11 | `?page=2&limit=25` | API-02 | `pageParams` → `{ skip: 25, take: 25 }` |
| 12 | `?page=1.5` | API-04 | `VALIDATION_FAILED` (`@IsInt`) |
| 13 | Toàn bộ test Phase 1 sau khi bật `transform: true` | A2-9 | `npm run test` xanh, không test nào phải sửa |

### CP-3 · Ngày giờ Hà Nội (BE-P2-04)

File: `src/common/date/today.ts` (+ `.spec.ts`).

**Done when:** **KIỂM-BẢN-SAO** rút gọn (`validation.ts`, `main.ts`) không in gì; `npx vitest run artifact_BE/2026-11-01-BE-P2-01-10/src/common/date` xanh; mọi test cố định `now` (không test nào phụ thuộc giờ máy chạy).

Kịch bản test:

| # | Tình huống | Spec | Kết quả mong đợi |
|---|---|---|---|
| 1 | `todayHanoi(new Date('2026-11-01T16:30:00Z'))` | G-chung | `2026-11-01T00:00:00Z` (23:30 giờ Hà Nội cùng ngày) |
| 2 | `todayHanoi(new Date('2026-11-01T17:00:00Z'))` | G-chung | `2026-11-02T00:00:00Z` (00:00 giờ Hà Nội, **sang ngày**) |
| 3 | `todayHanoi(new Date('2026-11-01T16:59:59Z'))` | G-chung | vẫn `2026-11-01` (biên nửa đêm) |
| 4 | `todayHanoi(new Date('2026-11-01T00:00:00Z'))` | G-chung | `2026-11-01` (07:00 Hà Nội) |
| 5 | Cuối tháng: `2026-10-31T17:30:00Z` | G-chung | `2026-11-01` (qua tháng) |
| 6 | Cuối năm: `2026-12-31T17:30:00Z` | G-chung | `2027-01-01` |
| 7 | `addDays(2026-02-28, 1)` năm không nhuận và `addDays(2028-02-28, 1)` năm nhuận | G-chung | `2026-03-01` · `2028-02-29` |
| 8 | `addDays(d, 0)`, `addDays(d, -1)`, `addDays(d, 30)` | VIEW-08 | Đúng ngày, luôn nửa đêm UTC, không đổi `d` gốc |
| 9 | `compareDates` nhỏ hơn / bằng / lớn hơn, kể cả khi một `Date` có giờ khác 0 | G-chung | `-1 / 0 / 1` |
| 10 | `formatDateOnly` / `parseDateOnly` khứ hồi `'2026-11-01'` | API-06 | Bằng nhau |
| 11 | `parseDateOnly('2026-02-30')`, `'01/11/2026'`, `''`, `'2026-13-01'` | API-06 | `null` |
| 12 | `hasSlotStarted` lúc 15:00 Hà Nội (`2026-11-01T08:00:00Z`), ngày xem = hôm nay | VIEW-08 | `MORNING` → `true`, `AFTERNOON` → `true`, `EVENING` → `false` |
| 13 | Cùng mốc giờ, ngày xem = mai | VIEW-08 | Cả 3 ca → `false` |
| 14 | Lúc 07:59 Hà Nội, ngày xem = hôm nay | VIEW-08 | Cả 3 ca → `false`; đúng 08:00 → `MORNING` = `true` |
| 15 | Ngày xem là hôm qua | VIEW-08 | `false` (ngày quá khứ do P2-6 chặn, không phải việc của hàm này) |
| 16 | `SLOT_START_MINUTES` | VIEW-08 | `{ MORNING: 480, AFTERNOON: 840, EVENING: 1080 }` |

### CP-4 · Đơn giá hiện hành + phòng công khai (BE-P2-05, BE-P2-06)

File: `src/common/rates/rates-at.ts` (+ `.spec.ts`), `src/common/rooms/public-room.ts` (+ `.spec.ts`).
Test dùng fake `Pick<PrismaClient, …>` viết trong chính file spec (không DB thật, không `test/fixtures/fake-prisma.ts` vì file đó không có trong bản nháp).

**Done when:** **KIỂM-BẢN-SAO** rút gọn (`validation.ts`, `main.ts`) không in gì; `npx vitest run artifact_BE/2026-11-01-BE-P2-01-10/src/common` xanh; `npm run test` xanh.

Kịch bản test – `ratesAt` / `currentRoomPrice`:

| # | Tình huống | Spec | Kết quả mong đợi |
|---|---|---|---|
| 1 | Đơn giá điện APPROVED từ 01/09; gọi `ratesAt(b, 2026-11-01)` | RATE-04 | Trả bản 01/09, `tiers` theo `tierNo` tăng |
| 2 | **Acceptance spec 12**: đơn giá duyệt hiệu lực 20/10; gọi với `2026-10-15` | RATE-04 | **Không** trả bản 20/10 (trả bản cũ hơn nếu có, không có thì `null`) |
| 3 | Cùng dữ liệu, gọi với `2026-11-15` | RATE-04 | Trả bản 20/10 |
| 4 | Có bản PENDING hiệu lực hôm qua và bản APPROVED hiệu lực tháng trước | PRC-07 | Chỉ trả bản APPROVED (PENDING không bao giờ được tính) |
| 5 | Có bản REJECTED và SUPERSEDED hiệu lực mới hơn | PRC-10 | Bỏ qua, trả bản APPROVED hợp lệ |
| 6 | Tòa chưa có đơn giá WATER | RATE-04 | `water = null`, **không** ném lỗi |
| 7 | 2 dịch vụ, mỗi dịch vụ 1 đơn giá | RATE-01 | `services` có đúng 2 khóa theo `serviceId`, không lẫn vào `electric`/`water` |
| 8 | Đơn giá tòa khác cùng `kind` | SCOPE-02 | Không lọt vào kết quả |
| 9 | Kết quả trả về | PUB-04 | Không có `reviewNote`, `proposedById`, `reviewedById`, `reason` |
| 10 | `currentRoomPrice` 3 bản APPROVED 01/09, 01/10, 01/12; `date = 2026-11-01` | PRC-06 | Trả bản 01/10 |
| 11 | **Trùng ngày**: 2 bản APPROVED cùng `effective_from = 01/10`, `reviewed_at` 09:00 và 15:00 | PRC-06 | Trả bản `reviewed_at` 15:00 |
| 12 | Trùng cả `effective_from` và `reviewed_at` | A2-4 | Trả bản `id` lớn hơn |
| 13 | Phòng chưa có bản APPROVED nào (CG01/301) | ROOM-02 | `null` (người gọi mới quyết `PRICE_NOT_APPROVED`) |
| 14 | Chỉ có bản APPROVED hiệu lực **tương lai** (01/12), `date = 2026-11-01` | PRC-06 | `null` – job giá không bao giờ ghi `null` lên `rooms.price` |
| 15 | Phòng khác cùng tòa có giá | PRC-06 | Không lẫn giá của phòng khác |

Kịch bản test – `publicRoomWhere` / `publicBuildingWhere` (kiểm chính xác object `where`, và một bộ fixture hình dạng seed đối chiếu từng điều kiện):

| # | Tình huống | Spec | Kết quả mong đợi |
|---|---|---|---|
| 16 | Object `where` trả về | ROOM-05, R2-1 | Đúng 5 nhánh của mục 2.6: `isActive`, `underMaintenance: false`, `price: { not: null }`, `contracts.none(HOLD/ACTIVE)`, `building.isActive` + `AND` 2 nhánh ELECTRIC/WATER với `effectiveFrom: { lte: today }` và `status: 'APPROVED'` |
| 17 | `today` được truyền vào | RATE-06 | Cả hai nhánh đơn giá dùng đúng `today`, không gọi `new Date()` bên trong |
| 18 | **Hình dạng seed** CG01/301 (`price = null`) | ROOM-05 | Không công khai (đọc `BUILDINGS` export từ `prisma/seed.ts`) |
| 19 | **Hình dạng seed** CG01/203 (hợp đồng ACTIVE HD000001) | ROOM-05 | Không công khai |
| 20 | Phòng `underMaintenance = true`, các điều kiện khác đủ | ROOM-03/05 | Không công khai |
| 21 | Phòng active nhưng tòa `isActive = false` | BLD-06 | Không công khai |
| 22 | Tòa thiếu đơn giá ELECTRIC (chỉ có WATER) và ngược lại | R2-1, BLD-05 | Không công khai (2 case) |
| 23 | Tòa có cả 2 đơn giá nhưng hiệu lực **mai** | RATE-06 | Không công khai |
| 24 | Phòng có hợp đồng `HOLD`, rồi `CANCELLED`/`ENDED` | ROOM-05 | `HOLD` → không công khai; `CANCELLED`/`ENDED` → công khai |
| 25 | Phòng đủ điều kiện (DD01/101) | ROOM-05 | Công khai |
| 26 | `publicBuildingWhere` cho tòa không có phòng công khai nào | BLD-05 | Không công khai; tòa có ≥ 1 phòng công khai → công khai |

### CP-5 · `POST /files/sign` và `verifyRoomImage` (BE-P2-07)

File: `src/modules/files/cloudinary.ts` (+ `.spec.ts`), `dto/sign.dto.ts`, `files.service.ts` (+ `.spec.ts`), `files.controller.ts`, `files.module.ts`, `src/app.module.ts` (sửa).

**Done when:** **KIỂM-BẢN-SAO** rút gọn (`validation.ts`, `main.ts`) không in gì; `npx vitest run artifact_BE/2026-11-01-BE-P2-01-10/src/modules/files` xanh, trong đó **hai** vector chữ ký Cloudinary **đúng tuyệt đối**. Quy tắc: `api_secret = 'abcd'`, SHA-1 hex, các tham số sắp theo tên khóa và nối `k=v` bằng `&`, rồi **nối thêm secret không có dấu phân cách** (nguồn: trang chính thức Cloudinary "Authentication signatures", phiên chính kiểm 01/11/2026 và tính lại bằng `node:crypto`):

- a. chuỗi ký `timestamp=1315060510` + `abcd` → `a21ad0f63beb4de2e5575204b79ab90bffb02c10`
- b. chuỗi ký `eager=w_400,h_300,c_pad|w_260,h_200,c_crop&public_id=sample_image&timestamp=1315060510` + `abcd` → `bfd09f95f331f558cbd1320e67aa8d488770583e`

**Nếu tính ra khác: dừng và báo, không được sửa giá trị mong đợi của test.**

Kịch bản test:

| # | Tình huống | Spec | Kết quả mong đợi |
|---|---|---|---|
| 1 | Hai vector tài liệu Cloudinary ở trên (2 case) | FILE-01 | (a) `signParams({ timestamp: 1315060510 }, 'abcd') === 'a21ad0f63beb4de2e5575204b79ab90bffb02c10'`; (b) `signParams({ public_id: 'sample_image', timestamp: 1315060510, eager: 'w_400,h_300,c_pad\|w_260,h_200,c_crop' }, 'abcd') === 'bfd09f95f331f558cbd1320e67aa8d488770583e'` |
| 2 | Tham số không theo thứ tự chữ cái | FILE-01 | Chữ ký không đổi (luôn sắp theo khóa) |
| 3 | `file`, `cloud_name`, `resource_type`, `api_key`, giá trị rỗng có trong tham số | FILE-01 | Bị loại khỏi chuỗi ký |
| 4 | `parseCloudinaryUrl('cloudinary://123:abcXYZ@demo')` | FILE-01 | `{ cloudName: 'demo', apiKey: '123', apiSecret: 'abcXYZ' }` |
| 5 | `parseCloudinaryUrl(undefined)`, `''`, `'https://x'`, `'cloudinary://thieu@demo'` | FILE-01 | `null` (4 case) |
| 6 | Thiếu `CLOUDINARY_URL`, manager xin chữ ký cho phòng trong phạm vi | FILE-01 | 503 `UPLOAD_NOT_CONFIGURED`, message "Chưa cấu hình tải ảnh"; **không** truy vấn DB trước đó |
| 7 | App khởi động khi thiếu `CLOUDINARY_URL` | FILE-01 | `REQUIRED_ENV` không chứa `CLOUDINARY_URL`; `validateEnv` không ném |
| 8 | Manager của CG01 xin chữ ký cho phòng CG01 | FILE-01 | `folder = 'rooms/<buildingId>/<roomId>'`, `allowedFormats = 'jpg,png,webp'`, `transformation = 'c_limit,w_1920,h_1920'`, có `signature`, `timestamp` (giây), `uploadUrl` |
| 9 | Thân trả về | API-03/FILE-01 | **Không** chứa `apiSecret` hay bất kỳ phần nào của nó |
| 10 | **Manager của tòa khác** xin chữ ký (acceptance spec 11) | FILE-01, SCOPE-02 | 403 `OUT_OF_SCOPE` |
| 11 | BOSS (`buildingIds = null`) xin chữ ký cho phòng bất kỳ | API-07 | Thành công |
| 12 | `roomId` không tồn tại | API-04 | 404 `NOT_FOUND` |
| 13 | Phòng `isActive = false` | ROOM-04 | 404 `NOT_FOUND` |
| 14 | DTO `purpose = 'CCCD'` / thiếu `purpose` / `roomId = 0` / `roomId = 'x'` | API-04 | `VALIDATION_FAILED` (4 case) |
| 15 | `verifyRoomImage` với `publicId = 'rooms/<b>/<r>/abc123'`, `version = 1762000000`, `format = 'jpg'` | FILE-02 | `url = 'https://res.cloudinary.com/demo/image/upload/v1762000000/rooms/<b>/<r>/abc123.jpg'` |
| 16 | **`publicId` sai thư mục** (acceptance spec 11): `'rooms/<b>/<r2>/abc'`, `'other/abc'`, `'rooms/<b>/<r>x/abc'`, `'rooms/<b>/<r>/../y'`, `'rooms/<b>/<r>/a/b'` | FILE-02 | 400 `VALIDATION_FAILED` + `fields.publicId` (5 case) |
| 17 | `format = 'gif'`, `'svg'` | ROOM-07 | 400 `VALIDATION_FAILED` + `fields.format` (2 case) |
| 17b | `format = 'JPG'`, `'WebP'` | ROOM-07 | Hợp lệ (hạ chữ thường trước khi kiểm và trước khi dựng URL) → `url` kết thúc bằng `.jpg` / `.webp` |
| 18 | `version = 0`, `-1`, `1.5` | FILE-02 | 400 `VALIDATION_FAILED` + `fields.version` (3 case) |
| 19 | `verifyRoomImage` cho phòng tòa khác | FILE-02 | Thư mục không khớp → `VALIDATION_FAILED` + `fields.publicId` (URL của client không bao giờ được lưu) |
| 20 | `app.module.ts` | spec 01 | `FilesModule` được đăng ký; `npm run test` (gồm `src/app.setup.spec.ts`) vẫn xanh |
| 21 | `verifyRoomImage` khi thiếu `CLOUDINARY_URL` (dù `roomId` không tồn tại) | FILE-01 | 503 `UPLOAD_NOT_CONFIGURED`; **không** truy vấn DB trước đó (cùng thứ tự kiểm như lúc ký) |
| 22 | `verifyRoomImage` với `roomId` không tồn tại | FILE-02 | 404 `NOT_FOUND` (SCOPE-02 do người gọi P2-4 lo, không kiểm trong hàm này) |
| 23 | `verifyRoomImage` cho phòng `isActive = false`, `publicId` đúng thư mục | FILE-02 | Thành công (ROOM-07/FILE-02 **không** đòi phòng còn hoạt động) |
| 24 | Thông điệp lỗi của `SignUploadDto` | API-04 | Tiếng Việt, cùng lối viết với `auth.dto.ts` |

### CP-6 · Seed "Gửi xe điện" (BE-P2-08)

File: `prisma/seed.ts` (sửa), `prisma/seed.spec.ts` (sửa).

**Done when:** **KIỂM-BẢN-SAO** rút gọn (`validation.ts`, `main.ts`) không in gì; `npx vitest run artifact_BE/2026-11-01-BE-P2-01-10/prisma` xanh (seed chạy **2 lần** trên fake prisma, fake này đã áp `rate_plans_one_pending`, `rate_plans_one_per_day`, FK, enum); **không** chạy `npx prisma db seed`. Lần chạy thật trên DB dev do phiên chính làm sau khi chép.

Kịch bản test:

| # | Tình huống | Spec | Kết quả mong đợi |
|---|---|---|---|
| 1 | Seed lần 1 | SVC-05 | Mỗi tòa CG01, DD01, HM01 có dịch vụ "Gửi xe điện" `unit = VEHICLE` và 1 `rate_plans` APPROVED, 1 bậc `upTo = null`, `unitPrice = 150000` |
| 2 | Seed lần 2 trên cùng dữ liệu | SVC-05 | Không lỗi; số `rate_plans` và `services` **không tăng** |
| 3 | Số đơn giá mỗi tòa | 12-pricing seed | 6 (ELECTRIC, WATER, Wifi, Rác, Gửi xe máy, Gửi xe điện) |
| 4 | `effective_from` của đơn giá mới | A2-6 | `2026-09-01`, bằng các đơn giá seed khác |
| 5 | `tiers` của đơn giá dịch vụ | RATE-02 | Đúng 1 bậc, `tier_no = 1`, `up_to = null`, `unit_price ≥ 0` |
| 6 | Tiền | CLAUDE.md | `150000` là số nguyên, không float, không chuỗi |
| 7 | `proposedById` / `reviewedById` | PRC-04 | Cả hai là Boss, có `reviewedAt` |
| 8 | Các bản ghi seed khác (5 tài khoản, 3 tòa, 7 phòng, hợp đồng HD000001, chỉ số) | Phase 1 | Không đổi; test seed Phase 1 vẫn xanh |
| 9 | `BUILDINGS` export | – | Import được từ `prisma/seed.ts`, nội dung không đổi so với Phase 1 |

### CP-7 · Bộ chạy e2e (BE-P2-09)

File: `scripts/e2e/run.ts`, `scripts/e2e/run.spec.ts` (tester viết), `scripts/e2e/cleanup.mjs`, `package.json` (sửa – đúng dòng `lint`, mục 2.9a), `.gitignore` (sửa – `/test/e2e-runs/`).
**Không** tạo file nào trong `test/e2e-runs/` và **không** sửa hook hay agent guard. Theo luật đứng ở mục 1 điểm 1: không ghi file nào ngoài thư mục bản nháp; nhật ký trong test chỉ đi vào `fs.mkdtemp` do mã test tạo và tự dọn.

**Done when:** **KIỂM-BẢN-SAO** rút gọn (`validation.ts`, `main.ts`) không in gì; `npx vitest run artifact_BE/2026-11-01-BE-P2-01-10/scripts` xanh; diff `package.json` của bản nháp so với file chính chỉ đúng một dòng `lint` (mục 2.9a); **không** chạy `npm run test:e2e`, không `--apply`. Test ghi nhật ký vào thư mục tạm (`fs.mkdtemp`), **không** vào `test/e2e-runs/`, và tự dọn. Không có truy vấn DB thật trong CP này (toàn bộ dùng fake `Pick<PrismaClient, …>` ghi lại các lời gọi).

Kịch bản test:

| # | Tình huống | Spec | Kết quả mong đợi |
|---|---|---|---|
| 1 | `newRunId` 2 lần liên tiếp cùng mốc giờ, `rand` khác nhau | D2-14 | Khác nhau; khớp `/^\d{8}T\d{4}-[A-Z0-9]{4}$/` |
| 2 | `e2eName(runId, 'Tòa thử')` | D2-14 | Bắt đầu bằng `'[E2E ' + runId + '] '` |
| 3 | `e2eServiceName('Gửi xe thử')` | SVC-01 | Bắt đầu `'[E2E] '` và **độ dài ≤ 50** (giới hạn `services.name`) |
| 3b | `e2eServiceName` với `what` dài làm kết quả > 50 ký tự | SVC-01 | **Ném lỗi** nêu rõ giới hạn 50; **không** cắt chuỗi (mục 2.9 điểm 4) |
| 4 | `e2eName` cho tên tòa/quản lý/khách | BLD-01 | Độ dài ≤ 100 (`buildings.name`, `users.full_name`, `viewings.guest_name`) |
| 5 | `uniqueBuildingCode` với `exists` luôn `false` | BLD-06 | Khớp `/^E2[A-Z0-9]{4}$/`, đúng 6 ký tự, qua CHECK `buildings_code_format` |
| 6 | **Trùng mã**: `exists` trả `true` cho lần đầu, `false` lần sau | D2-14 | Sinh lại, trả mã thứ hai, `exists` được gọi đúng 2 lần |
| 7 | `exists` luôn `true` | D2-14 | Dừng sau **đúng 20** lần thử và **ném lỗi rõ ràng** (không vòng lặp vô tận); `exists` được gọi 20 lần |
| 7b | `rand` trả về cái gì | D2-14 | `rand()` chỉ sinh **phần ngẫu nhiên** (4 ký tự `A-Z0-9` / 8 chữ số); tiền tố `E2` / `09` do hàm gọi nối (mục 2.9 điểm 3) |
| 8 | `uniquePhone` | G-04 | Khớp `/^09\d{8}$/`, 10 số, qua CHECK `users_phone_vn`; trùng thì sinh lại (như #6); dừng sau 20 lần thử |
| 9 | `uniquePhone` không bao giờ trả `0900000001..0900000005` | D2-14 | `rand` cố định ra số seed → **sinh lại ngay, không gọi `exists`** cho số đó (đếm số lần gọi `exists`); tài khoản seed không bị đụng |
| 10 | `randomPassword()` | AUTH-03 | ≥ 12 ký tự, 2 lần gọi khác nhau, **không** xuất hiện trong nhật ký (#12) |
| 11 | `record()` sau mỗi lần tạo | D2-14 | File `<dir>/<runId>.json` tồn tại **ngay** sau lời gọi đầu tiên, chứa id vừa ghi; ngắt giữa đường vẫn còn dấu |
| 12 | **Nhật ký không chứa bí mật** | D2-14 | Chuỗi JSON không chứa mật khẩu đã sinh, không `token`, `cookie`, `Bearer`, `postgres://`, `passwordHash`; khóa cấp 1 chỉ gồm `runId`, `startedAt`, `endedAt`, `status`, `buildingCodes`, `ids` |
| 13 | `status` theo vòng đời | D2-14 | `RUNNING` khi tạo → `CLEANED` sau `finish('CLEANED')`; `endedAt` được điền |
| 14 | `cleanupRun` **chỉ đụng id trong nhật ký** | D2-14 | Mọi lời gọi `updateMany` đều có `where.id.in` ⊆ id trong nhật ký; không lời gọi nào thiếu `where`; **không** có `delete`/`deleteMany`/`$executeRaw` |
| 15 | Lịch hẹn | VIEW-04 | `where: { id: { in }, status: { in: ['NEW','CONFIRMED'] } }`, `data: { status: 'CANCELLED', outcomeNote: '[E2E] dọn dữ liệu thử' }` |
| 16 | Đề xuất giá và đơn giá | PRC-09 | `where … status: 'PENDING'`, `data: { status: 'REJECTED', reviewNote: '[E2E] dọn dữ liệu thử' }`; bản APPROVED **không** bị đụng |
| 17 | Phòng, dịch vụ, tòa | ROOM-04, SVC-04 | `data: { isActive: false }`, không xóa cứng |
| 18 | Quản lý thử | AUTH-T3 | `user.updateMany { where: { id: { in } }, data: { isActive: false } }` **và** `session.updateMany({ where: { userId: { in }, revokedAt: null }, data: { revokedAt } })` – khóa lọc phiên là **`userId`**, không phải `id` (mục 2.9 điểm 2) |
| 19 | `room_images` và bản ghi đã duyệt | ROOM-07 | Không có lời gọi nào đụng tới (giữ lịch sử) |
| 20 | Nhật ký rỗng (không tạo gì) hoặc một bảng có danh sách id rỗng | D2-14 | `cleanupRun` **bỏ qua** bước đó, không gọi `updateMany` nào cho nó; `finish('CLEANED')` vẫn chạy |
| 21 | Một bước cleanup ném lỗi | D2-14 | Các bước còn lại **vẫn chạy hết**, rồi `cleanupRun` ném **`AggregateError`** chứa lỗi đó; người gọi bắt và `finish('FAILED_CLEANUP')` → nhật ký có `status: 'FAILED_CLEANUP'` |
| 21b | **Hai** bước ném lỗi | D2-14 | `AggregateError.errors` có đúng 2 phần tử, các bước khác vẫn chạy |
| 22 | `planCleanup(log, facts)` (chế độ liệt kê) | D2-14 | Trả mảng dòng mô tả; **không** gọi phương thức ghi nào của fake db; nhật ký trên đĩa không bị sửa |
| 22b | `facts.ids[…][].linked` có `'hợp đồng HD000001'` | D2-14 | Dòng in ra nêu rõ bản ghi còn hợp đồng/hóa đơn dính và **không** nên dọn, nêu **mã** hợp đồng (không có `id` số của hợp đồng trong dòng in); bản ghi `isActive = false` được ghi là "đã dọn" |
| 30 | **`cleanupRun` không bao giờ cập nhật bản ghi có liên kết** (mục 2.9b điểm 1): fake `contract.findMany` trả 1 hợp đồng cho `roomId = R1`, nhật ký có `rooms = [R1, R2]` | D2-14 | Mọi `updateMany` lên `room` có `where.id.in = [R2]`, **không** chứa `R1`; `cleanupRun` trả `SkippedRow[]` gồm đúng `{ table: 'rooms', id: R1, reason }` với `reason` nêu mã hợp đồng |
| 30b | Mọi id của một bảng đều có liên kết | D2-14 | **Không** có `updateMany` nào cho bảng đó (bước bị bỏ hẳn) |
| 30c | Dịch vụ thử nằm trong `contract_services`; quản lý thử là `tenantId` của một hợp đồng | D2-14 | Cả hai vào `SkippedRow[]`; `service.updateMany` / `user.updateMany` không chứa id đó; `session.updateMany` cũng **không** đụng user đó; `reason` của dòng dịch vụ nêu **mã** hợp đồng (lấy từ `contract.select.code`), không có `contractId` số |
| 30d | Lịch hẹn thử trong nhật ký là `viewing` của một hợp đồng **không nằm trong nhật ký** (nhánh `{ viewing: { id: { in: viewings } } }`) | D2-14 | Vào `SkippedRow[]`, `viewing.updateMany` không chứa id đó; vẫn chỉ **hai** lời gọi đọc |
| 30d2 | **Quản lý thử chỉ là `createdById` của một hợp đồng** (không phải `tenantId`) | D2-14 | Vào `SkippedRow[]` với `reason` nêu mã hợp đồng; `user.updateMany` và `session.updateMany` **không** chứa id đó |
| 30e | `linkedRows` chỉ đọc | D2-14 | Chỉ gọi `contract.findMany` + `contractService.findMany` (**đúng 2 lời gọi**, kể cả khi có cả nhánh `viewing` và `createdById`); không `updateMany`/`delete` nào |
| 30f | **Liệt kê và `--apply` khớp nhau** | D2-14 | Với cùng nhật ký + cùng fake db, `linked` trong `CleanupFacts` của chế độ liệt kê và `SkippedRow[]` của `cleanupRun` nêu **cùng tập bản ghi và cùng chuỗi mô tả** |
| 31 | **Tiêu đề mục liệt kê** của `planCleanup` khi có bản ghi `linked` không rỗng | D2-14 | Có đúng một dòng bằng chuỗi `'Có hợp đồng/hóa đơn liên kết – không xử lý'` (so sánh **từng ký tự**, kể cả dấu `–` en dash); các bản ghi `linked` không rỗng chỉ xuất hiện dưới mục này |
| 31b | Không bản ghi nào có `linked` | D2-14 | **Không** in tiêu đề đó |
| 31c | Mục `unlogged` (kịch bản 25) và mục mới cùng xuất hiện | D2-14 | Là hai mục riêng, bản ghi không bị in trùng |
| 32 | **Output của `--apply`** nêu tên bản ghi bị bỏ qua | D2-14 | Hàm dựng output (thuần, test được không cần DB) in mục ở #31, nhóm theo bảng, có **id** từng dòng + `reason`, và dòng tổng `Bỏ qua N bản ghi`; `N` khớp `SkippedRow[].length` |
| 33 | **Trạng thái nhật ký khi còn bản ghi bị bỏ qua** (mục 2.9b điểm 4) | D2-14 | `SkippedRow[]` không rỗng → nhật ký kết bằng `finish('FAILED_CLEANUP')`, **không** bao giờ `CLEANED`; `E2eRunLog['status']` vẫn chỉ có 3 giá trị `RUNNING \| CLEANED \| FAILED_CLEANUP` |
| 33b | Không bản ghi bị bỏ qua, không bước nào lỗi | D2-14 | `finish('CLEANED')`, `endedAt` được điền |
| 33c | Có cả bước lỗi **và** bản ghi bị bỏ qua | D2-14 | `AggregateError` có `.errors` đúng số lỗi **và** `.skipped` = `SkippedRow[]`; người gọi vẫn kết `FAILED_CLEANUP` |
| 34 | Sáu sai lệch ở mục 2.9c | D2-14 | `readAllLogs` trả cả nhật ký `CLEANED`, `readLogs` lọc bỏ; `new E2eRun(runIdĐãCó)` giữ nguyên `ids` cũ (không mất dấu); `E2E_TABLES` export được và khớp khóa của `ids`; `planCleanup` in `unlogged` **đúng một lần** (và dưới tiêu đề `(không có nhật ký)` khi không có nhật ký nào); `e2eServiceName('Gửi xe thử – ký tự đặc biệt …')` đếm code point (chuỗi có ký tự ngoài BMP vẫn tính đúng theo `Array.from`) |
| 23 | `readLogs` bỏ qua nhật ký `CLEANED` | D2-14 | Chỉ trả nhật ký `RUNNING`/`FAILED_CLEANUP` |
| 24 | `readLogs` với file JSON hỏng cạnh 1 file tốt | D2-14 | `console.error` nêu đường dẫn file hỏng, **bỏ qua** nó, vẫn trả file tốt; không ném (mục 2.9 điểm 5) |
| 25 | Bản ghi tên `[E2E …` không có trong nhật ký nào | D2-14 | `planCleanup` liệt kê riêng, ghi rõ "chỉ báo, không xử lý" |
| 26 | `.gitignore` | D2-14 | Có dòng `/test/e2e-runs/`; `git check-ignore test/e2e-runs/x.json` (phiên chính chạy) phải khớp |
| 27 | `scripts/e2e/cleanup.mjs` chạy không tham số, không có nhật ký | D2-14 | Chỉ in, không ghi DB, thoát 0 – kiểm bằng cách đọc code + test `planCleanup`, **không** chạy thật trong bản nháp |
| 28 | Đường dẫn import | mục 2.9 | `scripts/e2e/run.spec.ts` import `'./run.js'`; file spec e2e trong `test/` import `'../scripts/e2e/run.js'`; `cleanup.mjs` import `'./run.ts'` – kiểm bằng `npm run lint` (đã gồm `scripts/`) xanh |
| 29 | `package.json` | mục 2.9a | Khóa `lint` = `"oxlint --type-aware src/ test/ scripts/"`; mọi khóa khác giống file chính từng ký tự |

### CP-8 · Chốt phần (BE-P2-10)

Không thêm file. Chạy và dán kết quả vào báo cáo:

1. `npm run lint` → 0 lỗi. Trong bản nháp, `scripts/` **chưa** nằm trong phạm vi của `package.json` ở file chính, nên chạy thêm `npx oxlint --type-aware artifact_BE/2026-11-01-BE-P2-01-10/scripts/` → 0 lỗi; sau khi chép, `npm run lint` tự quét `scripts/` (mục 2.9a).

1b. **Phạm vi phán xét lỗi kiểu (chốt 02/11/2026)**. `tsconfig.json` ở gốc `Source/backend` không có `include`/`exclude`, nên `npx tsc --noEmit` **kéo cả `artifact_BE/`** – gồm mọi bản nháp cũ trong `approved/` – và sẽ ra lỗi không liên quan tới phần này. Vì vậy:

   - **Thước đo chính thức của CP-8 là `npx tsc -p tsconfig.build.json --noEmit`** (chỉ `src/`, tức file chính sẽ nhận sau khi chép) **cộng** `npx oxlint --type-aware artifact_BE/2026-11-01-BE-P2-01-10/` (oxlint `--type-aware` lấy kiểu từ `tsconfig.json`, nhưng chỉ **báo lỗi trên những file được truyền vào**, nên đúng phạm vi bản nháp). Không dùng `npx tsc --noEmit` trần làm tiêu chí.
   - **Không được tạo `tsconfig` riêng cho việc này**, kể cả ngoài repo hay trong thư mục scratch: theo luật đứng ở mục 1 điểm 1, **không ghi file nào ở ngoài thư mục bản nháp, kể cả file tạm**. Nếu hai lệnh trên không đủ để kết luận, **dừng và báo** chứ không tự tạo file config.
   - Lỗi kiểu trong các bản nháp cũ ở `artifact_BE/.../approved/` **không** tính là lỗi của phần này; nếu `npx tsc --noEmit` được chạy để tham khảo thì phải ghi rõ trong báo cáo file nào thuộc phần này, file nào không.
2. `npm run test` → xanh **trừ đúng một test đã biết**: `src/app.setup.spec.ts` ở file chính ("ErrorCode has exactly 23 members") đỏ vì bản nháp đã thêm 2 mã; bản nháp của chính file đó xanh. Ghi số test và dán đúng tên test đỏ vào báo cáo để chủ dự án biết nó tự hết sau khi chép (mục 2.2a). Không có test đỏ nào khác.
3. `npm run build` → thành công (chỉ `src/`, bản nháp không được biên dịch). Kiểm thêm **`scripts/` không vào output**: `Test-Path dist/scripts` = `False`, `Test-Path dist/main.js` = `True` (mục 2.9a).
4. `npx vitest run artifact_BE/2026-11-01-BE-P2-01-10` → xanh, ghi số test.
4b. **KIỂM-BẢN-SAO** rút gọn (`src/common/errors/validation.ts`, `src/main.ts`) → không in gì, thoát 0. Dán kết quả; nếu có diff thì hai file đó đã bị sửa ngoài ý muốn → dừng và báo.
5b. Báo cáo kết quả các kịch bản 30–34 của CP-7 (bỏ qua bản ghi có hợp đồng/hóa đơn, tiêu đề mục liệt kê, output `--apply`, trạng thái `FAILED_CLEANUP`) và nhắc lại sáu sai lệch đã chấp nhận ở mục 2.9c. Vẫn **không** chạy `--apply` và không chạy cleanup thật.

5. Liệt kê toàn bộ `[ASSUMPTION]` A2-1..A2-10 đã dùng + điểm "xác nhận khi duyệt" ở mục 3 + 2 helper hoãn sang P2-5/P2-6 (mục 2.9).

**Không** chạy trong bản nháp (phiên chính làm sau khi chép, theo "Part done when" của file task): `npx prisma db seed`, `npm run test:e2e` (2 lần liên tiếp, cả hai nhật ký `CLEANED`), `node prisma/check-constraints.mjs . prisma` (schema không đổi nên vẫn phải 50/50).
