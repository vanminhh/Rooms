# Phase 3 · Hợp đồng

Nguồn: `docs/spec/14-contracts.md` (CON-01..16, CON-22), phần cọc của `docs/spec/16-billing.md` (BIL-10, BIL-11) và các quyết định D-35..D-42 trong `docs/spec/00-overview.md` (chủ dự án, 16/11/2026; D-40..D-42 về hóa đơn tháng là việc của Phase 4, Phase 3 chỉ cần ngày kết thúc hợp đồng đúng theo D-41). File này chỉ trỏ tới mã luật trong spec, không lặp lại nội dung.

**Mục tiêu (roadmap):** từ lịch xem tới người thuê đăng nhập được; tiền cọc được ghi nhận và người thuê dọn vào ở.

**Trạng thái:** **Phase 3 đã xong** (22/11/2026). Toàn bộ P3-1..P3-8 đã làm và commit; chủ dự án nghiệm thu kiểm tay. Số trên commit `a30a53d`: backend **2671/2671**, e2e **67/68** (ca đỏ do mất kết nối DB dev, chạy riêng lại 6/6), checker **107/107**, frontend **997/997**; dữ liệu thử của lượt e2e bị ngắt đã dọn. Tiếp theo: Phase 4 · Money. Hồ sơ chung: [p3-8-qa-checklist.md](p3-8-qa-checklist.md); tiến trình: [PROGRESS.md](PROGRESS.md).

## 1. Quyết định đã chốt

| Câu hỏi | Chủ dự án chọn (16/11/2026) | Quyết định |
|---|---|---|
| Phase 3 làm tới đâu so với Phase 4 (Tiền) | Đủ vòng cọc: hóa đơn cọc có VietQR, nhân sự ghi thu tay tiền cọc (chỉ hóa đơn DEPOSIT), dọn vào ở với chỉ số đầu, hủy hợp đồng sau khi đã cọc kèm quyết toán. Webhook ngân hàng, hóa đơn tháng, chốt chỉ số định kỳ, quyết toán khi trả phòng vẫn ở Phase 4 | D-35 |
| PDF hợp đồng | Trang in của mẫu đã điền; nhân sự và người thuê bấm In hoặc "Lưu thành PDF" của trình duyệt. Không cài thư viện PDF | D-36, CON-22 |
| Mẫu hợp đồng | Chủ dự án gửi sau; trong lúc chờ dùng bản nháp có dòng "BẢN NHÁP – chưa dùng để ký" | Q-15 |
| Bản scan hợp đồng đã ký | Riêng tư như ảnh CCCD: tệp private trên Cloudinary, mỗi lần xem tạo đường dẫn có hạn ≤ 5 phút; nhân sự trong phạm vi tòa và chính người thuê xem được | D-37, CON-06, CON-16 |
| Ngày thu tiền hằng tháng | **Kỳ theo tháng dương lịch** cho cả chuỗi (mùng 1 → cuối tháng), không có ô sửa ngày; hóa đơn phát hành **mùng 1**, hạn trả **mùng 9**, chưa đóng từ mùng 10 là quá hạn; quản lý phải nhập đủ chỉ số kịp phát hành mùng 1 | D-40 |
| Tiền lẻ tháng đầu / tháng cuối | Hợp đồng vẫn hết đúng N tháng từ ngày vào ở; tháng vào và tháng dọn đi tính lẻ **theo số ngày thực của tháng đó**; tiền phòng và dịch vụ cố định (wifi, rác, gửi xe) chia giống nhau | D-41 |

Quyết định cũ vẫn áp dụng: D-01 (tài khoản thuộc người ký), D-03 (tối thiểu 3 tháng), D-04 (cọc khi ký), D-07 (dịch vụ theo hợp đồng), D-08 (giá thuê chốt lúc tạo), D-17 (CCCD mã hóa, ảnh riêng tư), D-26 (một tài khoản liên tục từ khách sang người thuê), giả định A-02 (hạn cọc), A-16, A-18 (nhân sự xác nhận tài khoản khách đúng là của người ký).

## 2. Câu hỏi còn mở

