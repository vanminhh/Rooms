# PLAN – BE-LOGIN-01..08: nền móng backend (Prisma, migration, seed, khung API, định dạng lỗi)

Feature: `docs/phase-1-foundation/feature_p1-1-backend-foundation.md` · Gốc: `5c11740`
Bản nháp: `Source/backend/artifact_BE/2026-10-29-BE-LOGIN-01-08/`. Trong file này `D/` = thư mục nháp đó; đường dẫn trong `D/` mirror `Source/backend/`.
Cập nhật 29/10/2026: chủ dự án đã trả lời Q1–Q5, ghi thành quyết định D1–D5 ở mục 3. Không còn câu hỏi nào chặn checkpoint.
Cập nhật 29/10/2026 (lần 2, sau khi test CP-3): thêm quyết định D6 (prefix guard: mọi path ngoài `/api/v1` trả 404 `NOT_FOUND` dạng API-03). Sửa mục 2.1, 2.2, 2.3 (`configureApp` đăng ký 6 thứ), 3, CP-3 và 6.
Cập nhật 29/10/2026 (lần 3, sau review): chủ dự án yêu cầu 2 sửa thêm và trả lời Q7, Q8. (1) `seed.ts` chạy `main()` bằng `if (import.meta.main) await main();`; (2) D7: `@types/node` `24.0.0` → `24.19.2` trong `D/package.json`; (3) D8: filter đổi lỗi dạng http-errors (`expose === true`, `status` 4xx) sang mã 4xx. Sửa mục 0, 1, 2.1, 2.2, 2.3, 3, CP-2 (Done when 3), CP-3, CP-4, 5 và 6.

## 0. Luật chung cho coder và tester (đọc trước mọi checkpoint)

- **`REVIEW.md` do phiên chính giữ.** Coder và tester không đọc để làm việc, không sửa. Tester **không** báo FAIL vì `REVIEW.md` còn trống hay chưa cập nhật.
- **Không đụng DB dev.** Cấm trong pipeline: `prisma migrate dev|deploy|reset|resolve`, `prisma db push|pull|seed|execute`, `prisma studio`, `node prisma/seed.ts` (chạy thật), `npm run start*`, `npm run test:e2e` không kèm đường dẫn nháp (nó chạy cả e2e cũ của bản chính).
- **Biến giả cho mọi lệnh Prisma / mọi lệnh nạp `@prisma/client` hoặc `seed.ts`.** Chạy bằng Bash với tiền tố, ký hiệu `$DUMMY` trong file này:
  `DATABASE_URL=postgresql://u:p@localhost:5432/db DIRECT_URL=postgresql://u:p@localhost:5432/db`
  Biến của tiến trình thắng `.env`, nên dù code sai cũng không chạm Supabase.
- **Ngoại lệ duy nhất cho `node prisma/seed.ts`: kiểm run-guard ở CP-4** (Done when 3), chỉ với tiền tố `$NODB`:
  `DATABASE_URL=postgresql://u:p@127.0.0.1:1/db DIRECT_URL=postgresql://u:p@127.0.0.1:1/db`
  Cổng 1 không có server nên truy vấn đầu của seed hỏng ngay: chứng minh `main()` đã chạy mà không ghi DB nào. Không chạy seed với biến nào khác.
- **Không đọc, in, chép `Source/backend/.env`** (kể cả bằng Read). Không log giá trị biến môi trường.
- **Không cài/gỡ package** (`npm install|uninstall|ci`), không sửa `package-lock.json`.
- **`prisma generate` được phép (D1)**, đúng lệnh này, chỉ sau khi CP-1 đã có `D/prisma/schema.prisma`:
  `$DUMMY npx prisma generate --schema artifact_BE/2026-10-29-BE-LOGIN-01-08/prisma/schema.prisma`
  Lệnh chỉ ghi `node_modules/.prisma/client` (schema không có `output` riêng): không DB, không đổi `package.json`/lockfile. Coder chạy một lần ở đầu CP-2; tester chạy lại nếu thấy `@prisma/client` vẫn là bản rỗng (`PrismaClient: any`). Thay đổi trong `node_modules/.prisma/client` là chủ ý, đã được duyệt.
- Chỉ ghi file trong `D/` bằng Edit/Write. Ngoại lệ duy nhất (D2): lệnh `prisma migrate diff … -o` ở CP-1, đích nằm trong `D/`. File nháp thay file chính (`package.json`, `src/app.module.ts`, `src/main.ts`) bắt đầu từ nội dung file chính ở commit Gốc.
- **Bản nháp tự đủ:** file nháp chỉ import file trong `D/` hoặc package. Không import tương đối tới file chính không có trong `D/` (đường dẫn sẽ gãy trong vùng nháp).
- Lệnh chạy từ `D:\Rooms\Source\backend`. Kiểm tra cho bản nháp (`npm run build`/`npm run lint` chỉ xem `src/` chính):
  - typecheck: `npx tsc --noEmit -p tsconfig.json --incremental false` → không có lỗi nào ở file thuộc `artifact_BE/2026-10-29-BE-LOGIN-01-08/` (`tsconfig.json` không có `include` nên quét cả vùng nháp). **Ngoại lệ D7** (từ khi CP-4 dùng `import.meta.main`): tsc in **đúng 1 lỗi** và đó là `artifact_BE/2026-10-29-BE-LOGIN-01-08/prisma/seed.ts(…): error TS2339: Property 'main' does not exist on type 'ImportMeta'.` (`@types/node` đang cài là 24.0.0). Lỗi này là dự kiến, không tính FAIL; mọi lỗi tsc khác vẫn là FAIL. Kiểm bằng Bash: `npx tsc --noEmit -p tsconfig.json --incremental false | grep "error TS"` → đúng 1 dòng như trên. Lỗi hết sau khi phiên chính `npm install` (mục 5).
  - lint: `npx oxlint --type-aware artifact_BE/2026-10-29-BE-LOGIN-01-08` → 0 error
  - test nháp: `npx vitest run artifact_BE/2026-10-29-BE-LOGIN-01-08`
  - toàn app: `npm run test` (gồm test nháp), `npm run lint`, `npm run build` vẫn xanh
- Tên test có mã spec hoặc mã task: `it('API-03: ...')`, `it('BE-LOGIN-06: ...')`.

## 1. Mục tiêu và phạm vi

**Trong phạm vi** (task giữ nguyên mã của feature file):

| Task | Nội dung | Spec |
|---|---|---|
| BE-LOGIN-01 | Bỏ `ObserveModule` khỏi `app.module.ts`, `instrument` khỏi `main.ts`, bỏ `@nestjs/observe` khỏi `package.json` | – |
| BE-LOGIN-02 | Chuyển `schema.prisma`, `constraints.sql`, `check-constraints.mjs` sang `prisma/` (bản sao y nguyên) | DB-01..07 |
| BE-LOGIN-03 | `.env.example`; kiểm biến bắt buộc lúc khởi động | root `CLAUDE.md` (secrets) |
| BE-LOGIN-04 | Migration đầu `prisma/migrations/20261029000000_init/` = SQL sinh từ schema + `constraints.sql`. Chỉ **tạo file**; áp vào DB do phiên chính làm sau khi duyệt | DB-07 |
| BE-LOGIN-05 | `PrismaService` + `PrismaModule` toàn cục, tắt êm (`$disconnect`) | – |
| BE-LOGIN-06 | `prisma/seed.ts` + `"prisma": { "seed": … }`; idempotent | roadmap Phase 1, G-04, AUTH-01/02/03/05/10, SVC-01, PRC-04, RATE-02, CON-03/04/10, BIL-01, BIL-09, DB-B1/B5/B6 |
| BE-LOGIN-07 | Prefix `/api/v1`, cookie parser, ValidationPipe (whitelist + forbid), không CORS | API-01 |
| BE-LOGIN-08 | Interceptor `{ data }`, filter `{ error: { code, message, fields? } }`, enum `ErrorCode` | API-02, API-03, API-04, AUTH-01, AUTH-02 |

**Ngoài phạm vi pipeline:**
- Sửa đường dẫn trong `docs/spec/02-database.md` và `CLAUDE.md` gốc (phiên chính, bản nháp `Artifacts/2026-10-29-BE-LOGIN-02-doc-paths/`).
- Xóa 3 file cũ trong `docs/database/` và các file "Xóa" ở mục 2.2 (phiên chính làm tay sau khi chủ dự án đồng ý).
- Áp migration, chạy seed, chạy kiểm DB 50/50, `npm install` (gỡ `@nestjs/observe`, cài `@types/node` 24.19.2 theo D7) (phiên chính, trên file chính, sau khi duyệt; mục 5).
- Mọi thứ từ BE-LOGIN-09 trở đi (mật khẩu, token, endpoint `/auth/*`, guard, scope, audit).
- Ánh xạ lỗi Prisma/Postgres (unique, FK, CHECK, trigger) sang mã lỗi: hoãn tới feature đầu tiên ghi các bảng đó, vì không có DB thì không test được. Phần 1 chỉ bảo đảm lỗi DB không lộ ra ngoài (rơi vào 500, mục 2.3).
- `meta` phân trang của API-02: thêm khi có endpoint danh sách đầu tiên.

## 2. Kiến trúc

### 2.1 Sơ đồ

