# Go-live – task file (GL-01..GL-30)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order inside a part. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to [LESSONS.md](../LESSONS.md) any mistake that cost a retry.

**Who** on a task: `agent` = the session writes it; `owner` = only the owner can do it (accounts, payments, secrets, real passwords, DNS). The agent never creates accounts, fills `.env*`, types real passwords or secrets, or pays for anything; for an `owner` task the agent writes the exact steps and waits.

**Ask first, every time** (rule 7): applying a migration to any database, deleting files, installing a dependency. Production DB actions are always `owner` or agent-with-approval-in-chat for that one action.

| | |
|---|---|
| Plan and open questions | [README.md](README.md) – §1 state of the repo, §3 Q-GL-1..10 |
| Spec | `docs/spec/01-architecture.md` § Deployment (DEP-01..09), § Cron; `docs/spec/17-bank.md`; `docs/spec/20-reports-audit-settings.md` (settings keys, env vars) |
| How | main session builds; reviewer before the stop of GL-B and GL-C (security, money) |
| Done when | GL-30: the domain serves production, one real transfer was matched by the webhook, the first month's runs passed |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md`, `Source/frontend/CLAUDE.md`, `docs/LESSONS.md`
2. [README.md](README.md) of this folder, and the owner's answers to Q-GL-1..10 (in the table there; empty = not answered yet)
3. `docs/spec/00-overview.md` (open questions Q-01, Q-02, Q-03, Q-04, Q-08, Q-15), `docs/spec/01-architecture.md` § Deployment and § Cron
4. Code: `Source/backend/src/main.ts`, `src/app.setup.ts` (+ `app.setup.spec.ts`), `src/common/env.ts`, `src/modules/bank/webhook-adapter.ts`, `Source/backend/.env.example`

## Parts and gates

| Part | Needs first | Can start now? |
|---|---|---|
| GL-A Owner decisions | – | yes (owner) |
| GL-B Code gaps without outside accounts | nothing for GL-01..03; Q-GL-6 for GL-04 | **yes** |
| GL-C Real bank webhook adapter | Q-GL-3 answered | no |
| GL-D Deploy files | Q-GL-1, Q-GL-5 answered | no |
| GL-E Infrastructure | GL-A, GL-D | no (owner) |
| GL-F Production database | GL-E | no |
| GL-G Rehearsal on production setup | GL-C, GL-F | no |
| GL-H Go-live and first month | GL-G accepted | no |

## Tasks

### GL-A · Owner decisions (Who: owner)

- [ ] **GL-01** Owner answers Q-GL-1..10 in [README.md](README.md) §3. The agent copies each answer into the table with the date and, where it changes a rule, adds a D-xx line to `docs/spec/00-overview.md` and the spec file it changes (Q-01 → contracts/billing spec; Q-03 → `17-bank.md`; Q-GL-6 → `01-architecture.md`).
  Done when: every Q-GL row has an answer or the owner's "later"; no spec file contradicts an answer.

### GL-B · Code gaps (Who: agent)

- [x] **GL-02** DEP-04: read env `TRUST_PROXY_HOPS` (integer 0..10, default 0; anything else, including `true`, makes `validateEnv` fail at start) and set Express `trust proxy` to that number in `configureApp`. Keep `REQUIRED_ENV` unchanged (it has a default).
  Done when: tests named `DEP-04`: with 1 hop and `X-Forwarded-For: 1.2.3.4` the login rate limit keys on `1.2.3.4`; with 0 hops it keys on the socket IP; `TRUST_PROXY_HOPS=true` → start-up error. Backend lint + test + build pass.
  Verified on the dev host (owner screenshot, 26/11/2026): 145/145 test files and 2911/2911 tests passed.
- [x] **GL-03** `.env.example`: add `BANK_WEBHOOK_SECRET`, `CLOUDINARY_URL`, `TRUST_PROXY_HOPS`, `PORT`, `PRISMA_TX_TIMEOUT_MS` with a one-line comment each (what it is, format, default). Add a comment on `CCCD_KEY`: 32 bytes base64, losing it makes stored ID numbers unreadable. No values.
  Done when: every `env.X` / `process.env.X` read in `src/` (grep) appears in `.env.example`.