| Mã | Câu hỏi | Đề xuất | Chặn |
|---|---|---|---|
| Q-15 | Nội dung mẫu hợp đồng thật | Chủ dự án gửi file; agent chuyển thành mẫu có chỗ điền | Ký hợp đồng thật (không chặn code) |
| Q-P3-16 | Trạng thái hợp đồng cho phép thêm/sửa người ở | HOLD/ACTIVE được sửa, ENDED/CANCELLED chỉ xem; chờ owner chốt | BE-P3-23 |
| Q-P3-17 | Kiểm giới hạn khi lịch ở nằm ở ngày tương lai/quá khứ | Kiểm các ngày lưu trú giao nhau kể cả HOLD, thay vì chỉ hôm nay; chờ owner chốt và phối hợp guard room/move-in | BE-P3-23 |
| – | (Q-16 đã trả lời: kỳ theo tháng dương lịch, D-40) | – | – |

Đã trả lời (chủ dự án, 16/11/2026):

| Mã | Câu trả lời | Ghi vào |
|---|---|---|
| Q-P3-1 | Việc "gọi khách bị hủy lịch" ở lại "Việc hôm nay" **tới khi nhân sự bấm "Đã gọi"** (cần thêm cột ghi ai bấm, lúc nào: một migration nhỏ) | D-39, VIEW-06, BE-P3-11, FE-P3-08 |
| Q-P3-2 | **Không cần ảnh đồng hồ**: đồng hồ lắp bên ngoài, quản lý tự xem vào ngày mình chọn trong tháng, khách không khai báo chỉ số | D-38, CON-10, MTR-07, BE-P3-20 |
| Q-P3-3 | Phase 3 chỉ lập quyết toán và hiện số tiền phải trả; ghi "đã trả lại tiền" làm ở **Phase 4** | BE-P3-21 |
| Q-P3-4 | Thiếu `CCCD_KEY` thì **app không khởi động** | BE-P3-02 |

Chủ dự án chốt thêm ngày 20/11/2026:

Owner sửa luồng người ở: quản lý hoặc tenant tự thêm người ở cùng vào hợp đồng của tenant; không cần request duyệt cho thao tác thêm. CCCD/ảnh roommate tùy chọn, khi cung cấp vẫn mã hóa/private. Tiền phòng và điện theo phòng; phí theo người của người mới được cộng trong tháng moveInDate khi chốt tháng, parking theo xe thật đăng ký. Q-P3-18 đã chốt: cộng một đơn vị phí theo người bất kể ngày vào nào, không chia thêm theo ngày riêng của người đó; giữ D-41 cho tháng lẻ hợp đồng. Đã cập nhật CON-13/15, D-17, billing và phạm vi BE-P3-23/FE-P3-12. Không bỏ maxOccupants hoặc coi Q-P3-16/17 đã được trả lời; theo yêu cầu tiếp tục, triển khai hai mặc định đã trình dưới A-25/26 để owner kiểm ở checkpoint. Không tự áp câu trả lời về người sang cách prorate xe. Bộ tính hóa đơn vẫn Phase 4.

| Mã | Câu trả lời / việc cần duyệt | Ghi vào |
|---|---|---|
| Q-P3-18 | Mỗi người thêm tính một đơn vị phí theo người trong tháng vào ở, bất kể ngày vào; không chia thêm theo số ngày ở của riêng người đó. Giữ D-41 cho tháng lẻ hợp đồng | CON-13, BIL counting rules / Phase 4 |
| Q-P3-19 | Xe chỉ được thêm/sửa/ngừng đăng ký trên HOLD/ACTIVE; hợp đồng cũ chỉ xem lịch sử | CON-14, BE-P3-25 |
| Q-P3-20 | Phí xe theo tháng: ngừng giữa tháng vẫn thu tháng đó, từ tháng sau không thu. Giữ lịch sử removedAt để chốt hóa đơn, không lọc mỗi isActive=true; D-41 giữ nguyên | CON-14, BIL counting rules / Phase 4 |
| Q-P3-21 | Hủy HOLD tự ngừng các đăng ký xe đang hoạt động trong cùng transaction, giữ lịch sử và giải phóng biển số | CON-14/12, BE-P3-25 |
| Q-P3-22 | Dịch vụ mới thêm phải có giá đã duyệt đang có hiệu lực: HOLD tại ngày bắt đầu, ACTIVE tại hôm nay | D-07, BE-P3-26 |
| Q-P3-12/13 | Khách cũ ghi chỉ số khi kết thúc thuê để chốt hóa đơn; khách mới có điện/nước hiện tại lúc vào ở làm baseline riêng. Cuối tháng tính từ baseline khách mới; thay quy tắc cũ cùng ngày dùng chung một row | CON-10, MTR-02/10, BIL-07, BE-P3-20 |
| Q-P3-14 | Đã duyệt sửa schema và tạo migration lưu baseline riêng; đã triển khai và kiểm offline, [SQL proposal](plans/P3-4/SCHEMA-PROPOSAL-BE-P3-20.md) khớp migration. Owner đã kiểm tra không lỗi và chốt BE-P3-20 ngày 20/11 | BE-P3-20 |
| Q-P3-15 | Đã duyệt apply migration `20261120000000_contract_meter_openings`, sau đó owner kiểm tra và nghiệm thu BE-P3-20, đã commit `40747f6`. Ghi nhận xác nhận owner trong [checkpoint](plans/P3-4/CHECKPOINT-BE-P3-20.md); không tự thêm output migrate/full suite chưa được cung cấp, không yêu cầu duyệt/kiểm lại cùng bước | BE-P3-20 |