```mermaid
flowchart LR
  subgraph Start["src/main.ts"]
    E[".env qua process.loadEnvFile"] --> V["validateEnv()"] --> N["NestFactory.create(AppModule)"] --> C["configureApp(app)"] --> S["enableShutdownHooks, listen(PORT ?? 3000)"]
  end
  subgraph Req["Mỗi request"]
    R["request"] --> G["prefix guard (D6)"] -- "/api/v1, /api/v1/..." --> K["cookieParser"] --> BP["body parser của Nest"] --> P["ValidationPipe + validationExceptionFactory"] --> H["Controller (phần 2+)"] --> I["ResponseInterceptor: { data }"]
    G -- "path khác: next(new NotFoundException())" --> X
    BP -- "lỗi http-errors 4xx: 413, 415 (D8)" --> X
    P -- "lỗi" --> X["AllExceptionsFilter: { error: { code, message, fields? } }"]
    H -- "throw" --> X
  end
  N --> M["AppModule"] --> PM["PrismaModule @Global"] --> PS["PrismaService (kết nối lười)"] --> DB[("PostgreSQL Supabase dev")]
  SP["prisma/schema.prisma"] -- "migrate diff --from-empty" --> MG["migrations/20261029000000_init/migration.sql"]
  CS["prisma/constraints.sql"] -- "nối vào cuối" --> MG
  MG -. "phiên chính: migrate deploy" .-> DB
  SD["prisma/seed.ts: seed(prisma)"] -. "phiên chính: prisma db seed x2" .-> DB
```

### 2.2 File thêm / sửa / xóa

| Đích (`Source/backend/…`) | Bản nháp | Mục đích | CP | Loại |
|---|---|---|---|---|
| `prisma/schema.prisma` | `D/prisma/schema.prisma` | Chuyển từ `docs/database/`, y nguyên | CP-1 | Thêm |
| `prisma/constraints.sql` | `D/prisma/constraints.sql` | như trên | CP-1 | Thêm |
| `prisma/check-constraints.mjs` | `D/prisma/check-constraints.mjs` | như trên | CP-1 | Thêm |
| `prisma/migrations/migration_lock.toml` | `D/prisma/migrations/migration_lock.toml` | `provider = "postgresql"` | CP-1 | Thêm |
| `prisma/migrations/20261029000000_init/migration.sql` | `D/prisma/migrations/20261029000000_init/migration.sql` | Migration đầu (DB-07) | CP-1 | Thêm |
| `package.json` | `D/package.json` | Bỏ `@nestjs/observe` (CP-2); thêm `prisma.seed`, `@types/node` `24.0.0` → `24.19.2` (CP-4, D7) | CP-2, CP-4 | Sửa |
| `.env.example` | `D/.env.example` | 8 biến, giá trị giữ chỗ | CP-2 | Thêm |
| `src/common/env.ts` | `D/src/common/env.ts` | `REQUIRED_ENV`, `validateEnv()` | CP-2 | Thêm |
| `src/common/prisma/prisma.service.ts` | `D/src/common/prisma/prisma.service.ts` | `PrismaService` | CP-2 | Thêm |
| `src/common/prisma/prisma.module.ts` | `D/src/common/prisma/prisma.module.ts` | `PrismaModule` toàn cục | CP-2 | Thêm |
| `src/app.module.ts` | `D/src/app.module.ts` | Chỉ import `PrismaModule` | CP-2 | Sửa |
| `src/main.ts` | `D/src/main.ts` | Nạp/kiểm env, `configureApp`, shutdown hooks | CP-2, CP-3 | Sửa |
| `src/common/errors/error-code.ts` | `D/src/common/errors/error-code.ts` | `ErrorCode`, `ERRORS` | CP-3 | Thêm |
| `src/common/errors/validation.ts` | `D/src/common/errors/validation.ts` | `validationExceptionFactory` | CP-3 | Thêm |
| `src/common/errors/all-exceptions.filter.ts` | `D/src/common/errors/all-exceptions.filter.ts` | Filter toàn cục (gồm nhánh http-errors 4xx, D8) | CP-3 | Thêm |
| `src/common/response.interceptor.ts` | `D/src/common/response.interceptor.ts` | Bọc `{ data }` | CP-3 | Thêm |
| `src/app.setup.ts` | `D/src/app.setup.ts` | `configureApp(app)` dùng chung cho `main.ts` và test; gồm prefix guard (D6) | CP-3 | Thêm |
| `prisma/seed.ts` | `D/prisma/seed.ts` | Seed Phase 1, run-guard `import.meta.main` | CP-4 | Thêm |
| *(tester)* `src/common/env.spec.ts`, `src/common/prisma/prisma.service.spec.ts` | `D/…` | Test CP-2 | CP-2 | Thêm |
| *(tester)* `src/app.setup.spec.ts` (+ spec đơn vị nếu cần) | `D/…` | Test CP-3 qua HTTP | CP-3 | Thêm |
| *(tester)* `test/app.e2e-spec.ts` | `D/test/app.e2e-spec.ts` | Thay e2e "Hello World" cũ | CP-3 | Sửa |
| *(tester)* `prisma/seed.spec.ts` | `D/prisma/seed.spec.ts` | Test seed với Prisma giả | CP-4 | Thêm |
| `src/app.controller.ts`, `src/app.service.ts`, `src/app.controller.spec.ts` | – | Khung "Hello World" của Nest; `app.module.ts` mới không dùng nữa | – | Xóa (phiên chính, tay) |
| `docs/database/schema.prisma`, `constraints.sql`, `check-constraints.mjs` | – | Đã chuyển sang `prisma/` | – | Xóa (phiên chính, tay) |

Vì sao xóa khung Hello World: `app.module.ts` nháp không được import `./app.controller.js` (file đó không có trong `D/`, import sẽ gãy), và route `GET /` không có trong spec. Nếu chủ dự án không đồng ý xóa, 3 file đó vẫn build và test được nhưng là code chết.

### 2.3 Hợp đồng code (coder làm đúng như sau)

**`src/common/env.ts`**
```ts
export const REQUIRED_ENV: readonly string[];          // đúng ['DATABASE_URL', 'DIRECT_URL'] (D3); phần sau tự thêm biến của nó
export function validateEnv(env?: NodeJS.ProcessEnv): void; // mặc định process.env
```
- Thiếu = `undefined`, chuỗi rỗng hoặc chỉ khoảng trắng.
- Thiếu ≥ 1 biến → `throw new Error('Thiếu biến môi trường: DATABASE_URL, DIRECT_URL (xem .env.example)')`: chỉ tên biến thiếu, theo thứ tự `REQUIRED_ENV`, ngăn bằng `, `. Không bao giờ đưa giá trị biến vào thông báo.

**`src/main.ts`** – thứ tự bắt buộc:
1. `if (existsSync('.env')) process.loadEnvFile('.env')` (Node có sẵn, không dùng `dotenv`)
2. `validateEnv()`
3. `const app = await NestFactory.create(AppModule)` (không còn `instrument`)
4. `configureApp(app)` (thêm ở CP-3)
5. `app.enableShutdownHooks()`
6. `await app.listen(process.env.PORT ?? 3000)`

**`src/common/prisma/prisma.service.ts`**
```ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  onModuleDestroy(): Promise<void>; // await this.$disconnect()
}
```
Không có `onModuleInit`/`$connect`: Prisma tự kết nối ở truy vấn đầu, nên dựng `AppModule` trong test không cần DB.

**`src/common/prisma/prisma.module.ts`**: `@Global() @Module({ providers: [PrismaService], exports: [PrismaService] }) export class PrismaModule {}`

**`src/app.module.ts`**: `@Module({ imports: [PrismaModule] }) export class AppModule {}`. Không controller, không provider, không `ObserveModule`.

**`src/app.setup.ts`**
```ts
export function configureApp(app: INestApplication): void;
```
Đăng ký đúng 6 thứ, theo thứ tự:
1. `setGlobalPrefix('api/v1')`
2. prefix guard (D6), ngay sau `setGlobalPrefix`, trước `cookieParser`:
   ```ts
   app.use((req, _res, next) =>
     req.path === '/api/v1' || req.path.startsWith('/api/v1/') ? next() : next(new NotFoundException()));
   ```
   Cho `/api/v1` và `/api/v1/...` đi tiếp; mọi path khác (vd `/`, `/t/ok`, `/api/v1x`) chuyển sang lớp exception dưới dạng `NotFoundException`, nên `AllExceptionsFilter` trả 404 `NOT_FOUND` (quy tắc 3). Lý do: ở Nest 12, `ExpressAdapter.setNotFoundHandler(handler, prefix)` chỉ gắn handler 404 dưới global prefix (`node_modules/@nestjs/platform-express/adapters/express-adapter.js:147-153`), nên path ngoài prefix rơi vào trang 404 HTML mặc định của Express; còn `setErrorHandler` luôn gắn cả ở gốc (`:135-146`), nên `next(err)` từ guard tới được filter. Kiểu tham số lấy từ `express` (`Request`, `Response`, `NextFunction`, `import type`), không thêm package.
3. `use(cookieParser())`
4. `useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, exceptionFactory: validationExceptionFactory }))`
5. `useGlobalFilters(new AllExceptionsFilter())`
6. `useGlobalInterceptors(new ResponseInterceptor())`

Không gọi `enableCors` (FE dùng proxy Vite).

**`src/common/errors/error-code.ts`**
```ts
export enum ErrorCode { /* mỗi member: giá trị = tên, vd VALIDATION_FAILED = 'VALIDATION_FAILED' */ }
export const ERRORS: Record<ErrorCode, { status: number; message: string }>;
```

