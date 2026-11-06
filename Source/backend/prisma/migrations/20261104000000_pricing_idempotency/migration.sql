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

-- CreateIndex
CREATE UNIQUE INDEX "pricing_idempotency_keys_actor_route_key_key" ON "pricing_idempotency_keys"("actor_id", "route", "key");

-- AddForeignKey
ALTER TABLE "pricing_idempotency_keys" ADD CONSTRAINT "pricing_idempotency_keys_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
