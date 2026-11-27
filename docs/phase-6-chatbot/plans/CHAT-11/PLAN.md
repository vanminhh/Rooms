# PLAN · CHAT-11/12 · Ảnh kèm câu hỏi, nút dừng, input dạng pill (D-49)

Spec: `docs/spec/21-chatbot.md` (CHAT-01, CHAT-06, CHAT-07, CHAT-09 + 2 mục mới CHAT-11, CHAT-12), A-29.
Quyết định của chủ sở hữu 27/11/2026 đã chốt; plan chỉ nêu điểm chạm, rủi ro, thứ tự build. Nền tảng: `docs/phase-6-chatbot/plans/CHAT/PLAN.md`.

## 1. Mục tiêu và phạm vi

**Trong**: BE nhận tối đa 1 ảnh (jpeg/png/webp, base64, decoded ≤ 1,5 MB) kèm câu hỏi cuối và chuyển cho Haiku vision; huỷ gọi model khi khách ngắt kết nối; FE chọn/nén/gửi ảnh, nút dừng, input pill, nút biểu tượng ở header; spec + i18n.
**Ngoài**: không lưu ảnh ở đâu (CHAT-07), không bảng DB/migration, không dependency mới, không component mới trong `src/components/`, không sửa tool (ảnh không tạo thêm tool call), không ảnh trong lịch sử gửi lên BE.

## 2. Kiến trúc

```
FE ChatWidget
  attach (Uiverse folder) → pickImageError(file)  → prepareImage(file)  → { mediaType, data(base64) }
        (type/size 5 MB)      canvas ≤1568px, JPEG 0.85
  submit  → sendChat(messages, roomId, image, signal)   ──POST /api/v1/public/chat──┐
  stop    → controller.abort() → draft + ảnh trở lại input, history không đổi        │
                                                                                     ▼
BE PublicChatController  (thin: dto + ip + lang + clientAbortSignal(req,res))
     └─ ChatbotService.reply(dto, ip, lang, clientSignal?)
          ├─ RateLimiter 20/IP/h (ảnh cũng tính 1 lượt, CHAT-03)
          ├─ messages: ảnh ghép vào content của tin user CUỐI
          │     [{ type:'image', source:{ type:'base64', media_type, data } }, { type:'text', text }]
          └─ signal: AbortSignal.any([AbortSignal.timeout(15000), clientSignal])
                 client abort → ném CHAT_UNAVAILABLE, KHÔNG logger.warn
```

### 2.1 File

| File | Việc |
|---|---|
| `docs/spec/21-chatbot.md` | **sửa**: CHAT-01 thêm `image?`; thêm CHAT-11 (ảnh) + CHAT-12 (dừng); CHAT-09 nói nút biểu tượng |
| `src/modules/chatbot/dto/chat.dto.ts` | **sửa**: `ChatImageDto` + `image?` ở `ChatRequestDto`, hằng `CHAT_IMAGE_MAX_BYTES` |
| `src/modules/chatbot/chatbot.service.ts` | **sửa**: ghép ảnh vào tin cuối, `AbortSignal.any`, bỏ log khi client abort |
| `src/modules/chatbot/client-abort.ts` | **mới**: `clientAbortSignal(res): AbortSignal` (~8 dòng) |
| `src/modules/chatbot/public-chat.controller.ts` | **sửa**: `@Res({ passthrough: true })` → truyền signal |
| `src/modules/chatbot/chat-prompt.ts` | **sửa**: 1 câu: nếu có ảnh thì dựa vào ảnh để hiểu yêu cầu, vẫn chỉ gợi ý phòng từ dữ liệu tool (CHAT-04) |
| `src/app.setup.ts` | **sửa**: `(app as NestExpressApplication).useBodyParser('json', { limit: '3mb' })` |
| `src/common/i18n/messages.ts` | **sửa**: `FIELDS_EN` cho các câu lỗi DTO mới |
| `src/modules/chatbot/chatbot.service.spec.ts`, `chatbot.http.spec.ts` | **sửa**: ca mới (§4) |
| `src/features/public/chat.ts` | **sửa**: `ChatImage`, `pickImageError`, `prepareImage`, `sendChat(..., image?, signal?)`, `isAbortError` |
| `src/shared/api.ts` | **sửa**: option `signal` xuống `fetch`; lỗi abort được ném nguyên dạng, không đổi thành `NETWORK_ERROR` |
| `src/features/public/ChatWidget.tsx` | **sửa**: attach + thumbnail + pill + stop + 3 nút biểu tượng (SVG inline) |
| `src/features/public/chat-widget.css` | **sửa**: pill, nút tròn, stop (`--rooms-error`), folder animation (ghi credit Uiverse), `prefers-reduced-motion` |
| `src/shared/i18n/vi.ts`, `en.ts` | **sửa**: `chat.attach`, `chat.removeImage`, `chat.imageAlt`, `chat.stop`, `chat.imageType`, `chat.imageTooBig` |
| `tests/p6/chat-widget.test.mjs` | **sửa**: ca mới (§4) |

