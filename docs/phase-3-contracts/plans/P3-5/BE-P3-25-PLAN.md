# BE-P3-25 · Vehicle registration and lookup

Baseline `ee0e891` (BE-P3-24), clean Git, owner confirmed committed on 20/11/2026. Read Part 5 prerequisites and the existing scope, audit, service, vehicle schema/constraints, contract-read and cancellation flows.

## Confirmed scope

CON-14 / DB-B5 / D-07: staff GET/POST/PATCH contract vehicles and GET /vehicles?plate=. Normalize uppercase and remove whitespace, preserve punctuation; type is VehicleType, service is a VEHICLE service of the same building. New assignments require an active service. Lists use explicit safe SELECTs; lookup is paginated and searches literal partial plates within both request scope and current building assignment. No tenant mutation/lookup permission is added.

Owner answers Q-P3-19/20/21 on 20/11/2026: writes on HOLD/ACTIVE only; stopping a vehicle mid-month still charges that month and not the next month; cancelling a HOLD automatically stops its active registrations in the same transaction and releases their plates. Preserve history, integer money and D-41. This task stores dates; the monthly invoice engine remains Phase 4 and issued invoices are untouched.

## Implementation

Add a separate vehicle controller/service and DTOs within ContractsModule. List a contract's active and removed vehicle rows. The global lookup defaults to active registrations and supports isActive=false for history. Lookup returns vehicle/service and minimal contract/building/room/tenant contact fields, no CCCD, private assets, password or sessions.

Mutation order: assignment mapping shared lock → contract FOR UPDATE → current scope/status → optional service FOR SHARE → vehicle write → audit, all atomic. Foreign vehicle IDs return NOT_FOUND. Require service building and unit to match; removal remains possible after service deactivation. The existing partial unique index is the concurrent plate arbiter; map both named-index and Prisma plate-column errors to a friendly generic fields.plate message without revealing another contract/building. Unexpected errors are sanitized before logging.

Removal sets isActive=false and removedAt. Removed registrations stay immutable; register again with a new POST, keeping the previous interval. Cancellation bulk-stops remaining registrations and records the count in contract.cancel audit without changing its existing response/idempotency behavior. All work rolls back if audit fails.

**A-27 [ASSUMPTION, technical date-entry default]:** registration/removal dates default to today's Hanoi date; staff may supply an actual date no later than today, and removal cannot precede registration. No future scheduled flag changes or date-proration engine are introduced. Record this separately from the owner's monthly fee answer.

## Verification and checkpoint

Real Nest HTTP stack with fake DB/provider boundaries; test normalization, validation, same-building VEHICLE service, retired history, duplicate/removal/re-registration, scope reassignment/deactivation, literal search/pagination, tenant denial, audit rollback and two concurrent registrations. Extend existing cancellation regressions for automatic stop, idempotent replay and audit rollback. Use isolated embedded PostgreSQL with the compiled service and Prisma to verify actual SQL/index/races where available; do not contact dev DB. Run build, lint, scoped noEmit and relevant contract/error-map regressions. The BE-P3-24 full-run auto-review denial remains a separate recorded limit and is not bypassed. Independent read-only reviewer before the BE-P3-25 checkpoint; full report in the checkpoint. Owner verifies and commits; no stage/commit/push, new dependency, schema/migration or env edits.
