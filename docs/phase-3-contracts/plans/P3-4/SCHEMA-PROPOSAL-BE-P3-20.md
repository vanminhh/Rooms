# BE-P3-20 · Đề xuất lưu chỉ số đầu vào riêng

Ngày 20/11/2026, dựa trên `b4da02b`. **Owner đã duyệt Q-P3-14/Q-P3-15, kiểm tra không lỗi và nghiệm thu BE-P3-20; chờ commit.** Migration `20261120000000_contract_meter_openings` có SHA-256 `105076495B442D32EF79916B1798021A1D9CAADC602BD9C624373193C7A40BDE`. Codex không tự deploy do kết nối thất bại ở lượt trước; nghiệm thu hiện tại dựa trên xác nhận owner, không suy đoán output deploy/status chưa được cung cấp và không yêu cầu duyệt lại. Kết quả triển khai/review và nghiệm thu ở [checkpoint](CHECKPOINT-BE-P3-20.md).

## Lý do

Owner chốt: khách cũ ghi chỉ số lúc kết thúc thuê; khách mới phải nhập điện/nước hiện tại khi vào ở làm mốc riêng, cuối tháng tính từ mốc đó. Unique hiện tại `(room_id, kind, read_on)` không cho lưu khác giá trị trong cùng ngày, kể cả khách mới vào ở đúng ngày chốt tháng. Không thể dùng chung một row, ghi đè row cũ hoặc đổi ngày đọc giả để thực hiện đúng quy tắc này.

| Mốc cùng ngày/phòng | Hợp đồng | Vai trò | Điện |
|---|---|---|---:|
| Khách cũ trả phòng | Cũ | Chốt thông thường | 1.284 |
| Khách mới vào ở | Mới | Opening | 1.290 |
| Chốt tháng khách mới | Mới | Chốt thông thường | 1.350 |

Khách mới dùng 60 kWh. Ba row phải cùng tồn tại; 6 kWh trong khoảng phòng trống không cộng vào hóa đơn của hai khách.

## Thay đổi đề xuất

Thêm một boolean vào MeterReading, mặc định false cho dữ liệu hiện hữu:

```prisma
isOpening Boolean @default(false) @map("is_opening")
```

Thay `@@unique([roomId, kind, readOn])` bằng hai index tra cứu; các partial unique nằm trong SQL theo quy ước dự án:

```prisma
@@index([roomId, kind, readOn])
@@index([contractId, kind, readOn])
```

| Nhóm | Unique key | Điều kiện |
|---|---|---|
| Baseline vào ở | contract_id, kind | is_opening |
| Chỉ số thường của hợp đồng | room_id, contract_id, kind, read_on | NOT is_opening AND contract_id IS NOT NULL |
| Chỉ số thường chưa gắn hợp đồng | room_id, kind, read_on | NOT is_opening AND contract_id IS NULL |

Thêm CHECK opening phải có contract. Không đổi FK trong phạm vi đề xuất này. `onDelete: SetNull` hiện tại sẽ bị CHECK chặn nếu ai cố xóa contract có baseline, phù hợp chính sách không hard-delete lịch sử; không cần đổi thành Restrict trong migration này.

SQL cụ thể dự kiến cho migration mới và cập nhật trạng thái cuối tương ứng trong constraints.sql:

```sql
BEGIN;

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
```

Giữ nguyên mọi ID, số đọc, ngày đọc, ảnh/note và contractId hiện hữu. Row cũ được thêm is_opening=false, không tự suy đoán row nào là baseline của hợp đồng cũ. Migration không xóa row, không sửa khoản thu/hóa đơn, không đổi mật khẩu hay dependency. Mốc đầu vào lịch sử chưa xác định không được tự lấy từ hợp đồng khác khi làm billing sau này.

## Đọc/ghi sau migration

- BE-P3-20 tạo hai row `isOpening=true` cho chính contract khi move-in. Audit và ACTIVE cùng transaction; DB unique chặn baseline trùng.
- Phase 4 đọc baseline bằng contractId/kind/isOpening và các chỉ số chốt của chính contract. BIL-07 lưu ID/value/date của mốc dùng để tính vào meta; không tự lấy last reading của phòng làm đầu kỳ.
- Opening và closing cùng ngày phải được phân biệt theo vai trò, không dùng ID/createdAt để suy ra thứ tự đo khi nhập bổ sung.
- CON-18 gia hạn là Phase 5: khi triển khai phải tạo baseline của hợp đồng mới từ mốc chuyển tiếp, giữ row cũ; không chuyển contractId của lịch sử.
- Hàm ghi meter tương lai phải dùng cùng quy ước khóa room để các kiểm chỉ số và insert an toàn dưới request song song.

## Kiểm thiết kế đã chạy

PostgreSQL nhúng PGlite cô lập, bảng tối thiểu mô phỏng cột/index liên quan, không đọc env hay kết nối DB dev. Output: **`Proposal indexes: 8/8 passed (isolated in-memory PostgreSQL only)`**, exit 0.

1. Row/ID cũ giữ nguyên; is_opening mặc định false.
2. Old closing + new opening + new closing cùng room/kind/day cùng tồn tại.
3. Tính từ đúng baseline của contract mới: 1.350 − 1.290 = 60.
4. Baseline thứ hai cùng contract/kind, kể cả khác ngày, bị unique chặn.
5. Chỉ số thường trùng contract/room/kind/day bị chặn.
6. Chỉ số unassigned vẫn unique room/kind/day.
7. Opening thiếu contract bị CHECK chặn.
8. Opening nước tồn tại cạnh opening điện.

Tám ca trên là kiểm thiết kế trước duyệt. Sau duyệt đã kiểm schema đầy đủ: DB checker 107/107, áp đủ 9 migration cũ rồi migration mới trong PGlite; snapshots 28 bảng/sequences/FK và lịch sử tài chính giữ nguyên, baseline/closing riêng cùng ngày đạt. Prisma validate/generate, build/lint và test tập trung đã đạt; xem checkpoint để biết giới hạn A-24 và kết quả thực tế. Không dùng DB dev làm shadow; không tự suy ra ủy quyền apply từ duyệt tạo file.
