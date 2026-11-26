# PLAN · CHAT · Chatbot tư vấn công khai (CHAT-01..07, D-49, A-29)

Spec: `docs/spec/21-chatbot.md`, D-49 + A-29 (`docs/spec/00-overview.md`), `CHAT_UNAVAILABLE` (`docs/spec/01-architecture.md#error-codes`).
Cách tiếp cận đã được chủ sở hữu chốt; plan này chỉ chỉ ra **điểm chạm chính xác** và thứ tự build.

## 1. Mục tiêu và phạm vi

**Trong phạm vi**
- BE: module mới `chatbot` với một route `POST /api/v1/public/chat` (`@Public()`), gọi Claude Haiku 5.5 qua `@anthropic-ai/sdk`, 4 tool chỉ đọc bọc các service public đang có (CHAT-01, CHAT-02, CHAT-04, CHAT-05).
- BE: rate limit 20 request/IP/giờ (CHAT-03, A-29), `CHAT_UNAVAILABLE` 503 khi thiếu key / provider lỗi / model từ chối (CHAT-06), không lưu gì (CHAT-07).
- FE: bong bóng chat nổi trên mọi trang public, dựng từ kit, vi+en qua dictionary, lịch sử chỉ trong state component (CHAT-07).

**Ngoài phạm vi**
- Không bảng DB, không migration, không audit row, không log nội dung tin nhắn (CHAT-07).
- Không chat cho khu vực tenant/staff, không thu tên/điện thoại trong chat (CHAT-05), không đặt lịch xem phòng từ chat (D-28 vẫn yêu cầu đăng nhập ở trang phòng).
- Không thêm component vào `src/components/` (KIT-07: widget chỉ dùng cho feature `public`).

## 2. Kiến trúc

```
FE  PublicLayout (mọi trang public)
     └─ features/public/ChatWidget.tsx  ──(chat.ts: sendChat)──┐
        (state: messages[], open, pending, errorCode)          │  POST /api/v1/public/chat
                                                               │  { messages[], roomId? }
BE  PublicChatController  @Public()  (thin)                    ▼
     └─ ChatbotService
          ├─ RateLimiter(20, 3_600_000)  key = req.ip                  → TOO_MANY_REQUESTS (CHAT-03)
          ├─ ANTHROPIC_CLIENT (null nếu thiếu key)                     → CHAT_UNAVAILABLE 503 (CHAT-06)
          └─ client.beta.messages.toolRunner({ model: 'claude-haiku-5-5', system: CHAT_SYSTEM (cache_control), tools })
                 ├─ search_rooms  → PublicRoomsService.list(PublicRoomsQueryDto)
                 ├─ get_room      → PublicRoomsService.detail(id, lang)
                 ├─ list_locations→ PublicBuildingsService.locations()
                 └─ get_building  → PublicBuildingsService.detail(id)
                                        (chỉ đọc, đã áp ROOM-05/PUB-01..04 sẵn)
```

Không có state phía server ngoài bộ đếm rate limit trong RAM. `app.setup.ts` đã set `Cache-Control: no-store` cho mọi request và chỉ ghi đè `s-maxage=60` cho **GET** `/api/v1/public/*`, nên `POST /public/chat` tự có `no-store` (CHAT-01) — **không thêm `@Header`**, chỉ viết test khẳng định.

### 2.1 File backend