| Code | HTTP | message (tiếng Việt) | Nguồn |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | Dữ liệu không hợp lệ | 01-architecture |
| `UNAUTHENTICATED` | 401 | Bạn cần đăng nhập để tiếp tục | 01-architecture |
| `PASSWORD_CHANGE_REQUIRED` | 403 | Bạn cần đổi mật khẩu trước khi tiếp tục | 01-architecture |
| `FORBIDDEN` | 403 | Bạn không có quyền thực hiện thao tác này | 01-architecture |
| `OUT_OF_SCOPE` | 403 | Dữ liệu này nằm ngoài phạm vi của bạn | 01-architecture |
| `NOT_FOUND` | 404 | Không tìm thấy dữ liệu | 01-architecture |
| `CONFLICT_STATE` | 409 | Thao tác không hợp lệ ở trạng thái hiện tại | 01-architecture |
| `TOO_MANY_REQUESTS` | 429 | Bạn thao tác quá nhiều lần, vui lòng thử lại sau | 01-architecture |
| `PHONE_TAKEN` | 409 | Số điện thoại đã được sử dụng | 01-architecture |
| `MANAGER_MAX_2_BUILDINGS` | 409 | Mỗi quản lý chỉ phụ trách tối đa 2 tòa | 01-architecture |
| `ROOM_NOT_AVAILABLE` | 409 | Phòng không còn trống | 01-architecture |
| `CONTRACT_TERM_TOO_SHORT` | 400 | Thời hạn hợp đồng tối thiểu 3 tháng | 01-architecture |
| `DEPOSIT_NOT_PAID` | 409 | Hóa đơn cọc chưa được thanh toán | 01-architecture |
| `INVOICE_NOT_UNPAID` | 409 | Hóa đơn không ở trạng thái chờ thanh toán | 01-architecture |
| `PAYMENT_AMOUNT_MISMATCH` | 409 | Số tiền thanh toán không khớp tổng hóa đơn | 01-architecture |
| `METER_VALUE_DECREASED` | 400 | Chỉ số mới nhỏ hơn chỉ số trước | 01-architecture |
| `PRICE_NOT_APPROVED` | 409 | Phòng chưa có giá được duyệt | 01-architecture |
| `RATE_PLAN_MISSING` | 409 | Chưa có đơn giá được duyệt cho kỳ này | 01-architecture |
| `PENDING_REQUEST_EXISTS` | 409 | Đã có yêu cầu đang chờ xử lý | 01-architecture |
| `WEBHOOK_SIGNATURE_INVALID` | 401 | Chữ ký webhook không hợp lệ | 01-architecture |
| `INVALID_CREDENTIALS` | 401 | Số điện thoại hoặc mật khẩu không đúng | AUTH-01 (đúng chữ) |
| `ACCOUNT_LOCKED` | 403 | Tài khoản đã bị khóa. Liên hệ quản lý. | AUTH-02 (đúng chữ) |
| `INTERNAL_ERROR` | 500 | Có lỗi xảy ra, vui lòng thử lại sau | API-04, D4 |

Câu chữ ngoài AUTH-01/02 là đề xuất `[ASSUMPTION]`; chủ dự án sửa được khi xem bản nháp. `INTERNAL_ERROR` chưa có trong bảng mã lỗi của `01-architecture.md`; phiên chính thêm vào bằng bản nháp tài liệu riêng (D4), pipeline không sửa spec.

**Quy ước throw (từ phần 2 trở đi):** dùng exception có sẵn của Nest với message = mã, vd `throw new ConflictException(ErrorCode.PHONE_TAKEN)`.

**`src/common/errors/validation.ts`**
```ts
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException;
// trả new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields })   fields: Record<string, string>
```
- Khóa của `fields` = đường dẫn thuộc tính; lỗi lồng nhau nối bằng `.` (vd `items.0.value`).
- Giá trị = message đầu tiên trong `constraints`; ràng buộc `whitelistValidation` (trường lạ) → `Trường này không được phép gửi lên`.
- Từ phần 2: mọi decorator class-validator trong DTO phải có `message` tiếng Việt.

**`src/common/errors/all-exceptions.filter.ts`**
```ts
export interface ErrorBody { error: { code: ErrorCode; message: string; fields?: Record<string, string> } }
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void;
}
```
Quy tắc, xét theo thứ tự:
1. `HttpException` có response dạng `{ code: ErrorCode, fields? }` → mã đó, `fields` đó.
2. `HttpException` có message (response là chuỗi, hoặc `response.message` là chuỗi) trùng một giá trị `ErrorCode` → mã đó.
3. `HttpException` khác → theo HTTP status: 400 `VALIDATION_FAILED` · 401 `UNAUTHENTICATED` · 403 `FORBIDDEN` · 404 `NOT_FOUND` · 409 `CONFLICT_STATE` · 429 `TOO_MANY_REQUESTS` · 4xx khác → `VALIDATION_FAILED` · 5xx → `INTERNAL_ERROR`. Gồm cả route không tồn tại dưới `/api/v1` (Nest ném `NotFoundException`), path ngoài `/api/v1` (prefix guard ném `NotFoundException`, D6) và body JSON hỏng (Nest đổi thành `BadRequestException`).
4. (D8) Không phải `HttpException`, nhưng có `expose === true` **và** `status` kiểu `number` trong khoảng 400–499 (dạng http-errors mà body-parser ném: 413 `entity.too.large` khi body JSON > 100 kB, 415 `charset.unsupported`/`encoding.unsupported`…) → mã theo bảng status ở quy tắc 3 (400/401/403/404/409/429); status 4xx khác → `VALIDATION_FAILED`. Không ghi log lỗi nội bộ, không đưa message gốc ra response. Không thêm mã 413/415: hai lỗi này trả 400 `VALIDATION_FAILED`.
5. Mọi thứ khác (Error thường, lỗi Prisma, object có `expose` khác `true`, `status` không phải số hoặc ngoài 4xx…) → `INTERNAL_ERROR`; ghi log bằng `Logger` của Nest ở server, không đưa message gốc ra response.

Chỉ ghi `Logger.error` khi mã cuối cùng là `INTERNAL_ERROR`. HTTP status trả về = cột HTTP của mã trong bảng `ERRORS` (API-04), không lấy từ loại exception. `message` luôn lấy từ `ERRORS`. Body đúng `ErrorBody`: không `statusCode`, không `stack`, không message gốc; `fields` chỉ có ở trường hợp 1.

**`src/common/response.interceptor.ts`**
```ts
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<{ data: unknown }>;
}
```
- Giá trị handler trả → `{ data: value }`; `undefined` → `{ data: null }`; giá trị falsy (`0`, `false`, `''`) giữ nguyên.
- Controller trả giá trị thô, không tự bọc `{ data }` (`Source/backend/CLAUDE.md` "return `{ data }`" hiểu là body cuối cùng do interceptor tạo).

**`prisma/seed.ts`**
```ts
export interface DevAccount {
  key: 'boss' | 'manager1' | 'manager2' | 'tenant' | 'lockedTenant';
  role: 'BOSS' | 'MANAGER' | 'TENANT';
  phone: string; fullName: string; password: string;
  mustChangePassword: boolean; isActive: boolean;
}
export const DEV_ACCOUNTS: readonly DevAccount[];          // phần 2 (e2e) và phần 5 (kiểm tay) dùng lại
export function seed(prisma: PrismaClient): Promise<void>;
```
- Đầu file: chú thích liệt kê số điện thoại + mật khẩu dev (chỉ dùng cho dev).
- Run-guard (sửa sau review, 29/10/2026): lời gọi `main()` duy nhất, ở cấp module, đúng là `if (import.meta.main) await main();`. Không so `import.meta.url` với `pathToFileURL(process.argv[1]).href`: trên Windows phép so đó có thể sai (hoa/thường ký tự ổ đĩa, junction, tên 8.3) và seed lặng lẽ không chạy. Không dùng `process.argv`/`pathToFileURL` trong `seed.ts`. Yêu cầu: test import `seed.ts` thì `main()` không chạy; `node prisma/seed.ts` chạy trực tiếp (kể cả qua đường dẫn ổ đĩa viết thường, vd `node d:/Rooms/…/prisma/seed.ts`) thì `main()` chạy. `import.meta.main` cần Node ≥ 24.2 lúc chạy; kiểu của nó cần `@types/node` ≥ 24.2 (D7). `main()` tạo `PrismaClient` bên trong nó, `finally` gọi `$disconnect()`, lỗi → in message, `process.exitCode = 1`. In một dòng tóm tắt số dòng, không in biến môi trường.
- Chạy được bằng `node prisma/seed.ts` trên Node 24 (type stripping, không `tsx`): không dùng `enum`/`namespace`/parameter properties/decorator của TS; import kiểu dùng `import type`; giá trị enum Prisma viết bằng chuỗi (`'BOSS'`, `'APPROVED'`…); không import tương đối.
- Chỉ dùng tập API Prisma này (để tester làm Prisma giả nhỏ): trên mỗi model chỉ `upsert`, `findFirst`, `create`; `ratePlan.create` kèm `tiers: { create: [...] }`; khóa ngoại truyền bằng id (`buildingId`, `roomId`…), không `connect`; không `$transaction`, `createMany`, `$executeRaw`/`$queryRaw`.
- Ngày nghiệp vụ (`@db.Date`): chỉ `new Date('YYYY-MM-DD')` (nửa đêm UTC, lưu đúng ngày). Mốc thời gian: ISO có `+07:00`.
- Mật khẩu: `argon2.hash(password, { type: argon2.argon2id })` (AUTH-03).

**`package.json`** – so với file chính, đúng 3 thay đổi, không gì khác:
1. bỏ dòng `"@nestjs/observe": "0.3.0"` (CP-2);
2. thêm khối cấp gốc `"prisma": { "seed": "node prisma/seed.ts" }`, đặt cuối file sau `devDependencies` (CP-4);
3. `devDependencies["@types/node"]`: `"24.0.0"` → `"24.19.2"`, đúng chuỗi này, không `^`/`~` (backend ghim phiên bản chính xác) (CP-4, D7).

Không thêm `tsx`, không đổi phiên bản nào khác, không sửa `package-lock.json`, không cài trong pipeline.

**`.env.example`** – đúng 8 khóa, giá trị giữ chỗ:
```
DATABASE_URL="postgresql://USER:PASSWORD@HOST:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://USER:PASSWORD@HOST:5432/postgres"
JWT_SECRET="change-me"
CCCD_KEY="change-me"
BANK_WEBHOOK_SECRET="change-me"
CLOUDINARY_URL="cloudinary://API_KEY:API_SECRET@CLOUD_NAME"
MAIL_FROM="Trọ Thông Minh <no-reply@example.com>"
APP_URL="http://localhost:5173"
```

