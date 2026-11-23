# Phase 4 · Tiền — tiến trình

File này để người hoặc agent mới vào biết ngay đang ở đâu. Trạng thái từng task nằm trong file task của phần (`[ ]` / `[~]` / `[x]` / `[!]`); ở đây chỉ ghi theo **điểm dừng ⏸**.

**Cách cập nhật.** Agent sửa file này ở mỗi điểm dừng ⏸, trước khi báo cáo: đổi dòng của phần mình trong bảng và thêm một dòng vào nhật ký. Cột "Commit" do chủ dự án báo lại sau khi commit; agent điền hash sau khi kiểm `git log`.

Trạng thái: `chưa làm` · `đang làm` · `chờ commit` (đã dừng ở ⏸, chờ chủ dự án kiểm chứng) · `xong` · `kẹt` (ghi lý do).

## Bảng tổng

| Phần | Trạng thái | Điểm dừng gần nhất đã xong | Commit | Việc tiếp theo | Ghi chú |
|---|---|---|---|---|---|
| P4-0 Chủ dự án chuẩn bị | đang làm | – | – | Q-03 (nhà cung cấp webhook), `BANK_WEBHOOK_SECRET`, `settings.bank_account` thật, bậc điện thật (Q-02) | Không chặn code |
| P4-1 Toán tiền | xong | BE-P4-05 ⏸ | `bc60df3` | P4-2 | Q-P4-13: nước PER_PERSON tháng lẻ không nhân tỉ lệ (D-44 (13)) |
| P4-2 Chỉ số + hóa đơn tháng | xong | BE-P4-13 ⏸ | `e853135` | P4-3 | [Kế hoạch](plans/P4-2/PLAN.md); index `contracts_one_open_per_room` chặn gia hạn HOLD (Phase 5) |
| P4-3 Mail + hộp thư nhân sự (BE) | xong | BE-P4-17 ⏸ | `3e4596c` | P4-4 | Q-P4-16..23; chuông FE ở FE-P4-08a (M7) |
| P4-4 API hóa đơn + thu tiền | xong | BE-P4-23 ⏸ | `085dd6f` | P4-5 | Q-P4-24..27 | |
| P4-5 Ngân hàng | xong | BE-P4-28 ⏸ | `dddc66c` | P4-6 | Q-P4-28..35; BANK-08 chưa làm (Q-P4-3) | |
| P4-6 Quyết toán | xong | BE-P4-33 ⏸ | `c62bdec` | P4-7 | Q-P4-36..50 |
| P4-7 FE nhân sự | xong | FE-P4-09 ⏸ | `c9bebf9` | P4-8 | Q-P4-51..61; FE-P4-08 sang P4-8 |
| P4-8 FE người thuê | chờ commit | FE-P4-14 ⏸ | – | chủ dự án kiểm và commit; rồi M9 (QA) | gồm FE-P4-08 |
| P4-9 QA | chưa làm | – | – | – | |

## Lộ trình mốc (làm liền mạch)

Mỗi **mốc** kết thúc ở một điểm dừng ⏸: agent báo cáo → chủ dự án kiểm và commit → agent ghi hash vào cột "Commit" → sang mốc kế. Làm theo thứ tự từ trên xuống. Mốc đang làm có dấu **▶**. Ký hiệu: ✅ xong (đã commit) · ▶ đang làm · ⬜ chưa làm · ⛔ kẹt.