| File | Việc |
|---|---|
| `Source/backend/src/modules/chatbot/chatbot.module.ts` | mới: imports `RoomsModule`, `BuildingsModule`; providers `ChatbotService`, `ANTHROPIC_CLIENT` |
| `.../chatbot/public-chat.controller.ts` | mới: `@Controller('public')` + `@Public() @Post('chat')` |
| `.../chatbot/chatbot.service.ts` | mới: rate limit + gọi model + map lỗi |
| `.../chatbot/chat-tools.ts` | mới: 4 `betaTool(...)`, validate input bằng DTO hiện có |
| `.../chatbot/chat-prompt.ts` | mới: `CHAT_SYSTEM` (hằng số, đóng băng) |
| `.../chatbot/anthropic.provider.ts` | mới: factory đọc `ANTHROPIC_API_KEY`, trả `null` khi thiếu |
| `.../chatbot/dto/chat.dto.ts` | mới: `ChatRequestDto`, `ChatMessageDto` |
| `.../chatbot/chatbot.service.spec.ts`, `.../chatbot/chatbot.http.spec.ts` | mới: test (chỉ mock Anthropic client) |
| `.../chatbot/feature_chatbot.md` | mới: danh sách task BE-CHAT-xx (xem §5) |
| `src/common/errors/error-code.ts` | **sửa**: thêm `CHAT_UNAVAILABLE` + entry `{ status: 503, message: 'Trợ lý đang bận, vui lòng thử lại sau' }` |
| `src/common/i18n/messages.ts` | **sửa**: `ERRORS_EN.CHAT_UNAVAILABLE` + các câu lỗi DTO chat vào `FIELDS_EN` |
| `src/app.module.ts` | **sửa**: thêm `ChatbotModule` vào cuối `imports` |
| `src/modules/rooms/rooms.module.ts` | **sửa**: `exports: [RoomsService, PublicRoomsService]` |
| `src/modules/buildings/buildings.module.ts` | **sửa**: `exports: [BuildingContactService, PublicBuildingsService]` |
| `vitest.config.ts`, `vitest.config.e2e.ts` | **sửa**: `env: { MAIL_PROVIDER: '', ANTHROPIC_API_KEY: '' }` (bài học EX-8: `.env` thật từng khiến test gọi provider thật) |
| `.env.example` | **sửa**: thêm `# CHAT-02: khóa Claude API, để trống thì API trả CHAT_UNAVAILABLE` + `ANTHROPIC_API_KEY=` |
| `package.json` | **sửa**: dependency `@anthropic-ai/sdk` (pin phiên bản) — **chờ chủ sở hữu đồng ý cài** (CLAUDE.md quy tắc 7) |

`ANTHROPIC_API_KEY` **không** vào `REQUIRED_ENV` (`src/common/env.ts` giữ nguyên, nên `env.spec.ts` dòng 30 không đổi) — app vẫn khởi động được (CHAT-06).

### 2.2 Hợp đồng API

```
POST /api/v1/public/chat            @Public(), Cache-Control: no-store
body:  { messages: { role: 'user'|'assistant'; content: string }[]; roomId?: number }
200:   { data: { reply: string } }
400 VALIDATION_FAILED   mọi sai lệch body (CHAT-01)
429 TOO_MANY_REQUESTS   > 20 request/IP/giờ (CHAT-03)
503 CHAT_UNAVAILABLE    thiếu key | provider lỗi | model từ chối (CHAT-06)
```

```ts
// dto/chat.dto.ts
export class ChatMessageDto {
  @IsIn(['user', 'assistant'], { message: 'Vai trò tin nhắn không hợp lệ' }) role!: 'user' | 'assistant';
  @Transform(trimText) @IsString() @MinLength(1) @MaxLength(500, { message: 'Tin nhắn tối đa 500 ký tự' }) content!: string;
}
export class ChatRequestDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20, { message: 'Hội thoại tối đa 20 tin nhắn' })
  @ValidateNested({ each: true }) @Type(() => ChatMessageDto)
  @Validate(AlternatingUserFirstLast)   // first+last = 'user', luân phiên (CHAT-01)
  messages!: ChatMessageDto[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2147483647, { message: 'Mã phòng không hợp lệ' }) roomId?: number;
}
```
Mọi literal tiếng Việt mới trong DTO phải có bản dịch trong `FIELDS_EN` (LOC-02/04, đường dẫn `/api/v1/public` được dịch).

```ts
// chatbot.service.ts
export const CHAT_RATE_MAX = 20;            // A-29
export const CHAT_RATE_WINDOW_MS = 3_600_000;
export class ChatbotService {
  constructor(client: Anthropic | null, rooms: PublicRoomsService, buildings: PublicBuildingsService);
  reply(dto: ChatRequestDto, ip: string, lang: Lang): Promise<{ reply: string }>;
}
// chat-tools.ts
export function chatTools(rooms: PublicRoomsService, buildings: PublicBuildingsService, lang: Lang): BetaTool[];
// tên tool: 'search_rooms' | 'get_room' | 'list_locations' | 'get_building'
```
- `search_rooms` input đi qua `plainToInstance(PublicRoomsQueryDto, input)` + `validate()` → sai thì **trả text lỗi cho model** (không 500, không rò message DB).
- `get_room` / `get_building`: `NotFoundException` → trả cho model "không tìm thấy / không còn công khai" (PUB-02 không phân biệt).
- `limit` của `search_rooms` ép ≤ 10 để giữ token thấp.
- `CHAT_SYSTEM`: tiếng Anh, hằng số, kèm `cache_control: { type: 'ephemeral' }`; nội dung = CHAT-04 (chỉ trả lời chuyện thuê phòng, chỉ dùng dữ liệu tool, tiền là số nguyên đồng, trả lời theo ngôn ngữ khách viết, lệch chủ đề thì từ chối ngắn gọn) + CHAT-05 (link `/phong/<id>`, số điện thoại tòa từ dữ liệu public, không hỏi tên/điện thoại) + ngày Hanoi hôm nay + `roomId` đang xem (nếu có).
- Mọi exception từ SDK: catch → `ServiceUnavailableException(ErrorCode.CHAT_UNAVAILABLE)`; log **chỉ** tên lỗi/code, không log nội dung tin nhắn (CHAT-07).

