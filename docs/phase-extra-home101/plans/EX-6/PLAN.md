# PLAN — EX-6: account viewings and building capacity

Created 14/11/2026; revised 15/11/2026 for the owner's three decisions dated 14/11/2026 and two follow-up answers. Tasks BE-EX-17..24. Source of truth: spec 00, 02, 10, 11, 13, 19 and 30; current feature_ex-6 and feature_ex-7. Read docs/LESSONS.md and backend/CLAUDE.md before implementation.

## 1. Scope and authorization

This checkpoint revises spec, plan, unapplied schema/migration and offline checkers only. Runtime account booking, capacity, emails, outcomes and dashboard remain BE-EX-18..24; FE remains EX-7. EX-6 and EX-7 deploy together because the old public POST is removed.

The owner says viewing_hours has not been applied to any database and explicitly authorizes editing that same file. Only two columns, DONE, nullable legacy fields, CHECK, owner FK, two indexes and account/room partial unique remain. Do not seed, install dependencies, edit environment files, delete files, commit or push. Earlier authorization to apply the old migration is withdrawn. Ask again with the revised SQL/check/review results before any dev-DB application. The prior read-only migrate status failed P1001; no deploy ran.

Continue authorized task groups without waiting for a commit, but report checkpoints. Never skip permission for a database application. No new business assumptions are introduced by this revision.

## 2. Resolved decisions

- VIEW-02/02a: at most one NEW/CONFIRMED row per account/room; multiple rooms allowed, each WEB creation counts toward 3/account/Hanoi-day, including cancelled rows (A-03).
- VIEW-16: max 3 distinct stored guestPhone values in a building/exact hour across WEB and MANUAL. Same phone across both sources is one guest (owner answer 15/11). Additional rooms for an already-counted phone do not consume another place.
- Independently, neither one guest phone nor the current responsible person may occupy two buildings at the same hour. This applies to WEB, MANUAL and rescheduling. Return VIEWING_TIME_TAKEN. Ownership remains userId; phone dedup never claims manual/legacy rows.
- NEW past start may become DONE directly (owner answer 15/11). Open NEW/CONFIRMED outcome actions are DONE after start or CANCELLED with a staff note. No NO_SHOW. No NEW/CONFIRMED → LOST; DONE → LOST with outcomeNote remains. Contract alone can set WON from CONFIRMED/DONE (Phase 3).
- PHONE/EMAIL action still confirms NEW, including late confirmation. EMAIL requires owner email and successful send. No method/timestamp is stored; do not alter visitAt.
- Guest cancellation only before start, clears handledById even after staff confirmation. Staff cancellation sets acting id. No separate cancelledBy.
- NEW stays NEW when overdue (A-13). Responsibility changes preserve rows and flag actual conflicts (A-14); several guests within capacity at one building are valid.
- A-12: never translate user-entered names/notes. Legacy start uses existing 08:00/14:00/18:00 slot starts for overdue/outcomes; never invent visitAt or reserve an exact hour for legacy. Report this retained technical assumption at runtime checkpoint.

## 3. Schema and migration — BE-EX-17

| Item | Final change |
|---|---|
| ViewingStatus | Append DONE only; retain existing enum order/values |
| Owner | userId Int? mapped user_id; users FK ON DELETE RESTRICT; named ViewingOwner distinct from ViewingHandler |
| Time | visitAt timestamptz?; visitDate date? and timeSlot varchar(20)? for legacy |
| CHECK | visit_at IS NOT NULL OR (visit_date IS NOT NULL AND time_slot IS NOT NULL) |
| Indexes | (user_id, created_at), (visit_at, status); keep old indexes |
| Unique | (user_id, room_id) WHERE user_id IS NOT NULL AND status IN ('NEW','CONFIRMED') |
| Existing handler | No schema change; guest cancellation clears it, staff sets it |

Edit 20261114000000_viewing_hours/migration.sql in place; no new corrective migration, no drops/backfill/row updates. Keep custom CHECK/unique identical in constraints.sql. Capacity/cross-building rules require BE transactions, not a new unique constraint that would reject valid groups. No ViewingConfirmation, ViewingCancelledBy or their columns.