- [!] **GL-04** Only if Q-GL-6 = yes: `GET /api/v1/health`, public, `no-store`, answers 200 `{ status: "ok" }` after `SELECT 1`, 503 when the DB does not answer; no version or env in the body. Lessons: a new module breaks the module-list test in `prisma.service.spec.ts`; a new error code breaks the count in `app.setup.spec.ts`.
  Done when: HTTP tests for 200 and 503; no auth needed; lint + test + build pass.
  Verification pending: both routed responses passed in-process. Supertest TCP connections returned EACCES before routing. Run the full backend suite on the dev host.
- [ ] **GL-05** ⏸ Production build check: `npm run build` in both apps; start `node dist/main` with `NODE_ENV=production` and a missing `JWT_SECRET` → refuses to start; with all variables → starts, cron jobs register, refresh cookie has `Secure` (AUTH-T2). Frontend `npm run lint`, `npm run test:components`. Reviewer once on GL-02..04.
  Done when: real outputs in the report; reviewer report included.

### GL-C · Real bank webhook adapter (Who: agent; needs Q-GL-3)

- [ ] **GL-06** Read the chosen provider's official webhook docs (SePay or Casso): auth method, payload fields, retries, transaction-list API. Write the findings and the answer to **Q-04** into `docs/spec/17-bank.md` with the doc URL. Expected values in tests come only from these docs (LESSONS: never invent expected values).
  Done when: the owner confirms the spec text.
- [ ] **GL-07** Adapter for the provider beside `fakeAdapter` in `src/modules/bank/webhook-adapter.ts`, same `BankWebhookAdapter` interface; selected by configuration; `fakeAdapter` stays for tests only and must not be selectable when `NODE_ENV=production`. Ask first if the provider needs a new dependency.
  Done when: tests named `BANK-xx` from the provider's sample payloads: matched, unmatched (wrong amount, unknown code, other account), duplicate delivery, wrong secret → 401 and nothing stored, debit skipped.
- [ ] **GL-08** ⏸ Backend lint + test + build + e2e of the bank files; reviewer (money, security).
  Done when: real outputs and reviewer report.

### GL-D · Deploy files (Who: agent; needs Q-GL-1, Q-GL-5)

- [ ] **GL-09** Write `deploy/README.md` for the chosen host: how the SPA `dist/` is served and `/api/*` forwarded on one origin (DEP-01), HTTPS, `TRUST_PROXY_HOPS` value for this setup (count the proxies, Cloudflare included), one always-on instance ≥ 1 GB (DEP-02), Singapore region (DEP-03), process restart on crash and on reboot, log location. Plus only the config files that host needs (for a VPS: proxy config and a service file; for a PaaS: its config file). No Docker unless the host requires it.
  Done when: the owner reads it and confirms every step is something they can do.