| | Mốc | Task | Cần trước | Trước khi code phải hỏi chủ dự án | Kiểm ở ⏸ | Commit |
|---|---|---|---|---|---|---|
| ✅ | M0 Soạn Phase 4 | README, PLAN, 9 file task | Phase 3 xong | Q-P4-1..12 (đã trả lời) | – | `bc60df3` (kèm M1) |
| ✅ | M1 Toán tiền (P4-1) | BE-P4-01..05 | M0 | Q-P4-13 (đã trả lời) | unit, lint, build, reviewer | `bc60df3` |
| ✅ | M2 Chỉ số + hóa đơn tháng (P4-2) | BE-P4-06..13 | M1 | – (migration đã áp) | unit, lint, build, check-constraints, e2e nhập chỉ số → phát hành, tranh chấp hai kết nối, 3 ca bù BIL-05, ca BIL-06, ca BIL-21, cleanup list, reviewer | `e853135` |
| ✅ | M3 Mail (P4-3) | BE-P4-14..17 | M2 | thêm khóa vào seed `settings` (nếu cần) | unit, lint, build, reviewer | `3e4596c` |
| ✅ | M4 API hóa đơn + thu tiền (P4-4) | BE-P4-18..23 | M2 | – | + e2e phát hành → ghi thu tay → PAID, reviewer | `085dd6f` |
| ✅ | M5 Ngân hàng (P4-5) | BE-P4-24..28 | M4 | chạy planner `plans/P4-5/PLAN.md` rồi hỏi một lượt câu hỏi của nó; migration (nếu có) | + e2e webhook khớp / không khớp, reviewer | `dddc66c` |
| ✅ | M6 Quyết toán (P4-6) | BE-P4-29..33 | M4, **sau** M5 (cùng đụng `payments`) | planner `plans/P4-6/PLAN.md` | + e2e dry-run → ghi thật → FINAL → ghi thu, reviewer | `c62bdec` |
| ✅ | M7 FE nhân sự (P4-7) | FE-P4-01..09 | M4, M5, M6 | planner `plans/P4-7/PLAN.md` | FE lint, build, test:components (chạy lại một lượt nếu có ca nhạy thời gian) | `c9bebf9` |
| ▶ | M8 FE người thuê (P4-8) | FE-P4-10..14 | FE-P4-01 (M7) | – | FE lint, build, test:components, kiểm tay 360 px | – |
| ⬜ | M9 QA + chốt phase (P4-9) | QA-P4-01..06 | M1..M8 | `cleanup.mjs --apply` (chỉ khi đồng ý) | acceptance, check-constraints (số thật), e2e dev, hồi quy, đi tay cùng chủ dự án | – |

Việc của chủ dự án chạy song song, không chặn code (P4-0): Q-03 nhà cung cấp webhook, `BANK_WEBHOOK_SECRET` trong `.env`, `settings.bank_account` thật, bậc điện thật (Q-02). Phải xong **trước khi lên production**, không cần xong trước M9.

### ▶ Mốc đang làm: M8 (FE-P4-08, FE-P4-10..14)

Trạng thái thật (23/11/2026). Code nằm trên các file chính, **chưa commit** (sau `c9bebf9`).

- [x] BE nhỏ: `nextBillingDate` trong chi tiết hợp đồng (ACTIVE)
- [x] FE-P4-10 `/thue/hoa-don` · FE-P4-11 `/thue/hoa-don/:id` · FE-P4-08 khối hóa đơn ở `/thue`
- [x] FE-P4-12 song ngữ (42 khóa mới vi/en) · FE-P4-13 không có nút "Báo lỗi thanh toán"
- [x] FE-P4-14 FE lint sạch, build pass, 1017/1017; BE 2834/2834; chủ dự án kiểm tay 360 px: đạt
- [x] ⏸ Báo cáo M8 → chủ dự án commit (chờ commit)

### Một vòng mốc (lặp lại cho mọi mốc)

1. `git status` sạch (chỉ còn thay đổi của mốc đang làm). Có thay đổi lạ → báo chủ dự án và chờ.
2. Mở file task của phần, đọc mục "Before you start". Mốc có planner thì chạy planner trước và hỏi một lượt câu hỏi của nó.
3. Từng task: `[~]` → code + test (mã spec trong tên test) → kiểm "Done when" → `[x]`.
4. Hỏi trước mỗi lần: migration lên DB, xóa file, cài thư viện mới. `.env*` do chủ dự án điền.
5. Cuối mốc: lint, test, build của app đã sửa (+ e2e / check-constraints nếu mốc ghi) → reviewer nếu cột "Kiểm" có → sửa lỗi chặn.
6. Cập nhật file này: dấu ở bảng mốc, dòng ở "Bảng tổng", một dòng nhật ký. Lỗi tốn một lần làm lại → thêm một dòng vào `docs/LESSONS.md`.
7. ⏸ Báo cáo: file đã đổi, output thật, cách kiểm tay, `[ASSUMPTION]`, thông điệp commit gợi ý kèm mã task và mã spec.
8. Chủ dự án commit và báo lại → agent kiểm `git log`, ghi hash, chuyển ▶ sang mốc kế.

