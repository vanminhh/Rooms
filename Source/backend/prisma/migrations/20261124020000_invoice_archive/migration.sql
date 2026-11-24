BEGIN;

ALTER TABLE invoices
  ADD COLUMN archived_at TIMESTAMPTZ,
  ADD COLUMN archived_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT invoices_archive_pair CHECK ((archived_at IS NULL) = (archived_by_id IS NULL));

COMMIT;
