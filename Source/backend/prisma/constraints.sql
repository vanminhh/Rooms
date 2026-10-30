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