Câu hỏi mới phát sinh khi làm ghi vào mục "Questions for the owner" của file task, rồi chép lên bảng này.

## 3. Ma trận yêu cầu

| Luật spec | Phần |
|---|---|
| BIL-01..04, BIL-22 (kỳ theo tháng, `end_date`, tháng lẻ), D-40, D-41, CON-04 (mã hóa CCCD), FILE-01 (upload private), D-37 | P3-1 |
| CON-01..05, phần "tạo" của CON-07, VIEW-05, VIEW-06, D-39, A-18, NOTI-06 (lịch bị hủy cần gọi) | P3-2 |
| CON-06..09, CON-22, BIL-10, BIL-11 (chỉ DEPOSIT), AUTH-07 (nhân sự đặt lại mật khẩu người thuê), SCOPE-03 (`/me/contracts`), NOTI-06 (cọc chưa thanh toán) | P3-3 |
| CON-10, CON-11, MTR-02, MTR-03, D-38, CON-12, A-02, A-16 | P3-4 |
| CON-13..16, DB-B6, DB-B9, D-07 (sửa dịch vụ) | P3-5 |
| Trang nhân sự: `/ql/hop-dong`, `/ql/xe`, nút "Chốt", thẻ dashboard, trang in (UI-03, UI-04, UI-07) | P3-6 |
| Trang người thuê song ngữ: `/thue`, `/thue/hop-dong`, trang in (LOC-01, UI-07) | P3-7 |
| Nghiệm thu mục "Acceptance" của spec 14 (trừ dòng gia hạn) và phần cọc | P3-8 |

## 4. Quyền theo đối tượng

| Việc | GUEST | TENANT | MANAGER (tòa của mình) | BOSS |
|---|---|---|---|---|
| Tạo, ký, ghi thu cọc, dọn vào, hủy hợp đồng | ✘ | ✘ | ✔ | ✔ (mọi tòa) |
| Người ở, xe, dịch vụ của hợp đồng; tra cứu xe | ✘ | ✘ | ✔ | ✔ |
| Thêm người ở cùng và ký upload ảnh CCCD mới cho người ở cùng | ✘ | ✔ hợp đồng của mình, HOLD/ACTIVE; không xem ảnh đã lưu | ✔ | ✔ |
| Xem ảnh CCCD (có ghi nhật ký) | ✘ | ✘ | ✔ | ✔ |
| Xem scan đã ký (có ghi nhật ký) | ✘ | ✔ chỉ hợp đồng của mình | ✔ | ✔ |
| Trang in hợp đồng | ✘ | ✔ chỉ hợp đồng của mình | ✔ | ✔ |
| Đặt lại mật khẩu người thuê | ✘ | ✘ | ✔ | ✔ |
| Hợp đồng của người khác | `FORBIDDEN` | 404 | `OUT_OF_SCOPE` ngoài tòa | ✔ |

## 5. Các phần và thứ tự

Mỗi phần có các điểm dừng ⏸: làm tới đó thì dừng, báo cáo, chủ dự án kiểm chứng và commit (quy trình trong `CLAUDE.md` gốc). Phần nào có đổi schema, xóa file hoặc cài gói thì hỏi riêng trước bước đó.

