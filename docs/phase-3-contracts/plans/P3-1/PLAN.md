# P3-1 · Backend foundation plan

Sources: `feature_p3-1-backend-foundation.md` (BE-P3-01..06), spec D-17, D-37, D-40, D-41, A-21, G-01/02, CON-03/04/06/16, BIL-01..04/08/22, FILE-01/02, DB-07/B9, DEP-05. Implement tasks in order. No contract route or frontend change in this part.

## Prerequisites and decisions before code

- `git status` was clean at planning time. P3-0's dev prerequisite is verified: `Source/backend/.env` has a valid 32-byte base64 `CCCD_KEY` configured at the owner's request. Store the key outside Git. Record only its presence and format checks.
- Update 16/11/2026: the owner asked the main session to fill the local file; it generated a fresh key on the machine (not the one pasted in chat), and added `NODE_ENV=development`. The ignored `.env` now validates without displaying secrets. P3-0's key prerequisite is met locally; the owner should back up the key securely before real CCCD data is stored.
- **Option A approved on 16/11/2026:** drop the unused `contracts.billing_day` column and its `contracts_billing_day` CHECK (D-40). The owner approved application to dev under Q-P3-6 and deployed from PowerShell after checking migration history and the legacy URL counts.
- Before applying to dev, count non-null values in `contracts.signed_scan_url` and `occupants.id_front_url` / `id_back_url` with a read-only query. If any count is positive, ask the owner for a conversion or backfill plan.
- Dev verification on 16/11/2026 used the owner's PowerShell. It reported `scan=0, front=0, back=0`, applied the one pending migration, and returned `Database schema is up to date!`.
- **Spec clarification for Phase 4:** BIL-08 sets the due date to the 9th of the billing month. The final partial period's `billingDate = end_date + 1` may be after the 9th (BIL-22: 20/09/2027); a delayed reading can also issue an invoice after the 9th. `invoices_issued_dates` requires `due_date >= issue_date`. Ask the owner which month/date to use in those cases before implementing monthly invoice issuing in Phase 4. P3-1 can keep `dueDateOfBillingMonth(month)` pure, without inferring an invoice's billing month from a final `billingDate`.
- No new dependency. Existing Node crypto and Fetch are sufficient. Do not touch `MAIL_PROVIDER` in either Vitest config.

## BE-P3-01 · Calendar month period helper

Add `src/common/date/period.ts` and `period.spec.ts`, reusing `today.ts` date-only helpers. API: `contractEndDate(startDate, termMonths)`, `contractPeriods(startDate, termMonths)` returning ordered `{ periodNo, periodStart, periodEnd, billingDate, isPartial }`, `proratedAmount(amount, periodStart, periodEnd)`, `dueDateOfBillingMonth(billingMonth)`. Dates are UTC-midnight `Date` values representing business calendar dates, never timestamps or local-time arithmetic. Add whole months to the **original** start year/month, clamp its day to the target month's last day, then subtract one day. Split at every 1st strictly after start and at `endDate + 1`; the terminal billing date is `endDate + 1` per BIL-01..04. Count days inclusively. Money calculation is integer half-up once per fixed line: `floor((amount * days + floor(monthDays / 2)) / monthDays)` for nonnegative integer amounts, with safe-integer validation. The monthly due-date function returns day 9 of an explicitly supplied billing month.

Tests use the spec's concrete examples, not values derived from the helper: BIL-01 six full periods 01/09/2026–28/02/2027, first billing 01/10 and due 09/10; BIL-02 31/01/2027–29/04/2027 with amounts 80.645, 2.500.000, 2.500.000, 2.416.667 for rent 2.500.000; BIL-22 20/03/2027–19/09/2027 with 967.742, five full months, 1.583.333; 2028 leap February has 29 days; BIL-03 renewal starts exactly one day after the old end, including a split month; BIL-04 no period ends beyond `endDate`.

## BE-P3-02 · CCCD encryption and startup configuration

Add `src/common/crypto/cccd.ts` and tests. Encrypt with `aes-256-gcm`, 12 random IV bytes per value, 16-byte auth tag. A versioned opaque serialization such as `v1:<iv-b64>:<cipher-b64>:<tag-b64>` allows authenticated tamper detection and later versioning. `last4` returns the last four digits of a validated CCCD number; do not log the number, key, ciphertext, or exceptions containing any of them. The production code in this task encrypts only; defer an exported decrypt function to the later task that needs a full number. A test can decrypt the serialized ciphertext directly with Node crypto to prove a round trip and corruption rejection without exposing a production decrypt API prematurely.

`validateEnv` must require `CCCD_KEY` and `NODE_ENV` (DEP-05 already requires the latter, but current `REQUIRED_ENV` omits it). Validate `NODE_ENV` as `development|test|production`, decode `CCCD_KEY` strictly as base64 and require exactly 32 bytes. Error messages mention variable names and required shape only, never values. Add blank `CCCD_KEY=` to `.env.example`; never write the real `.env`. Update all exact-list and missing-value assertions in `env.spec.ts`; check round trip, random IVs, tampering, invalid base64 / 31- or 33-byte keys, and no secret in errors/logs. Ensure startup still validates before `NestFactory.create`.

The original `main.ts` loads only `Source/.env` while this machine uses `Source/backend/.env`; load the backend file first. Defer importing `AppModule` until after validation because its initialization reads `NODE_ENV` for scheduled jobs. The source-order test must cover this.