### Vào lại giữa chừng (phiên mới)

Đọc dòng **▶** ở bảng trên và danh sách việc của mốc đó. Mở file task của phần, tìm task `[~]` đầu tiên (nếu không có thì task `[ ]` đầu tiên). Chạy `git status` và đối chiếu với nhật ký dưới đây trước khi code tiếp.

## Nhật ký điểm dừng

- 22/11/2026 · Đã đối chiếu commit `bc60df3` hoàn tất BE-P4-01..05. Bắt đầu P4-2, rà soát cách gắn chỉ số vào đúng kỳ và việc chuyển hợp đồng khi thiếu kỳ cuối.

- 22/11/2026 · Soạn Phase 4 · planner viết `plans/PHASE/PLAN.md`; chủ dự án trả lời Q-P4-1..12 (tất cả theo đề xuất), ghi vào spec thành D-44 (sửa thêm BIL-12, BIL-18, MTR-08, MTR-12, Q-04, Q-06); tạo README, PROGRESS và 9 file task (53 task) · chưa có code
- 22/11/2026 · P4-1 ⏸ BE-P4-05 · hàm thuần: period (tháng thu, hạn mùng 9, kỳ chứa ngày, kỳ đến hạn), bậc điện, tiêu thụ MTR-05, dòng hóa đơn tháng (BIL-09 = 3.119.000), test D-09 chọn đơn giá theo period_start · unit 2697/2697, lint 0 lỗi (4 cảnh báo cũ), build pass; reviewer DUYỆT, đã sửa 2 điểm nên sửa (test ranh giới bậc / bậc cuối đóng, chặn waterM3 âm/lẻ)
- 22/11/2026 · P4-1 · chủ dự án trả lời Q-P4-13: nước PER_PERSON tháng lẻ không nhân tỉ lệ; ghi vào D-44 (13), BIL-07 (16-billing), README; thêm test

- 22/11/2026 · Q-P4-14/15 đã duyệt. BE-P4-06 có API danh sách, kiểm phạm vi và mốc kỳ trước, build đạt, 2/2 unit, lint 0 lỗi và 4 cảnh báo cũ. BE-P4-07 cần lưu liên kết hóa đơn trên chỉ số ngay từ lần nhập đầu, kể cả khi hóa đơn vẫn nháp.

- 22/11/2026 — BE-P4-07, bước schema. Đã thêm migration cục bộ cho `meter_readings.invoice_id`. Prisma validate đạt, bộ kiểm tra ràng buộc đạt 107/107. Chạy chuỗi migration trên PostgreSQL nhúng xác nhận chỉ số cũ giữ nguyên với liên kết NULL, chỉ số mới gắn được hóa đơn, khóa ngoại chặn mã hóa đơn sai và chặn xóa hóa đơn đang gắn chỉ số. Chờ áp dụng trên DB dev.
  - Reviewer DUYỆT phần schema và migration của BE-P4-07. Cột invoice_id cho phép NULL nên dữ liệu chỉ số cũ vẫn hợp lệ. Khóa ngoại ngăn xóa hóa đơn đang gắn chỉ số. Quan hệ và chỉ mục trong Prisma khớp với SQL. Đây là kết quả rà soát mã, chưa xác nhận migration trên database dev.
- 22/11/2026 — Theo xác nhận của chủ dự án, đã áp dụng migration `20261122000000_meter_reading_invoice` trên database dev.
- 22/11/2026 — Chủ dự án đổi hạn hóa đơn MONTHLY sang cuối tháng thu. Đã cập nhật hàm tính hạn và ví dụ BIL-01/08/09. Kiểm thử period đạt 16/16. Cảnh báo đỏ cho người thuê, quản lý và báo cáo Boss đã ghi vào đặc tả; thao tác xử lý công nợ cần chốt nghĩa của “cất”.
- 22/11/2026 — Chủ dự án đã chốt ba thao tác trên hóa đơn tháng quá hạn trong báo cáo Boss. Sửa lập lại hóa đơn, xóa hủy có lý do, cất chỉ ẩn khỏi danh sách chính của Boss. Đã ghi tiêu chí nghiệm thu về tổng tiền và cảnh báo tại RPT-02.
- 22/11/2026 — Đã nối POST /meter-readings và POST /invoices/:id/issue. TypeScript đạt, 91/91 test nhóm meters, billing, period, money đạt. Còn kiểm thử tranh chấp hai kết nối và E2E PostgreSQL. Khi đã qua cuối tháng thu, kiểm tra ràng buộc hiện tại chỉ cho lưu chỉ số và giữ nháp; chờ quyết định migration.
  - Review BE-P4-07..09: CHẶN nghiệm thu. Rà soát phát hiện phát hành sau hạn có thể rollback cả chỉ số; thay đồng hồ giữa kỳ chưa ghi được qua API; thành tiền vượt Int có thể dừng cả lô. Cần hiển thị lại số nước PER_PERSON nhập sau phát hành và cờ bất thường sau tải lại. Đã xử lý trong code, thêm test thay đồng hồ và giữ nháp sau hạn. Còn kiểm tra E2E, tình huống đổi quản lý đồng thời và đầy đủ các nhánh sau sửa.