Offline: validate schema; diff committed schema → revised schema; generate schema.sql from empty without DB/shadow; run check-constraints and full migration replay in PGlite. Replay verifies every original field in all 5 legacy statuses unchanged, exactly 2 new null columns, final enums and upgraded/fresh catalogs identical. Explicitly test absence of removed columns/types and rejection of NO_SHOW, DONE acceptance, unique closure/rebooking, multiple rooms, owner FK and owner delete protection. Do not claim these tests prove API capacity/concurrency.

Run backend lint/test/build. Until runtime is adapted, the installed Prisma client represents the old schema: record that limitation explicitly; regenerate the active client and adapt nullable callers as part of CP-2 before claiming runtime compatibility. Offline schema diff/validation/catalog checks validate the proposed DB independently. Reviewer must examine revised schema and test assertions. Ask for fresh dev application permission only after this report. After permission: inspect pending migrations, capture legacy row counts/fields, apply only expected migration, compare unchanged rows; never seed.

## 4. API contract — CP-2/3

All paths below /api/v1; staff Vietnamese, guest/public accept VI/EN; staff forceLanguage stays intact. GUEST cannot change email.

| API | Contract |
|---|---|
| POST /me/viewings | GUEST/TENANT with verified email; roomId, visitAt (ISO timezone), note?; account name/phone; public room or ROOM_NOT_AVAILABLE; quota 429, duplicate open account/room CONFLICT_STATE, hour conflicts VIEWING_TIME_TAKEN; no-store |
| GET /me/viewings and /:id | Owner userId filter, other id 404; pagination, current room/building/contact; accessible even if room subsequently locked; no internal staff/user IDs, no confirmation/cancellation metadata |
| POST /me/viewings/:id/cancel | Owner only, NEW/CONFIRMED before start; CANCELLED and handledById null; conditional update; no-store |
| GET /public/rooms/:id/viewing-times?from&to | Public room, valid dates max 31 inclusive; anonymous free hours for an additional distinct phone; cache 60 s, no personal data/IDs |
| GET /me/rooms/:id/viewing-times?from&to | GUEST/TENANT, public room, same dates/rules; account phone loaded server-side, no phone/user override; no-store; includes same-building already-counted phone at capacity (even MANUAL-only), excludes guest cross-building hours; dates/hours only |
| GET /viewings | Staff building scope, filters by status/building/date for exact and legacy times; pagination |
| POST /viewings | Staff active/in-scope room, not necessarily public; roomId, guestName, guestPhone, visitAt, note?; userId null/source MANUAL, no email |
| PATCH /viewings/:id | Scoped staff: visitAt? (NEW/CONFIRMED only), status?, note?, outcomeNote?; transitions per VIEW-04; cannot set WON or bypass confirm action |
| POST /viewings/:id/confirm | via PHONE or EMAIL is an action discriminator, not persisted; NEW only, late allowed; EMAIL eligibility/delivery required; failure MAIL_UNAVAILABLE with NEW retained |
| POST /public/viewings | Removed (404); reuse its controller file for free-hour GET instead of deleting files |

Projection: visitAt ISO|null, legacy visitDate/date-slot-label nullable, status/overdue/overlap, current public contact from BuildingContactService + settings.default_contact; never expose login phone. Staff may read guestEmail from owner for EMAIL button. No confirmedVia/confirmedAt/cancelledBy. Map duplicate partial unique to CONFLICT_STATE. Add VIEWING_TIME_TAKEN VI/EN and catalog count tests; include new DTO validation fields in EX-3 field catalog.

Anonymous availability is not personalized and cannot decide an existing guest's extra room. EX-7 uses the private availability route after login, so even a MANUAL-only matching phone at a full hour is handled without exposing or claiming its row. Both routes reuse the capacity helper; private reads the account phone from DB, never from query/body. Add MeRoles/no-store tests and reject phone/id overrides. POST always rechecks all constraints. No public guest breakdown or cache personalization.

## 5. Concurrency and time implementation — BE-EX-18..20

Reuse common/date/today.ts; helper rejects invalid/local-time-only ISO, impossible calendar date, nonzero minute/second/millisecond, Hanoi hour outside 8..19, time <= now or date > today+30. Preserve legacy slot labels until converted; conversion sets legacy fields null with visitAt in one update.

