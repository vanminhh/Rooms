# BE-LOGIN-06: seed đủ như roadmap Phase 1

Trạng thái: ĐÃ DUYỆT 28/10/2026
Task / spec: BE-LOGIN-06 · `01-architecture.md#roadmap` (seed Phase 1) · SVC-01, PRC-04, RATE-02, CON-04, CON-10, BIL-01, BIL-09
Gốc: b2be3cc

## Làm gì, vì sao

Roadmap ghi seed Phase 1 gồm "1 Boss, 2 managers, 3 buildings, rooms, services, rate plans, 1 tenant with active contract". BE-LOGIN-06 chỉ có người dùng, tòa nhà và settings. Theo luật repo, spec thắng, nên bổ sung BE-LOGIN-06 cho đủ:

- **Phòng:** 2–3 phòng mỗi tòa, giá đã duyệt (Boss đề xuất = tự duyệt, PRC-04). Mỗi tòa còn ít nhất 1 phòng trống có giá cho trang công khai Phase 2. `CG01` có 1 phòng chưa có giá (khách không thấy, CON-02).
- **Dịch vụ:** 4 dịch vụ mỗi tòa theo ví dụ SVC-01.
- **Bảng giá:** đúng giá seed trong `12-pricing.md` (điện 3 bậc, nước 15.000 đ/m³, Wifi, Rác, Gửi xe máy), đã duyệt, hiệu lực 01/09/2026.
- **Hợp đồng đang hiệu lực:** người thuê có cờ đổi mật khẩu giữ 1 hợp đồng ACTIVE ở `CG01`, dựng đúng theo ví dụ BIL-01 và BIL-09 (vào ở 15/09/2026, 6 tháng, tiền phòng 2.500.000, 2 người ở, Wifi + Rác, 1 xe máy, chỉ số điện đầu 1.284). Nhờ vậy Phase 4 kiểm được hóa đơn 3.119.000 đ trên dữ liệu seed.
- "Before you start" thêm các bảng và mục spec mà seed cần.
- "Questions for the owner" thêm câu hỏi giá "Gửi xe điện".

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `docs/phase-1-foundation/feature_p1-1-backend-foundation.md` | cùng đường dẫn | Sửa: BE-LOGIN-06, mục 3–4 và thêm mục 6 của "Before you start", "Questions for the owner" |

## Cách xem và kiểm tra

`git diff --no-index docs/phase-1-foundation/feature_p1-1-backend-foundation.md Artifacts/2026-10-28-BE-LOGIN-06-seed/docs/phase-1-foundation/feature_p1-1-backend-foundation.md`

## Đã kiểm tra

28/10/2026, đối chiếu từng giá trị với spec và `docs/database/`:

- Giá seed điện, nước, Wifi, Rác, Gửi xe máy: `12-pricing.md` dòng "Seed tiers until Q-02…".
- `end_date` 14/03/2027 cho vào ở 15/09/2026, 6 tháng: đúng ví dụ BIL-01.
- Hợp đồng ACTIVE cần `signed_at` và `moved_in_at` (`constraints.sql`: `contracts_active_ready`); người ký là occupant duy nhất có `is_signer` (`occupants_one_signer`); 1 hợp đồng mở mỗi phòng (`contracts_one_open_per_room`); bảng giá dịch vụ đúng 1 bậc (RATE-02).
- `deposit` 0 hợp lệ (`contracts_money`: `deposit >= 0`; CON-10 cho phép chuyển ACTIVE khi deposit = 0).
- File đích không đổi so với `b2be3cc` (`git status` sạch).

Chưa chạy được seed: chưa có Prisma, migration và database (phần 1 sẽ làm).

## Giả định hoặc câu hỏi cho chủ dự án

- **Tiền cọc của hợp đồng seed = 0** (chủ dự án đồng ý 28/10/2026). Lý do: hợp đồng ACTIVE cần hóa đơn cọc đã thanh toán, mà hóa đơn và thanh toán thuộc Phase 4; cọc = 0 thì seed không phải tạo 2 bảng đó. Nếu muốn cọc thật (vd 2.500.000) thì seed phải thêm 1 hóa đơn DEPOSIT đã PAID và 1 thanh toán.
- **Giá "Gửi xe điện" chưa có trong spec.** Dịch vụ vẫn được seed, nhưng chưa có bảng giá cho đến khi chủ dự án trả lời.
- **Cả 3 tòa tính nước theo m³ (`PER_M3`).** Spec chỉ cho giá seed nước theo m³; tính theo người (`PER_PERSON`) chưa có giá.
- **Người thuê có hợp đồng chính là người thuê có cờ đổi mật khẩu** (giống luồng thật CON-07: ký xong mới nhận mật khẩu tạm). Người thuê bị khóa không có hợp đồng.

Đã chép vào file chính 28/10/2026 bằng apply-draft.mjs: 1 file.
