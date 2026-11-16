BEGIN;

-- D-37: prevent a concurrent write between checking for legacy URLs and dropping the columns.
LOCK TABLE contracts, occupants IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM contracts WHERE signed_scan_url IS NOT NULL)
    OR EXISTS (SELECT 1 FROM occupants WHERE id_front_url IS NOT NULL OR id_back_url IS NOT NULL)
  THEN
    RAISE EXCEPTION 'Cannot migrate private contract assets while legacy URLs exist. Backfill verified Cloudinary asset IDs before retrying.';
  END IF;
END
$$;

-- D-40: calendar-month billing has no per-contract billing day.
ALTER TABLE contracts
  DROP CONSTRAINT contracts_billing_day,
  DROP COLUMN billing_day,
  DROP COLUMN signed_scan_url,
  ADD COLUMN signed_scan_asset_id TEXT,
  ADD CONSTRAINT contracts_signed_scan_asset_id_nonblank
    CHECK (signed_scan_asset_id IS NULL OR signed_scan_asset_id ~ '[^[:space:]]');

ALTER TABLE occupants
  DROP COLUMN id_front_url,
  DROP COLUMN id_back_url,
  ADD COLUMN id_front_asset_id TEXT,
  ADD COLUMN id_back_asset_id TEXT,
  ADD CONSTRAINT occupants_id_front_asset_id_nonblank
    CHECK (id_front_asset_id IS NULL OR id_front_asset_id ~ '[^[:space:]]'),
  ADD CONSTRAINT occupants_id_back_asset_id_nonblank
    CHECK (id_back_asset_id IS NULL OR id_back_asset_id ~ '[^[:space:]]');

COMMIT;