**Migration** (CP-1)
- `D/prisma/migrations/migration_lock.toml`: 2 dòng chú thích chuẩn của Prisma + `provider = "postgresql"`.
- `D/prisma/migrations/20261029000000_init/migration.sql`: sau khi đổi CRLF→LF, nội dung đúng bằng `gen.trimEnd() + "\n\n" + constraints.trimEnd() + "\n"`, với `gen` = stdout của `$DUMMY npx prisma migrate diff --from-empty --to-schema-datamodel artifact_BE/2026-10-29-BE-LOGIN-01-08/prisma/schema.prisma --script`, `constraints` = `D/prisma/constraints.sql`.
- Không dùng `prisma migrate dev --create-only` như feature ghi (lệnh đó cần DB và shadow DB); phiên chính áp bằng `npx prisma migrate deploy`.

### 2.4 Dữ liệu seed (BE-LOGIN-06)

Giá trị nào feature/spec không cho là dữ liệu mẫu `[ASSUMPTION]`; chủ dự án sửa được khi xem bản nháp.

**Tài khoản** (email `null` hết):

| key | role | phone | fullName | password | mustChangePassword | isActive | Liên hệ |
|---|---|---|---|---|---|---|---|
| boss | BOSS | 0900000001 | Phạm Minh Đức | `Boss@2026` | false | true | contactPhone `0900000001`, zaloUrl `https://zalo.me/0900000001`, facebookUrl `https://facebook.com/tro.thong.minh` |
| manager1 | MANAGER | 0900000002 | Nguyễn Thu Hà | `QuanLy1@2026` | false | true | contactPhone `0900000002` |
| manager2 | MANAGER | 0900000003 | Lê Quang Huy | `QuanLy2@2026` | false | true | contactPhone `0900000003` |
| tenant | TENANT | 0900000004 | Nguyễn Văn An | `NguoiThue@2026` | **true** | true | – |
| lockedTenant | TENANT | 0900000005 | Trần Văn Bình | `TamKhoa@2026` | false | **false** | – |

Cột `must_change_password` mặc định `true` trong schema, nên phải ghi `false` rõ ràng cho các tài khoản khác.

**Settings** (`updatedById` = boss):
- `default_contact` = `{ phone: '0900000001', zaloUrl: 'https://zalo.me/0900000001', facebookUrl: 'https://facebook.com/tro.thong.minh' }` (trùng liên hệ của Boss, AUTH-10)
- `bank_account` = `{ bankBin: '970436', bankName: 'Vietcombank', accountNo: '0000000000', accountName: 'TRO THONG MINH' }` (giữ chỗ, khóa theo `20-reports-audit-settings.md`)

**Tòa** (tên/địa chỉ như `check-constraints.mjs`; tất cả `water_mode = PER_M3`, `due_days = 5`):

| code | name | address | district | ward | manager |
|---|---|---|---|---|---|
| CG01 | Tòa Cầu Giấy | 1 Xuân Thủy | Cầu Giấy | Dịch Vọng Hậu | manager1 |
| DD01 | Tòa Đống Đa | 2 Tây Sơn | Đống Đa | Quang Trung | manager1 |
| HM01 | Tòa Hoàng Mai | 3 Giải Phóng | Hoàng Mai | Giáp Bát | null |

**Phòng** (mỗi phòng có giá có đúng 1 `room_prices` APPROVED: `effective_from` 2026-09-01, `proposedById` = `reviewedById` = boss, `reviewedAt` = lúc seed (PRC-04); `rooms.price` = giá đó):

| Tòa | code | floor | area_m2 | price | max_occupants | Ghi chú |
|---|---|---|---|---|---|---|
| CG01 | 203 | 2 | 24 | 2.500.000 | 2 | hợp đồng ACTIVE |
| CG01 | 204 | 2 | 22 | 2.400.000 | 2 | trống, có giá |
| CG01 | 301 | 3 | 20 | null | 2 | chưa có giá, không có dòng `room_prices` (CON-02) |
| DD01 | 101 | 1 | 20 | 2.200.000 | 2 | trống |
| DD01 | 102 | 1 | 22 | 2.300.000 | 2 | trống |
| HM01 | 101 | 1 | 18 | 2.000.000 | 2 | trống |
| HM01 | 201 | 2 | 25 | 2.600.000 | 3 | trống |

**Dịch vụ** mỗi tòa (SVC-01): `Wifi` ROOM · `Rác` PERSON · `Gửi xe máy` VEHICLE · `Gửi xe điện` VEHICLE.

**Bảng giá** mỗi tòa: APPROVED, `effective_from` 2026-09-01, `proposedById` = `reviewedById` = boss, `reviewedAt` = lúc seed:
- ELECTRIC: tier 1 `upTo` 50 → 3.000 · tier 2 `upTo` 100 → 3.500 · tier 3 `upTo` null → 4.000
- WATER: tier 1 `upTo` null → 15.000
- SERVICE Wifi 100.000 · Rác 30.000 · Gửi xe máy 100.000, mỗi cái 1 tier `upTo` null (RATE-02)
- Gửi xe điện: **không có bảng giá** (câu hỏi sẵn có trong feature, giữ nguyên)

**Hợp đồng** `HD000001` (BIL-01, BIL-09): tòa CG01, phòng 203, tenant, `startDate` 2026-09-15, `termMonths` 6, `endDate` 2027-03-14, `billingDay` 15, `rent` 2.500.000 (= `rooms.price`, DB-B1), `deposit` 0 (CON-10: không cần hóa đơn cọc), `status` ACTIVE, `signedAt` 2026-09-14T10:00:00+07:00, `movedInAt` 2026-09-15T09:00:00+07:00, `createdById` manager1. Ngày tháng lấy nguyên từ BIL-01, không tính trong seed.
- Occupants: người ký = tenant (`fullName` Nguyễn Văn An, `phone` 0900000004, `isSigner` true, `moveInDate` 2026-09-15, các cột CCCD null, CON-04); người thứ hai `Trần Thị Mai` (`phone` null, `isSigner` false, `moveInDate` 2026-09-15).
- Contract services: Wifi và Rác của CG01.
- Xe: `plate` `29B112345`, `type` MOTORBIKE, dịch vụ "Gửi xe máy" của CG01, `registeredAt` 2026-09-15, đang hoạt động.
- Chỉ số đầu ngày 2026-09-15, phòng 203, `contractId` = HD000001, `readById` manager1: ELECTRIC 1284, WATER 52.

**Khóa idempotent** (chạy lần 2 không tạo thêm dòng):

| Bảng | Cách |
|---|---|
| users | `upsert` where `phone`; `update` chỉ gồm đúng 3 cột `passwordHash` (hash mới), `mustChangePassword`, `isActive` theo `DEV_ACCOUNTS` (D5) |
| settings | `upsert` where `key`, `update: {}` |
| buildings | `upsert` where `code`, `update: {}` |
| rooms | `upsert` where `buildingId_code`, `update: {}` |
| room_prices | `findFirst` { roomId, status APPROVED, effectiveFrom } → `create` nếu chưa có |
| services | `upsert` where `buildingId_name`, `update: {}` |
| rate_plans (+ tiers) | `findFirst` { buildingId, kind, serviceId (null cho ELECTRIC/WATER), status APPROVED, effectiveFrom } → `create` kèm tiers nếu chưa có |
| contracts | `upsert` where `code`, `update: {}` |
| contract_services | `upsert` where `contractId_serviceId`, `update: {}` |
| occupants | `findFirst` { contractId, fullName } → `create` nếu chưa có |
| vehicles | `findFirst` { plate, isActive: true } → `create` nếu chưa có |
| meter_readings | `upsert` where `roomId_kind_readOn`, `update: {}` |

Số dòng sau mỗi lần chạy: users 5 · settings 2 · buildings 3 · rooms 7 · room_prices 6 · services 12 · rate_plans 15 · rate_tiers 21 · contracts 1 · contract_services 2 · occupants 2 · vehicles 1 · meter_readings 2.

## 3. Câu hỏi bỏ ngỏ và quyết định

**Câu hỏi bỏ ngỏ chặn checkpoint:** không còn.

- **Sẵn có, giữ nguyên** (không chặn): giá seed của "Gửi xe điện". Chưa có câu trả lời thì seed dịch vụ này không có bảng giá.

**Quyết định của chủ dự án (29/10/2026)** – coder và tester làm đúng như sau, không hỏi lại:

