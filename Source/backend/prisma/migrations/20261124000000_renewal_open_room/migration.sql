BEGIN;

-- D-45 (1): a renewal on HOLD can wait alongside its ACTIVE contract.
DROP INDEX contracts_one_open_per_room;
CREATE UNIQUE INDEX contracts_one_open_per_room ON contracts (room_id)
  WHERE status = 'ACTIVE' OR (status = 'HOLD' AND previous_contract_id IS NULL);

COMMIT;