### 2.3 File frontend

| File | Việc |
|---|---|
| `src/features/public/ChatWidget.tsx` | mới: component (chỉ JSX + state) |
| `src/features/public/chat.ts` | mới: `ChatMessage`, `sendChat(messages, roomId)`, `chatErrorKey(error)` (tách khỏi TSX vì lint Fast Refresh) |
| `src/features/public/chat-widget.css` | mới: chỉ dùng token `rooms.css` |
| `src/layouts/PublicLayout.tsx` | **sửa**: render `{!showEntry && <ChatWidget roomId={roomIdOfPath(pathname)} />}` ngoài wrapper `inert` |
| `src/shared/i18n/vi.ts`, `src/shared/i18n/en.ts` | **sửa**: khóa `chat.*` (đủ cặp vi/en, xem §4 CP-2) |
| `tests/p6/chat-widget.test.mjs` | mới |
| `tests/ex/ex3-i18n.test.mjs` | **sửa**: thêm `features/public/ChatWidget.tsx`, `features/public/chat.ts` vào danh sách quét copy |

Props: `ChatWidget({ roomId }: { roomId?: number })`. Dùng `RoomsButton`, `TextField`, `FormError`, `Spinner`, `ElevatedCard` từ `src/components` (đều đã có; không thêm component kit mới).

**Bắt buộc**: widget **không gọi API khi mount** (bong bóng mặc định đóng, chỉ fetch khi khách gửi tin) — nếu không, mọi test dùng `fakeFetch` sẽ nhận thêm call lạ (bài học FE-EX-18..20).

## 3. Test hiện có sẽ đỏ và cách xử lý

**Backend**
| Test | Vì sao | Sửa |
|---|---|---|
| `src/app.setup.spec.ts` (≈ dòng 758–799) | `EXPECTED` thiếu `CHAT_UNAVAILABLE` và khẳng định `toHaveLength(33)` | thêm `['CHAT_UNAVAILABLE', 503, '<đúng câu tiếng Việt>']`, đổi 33 → 34 và tên test |
| `src/common/prisma/prisma.service.spec.ts` (dòng 55–58) | `imports` của AppModule so khớp tuyệt đối | thêm `ChatbotModule` đúng vị trí cuối danh sách |
| `src/common/i18n/i18n.spec.ts` "LOC-04" (dòng 29–38) | đòi `ERRORS_EN` đủ mọi mã, khác câu tiếng Việt | thêm `CHAT_UNAVAILABLE` tiếng Anh |
| `src/common/i18n/i18n.spec.ts` "field catalog" (dòng 39–58) | danh sách path quét literal | thêm `modules/chatbot/dto/chat.dto.ts` (+ `chatbot.service.ts` nếu có literal) và các câu vào `FIELDS_EN` |
| `src/jobs/room-price-sync.job.spec.ts` (dòng 103) | đọc `imports` AppModule theo tên module | kiểm tra lại: chỉ tìm ScheduleModule, dự kiến vẫn xanh |
| `src/modules/buildings/building-contact.service.spec.ts` (dòng 89) | `toContain` nên thêm export không phá | không sửa |