| # | Câu hỏi cũ | Quyết định | Áp ở |
|---|---|---|---|
| D1 | `prisma generate` trong pipeline | Được chạy với `$DUMMY`, đúng lệnh ở mục 0; chỉ ghi `node_modules/.prisma/client`, không DB. Nhờ đó test dựng được `PrismaService` thật (không kết nối), e2e chạy trong pipeline, `seed.ts` được kiểm kiểu thật. | CP-2, CP-3, CP-4 |
| D2 | Cách tạo `migration.sql` | Ngoại lệ một lần cho luật "không ghi file bằng shell": coder chạy `prisma migrate diff … -o` với đích **chỉ trong `D/`** (lệnh đầy đủ ở CP-1), rồi nối `constraints.sql` vào cuối bằng Edit/Write. Không lệnh shell nào khác được ghi file. | CP-1 |
| D3 | Biến bắt buộc khi khởi động | Chỉ `DATABASE_URL`, `DIRECT_URL`. Các phần sau tự thêm biến của mình (phần 2 thêm `JWT_SECRET`). `.env.example` vẫn liệt kê đủ 8 biến. | CP-2 |
| D4 | Mã lỗi cho 500 | `INTERNAL_ERROR`, HTTP 500, message "Có lỗi xảy ra, vui lòng thử lại sau", không lộ chi tiết nội bộ. Phiên chính thêm mã này vào bảng mã lỗi của spec bằng bản nháp riêng; pipeline không sửa spec. | CP-3 |
| D5 | Chạy lại seed | Chỉ 5 tài khoản dev được đặt lại: `passwordHash` (theo mật khẩu trong `DEV_ACCOUNTS`), `mustChangePassword`, `isActive`. Mọi dòng seed khác đã có thì để nguyên (`update: {}` / `findFirst` rồi bỏ qua). | CP-4 |
| D6 | Path ngoài `/api/v1` nhận trang 404 HTML của Express (lộ ra khi test CP-3, trái API-03) | Phương án A: mọi path ngoài `/api/v1` trả 404 với body API-03 `{ error: { code: 'NOT_FOUND', message } }`. Cách làm: `configureApp` đăng ký thứ sáu là prefix guard ngay sau `setGlobalPrefix` (mục 2.3). Kịch bản CP-3 cũ "không có prefix → 404 NOT_FOUND" giữ nguyên; test `GET /` trong `test/app.e2e-spec.ts` thuộc quyết định này. | CP-3 |
| D7 | Q7: `@types/node` 24.0.0 không có kiểu `ImportMeta.main` (thêm ở 24.2.0), nên tsc báo lỗi ở `seed.ts` | Phương án A: giữ `import.meta.main` trong `seed.ts`; trong `D/package.json` đổi `@types/node` thành đúng `24.19.2`. Pipeline không cài; phiên chính `npm install` trên file chính sau khi duyệt rồi chạy lại tsc (mục 5). Tới lúc đó tester chấp nhận đúng 1 lỗi tsc `TS2339 … Property 'main' does not exist on type 'ImportMeta'` ở `prisma/seed.ts` và kiểm đó là lỗi tsc duy nhất (mục 0). | CP-4 (và Done when 3 của CP-2) |
| D8 | Q8: lỗi body-parser không phải SyntaxError (JSON > 100 kB → 413, charset sai → 415) đang thành 500 `INTERNAL_ERROR` | Phương án A: filter thêm nhánh: lỗi có `expose === true` và `status` số 4xx (dạng http-errors / body-parser) → bảng status → mã, không có trong bảng → `VALIDATION_FAILED`; không log như lỗi nội bộ. 413 và 415 vì thế trả 400 `VALIDATION_FAILED` dạng API-03 (không message gốc, không `INTERNAL_ERROR`, không log lỗi); giữ như vậy, không thêm mã 413/415. Mọi lỗi không có `expose === true` và `status` 4xx vẫn là 500 `INTERNAL_ERROR` (quy tắc 4, 5 ở mục 2.3). | CP-3 |

**Sửa sau review do chủ dự án yêu cầu (29/10/2026)**, không phải câu hỏi: run-guard của `seed.ts` dùng `import.meta.main` (mục 2.3 `prisma/seed.ts`, CP-4); nhánh filter của D8.

Ghi chú D5: chủ dự án chỉ nêu 3 cột trên, nên `role`, `fullName`, `email`, liên hệ của tài khoản dev **không** bị đặt lại khi chạy lại seed (đề xuất cũ có thêm `role`, `fullName`; làm theo câu trả lời).

**`[ASSUMPTION]` và quyết định của kế hoạch** (không phải A-01..A-07 của spec; phần 1 không dùng giả định nào của spec):
1. Câu chữ tiếng Việt của các mã lỗi ngoài AUTH-01/02, của `fields` cho trường lạ và của thông báo thiếu biến môi trường.
2. Dữ liệu mẫu ở mục 2.4: tên, địa chỉ, giá các phòng khác 203, số điện thoại, mật khẩu dev, biển số, chỉ số nước 52, liên hệ Zalo/Facebook và `bank_account` giữ chỗ, liên hệ của quản lý = số đăng nhập, `createdById` = manager1, giờ ký/vào ở.
3. Mã hợp đồng cố định `HD000001`, khớp CON-03 (`HD` + id) khi DB mới tạo (id = 1). Seed không ép điều này.
4. Seed ghi `room_prices`/`rate_plans` có `effective_from` trong quá khứ (01/09/2026) như feature yêu cầu. PRC-01/RATE-05 chỉ áp cho API.
5. `PrismaService` kết nối lười (không `$connect` lúc khởi động).
6. Xóa khung "Hello World" (mục 2.2); hoãn ánh xạ lỗi Prisma và `meta` phân trang (mục 1).
7. Dùng `migrate diff` + `migrate deploy` thay cho `migrate dev --create-only` (ràng buộc của chủ dự án: pipeline không chạm DB).

## 4. Checkpoints

### CP-1 · Chuyển schema và tạo migration đầu (BE-LOGIN-02, BE-LOGIN-04 phần file)

- **File:** `D/prisma/schema.prisma`, `D/prisma/constraints.sql`, `D/prisma/check-constraints.mjs` (3 bản sao y nguyên từ `docs/database/`), `D/prisma/migrations/migration_lock.toml`, `D/prisma/migrations/20261029000000_init/migration.sql`.
- **Cách tạo `migration.sql` (D2), từ `Source/backend`:**
  1. `$DUMMY npx prisma migrate diff --from-empty --to-schema-datamodel artifact_BE/2026-10-29-BE-LOGIN-01-08/prisma/schema.prisma --script -o artifact_BE/2026-10-29-BE-LOGIN-01-08/prisma/migrations/20261029000000_init/migration.sql` (lệnh shell ghi file duy nhất được phép; đích phải đúng đường dẫn trong `D/` này).
  2. Đọc `D/prisma/constraints.sql`, nối vào cuối `migration.sql` bằng Edit/Write, theo đúng dạng `gen.trimEnd() + "\n\n" + constraints.trimEnd() + "\n"` ở mục 2.3.
  3. `migration_lock.toml` viết bằng Write.
- **Done when** (từ `Source/backend`):
  1. `$DUMMY npx prisma validate --schema artifact_BE/2026-10-29-BE-LOGIN-01-08/prisma/schema.prisma` → "… is valid".
  2. Với từng `f` trong `schema.prisma`, `constraints.sql`, `check-constraints.mjs`: `git diff --no-index --ignore-cr-at-eol --exit-code ../../docs/database/<f> artifact_BE/2026-10-29-BE-LOGIN-01-08/prisma/<f>` → không in gì, exit 0.
  3. So khớp migration → in `MATCH`:
     `$DUMMY npx prisma migrate diff --from-empty --to-schema-datamodel artifact_BE/2026-10-29-BE-LOGIN-01-08/prisma/schema.prisma --script | node -e "const fs=require('fs');const n=s=>s.replace(/\r\n/g,'\n');const d='artifact_BE/2026-10-29-BE-LOGIN-01-08/prisma/';const gen=n(fs.readFileSync(0,'utf8'));const mig=n(fs.readFileSync(d+'migrations/20261029000000_init/migration.sql','utf8'));const con=n(fs.readFileSync(d+'constraints.sql','utf8'));console.log(mig===gen.trimEnd()+'\n\n'+con.trimEnd()+'\n'?'MATCH':'DIFF')"`
     (Nếu Prisma in thêm dòng thông tin không phải SQL ra stdout, như `Environment variables loaded…`, bỏ các dòng đó khỏi `gen` trước khi so.)
- **Kịch bản test** (CP này kiểm bằng lệnh, không cần file `*.spec.ts`):
  - DB-07: `migration.sql` = SQL sinh từ schema + `constraints.sql` → `MATCH`. Thử cho rớt: đổi `con` thành `schema.prisma` trong lệnh → `DIFF`.
  - DB-07: `migration.sql` chứa `users_one_boss`, `MANAGER_MAX_2_BUILDINGS`, `CREATE TRIGGER payments_invoice_check`, và đúng 3 dòng `CREATE TRIGGER`.
  - BE-LOGIN-02: 3 file y hệt bản gốc (bước 2). Schema vẫn có 26 dòng `^model ` và 20 dòng `^enum ` (02-database: 26 models, 20 enums).
  - BE-LOGIN-04: tên thư mục khớp `^\d{14}_init$`; `migration_lock.toml` có `provider = "postgresql"`.
  - Không chạm DB: mọi lệnh Prisma có `$DUMMY`; không có lệnh migrate deploy/dev/db nào.
  - D2: ngoài `migrate diff -o`, không file nào trong `D/` được tạo bằng lệnh shell; `git status --porcelain` cho thấy file mới chỉ nằm trong `artifact_BE/2026-10-29-BE-LOGIN-01-08/`.
  - Kiểm DB 50/50 (`check-constraints.mjs`) **không** chạy trong pipeline: cần `@electric-sql/pglite`, không có trong danh sách gói phần 0. Schema và `constraints.sql` không đổi nên kết quả không đổi; phiên chính chạy sau khi duyệt (P1-QA-02).

### CP-2 · Bỏ Observe, kiểm env, PrismaService (BE-LOGIN-01, BE-LOGIN-03, BE-LOGIN-05)

