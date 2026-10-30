# Phase 1 · Part 3 – Form pieces in the UI kit (FE-LOGIN-06)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified on the main files. Every task is drafted in `Source/frontend/artifact_FE/` and approved by the owner before it touches main files (root `CLAUDE.md`, "Review before changing main files"). All parts and their order: [README.md](README.md).

| | |
|---|---|
| Needs first | Nothing. Needs no API, so it can be built while parts 1 and 2 are in progress |
| Unblocks | Part 4 (the login and password pages use these pieces) |
| Draft folder | `Source/frontend/artifact_FE/<YYYY-MM-DD>-FE-LOGIN-06/` |
| How | Pipeline |
| Part done when | FE-LOGIN-06 "Done when" on the main files |

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/frontend/CLAUDE.md`
2. `docs/spec/31-ui-kit.md` and `src/components/README.md` – the official UI kit you must build with (KIT-01..08)
3. `docs/spec/30-frontend.md` – rules UI-01..10 (UI-08 accessibility matters most here)
4. `docs/spec/10-auth.md` – the fields these pieces serve (phone, password, "Ghi nhớ đăng nhập")
5. Visual reference, once its `REVIEW.md` says `ĐÃ DUYỆT` (the spec wins where they differ): `Artifacts/layout_rooms/2026-10-26-stitch-mockups/2026-10-28-auth-layouts/ref/`

## Where things go

- Shared, reusable UI → the official kit in `src/components/`. Reuse `RoomsButton`, `RoomsHeader`, `RoomsFooter`, `SectionHeading`, `StatusBadge`; add missing pieces there (KIT-07). No other component folder.

## 1 · Shared pieces

- [x] **FE-LOGIN-06** Add the form pieces the kit does not have yet to `src/components/`: `TextField`, `PasswordField` (toggle "Hiện"/"Ẩn"), `Checkbox`, `FormError`, `Spinner`. Buttons are `RoomsButton`. Style with `rooms.css` tokens inside `.rooms-theme`, export from `index.ts`, add samples to `src/pages/ComponentPreview.tsx` (KIT-07). Each input has a `<label>`, visible focus, error text linked with `aria-describedby` (UI-08).
  Done when: the new pieces show in `/components.html`; `npm run test:components`, `npm run build`, `npm run lint` pass.

## Questions for the owner

- FE-LOGIN-06 Q1: error color. A) new token `--rooms-error: #9b2c1f` (contrast ≈ 6.8 on sand) · B) no new color, `--rooms-accent-text` + bold + left border · C) another color code.
  Answered 28/10/2026: A, `--rooms-error: #9b2c1f`.
- FE-LOGIN-06 Q2: input style. A) full 1px `--rooms-ink` border, `--rooms-paper` background, 50px high like `RoomsButton` · B) underline only, like `RoomSearch` · C) wait for the approved auth-layouts reference (part 4).
  Answered 28/10/2026: A, full border.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
- 28/10/2026 · FE-LOGIN-06 · planner stopped at PLAN.md with two open UI questions (error color, input style); no checkpoint run yet · owner's answer to Q1 and Q2 (answered: A/A)
- 28/10/2026 · FE-LOGIN-06 · CP-2 tester FAIL only because REVIEW.md was still the template (PLAN.md gave it to the coder, but coder.md forbids it) · main session filled REVIEW.md; CP-2 re-test, then reviewer