**Frontend** (mọi test mount `PublicLayout` thật)
| Test | Rủi ro | Xử lý |
|---|---|---|
| `tests/ex/ex4-entry-memory.test.mjs` | `fakeFetch` chỉ đáp `/public/contact`; `button(app, label)` tìm theo nhãn | an toàn nếu widget không fetch khi mount và nhãn chat khác các nhãn đang assert |
| `tests/ex/ex3-i18n.test.mjs` (dòng 174–213) | quét copy tiếng Việt ngoài dictionary | thêm 2 file chat vào danh sách; mọi chữ đi qua `t()` |
| `tests/ex/ex-guest-shell.test.mjs`, `tests/ex/ex-signup.test.mjs`, `tests/ex/ex5-room-filters.test.mjs`, `tests/lp/login-portal.test.mjs` | so khớp `text(container)` ghép toàn bộ text | đều là `includes`; kiểm tra lại các assert dạng phủ định sau khi build |
| `tests/auth-login-flow.test.mjs` (loader kit, dòng ~171) | loader chỉ nạp `Button, FormFields, SectionHeading, Navigation, LanguageSwitch, RoomSearch, SharedPrimitives, StatusBadge, ConfirmDialog` | giữ widget trong đúng tập này; nếu cần module kit khác thì **thêm vào loader** (bài học FE-EX-09) |
| `tests/p2/ui-11-navigation.test.mjs`, `tests/p2/fe-p2-14-home.test.mjs`, `tests/p2/ui-21-home-lower.test.mjs`, `tests/lp/header-register.test.mjs`, `tests/ex/ex3-language-switch.test.mjs`, `tests/auth-guards.test.mjs`, `tests/p2/cp1-routes.test.mjs` | đếm/so khớp node theo tag (`BUTTON`, `H2`, `P`) hoặc đếm `calls` | chạy trước khi sửa, sau đó chạy lại; nếu đỏ thì siết selector của test chứ không bỏ widget |
| `tests/ex/ex4-entry-screen.test.mjs` (dòng 66, 75) | so khớp **tuyệt đối** danh sách BUTTON ở màn entry | chỉ mount `EntryScreen`, không mount layout → xanh; thêm nữa widget không render khi `showEntry` |

Chạy FE theo thứ tự: file test mới → các file trong bảng → `npm run test:components` toàn bộ (nhớ bài học: 4–5 test nhạy thời gian có thể đỏ khi chạy tải cao, chạy lại từng file).

## 4. Checkpoints

### CP-1 · Backend `POST /public/chat` (BE-CHAT-01..08)

Files: toàn bộ §2.1 (gồm cả 4 test hiện có phải sửa).

**Done when**
```
cd Source/backend
npm run lint                                  # oxlint pass
npx tsc -p tsconfig.json --noEmit             # pass
npm run test -- src/modules/chatbot src/app.setup.spec.ts src/common/i18n src/common/prisma   # tất cả xanh
npm run test                                  # full offline suite xanh, số case = baseline + case mới
```
Kiểm tra tay: bỏ `ANTHROPIC_API_KEY` → `npm run start:dev` lên được; `POST /api/v1/public/chat` trả 503 `CHAT_UNAVAILABLE`.

