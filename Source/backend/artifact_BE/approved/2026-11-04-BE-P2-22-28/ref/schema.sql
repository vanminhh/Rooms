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
    "asset_id" TEXT NOT NULL,
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
CREATE TABLE "pricing_idempotency_keys" (
    "id" SERIAL NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "route" VARCHAR(100) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "status_code" INTEGER NOT NULL,
    "response_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "pricing_idempotency_keys_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "room_images_asset_id_key" ON "room_images"("asset_id");

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
CREATE UNIQUE INDEX "pricing_idempotency_keys_actor_route_key_key" ON "pricing_idempotency_keys"("actor_id", "route", "key");

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
ALTER TABLE "pricing_idempotency_keys" ADD CONSTRAINT "pricing_idempotency_keys_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
