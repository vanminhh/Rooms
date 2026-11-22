BEGIN;

ALTER TABLE "meter_readings" ADD COLUMN "invoice_id" INTEGER;
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "meter_readings_invoice_id_idx" ON "meter_readings"("invoice_id");

COMMIT;