| Phần | Việc | Cần trước | Đổi schema / gói |
|---|---|---|---|
| P3-0 | Chủ dự án: tạo `CCCD_KEY` và điền vào `.env`; điền thông tin ngân hàng thật vào `settings.bank_account` khi dùng thật; gửi mẫu hợp đồng (Q-15) | – | – |
| P3-1 | BE nền: helper kỳ theo tháng dương lịch và tháng lẻ, mã hóa CCCD, upload private + URL ký có hạn, module `contracts` rỗng, mã lỗi | P3-0 (`CCCD_KEY`) | migration cột asset id (hỏi trước) |
| P3-2 | BE tạo hợp đồng, tài khoản người thuê lúc tạo, "Chốt" từ lịch xem, hủy các lịch khác, việc "gọi khách" có nút "Đã gọi" | P3-1 | migration cột "Đã gọi" của lịch xem (hỏi trước) |
| P3-3 | BE ký, mật khẩu tạm, hóa đơn cọc + VietQR, ghi thu tay cọc, đặt lại mật khẩu, `/me/contracts`, trang in | P3-2 | – |
| P3-4 | BE dọn vào ở (chỉ số đầu) và hủy hợp đồng (kèm quyết toán) | P3-3 | – |
| P3-5 | BE người ở, xe, dịch vụ, xem ảnh CCCD | P3-4 (cùng module) | – |
| P3-6 | FE nhân sự: khung route cả phase, danh sách, wizard, chi tiết, `/ql/xe`, nút "Chốt", thẻ dashboard, trang in | P3-3 (phần dọn vào, hủy, người ở cần P3-4, P3-5) | – |
| P3-7 | FE người thuê song ngữ: tổng quan, hợp đồng, trang in | P3-3 và khung route của P3-6 | – |
| P3-8 | QA và chốt phase | tất cả | – |

```
P3-0 ─► P3-1 ─► P3-2 ─► P3-3 ─┬─► P3-4 ─► P3-5 ──────────────┐
                               ├─► P3-6 (khung route trước) ──┼─► P3-8
                               └─► P3-7 (sau khung của P3-6) ─┘
```

### File task của từng phần

| Phần | File task | Mã task | Planner | Reviewer |
|---|---|---|---|---|
| P3-1 | [feature_p3-1-backend-foundation.md](feature_p3-1-backend-foundation.md) | BE-P3-01..06 | có | có |
| P3-2 | [feature_p3-2-backend-create.md](feature_p3-2-backend-create.md) | BE-P3-07..12 | có | có |
| P3-3 | [feature_p3-3-backend-sign-deposit.md](feature_p3-3-backend-sign-deposit.md) | BE-P3-13..19 | có | có |
| P3-4 | [feature_p3-4-backend-move-in-cancel.md](feature_p3-4-backend-move-in-cancel.md) | BE-P3-20..22 | không | có |
| P3-5 | [feature_p3-5-backend-occupants-vehicles.md](feature_p3-5-backend-occupants-vehicles.md) | BE-P3-23..27 | không | có |
| P3-6 | [feature_p3-6-frontend-staff.md](feature_p3-6-frontend-staff.md) | FE-P3-01..09 | có | không |
| P3-7 | [feature_p3-7-frontend-tenant.md](feature_p3-7-frontend-tenant.md) | FE-P3-10..14 | có | không |
| P3-8 | [feature_p3-8-qa.md](feature_p3-8-qa.md) | QA-P3-01..06 | – | – |

Khi phần ghi "Planner: có", agent chạy planner viết `plans/P3-n/PLAN.md` trong thư mục này trước khi code (tên cột chính xác, hợp đồng API, kịch bản test).

### Tiến trình và bài học

- [PROGRESS.md](PROGRESS.md): bảng tổng và nhật ký theo điểm dừng; agent cập nhật trước mỗi lần báo cáo.
- [../LESSONS.md](../LESSONS.md): lỗi đã mắc trong dự án; đọc trước task đầu tiên, thêm dòng khi một lỗi làm tốn một vòng sửa.

### Cách giao cho agent

> Làm phần P3-1 của Phase 3 theo `docs/phase-3-contracts/feature_p3-1-backend-foundation.md`. Đọc hết mục "Before you start" trước, làm task theo thứ tự, dừng ở mỗi điểm ⏸ để báo cáo và chờ tôi commit.

Quy tắc chạy:

- **Backend nối tiếp:** P3-1 → P3-2 → P3-3 → P3-4 → P3-5, một agent một lúc (cùng module `contracts`, migration nối tiếp).
- **Song song được:** sau khi P3-3 đã commit, một agent làm P3-6 trong lúc agent khác làm P3-4 rồi P3-5. P3-7 chỉ bắt đầu khi FE-P3-01 (khung route) đã commit, và không chạy cùng lúc với phần còn lại của P3-6 nếu hai bên cùng sửa `src/shared/`.
- Mỗi agent bắt đầu bằng `git status` sạch; còn thay đổi của phần khác chưa commit thì dừng và hỏi.
- Lệnh chạy e2e trên máy này: xem `docs/LESSONS.md` (file `.env` nằm ở `Source/backend`).

