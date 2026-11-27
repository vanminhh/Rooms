# Phase 6 · Chatbot – progress

## 26/11/2026 · CP-1 backend (BE-CHAT-01..08)

- Spec: `docs/spec/21-chatbot.md` (CHAT-01..07), D-49, A-29, error `CHAT_UNAVAILABLE`. D-20 now defers only Zalo reminders and e-signature.
- Owner: Claude Haiku 5.5; public only; handoff = room page + building phone; no storage; 4 calls / 15 s per answer; `@anthropic-ai/sdk@1.14.0` installed with approval (npm removed the `--no-save` `@electric-sql/pglite`; reinstall before a DB check).
- Plan: `plans/CHAT/PLAN.md` (planner).
- Checks: backend `npm run test` 150 files / 2967 tests pass; `npm run lint` 0 errors (4 old warnings in other specs); `npm run build` pass. Manual check with a real key not done (needs the owner's key).
- Next: CP-2 frontend (FE-CHAT-01..05) after the owner verifies and commits CP-1.

## 26/11/2026 · CP-2 frontend (FE-CHAT-01..05)

- Bubble "Hỏi trợ lý" on every public page (not while the entry screen is open); panel with intro, history, 500-char box, busy/limit messages with the room's building phone (from the loaded room page) or the general contact phone; Escape closes; nothing stored.
- Checks: `npm run lint` pass; `npm run build` pass; `tests/p6/chat-widget.test.mjs` 12/12; `npm run test:components` run 1: 1063/1064 (ex4-entry-screen focus test timed out under load, passed 12/12 alone), run 2: 1064/1064.
- Browser (dev server + local backend without key): bubble opens, question gets 503 → spec busy message + phone; 375 px wide panel fits (no horizontal scroll).
- Not checked: real answers (needs the owner's key).

## 26/11/2026 · CP-1 + CP-2 committed by the owner (up to `d367cab`)

- Open: manual walk with a real key (BE-CHAT-09, FE-CHAT-06), postponed by the owner; owner confirmation of A-29 limits (20/IP/h, 20 messages, 500 chars, bubble on all public pages).
- Before any DB checker run: reinstall `@electric-sql/pglite@0.2` with `--no-save` (removed by the SDK install).

## 27/11/2026 · Manual walk with the owner's real key (BE-CHAT-09, FE-CHAT-06)

- Owner put `ANTHROPIC_API_KEY` in `Source/backend/.env`; backend restarted after the edit.
- vi, no room: "Phòng dưới 4 triệu ở Cầu Giấy?" → room 204, Tòa Cầu Giấy, 2.400.000 đ, deposit 2.400.000 đ, link `/phong/2`; matches `GET /public/rooms` (1 result) and `/public/rooms/2`.
- en, on `/phong/2` in the browser: answer in English with 2.400.000 đ, estimate 2.530.000 đ (Wifi 100.000 + waste 30.000), deposit, clickable `/phong/2`, building phone 0900000002 (= room contact).
- Off-topic ("bài thơ về bóng đá") → polite refusal (CHAT-04).
- No key → busy message + phone (owner screenshot, 26/11/2026).
- Not walked by hand: the 21st request in an hour (would lock this IP for an hour); covered by unit/HTTP tests.

## 27/11/2026 · Chatbot limits confirmed

- Owner kept the chatbot limits (20/IP/h, 20 messages, 500 chars, bubble on all public pages). The ID was renumbered A-28 → **A-29**: A-28 already belonged to the contract-services assumption (BE-P3-26). Only the chatbot files were renamed; code behavior unchanged.

## 27/11/2026 · Suggested questions (CHAT-08, FE-CHAT-07)

- Owner: show only before the first question; tap sends at once; room-page set vs general set (texts in `docs/spec/21-chatbot.md` CHAT-08), English translated.
- Checks (`Source/frontend`): `npm run lint` pass; `npm run build` pass; `tests/p6/chat-widget.test.mjs` 14/14; `npm run test:components` 1066/1066.
- Browser on `/phong/2`: the 3 room suggestions show under the greeting; with the backend stopped a tap shows the generic error and the suggestions stay for a retry; no horizontal overflow. A real answer from a tapped suggestion was not walked (backend was off).

## 27/11/2026 · Chat look: visitor-side suggestions, expand, room cards (CHAT-08..10, FE-CHAT-07..09)

- Owner: suggestions belong to the visitor (right side); an expand button (640 px × 85% height, still floating); room cards with photo under replies (first 3 distinct rooms, from `GET /public/rooms/:id`, no extra model call).
- Greeting, history, suggestions and cards now scroll together, so the greeting is no longer cut off by the suggestions.
- Checks (`Source/frontend`): `npm run lint` pass; `npm run build` pass; `tests/p6/chat-widget.test.mjs` 16/16; `npm run test:components` 1068/1068.
- Browser with the real key, `/phong`, 1280 px: tapped "Phòng cho nuôi thú cưng?" → real answer with rooms 101 and 204, two cards (dev rooms have no photos, so "Chưa có ảnh"); expanded panel stays below the site header; 375 px: panel 16 px gutters, no horizontal overflow, cards readable.