### 2.2 Hợp đồng

```ts
// POST /api/v1/public/chat (không đổi route, @Public, no-store)
body: { messages: { role; content }[]; roomId?: number; image?: { mediaType: 'image/jpeg'|'image/png'|'image/webp'; data: string } }
// 200 { data: { reply } } · 400 VALIDATION_FAILED · 429 TOO_MANY_REQUESTS · 503 CHAT_UNAVAILABLE
export const CHAT_IMAGE_MAX_BYTES = 1_572_864; // 1.5 MB sau khi decode
export class ChatImageDto { mediaType!: 'image/jpeg'|'image/png'|'image/webp'; data!: string }
// chat.ts (FE)
export interface ChatImage { mediaType: string; data: string }
export function pickImageError(file: File): 'chat.imageType' | 'chat.imageTooBig' | null  // 5 MB, 3 kiểu
export function prepareImage(file: File): Promise<ChatImage>                              // canvas ≤1568px, JPEG 0.85
export function sendChat(messages: ChatMessage[], roomId?: number, image?: ChatImage, signal?: AbortSignal): Promise<{ reply: string }>
```

**`image` đặt ở gốc body, không nằm trong `messages`** — BE tự ghép vào tin user cuối, nên quy tắc "chỉ tin cuối có ảnh" đúng theo cấu trúc, không cần validator vị trí (ít code hơn). `ChatMessage` của FE thêm `imageUrl?` **chỉ để hiển thị**, `sendChat` không bao giờ serialize nó (lịch sử gửi lên chỉ có text).
`[ASSUMPTION]` vẫn bắt buộc có text 1–500 ký tự (không cho câu hỏi chỉ có ảnh) — giữ đúng CHAT-01 hiện tại, không thêm nhánh validate.

## 3. Rủi ro

1. `useBodyParser('json', { limit: '3mb' })` là **toàn cục**: mọi endpoint nhận body tới 3 MB (hiện 100 kB). Giảm nhẹ: mọi DTO khác vẫn có `whitelist` + giới hạn độ dài riêng; chat tự chặn ở 1,5 MB decoded. Lựa chọn khác (middleware `express.json` riêng cho `/api/v1/public/chat`) **không khả thi** vì parser 100 kB của Nest chạy trước → 413. Nếu chủ sở hữu không muốn nới toàn cục thì phải `NestFactory.create(AppModule, { bodyParser: false })` + tự mount 2 parser — nhiều code hơn, nêu ra rồi mới làm.
2. `res.on('close')` cũng bắn khi response kết thúc bình thường → chỉ abort khi `!res.writableEnded`, nếu sai sẽ huỷ oan mọi câu trả lời.
3. Môi trường test FE không có canvas/`createImageBitmap`/`FileReader` → `prepareImage` **không test tự động** (chỉ kiểm tra tay), phần test là `pickImageError` + luồng gửi/dừng với ảnh giả.
4. `chat.reset()` trong `onError` (để nút dừng không hiện lỗi): nếu React Query không xoá, dùng `abortedRef` và tính `errorKey = isError && !abortedRef.current`.
5. Ảnh base64 nằm trong RAM tab; không log, không lưu (CHAT-07) — tuyệt đối không đưa `data` vào bất kỳ `logger`/message lỗi nào.

## 4. Checkpoints

### CP-A · Backend (BE-CHAT-10..13)

- BE-CHAT-10 spec `21-chatbot.md` (CHAT-01 `image?`, CHAT-11, CHAT-12, CHAT-09) — làm trước để test có ID.
- BE-CHAT-11 `ChatImageDto` + `FIELDS_EN` + `useBodyParser` 3 MB.
- BE-CHAT-12 ghép ảnh vào tin cuối + prompt + `clientAbortSignal` + `AbortSignal.any`, không log khi client abort.
- BE-CHAT-13 test.

**Done when** (`cd Source/backend`): `npm run lint` pass · `npx tsc -p tsconfig.json --noEmit` pass · `npm run test -- src/modules/chatbot src/common/i18n src/app.setup.spec.ts` xanh · `npm run test` full offline xanh (baseline 2967 + ca mới). Kiểm tra tay: gửi JSON ~2 MB có ảnh thật bằng curl → 200 có reply nói về ảnh.

