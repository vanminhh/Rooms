-- EX-1 / BE-EX-33: email replaces the phone as the thing a guest verifies (D-25 final, AUTH-11..15).
-- Runs on a database that already has guest_accounts.

-- 1. users: email_verified_at replaces phone_verified_at (owner agreed to drop the column, 12/11/2026)
ALTER TABLE "users" ADD COLUMN "email_verified_at" TIMESTAMPTZ;
ALTER TABLE "users" DROP COLUMN "phone_verified_at";

-- 2. phone_otps -> email_otps. A code lives 5 minutes, so the old rows go
--    (their value is a phone number and would break the email CHECK below).
DELETE FROM "phone_otps";
ALTER TABLE "phone_otps" RENAME TO "email_otps";
ALTER SEQUENCE "phone_otps_id_seq" RENAME TO "email_otps_id_seq";
ALTER TABLE "email_otps" RENAME CONSTRAINT "phone_otps_pkey" TO "email_otps_pkey";
ALTER TABLE "email_otps" RENAME COLUMN "phone" TO "email";
ALTER TABLE "email_otps" ALTER COLUMN "email" TYPE VARCHAR(255);
ALTER TABLE "email_otps" DROP COLUMN "purpose";
DROP TYPE "OtpPurpose";

-- 3. Indexes: dropping "purpose" in step 2 already dropped every index that used it
--    (phone_otps_phone_purpose_created_at_idx and phone_otps_one_active), so only rename the survivor and add the new one.
ALTER INDEX "phone_otps_phone_created_at_idx" RENAME TO "email_otps_email_created_at_idx";
CREATE UNIQUE INDEX "email_otps_one_active" ON "email_otps" ("email") WHERE "used_at" IS NULL;

-- 4. DB-07: rules Prisma cannot declare; same lines as in constraints.sql
ALTER TABLE "email_otps" DROP CONSTRAINT "phone_otps_phone_vn";
ALTER TABLE "email_otps" RENAME CONSTRAINT "phone_otps_tries" TO "email_otps_tries";
ALTER TABLE "email_otps" ADD CONSTRAINT "email_otps_email_format"
  CHECK (email = lower(email) AND email LIKE '%_@_%._%' AND length(email) <= 255);