One shared capacity helper is called by WEB, MANUAL, reschedule and availability: query NEW/CONFIRMED exact rows, deduplicate stored guestPhone by building/hour, check proposed phone across buildings and current responsible across buildings. An already-counted phone is accepted at a full 3-guest building/hour; a fourth phone is refused. Reschedule excludes only itself, so another room of that phone still counts.

Mutations must share transaction locks; a building-only lock is insufficient for phone/responsible conflicts across buildings. Use namespaced advisory locks for account quota (WEB), guest phone (both sources), relevant building(s), current responsible user(s), and viewing id for updates/cancel/confirm. Document a fixed lock order; for old/new lock sets acquire sorted ids. Re-read state/scope/responsibility after locking and retry a bounded number of times if the resolved mapping changed. Do not copy stale user.buildingIds into a final decision without a transactional check. Avoid acquiring conflicting locks in a reverse order on cancel/reschedule.

Responsibility changes must coordinate with booking locks: inspect BuildingsService.update/lock and ManagersService.update. A shared responsibility-mapping advisory lock for viewing mutations and exclusive lock for mapping changes is an acceptable small protocol; then resolve and lock specific responsible users/buildings. A reassignment may create conflicts by VIEW-22 but a stale snapshot must not allow a new over-capacity/cross-building booking. Shared mapping lock allows unrelated buildings to book concurrently.

Cancel/DONE closes only its row; availability and responsible occupancy derive from remaining rows, not an unconditional free flag. Cancel/update/confirm serialize on the viewing and conditional state/time to avoid overwriting rescheduling. NEW → DONE requires past start; late NEW → CONFIRMED does not change occupancy (both open).

## 6. Email and dashboard — BE-EX-21..24

New WEB mail after commit, active manager with email else Boss, Vietnamese, retry once on failure and log without failing booking. MANUAL sends none. Confirmation EMAIL uses guest locale, current public contact, bounded send timeout/retry under viewing serialization, sets CONFIRMED only after success. External email cannot roll back after a successful send if DB commit fails; log that window, do not claim exactly-once or add an unapproved outbox/schema.

Dashboard counts NEW by current responsibility; Boss dashboard only buildings without active manager, staff list still all for Boss. Compute overdue and overlap before pagination; overlapping CONFIRMED rows must also be visible. Conflicts: >3 distinct phones/building/hour, one responsible user across buildings/hour, one phone across buildings/hour. Same-building groups <=3 are not conflicts. Closed/legacy slot-only excluded; building filter cannot hide other-building conflicts. Keep room/building lock warning and rows intact.

## 7. Checkpoints and validation

### CP-1 BE-EX-17 — revised migration only

Offline checks above, full current backend unit suite/lint/build, independent reviewer. Report actual counts and installed-client limitation. No DB application without renewed permission; no seed. Update PROGRESS, feature task and CP-1-REVIEW.

### CP-2 BE-EX-18..20 — runtime compatibility, time, bookings

Regenerate Prisma client and adapt mapper/dashboard/tests to nullable legacy and DONE. Helper tests for 07/08/10:30/19/20, seconds/millis, today/past/+30/+31, Hanoi midnight/month/year boundaries. WEB auth/verified email/scope/privacy/quota; unique same room; same phone multiple rooms; 3 distinct accepted / fourth refused; WEB+MANUAL same phone dedup; phone cross-building conflict even with different managers; responsible cross-building conflict even with different guests; MANUAL/reschedule same rules. Remove old public POST without deleting its file, rewrite obsolete tests in place. lint/test/build. EX-7 not implemented yet, so do not deploy this API alone.

### CP-3 BE-EX-21..23 — availability, ownership, email, transitions