**Kịch bản test** (giá trị mong đợi lấy từ spec, client Anthropic là thứ duy nhất được mock)
| # | Kịch bản | Mong đợi | ID |
|---|---|---|---|
| 1 | 1 tin `user`, model trả text | 200 `{ data: { reply } }`, header `Cache-Control: no-store` | CHAT-01 |
| 2 | 20 tin luân phiên, đầu/cuối là `user` | 200 | CHAT-01, A-29 |
| 3 | 0 tin / 21 tin / 2 tin `user` liền nhau / tin cuối là `assistant` / `role` lạ | 400 `VALIDATION_FAILED` | CHAT-01 |
| 4 | `content` rỗng, chỉ khoảng trắng, 501 ký tự; 500 ký tự sau trim | 3 ca đầu 400; ca 500 ký tự 200 | CHAT-01, A-29 |
| 5 | `roomId` = 0, -1, `'x'`, 2147483648; trường lạ trong body | 400 `VALIDATION_FAILED` | CHAT-01 |
| 6 | `roomId` hợp lệ | system prompt chứa room id đó | CHAT-01, CHAT-05 |
| 7 | model gọi `search_rooms` với filter giá/quận | tool gọi đúng `PublicRoomsService.list`, reply chứa số tiền nguyên | CHAT-02, CHAT-04 |
| 8 | `search_rooms` nhận filter sai (`minPrice: -1`, amenity ngoài danh mục, `limit: 500`) | trả text lỗi cho model, **không** 500, không gọi Prisma với giá trị sai | CHAT-02 |
| 9 | `get_room` với phòng không công khai / không tồn tại | cùng một câu "không tìm thấy", không hé lộ phòng có tồn tại | PUB-02, CHAT-02 |
| 10 | `get_room` phòng công khai | trả cả `monthlyEstimate` + `contact.phone` | ROOM-08, A-05, CHAT-05 |
| 11 | `list_locations`, `get_building` | gọi đúng `PublicBuildingsService`, dữ liệu chỉ public | PUB-03, PUB-04 |
| 12 | mọi tool: không có hàm nào ghi/đặt lịch/đọc dữ liệu riêng | danh sách tool đúng 4 tên, đều chỉ đọc | CHAT-02 |
| 13 | không có `ANTHROPIC_API_KEY` | 503 `CHAT_UNAVAILABLE`, app vẫn init được | CHAT-06 |
| 14 | SDK throw (401/429/500/timeout) | 503 `CHAT_UNAVAILABLE`, body **không** chứa text lỗi provider | CHAT-06 |
| 15 | model trả rỗng / `stop_reason` từ chối | 503 `CHAT_UNAVAILABLE` | CHAT-06 |
| 16 | request thứ 21 cùng IP trong 1 giờ | 429 `TOO_MANY_REQUESTS`; đúng tới 20 thì vẫn 200 | CHAT-03, A-29 |
| 17 | IP khác | không bị chặn; qua mốc 1 giờ thì reset | CHAT-03 |
| 18 | `Accept-Language: en` khi lỗi | message tiếng Anh của `CHAT_UNAVAILABLE`; `fr` quay về tiếng Việt | LOC-02, LOC-04 |
| 19 | request thành công | không có row DB mới, không `audit_logs`, không log nội dung tin nhắn | CHAT-07 |

### CP-2 · Frontend bong bóng chat (FE-CHAT-01..05)

Files: toàn bộ §2.3.

**Done when**
```
cd Source/frontend
npm run lint && npm run build
node --test tests/p6/chat-widget.test.mjs        # xanh
npm run test:components                           # toàn bộ xanh (chạy lại file đỏ lẻ nếu nghi do tải)
```
Kiểm tra tay: `npm run dev` → trang `/`, `/phong`, `/phong/:id` đều có bong bóng; mở, gửi câu hỏi, đổi sang English thấy nhãn tiếng Anh; tải lại trang thì hội thoại mất (CHAT-07).

**Kịch bản test**
| # | Kịch bản | Mong đợi | ID |
|---|---|---|---|
| 1 | mount trang public, chưa mở bong bóng | **0** request API; có nút mở với nhãn từ dictionary | CHAT-01, UI-12 |
| 2 | mở, gửi 1 câu | gửi đúng `POST /public/chat` với toàn bộ `messages` + `roomId` khi ở `/phong/:id` | CHAT-01, A-29 |
| 3 | trang không phải phòng | body không có `roomId` | CHAT-01 |
| 4 | trả lời 200 | reply hiện trong khung, input xoá, nhiều lượt giữ đúng thứ tự luân phiên | CHAT-01 |
| 5 | input rỗng / chỉ khoảng trắng / > 500 ký tự | không gửi request, hiện lỗi/giới hạn ký tự | CHAT-01, A-29 |
| 6 | đã có 20 tin nhắn | không cho gửi thêm, hiện thông báo kết thúc hội thoại | A-29 |
| 7 | API trả 503 `CHAT_UNAVAILABLE` | hiện đúng "Trợ lý đang bận. Vui lòng gọi số điện thoại của tòa nhà hoặc đặt lịch xem phòng." | CHAT-06 |
| 8 | API trả 429 `TOO_MANY_REQUESTS` | ở trang phòng: hiện số điện thoại của tòa (từ dữ liệu phòng đã tải); ngoài trang phòng: câu chung | CHAT-03 |
| 9 | lỗi mạng | thông báo lỗi chung, có nút thử lại, không mất hội thoại | UI-05 |
| 10 | `lang = 'en'` | mọi nhãn + 2 câu lỗi trên có bản tiếng Anh | LOC-01, LOC-04 |
| 11 | tải lại trang (remount) | hội thoại rỗng, không đọc localStorage | CHAT-07 |
| 12 | màn entry đang mở ở `/` | không render bong bóng, bẫy focus của entry không đổi | UI-11, KIT-05 |
| 13 | bàn phím: mở bằng Enter/Space, Esc đóng và trả focus về nút mở; 360 px không tràn ngang | đạt | KIT-05, UI-07 |
| 14 | pending | nút gửi disabled + `Spinner`, không gửi trùng | UI-05 |