- [ ] **GL-10** CDN rule (DEP-06): only `GET /api/v1/public/*` cached 60 s; everything else bypass. Write it as steps in `deploy/README.md`.
  Done when: listed with how to check (`cf-cache-status` or the CDN's header).
- [ ] **GL-11** Backup and restore steps for Q-GL-7, in `deploy/README.md`, including one restore test into a separate database.
  Done when: steps written; restore test is GL-24.
- [ ] **GL-12** ⏸ Report.

### GL-E · Infrastructure (Who: owner; agent writes the checklist and checks)

- [ ] **GL-13** Owner creates: production DB (Singapore), BE host, domain/DNS, CDN, Resend sending domain (Q-14), production Cloudinary, bank webhook account (Q-GL-3).
- [ ] **GL-14** Owner fills the production env on the host: new `JWT_SECRET`, new `CCCD_KEY` (stored safely outside the host too), new `BANK_WEBHOOK_SECRET`, `APP_URL` = real domain, `NODE_ENV=production`, `TRUST_PROXY_HOPS`, `MAIL_*`, `CLOUDINARY_URL`, `DATABASE_URL` (pooled) and `DIRECT_URL`. Never reuse dev values.
  Done when: the agent has checked (without reading secret values) that the app starts and `validateEnv` passes.
- [ ] **GL-15** ⏸ Report: what exists, what is missing.

### GL-F · Production database (Who: owner, or agent with approval per action)

- [ ] **GL-16** `prisma migrate deploy` on the empty production DB (**ask first**), then `node prisma/check-constraints.mjs` against it. **Never `prisma db seed`** (DEP-07).
  Done when: migration list matches `prisma/migrations/`; checker count is all green (real count).
- [ ] **GL-17** Real data as Q-GL-4 decides. If (b) copy of dev: first the 141 legacy test rows follow-up, then DEP-09. If (c) import script: a separate task list, asked first.
- [ ] **GL-18** DEP-08 in order: (1) Boss changes phone and password **in the app** (owner types it), `must_change_password` off; (2) public contact and `settings.default_contact`; (3) dev managers and tenants `is_active = false`; (4) sample buildings/rooms/contract removed or locked; (5) check that no dev password logs in.
  Done when: step 5 tried for all 6 dev phones (`0900000001`..`06`) and each is refused.
- [ ] **GL-19** Boss fills Settings: `bank_account` (real VietQR account), `default_contact`, contract template (Q-15; if still draft, the owner decides per Q-GL-8), electric tiers per building (Q-02).
- [ ] **GL-20** ⏸ Report.

### GL-G · Rehearsal on the production setup, before DNS points to it (Who: agent + owner)

Write results in `docs/go-live/gl-rehearsal-checklist.md` (same style as `docs/phase-5-operations/p5-9-qa-checklist.md`).

- [ ] **GL-21** Each role logs in and lands in its layout; a guest signs up with a real email and receives the code; books a viewing; the manager gets the email.
- [ ] **GL-22** Money loop with a small real transfer (owner pays): deposit invoice → VietQR → webhook → invoice PAID, staff inbox row. One transfer with a wrong amount stays `UNMATCHED` with a note.
- [ ] **GL-23** Upload a room photo and a contract scan; the scan only opens through a signed URL (CON-16). Rate limits see real visitor IPs (DEP-04: two devices on different networks are counted apart).
- [ ] **GL-24** Restart the BE: start-up catch-up jobs log their summary lines (cron table). Restore the backup into a separate DB once (GL-11).
- [ ] **GL-25** ⏸ Checklist complete; owner accepts.

### GL-H · Go-live and first month (Who: owner + agent)

- [ ] **GL-26** Owner points the domain. Agent checks: HTTPS, `/` loads the SPA, `/api/v1/public/*` is cached, login cookie is `Secure`.
- [ ] **GL-27** Rollback plan written in `deploy/README.md`: point the domain to a maintenance page; the DB keeps its data; no `migrate reset`, ever.
- [ ] **GL-28** First week: daily check of logs and `UNMATCHED` bank transactions; findings in PROGRESS.md.
- [ ] **GL-29** First billing month: the 00:05 run on the 1st, 08:00 reminders, late-readings email 2nd–10th (NOTI-10); each logged summary checked.
- [ ] **GL-30** ⏸ Owner closes go-live.

## Questions for the owner

<!-- Q-GL-1..10 are in README.md §3. New questions go here and in that table. -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->

- 26/11/2026 - GL-02 / DEP-04: two login HTTP tests blocked before reaching the handler. Resolved by the subsequent full dev-host run (2911/2911 passed).
- 26/11/2026 - GL-04 (DEP-10): waiting for the dev-host backend test result after adding the health route.
- 26/11/2026 - GL-04: dev-host suite 2912/2913. Updated stale AppModule controller assertion for DEP-10. Affected file passed 7/7 on rerun, full post-fix run pending.