- **File:** `D/package.json` (bản chính bỏ đúng dòng `@nestjs/observe`), `D/.env.example`, `D/src/common/env.ts`, `D/src/common/prisma/prisma.service.ts`, `D/src/common/prisma/prisma.module.ts`, `D/src/app.module.ts`, `D/src/main.ts` (bước 1–3, 5, 6 của mục 2.3).
- **Trước khi code (D1):** chạy lệnh `prisma generate` ở mục 0.
- **Test (tester):** `D/src/common/env.spec.ts`, `D/src/common/prisma/prisma.service.spec.ts`.
- **Done when:**
  1. `npx vitest run artifact_BE/2026-10-29-BE-LOGIN-01-08` → tất cả pass.
  2. Typecheck và lint bản nháp sạch (mục 0; khi đã có CP-4 thì tsc theo ngoại lệ D7); `npm run test`, `npm run lint`, `npm run build` pass.
  3. `D/package.json` khớp hợp đồng `package.json` ở mục 2.3 (3 thay đổi; phần của CP-2 là dòng `-    "@nestjs/observe": "0.3.0",`). Lệnh kiểm chung với CP-4 Done when 5: lệnh `MATCH` ở đó in `MATCH`, và `git diff --no-index package.json artifact_BE/2026-10-29-BE-LOGIN-01-08/package.json` chỉ có: dòng `@nestjs/observe` bị bỏ, `@types/node` `24.0.0` → `24.19.2`, khối `prisma.seed` thêm vào. Chạy lại CP-2 trước khi có CP-4 thì chỉ dòng `@nestjs/observe`.
  4. Grep `@nestjs/observe|ObserveModule|ObserveInstrument|YOUR_APP_KEY` trong `D/src` → không có kết quả.
- **Kịch bản test:**
  - BE-LOGIN-03 (D3): `REQUIRED_ENV` deep-equal `['DATABASE_URL', 'DIRECT_URL']`.
  - BE-LOGIN-03: `validateEnv({})` throw, message đúng bằng `Thiếu biến môi trường: DATABASE_URL, DIRECT_URL (xem .env.example)`.
  - BE-LOGIN-03 (D3): có `DATABASE_URL`, `DIRECT_URL`, thiếu `JWT_SECRET` và 5 biến còn lại → không throw.
  - BE-LOGIN-03: chỉ thiếu `DATABASE_URL` → message có `DATABASE_URL`, không có `DIRECT_URL`.
  - BE-LOGIN-03 biên: giá trị `''` và `'   '` tính là thiếu.
  - BE-LOGIN-03: đủ biến (thêm biến lạ cũng được) → không throw.
  - BE-LOGIN-03 bảo mật: `DIRECT_URL='postgresql://user:SECRET123@h/db'` và thiếu `DATABASE_URL` → message không chứa `SECRET123`.
  - BE-LOGIN-03: đọc `D/.env.example` bằng `util.parseEnv` → đúng 8 khóa của feature; không giá trị nào chứa `supabase`/`pooler`; `DATABASE_URL` chứa `USER:PASSWORD`.
  - BE-LOGIN-05: `onModuleDestroy()` gọi `$disconnect` đúng 1 lần và chờ nó xong. Dựng `new PrismaService()` thật (client đã generate theo D1, chạy với `$DUMMY`, không kết nối), chỉ giả `$disconnect` (cạnh DB) bằng `vi.spyOn`.
  - BE-LOGIN-05: `PrismaModule` là global (`Reflect.getMetadata('__module:global__', PrismaModule) === true`) và export `PrismaService`; `PrismaService.prototype.onModuleInit` không tồn tại (kết nối lười).
  - BE-LOGIN-05 tắt êm: `D/src/main.ts` có `enableShutdownHooks()` (grep).
  - BE-LOGIN-01: Done when bước 3 và 4.

### CP-3 · Khung API và định dạng lỗi (BE-LOGIN-07, BE-LOGIN-08)

- **File:** `D/src/common/errors/error-code.ts`, `D/src/common/errors/validation.ts`, `D/src/common/errors/all-exceptions.filter.ts` (quy tắc 1–5 ở mục 2.3, gồm nhánh D8), `D/src/common/response.interceptor.ts`, `D/src/app.setup.ts` (6 đăng ký, gồm prefix guard D6), `D/src/main.ts` (thêm bước 4).
- **Test (tester):** `D/src/app.setup.spec.ts`: dựng app với một controller + DTO chỉ có trong test (`Test.createTestingModule({ controllers: [...] })` → `createNestApplication()` → `configureApp(app)` → `init()`), gọi bằng `supertest`, không `AppModule`, không Prisma. Thêm spec đơn vị cho filter/interceptor nếu cần. `D/test/app.e2e-spec.ts` thay file cũ: `AppModule` + `configureApp`, có test `GET /` → 404 `NOT_FOUND` (D6).
- **Lượt chạy của tester bắt buộc gồm**, ngoài test nháp (Done when 1, 2): `npm run test`, `npm run lint`, `npm run build` (từ `Source/backend`). Thiếu một lệnh thì chưa được báo PASS.
- **Done when:**
  1. `npx vitest run artifact_BE/2026-10-29-BE-LOGIN-01-08` pass, trong đó có test `API-03: ConflictException(ErrorCode.PHONE_TAKEN) renders the error body with 409`, `API-03: validation failure renders VALIDATION_FAILED with fields` (Done when của BE-LOGIN-08), test path ngoài prefix của D6 và các test 413/415 của D8.
  2. (D1) `$DUMMY npx vitest run --config ./vitest.config.e2e.ts artifact_BE/2026-10-29-BE-LOGIN-01-08` pass (luôn kèm đường dẫn nháp, mục 0), trong đó có `GET /` → 404 body `{ error: { code: 'NOT_FOUND', message: 'Không tìm thấy dữ liệu' } }`.
  3. Typecheck và lint bản nháp sạch (mục 0; tsc theo ngoại lệ D7 vì `seed.ts` của CP-4 đã có trong `D/`).
  4. `npm run test`, `npm run lint`, `npm run build` pass.
- **Kịch bản test** (giá trị mong đợi lấy từ bảng `ERRORS` ở mục 2.3 = spec):
  - API-01: `GET /api/v1/<route test>` → 200; cùng route nhưng không có prefix → 404, body `{ error: { code: 'NOT_FOUND', message: 'Không tìm thấy dữ liệu' } }` (không có chữ `Cannot GET`).
  - API-01/API-03 + D6 (prefix guard): `GET /`, `GET /t/ok`, `POST /t/ok`, `GET /api/v1x`, `GET /api` → mỗi cái 404, `Content-Type` JSON, body deep-equal `{ error: { code: 'NOT_FOUND', message: 'Không tìm thấy dữ liệu' } }`, không có `<html`/`Cannot GET`/`Cannot POST`. `GET /api/v1` và `GET /api/v1/khong-co` (qua guard, Nest không có route) → cùng body 404 đó. Guard không chặn route thật: `GET /api/v1/<route test>` → 200 (dòng trên), route test có query string (`?a=1`) → 200.
  - API-02: handler trả object → body đúng bằng `{ data: <object> }` (không có khóa cấp gốc nào khác); trả mảng → `{ data: [...] }`; trả `0`, `false`, `''` → giữ nguyên trong `data`; trả `undefined` → `{ data: null }`.
  - API-03/04 (BE-LOGIN-08): `throw new ConflictException(ErrorCode.PHONE_TAKEN)` → 409, body deep-equal `{ error: { code: 'PHONE_TAKEN', message: 'Số điện thoại đã được sử dụng' } }`: không `fields`, không `statusCode`, không `stack`.
  - API-03 (BE-LOGIN-08): DTO test có `phone` với `@Matches(/^0[0-9]{9}$/, { message: 'Số điện thoại không hợp lệ' })`; POST `{}` → 400, body `{ error: { code: 'VALIDATION_FAILED', message: 'Dữ liệu không hợp lệ', fields: { phone: 'Số điện thoại không hợp lệ' } } }`.
  - G-04 biên trên DTO đó: `0912345678` → 200; `091234567` (9 số), `09123456789` (11 số), `1912345678` → 400, có `fields.phone`.
  - BE-LOGIN-07 whitelist + forbid: `{ phone: '0912345678', role: 'BOSS' }` → 400, `fields.role` = `Trường này không được phép gửi lên`, handler không chạy. Body hợp lệ → handler nhận đúng các khóa của DTO.
  - API-03 lồng nhau: DTO có object lồng (`@ValidateNested` + `@Type`) sai ở trường con → khóa `fields` dạng `<cha>.<con>`.
  - API-03/04: body JSON hỏng (`{"phone":` với `Content-Type: application/json`) → 400 `VALIDATION_FAILED`, body không chứa chữ gốc của SyntaxError.
  - API-04 theo status: `UnauthorizedException()` → 401 `UNAUTHENTICATED`; `ForbiddenException()` → 403 `FORBIDDEN`; `NotFoundException('x')` → 404 `NOT_FOUND`; `new HttpException('x', 409)` → 409 `CONFLICT_STATE`; `new HttpException('x', 429)` → 429 `TOO_MANY_REQUESTS`; `new HttpException('x', 413)` → 400 `VALIDATION_FAILED`.
  - API-04 status theo mã: `new BadRequestException(ErrorCode.PHONE_TAKEN)` → 409.
  - API-04 lỗi bất ngờ (D4): `throw new Error('password=SECRET123')` → 500, body deep-equal `{ error: { code: 'INTERNAL_ERROR', message: 'Có lỗi xảy ra, vui lòng thử lại sau' } }`, response không chứa `SECRET123`, không `stack`.
  - API-04 (D4): `new HttpException('x', 503)` → 500 `INTERNAL_ERROR` (status lấy từ `ERRORS`, không giữ 503).
  - "Không log như lỗi nội bộ" kiểm bằng `vi.spyOn(Logger.prototype, 'error')` (logger của filter là instance `Logger` của Nest): không được gọi. "Log" = được gọi đúng 1 lần.
  - API-03/04 + D8, body quá lớn qua app thật (`configureApp`, route POST của DTO test): body JSON hợp lệ > 100 kB (vd `{ phone: '0912345678', pad: 'a'.repeat(110_000) }`, `Content-Type: application/json`) → 400, body deep-equal `{ error: { code: 'VALIDATION_FAILED', message: 'Dữ liệu không hợp lệ' } }` (không `fields`), response không chứa `too large`/`entity.too.large`/`INTERNAL_ERROR`, handler không chạy, `Logger.error` không được gọi.
  - D8 biên giới hạn: cùng body nhưng tổng ~ 100 000 byte (< 102 400 = 100 kB của body-parser) → qua được body-parser, tới ValidationPipe → 400 có `fields.pad` = `Trường này không được phép gửi lên` (chứng tỏ giới hạn là 100 kB và 413 không bắt nhầm body nhỏ hơn).
  - API-03/04 + D8, charset sai qua app thật: POST `{"phone":"0912345678"}` với `Content-Type: application/json; charset=latin1` (body-parser ném 415 `charset.unsupported`) → 400, body deep-equal `{ error: { code: 'VALIDATION_FAILED', message: 'Dữ liệu không hợp lệ' } }`, response không chứa `unsupported charset`/`INTERNAL_ERROR`, `Logger.error` không được gọi. Thêm nếu dễ: `Content-Encoding: foo` (415 `encoding.unsupported`) → cùng kết quả.
  - D8 bảng status (route test ném lỗi trong app thật, hoặc spec đơn vị của filter với host giả): `Object.assign(new Error('raw-413'), { status: 413, expose: true })` → 400 `VALIDATION_FAILED`, response không chứa `raw-413`, không log; `{ status: 401, expose: true }` → 401 `UNAUTHENTICATED`; `{ status: 404, expose: true }` → 404 `NOT_FOUND`; biên `{ status: 400, expose: true }` và `{ status: 499, expose: true }` → 400 `VALIDATION_FAILED`.
  - D8 vẫn là 500: mỗi lỗi sau (là `Error` có message `raw-x`) → 500, body deep-equal `{ error: { code: 'INTERNAL_ERROR', message: 'Có lỗi xảy ra, vui lòng thử lại sau' } }`, không chứa `raw-x`, `Logger.error` được gọi: `{ status: 500, expose: true }`, `{ status: 503, expose: true }` (giống 5xx), `{ status: 399, expose: true }`, `{ status: 413, expose: false }`, `{ status: 413 }` (không `expose`), `{ status: '413', expose: true }` (status là chuỗi), `{ statusCode: 413, expose: true }` (không có `status`).
  - AUTH-01: `ERRORS.INVALID_CREDENTIALS` = `{ status: 401, message: 'Số điện thoại hoặc mật khẩu không đúng' }`. AUTH-02: `ERRORS.ACCOUNT_LOCKED` = `{ status: 403, message: 'Tài khoản đã bị khóa. Liên hệ quản lý.' }`.
  - 01-architecture#error-codes: `ErrorCode` có đúng 23 mã: 20 mã của bảng + `INVALID_CREDENTIALS` + `ACCOUNT_LOCKED` + `INTERNAL_ERROR` (D4); status từng mã = bảng; mọi message khác rỗng và khác tên mã.
  - BE-LOGIN-07 CORS tắt: GET có header `Origin: http://evil.example` → không có `access-control-allow-origin`; `OPTIONS` preflight → không có header `access-control-allow-*`.
  - BE-LOGIN-07 cookie: handler trả `req.cookies.rt`, gửi `Cookie: rt=abc` → `{ data: 'abc' }`.
  - e2e: `AppModule` + `configureApp` khởi động không cần DB; `GET /api/v1/khong-co` → 404 `NOT_FOUND`; `GET /` → 404, body deep-equal `{ error: { code: 'NOT_FOUND', message: 'Không tìm thấy dữ liệu' } }` (D6; thay "Hello World" cũ); `app.close()` xong không lỗi (shutdown hook, `$disconnect` khi chưa từng kết nối).

