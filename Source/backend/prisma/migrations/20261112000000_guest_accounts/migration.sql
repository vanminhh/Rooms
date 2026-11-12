-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('REGISTER', 'VERIFY_PHONE', 'RESET_PASSWORD');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'GUEST';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "locale" VARCHAR(2) NOT NULL DEFAULT 'vi',
ADD COLUMN     "phone_verified_at" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "phone_otps" (
    "id" SERIAL NOT NULL,
    "phone" VARCHAR(10) NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "tries" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_otps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "phone_otps_phone_purpose_created_at_idx" ON "phone_otps"("phone", "purpose", "created_at");

-- CreateIndex
CREATE INDEX "phone_otps_phone_created_at_idx" ON "phone_otps"("phone", "created_at");


-- DB-07: rules Prisma cannot declare; same lines as in constraints.sql (EX-1, AUTH-13, AUTH-15).
-- 'GUEST' is not used here: Postgres allows a new enum value only after this transaction commits.
ALTER TABLE users ADD CONSTRAINT users_locale CHECK (locale IN ('vi', 'en'));
ALTER TABLE phone_otps ADD CONSTRAINT phone_otps_phone_vn CHECK (phone ~ '^0[0-9]{9}$');
ALTER TABLE phone_otps ADD CONSTRAINT phone_otps_tries CHECK (tries BETWEEN 0 AND 5);
CREATE UNIQUE INDEX phone_otps_one_active ON phone_otps (phone, purpose) WHERE used_at IS NULL;