## 5. Task cho 2 file feature (chủ sở hữu tạo file, plan chỉ liệt kê task)

`Source/backend/src/modules/chatbot/feature_chatbot.md`
- BE-CHAT-01 thêm `CHAT_UNAVAILABLE` vào `ErrorCode`/`ERRORS` + `ERRORS_EN`, cập nhật `app.setup.spec.ts` (34 mã) và test LOC-04.
- BE-CHAT-02 `dto/chat.dto.ts` + validator luân phiên; thêm literal vào `FIELDS_EN` và vào danh sách quét của `i18n.spec.ts`.
- BE-CHAT-03 `anthropic.provider.ts` (`ANTHROPIC_CLIENT`, `null` khi thiếu key) + `.env.example` + `env` của 2 vitest config.
- BE-CHAT-04 `chat-prompt.ts` (`CHAT_SYSTEM`, cache_control).
- BE-CHAT-05 `chat-tools.ts`: 4 tool chỉ đọc, validate input bằng `PublicRoomsQueryDto`/`PublicIdParamsDto`.
- BE-CHAT-06 `chatbot.service.ts`: rate limit, gọi toolRunner, map lỗi về `CHAT_UNAVAILABLE`.
- BE-CHAT-07 controller + module + đăng ký `AppModule`, export 2 service public, cập nhật `prisma.service.spec.ts`.
- BE-CHAT-08 test unit + HTTP theo §4 CP-1.

`Source/frontend/src/features/public/feature_chatbot.md`
- FE-CHAT-01 `chat.ts`: type, `sendChat`, map mã lỗi → khóa dictionary.
- FE-CHAT-02 khóa `chat.*` trong `vi.ts`/`en.ts`.
- FE-CHAT-03 `ChatWidget.tsx` + `chat-widget.css` từ kit.
- FE-CHAT-04 gắn vào `PublicLayout` (ẩn khi màn entry mở, truyền `roomId` ở `/phong/:id`); thêm 2 file vào danh sách quét copy của `ex3-i18n`.
- FE-CHAT-05 `tests/p6/chat-widget.test.mjs` + chạy lại các test trong bảng §3.

## 6. Câu hỏi bỏ ngỏ

1. **Cài `@anthropic-ai/sdk`?** (CLAUDE.md quy tắc 7 bắt buộc hỏi trước khi thêm dependency) — (a) đồng ý cài, pin phiên bản, dùng `toolRunner` như đã chốt; (b) không cài, tự gọi `https://api.anthropic.com/v1/messages` bằng `fetch` + vòng lặp tool ~60 dòng (ít rủi ro chuỗi phụ thuộc, nhiều code tự viết hơn). **Chặn CP-1.**
2. **Ngân sách một câu trả lời** (spec không nói): số vòng gọi tool tối đa và timeout cho một request. (a) 4 vòng / 15 s; (b) 8 vòng / 30 s; (c) không giới hạn vòng, chỉ timeout 30 s. Quá hạn → `CHAT_UNAVAILABLE`. **Chặn CP-1** (ảnh hưởng chi phí và thời gian chờ của khách).

## 7. `[ASSUMPTION]` dùng trong plan

- A-29 (20 request/IP/giờ, 20 tin, 500 ký tự, bong bóng ở mọi trang public, truyền `roomId` ở trang phòng) — đã ghi là assumption trong spec, cứ triển khai.
- Chỉ request **vượt** giới hạn mới bị 429 và bản thân 429 không tính thêm lượt; request bị 400 (validate trượt trước rate limit) không tính lượt.
- "Model từ chối" (CHAT-06) nhận biết bằng: không có text trong câu trả lời cuối, hoặc `stop_reason` báo từ chối.
- Câu tiếng Việt của `CHAT_UNAVAILABLE` trong `ERRORS` ngắn gọn ("Trợ lý đang bận, vui lòng thử lại sau"); câu đầy đủ theo CHAT-06 do FE hiển thị, nằm trong dictionary.
- `search_rooms` ép `limit` ≤ 10 để giữ chi phí token thấp (spec không nói số lượng).
- Rate limit dùng `RateLimiter` trong RAM: đúng với 1 instance BE (D-22); nhiều instance cần store chung — giữ `shortcut:` comment như trong `rate-limiter.ts`.
