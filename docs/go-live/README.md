# Go-live plan

Draft 26/11/2026, after Phase 5 closed. Status: **waiting for the owner's answers to Q-GL-1..10**. Nothing below is built yet.

Rules this plan follows: [01-architecture.md#deployment](../spec/01-architecture.md#deployment) (DEP-01..09) and the open questions in [00-overview.md](../spec/00-overview.md) (Q-01, Q-02, Q-03, Q-04, Q-08, Q-15).

## 1. Where the repo stands (checked 26/11/2026)

| Item | State |
|---|---|
| Features, Phase 1–5 | Done and accepted |
| DEP-01 one origin (SPA + `/api`) | Not set up. The BE serves only `/api/v1` and has no CORS, so a reverse proxy in front of both is required |
| DEP-02 one always-on instance, ≥ 1 GB | No host chosen |
| DEP-03 BE + DB in Singapore | No production DB yet |
| **DEP-04 `TRUST_PROXY_HOPS`** | **In the spec but not in the code.** `src/main.ts` / `src/app.setup.ts` never set `trust proxy`. Behind any proxy, every visitor gets the proxy's IP, so the whole site would share one login and viewing rate limit |
| DEP-05 `NODE_ENV` required | Done (`src/common/env.ts`) |
| DEP-06 CDN caching for `GET /api/v1/public/*` | Not set up |
| DEP-07..09 production DB checklist | Written in the spec, not done yet |
| `.env.example` | Missing `BANK_WEBHOOK_SECRET`, `CLOUDINARY_URL`, `TRUST_PROXY_HOPS`, `PORT` |
| Bank webhook | Only the test adapter (`fakeAdapter`) exists. Q-03 is still open |
| Health check route | None. Hosts and uptime monitors need one |
| CI, backups, monitoring | None in the repo or the spec |
| Contract text | Draft only (Q-15). The print page says "BẢN NHÁP" |
| Electric tiers | Seed values (Q-02) |

## 2. Steps

Each step ends at a checkpoint for the owner, as in the root `CLAUDE.md`.

### GL-1 · Owner decisions (blocking)
Answer Q-GL-1..10 below. GL-2 can start before all of them are answered; GL-4 onward cannot.

### GL-2 · Code gaps that need no outside account
- GL-2a: implement DEP-04: read `TRUST_PROXY_HOPS` (integer ≥ 0, default 0, never `true`), set Express `trust proxy`, and add a test that `req.ip` is the visitor's IP with 1 hop.
- GL-2b: add the missing variables to `.env.example` with one-line comments.
- GL-2c: `GET /api/v1/health` that returns 200 when the DB answers (only if the owner approves Q-GL-6).
- GL-2d: production build check: `npm run build` for both apps, start `node dist/main` with `NODE_ENV=production`, check it refuses to start when a required variable is missing.

### GL-3 · Real bank webhook adapter (after Q-03 / Q-GL-3)
- Read the chosen provider's webhook docs, write its adapter beside `fakeAdapter` (`src/modules/bank/webhook-adapter.ts`), switch the service to it by configuration.
- Tests from the provider's sample payloads: matched, unmatched, duplicate, wrong secret, debit skipped.
- Answer Q-04 from the provider's docs (retries, transaction list API) and record it.

### GL-4 · Infrastructure (owner creates accounts, fills secrets)
- Production DB in Singapore (DEP-03), pooled + direct URLs.
- BE host: one always-on instance, ≥ 1 GB (DEP-02).
- Reverse proxy that serves the SPA `dist/` and forwards `/api/*` to the BE (DEP-01). Set `TRUST_PROXY_HOPS` to the real proxy count.
- Domain, HTTPS, CDN rule for `GET /api/v1/public/*` only (DEP-06).
- Resend sending domain verified (Q-14), Cloudinary production account, new `JWT_SECRET`, new `CCCD_KEY` (32 bytes base64; **keep a copy safe: losing it makes every stored CCCD unreadable**), new `BANK_WEBHOOK_SECRET`.
- Daily DB backup with a tested restore (Q-GL-7).

### GL-5 · Production database
- `prisma migrate deploy` on the empty production DB, then `node prisma/check-constraints.mjs` against it.
- **Never `prisma db seed`** (DEP-07).
- Create the real data the way Q-GL-4 decides, then do DEP-08 steps 1–5 in order.
- Boss fills Settings: `bank_account` (real VietQR account), `default_contact`, contract template (Q-15), email texts if needed.

### GL-6 · Staging rehearsal on the production setup
On the real host, before the domain points at it:
- Every role logs in; no dev password works (DEP-08.5).
- A guest signs up (real email arrives), books a viewing, the manager gets the email.
- One full money loop with a small real transfer: deposit invoice → VietQR → webhook marks it paid.
- Upload a room photo and a contract scan (private).
- Restart the BE and check the start-up catch-up jobs log their summary lines (cron table in 01-architecture).
- Run the backup restore once.

### GL-7 · Go-live day
- Point the domain, watch logs and the webhook for the first day.
- Rollback plan: point the domain back to a maintenance page; the DB keeps its data.

### GL-8 · First month watch
- The 00:05 invoice run on the 1st, the 08:00 reminders, the late-readings email on the 2nd–10th.
- Daily check of `UNMATCHED` bank transactions while the webhook is new.

## 3. Questions for the owner (Q-GL)

| ID | Question | Options |
|---|---|---|
| Q-GL-1 | Hosting for the BE | (a) VPS in Singapore (e.g. DigitalOcean/Vultr ~6 USD/month), we also run the proxy on it; (b) Render/Railway paid always-on plan + a separate static host; (c) other |
| Q-GL-2 | Database | (a) Neon, (b) Supabase — both named in the spec; Singapore region either way |
| Q-GL-3 | Bank webhook provider (Q-03) and bank | (a) SePay, (b) Casso; plus which bank and account receives rent |
| Q-GL-4 | How real data gets in | (a) start from an empty DB; Boss creates buildings, rooms, managers in the app; (b) copy the dev DB and clean it with DEP-09 (then the 141 legacy test rows must be removed first); (c) an import script from a spreadsheet (new work) |
| Q-GL-5 | Domain and CDN | Domain name? Use Cloudflare in front (DEP-06)? |
| Q-GL-6 | Add `GET /api/v1/health` (not in the spec today)? | (a) yes, DB check included; (b) no |
| Q-GL-7 | Backups | (a) rely on the DB provider's built-in backups/point-in-time restore; (b) also a daily `pg_dump` to separate storage |
| Q-GL-8 | Contract text (Q-15) and real electric tiers (Q-02) | Send them before go-live, or go live with draft contract printing disabled for real signing? |
| Q-GL-9 | Q-01: early-leaving tenant still paying — may the room be rented again? | (a) no until the end date; (b) yes, old tenant's overlapping rent unchanged; (c) yes, reduced |
| Q-GL-10 | Go-live scope and date | (a) all buildings at once; (b) one building first for a month, then the rest |