- 22/11/2026 — Đã bỏ bước giữ nháp khi phát hành sau hạn. Migration 20261122010000_late_monthly_issue cho phép riêng MONTHLY giữ đúng hạn cuối tháng thu. TypeScript đạt, test liên quan 92/92, kiểm tra ràng buộc 110/110. Chuỗi migration và truy vấn hóa đơn quá hạn ngày 02/11 đạt trên PostgreSQL nhúng. Prisma migrate status trên dev báo P1001, chưa deploy.
  - Reviewer DUYỆT migration phát hành muộn. Migration và constraints.sql dùng cùng điều kiện. Hóa đơn tháng 9 phát hành 02/11 giữ hạn 31/10. Database từ chối hạn 30/10 và vẫn chặn hóa đơn cọc có hạn trước ngày phát hành. Kiểm tra ràng buộc đạt 110/110 trên PostgreSQL nhúng.
- 22/11/2026 · Soạn "Lộ trình mốc" M0..M9 (mỗi mốc một ⏸ + commit), danh sách việc còn lại của M2a, vòng làm một mốc và cách vào lại giữa chừng
- 22/11/2026 · Chủ dự án chọn gộp P4-2 thành một mốc M2 (BE-P4-06..13), một ⏸ ở BE-P4-13 như file task
- 22/11/2026 · Chủ dự án cho áp migration `20261122010000_late_monthly_issue` lên DB dev: `migrate deploy` thành công, `migrate status` up to date; CHECK `invoices_issued_dates` trên dev đúng như migration; check-constraints 110/110
- 22/11/2026 · M2 · e2e `test/meters-billing.e2e-spec.ts`: luồng chính (rollback) đạt 72 s; ca tranh chấp (commit + dọn mềm, sửa `scripts/e2e/run.ts` để hủy hóa đơn nháp của hợp đồng thử) đạt; cleanup list không còn dòng của lượt; thêm unit MTR-08; BE-P4-07..09 `[x]`
- 22/11/2026 · M2 ⏸ BE-P4-13 · job `monthly-invoice` 00:05 + khởi động (BIL-05, bù 7 ngày), chuyển ca gia hạn (BIL-06, Q-P4-15), `POST /contracts/:id/monthly-invoices` (BIL-21), 6 nhóm tiền trong `GET /dashboard` (NOTI-06) · unit 2742/2742, lint 0 lỗi (4 cảnh báo cũ), build pass, e2e `meters-billing` 3/3 trên dev, check-constraints 110/110, cleanup list sạch · reviewer CHẶN 2 lỗi audit (tự phát hành, chuyển ca) + 1 nên sửa (map `invoices_one_per_period`), đã sửa cả 3 · hạn chế: index `contracts_one_open_per_room` chặn hợp đồng gia hạn HOLD (Phase 5)
- 22/11/2026 · M2 · Chủ dự án quyết: chuyển ca gia hạn chờ cả số điện (kWh) và nước (m³) bàn giao ở mọi tòa, kể cả PER_PERSON (MTR-06); bỏ [ASSUMPTION] cũ, sửa `renewal-switch.ts`, test, 16-billing
- 22/11/2026 · M3 · chủ dự án trả lời Q-P4-16..23 (thêm hộp thư nhân sự NOTI-11, chuông ở M7); planner viết `plans/P4-3/PLAN.md`; code BE-P4-14a..16, 14b · unit 2793/2793, lint 0 lỗi (4 cảnh báo cũ), build pass
- 22/11/2026 · M3 ⏸ BE-P4-17 · reviewer DUYỆT, không lỗi chặn; đọc-trước-claim ghi `shortcut:`; P4-4 phải tự chống trùng nhắc tay (Q-P4-7), ghi trong PLAN P4-3 · unit 2793/2793, lint 0 lỗi, build pass
- 22/11/2026 · M3 commit `3e4596c`; ▶ sang M4 (P4-4)
- 22/11/2026 · M4 · chủ dự án trả lời Q-P4-24..27; code BE-P4-18..22; fixture tháng chuyển sang `test/fixtures/monthly-fixture.ts` · unit 2805/2805, lint 0 lỗi (4 cảnh báo cũ), build pass, e2e `invoices-payments` 1/1 và `meters-billing` 3/3 trên dev (ca tranh chấp của M2 lại commit fixture rồi dọn mềm)
- 22/11/2026 · M4 ⏸ BE-P4-23 · reviewer DUYỆT, 0 lỗi chặn; đã gộp định dạng tiền vào `formatMoney` (issue-monthly) · ca ghi thu song song trên DB thật chưa có e2e (ghi ở Issues log P4-4)
- 22/11/2026 · M4 commit `085dd6f`; ▶ sang M5 (P4-5), bắt đầu bằng planner
- 22/11/2026 · M5 · planner viết `plans/P4-5/PLAN.md`; chủ dự án trả lời Q-P4-28..35; code BE-P4-24..27, thêm mã lỗi `WEBHOOK_NOT_CONFIGURED`, tách `payment-notice.ts` dùng chung · unit 2816/2816, lint 0 lỗi, build pass, e2e `bank-webhook` 1/1 trên dev (rollback)
- 22/11/2026 · M5 ⏸ BE-P4-28 · reviewer DUYỆT, 0 lỗi chặn; thêm Idempotency-Key cho mark-refunded theo góp ý, e2e chạy lại 1/1 · BANK-08 chưa làm (Q-P4-3); chưa có e2e hai kết nối (QA-P4-03)
- 22/11/2026 · M5 commit `dddc66c`; ▶ sang M6 (P4-6), bắt đầu bằng planner
- 22/11/2026 · M6 · planner viết `plans/P4-6/PLAN.md`; chủ dự án trả lời Q-P4-36..50; code BE-P4-29..32 · unit 2829/2829, lint 0 lỗi, build pass, e2e `settlement` 1/1 trên dev (rollback), check-constraints 110/110
- 22/11/2026 · M6 ⏸ BE-P4-33 · reviewer DUYỆT, 0 lỗi chặn; 1 nên cân nhắc: xem trước (dryRun) cũng khóa FOR UPDATE như lượt ghi (giữ, để hai lượt ra cùng số) · chưa có e2e hai kết nối (QA-P4-03)
- 23/11/2026 · M6 commit `c62bdec`; ▶ sang M7 (P4-7), bắt đầu bằng planner
- 23/11/2026 · M7 · planner viết `plans/P4-7/PLAN.md`; chủ dự án trả lời Q-P4-51..61; code FE-P4-01..07, 08a + 3 thay đổi BE nhỏ · FE 1010/1010, BE 2833/2833, e2e `settlement` 1/1; kiểm tay: sửa popup chuông tràn trái và menu điện thoại tự đóng
- 23/11/2026 · M7 ⏸ FE-P4-09 · reviewer DUYỆT, 0 lỗi chặn (nêu: ảnh đồng hồ chỉ kiểm hình dạng URL; Math.abs chỉ đổi dấu để hiển thị)
- 23/11/2026 · M7 commit `c9bebf9`; ▶ sang M8 (P4-8)
- 23/11/2026 · M8 ⏸ FE-P4-14 · trang hóa đơn người thuê vi/en, khối hóa đơn ở /thue, BE `nextBillingDate` · FE 1017/1017, BE 2834/2834; chưa kiểm tay 360 px (tài khoản người thuê seed phải đổi mật khẩu)
- 23/11/2026 · M8 · chủ dự án kiểm tay trang người thuê ở 360 px: đạt
