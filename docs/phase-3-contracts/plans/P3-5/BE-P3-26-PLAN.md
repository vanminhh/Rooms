# BE-P3-26 · Selected contract services

Baseline `4428721` (BE-P3-25), clean Git on 20/11/2026; owner confirmed committed and requested continuation. Before-start sources already read in Part 5; inspected contract creation/reads, service catalog, approved-rate helpers and current membership schema for this task.

## Confirmed behavior

D-07 / DB-B5 / G-10: staff GET/PATCH `/contracts/:id/services`, mutate only HOLD/ACTIVE, choose ROOM/PERSON services of the same building, audit the change. Owner explicitly answered Q-P3-22: newly selected services must have an approved rate effective at the HOLD start date or today's Hanoi date for ACTIVE, matching the existing intake price safeguard. No tenant route or monthly fee calculation is added.

**A-28 [ASSUMPTION, API collection behavior]:** PATCH `{ serviceIds: number[] }` supplies the complete desired selection; an empty array clears it. Preserve already selected inactive services/rate history when retained; new selections must be active and priced. Ordinary GET can read ENDED/CANCELLED history in current scope, consistent with the existing contract detail; writes remain HOLD/ACTIVE. Order-only or unchanged selections return without a misleading change audit. These defaults do not set the billing month of a service change.

`contract_services` is the current membership join (three keys, no historical interval or active flag). Remove only omitted current links and insert additions; never delete master services, rates, invoices or audit history. Write complete before/after service ID sets to `contract.update_services` in the same transaction so the previous selection remains recorded. No schema or migration is needed.

## Implementation

Add a dedicated controller/service and required unique integer-array DTO to ContractsModule. Use explicit service SELECTs only (id/name/unit/isActive). Check staff in both route and service, request scope plus actual current assignment, bind all membership queries/writes to the authorized contract. Acquire mapping shared, then contract row lock (SHARE for read, UPDATE for write); lock selected service rows in ascending ID order before checking new membership eligibility, coordinating with service deactivation. Approved rate rows are immutable history; test effective date and approval status using existing rate-plan relations.

Validate the complete proposed set's building and ROOM/PERSON units. For new IDs also require active catalog entry and an approved SERVICE price effective on the reference date. Compute deltas, check affected row counts, update links and audit atomically. No-op does not force removal of an archived retained service. Sanitize unexpected failures before the global logger. Keep selected IDs stable/sorted and reject client-controlled internal data.

## Verification and checkpoint

Use real Nest controllers/guards/services/audit over fake DB edges; verify scope reassignment/deactivation, foreign/VEHICLE services, active/price/date eligibility for HOLD and ACTIVE, retained archived selection, clear/replace/no-op, audit rollback, changed-row conflict, typed array validation and tenant denial. Run appropriate contract/catalog/error regressions, build, lint and scoped noEmit. Verify compiled services + Prisma + existing migrations on isolated embedded PostgreSQL for actual joins/FKs, add/remove/audit rollback. Do not contact dev DB or retry the previously auto-review-blocked full suite. Required independent read-only review before the BE-P3-26 checkpoint; owner verifies/commits before BE-P3-27. No new dependency, schema/migration or env edits, file deletion, stage/commit/push.