| # | Kịch bản | Mong đợi | ID |
|---|---|---|---|
| 1 | 1 tin user + `image` jpeg hợp lệ | 200; messages gửi model: tin cuối có block `image` **trước** block `text`, các tin trước chỉ text | CHAT-11 |
| 2 | ảnh png, webp | 200 | CHAT-11 |
| 3 | `mediaType` = `image/gif` / `application/pdf` / rỗng | 400 `VALIDATION_FAILED` | CHAT-11 |
| 4 | `data` không phải base64 (ký tự lạ), `data` rỗng | 400 | CHAT-11 |
| 5 | decoded = 1,5 MB (biên) / 1,5 MB + 1 byte | 200 / 400 | CHAT-11 |
| 6 | body JSON 2,5 MB có ảnh / > 3 MB | 200 / lỗi 413 (không phải 500, không rò HTML) | CHAT-11 |
| 7 | 2 ảnh (`image` là array) hoặc `image` trong một phần tử `messages` | 400 (forbidNonWhitelisted) | CHAT-11 |
| 8 | hội thoại 3 tin + ảnh | ảnh chỉ nằm ở tin user cuối | CHAT-11 |
| 9 | request có ảnh | tính 1 lượt rate limit; request thứ 21 → 429 | CHAT-03, A-29 |
| 10 | request có ảnh thành công/thất bại | không log `data`, không log nội dung tin nhắn, không row DB | CHAT-07 |
| 11 | client đóng kết nối khi đang gọi model | signal của SDK `aborted`, **không** có `logger.warn` | CHAT-12 |
| 12 | response kết thúc bình thường | không abort, reply trả về đủ | CHAT-12 |
| 13 | model chạy quá 15 s (không có client abort) | 503 `CHAT_UNAVAILABLE`, có log tên lỗi | CHAT-06 |
| 14 | `Accept-Language: en` + ảnh sai kiểu | message tiếng Anh từ `FIELDS_EN` | LOC-02, LOC-04 |

### CP-B · Frontend (FE-CHAT-10..13)

- FE-CHAT-10 `api.ts` thêm `signal` + giữ nguyên lỗi abort; `chat.ts`: `ChatImage`, `pickImageError`, `prepareImage`, `isAbortError`, `sendChat` mở rộng.
- FE-CHAT-11 i18n 6 khoá vi/en.
- FE-CHAT-12 `ChatWidget.tsx` + css: pill (attach · text · nút tròn gửi/stop), thumbnail + nút xoá, 3 nút biểu tượng header (□ / ❐ / ×, aria-label giữ `chat.expand`/`chat.shrink`/`chat.close`), folder animation có comment credit Uiverse (Cobp, MIT) + `prefers-reduced-motion`.
- FE-CHAT-13 test + chạy lại các file liệt kê ở §3 plan CHAT.

**Done when** (`cd Source/frontend`): `npm run lint && npm run build` pass · `node --test tests/p6/chat-widget.test.mjs` xanh · `npm run test:components` toàn bộ xanh (baseline 1064). Kiểm tra tay: chọn ảnh 4 MB JPG → thấy thumbnail, gửi, bot trả lời theo ảnh; bấm dừng giữa lúc chờ → câu hỏi + ảnh trở lại input, không có lỗi; thu/phóng giữ hội thoại; 360 px không tràn.

| # | Kịch bản | Mong đợi | ID |
|---|---|---|---|
| 1 | gửi kèm ảnh | body có `image: { mediaType, data }`, đúng 1 request | CHAT-11 |
| 2 | gửi câu thứ hai sau khi đã gửi ảnh | body **không** có `image`, lịch sử chỉ text | CHAT-11, CHAT-07 |
| 3 | `pickImageError`: gif, 5 MB (biên), 5 MB + 1 | `chat.imageType`, `null`, `chat.imageTooBig`; lỗi hiện trong `FormError`, không gửi request | CHAT-11 |
| 4 | chọn ảnh thứ hai | thay ảnh cũ, vẫn tối đa 1 | CHAT-11 |
| 5 | nút xoá thumbnail | ảnh bị bỏ, vẫn gửi được câu hỏi text | CHAT-11 |
| 6 | chỉ có ảnh, chưa nhập text | nút gửi disabled, không request | CHAT-01 |
| 7 | đang chờ → bấm dừng | request bị abort, không thêm tin vào lịch sử, draft + ảnh trở lại, **không** hiện thông báo lỗi | CHAT-12 |
| 8 | sau khi dừng, gửi lại | request mới đi bình thường (gồm ảnh) | CHAT-12 |
| 9 | đang chờ | nút tròn là stop (nhãn `chat.stop`), không có nút gửi, attach disabled | CHAT-12 |
| 10 | tải lại (remount) | không còn ảnh, không localStorage | CHAT-07 |
| 11 | header | 3 nút đều có aria-label đúng; toggle phóng/thu giữ hội thoại | CHAT-09, KIT-05 |
| 12 | bàn phím | Tab tới attach / input / gửi theo thứ tự, Esc vẫn đóng và trả focus | KIT-05 |
| 13 | `lang = 'en'` | 6 khoá mới có bản tiếng Anh, không chữ Việt cứng (quét `ex3-i18n`) | LOC-01, LOC-04 |
| 14 | 503 / 429 khi gửi có ảnh | thông báo + số điện thoại như cũ, ảnh vẫn ở input để thử lại | CHAT-03, CHAT-06 |

## 5. Câu hỏi bỏ ngỏ

1. **Nới `useBodyParser` toàn cục lên 3 MB** (§3.1) — (a) đồng ý nới toàn cục (ít code nhất); (b) `bodyParser: false` + tự mount parser 100 kB chung và 3 MB riêng cho `/public/chat` (an toàn hơn, thêm ~10 dòng ở `main.ts` và mọi test tạo app). **Chặn CP-A.**
