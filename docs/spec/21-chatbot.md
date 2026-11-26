# 21 · Chatbot tư vấn (public room advice)

Decision: D-49 in [00-overview.md](00-overview.md) (owner 26/11/2026, lifts the chatbot part of D-20). Limits: A-28.

A chat bubble on the public pages answers people looking for a room. It only reads public data, the same data the public pages already show (ROOM-05, PUB-01..04). It has no login, stores nothing, and books nothing itself.

| ID | Rule |
|---|---|
| **CHAT-01** | `POST /api/v1/public/chat`, no auth. Body: `messages` = the whole conversation so far, `[{ role: 'user' \| 'assistant', content: string }]`, 1–20 items, alternating, first and last `user`, each `content` 1–500 characters after trim; optional `roomId` (positive int) = the room page the visitor is on. Answer `{ data: { reply: string } }`. Anything else → `VALIDATION_FAILED`. Never cached (`Cache-Control: no-store`). |
| **CHAT-02** | The model is Claude Haiku 5.5 (`claude-haiku-5-5`) through the Claude API, key `ANTHROPIC_API_KEY` (filled by the owner). The bot may only call read-only tools backed by the existing public services: search rooms (PUB-01 filters), room detail with the monthly estimate (ROOM-08, A-05), locations, building detail. No tool reads private data, writes, or books. |
| **CHAT-03** | At most 20 chat requests per IP per hour (A-28) → `TOO_MANY_REQUESTS`; the FE then shows the building's phone (or the general message when no room is known). |
| **CHAT-04** | The bot answers only about renting rooms in Rooms buildings, from tool data. It never invents a room, a price or a rule; money is shown as integer đồng (G-01, LOC-05). It replies in English when the visitor writes English, otherwise in Vietnamese (LOC-01 public pages). Off-topic questions get a short polite refusal. |
| **CHAT-05** | Handoff: to visit or rent, the bot gives the room page link `/phong/<id>` (booking a viewing there needs an account, D-28) and the building's contact phone from the public data. It does not take names or phones in the chat. |
| **CHAT-06** | When the key is missing, the provider fails, or the model refuses, the API answers `CHAT_UNAVAILABLE` (503) and the FE shows "Trợ lý đang bận. Vui lòng gọi số điện thoại của tòa nhà hoặc đặt lịch xem phòng." The app still starts without the key. Raw provider errors are never shown. |
| **CHAT-07** | Nothing about the chat is stored on the server (no table, no audit row, no log of message text). The conversation lives in the browser tab and is gone on reload. |

Error code added: `CHAT_UNAVAILABLE` 503 (see [01-architecture.md](01-architecture.md#error-codes)).
