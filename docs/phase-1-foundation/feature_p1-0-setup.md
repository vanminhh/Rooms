# Phase 1 · Part 0 – Setup (P1-SETUP-01, 02, FE-LOGIN-02, 03)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[x]` only after its "Done when" is verified on the main files. Changes to main files are drafted and approved first (root `CLAUDE.md`, "Review before changing main files"). All parts and their order: [README.md](README.md).

| | |
|---|---|
| Needs first | Nothing |
| Unblocks | P1-SETUP-01 and 02 unblock part 1; FE-LOGIN-02 and 03 unblock part 4 |
| How | By hand, no pipeline: installs and small config changes |
| Part done when | Every task below is `[x]` |

## Tasks

- [ ] **P1-SETUP-01** Create a Supabase project for development. In Supabase "Connect → ORMs → Prisma", copy `DATABASE_URL` (transaction pooler, port 6543, ending `?pgbouncer=true`) and `DIRECT_URL` (port 5432) into `Source/backend/.env`. Never paste them into chat or commit them.
  Done when: `Source/backend/.env` has both variables and `git status` does not list it.
- [x] **P1-SETUP-02** Backend packages for part 1 and 2, in `Source/backend` (the backend pins exact versions):
  `npm install --save-exact @prisma/client@6.19.3 argon2@0.45.1 @nestjs/jwt@12.0.3 cookie-parser@1.4.7 class-validator@0.15.1 class-transformer@0.5.1`
  `npm install --save-exact -D prisma@6.19.3 @types/cookie-parser@1.4.10`
  `@nestjs/observe` is removed in BE-LOGIN-01. No `dotenv` or `tsx`: Node 24 reads `.env` files and runs `.ts` files; add `tsx` only if `prisma/seed.ts` cannot run without it.
  Done when: `npm run build` and `npm run test` still pass.
- [x] **FE-LOGIN-02** Install `react-router` (v7), `@tanstack/react-query` (v5), `react-hook-form`, `zod`, `@hookform/resolvers`.
  Versions checked 28/10/2026: `react-router@7.18.5`, `@tanstack/react-query@5.105.0`, `react-hook-form@7.91.0`, `zod@4.6.7`, `@hookform/resolvers@6.0.1` (the frontend keeps `^` ranges like its other packages).
  Done when: `npm run build` passes.
- [x] **FE-LOGIN-03** Vite dev proxy: `/api` → `http://localhost:3000` so cookies are same-origin (no CORS). API base path `/api/v1`.
  Must be on the main files before part 4 starts: a proxy inside a draft folder has no effect.
  Done when: `vite.config.ts` on the main files has the proxy and `npm run build` passes; it is checked against the running API in part 4.

## Questions for the owner

- None yet.

## Issues log

<!-- date · task ID · what failed · what is needed -->