Availability: 31-day max, invalid/inverted range, horizon, 1/2/3 guests, responsible cross-building conflict, anonymous cache identical across auth states, no PII. Private availability requires GUEST/TENANT, uses account phone and no-store; full-building same-phone WEB and MANUAL-only existing guest sees the hour and may add a room, including with no owned rows. Other-building phone blocks the hour. Reject phone/user overrides. Own X/Y privacy and no claiming manual rows. Cancel before start allowed, at/after refused; guest clears existing handler; staff note/id required; cancelling one of several rooms retains phone occupancy. NEW and CONFIRMED → DONE before start refused/after allowed; NEW/CONFIRMED → LOST refused; DONE → LOST requires note; WON refused by PATCH. PHONE/EMAIL late confirmation, no metadata saved/returned, failure keeps NEW. Notification fallback/locale/retry/no MANUAL mail. lint/test/build.

### CP-4 BE-EX-24 — dashboard, integration, review

Real concurrent HTTP/Postgres cases: two new phones race for place 3 when count=2 (one success); same-phone extra rooms at capacity; same phone races across buildings with different managers (one success); same responsible races across buildings (one success); mixed manual/WEB dedup, cancel-last-room/rebook, reschedule capacity. Fake mutex tests alone are insufficient. Dashboard valid groups not flagged, responsibility reassign/deactivate/lock can create conflicts and preserves rows. Legacy confirm/cancel/convert retains labels until converted. Reviewer reads lock participants (buildings/managers) and auth paths.

No seed under current instruction. Existing full e2e has an auth fixture that reseeds accounts: do not run it as-is; run only an explicitly non-seeding scope when permitted, or report that full integration is pending. Network/HTTP sandbox failures must be reported separately from assertion failures. Phase 3 contract integration is not part of EX-6 completion.

## 8. File map

Current checkpoint: docs/spec/{00-overview,02-database,13-viewings,30-frontend}.md; EX-6 PLAN/CP-1-REVIEW; feature_ex-6/7; PROGRESS; prisma/schema.prisma, constraints.sql, migrations/20261114000000_viewing_hours/migration.sql, check-constraints.mjs, check-viewing-hours-migration.mjs.

Runtime follow-up: viewings controllers/service/types/DTO/time helper and tests; me controller; public controller reused; common errors/i18n; dashboard; buildings/managers lock participants; mailer integration; fake-prisma and real viewings e2e. Do not alter the unrelated EX-4 work already in the working tree.

## Application permission update — 15/11/2026

Owner approved applying this revised viewing_hours migration after the offline report. This supersedes the earlier ask-again gate for the current file. Preflight failed P1001; TCP hostname resolution returned ENOTFOUND. No migration or seed ran. Restore connectivity and recheck pending migrations and legacy rows before deployment; permission remains valid for this exact migration.

## CP-1 complete — 15/11/2026

Owner terminal output confirms approved migration applied; 78/78 original viewings unchanged, new columns null, no seed. BE-EX-17 complete; continue BE-EX-18.

## CP-2 partial — 15/11/2026

BE-EX-18 time helper and nullable projections added; 85/85 targeted tests pass, build passes with the updated generated types. Full unit 944 pass / 740 HTTP EACCES. Prisma generate itself still failed EPERM replacing the engine DLL (hash unchanged from installed engine); process inspection unavailable via CIM. Owner needs to stop backend if running and regenerate the client outside the sandbox. BE-EX-19 not started. Legacy date/slot DTO still used until BE-EX-20; exact-hour rows reject that legacy edit to avoid conflicting time representations.

## Runtime update — 15/11/2026

Owner successfully generated Prisma Client v6.19.3, resolving the earlier EPERM. BE-EX-18..24 runtime implemented; checkpoint evidence and complete independent review are in CP-2-4-REVIEW.md. Full HTTP transport and PostgreSQL verification remain blocked in the agent environment. Q-EX6-4 now requires owner decision: AUTH-12 staff-created TENANT eligibility conflicts with VIEW-01 verified-email wording. Preserve the current strict check until answered; do not add a new tenant verification flow without approval. EX-7 planner is collecting the UI implications.

## Tenant booking decision — 15/11/2026

Q-EX6-4 / Q-EX7-01 resolved: owner chose B. TENANT must have email but does not need email verification to book. Missing email returns VALIDATION_FAILED with fields.email; the existing account page lets TENANT add it. GUEST still needs verified email. Resend sends email, no SMS. This supersedes the pending question and the earlier verified-email-for-all wording. No schema or auth verification flow changes.