## 6. Dữ liệu cũ và chuyển đổi

| Dữ liệu | Xử lý | Luật |
|---|---|---|
| Hợp đồng mẫu HD000001 trong seed dev (ACTIVE, cọc 0, chưa có hóa đơn, `billing_day` 15) | Giữ nguyên để thử trang người thuê sau dọn vào; cọc 0 nên không có hóa đơn cọc. Cột `billing_day` không còn dùng (D-40): P3-1 sửa seed theo lựa chọn của PLAN | CON-08, D-40 |
| Cột `signed_scan_url`, `id_front_url`, `id_back_url` (đang trống) | Thay bằng asset id private theo PLAN của P3-1; hỏi chủ dự án trước migration | D-37 |
| Tài khoản khách đã có (GUEST) | Dùng lại khi ký nếu nhân sự xác nhận đúng người (A-18); vai trò đổi sang TENANT trong cùng giao dịch | CON-07, D-26 |
| Lịch xem đang mở của phòng được giữ chỗ | Tự hủy với ghi chú "Phòng đã có người đặt cọc" | VIEW-06 |
| Số CCCD | Chỉ lưu bản mã hóa + 4 số cuối; mất `CCCD_KEY` là không đọc lại được | CON-04, D-17 |

## 7. Kiểm thử và nghiệm thu

- Mỗi luật nghiệp vụ có test mang mã của nó; giá trị mong đợi lấy từ spec (ví dụ BIL-01, BIL-02 cho ngày kỳ; dòng "Cancel after deposit paid with 1.000.000 kept from 2.500.000 → net 1.500.000" cho CON-12).
- Ca đồng thời bắt buộc: hai nhân sự tạo hợp đồng cho cùng một phòng (một bên `ROOM_NOT_AVAILABLE`), ghi thu cọc hai lần (một bên `INVOICE_NOT_UNPAID`), hai biển số trùng.
- Sau mỗi phần: lint + test của app đã sửa; e2e khi có route mới; kiểm DB khi schema đổi (báo số thật của bộ kiểm).
- Hồi quy: đăng nhập 4 vai trò, lịch xem của Phase Extra, giá và duyệt giá, trang công khai.

## 8. Không thuộc Phase 3

| Việc | Ở đâu |
|---|---|
| Gia hạn hợp đồng (CON-17..19) | Phase 5 |
| Hợp đồng sắp hết hạn, quá hạn (CON-20, CON-21) | Phase 4–5 (cần billing và cron 08:00) |
| Mail báo Boss lúc 8h sáng mỗi ngày từ mùng 2 tới mùng 10 khi quản lý chưa nhập đủ chỉ số; sau mùng 10 chỉ còn báo đỏ (NOTI-10, D-42) | Phase 4 |
| Hóa đơn tháng, chốt chỉ số định kỳ, webhook ngân hàng, quyết toán khi trả phòng, ghi "đã trả lại tiền cọc" | Phase 4 |
| Nút yêu cầu ở `/thue/hop-dong`, thông báo trong ứng dụng cho người thuê | Phase 5 |
| Trang Cài đặt để chủ dự án tự sửa mẫu hợp đồng | Phase 5 (trong lúc chờ, agent cập nhật mẫu khi chủ dự án gửi) |
| Chữ ký điện tử | Hoãn (D-20) |

## 9. Việc của chủ dự án

- **Tạo `CCCD_KEY`** (32 byte, base64) và điền vào `Source/backend/.env` (và `.env` của production sau này):

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```

  Lưu khóa ở nơi an toàn ngoài repo. Không bao giờ đổi khóa khi đã có số CCCD được mã hóa: mất hoặc đổi khóa là không đọc lại được các số đã lưu.
- **Thông tin ngân hàng thật** cho VietQR: seed dev có `bank_account` mẫu; trước khi dùng thật, sửa bản ghi này (trang Cài đặt ở Phase 5; trước đó nhờ agent sửa theo số bạn đưa).
- **Mẫu hợp đồng thật (Q-15)**: gửi file khi có; trước đó không ký hợp đồng thật bằng trang in.
- Trả lời Q-16 trước khi bắt đầu Phase 4.
