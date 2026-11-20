BEGIN;

-- CON-10 / MTR-02: preserve a contract's opening separately from daily readings.
-- Existing rows remain unchanged and become regular readings through the default.
ALTER TABLE meter_readings
  ADD COLUMN is_opening boolean NOT NULL DEFAULT false;

DROP INDEX meter_readings_room_id_kind_read_on_key;

ALTER TABLE meter_readings
  ADD CONSTRAINT meter_readings_opening_contract
  CHECK (NOT is_opening OR contract_id IS NOT NULL);

CREATE UNIQUE INDEX meter_readings_contract_opening_key
  ON meter_readings (contract_id, kind)
  WHERE is_opening;

CREATE UNIQUE INDEX meter_readings_contract_daily_key
  ON meter_readings (room_id, contract_id, kind, read_on)
  WHERE NOT is_opening AND contract_id IS NOT NULL;

CREATE UNIQUE INDEX meter_readings_room_daily_unassigned_key
  ON meter_readings (room_id, kind, read_on)
  WHERE NOT is_opening AND contract_id IS NULL;

CREATE INDEX meter_readings_room_id_kind_read_on_idx
  ON meter_readings (room_id, kind, read_on);

CREATE INDEX meter_readings_contract_id_kind_read_on_idx
  ON meter_readings (contract_id, kind, read_on);

COMMIT;
