# BE-P3-24 · Private occupant ID photos

Baseline: owner confirmed BE-P3-23 committed; verified `ab5ebac` and clean Git on 20/11/2026.

Implement CON-16 / DB-B9 / AUD-01/02 through the existing occupant controller and service. Only BOSS and the currently assigned, active building MANAGER may request photos. Keep the shared assignment lock, then a contract row share lock, recheck current scope, and find the occupant by both contract ID and occupant ID. No writable-status restriction applies to a history read.

Use the existing private Cloudinary signing helper. Return `{ front: { url, expiresAt } | null, back: { url, expiresAt } | null }`, with both links created at the same instant and valid for at most 300 seconds. An absent side is null; no photos or a missing occupant returns NOT_FOUND, consistent with the signed-scan endpoint. Tenant routes never expose these links or full CCCD numbers.

Create exactly one `occupant.view_id` audit row per successful request, including actor, occupant and IP, without identity values or URLs. Return the links only after the audit transaction commits; signing/read/audit failure returns no links and commits no audit. Sanitize unexpected failures before the global logger.

Verify through the real Nest HTTP stack and signing helper: roles, current building assignment, cross-contract occupant IDs, optional photos, repeated views, 300-second expiry/signatures, no-store, missing configuration, audit rollback and private-output regression tests. Run backend lint/build/tests and the required independent read-only review before reporting. No schema, migration, dependency, environment or dev DB changes are needed. Stop at BE-P3-24 for owner verification/commit before BE-P3-25.

No new business assumptions. A-25/26 remain the recorded defaults of BE-P3-23 and are not needed for this read endpoint.
