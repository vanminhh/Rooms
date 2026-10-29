-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('BOSS', 'MANAGER', 'TENANT');

-- CreateEnum
CREATE TYPE "WaterMode" AS ENUM ('PER_M3', 'PER_PERSON');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "RateKind" AS ENUM ('ELECTRIC', 'WATER', 'SERVICE');

-- CreateEnum
CREATE TYPE "ServiceUnit" AS ENUM ('ROOM', 'PERSON', 'VEHICLE');

-- CreateEnum
CREATE TYPE "ViewingSource" AS ENUM ('WEB', 'MANUAL');

-- CreateEnum
CREATE TYPE "ViewingStatus" AS ENUM ('NEW', 'CONFIRMED', 'WON', 'LOST', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('HOLD', 'ACTIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('MOTORBIKE', 'E_BIKE', 'BICYCLE', 'CAR', 'OTHER');

-- CreateEnum
CREATE TYPE "MeterKind" AS ENUM ('ELECTRIC', 'WATER');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('DEPOSIT', 'MONTHLY', 'FINAL');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'UNPAID', 'PAID', 'SETTLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LineKind" AS ENUM ('DEPOSIT', 'RENT', 'ELECTRIC', 'WATER', 'SERVICE', 'PARKING', 'REMAINING_RENT', 'PREVIOUS_DEBT', 'DAMAGE', 'DEPOSIT_FORFEIT', 'DEPOSIT_OFFSET');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CASH', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('WEBHOOK', 'MANUAL', 'ASSIGNED');

-- CreateEnum
CREATE TYPE "BankProvider" AS ENUM ('SEPAY', 'CASSO');

-- CreateEnum
CREATE TYPE "BankTxStatus" AS ENUM ('MATCHED', 'UNMATCHED', 'ASSIGNED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('INCIDENT', 'MOVE_OUT', 'RENEW', 'OCCUPANT_CHANGE', 'VEHICLE_CHANGE', 'PAYMENT_ISSUE');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'APPROVED', 'REJECTED', 'ESCALATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('ANNOUNCEMENT', 'INVOICE_ISSUED', 'PAYMENT_RECEIVED', 'INVOICE_OVERDUE', 'CONTRACT_EXPIRING', 'REQUEST_UPDATED');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "role" "Role" NOT NULL,
    "phone" VARCHAR(10) NOT NULL,
    "full_name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255),
    "password_hash" TEXT NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "contact_phone" VARCHAR(10),
    "zalo_url" TEXT,
    "facebook_url" TEXT,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "remember" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(6) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "address" VARCHAR(255) NOT NULL,
    "district" VARCHAR(50) NOT NULL,
    "ward" VARCHAR(50) NOT NULL,
    "manager_id" INTEGER,
    "water_mode" "WaterMode" NOT NULL,
    "due_days" INTEGER NOT NULL DEFAULT 5,
    "amenities" JSONB NOT NULL DEFAULT '[]',
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" SERIAL NOT NULL,
    "building_id" INTEGER NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "floor" INTEGER NOT NULL,
    "area_m2" DECIMAL(5,1) NOT NULL,
    "price" INTEGER,
    "max_occupants" INTEGER NOT NULL DEFAULT 2,
    "furniture" JSONB NOT NULL DEFAULT '[]',
    "description" TEXT,
    "under_maintenance" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_images" (
    "id" SERIAL NOT NULL,
    "room_id" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "room_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_prices" (
    "id" SERIAL NOT NULL,
    "room_id" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "proposed_by_id" INTEGER NOT NULL,
    "reviewed_by_id" INTEGER,
    "reviewed_at" TIMESTAMPTZ,
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" SERIAL NOT NULL,
    "building_id" INTEGER NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "unit" "ServiceUnit" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_plans" (
    "id" SERIAL NOT NULL,
    "building_id" INTEGER NOT NULL,
    "kind" "RateKind" NOT NULL,
    "service_id" INTEGER,
    "effective_from" DATE NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "proposed_by_id" INTEGER NOT NULL,
    "reviewed_by_id" INTEGER,
    "reviewed_at" TIMESTAMPTZ,
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_tiers" (
    "id" SERIAL NOT NULL,
    "rate_plan_id" INTEGER NOT NULL,
    "tier_no" INTEGER NOT NULL,
    "up_to" INTEGER,
    "unit_price" INTEGER NOT NULL,

    CONSTRAINT "rate_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "viewings" (
    "id" SERIAL NOT NULL,
    "room_id" INTEGER NOT NULL,
    "guest_name" VARCHAR(100) NOT NULL,
    "guest_phone" VARCHAR(10) NOT NULL,
    "visit_date" DATE NOT NULL,
    "time_slot" VARCHAR(20) NOT NULL,
    "note" TEXT,
    "source" "ViewingSource" NOT NULL DEFAULT 'WEB',
    "status" "ViewingStatus" NOT NULL DEFAULT 'NEW',
    "handled_by_id" INTEGER,
    "outcome_note" TEXT,
    "contract_id" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "viewings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "building_id" INTEGER NOT NULL,
    "room_id" INTEGER NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "previous_contract_id" INTEGER,
    "start_date" DATE NOT NULL,
    "term_months" INTEGER NOT NULL,
    "end_date" DATE NOT NULL,
    "billing_day" INTEGER NOT NULL,
    "rent" INTEGER NOT NULL,
    "deposit" INTEGER NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'HOLD',
    "terms" TEXT,
    "pdf_url" TEXT,
    "signed_scan_url" TEXT,
    "signed_at" TIMESTAMPTZ,
    "moved_in_at" TIMESTAMPTZ,
    "move_out_notice_date" DATE,
    "planned_move_out_date" DATE,
    "ended_at" TIMESTAMPTZ,
    "cancel_reason" TEXT,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_services" (
    "contract_id" INTEGER NOT NULL,
    "service_id" INTEGER NOT NULL,
    "building_id" INTEGER NOT NULL,

    CONSTRAINT "contract_services_pkey" PRIMARY KEY ("contract_id","service_id")
);

-- CreateTable
CREATE TABLE "occupants" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "full_name" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(10),
    "date_of_birth" DATE,
    "id_number_enc" TEXT,
    "id_number_last4" CHAR(4),
    "id_front_url" TEXT,
    "id_back_url" TEXT,
    "is_signer" BOOLEAN NOT NULL DEFAULT false,
    "move_in_date" DATE NOT NULL,
    "move_out_date" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "occupants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "building_id" INTEGER NOT NULL,
    "service_id" INTEGER NOT NULL,
    "plate" VARCHAR(15) NOT NULL,
    "type" "VehicleType" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "registered_at" DATE NOT NULL,
    "removed_at" DATE,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meter_readings" (
    "id" SERIAL NOT NULL,
    "room_id" INTEGER NOT NULL,
    "contract_id" INTEGER,
    "kind" "MeterKind" NOT NULL,
    "value" INTEGER NOT NULL,
    "read_on" DATE NOT NULL,
    "photo_url" TEXT,
    "is_meter_replaced" BOOLEAN NOT NULL DEFAULT false,
    "old_meter_final" INTEGER,
    "read_by_id" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meter_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "type" "InvoiceType" NOT NULL,
    "period_no" INTEGER NOT NULL DEFAULT 0,
    "period_start" DATE,
    "period_end" DATE,
    "issue_date" DATE,
    "due_date" DATE,
    "total" INTEGER NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "replaces_id" INTEGER,
    "settlement_id" INTEGER,
    "cancel_reason" TEXT,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "kind" "LineKind" NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" SERIAL NOT NULL,
    "provider" "BankProvider" NOT NULL,
    "provider_tx_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "account_number" VARCHAR(30) NOT NULL,
    "received_at" TIMESTAMPTZ NOT NULL,
    "raw" JSONB NOT NULL,
    "status" "BankTxStatus" NOT NULL,
    "invoice_id" INTEGER,
    "handled_by_id" INTEGER,
    "handled_at" TIMESTAMPTZ,
    "note" TEXT,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "source" "PaymentSource" NOT NULL,
    "bank_transaction_id" INTEGER,
    "recorded_by_id" INTEGER,
    "paid_at" TIMESTAMPTZ NOT NULL,
    "note" TEXT,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "move_out_date" DATE NOT NULL,
    "deposit" INTEGER NOT NULL,
    "last_period_amount" INTEGER NOT NULL,
    "remaining_rent" INTEGER NOT NULL DEFAULT 0,
    "previous_debt" INTEGER NOT NULL DEFAULT 0,
    "damages" INTEGER NOT NULL DEFAULT 0,
    "deposit_forfeit" INTEGER NOT NULL DEFAULT 0,
    "net" INTEGER NOT NULL,
    "final_invoice_id" INTEGER,
    "refund_paid_at" TIMESTAMPTZ,
    "note" TEXT,
    "settled_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requests" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "type" "RequestType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "title" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "photos" JSONB NOT NULL DEFAULT '[]',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "cost" INTEGER,
    "decision_note" TEXT,
    "created_by_id" INTEGER NOT NULL,
    "handled_by_id" INTEGER,
    "escalated_at" TIMESTAMPTZ,
    "resolved_at" TIMESTAMPTZ,
    "closed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" SERIAL NOT NULL,
    "building_id" INTEGER,
    "room_id" INTEGER,
    "title" VARCHAR(150) NOT NULL,
    "body" TEXT NOT NULL,
    "author_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "announcement_id" INTEGER,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" VARCHAR(50) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_id" INTEGER,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" INTEGER,
    "action" VARCHAR(50) NOT NULL,
    "entity" VARCHAR(50) NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" VARCHAR(45),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "buildings_code_key" ON "buildings"("code");

-- CreateIndex
CREATE INDEX "buildings_district_ward_idx" ON "buildings"("district", "ward");

-- CreateIndex
CREATE INDEX "buildings_manager_id_idx" ON "buildings"("manager_id");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_building_id_code_key" ON "rooms"("building_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_id_building_id_key" ON "rooms"("id", "building_id");

-- CreateIndex
CREATE INDEX "room_images_room_id_idx" ON "room_images"("room_id");

-- CreateIndex
CREATE INDEX "room_prices_room_id_effective_from_idx" ON "room_prices"("room_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "services_building_id_name_key" ON "services"("building_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "services_id_building_id_key" ON "services"("id", "building_id");

-- CreateIndex
CREATE INDEX "rate_plans_building_id_kind_effective_from_idx" ON "rate_plans"("building_id", "kind", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "rate_tiers_rate_plan_id_tier_no_key" ON "rate_tiers"("rate_plan_id", "tier_no");

-- CreateIndex
CREATE UNIQUE INDEX "viewings_contract_id_key" ON "viewings"("contract_id");

-- CreateIndex
CREATE INDEX "viewings_room_id_visit_date_idx" ON "viewings"("room_id", "visit_date");

-- CreateIndex
CREATE INDEX "viewings_status_idx" ON "viewings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_code_key" ON "contracts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_previous_contract_id_key" ON "contracts"("previous_contract_id");

-- CreateIndex
CREATE INDEX "contracts_tenant_id_idx" ON "contracts"("tenant_id");

-- CreateIndex
CREATE INDEX "contracts_building_id_status_idx" ON "contracts"("building_id", "status");

-- CreateIndex
CREATE INDEX "contracts_status_end_date_idx" ON "contracts"("status", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_id_building_id_key" ON "contracts"("id", "building_id");

-- CreateIndex
CREATE INDEX "occupants_contract_id_idx" ON "occupants"("contract_id");

-- CreateIndex
CREATE INDEX "vehicles_plate_idx" ON "vehicles"("plate");

-- CreateIndex
CREATE INDEX "vehicles_contract_id_idx" ON "vehicles"("contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "meter_readings_room_id_kind_read_on_key" ON "meter_readings"("room_id", "kind", "read_on");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_replaces_id_key" ON "invoices"("replaces_id");

-- CreateIndex
CREATE INDEX "invoices_contract_id_idx" ON "invoices"("contract_id");

-- CreateIndex
CREATE INDEX "invoices_status_due_date_idx" ON "invoices"("status", "due_date");

-- CreateIndex
CREATE INDEX "invoice_lines_invoice_id_idx" ON "invoice_lines"("invoice_id");

-- CreateIndex
CREATE INDEX "bank_transactions_status_idx" ON "bank_transactions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_provider_provider_tx_id_key" ON "bank_transactions"("provider", "provider_tx_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_invoice_id_key" ON "payments"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_bank_transaction_id_key" ON "payments"("bank_transaction_id");

-- CreateIndex
CREATE INDEX "payments_paid_at_idx" ON "payments"("paid_at");

-- CreateIndex
CREATE UNIQUE INDEX "settlements_contract_id_key" ON "settlements"("contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "settlements_final_invoice_id_key" ON "settlements"("final_invoice_id");

-- CreateIndex
CREATE INDEX "requests_contract_id_idx" ON "requests"("contract_id");

-- CreateIndex
CREATE INDEX "requests_status_type_idx" ON "requests"("status", "type");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_images" ADD CONSTRAINT "room_images_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_prices" ADD CONSTRAINT "room_prices_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_prices" ADD CONSTRAINT "room_prices_proposed_by_id_fkey" FOREIGN KEY ("proposed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_prices" ADD CONSTRAINT "room_prices_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_service_id_building_id_fkey" FOREIGN KEY ("service_id", "building_id") REFERENCES "services"("id", "building_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_proposed_by_id_fkey" FOREIGN KEY ("proposed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_tiers" ADD CONSTRAINT "rate_tiers_rate_plan_id_fkey" FOREIGN KEY ("rate_plan_id") REFERENCES "rate_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viewings" ADD CONSTRAINT "viewings_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viewings" ADD CONSTRAINT "viewings_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viewings" ADD CONSTRAINT "viewings_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_room_id_building_id_fkey" FOREIGN KEY ("room_id", "building_id") REFERENCES "rooms"("id", "building_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_previous_contract_id_fkey" FOREIGN KEY ("previous_contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_services" ADD CONSTRAINT "contract_services_contract_id_building_id_fkey" FOREIGN KEY ("contract_id", "building_id") REFERENCES "contracts"("id", "building_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_services" ADD CONSTRAINT "contract_services_service_id_building_id_fkey" FOREIGN KEY ("service_id", "building_id") REFERENCES "services"("id", "building_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occupants" ADD CONSTRAINT "occupants_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_contract_id_building_id_fkey" FOREIGN KEY ("contract_id", "building_id") REFERENCES "contracts"("id", "building_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_service_id_building_id_fkey" FOREIGN KEY ("service_id", "building_id") REFERENCES "services"("id", "building_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_read_by_id_fkey" FOREIGN KEY ("read_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_replaces_id_fkey" FOREIGN KEY ("replaces_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_final_invoice_id_fkey" FOREIGN KEY ("final_invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_settled_by_id_fkey" FOREIGN KEY ("settled_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_room_id_building_id_fkey" FOREIGN KEY ("room_id", "building_id") REFERENCES "rooms"("id", "building_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Ràng buộc bổ sung chạy sau schema.sql (đặt vào cùng file migration đầu tiên).
-- Prisma không khai báo được: partial unique index, CHECK, trigger.

-- ── Tài khoản ──
CREATE UNIQUE INDEX users_one_boss ON users (role) WHERE role = 'BOSS';
ALTER TABLE users ADD CONSTRAINT users_phone_vn CHECK (phone ~ '^0[0-9]{9}$');
ALTER TABLE users ADD CONSTRAINT users_contact_phone_vn CHECK (contact_phone IS NULL OR contact_phone ~ '^0[0-9]{9}$');

-- ── Tòa, phòng ──
ALTER TABLE buildings ADD CONSTRAINT buildings_code_format CHECK (code ~ '^[A-Z0-9]{2,6}$');
ALTER TABLE buildings ADD CONSTRAINT buildings_due_days CHECK (due_days BETWEEN 1 AND 31);
ALTER TABLE rooms ADD CONSTRAINT rooms_price_positive CHECK (price IS NULL OR price > 0);
ALTER TABLE rooms ADD CONSTRAINT rooms_area_positive CHECK (area_m2 > 0);
ALTER TABLE rooms ADD CONSTRAINT rooms_max_occupants CHECK (max_occupants >= 1);

-- Quản lý của tòa phải là tài khoản MANAGER đang hoạt động, mỗi quản lý tối đa 2 tòa
CREATE FUNCTION check_building_manager() RETURNS trigger AS $$
DECLARE
  r "Role";
  n int;
BEGIN
  IF NEW.manager_id IS NULL THEN RETURN NEW; END IF;
  -- khóa dòng quản lý để hai lệnh gán song song không cùng lọt qua
  SELECT role INTO r FROM users WHERE id = NEW.manager_id AND is_active FOR UPDATE;
  IF r IS DISTINCT FROM 'MANAGER' THEN
    RAISE EXCEPTION 'BUILDING_MANAGER_ROLE: manager_id phải là tài khoản MANAGER đang hoạt động';
  END IF;
  SELECT count(*) INTO n FROM buildings WHERE manager_id = NEW.manager_id AND id <> NEW.id;
  IF n >= 2 THEN
    RAISE EXCEPTION 'MANAGER_MAX_2_BUILDINGS: một quản lý tối đa 2 tòa';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER buildings_manager_check BEFORE INSERT OR UPDATE OF manager_id ON buildings
  FOR EACH ROW EXECUTE FUNCTION check_building_manager();

-- ── Giá ──
ALTER TABLE room_prices ADD CONSTRAINT room_prices_positive CHECK (price > 0);
CREATE UNIQUE INDEX room_prices_one_pending ON room_prices (room_id) WHERE status = 'PENDING';

ALTER TABLE rate_plans ADD CONSTRAINT rate_plans_service_iff CHECK ((kind = 'SERVICE') = (service_id IS NOT NULL));
CREATE UNIQUE INDEX rate_plans_one_pending ON rate_plans (building_id, kind, COALESCE(service_id, 0)) WHERE status = 'PENDING';
CREATE UNIQUE INDEX rate_plans_one_per_day ON rate_plans (building_id, kind, COALESCE(service_id, 0), effective_from) WHERE status = 'APPROVED';
ALTER TABLE rate_tiers ADD CONSTRAINT rate_tiers_values CHECK (tier_no >= 1 AND unit_price >= 0 AND (up_to IS NULL OR up_to > 0));

-- ── Khách, hợp đồng ──
ALTER TABLE viewings ADD CONSTRAINT viewings_phone_vn CHECK (guest_phone ~ '^0[0-9]{9}$');

ALTER TABLE contracts ADD CONSTRAINT contracts_term_min_3 CHECK (term_months >= 3);
ALTER TABLE contracts ADD CONSTRAINT contracts_billing_day CHECK (billing_day BETWEEN 1 AND 31);
ALTER TABLE contracts ADD CONSTRAINT contracts_dates CHECK (end_date > start_date);
ALTER TABLE contracts ADD CONSTRAINT contracts_money CHECK (rent > 0 AND deposit >= 0);
ALTER TABLE contracts ADD CONSTRAINT contracts_active_ready CHECK (status <> 'ACTIVE' OR (signed_at IS NOT NULL AND moved_in_at IS NOT NULL));
ALTER TABLE contracts ADD CONSTRAINT contracts_not_self_renewal CHECK (previous_contract_id IS DISTINCT FROM id);
-- Mỗi phòng tối đa 1 hợp đồng đang giữ chỗ hoặc đang hiệu lực
CREATE UNIQUE INDEX contracts_one_open_per_room ON contracts (room_id) WHERE status IN ('HOLD', 'ACTIVE');

-- Người ký hợp đồng phải là tài khoản TENANT
CREATE FUNCTION check_contract_tenant() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.tenant_id AND role = 'TENANT') THEN
    RAISE EXCEPTION 'CONTRACT_TENANT_ROLE: tenant_id phải là tài khoản TENANT';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER contracts_tenant_check BEFORE INSERT OR UPDATE OF tenant_id ON contracts
  FOR EACH ROW EXECUTE FUNCTION check_contract_tenant();

CREATE UNIQUE INDEX occupants_one_signer ON occupants (contract_id) WHERE is_signer;
ALTER TABLE occupants ADD CONSTRAINT occupants_dates CHECK (move_out_date IS NULL OR move_out_date >= move_in_date);

CREATE UNIQUE INDEX vehicles_plate_active ON vehicles (plate) WHERE is_active;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_removed CHECK (is_active OR removed_at IS NOT NULL);

-- ── Điện nước, hóa đơn ──
ALTER TABLE meter_readings ADD CONSTRAINT meter_readings_values CHECK (value >= 0 AND (NOT is_meter_replaced OR old_meter_final IS NOT NULL));

ALTER TABLE invoices ADD CONSTRAINT invoices_total CHECK (total >= 0);
ALTER TABLE invoices ADD CONSTRAINT invoices_issued_dates CHECK (status IN ('DRAFT', 'CANCELLED') OR (issue_date IS NOT NULL AND due_date IS NOT NULL AND due_date >= issue_date));
ALTER TABLE invoices ADD CONSTRAINT invoices_monthly_period CHECK (type <> 'MONTHLY' OR (period_no >= 1 AND period_start IS NOT NULL AND period_end IS NOT NULL AND period_end >= period_start));
ALTER TABLE invoices ADD CONSTRAINT invoices_settled_link CHECK ((status = 'SETTLED') = (settlement_id IS NOT NULL));
ALTER TABLE invoices ADD CONSTRAINT invoices_cancel_reason CHECK (status <> 'CANCELLED' OR cancel_reason IS NOT NULL);
-- Mỗi hợp đồng: 1 hóa đơn cọc, 1 hóa đơn mỗi kỳ, 1 hóa đơn cuối (không tính hóa đơn đã hủy)
CREATE UNIQUE INDEX invoices_one_per_period ON invoices (contract_id, type, period_no) WHERE status <> 'CANCELLED';

ALTER TABLE invoice_lines ADD CONSTRAINT invoice_lines_amount CHECK (amount = quantity * unit_price);
ALTER TABLE invoice_lines ADD CONSTRAINT invoice_lines_sign CHECK (quantity >= 0 AND (kind = 'DEPOSIT_OFFSET' OR unit_price >= 0));

ALTER TABLE bank_transactions ADD CONSTRAINT bank_tx_amount CHECK (amount > 0);
ALTER TABLE bank_transactions ADD CONSTRAINT bank_tx_invoice_link CHECK ((status IN ('MATCHED', 'ASSIGNED')) = (invoice_id IS NOT NULL));

ALTER TABLE payments ADD CONSTRAINT payments_amount CHECK (amount > 0);
ALTER TABLE payments ADD CONSTRAINT payments_source CHECK (
  (source = 'WEBHOOK'  AND bank_transaction_id IS NOT NULL AND recorded_by_id IS NULL AND method = 'BANK_TRANSFER') OR
  (source = 'ASSIGNED' AND bank_transaction_id IS NOT NULL AND recorded_by_id IS NOT NULL AND method = 'BANK_TRANSFER') OR
  (source = 'MANUAL'   AND bank_transaction_id IS NULL AND recorded_by_id IS NOT NULL)
);

-- Thanh toán phải đúng tổng hóa đơn và hóa đơn phải đang chờ trả
CREATE FUNCTION check_payment_invoice() RETURNS trigger AS $$
DECLARE
  inv record;
BEGIN
  SELECT total, status INTO inv FROM invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF inv.status <> 'UNPAID' THEN
    RAISE EXCEPTION 'INVOICE_NOT_UNPAID: hóa đơn % đang ở trạng thái %', NEW.invoice_id, inv.status;
  END IF;
  IF NEW.amount <> inv.total THEN
    RAISE EXCEPTION 'PAYMENT_AMOUNT_MISMATCH: trả % nhưng hóa đơn là %', NEW.amount, inv.total;
  END IF;
  UPDATE invoices SET status = 'PAID', updated_at = now() WHERE id = NEW.invoice_id;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER payments_invoice_check BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION check_payment_invoice();

ALTER TABLE settlements ADD CONSTRAINT settlements_parts CHECK (deposit >= 0 AND last_period_amount >= 0 AND remaining_rent >= 0 AND previous_debt >= 0 AND damages >= 0 AND deposit_forfeit >= 0);
ALTER TABLE settlements ADD CONSTRAINT settlements_net CHECK (net = deposit - last_period_amount - remaining_rent - previous_debt - damages - deposit_forfeit);
ALTER TABLE settlements ADD CONSTRAINT settlements_final_invoice CHECK ((net < 0) = (final_invoice_id IS NOT NULL));
ALTER TABLE settlements ADD CONSTRAINT settlements_refund CHECK (refund_paid_at IS NULL OR net > 0);

-- ── Yêu cầu, thông báo ──
ALTER TABLE requests ADD CONSTRAINT requests_status_by_type CHECK (
  (type = 'INCIDENT' AND status IN ('PENDING', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED')) OR
  (type IN ('MOVE_OUT', 'RENEW', 'OCCUPANT_CHANGE', 'VEHICLE_CHANGE') AND status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')) OR
  (type = 'PAYMENT_ISSUE' AND status IN ('PENDING', 'ESCALATED', 'RESOLVED', 'REJECTED', 'CANCELLED'))
);
ALTER TABLE requests ADD CONSTRAINT requests_cost CHECK (cost IS NULL OR (cost >= 0 AND type = 'INCIDENT'));
CREATE UNIQUE INDEX requests_one_pending_moveout_renew ON requests (contract_id) WHERE type IN ('MOVE_OUT', 'RENEW') AND status = 'PENDING';

ALTER TABLE announcements ADD CONSTRAINT announcements_room_needs_building CHECK (room_id IS NULL OR building_id IS NOT NULL);
CREATE UNIQUE INDEX notifications_once_per_announcement ON notifications (announcement_id, user_id) WHERE announcement_id IS NOT NULL;
