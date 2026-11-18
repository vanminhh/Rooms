BEGIN;

-- VIEW-06 / D-39: preserve which HOLD creation cancelled the viewing and who called.
ALTER TABLE viewings
  ADD COLUMN called_by_id INTEGER,
  ADD COLUMN called_at TIMESTAMPTZ,
  ADD COLUMN deposit_cancelled_by_contract_id INTEGER,
  ADD CONSTRAINT viewings_called_by_id_fkey
    FOREIGN KEY (called_by_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT viewings_deposit_cancelled_by_contract_id_fkey
    FOREIGN KEY (deposit_cancelled_by_contract_id) REFERENCES contracts(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT viewings_called_pair CHECK ((called_by_id IS NULL) = (called_at IS NULL)),
  ADD CONSTRAINT viewings_deposit_cancellation_status
    CHECK (deposit_cancelled_by_contract_id IS NULL OR status = 'CANCELLED'),
  ADD CONSTRAINT viewings_called_requires_deposit_cancellation
    CHECK (called_at IS NULL OR deposit_cancelled_by_contract_id IS NOT NULL);

-- Restore only unambiguous cancellations that were recorded by contract creation.
WITH recorded_cancellations AS (
  SELECT viewing.id AS viewing_id, min(contract.id) AS contract_id
  FROM audit_logs AS audit
  JOIN contracts AS contract ON contract.id = audit.entity_id
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(audit.after -> 'cancelledViewingIds') = 'array'
      THEN audit.after -> 'cancelledViewingIds'
      ELSE '[]'::jsonb
    END
  ) AS cancelled(viewing_id)
  JOIN viewings AS viewing ON viewing.room_id = contract.room_id
    AND to_jsonb(viewing.id) = cancelled.viewing_id
  WHERE audit.action = 'contract.create'
    AND audit.entity = 'contract'
    AND viewing.status = 'CANCELLED'
  GROUP BY viewing.id
  HAVING count(DISTINCT contract.id) = 1
)
UPDATE viewings AS viewing
SET deposit_cancelled_by_contract_id = recorded.contract_id
FROM recorded_cancellations AS recorded
WHERE viewing.id = recorded.viewing_id;

COMMIT;
