# Feature · Chatbot tư vấn công khai (frontend)

Before you start: root `CLAUDE.md`, `Source/frontend/CLAUDE.md`, `docs/LESSONS.md`, `docs/spec/21-chatbot.md`, D-49 + A-29 in `docs/spec/00-overview.md`, `docs/spec/31-ui-kit.md`, plan `docs/phase-6-chatbot/plans/CHAT/PLAN.md`. Backend: `Source/backend/src/modules/chatbot/feature_chatbot.md`.

| Status | ID | Task | Done when |
|---|---|---|---|
| [x] | FE-CHAT-01 | `chat.ts`: `sendChat`, `roomIdOfPath`, `chatErrorKey`, `splitRoomLinks` | unit cases in `tests/p6/chat-widget.test.mjs` |
| [x] | FE-CHAT-02 | `chat.*` keys in `vi.ts` / `en.ts` | `npm run build` (en is typed against vi), ex3-i18n scan |
| [x] | FE-CHAT-03 | `ChatWidget.tsx` + `chat-widget.css` from the kit (RoomsButton, TextField, FormError, Spinner) | widget cases green |
| [x] | FE-CHAT-04 | mounted in `PublicLayout` (hidden while the entry screen is open, `roomId` on `/phong/:id`, general phone as fallback); `auth-guards` loader and `ex3-i18n` scan updated | full `npm run test:components` green |
| [x] | FE-CHAT-05 | `tests/p6/chat-widget.test.mjs`, `tests/p6` added to `test:components` | 12/12 |
| [x] | FE-CHAT-06 | Manual with a real key: real answers, room links, English | owner walk |
| [x] | FE-CHAT-07 | CHAT-08 suggested questions (general / room page) on the visitor side (right), tap sends, hidden after the first question | 2 cases in `tests/p6/chat-widget.test.mjs`; full `test:components` green |
| [x] | FE-CHAT-08 | CHAT-09 expand / shrink (640 px, 85% height, floating) | case in `tests/p6`; browser check 1280 and 375 px |
| [x] | FE-CHAT-09 | CHAT-10 room cards (first photo, code, building, rent; first 3 distinct rooms; none on load failure) | case in `tests/p6`; browser check with the real bot |
| [x] | FE-CHAT-10 | `api.ts` abort signal (AbortError rethrown as is); `chat.ts` image pick/shrink/send, `isAbortError` | `tests/p6` CHAT-11/12 cases |
| [x] | FE-CHAT-11 | i18n: placeholder, attach, remove image, image alt, stop, 3 image errors | build + ex3-i18n scan |
| [x] | FE-CHAT-12 | CHAT-09 icon head (□/❐, ×); pill composer with Uiverse folder attach (credited, kit colours, reduced motion), round send / red stop; image preview + history image | `tests/p6` 22/22; browser 1280 + 375 px |
| [x] | FE-CHAT-13 | CHAT-11/12 tests (image once, wrong type/size, remove, stop keeps question+image, stopped suggestion back in box) | 22/22 |

## Issues log

- (none)

## Questions for the owner

- (none)
