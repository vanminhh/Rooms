# Lessons – mistakes already made in this project

Read this before the first task of any part. Each line is a mistake that really happened (source in brackets) and the rule that prevents it. Keep it short: one line per lesson, no stories.

**Adding a lesson.** At a checkpoint, if something failed and cost a retry (a wrong assumption, a broken old test, a command that needed a special setup), add one line under the right heading: `- <rule>. <what happened, one clause> [<task ID>, dd/mm/yyyy]`. Do not add things the spec or `CLAUDE.md` already says, and do not add one-off typos. If a lesson stops being true, delete it.

## Tests and expected values

- Use a numeric comparator when sorting HTTP status codes in test assertions. Bare `.sort()` triggered the type-aware lint warning [GL-02, 26/11/2026].
- Search every exact-menu assertion when extending navigation, including mounted auth-login-flow tests; updating only the guard/layout fixtures left two stale expected arrays and failed the owner's full suite [FE-P3-01, 20/11/2026].
- Use typed vi.spyOn(...).mockResolvedValue/mockRejectedValue on Prisma delegates in fixtures; replacing a generic PrismaPromise method with an async vi.fn caused scoped noEmit failures even though the tests passed [BE-P3-27, 20/11/2026].
- Test both hostname and literal-IP connections before trusting a Node loopback guard: createConnection passes a normalized argument array into Socket.connect, so normalizing it twice missed the direct-IP check [BE-P3-27, 20/11/2026].
- A returned test session ID is not proof of a completed run: asynchronous auto-review blocked the BE-P3-24 full-suite result and no JSON was produced; report the verified scoped results separately from that blocked attempt [BE-P3-24, 20/11/2026].
- Run scoped noEmit for new HTTP specs as well as Vitest and lint; Supertest.send rejected an unknown-typed test body even though the native HTTP suite passed, fixed with an erased test-only type assertion [BE-P3-20, 20/11/2026].
- Adding a seeded setting also changes EXPECTED_COUNTS in seed.spec.ts; the draft contract template made the repeatable-seed check fail at two settings instead of the spec's three [BE-P3-18, 19/11/2026].
- Do not assert a specific dash glyph for optional print data when the spec does not choose one; the missing-signer-details fixture failed on hyphen versus em dash [BE-P3-18, 19/11/2026].
- Mark a transaction-barrier promise as intentionally ignored when the awaited service call already waits for that transaction; seven race setup calls failed no-floating-promises lint [BE-P3-17, 19/11/2026].
- Recurse through arrays when projecting nested Prisma SELECTs in an HTTP fake; treating an invoice relation as an object broke the contract detail serializer after signing [BE-P3-15, 19/11/2026].
- When removing an INSERT column, check each VALUES tuple that reuses the column list through `.replace(...)`. The renewal scenario retained two `billing_day` values and failed before checking the renewal constraint [BE-P3-03, 16/11/2026].
- Keep translated validation literals in the files scanned by the field-catalog test; adding warning copy in reservations made the exact catalog check fail until it moved to VIEWING_FIELDS [BE-EX-24, 16/11/2026].
- Compare fake-DOM element identity with a boolean assertion and a short message; strict equality on different cyclic DOM objects stalled formatting the expected failure [FE-EX-27, 16/11/2026].
- The custom kit loader in `auth-login-flow.test.mjs` must include every new component used by a layout; omitting `LanguageSwitch` made unrelated auth flows fail with an invalid React element [FE-EX-09, 13/11/2026].
- Never invent an expected value. Take it from the spec or the provider's documentation and name the source in the test. A planner once wrote a Cloudinary signature hash that was partly made up [BE-P2-07, 01/11/2026].
- Adding an error code breaks the count test in `Source/backend/src/app.setup.spec.ts`; update it in the same change [BE-P2-02, 01/11/2026].
- Adding a key to `DB_ERROR_MAP` breaks the exact-key test in `db-errors.spec.ts`, and a new field in `Me` breaks `ME_KEYS` in `auth.me.spec.ts` and `auth.account.spec.ts` (keep that list in alphabetical order); update them in the same change [BE-EX-34, 12/11/2026].
- Frontend route tests (`auth-guards.test.mjs`, `p2/cp1-routes.test.mjs`) read `routes[0..2]`, stub every page import by path, and count the `GuestOnly` children: a new route block goes at the end of the array and each new page needs a stub there [FE-EX-03, 13/11/2026].
- Changing a field to a fixed list (amenities → codes) turns every old test that sends free text into a 400, including e2e specs on the dev DB (`buildings.e2e-spec.ts`) and the out-of-scope check, because validation runs before the scope check; grep the field in `test/` before the first run [BE-EX-14, 13/11/2026].
- A component that starts calling a new endpoint on mount (`GET /public/filters` in `RoomForm`, `AmenityField`, the public pages) breaks every old frontend test whose fake `fetch` returns `[]` for unknown URLs or counts requests: answer the new URL in the shared fake (`public-dom.mjs`, and the local fakes of `cp5`, `cp7`, `cp8`) and keep it out of `calls`; a page that waits for labels needs `until(...)` in the test, not a read right after the main data [FE-EX-18..20, 13/11/2026].
- The full `npm run test:components` run can fail 4-5 timing-sensitive tests (approvals, pricing) under load while each passes alone; rerun the failing files alone and the whole suite once before treating it as a regression [13/11/2026].
- If the frontend suite hits `Array buffer allocation failed` under load, rerun the same file list with `node --test --test-concurrency=2`; the isolated entry-screen test and the limited-concurrency suite passed [FE-CHAT-03, 27/11/2026].
- Changing the URL the route guard builds (`/dang-nhap?loi-vao=…&next=…`) turns red every test that asserts a login redirect: grep `dang-nhap?next=` in `tests/` (auth-guards, auth-login-flow, ex4-entry-screen, p3/fe01-skeleton) before the first run [FE-LP-01, 20/11/2026].
- The in-memory Prisma fake of `seed.spec.ts` accepted a compound key (`roomId_kind_readOn`) that the schema had dropped, so the seed stayed green in unit tests and broke every e2e that calls `seed()`; a test now checks each fake compound key against `schema.prisma`. When a unique key moves to a partial index, change the seed from `upsert` to `findFirst` + `create` [QA-P3-02, 22/11/2026].
- On the remote dev DB (0,3–0,8 s per query) two requests that queue on one advisory lock can pass the 30 s interactive-transaction timeout, because the lock wait counts toward it; the second one fails with 500 `Transaction already closed`. Run the case alone before calling it a logic bug (VIEW-16/21 passed alone) [QA-P3-02, 22/11/2026].
- A mutation check can pass silently when the in-memory fake returns the same answer on both paths (a GUEST fell into the manager query and still got `[]`); assert the call itself (`findMany` not called) so the mutant turns red [BE-EX-08, 13/11/2026].
- Adding a module to `AppModule` breaks the module-list test `prisma.service.spec.ts` (BE-LOGIN-19); update it in the same change [BE-P2-10, 02/11/2026].
- Moving code into `prisma.$transaction` breaks HTTP specs whose Prisma mock has no `$transaction`; extend the mock (`test/fixtures/fake-prisma.ts` or the spec's own) [BE-P2-17, 03/11/2026].
- A Nest exception's `getResponse()` is an object (`{ code, message, fields }`), not a string; assert on its fields [BE-P2-11, 02/11/2026].
- `npm run test` and the linters also scan the old draft folders `artifact_BE/` and `artifact_FE/` (not `approved/`). Before "fixing" a red test, check its path: it may be an old draft's test [BE-LOGIN-24, 29/10/2026; BE-P2-16, 03/11/2026].
- `npm run test:components` once failed with exit 1 on the first run and passed on the second; re-run once before hunting, and report both runs [P2-QA-02, 06/11/2026].

## Backend rules that reviewers had to catch

- Cleanup protection must follow VEHICLE services through vehicles as well as contract_services, including inactive history; a protected contract otherwise kept its room/users but lost its parking catalog service [BE-P3-27, 20/11/2026].
- Reject NUL in text search DTOs before Prisma. PostgreSQL rejects U+0000 in text parameters even though the value passes string validation [BE-P3-10, 17/11/2026].
- Match the Prisma SELECT in fixtures when a shared serializer reads dates from the returned row. The POST smoke fixture needed its selected dates before exercising the new serializer [BE-P3-10, 17/11/2026].
- Route a pending tenant's unusable password marker through the same Argon2 work as an unknown phone. The marker alone made failed logins for newly created accounts faster [BE-P3-08, 17/11/2026].
- Recheck the guest under the phone and email locks before consuming an OTP and creating a session. Contract creation could replace the account after the old snapshot passed the code check [BE-P3-08, 17/11/2026].
- For contract creation, apply both the request's building scope and the current assignment under the viewing mapping lock. Checking only current assignment let a request acquire newly granted scope mid-flight [BE-P3-07, 17/11/2026].
- Bind the private upload purpose in the Cloudinary signature and verify it using provider metadata. Shared folder and JPG support let a CCCD photo pass as a contract scan before the purpose prefix was checked [BE-P3-04, 16/11/2026].
- A limit that is counted and then written must be safe under parallel requests (lock or conditional update), with a test that really runs requests in parallel. Parallel wrong logins bypassed AUTH-04 [BE-LOGIN-12, 29/10/2026].
- An endpoint that must not reveal whether an account exists needs the same body **and** the same work for both cases; the forgot-password timing revealed accounts [BE-LOGIN-18, 29/10/2026].
- Map a unique-constraint error (Prisma `P2002`, check `meta.target`) to the friendly code; do not let it become a 500 [BE-P2-11, 03/11/2026].
- Validate number inputs against the column's range; a `floor` larger than a Postgres `Int` returned 500 instead of 400 [BE-P2-17, 03/11/2026].
- A `?buildingId=` filter must end up in the Prisma `where` together with the scope fragment; a manager's filter was once read but not applied [BE-P2-17, 03/11/2026].
- "Check, then write" on the same rows goes into one transaction; creating a room did not lock its building [BE-P2-17, 03/11/2026].
- A DTO built with keys set to `undefined` fails "only these fields are allowed" checks; drop undefined keys before the check [BLD-02, 03/11/2026].
- When a new rule makes a field "verified" or "required", re-read every older rule that lets the same field change. A guest could change or clear the email the sign-up code had verified, through the older "everyone may change email" rule [AUTH-09 vs AUTH-12, review 13/11/2026].
- A screen that is fixed to one language must also fix the language its API calls ask for; the staff app showed Vietnamese but sent the browser's `Accept-Language` on `/auth/*` [LOC-01, review 13/11/2026].

## Commands and environment

- When generating Prisma from an isolated temp schema to avoid loading the real .env, use the installed generator's absolute path and client output; the default provider could not resolve @prisma/client from the temp directory [BE-P3-20, 20/11/2026].
- PowerShell reads POWERSHELL_TELEMETRY_OPTOUT during startup; setting it inside exec did not stop telemetry-related auto-review rejection, so do not present that setting as a verified host-egress control [BE-P3-17, 19/11/2026].
- When a backend test stops in `beforeAll` while builds run concurrently, rerun that file alone with a process-local `--hookTimeout` before diagnosing assertion failures. The isolated HTTP test reached the expected loopback restriction, and the same file passed with in-memory HTTP [BE-P3-11, 18/11/2026].
- When the full backend run hits Vitest's per-test limit, retry the affected files with `--maxWorkers=1` and a process-local `--testTimeout` before diagnosing the assertion. The password and Prisma suites passed in isolation after six cases hit the five-second limit [BE-P3-11, 18/11/2026].
- Keep list and apply on the same cleanup policy. Retire owned HOLD fixtures in the E2E hook with the viewing mapping and room locks before checking linked rows and deactivating fixtures [BE-P3-12, 18/11/2026].
- Set `NODE_ENV=test` before importing `AppModule` in an e2e spec that can load the dev `.env`. The price-sync job started against the files fixture with `NODE_ENV=development` [BE-P3-06, 16/11/2026].
- Load and validate the backend `.env` before importing `AppModule`, which registers scheduled jobs based on `NODE_ENV`; a static import made the new startup-order test fail on the full suite [BE-P3-02, 16/11/2026].
- Inspect every selected Vitest file for HTTP hooks before an offline-only run; `common/i18n/i18n.spec.ts` mixed unit assertions with two Supertest cases and attempted loopback requests despite the owner's no-HTTP instruction (both EACCES) [FE-EX-27, 16/11/2026].
- In Windows PowerShell, pipe multiline Node scripts through a literal here-string to stdin; native argument handling stripped JavaScript quotes from a `node -e` command and blocked manual QA startup [FE-EX-27, 16/11/2026].
- For resend.dev smoke checks, use the exact account email returned by the provider; a Gmail address with an uppercase initial received 403 while its lowercase form received 200 [BE-EX-30, 15/11/2026].
- Distinguish a direct provider smoke check from app integration: the managed terminal could not resolve Resend, and importing compiled NestJS in node_repl failed on module interop; HTTPS in that runtime proved credentials only [BE-EX-30, 15/11/2026].
- On this machine the dev DB settings are in `Source/backend/.env` and `Source/.env` does not exist, so `npm run test:e2e` stops with "../.env: not found"; run `node --env-file=.env ./node_modules/vitest/vitest.mjs run --config ./vitest.config.e2e.ts` from `Source/backend` [BE-EX-06, 12/11/2026].
- Once `MAIL_*` is filled in `Source/backend/.env`, `npm run test` on this machine built the Resend mailer, so any spec that boots `AppModule` without overriding `MailerService` could send real mail. Both vitest configs now set `MAIL_PROVIDER: ''`; keep it, and override `MailerService` in new specs that send mail [EX-8 review, 16/11/2026].
- `npm run test:e2e` reads `Source/.env` (the dev database). Without `DATABASE_URL` it fails before connecting and leaves a `FAILED_CLEANUP` log with empty ids [BE-P2-09, 03/11/2026].
- The dev database is slow (about 0.8 s per query): the e2e suite takes minutes and needs the long `testTimeout` already set; do not lower it [BE-P2-29..35, 05/11/2026].
- `scripts/e2e/cleanup.mjs` in list mode is free to run; `--apply` only after the owner agrees [P2-QA-03, 06/11/2026].
- `npm install` removes packages added with `--no-save`; reinstall `@electric-sql/pglite@0.2` before the DB check [P1-QA-04, 30/10/2026].
- The DB check prints the real scenario count (54 after Phase 2). Report the number the checker prints; the `50/50` in older docs is stale [12/11/2026].
- Re-running the dev seed resets the passwords of the seeded accounts; say so before running it during a manual test [P1-QA, 30/10/2026].
- `import.meta.main` does not compile with the installed `@types/node`; use another entry-point check [BE-LOGIN-06, 29/10/2026].
- Temporary output goes to the session's scratch folder, never to a file in the repo written by a shell redirect [BE-P2-09, 02/11/2026].
- `python` is not installed (Windows store stub); script file edits with `node`, and in JS `replace` pass a function, because a SQL `$'` in a string replacement is expanded as a pattern [BE-EX-01, 12/11/2026].
- Dropping a column also drops every index that uses it, so a later `DROP INDEX` on those indexes fails; test a hand-written migration by applying it on the previous schema in PGlite [BE-EX-33, 12/11/2026].
- Do not run `prisma format` on the whole schema: it re-aligns unrelated models; check a migration offline with `migrate diff --from-schema-datamodel <old> --to-schema-datamodel <new>`, never with the dev DB as shadow [BE-EX-01, 12/11/2026].
- The shell keeps the last `cd`; use absolute paths or `cd` back, or the next command runs in the wrong app [12/11/2026].

## Manual checks in the browser

- A login still in flight is cancelled when the page is changed and looks like a failed login; wait for the redirect before reloading [P1-QA, 30/10/2026].

## Working with the plan

- Check a modal's ancestor stacking contexts and explicit return-focus target; a sticky booking card left the header above its dialog, and disabling the opener before the effect lost focus restoration [FE-EX-27, 16/11/2026].
- When a shared module gains an import, update every hand-written test loader that compiles it (`auth-api`, `cp4-data-api`, auth guards/schemas); these tests failed only after the full suite ran [FE-EX-10, 13/11/2026].
- A public page can render Vietnamese through a shared kit component even when its own source scan is clean; include the rendered component in the scan and test its English labels [FE-EX-10, 13/11/2026].
- A React TSX file exporting both a component and shared functions fails the Fast Refresh lint rule; put functions in a TS module and re-export through a barrel [FE-EX-08, 13/11/2026].
- When the plan and the code disagree on a detail (a route that comes in a later checkpoint, a helper repeated in three places), stop at that task and say so; do not build around it [FE-LOGIN-09, 29/10/2026].
- A business rule the spec does not state is a question for the owner, even when it looks obvious; two parts stopped mid-way for this. Collect such questions while planning, before any code [BE-P2-12, 02/11/2026; BE-P2-17, 03/11/2026].

- When moving UI copy into dictionaries, adapt source-layout checks to resolve dictionary calls while retaining the old literal expectations; otherwise static checks fail despite unchanged rendered Vietnamese [FE-EX-11, 14/11/2026].

- In the managed Windows sandbox, Vitest module-cache rename in its default temporary folder can fail with EPERM; a process-local TEMP/TMP under ignored node_modules/.cache allows transformation, but HTTP loopback can still fail with EACCES. Report those separately from assertion failures [BE-EX-10/11, 14/11/2026].
- Use the cached virtual HTTP runner if available when the Windows sandbox blocks TCP loopback. The native announcement tests stopped at EACCES before Nest handled the requests [BE-P5-01, 24/11/2026].
- Preserve punctuation when moving mail templates: the verification subject used an en dash, not a hyphen; compare the original literal as well as the wording [BE-EX-11, 14/11/2026].

- Media error events are non-bubbling: dispatch to the video node in the fake DOM; modal focus also requires querySelector in the separate auth-flow DOM harness [FE-EX-16, 14/11/2026].
- After moving an overlay outside an inert wrapper, check that only one instance remains; a CRLF-sensitive string replacement left a duplicate and failed the entry tests [FE-EX-16, 14/11/2026].

- Managed shell calls may receive different OS temporary directories; keep cross-command offline schema snapshots in ignored node_modules/.cache or pass an explicit stable path [BE-EX-17, 14/11/2026].

- Availability based only on public hours plus owned viewings misses a full-hour place entered manually with the same phone; compute signed-in availability server-side without granting ownership of manual rows [BE-EX-17, 15/11/2026].

- Prisma generate can write updated types before failing to replace a Windows engine DLL (EPERM); inspect the build after failure and do not report generation complete merely because types changed [BE-EX-18, 15/11/2026].

- Vitest JSON alone can omit the cause of a failed beforeAll hook and list every e2e case as pending; retain the default reporter alongside JSON so connectivity failures do not require a second run to diagnose [BE-EX-24, 15/11/2026].

- A native select has type="select-one"; set it on the numeric-select test fixture before testing react-hook-form valueAsNumber, or the selected room remains a string. Do not change the shared fake DOM globally without checking older form tests [FE-EX-26, 15/11/2026].
- listPath always adds page/limit; build availability URLs with URLSearchParams so a non-paginated DTO does not reject those extra query fields [FE-EX-22, 15/11/2026].

- When adding one mail retry, failure fixtures must fail both attempts and explicitly restore success before testing recovery; an always-failing signup mailer incorrectly expected the next signup to succeed [BE-EX-28, 15/11/2026].
- Preserve a Node command's exit status before restoring environment variables in a PowerShell finally block; the successful restoration can otherwise mask a failed Vitest run. Assess the actual test report as well as the wrapper status [BE-P3-22, 20/11/2026].
- Vitest testTimeout and Prisma transaction timeout/maxWait do not extend the initial database connect_timeout (5 seconds by default in Prisma 6); after repeated initialization failures, test that connection limit separately instead of rerunning the unchanged workflow [BE-P3-22, 20/11/2026].
- A compiled DTO declares optional fields with undefined values; build audit field lists from defined entries, preserving explicit null, instead of Object.keys(dto) [BE-P3-23, 20/11/2026].
- Finish delegated source/test edits before starting the full suite; an in-flight locale fixture correction made one full run read an older test version [BE-P3-23, 20/11/2026].
- Extend translation coverage scans when adding a tenant endpoint; require every scanned message to have a translation while allowing catalog entries shared with other translated paths [BE-P3-23, 20/11/2026].
- Validate required template placeholders as well as unknown ones; a nonempty custom email without its code, reset link or appointment details passed the initial template checks [BE-EX-29, 15/11/2026].
- 20/11/2026 · FE-P3-03..14: private QueryClient phải gắn account+role+building scope và clear query/mutation trước đổi identity, remount local secrets; picker/hidden meter field/archived service/print selector/validation locale cần đối chiếu API và DOM thực, không giữ assertion placeholder sau khi trang đã triển khai.
- Keep unobserved private-query fixtures alive and assert data still exists immediately before an account/scope switch; gcTime0 otherwise makes cache-clear assertions vacuous; destroy manually built mutation timers in finally [FE-P3-03/06,20/11/2026].
- Await committed dialog close/route unmount before the next interaction, and match file inputs by DOM property or attribute; router promises alone do not prove a React page has unmounted [FE-P3-06,20/11/2026].
- Generate constraint-checker SQL from the current model before applying current custom constraints; a stale snapshot caused missing called_by_id42703. PGlite checks run offline and must not be marked blocked by dev DB connectivity [QA-P3-02/DB-07,20/11/2026].
- The rollback Prisma facade refuses `$transaction` options, so any route that reads in RepeatableRead (GET /dashboard) cannot run in a rollback e2e; test such a service with a unit fake, and add new tables (e.g. `contract`) to every dashboard fake (5 specs) when a group is added [BE-P4-12, 22/11/2026].
- An HTTP spec that boots AppModule with a fake Prisma must give a MANAGER token a `building.findMany` (the auth guard loads the scope), else the request 500s; and a fake `findMany` must apply `select`, or a "no extra fields" assertion fails on the fake, not the code [BE-P4-14b, 22/11/2026].
- Never spread a `Paginated` result (`{ ...result, data }`): the interceptor unwraps lists by `instanceof`, so meta silently disappears; build `new Paginated(data, result.meta)` (oxlint no-misused-spread caught it) [BE-P4-19, 22/11/2026].
- `Date.UTC` rolls impossible parts over (month 13, day 40) into a valid date; validate the date part with `parseDateOnly` and bound hours/minutes in the regex before building an instant [BE-P4-24, 22/11/2026].
- In edit scripts, `replace(a, b)` reads dollar-sign sequences in `b` as patterns (dollar-backtick inserts the text before the match), which mangled a whole file. Always use a function replacer: `replace(a, () => b)` [FE-P4/BE, 23/11/2026].
- Frontend test files use CRLF: exact-text edits must normalise line endings first or they silently miss [FE-P4-01, 23/11/2026].
- The kit `RoomsHeader` closes the mobile menu on any click in `action`; a control that opens a popup there must stop propagation. `RoomsButton` has no ref: focus it through a wrapper [FE-P4-08a, 23/11/2026].
- Verify `Cache-Control: no-store` for new private staff handlers as well as tenant handlers. The announcement routes needed headers after the PUB-05 review [BE-P5-04, 24/11/2026].

- 23/11/2026 (QA-P4-03/04): Bộ nhớ kết quả Vitest tích lũy theo file qua nhiều lượt. Khi chạy hồi quy nền, lưu tên từng file, mã thoát và tổng số file hoàn tất vào log theo lượt để có thể nghiệm thu sau khi đóng terminal.

- P5-5 (RPT-02): a cancelled, issued monthly bill without a replacement still covers the billed period and supplies meter baselines. Check missed-period creation, settlement and renewal when adding a cancellation path.

- An e2e case wrapped in one rolled-back transaction has a hard 240 s limit; adding later parts' checks to the same case pushed it past the limit on the remote dev DB ("Transaction not found", 500). Give each part its own case and fixture instead of growing one [BE-P5-18/20/24, 24/11/2026].

- FE-P5-04: direct and request-linked renewal share a route. After changing the query string in a component test, wait for the requested ID to render before checking the prefilled term.
- FE-P5-07/08: in the simulated DOM, provide chart container measurements and load the chart module before timing UI updates. Audit entity IDs include 0 for settings changes; actor IDs start at 1.
- FE-P5-14: contract services and available parking services are separate collections. Load active vehicle services from the tenant-owned contract's building for a vehicle-change request. A moderated review returns a redacted comment, so a rating edit must preserve the stored comment at the API boundary.
- QA-P5-04: verify two distinct PostgreSQL backend PIDs inside the transactions before releasing concurrent workers. When a worker fails before approval, retire the fixture's pending request as well as its contracts and accounts before recording CLEANED.
- GL-04 (DEP-10): when registering a root controller, update the exact AppModule controller metadata assertion in prisma.service.spec.ts alongside the HTTP tests.
- GL-05 (DEP-10): cover conditional GET on a readiness endpoint with an exact status contract. Express JSON delivery can turn a healthy response into 304 even with Cache-Control: no-store.
- GL-05 (FE-P2-15, UI-03): exercise filter edits while the catalog is pending. In pagination tests wait for the requested row to render before checking its content.

- GL-06/08 (BANK-08): check the provider's detailed retry settings. SePay retries non-2xx server errors only with the webhook retry-on-error option enabled.
- Before adding a decision/assumption ID (D-/A-), grep `docs/spec` for the highest number: chatbot limits were first written as A-28, which already existed (renumbered to A-29 on 27/11/2026).
