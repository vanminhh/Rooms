# Feature · Chatbot tư vấn công khai (frontend)

Before you start: root `CLAUDE.md`, `Source/frontend/CLAUDE.md`, `docs/LESSONS.md`, `docs/spec/21-chatbot.md`, D-49 + A-28 in `docs/spec/00-overview.md`, `docs/spec/31-ui-kit.md`, plan `docs/phase-6-chatbot/plans/CHAT/PLAN.md`. Backend: `Source/backend/src/modules/chatbot/feature_chatbot.md`.

| Status | ID | Task | Done when |
|---|---|---|---|
| [x] | FE-CHAT-01 | `chat.ts`: `sendChat`, `roomIdOfPath`, `chatErrorKey`, `splitRoomLinks` | unit cases in `tests/p6/chat-widget.test.mjs` |
| [x] | FE-CHAT-02 | `chat.*` keys in `vi.ts` / `en.ts` | `npm run build` (en is typed against vi), ex3-i18n scan |
| [x] | FE-CHAT-03 | `ChatWidget.tsx` + `chat-widget.css` from the kit (RoomsButton, TextField, FormError, Spinner) | widget cases green |
| [x] | FE-CHAT-04 | mounted in `PublicLayout` (hidden while the entry screen is open, `roomId` on `/phong/:id`, general phone as fallback); `auth-guards` loader and `ex3-i18n` scan updated | full `npm run test:components` green |
| [x] | FE-CHAT-05 | `tests/p6/chat-widget.test.mjs`, `tests/p6` added to `test:components` | 12/12 |
| [ ] | FE-CHAT-06 | Manual with a real key: real answers, room links, English | owner walk |

## Issues log

- (none)

## Questions for the owner

- (none)
