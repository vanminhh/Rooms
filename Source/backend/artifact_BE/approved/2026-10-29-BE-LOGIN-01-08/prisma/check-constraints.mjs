// Chạy schema.sql + constraints.sql trên PostgreSQL nhúng (PGlite), rồi thử từng tình huống sai.
// Dùng: node check-constraints.mjs <thư mục có node_modules/@electric-sql/pglite> <thư mục chứa schema.sql và constraints.sql>
// schema.sql sinh bằng: npx prisma migrate diff --from-empty --to-schema-datamodel schema.prisma --script -o schema.sql
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [deps, dbDir] = process.argv.slice(2);
const { PGlite } = await import(pathToFileURL(join(deps, 'node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite();

await db.exec(readFileSync(join(dbDir, 'schema.sql'), 'utf8'));
await db.exec(readFileSync(join(dbDir, 'constraints.sql'), 'utf8'));

// Dữ liệu nền dùng chung cho mọi tình huống
await db.exec(`
INSERT INTO users (id, role, phone, full_name, password_hash, updated_at) VALUES
  (1, 'BOSS',    '0900000001', 'Boss',      'x', now()),
  (2, 'MANAGER', '0900000002', 'Quản lý 1', 'x', now()),
  (3, 'MANAGER', '0900000003', 'Quản lý 2', 'x', now()),
  (4, 'TENANT',  '0900000004', 'Người thuê 1', 'x', now()),
  (5, 'TENANT',  '0900000005', 'Người thuê 2', 'x', now());
INSERT INTO buildings (id, code, name, address, district, ward, manager_id, water_mode, updated_at) VALUES
  (1, 'CG01', 'Tòa Cầu Giấy',  '1 Xuân Thủy', 'Cầu Giấy', 'Dịch Vọng Hậu', 2, 'PER_M3', now()),
  (2, 'DD01', 'Tòa Đống Đa',   '2 Tây Sơn',   'Đống Đa',  'Quang Trung',   2, 'PER_PERSON', now()),
  (3, 'HM01', 'Tòa Hoàng Mai', '3 Giải Phóng','Hoàng Mai','Giáp Bát',      NULL, 'PER_M3', now());
INSERT INTO rooms (id, building_id, code, floor, area_m2, price, updated_at) VALUES
  (1, 1, '203', 2, 24, 2500000, now()),
  (2, 1, '204', 2, 22, 2400000, now()),
  (3, 2, '101', 1, 20, 2200000, now());
INSERT INTO services (id, building_id, name, unit) VALUES
  (1, 1, 'Wifi', 'ROOM'), (2, 1, 'Gửi xe máy', 'VEHICLE'), (3, 2, 'Wifi', 'ROOM');
INSERT INTO contracts (id, code, building_id, room_id, tenant_id, start_date, term_months, end_date, billing_day, rent, deposit, status, created_by_id, updated_at) VALUES
  (1, 'HD000001', 1, 1, 4, '2026-09-15', 6, '2027-03-14', 15, 2500000, 2500000, 'HOLD', 2, now());
INSERT INTO invoices (id, contract_id, type, period_no, issue_date, due_date, total, status, updated_at) VALUES
  (1, 1, 'DEPOSIT', 0, '2026-09-10', '2026-09-15', 2500000, 'UNPAID', now());
INSERT INTO invoice_lines (invoice_id, kind, label, quantity, unit_price, amount) VALUES
  (1, 'DEPOSIT', 'Tiền cọc', 1, 2500000, 2500000);
INSERT INTO announcements (id, building_id, title, body, author_id) VALUES (1, 1, 'Lịch vệ sinh', '...', 2);
SELECT setval(pg_get_serial_sequence(t, 'id'), 100)
  FROM unnest(ARRAY['users','buildings','rooms','services','contracts','invoices','announcements']) AS t;
`);

const C = `INSERT INTO contracts (code, building_id, room_id, tenant_id, start_date, term_months, end_date, billing_day, rent, deposit, status, created_by_id, updated_at) VALUES`;

// [nhóm, tình huống, SQL, kết quả mong đợi: 'ok' hoặc tên ràng buộc/mã lỗi phải xuất hiện]
const cases = [
  ['Tài khoản', 'Thêm Boss thứ hai', `INSERT INTO users (role, phone, full_name, password_hash, updated_at) VALUES ('BOSS','0900000009','B2','x',now())`, 'users_one_boss'],
  ['Tài khoản', 'SĐT sai định dạng', `INSERT INTO users (role, phone, full_name, password_hash, updated_at) VALUES ('TENANT','12345','X','x',now())`, 'users_phone_vn'],
  ['Tài khoản', 'SĐT trùng người khác', `INSERT INTO users (role, phone, full_name, password_hash, updated_at) VALUES ('TENANT','0900000004','X','x',now())`, 'users_phone_key'],
  ['Tòa', 'Giao tòa thứ 3 cho cùng một quản lý', `UPDATE buildings SET manager_id = 2 WHERE id = 3`, 'MANAGER_MAX_2_BUILDINGS'],
  ['Tòa', 'Gán người thuê làm quản lý tòa', `UPDATE buildings SET manager_id = 4 WHERE id = 3`, 'BUILDING_MANAGER_ROLE'],
  ['Tòa', 'Gán quản lý thứ hai cho tòa trống', `UPDATE buildings SET manager_id = 3 WHERE id = 3`, 'ok'],
  ['Tòa', 'Xóa tòa còn phòng', `DELETE FROM buildings WHERE id = 1`, 'violates foreign key'],
  ['Phòng', 'Trùng mã phòng trong cùng tòa', `INSERT INTO rooms (building_id, code, floor, area_m2, updated_at) VALUES (1,'203',2,20,now())`, 'rooms_building_id_code_key'],
  ['Phòng', 'Cùng mã phòng ở tòa khác', `INSERT INTO rooms (building_id, code, floor, area_m2, updated_at) VALUES (2,'203',2,20,now())`, 'ok'],
  ['Giá', 'Hai đề xuất giá phòng cùng chờ duyệt', `INSERT INTO room_prices (room_id, price, effective_from, proposed_by_id) VALUES (1,2600000,'2026-11-01',2),(1,2700000,'2026-11-01',2)`, 'room_prices_one_pending'],
  ['Giá', 'Bảng giá dịch vụ thiếu dịch vụ', `INSERT INTO rate_plans (building_id, kind, effective_from, proposed_by_id) VALUES (1,'SERVICE','2026-11-01',2)`, 'rate_plans_service_iff'],
  ['Giá', 'Hai đề xuất giá điện cùng chờ duyệt', `INSERT INTO rate_plans (building_id, kind, effective_from, proposed_by_id) VALUES (1,'ELECTRIC','2026-11-01',2),(1,'ELECTRIC','2026-12-01',2)`, 'rate_plans_one_pending'],
  ['Giá', 'Bảng giá dịch vụ dùng dịch vụ của tòa khác', `INSERT INTO rate_plans (building_id, kind, service_id, effective_from, proposed_by_id) VALUES (1,'SERVICE',3,'2026-11-01',2)`, 'rate_plans_service_id_building_id_fkey'],
  ['Hợp đồng', 'Hợp đồng 2 tháng', `${C} ('HD9',1,2,5,'2026-11-01',2,'2026-12-31',1,2400000,0,'HOLD',2,now())`, 'contracts_term_min_3'],
  ['Hợp đồng', 'Hợp đồng thứ hai cho phòng đang giữ chỗ', `${C} ('HD9',1,1,5,'2026-11-01',3,'2027-01-31',1,2500000,0,'HOLD',2,now())`, 'contracts_one_open_per_room'],
  ['Hợp đồng', 'Phòng của tòa 1 nhưng ghi tòa 2', `${C} ('HD9',2,2,5,'2026-11-01',3,'2027-01-31',1,2400000,0,'HOLD',2,now())`, 'contracts_room_id_building_id_fkey'],
  ['Hợp đồng', 'Người ký là tài khoản quản lý', `${C} ('HD9',1,2,3,'2026-11-01',3,'2027-01-31',1,2400000,0,'HOLD',2,now())`, 'CONTRACT_TENANT_ROLE'],
  ['Hợp đồng', 'Chuyển Hiệu lực khi chưa ghi ngày vào ở', `UPDATE contracts SET status='ACTIVE', signed_at=now() WHERE id=1`, 'contracts_active_ready'],
  ['Hợp đồng', 'Hợp đồng cũ kết thúc rồi cho thuê lại phòng', `UPDATE contracts SET status='ENDED' WHERE id=1; ${C} ('HD9',1,1,5,'2027-03-15',6,'2027-09-14',15,2500000,0,'HOLD',2,now())`, 'ok'],
  ['Hợp đồng', 'Một người thuê thêm phòng thứ hai', `${C} ('HD9',1,2,4,'2026-11-01',3,'2027-01-31',1,2400000,0,'HOLD',2,now())`, 'ok'],
  ['Hợp đồng', 'Hai hợp đồng cùng gia hạn từ một hợp đồng cũ', `UPDATE contracts SET status='ENDED' WHERE id=1; ${C.replace('code,', 'code, previous_contract_id,')} ('HD8',1,1,1,4,'2027-03-15',3,'2027-06-14',15,2500000,0,'HOLD',2,now()); ${C.replace('code,', 'code, previous_contract_id,')} ('HD9',1,1,2,4,'2026-11-01',3,'2027-01-31',1,2400000,0,'HOLD',2,now())`, 'contracts_previous_contract_id_key'],
  ['Hợp đồng', 'Chọn dịch vụ của tòa khác', `INSERT INTO contract_services VALUES (1,3,1)`, 'contract_services_service_id_building_id_fkey'],
  ['Hợp đồng', 'Chọn dịch vụ cùng tòa', `INSERT INTO contract_services VALUES (1,1,1)`, 'ok'],
  ['Hợp đồng', 'Hai người ký trên một hợp đồng', `INSERT INTO occupants (contract_id, full_name, is_signer, move_in_date) VALUES (1,'A',true,'2026-09-15'),(1,'B',true,'2026-09-15')`, 'occupants_one_signer'],
  ['Xe', 'Xe gửi theo dịch vụ của tòa khác', `INSERT INTO vehicles (contract_id, building_id, service_id, plate, type, registered_at) VALUES (1,1,3,'29A12345','MOTORBIKE','2026-09-15')`, 'vehicles_service_id_building_id_fkey'],
  ['Xe', 'Một biển số đang gửi ở hai nơi', `INSERT INTO vehicles (contract_id, building_id, service_id, plate, type, registered_at) VALUES (1,1,2,'29A12345','MOTORBIKE','2026-09-15'),(1,1,2,'29A12345','MOTORBIKE','2026-09-16')`, 'vehicles_plate_active'],
  ['Xe', 'Biển số cũ đã ngừng gửi, đăng ký lại', `INSERT INTO vehicles (contract_id, building_id, service_id, plate, type, registered_at, is_active, removed_at) VALUES (1,1,2,'29A12345','MOTORBIKE','2026-09-15',false,'2026-10-01'),(1,1,2,'29A12345','MOTORBIKE','2026-10-02',true,NULL)`, 'ok'],
  ['Điện nước', 'Hai số điện cùng ngày cho một phòng', `INSERT INTO meter_readings (room_id, kind, value, read_on, read_by_id) VALUES (1,'ELECTRIC',1284,'2026-09-15',2),(1,'ELECTRIC',1290,'2026-09-15',2)`, 'meter_readings_room_id_kind_read_on_key'],
  ['Điện nước', 'Thay đồng hồ mà không ghi số cuối đồng hồ cũ', `INSERT INTO meter_readings (room_id, kind, value, read_on, read_by_id, is_meter_replaced) VALUES (1,'ELECTRIC',0,'2026-09-20',2,true)`, 'meter_readings_values'],
  ['Hóa đơn', 'Hai hóa đơn cho cùng kỳ 1', `INSERT INTO invoices (contract_id, type, period_no, period_start, period_end, updated_at) VALUES (1,'MONTHLY',1,'2026-09-15','2026-10-14',now()),(1,'MONTHLY',1,'2026-09-15','2026-10-14',now())`, 'invoices_one_per_period'],
  ['Hóa đơn', 'Hủy hóa đơn kỳ 1 rồi lập lại', `INSERT INTO invoices (id, contract_id, type, period_no, period_start, period_end, status, cancel_reason, updated_at) VALUES (20,1,'MONTHLY',1,'2026-09-15','2026-10-14','CANCELLED','Sai chỉ số',now()); INSERT INTO invoices (contract_id, type, period_no, period_start, period_end, replaces_id, updated_at) VALUES (1,'MONTHLY',1,'2026-09-15','2026-10-14',20,now())`, 'ok'],
  ['Hóa đơn', 'Hủy hóa đơn không ghi lý do', `UPDATE invoices SET status='CANCELLED' WHERE id=1`, 'invoices_cancel_reason'],
  ['Hóa đơn', 'Phát hành mà không có hạn đóng', `INSERT INTO invoices (contract_id, type, period_no, period_start, period_end, status, updated_at) VALUES (1,'MONTHLY',1,'2026-09-15','2026-10-14','UNPAID',now())`, 'invoices_issued_dates'],
  ['Hóa đơn', 'Dòng tiền tính sai (84 × 3.500 ≠ 290.000)', `INSERT INTO invoice_lines (invoice_id, kind, label, quantity, unit_price, amount) VALUES (1,'ELECTRIC','Điện',84,3500,290000)`, 'invoice_lines_amount'],
  ['Hóa đơn', 'Đơn giá âm ở dòng tiền điện', `INSERT INTO invoice_lines (invoice_id, kind, label, quantity, unit_price, amount) VALUES (1,'ELECTRIC','Điện',1,-1000,-1000)`, 'invoice_lines_sign'],
  ['Thanh toán', 'Ghi thu thiếu tiền', `INSERT INTO payments (invoice_id, amount, method, source, recorded_by_id, paid_at) VALUES (1,2000000,'CASH','MANUAL',2,now())`, 'PAYMENT_AMOUNT_MISMATCH'],
  ['Thanh toán', 'Ghi thu đủ tiền → hóa đơn tự thành Đã thanh toán', `INSERT INTO payments (invoice_id, amount, method, source, recorded_by_id, paid_at) VALUES (1,2500000,'CASH','MANUAL',2,now()); DO $$ BEGIN IF (SELECT status FROM invoices WHERE id=1) <> 'PAID' THEN RAISE EXCEPTION 'không chuyển PAID'; END IF; END $$`, 'ok'],
  ['Thanh toán', 'Thu lần hai cho hóa đơn đã trả', `INSERT INTO payments (invoice_id, amount, method, source, recorded_by_id, paid_at) VALUES (1,2500000,'CASH','MANUAL',2,now()); INSERT INTO payments (invoice_id, amount, method, source, recorded_by_id, paid_at) VALUES (1,2500000,'CARD','MANUAL',2,now())`, 'INVOICE_NOT_UNPAID'],
  ['Thanh toán', 'Ghi nguồn webhook mà không có giao dịch ngân hàng', `INSERT INTO payments (invoice_id, amount, method, source, paid_at) VALUES (1,2500000,'BANK_TRANSFER','WEBHOOK',now())`, 'payments_source'],
  ['Thanh toán', 'Webhook đúng mã + đúng tiền', `INSERT INTO bank_transactions (id, provider, provider_tx_id, amount, content, account_number, received_at, raw, status, invoice_id) VALUES (1,'SEPAY','tx-1',2500000,'TT1 P203','0123',now(),'{}','MATCHED',1); INSERT INTO payments (invoice_id, amount, method, source, bank_transaction_id, paid_at) VALUES (1,2500000,'BANK_TRANSFER','WEBHOOK',1,now())`, 'ok'],
  ['Thanh toán', 'Webhook gửi lại cùng một giao dịch', `INSERT INTO bank_transactions (provider, provider_tx_id, amount, content, account_number, received_at, raw, status) VALUES ('SEPAY','tx-1',100,'x','0123',now(),'{}','UNMATCHED'),('SEPAY','tx-1',100,'x','0123',now(),'{}','UNMATCHED')`, 'bank_transactions_provider_provider_tx_id_key'],
  ['Thanh toán', 'Giao dịch ghi đã khớp nhưng không có hóa đơn', `INSERT INTO bank_transactions (provider, provider_tx_id, amount, content, account_number, received_at, raw, status) VALUES ('SEPAY','tx-2',100,'x','0123',now(),'{}','MATCHED')`, 'bank_tx_invoice_link'],
  ['Thanh lý', 'Quyết toán cộng trừ sai', `INSERT INTO settlements (contract_id, move_out_date, deposit, last_period_amount, net, settled_by_id) VALUES (1,'2027-03-14',2500000,3000000,0,2)`, 'settlements_net'],
  ['Thanh lý', 'Khách còn thiếu mà không có hóa đơn cuối', `INSERT INTO settlements (contract_id, move_out_date, deposit, last_period_amount, net, settled_by_id) VALUES (1,'2027-03-14',2500000,3000000,-500000,2)`, 'settlements_final_invoice'],
  ['Thanh lý', 'Khách còn dư cọc, không cần hóa đơn cuối', `INSERT INTO settlements (contract_id, move_out_date, deposit, last_period_amount, net, settled_by_id) VALUES (1,'2027-03-14',2500000,2000000,500000,2)`, 'ok'],
  ['Yêu cầu', 'Hai yêu cầu trả phòng cùng chờ', `INSERT INTO requests (contract_id, type, title, created_by_id, updated_at) VALUES (1,'MOVE_OUT','Trả phòng',4,now()),(1,'RENEW','Gia hạn',4,now())`, 'requests_one_pending_moveout_renew'],
  ['Yêu cầu', 'Sự cố mang trạng thái Đã duyệt', `INSERT INTO requests (contract_id, type, status, title, created_by_id, updated_at) VALUES (1,'INCIDENT','APPROVED','Hỏng đèn',4,now())`, 'requests_status_by_type'],
  ['Yêu cầu', 'Ghi chi phí sửa cho yêu cầu gia hạn', `INSERT INTO requests (contract_id, type, title, cost, created_by_id, updated_at) VALUES (1,'RENEW','Gia hạn',100000,4,now())`, 'requests_cost'],
  ['Thông báo', 'Thông báo cho phòng của tòa khác', `INSERT INTO announcements (building_id, room_id, title, body, author_id) VALUES (2,1,'x','x',2)`, 'announcements_room_id_building_id_fkey'],
  ['Thông báo', 'Gửi một thông báo hai lần cho cùng người', `INSERT INTO notifications (user_id, kind, title, announcement_id) VALUES (4,'ANNOUNCEMENT','x',1),(4,'ANNOUNCEMENT','x',1)`, 'notifications_once_per_announcement'],
];

let failed = 0;
const rows = [];
for (const [group, name, sql, expect] of cases) {
  let got = 'ok';
  await db.exec('BEGIN');
  try { await db.exec(sql); } catch (e) { got = e.message; }
  await db.exec('ROLLBACK');
  const pass = expect === 'ok' ? got === 'ok' : got.includes(expect);
  if (!pass) failed++;
  rows.push({ group, name, expect, pass, got: got === 'ok' ? 'ok' : got.slice(0, 140) });
}
for (const r of rows) console.log(`${r.pass ? 'PASS' : 'FAIL'} | ${r.group} | ${r.name} | mong đợi: ${r.expect}${r.pass ? '' : ` | thực tế: ${r.got}`}`);
console.log(`\n${rows.length - failed}/${rows.length} tình huống đúng như mong đợi`);
process.exit(failed ? 1 : 0);
