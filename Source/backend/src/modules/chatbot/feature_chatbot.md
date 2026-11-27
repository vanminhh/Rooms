# Feature · Chatbot tư vấn công khai (backend)

Before you start: root `CLAUDE.md`, `Source/backend/CLAUDE.md`, `docs/LESSONS.md`, `docs/spec/21-chatbot.md`, D-49 + A-29 in `docs/spec/00-overview.md`, plan `docs/phase-6-chatbot/plans/CHAT/PLAN.md`.

Owner decisions (26/11/2026): Claude Haiku 5.5, public visitors only, handoff = room page + building phone, nothing stored, 4 model calls / 15 s per answer, dependency `@anthropic-ai/sdk@1.14.0` approved.

| Status | ID | Task | Done when |
|---|---|---|---|
| [x] | BE-CHAT-01 | `CHAT_UNAVAILABLE` 503 in `ErrorCode`/`ERRORS` + `ERRORS_EN`; `app.setup.spec.ts` 34 codes | app.setup + i18n specs green |
| [x] | BE-CHAT-02 | `dto/chat.dto.ts` (1–20 alternating messages, 1–500 chars after trim, optional `roomId`) + `FIELDS_EN` + i18n scan list | HTTP 400 cases green |
| [x] | BE-CHAT-03 | `anthropic.provider.ts` (null without key), `.env.example`, `ANTHROPIC_API_KEY: ''` in both vitest configs | boot-without-key case green |
| [x] | BE-CHAT-04 | `chat-prompt.ts` frozen instructions (cache_control) + per-request facts block | prompt rules case green |
| [x] | BE-CHAT-05 | `chat-tools.ts`: 4 read-only tools over `PublicRoomsService`/`PublicBuildingsService`, inputs validated by the existing DTOs | tool cases green |
| [x] | BE-CHAT-06 | `chatbot.service.ts`: rate limit 20/IP/h, toolRunner (4 calls, 15 s, effort low), errors → `CHAT_UNAVAILABLE`, no message text in logs | service cases green |
| [x] | BE-CHAT-07 | controller + module, registered in `AppModule`, public services exported, `prisma.service.spec.ts` updated | full suite green |
| [x] | BE-CHAT-08 | `chatbot.service.spec.ts` + `chatbot.http.spec.ts` | `npm run test` green |
| [x] | BE-CHAT-09 | Manual: real key in `.env`, ask about rooms, off-topic, 21st request, no key | owner walk |
| [x] | BE-CHAT-10 | Spec CHAT-01 image field, CHAT-09 icons, CHAT-11 image, CHAT-12 stop | `docs/spec/21-chatbot.md` |
| [x] | BE-CHAT-11 | `ChatImageDto` (jpeg/png/webp, base64, ≤ 1.5 MB decoded) + `FIELDS_EN`; 3 MB JSON body for `/api/v1/public/chat` only (`app.setup.ts`, express declared) | http cases |
| [x] | BE-CHAT-12 | Image on the last visitor message; prompt line; `clientAbortSignal` + `AbortSignal.any`, no warn on client abort | service cases |
| [x] | BE-CHAT-13 | Tests: 3 service + 15 http cases | `npm run test` 2985/2985 |
| [x] | BE-CHAT-14 | A-29 fix: visitor message 1–500, bot reply in history 1–2000 (owner choice a) | http case; `npm run test` 2986/2986 |

## Issues log

- (none)

## Questions for the owner

- A-29 limits are still an assumption (20/IP/h, 20 messages, 500 chars).
