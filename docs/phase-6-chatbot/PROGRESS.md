# Phase 6 · Chatbot – progress

## 26/11/2026 · CP-1 backend (BE-CHAT-01..08)

- Spec: `docs/spec/21-chatbot.md` (CHAT-01..07), D-49, A-28, error `CHAT_UNAVAILABLE`. D-20 now defers only Zalo reminders and e-signature.
- Owner: Claude Haiku 5.5; public only; handoff = room page + building phone; no storage; 4 calls / 15 s per answer; `@anthropic-ai/sdk@1.14.0` installed with approval (npm removed the `--no-save` `@electric-sql/pglite`; reinstall before a DB check).
- Plan: `plans/CHAT/PLAN.md` (planner).
- Checks: backend `npm run test` 150 files / 2967 tests pass; `npm run lint` 0 errors (4 old warnings in other specs); `npm run build` pass. Manual check with a real key not done (needs the owner's key).
- Next: CP-2 frontend (FE-CHAT-01..05) after the owner verifies and commits CP-1.

## 26/11/2026 · CP-2 frontend (FE-CHAT-01..05)

- Bubble "Hỏi trợ lý" on every public page (not while the entry screen is open); panel with intro, history, 500-char box, busy/limit messages with the room's building phone (from the loaded room page) or the general contact phone; Escape closes; nothing stored.
- Checks: `npm run lint` pass; `npm run build` pass; `tests/p6/chat-widget.test.mjs` 12/12; `npm run test:components` run 1: 1063/1064 (ex4-entry-screen focus test timed out under load, passed 12/12 alone), run 2: 1064/1064.
- Browser (dev server + local backend without key): bubble opens, question gets 503 → spec busy message + phone; 375 px wide panel fits (no horizontal scroll).
- Not checked: real answers (needs the owner's key).