### CP-4 · Seed Phase 1 (BE-LOGIN-06)

- **File:** `D/prisma/seed.ts` (run-guard `if (import.meta.main) await main();`), `D/package.json` (thêm khối `prisma.seed`; `@types/node` → `24.19.2`, D7).
- **Test (tester):** `D/prisma/seed.spec.ts` với `PrismaClient` giả trong bộ nhớ (chỉ giả cạnh DB). Prisma giả hỗ trợ đúng tập API ở mục 2.3, và **throw khi trùng** các khóa unique (`phone`, `code`, `key`, `buildingId_code`, `buildingId_name`, `contractId_serviceId`, `roomId_kind_readOn`) cùng các partial unique seed có thể đụng (1 BOSS, 1 plan APPROVED mỗi (tòa, kind, service, effective_from), 1 biển số đang hoạt động, 1 người ký mỗi hợp đồng). Như vậy seed không idempotent thì lần chạy 2 sẽ rớt.
- **Done when:**
  1. `npx vitest run artifact_BE/2026-10-29-BE-LOGIN-01-08` pass, trong đó có `BE-LOGIN-06: seed runs twice without errors and creates no extra rows`.
  2. `$DUMMY node --input-type=module -e "await import('./artifact_BE/2026-10-29-BE-LOGIN-01-08/prisma/seed.ts')"` → exit 0, không in gì. Chứng tỏ Node 24 nạp được `seed.ts` không cần `tsx` và `main()` không chạy khi bị import.
  3. Run-guard khi chạy trực tiếp (ngoại lệ `$NODB` ở mục 0; trước đó `node -v` → ≥ `v24.2.0`, thấp hơn thì báo FAIL vì `import.meta.main` sẽ là `undefined`). Từ `Source/backend`, mỗi lệnh sau → exit code 1, output có `127.0.0.1` trong thông báo lỗi kết nối của Prisma (vd `Can't reach database server at …`; nghĩa là `main()` đã chạy và đi tới truy vấn đầu), **không** có `Seed xong`:
     - `$NODB node artifact_BE/2026-10-29-BE-LOGIN-01-08/prisma/seed.ts`
     - `$NODB node d:/Rooms/Source/backend/artifact_BE/2026-10-29-BE-LOGIN-01-08/prisma/seed.ts` (ổ đĩa viết thường, ca đã làm guard cũ lặng lẽ bỏ qua)
     Exit 0 mà không in gì = guard bỏ qua seed → FAIL.
  4. Typecheck với kiểu Prisma thật (client đã generate theo D1; nếu còn `PrismaClient: any` thì chạy lại lệnh generate ở mục 0 trước): theo ngoại lệ D7 ở mục 0, tsc in đúng 1 lỗi `TS2339 … Property 'main' does not exist on type 'ImportMeta'` tại `artifact_BE/2026-10-29-BE-LOGIN-01-08/prisma/seed.ts`, không lỗi nào khác. Lint bản nháp 0 error; `npm run test` pass. Grep `D/prisma/seed.ts`: có `if (import.meta.main) await main();`, không có `pathToFileURL`, không có `process.argv`.
  5. `package.json` đúng 3 thay đổi của mục 2.3 (D7), từ `Source/backend`:
     - `node -e "const fs=require('fs');const r=p=>JSON.parse(fs.readFileSync(p,'utf8'));const a=r('package.json'),b=r('artifact_BE/2026-10-29-BE-LOGIN-01-08/package.json');delete a.dependencies['@nestjs/observe'];a.devDependencies['@types/node']='24.19.2';a.prisma={seed:'node prisma/seed.ts'};console.log(JSON.stringify(a)===JSON.stringify(b)?'MATCH':'DIFF')"` → `MATCH`.
     - `git diff --no-index package.json artifact_BE/2026-10-29-BE-LOGIN-01-08/package.json` → chỉ: dòng `-    "@nestjs/observe": "0.3.0",` bị bỏ; `-    "@types/node": "24.0.0",` / `+    "@types/node": "24.19.2",`; khối `"prisma": { "seed": "node prisma/seed.ts" }` thêm vào cuối (kèm dấu `,` sau `}` của `devDependencies`). Không có `tsx`, không có `^`/`~`.
  6. Chạy seed thật 2 lần trên DB dev: phiên chính, sau khi duyệt (mục 5).