## BE-P3-03 · One private-asset migration (⏸)

Migration `20261116000000_private_contract_assets` uses these field mappings.

| Model | New Prisma field | SQL column | Replaces |
|---|---|---|---|
| `Contract` | `signedScanAssetId String?` | `signed_scan_asset_id TEXT NULL` | `signed_scan_url` |
| `Occupant` | `idFrontAssetId String?` | `id_front_asset_id TEXT NULL` | `id_front_url` |
| `Occupant` | `idBackAssetId String?` | `id_back_asset_id TEXT NULL` | `id_back_url` |

Store only the immutable Cloudinary asset IDs after verifying metadata. Cloudinary's [official Upload API reference](https://cloudinary.com/documentation/image_upload_api_reference#download_by_asset_id) documents signed `GET /asset/download` by `asset_id` for `authenticated` assets with `expires_at`. The migration takes both table locks in one transaction and aborts if any legacy URL is non-null. It drops the three URL columns and `billing_day` with its CHECK, and adds the three nullable asset ID columns with nonblank checks. The same checks are in `prisma/constraints.sql`. HD000001 keeps start 15/09/2026 and end 14/03/2027. The seed spec uses the new columns.

Update `prisma/check-constraints.mjs` fixture inserts to remove `billing_day`; add scenarios rejecting blank private asset IDs, accepting opaque IDs, and verifying the legacy URL and billing-day columns are absent. Generate a disposable from-empty schema SQL under ignored scratch/cache as documented in `LESSONS.md`; `prisma migrate diff` old→new should contain only planned columns/constraints. Run checker and report its actual `N/N` count, plus `seed.spec.ts`. **Do not apply the migration before a separate owner approval.** After BE-P3-01..03 are verified, mark their task lines `[x]`, update `PROGRESS.md`, stop ⏸ and wait for the owner's verification/commit. If permission is pending, mark BE-P3-03 blocked, explain, and stop without claiming it done.

## BE-P3-04 · Authenticated upload and five-minute delivery

Extend `SignUploadDto` with discriminated input. `ROOM_IMAGE` requires `roomId`. `CONTRACT_SCAN` and `ID_PHOTO` require `contractId`. The global pipe rejects irrelevant IDs and unknown properties. `FilesController` dispatches by purpose. For a contract, look up `id, buildingId` and enforce the caller's scope (`null` for Boss). Outside scope returns `OUT_OF_SCOPE`. The [Cloudinary Upload API](https://cloudinary.com/documentation/image_upload_api_reference#upload) uses `POST /v1_1/<cloud>/image/upload`. The signed parameters include `type=authenticated`, `folder=contracts/<buildingId>/<contractId>`, `timestamp`, and `allowed_formats` of `jpg,png,webp,pdf` for scans and `jpg,png,webp` for ID photos. The caller forwards those parameters in the upload form.

Each private upload signs a generated `public_id` with the prefix `contract-scan-` or `id-photo-` and `overwrite=false`. The client sends `publicId` as `public_id` and forwards `overwrite` as the string `false`. The signed prefix binds the upload to its intended purpose, and the overwrite flag protects the asset if the signature is reused. [Cloudinary Upload API](https://cloudinary.com/documentation/image_upload_api_reference#upload).

`verifyContractAsset(db, contractId, purpose, uploadResponse, env)` fetches Cloudinary metadata by immutable `asset_id`. It checks the asset ID, public ID, version, format, `type=authenticated`, `resource_type=image`, the exact contract folder and the prefix for the requested purpose. Mismatches return `VALIDATION_FAILED`. Missing Cloudinary configuration returns `UPLOAD_NOT_CONFIGURED`. The helper returns the verified asset ID for persistence. `signedContractAssetUrl(assetId, env, now)` signs `asset_id`, `timestamp`, and `expires_at` for a five-minute URL at `/v1_1/<cloud>/asset/download` and returns an ISO `expiresAt`. The later CON-16 routes authorize and audit access before calling the helper. [Cloudinary Download API](https://cloudinary.com/documentation/image_upload_api_reference#download_by_asset_id).

Tests cover a foreign building, wrong folder, `type = upload`, wrong format for ID photo, tampered metadata, ≤300-second expiry, signature over expiry, and existing ROOM_IMAGE regression. No new route is introduced beyond the already existing `POST /files/sign` expanded to new purposes; assess whether its behavior change needs focused HTTP/e2e verification according to BE-P3-06.

## BE-P3-05..06 · Wiring, errors and final verification

Create an empty `src/modules/contracts/contracts.module.ts` and register it in `AppModule` (no controller/routes). Compare the complete 01-architecture error table with `ErrorCode` first; add only genuinely missing Phase 3 codes and update `app.setup.spec.ts` exact list/count in the same change. The currently listed contract/meter/deposit codes are already present. Update `prisma.service.spec.ts` module list at the same time. Run `npm run test`, then `npm run lint`, `npm run test`, `npm run build` at BE-P3-06; run focused e2e if a route changed, with the command in `LESSONS.md`, only after confirming test config cannot send real mail and cleanup is safe. Quote actual counts and commands, not historical counts.

Before the last stop, run the read-only reviewer on uncommitted schema/security changes and include its full report; address blocking findings. Record `[ASSUMPTION]`s (e.g. serialization and proposed validation messages) in the report, update task marks and `PROGRESS.md`, then stop ⏸ for owner verification and commit. Do not self-commit, run seed, or apply any migration without approval.