- **Kịch bản test** (giá trị mong đợi theo mục 2.4 = feature + spec):
  - BE-LOGIN-06 run-guard (sửa sau review): trong vitest, `vi.spyOn` `console.log` và `console.error`, rồi `import()` động `seed.ts` (sau `vi.resetModules()`) → không lời gọi nào, không có `Seed xong`, không lỗi kết nối: `main()` không chạy khi bị import. Chạy trực tiếp (kể cả ổ đĩa viết thường) → `main()` chạy: Done when 3.
  - BE-LOGIN-06 idempotent: chạy `seed(fake)` 2 lần → không lỗi; số dòng mỗi bảng sau lần 2 = sau lần 1 = mục 2.4.
  - BE-LOGIN-06 + D5 (đặt lại tài khoản): sau lần 1, trong Prisma giả sửa tenant `0900000004` thành `mustChangePassword` false và `passwordHash` = `'x'`, sửa `0900000005` thành `isActive` true; chạy lại → tenant về `mustChangePassword` true và `argon2.verify(passwordHash, 'NguoiThue@2026')` đúng; `0900000005` về `isActive` false; số dòng users vẫn 5.
  - BE-LOGIN-06 + D5 (giữ nguyên phần khác): sau lần 1 sửa `name` của tòa CG01, `price` của một dòng `room_prices`, `fullName` của manager1; chạy lại → cả ba giữ giá trị đã sửa, không có dòng mới. Lời gọi `user.upsert` có `update` chỉ gồm đúng 3 khóa `passwordHash`, `mustChangePassword`, `isActive`.
  - Tài khoản (G-04, AUTH-03): đúng 1 BOSS, 2 MANAGER, 2 TENANT; mọi `phone` khớp `^0[0-9]{9}$` và không trùng; `passwordHash` bắt đầu `$argon2id$` và `argon2.verify` đúng với mật khẩu trong `DEV_ACCOUNTS`; không cột nào chứa mật khẩu thô; mọi mật khẩu dev ≥ 8 ký tự.
  - AUTH-05: tenant `0900000004` có `mustChangePassword` true, `isActive` true. AUTH-02: `0900000005` có `isActive` false. AUTH-01: Boss và 2 quản lý có `mustChangePassword` false, `isActive` true.
  - AUTH-10: `settings.default_contact` có đúng 3 khóa `phone`, `zaloUrl`, `facebookUrl`, và bằng `contactPhone`/`zaloUrl`/`facebookUrl` của Boss. `bank_account` có đúng 4 khóa `bankBin`, `bankName`, `accountNo`, `accountName`.
  - D-18/BLD-03: CG01 và DD01 → manager1, HM01 → null; manager1 có ≤ 2 tòa, manager2 có 0 tòa; quản lý của tòa là MANAGER đang hoạt động. Code tòa khớp `^[A-Z0-9]{2,6}$`; `waterMode` PER_M3; `dueDays` 5.
  - ROOM-05 / CON-02: mỗi tòa 2–3 phòng; mỗi tòa có ≥ 1 phòng có giá và không có hợp đồng HOLD/ACTIVE; CG01 có đúng 1 phòng `price` null và phòng đó không có dòng `room_prices`.
  - PRC-04: mỗi phòng có giá có đúng 1 `room_prices` APPROVED, `effectiveFrom` 2026-09-01, `proposedById` = `reviewedById` = id Boss, `reviewedAt` khác null, `price` = `rooms.price`.
  - SVC-01: mỗi tòa đúng 4 dịch vụ với tên/đơn vị như mục 2.4.
  - RATE-02 / seed của 12-pricing: mỗi tòa ELECTRIC tiers `[(1,50,3000),(2,100,3500),(3,null,4000)]`; WATER `[(1,null,15000)]`; Wifi 100000, Rác 30000, Gửi xe máy 100000, mỗi cái đúng 1 tier `upTo` null; tất cả APPROVED, `effectiveFrom` 2026-09-01, `proposedById` = `reviewedById` = Boss; `serviceId` có khi và chỉ khi `kind` = SERVICE, và là dịch vụ cùng tòa (DB-04); "Gửi xe điện" không có plan nào.
  - BIL-01 / CON-03 / DB-B1: hợp đồng `HD000001` ở CG01 phòng 203; `startDate` 2026-09-15, `termMonths` 6, `endDate` 2027-03-14, `billingDay` 15; `rent` 2500000 = `rooms.price` của phòng 203; `deposit` 0; ACTIVE với `signedAt` và `movedInAt` khác null; tenant là TENANT `0900000004`; `buildingId` = tòa của phòng.
  - CON-04 / DB-B6: 2 occupants, đúng 1 người ký và đó là tenant (`fullName`, `phone` khớp); CCCD null; số occupant ≤ `maxOccupants` của phòng 203.
  - DB-B5: contract services chỉ gồm Wifi (ROOM) và Rác (PERSON) của CG01; xe dùng dịch vụ VEHICLE "Gửi xe máy" của CG01.
  - CON-14: biển số viết hoa, không khoảng trắng; xe đang hoạt động, `registeredAt` 2026-09-15.
  - CON-10 / CON-11 / MTR-02: phòng 203 có ELECTRIC 1284 và WATER ≥ 0 với `readOn` 2026-09-15 (= `startDate`), `contractId` = hợp đồng, `isMeterReplaced` false.
  - BIL-09 sẵn sàng: tính ở `period_start` 2026-09-15, có 2 occupants (`moveInDate` ≤ period_start) và 1 xe (`registeredAt` ≤ period_start), khớp đầu vào BIL-09 (Rác × 2, 1 xe máy).
  - G-01: mọi cột tiền (`price`, `unitPrice`, `rent`, `deposit`) là số nguyên > 0 (`deposit` = 0).
  - G-02 (Asia/Ho_Chi_Minh): mọi ngày nghiệp vụ ghi ra có `toISOString()` kết thúc bằng `T00:00:00.000Z` và đúng ngày trong bảng (không lệch 1 ngày dù máy chạy UTC+7); `movedInAt` theo giờ Việt Nam là ngày 15/09/2026.

## 5. Sau khi chủ dự án duyệt (phiên chính, không phải pipeline)

Thứ tự gợi ý trên file chính, từ `Source/backend`:
1. `REVIEW.md` → "ĐÃ DUYỆT …", chạy `node .claude/scripts/apply-draft.mjs Source/backend/artifact_BE/2026-10-29-BE-LOGIN-01-08`.
2. Được chủ dự án đồng ý thì xóa tay: `docs/database/{schema.prisma,constraints.sql,check-constraints.mjs}`, `src/app.controller.ts`, `src/app.service.ts`, `src/app.controller.spec.ts`.
3. `npm install`: đồng bộ lockfile theo `package.json` mới: gỡ `@nestjs/observe`, cài `@types/node` 24.19.2 (D7); postinstall của `@prisma/client` sinh client từ `prisma/schema.prisma`. Nếu không thấy sinh thì chạy `npx prisma generate`. Kiểm sau khi cài:
   - `npm ls @types/node` → `@types/node@24.19.2`.
   - `npx tsc --noEmit -p tsconfig.json --incremental false` → không lỗi; lỗi TS2339 `Property 'main' does not exist on type 'ImportMeta'` ở `prisma/seed.ts` phải hết (D7).
   - `node -v` → ≥ `v24.2.0` (cần cho `import.meta.main` lúc chạy).
4. `npx prisma validate`, rồi `npx prisma migrate deploy` (áp migration đầu qua `DIRECT_URL`).
5. Kiểm DB 50/50 (P1-QA-02). `check-constraints.mjs <deps> <dbDir>` cần `node_modules/@electric-sql/pglite` trong `<deps>` và `schema.sql` + `constraints.sql` trong `<dbDir>`. Nếu cài pglite ở `Source/backend` thì gọi từ `Source/backend` là `node prisma/check-constraints.mjs . prisma`; lệnh `node prisma/check-constraints.mjs . .` trong feature sẽ không tìm thấy `schema.sql`.
6. `npx prisma db seed` hai lần (BE-LOGIN-06). Mỗi lần phải in dòng `Seed xong: …`; không thấy dòng đó thì seed đã không chạy (run-guard), dừng lại và báo, đừng coi là xong.
7. `npm run build`, `npm run lint`, `npm run test`, `npm run test:e2e`.
8. BE-LOGIN-03 bằng tay: trong `Source/backend/dist` (không có `.env`), chạy `node main.js` → in "Thiếu biến môi trường: …" và thoát.

## 6. Ghi chú, rủi ro

- **Dòng tài liệu sẽ lỗi thời** (không thuộc task nào; đề xuất gộp vào bản nháp `Artifacts/2026-10-29-BE-LOGIN-02-doc-paths/`): `Source/backend/CLAUDE.md` dòng 8 ("phase 1: move from docs/database/") và dòng 31 (ObserveModule); `docs/spec/01-architecture.md` dòng 9 và 31; `docs/spec/README.md` dòng 33 (link `../database/`); câu "Run the DB check" trong `02-database.md` (đối số `<deps>`, xem mục 5 bước 5).
- **Chỗ spec và code chưa khớp:** `Source/backend/CLAUDE.md` viết "controllers … return `{ data }`" và "map Prisma errors in the global filter". Kế hoạch làm theo feature: interceptor bọc `{ data }`, còn ánh xạ lỗi Prisma hoãn (mục 1). Bảng mã lỗi của spec chưa có `INTERNAL_ERROR`; code dùng mã này theo D4, phiên chính bổ sung spec bằng bản nháp riêng.
- **Prefix guard (D6):** so khớp phân biệt hoa thường, trong khi router Express mặc định không phân biệt; `/API/V1/...` sẽ nhận 404 `NOT_FOUND`. Route nào sau này cần nằm ngoài `/api/v1` (vd `setGlobalPrefix` có `exclude`) thì phải sửa guard cùng lúc.
- **D7 (`@types/node` 24.19.2 chưa cài):** tới khi phiên chính `npm install`, tsc (bản nháp, rồi bản chính sau khi chép) báo đúng 1 lỗi TS2339 ở `prisma/seed.ts`. `npm run build` không bị ảnh hưởng (`tsconfig.build.json` chỉ gồm `src`), seed vẫn chạy được (Node bỏ kiểu). D7 chỉ miễn lỗi tsc: nếu `oxlint --type-aware` báo lỗi vì thiếu kiểu `ImportMeta.main`, tester báo FAIL kèm output và orchestrator hỏi chủ dự án. Bản 24.19.2 cũng đổi kiểu Node cho toàn app; lỗi kiểu mới (nếu có) chỉ lộ ra ở bước kiểm tsc mục 5 bước 3.
- **`import.meta.main` cần Node ≥ 24.2 lúc chạy.** Node cũ hơn cho `undefined`, seed lại lặng lẽ không chạy (đúng lỗi cũ). `package.json` không có `engines` (không thêm, ngoài yêu cầu); chặn bằng kiểm `node -v` và dòng `Seed xong` ở mục 5.
- **D8:** mọi lỗi có dạng http-errors (`expose === true`, `status` 4xx), không riêng body-parser, đều thành mã 4xx theo bảng. 413 và 415 cùng trả 400 `VALIDATION_FAILED` nên FE không phân biệt được "body quá lớn" với lỗi dữ liệu khác (chủ dự án chọn giữ như vậy).
- Prisma 6.19 có thể cảnh báo `package.json#prisma` sắp bỏ ở Prisma 7. Chưa chuyển sang `prisma.config.ts`, vì khi có file đó Prisma thôi tự nạp `.env` (sẽ phải thêm `dotenv`).
- Prisma không biết các partial index/CHECK/trigger trong `constraints.sql`. Migration sau này sinh bằng `migrate dev` có thể chứa lệnh `DROP INDEX` cho chúng; phải bỏ những lệnh đó (DB-07).
- Seed chưa từng chạy trên DB thật trong pipeline. Sai về FK/trigger chỉ lộ ra ở mục 5 bước 6; nếu sai thì sửa bằng bản nháp tiếp theo.
